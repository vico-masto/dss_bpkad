const { Prisma } = require('@prisma/client');
const prisma = require('../prismaClient');
const dssService = require('../services/dssService');
const auditService = require('../services/auditService');
const accountingEngine = require('../utils/accountingEngine');
const { parseDateSafe, parseNilaiExcel } = require('../utils/dateUtils');
const { tanggalCairAman } = require('../utils/kritisGuard');

/**
 * Membuat SP2D Baru dengan Integrasi DSS
 */
const createSp2d = async (req, res) => {
  let { 
    nomor, tanggal, tanggal_pencairan, opd, jenis, uraian, penerima, 
    nilai_bruto, nilai_potongan, jenis_potongan, details,
    confirmTalangan = false, id_sumber_talangan = null 
  } = req.body;

  const file_url = req.file ? `/uploads/sp2d/${req.file.filename}` : null;

  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch (e) {
      return res.status(400).json({ message: 'Format rincian dana tidak valid' });
    }
  }

  const tglObj = parseDateSafe(tanggal);
  const tahun = tglObj.getFullYear();

  if (!Array.isArray(details)) {
    return res.status(400).json({ message: 'Rincian dana harus berupa array' });
  }

  const nBruto = parseFloat(nilai_bruto) || 0;
  const nPotongan = parseFloat(nilai_potongan) || 0;

  try {
    // 0. Hitung Nilai Neto per Detail
    for (const detail of details) {
      const ratio = nBruto > 0 ? (parseFloat(detail.nilai_bruto) / nBruto) : 0;
      const detail_potongan = nPotongan * ratio;
      detail.nilai_neto = parseFloat(detail.nilai_bruto) - detail_potongan;
    }

    // 1. Validasi Pagu
    for (const detail of details) {
      const paguCheck = await dssService.validatePagu(opd, detail.id_sumber_dana, tahun, detail.nilai_neto);
      if (!paguCheck.valid) {
        return res.status(400).json({ 
          message: `Validasi Pagu Gagal: ${paguCheck.message}`,
          id_sumber_dana: detail.id_sumber_dana 
        });
      }
    }

    // 2. Validasi Likuiditas
    const defisitItems = [];
    for (const detail of details) {
      const likuiditasCheck = await dssService.validateLikuiditas(detail.id_sumber_dana, detail.nilai_neto);
      if (!likuiditasCheck.valid && !confirmTalangan) {
        defisitItems.push({
          id_sumber_dana: detail.id_sumber_dana,
          needed: detail.nilai_neto,
          available: likuiditasCheck.currentBalance,
          shortage: detail.nilai_neto - likuiditasCheck.currentBalance
        });
      }
    }

    if (defisitItems.length > 0 && !confirmTalangan) {
      return res.status(200).json({ 
        needsConfirmTalangan: true,
        message: 'Saldo kas tidak mencukupi. Apakah Anda ingin mencatat ini sebagai TALANGAN?',
        defisitItems
      });
    }

    // 3. Status Dana Logic
    let statusDana = req.body.status_dana || 'Aman';
    if (!req.body.status_dana) {
      statusDana = 'Aman';
      for (const detail of details) {
        const hasValidSD = detail.id_sumber_dana && detail.id_sumber_dana !== 'SD-LAINNYA';
        if (!hasValidSD) {
          statusDana = 'Talangan';
          break;
        }
        const balance = await dssService.getRealTimeBalance(detail.id_sumber_dana);
        if (balance < detail.nilai_bruto) {
          statusDana = 'Talangan';
          break;
        }
        const paguCheck = await dssService.validatePagu(opd, detail.id_sumber_dana, tahun, detail.nilai_bruto);
        if (!paguCheck.valid) {
          statusDana = 'Talangan';
          break;
        }
      }
    }

    const sp2dId = `SP2D-${Date.now()}`;
    const opdId = await dssService.getOpdIdByName(opd);
    const tglCair = (tanggal_pencairan && tanggal_pencairan.trim() !== "") ? new Date(tanggal_pencairan) : null;

    const result = await prisma.$transaction(async (tx) => {
      // Create Header
      const sp2d = await tx.data_sp2d.create({
        data: {
          id: sp2dId,
          nomor,
          tanggal: new Date(tanggal),
          tanggal_pencairan: tglCair,
          tahun,
          opd: opdId,
          jenis,
          uraian,
          penerima,
          nilai_bruto: nBruto,
          nilai_potongan: nPotongan,
          jenis_potongan,
          status_dana: statusDana,
          file_url
        }
      });

      // Create Details
      for (const detail of details) {
        await tx.detail_sp2d.create({
          data: {
            id_sp2d: sp2dId,
            id_sumber_dana: detail.id_sumber_dana,
            nilai_bruto: parseFloat(detail.nilai_bruto),
            nilai_neto: parseFloat(detail.nilai_neto)
          }
        });

        if (statusDana === 'Talangan') {
          const balance = await dssService.getRealTimeBalance(detail.id_sumber_dana);
          if (balance < 0) {
            const sourceTalangan = id_sumber_talangan || 'SD-SILPA';
            // Gunakan nilai_neto: kas yang benar-benar keluar dari RKUD = bruto - potongan
            await tx.jurnal_talangan.create({
              data: {
                id: `TLG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                tanggal: new Date(tanggal),
                no_referensi: nomor,
                uraian: `Talangan Otomatis SP2D ${nomor}`,
                id_sumber_asli: detail.id_sumber_dana,
                id_sumber_talangan: sourceTalangan,
                nilai: parseFloat(detail.nilai_neto),
                status: 'BELUM'
              }
            });
          }
        }
      }

      // Sinkronisasi data_sp2d_potongan dari nilai_potongan header.
      // Dibutuhkan agar rekonsiliasi bisa menghitung neto = bruto - SUM(potongan) dengan benar.
      // Record ini ditandai keterangan='AUTO_HEADER' supaya bisa dibedakan dari potongan rincian manual.
      if (nPotongan > 0) {
        await tx.data_sp2d_potongan.create({
          data: {
            id_sp2d: sp2dId,
            nomor_sp2d: nomor,
            opd: opdId,
            jenis_potongan: jenis_potongan || 'Potongan Pajak/Lainnya',
            nilai: nPotongan,
            tanggal_pencairan: tglCair,
            keterangan: 'AUTO_HEADER'
          }
        });
      }

      // 4. Posting ke Buku Besar (Inside Transaction)
      await accountingEngine.processSp2dJournal({
        id: sp2dId, nomor, tanggal, jenis, uraian,
        nilai_bruto: nBruto, nilai_potongan: nPotongan, nilai_neto: nBruto - nPotongan
      }, tx);

      return sp2d;
    });

    await auditService.logActivity(req, 'TAMBAH', 'SP2D', `Nomor: ${nomor}, Nilai: ${nBruto}, Status: ${statusDana}`);

    res.status(201).json({ 
      message: confirmTalangan ? 'SP2D disimpan sebagai TALANGAN' : 'SP2D berhasil disimpan', 
      id: sp2dId 
    });

  } catch (err) {
    console.error('ERROR CREATE SP2D:', err.message);
    if (err.code === 'P2002') {
      return res.status(400).json({ message: 'Nomor SP2D sudah terdaftar di sistem' });
    }
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Mendapatkan Daftar SP2D dengan Filter
 */
const getSp2dList = async (req, res) => {
  const { 
    page = 1, 
    limit = 15, 
    opd, 
    tahun, 
    status, 
    status_dana, 
    search,
    startDate,
    endDate,
    jenis,
    onlySelisih
  } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  try {
    const where = {};
    if (opd) where.opd = opd;
    if (tahun) where.tahun = parseInt(tahun);
    if (jenis) where.jenis = jenis;
    
    const filterStatus = status || status_dana;
    if (filterStatus && filterStatus !== 'none' && filterStatus !== '') {
      where.status_dana = { contains: filterStatus, mode: 'insensitive' };
    }

    if (startDate || endDate) {
      where.tanggal = {};
      if (startDate) where.tanggal.gte = new Date(startDate);
      if (endDate) where.tanggal.lte = new Date(endDate);
    }

    if (search) {
      // Remove commas or dots for numeric parse (Indonesian format aware)
      const cleanNum = search.replace(/\./g, '').replace(/,/g, '.');
      const numVal = parseFloat(cleanNum);

      const searchTerms = search.split(' ').map(t => t.trim()).filter(t => t.length > 0);
      if (searchTerms.length > 0) {
        where.AND = searchTerms.map(term => {
          const termClean = term.replace(/\./g, '').replace(/,/g, '.');
          const termNum = parseFloat(termClean);
          const orConds = [
            { nomor: { contains: term, mode: 'insensitive' } },
            { uraian: { contains: term, mode: 'insensitive' } },
            { penerima: { contains: term, mode: 'insensitive' } }
          ];
          
          if (!isNaN(termNum)) {
             orConds.push({ nilai_bruto: { equals: termNum } });
             orConds.push({ nilai_neto: { equals: termNum } });
          }
          return { OR: orConds };
        });
      }
    }

    if (onlySelisih === 'true') {
      where.selisih_rekon = { not: 0 };
    }

    const [data, total, summary, talanganSummary, selisihSummary] = await Promise.all([
      prisma.data_sp2d.findMany({
        where,
        include: {
          details: true,
          potongan: true
        },
        orderBy: { tanggal: 'desc' },
        skip,
        take
      }),
      prisma.data_sp2d.count({ where }),
      prisma.data_sp2d.aggregate({
        where,
        _sum: { nilai_bruto: true }
      }),
      prisma.data_sp2d.aggregate({
        where: { ...where, status_dana: { contains: 'Talangan', mode: 'insensitive' } },
        _count: { id: true },
        _sum: { nilai_bruto: true }
      }),
      prisma.data_sp2d.aggregate({
        where: { ...where, NOT: { selisih_rekon: 0 } },
        _count: { id: true },
        _sum: { selisih_rekon: true }
      })
    ]);

    const processedData = data.map(row => ({
      ...row,
      rincian_dana: row.details,
      rincian_potongan: row.potongan,
      sumber_dana: row.details.map(d => d.id_sumber_dana).join(', ')
    }));

    res.json({
      data: processedData,
      total,
      totalBruto: Number(summary._sum.nilai_bruto || 0),
      totalTalangan: talanganSummary._count.id || 0,
      totalNominalTalangan: Number(talanganSummary._sum.nilai_bruto || 0),
      countSelisih: selisihSummary._count.id || 0,
      totalSelisih: Math.abs(Number(selisihSummary._sum.selisih_rekon || 0)),
      page: parseInt(page),
      totalPages: Math.ceil(total / take)
    });
  } catch (err) {
    console.error('GET SP2D LIST ERROR:', err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const getSp2dById = async (req, res) => {
  const { id } = req.params;
  try {
    const sp2d = await prisma.data_sp2d.findUnique({
      where: { id },
      include: { 
        details: true,
        potongan: true
      }
    });
    if (!sp2d) return res.status(404).json({ message: 'Data tidak ditemukan' });
    res.json(sp2d);
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const checkSp2dNomor = async (req, res) => {
  const { nomor } = req.query;
  try {
    const count = await prisma.data_sp2d.count({ where: { nomor } });
    res.json({ exists: count > 0 });
  } catch (err) {
    res.status(500).json({ message: 'Error checking nomor' });
  }
};

const updateSp2dRekon = async (req, res) => {
  const { id } = req.params;
  const { selisih_rekon, keterangan_rekon, tanggal_pencairan } = req.body;

  try {
    await prisma.data_sp2d.update({
      where: { id },
      data: {
        selisih_rekon: parseFloat(selisih_rekon),
        keterangan_rekon,
        // ATURAN KRITIS: tanggal_pencairan TIDAK PERNAH dihapus via endpoint ini.
        // Hanya update jika request body mengandung nilai tanggal yang valid (non-null, non-empty).
        ...(tanggal_pencairan && String(tanggal_pencairan).trim() !== '' && {
          tanggal_pencairan: new Date(tanggal_pencairan)
        })
      }
    });

    await auditService.logActivity(req, 'REKON', 'SP2D', `ID: ${id}, Selisih: ${selisih_rekon}`);
    res.json({ message: 'Rekon bank berhasil disimpan' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating rekon', error: err.message });
  }
};

const updateSp2d = async (req, res) => {
  const { id } = req.params;
  // Ambil data lama untuk fallback
  const existingSp2d = await prisma.data_sp2d.findUnique({
    where: { id },
    include: { details: true }
  });
  if (!existingSp2d) return res.status(404).json({ message: 'Data SP2D tidak ditemukan' });

  let { 
    nomor = existingSp2d.nomor, 
    tanggal = existingSp2d.tanggal, 
    tanggal_pencairan = existingSp2d.tanggal_pencairan, 
    opd = existingSp2d.opd, 
    jenis = existingSp2d.jenis, 
    uraian = existingSp2d.uraian, 
    penerima = existingSp2d.penerima, 
    nilai_bruto = existingSp2d.nilai_bruto, 
    nilai_potongan = existingSp2d.nilai_potongan, 
    jenis_potongan = existingSp2d.jenis_potongan, 
    selisih_rekon = existingSp2d.selisih_rekon,
    keterangan_rekon = existingSp2d.keterangan_rekon,
    status_rekon = existingSp2d.status_rekon,
    details 
  } = req.body;

  const file_url = req.file ? `/uploads/sp2d/${req.file.filename}` : undefined;

  try {
    // 1. Parsing Details
    let parsedDetails = null;
    if (details !== undefined) {
      if (typeof details === 'string') {
        try {
          parsedDetails = JSON.parse(details);
        } catch (e) {
          return res.status(400).json({ message: 'Format rincian dana tidak valid' });
        }
      } else if (Array.isArray(details)) {
        parsedDetails = details;
      }
    } else {
      // Jika details tidak dikirim (koreksi cepat dari rekon), ambil data lama
      parsedDetails = existingSp2d.details.map(d => ({
        id_sumber_dana: d.id_sumber_dana,
        nilai_bruto: parseFloat(String(d.nilai_bruto))
      }));
    }

    const nBruto = parseFloat(String(nilai_bruto || 0)) || 0;
    const nPotongan = parseFloat(String(nilai_potongan || 0)) || 0;
    const nNeto = nBruto - nPotongan;

    // 2. Hitung Nilai Neto per Detail (Proporsional)
    if (parsedDetails) {
      for (const detail of parsedDetails) {
        const ratio = nBruto > 0 ? (parseFloat(String(detail.nilai_bruto)) / nBruto) : 0;
        const detail_potongan = nPotongan * ratio;
        detail.nilai_neto = parseFloat(String(detail.nilai_bruto)) - detail_potongan;
      }
    }

    // 3. Status Dana Logic (Minimalist for Update/Koreksi)
    let statusDana = req.body.status_dana || 'Aman';
    // Jika ada detail yang id_sumber_dananya tidak valid, set Talangan
    for (const d of parsedDetails) {
      if (!d.id_sumber_dana || d.id_sumber_dana === 'SD-LAINNYA') {
        statusDana = 'Talangan';
        break;
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      // a. Bersihkan data lama (details & jurnal) agar saldo real-time bersih
      // Hapus jurnal untuk nomor lama DAN nomor baru (jika berubah) untuk mencegah duplikasi
      const affectedNomors = [existingSp2d.nomor, String(nomor)];
      await tx.detail_sp2d.deleteMany({ where: { id_sp2d: id } });
      await tx.jurnal_umum.deleteMany({ where: { ref_id: { in: affectedNomors } } });
      await tx.jurnal_talangan.deleteMany({ where: { no_referensi: { in: affectedNomors } } });

      const opdId = await dssService.getOpdIdByName(opd);
      // tanggalCairAman: jika form mengirim string kosong, pertahankan nilai lama di DB.
      // Mencegah penghapusan tanggal_pencairan yang sudah diisi dari SIPD saat admin hanya edit kolom lain.
      const tglCair = tanggalCairAman(tanggal_pencairan, existingSp2d.tanggal_pencairan);

      // c. Hitung ulang Status Dana berdasarkan saldo saat ini (setelah pembersihan)
      let finalStatusDana = 'Aman';
      for (const d of parsedDetails) {
        if (!d.id_sumber_dana || d.id_sumber_dana === 'SD-LAINNYA') {
          finalStatusDana = 'Talangan';
        } else {
          const currentBalance = await dssService.getRealTimeBalance(d.id_sumber_dana, tx);
          // Gunakan epsilon kecil untuk menangani floating point precision
          if (currentBalance < (parseFloat(d.nilai_bruto) - 0.01)) {
            finalStatusDana = 'Talangan';
          }
        }
      }

      // d. Update Header
      const updatedSp2d = await tx.data_sp2d.update({
        where: { id },
        data: {
          nomor: String(nomor),
          tanggal: new Date(tanggal),
          tanggal_pencairan: tglCair,
          opd: String(opdId),
          jenis: String(jenis),
          uraian: String(uraian || ""),
          penerima: String(penerima || ""),
          nilai_bruto: nBruto,
          nilai_potongan: nPotongan,
          jenis_potongan: jenis_potongan || null,
          tahun: new Date(tanggal).getFullYear(),
          status_dana: finalStatusDana,
          selisih_rekon: selisih_rekon !== undefined ? selisih_rekon : existingSp2d.selisih_rekon,
          keterangan_rekon: keterangan_rekon !== undefined ? keterangan_rekon : existingSp2d.keterangan_rekon,
          status_rekon: status_rekon !== undefined ? status_rekon : existingSp2d.status_rekon,
          ...(file_url && { file_url })
        }
      });

      // Sync data_sp2d_potongan dari header (hapus AUTO_HEADER lama, buat baru jika ada potongan)
      await tx.data_sp2d_potongan.deleteMany({ where: { id_sp2d: id, keterangan: 'AUTO_HEADER' } });
      if (nPotongan > 0) {
        await tx.data_sp2d_potongan.create({
          data: {
            id_sp2d: id,
            nomor_sp2d: String(nomor),
            opd: String(opdId),
            jenis_potongan: jenis_potongan || 'Potongan Pajak/Lainnya',
            nilai: nPotongan,
            tanggal_pencairan: tglCair,
            keterangan: 'AUTO_HEADER'
          }
        });
      }

      // e. Simpan Details & Jurnal Talangan (jika status adalah Talangan)
      for (const d of parsedDetails) {
        if (!d.id_sumber_dana) continue;
        
        await tx.detail_sp2d.create({
          data: {
            id_sp2d: id,
            id_sumber_dana: d.id_sumber_dana,
            nilai_bruto: parseFloat(String(d.nilai_bruto || 0)) || 0,
            nilai_neto: parseFloat(String(d.nilai_neto || 0)) || 0
          }
        });

        // Jurnal Talangan hanya jika status akhir SP2D adalah 'Talangan'
        if (finalStatusDana === 'Talangan') {
          const balanceAfter = await dssService.getRealTimeBalance(d.id_sumber_dana, tx);
          if (balanceAfter < -0.01 || d.id_sumber_dana === 'SD-LAINNYA') {
            // Gunakan nilai_neto agar konsisten dengan kas yang benar-benar keluar
            await tx.jurnal_talangan.create({
              data: {
                id: `TLG-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                tanggal: new Date(tanggal),
                no_referensi: nomor,
                uraian: `Talangan (Koreksi) SP2D ${nomor}`,
                id_sumber_asli: d.id_sumber_dana,
                id_sumber_talangan: 'SD-SILPA',
                nilai: parseFloat(d.nilai_neto),
                status: 'BELUM'
              }
            });
          }
        }
      }

      // f. Cascade tanggal_pencairan ke child potongan:
      // - yang masih NULL (baru dibuat tanpa tanggal eksplisit)
      // - yang memiliki tanggal sama dengan SP2D lama (ter-sinkron saat input, harus ikut dikoreksi)
      // Potongan dengan tanggal berbeda dari SP2D lama (diset manual/berbeda) tidak disentuh.
      if (tglCair) {
        const oldTglCair = existingSp2d.tanggal_pencairan;
        const wherePotongan = oldTglCair
          ? { id_sp2d: id, OR: [{ tanggal_pencairan: null }, { tanggal_pencairan: oldTglCair }] }
          : { id_sp2d: id, tanggal_pencairan: null };
        await tx.data_sp2d_potongan.updateMany({
          where: wherePotongan,
          data: { tanggal_pencairan: tglCair }
        });
      }

      // g. Posting Jurnal Baru (menggunakan nomor BARU)
      await accountingEngine.processSp2dJournal({
        id, nomor, tanggal: new Date(tanggal), jenis, uraian,
        nilai_bruto: nBruto, nilai_potongan: nPotongan, nilai_neto: nNeto
      }, tx);

      return updatedSp2d;
    }, {
      timeout: 30000 // 30 seconds
    });

    await auditService.logActivity(req, 'KOREKSI', 'SP2D', `ID: ${id}, Nomor: ${nomor}, Nilai: ${nBruto}`);

    res.json({ message: 'Koreksi SP2D Berhasil Disimpan', id: result.id });

  } catch (err) {
    console.error('KOREKSI SP2D FAILED:', err);
    res.status(500).json({ message: 'Gagal memperbarui data (Koreksi)', error: err.message });
  }
};

const deleteSp2d = async (req, res) => {
  const { id } = req.params;
  try {
    const sp2d = await prisma.data_sp2d.findUnique({ where: { id } });
    if (!sp2d) return res.status(404).json({ message: 'Data tidak ditemukan' });

    await prisma.$transaction(async (tx) => {
      await tx.jurnal_talangan.deleteMany({ where: { no_referensi: sp2d.nomor } });
      await tx.jurnal_umum.deleteMany({ where: { ref_id: sp2d.nomor } });
      await tx.detail_sp2d.deleteMany({ where: { id_sp2d: id } });
      await tx.data_sp2d.delete({ where: { id } });
    });
    
    await auditService.logActivity(req, 'HAPUS', 'SP2D', `ID: ${id}, Nomor: ${sp2d.nomor}`);
    res.json({ message: 'Data SP2D dan riwayat talangan berhasil dihapus secara permanen' });
  } catch (err) {
    console.error('DELETE SP2D ERROR:', err.message);
    res.status(500).json({ message: 'Error deleting SP2D', error: err.message });
  }
};

const getOpdList = async (req, res) => {
  try {
    const opds = await prisma.master_opd.findMany({ orderBy: { urutan: 'asc' } });
    res.json(opds.map(row => row.nama));
  } catch (err) {
    res.status(500).json({ message: 'Error fetching OPD list' });
  }
};

const getDistinctOpd = async (req, res) => {
  try {
    const result = await prisma.data_sp2d.groupBy({
      by: ['opd'],
      where: { NOT: { opd: null } },
      orderBy: { opd: 'asc' }
    });
    res.json({ data: result.map(row => row.opd) });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching distinct OPD list' });
  }
};

const getJenisList = async (req, res) => {
  try {
    const jenis = await prisma.master_jenis_belanja.findMany({ orderBy: { urutan: 'asc' } });
    res.json(jenis.map(row => row.nama));
  } catch (err) {
    res.status(500).json({ message: 'Error fetching Jenis Belanja list' });
  }
};

const syncSp2dWithBank = async (req, res) => {
  const { id } = req.params;
  try {
    const sp2d = await prisma.data_sp2d.findUnique({ where: { id } });
    if (!sp2d) return res.status(404).json({ message: 'Data tidak ditemukan' });

    const bankMatch = await prisma.bank_statement.findFirst({
      where: {
        OR: [
          { ref_bku_id: id },
          { ref_bku_id: sp2d.nomor }
        ]
      }
    });
    
    if (!bankMatch) {
      return res.status(404).json({ message: 'Data pencairan belum ditemukan di rekonsiliasi bank (Magic Match)' });
    }

    const sp2dNeto = Number(sp2d.nilai_neto);
    const bankValue = Number(bankMatch.debet);

    res.json({
      success: true,
      tanggal_bank: bankMatch.tanggal,
      nilai_bank: bankValue,
      selisih: sp2dNeto - bankValue,
      keterangan: `Sesuai Rekening Koran Tgl ${new Date(bankMatch.tanggal).toLocaleDateString('id-ID')}: ${bankMatch.deskripsi}`
    });
  } catch (err) {
    res.status(500).json({ message: 'Error syncing with bank', error: err.message });
  }
};

const importPotonganManual = async (req, res) => {
  const { data, bulan, tahun } = req.body;
  if (!data || !Array.isArray(data)) {
    return res.status(400).json({ message: 'Data tidak valid' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM data_sp2d_potongan 
        WHERE (EXTRACT(MONTH FROM tanggal_pencairan) = ${parseInt(bulan)} AND EXTRACT(YEAR FROM tanggal_pencairan) = ${parseInt(tahun)})
      `;

      for (const rincian of data) {
        let sp2dId = null;
        let nomorSp2d = (rincian.NOMOR_SP2D || '').trim();
        let opdFinal = (rincian.OPD || '').trim();
        let sp2dSumberDana = null;

        if (nomorSp2d) {
          const sp2dMatch = await tx.data_sp2d.findFirst({
            where: { nomor: { contains: nomorSp2d, mode: 'insensitive' }, tahun: parseInt(tahun) }
          });
          if (sp2dMatch) {
            sp2dId = sp2dMatch.id;
            nomorSp2d = sp2dMatch.nomor;
            opdFinal = sp2dMatch.opd;
            const sdMatch = await tx.detail_sp2d.findFirst({ where: { id_sp2d: sp2dId } });
            if (sdMatch) sp2dSumberDana = sdMatch.id_sumber_dana;
          }
        }

        let jenis = 'PAJAK';
        const u = (rincian.URAIAN || '').toUpperCase();
        if (u.includes('PPN')) jenis = 'PPN';
        else if (u.includes('PPH 21')) jenis = 'PPh 21';
        else if (u.includes('PPH 4(2)') || u.includes('PASAL 4')) jenis = 'PPh 4(2)';
        else if (u.includes('IWP 8')) jenis = 'IWP 8%';
        else if (u.includes('IWP 1')) jenis = 'IWP 1%';
        else if (u.includes('KESEHATAN 4') || u.includes('BPJS 4')) jenis = 'JKES 4%';
        else if (u.includes('KECELAKAAN') || u.includes('JKK')) jenis = 'JKK';
        else if (u.includes('KEMATIAN') || u.includes('JKM')) jenis = 'JKM';
        else if (u.includes('TAPERUM')) jenis = 'Taperum';
        else if (u.includes('BERAS') || u.includes('BULOG')) jenis = 'BULOG';
        else if (u.includes('ZAKAT')) jenis = 'Zakat';
        else if (u.includes('IWP')) jenis = 'IWP';
        else if (u.includes('BPJS')) jenis = 'BPJS';

        const finalSumberDana = await dssService.getSumberDanaIdByName(rincian.SUMBER_DANA || sp2dSumberDana);
        const importOpdId = await dssService.getOpdIdByName(opdFinal);

        await tx.data_sp2d_potongan.create({
          data: {
            id_sp2d: sp2dId,
            jenis_potongan: jenis,
            nilai: parseFloat(rincian.NILAI_POTONGAN || 0),
            id_billing: rincian.ID_BILLING || null,
            keterangan: rincian.URAIAN,
            tanggal_pencairan: rincian.TANGGAL_PENCAIRAN ? parseDateSafe(rincian.TANGGAL_PENCAIRAN) : parseDateSafe(),
            nomor_sp2d: nomorSp2d,
            opd: importOpdId,
            uraian: rincian.URAIAN,
            id_sumber_dana: finalSumberDana
          }
        });
      }
    });

    res.json({ message: 'Proses impor rincian selesai', summary: { total: data.length } });
  } catch (err) {
    console.error('ERROR IMPORT POTONGAN:', err.message);
    res.status(500).json({ message: 'Server Error during import', error: err.message });
  }
};

/**
 * Impor Rincian Pajak langsung dari Ekspor SIPD RI Penatausahaan (Optimized & Hardened)
 */
const importExcelPajak = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File SIPD tidak ditemukan' });
  }

  const xlsx = require('xlsx');
  const fs = require('fs');
  const path = require('path');
  
  const bulan = parseInt(req.body.bulan || '0');
  const tahun = parseInt(req.body.tahun || new Date().getFullYear().toString());

  console.log(`[SIPD-IMPORT] Memulai pemrosesan untuk Periode: ${bulan}/${tahun}`);

  try {
    const absolutePath = path.resolve(req.file.path);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File tidak ditemukan di path: ${absolutePath}`);
    }

    const workbook = xlsx.readFile(absolutePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    const rawData = xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 4 });
    
    // DETEKSI FORMAT & MAPPING KOLOM
    // Format LAMA: Col 5 = Unit SKPD, Col 8 = Pajak/Potongan Jenis
    // Format REGISTER: Col 4 = Unit SKPD, Col 5 = Nama Penerima
    const headerRow = xlsx.utils.sheet_to_json(worksheet, { header: 1, range: 4, count: 1 })[0];
    let isRegisterFormat = false;
    if (headerRow && (headerRow[5] === 'Nama Penerima' || headerRow[4] === 'Unit SKPD')) {
       isRegisterFormat = true;
       console.log('[SIPD-IMPORT] Mendeteksi format REGISTER SP2D (Baru)');
    } else {
       console.log('[SIPD-IMPORT] Menggunakan format REKONSILIASI PAJAK (Lama)');
    }

    const colIdx = isRegisterFormat ? {
      sp2d: 3, opd: 4, pNama: 9, pNilai: 10, billing: 11, ntpn: 12, tanggal: 2
    } : {
      sp2d: 3, opd: 5, pNama: 9, pNilai: 10, billing: 12, ntpn: 13, tanggal: 2
    };

    // Dinamic date column detection
    if (headerRow) {
      const dateIdx = headerRow.findIndex(h => h && h.toString().toLowerCase().includes('tanggal'));
      if (dateIdx !== -1) colIdx.tanggal = dateIdx;
    }

    console.log(`[SIPD-IMPORT] Berhasil membaca ${rawData.length} baris data`);

    let successCount = 0;
    let failCount = 0;
    let lastNomorSp2d = '';
    let lastOpdName = '';

    await prisma.$transaction(async (tx) => {
      // Tahap 1: Pembersihan Data
      if (bulan > 0) {
        console.log(`[SIPD-IMPORT] Membersihkan data lama untuk periode ${bulan}/${tahun}`);
        await tx.$executeRaw`
          DELETE FROM data_sp2d_potongan 
          WHERE (EXTRACT(MONTH FROM tanggal_pencairan) = ${bulan} AND EXTRACT(YEAR FROM tanggal_pencairan) = ${tahun})
        `;
      }

      // Tahap 2: Iterasi Data
      const potonganEntries = [];
      const autoHeaderDeletedIds = new Set(); // Tracking per-import agar tidak delete berulang
      for (const row of rawData) {
        try {
          let nomorSp2d = (row[colIdx.sp2d] || '').toString().trim();
          const taxName = (row[colIdx.pNama] || '').toString().trim();
          
          const taxValue = parseNilaiExcel(row[colIdx.pNilai] || '0');

          const billingCode = row[colIdx.billing];
          const ntpn = row[colIdx.ntpn];
          let opdNameRaw = (row[colIdx.opd] || '').toString().trim();

          // Handle Grouped Rows (Merged Cells) untuk Nomor SP2D
          if (!nomorSp2d && lastNomorSp2d && taxValue > 0) {
            nomorSp2d = lastNomorSp2d;
          }
          if (nomorSp2d && !nomorSp2d.startsWith('(') && nomorSp2d.length > 5 && nomorSp2d.toUpperCase() !== 'NOMOR') {
            lastNomorSp2d = nomorSp2d;
          }

          // Handle Grouped Rows (Merged Cells) untuk OPD
          if (!opdNameRaw && lastOpdName && taxValue > 0) {
            opdNameRaw = lastOpdName;
          }
          if (opdNameRaw && !opdNameRaw.startsWith('(') && opdNameRaw.toUpperCase() !== 'UNIT SKPD') {
            lastOpdName = opdNameRaw;
          }

          // Validasi Baris
          if (!nomorSp2d || isNaN(taxValue) || taxValue <= 0 || taxName.toUpperCase() === 'NAMA' || nomorSp2d.toUpperCase() === 'NOMOR') {
            continue;
          }

          // Tahap 3: Pencocokan SP2D (Data Utama)
          // Normalisasi nomor untuk pencarian (hapus spasi berlebih)
          const normalizedNomor = nomorSp2d.replace(/\s+/g, '');

          const sp2dMatch = await tx.data_sp2d.findFirst({
            where: { 
              nomor: { 
                contains: normalizedNomor, 
                mode: 'insensitive' 
              } 
            }
          });

          let excelDate = row[colIdx.tanggal] ? parseDateSafe(row[colIdx.tanggal]) : null;
          let finalDate = null;
          let finalOpd = null;
          let sp2dSumberDana = null;
          let sp2dId = null;

          if (sp2dMatch) {
            sp2dId = sp2dMatch.id;
            // PRIORITAS 1: Gunakan Tanggal Pencairan Database
            // Jika tanggal_pencairan tidak ada atau nilainya tidak valid (misal: Tahun 1), gunakan tanggal SP2D
            let tglCair = sp2dMatch.tanggal_pencairan;
            if (!tglCair || tglCair.getFullYear() < 1900) {
              tglCair = sp2dMatch.tanggal;
            }
            finalDate = tglCair;
            
            finalOpd = sp2dMatch.opd;
            const sdMatch = await tx.detail_sp2d.findFirst({ where: { id_sp2d: sp2dMatch.id } });
            sp2dSumberDana = sdMatch?.id_sumber_dana;
          } else {
            finalOpd = opdNameRaw ? await dssService.getOpdIdByName(opdNameRaw) : 'TANPA OPD';
            
            // PRIORITAS 2: Gunakan Tanggal dari Excel
            if (excelDate) {
              finalDate = excelDate;
            } else {
              // PRIORITAS 3: Parsing dari nomor
              const parts = nomorSp2d.split('/');
              if (parts.length >= 3) {
                const pMonth = parseInt(parts[parts.length - 2]);
                const pYear = parseInt(parts[parts.length - 1]);
                if (!isNaN(pMonth) && !isNaN(pYear)) {
                  finalDate = new Date(pYear, pMonth - 1, 15);
                }
              }
            }
          }

          if (!finalDate) {
            finalDate = new Date(tahun, (bulan > 0 ? bulan : 1) - 1, 28);
          } else {
            // Koreksi Tahun jika tidak sesuai dengan konteks upload
            const d = new Date(finalDate);
            if (d.getFullYear() !== tahun) {
              finalDate = new Date(tahun, d.getMonth(), d.getDate());
            }
            
            // CATATAN: Jika SP2D Match (Punya sp2dId), kita TIDAK paksa bulannya ke 'bulan' pilihan user
            // agar tetap akurat untuk rekon bank (sesuai request user).
            // Namun jika TIDAK Match, kita bisa arahkan ke bulan pilihan user sebagai fallback.
            if (!sp2dId && bulan > 0 && (d.getMonth() + 1 !== bulan)) {
              finalDate = new Date(tahun, bulan - 1, Math.min(d.getDate(), 28));
            }
          }
          finalDate = parseDateSafe(finalDate);

          let jenis = 'PAJAK';
          const u = taxName.toUpperCase();
          if (u.includes('PPN')) jenis = 'PPN';
          else if (u.includes('PPH 21')) jenis = 'PPh 21';
          else if (u.includes('PPH 4(2)') || u.includes('PASAL 4')) jenis = 'PPh 4(2)';
          else if (u.includes('PPH 22')) jenis = 'PPh 22';
          else if (u.includes('PPH 23')) jenis = 'PPh 23';
          else if (u.includes('IWP 8')) jenis = 'IWP 8%';
          else if (u.includes('IWP 1')) jenis = 'IWP 1%';
          else if (u.includes('KESEHATAN 4') || u.includes('BPJS 4')) jenis = 'JKES 4%';
          else if (u.includes('KECELAKAAN')) jenis = 'JKK';
          else if (u.includes('KEMATIAN')) jenis = 'JKM';
          else if (u.includes('TAPERUM')) jenis = 'Taperum';
          else if (u.includes('ZAKAT')) jenis = 'Zakat';
          else if (u.includes('BERAS')) jenis = 'BULOG';

          // Hapus AUTO_HEADER saat pertama kali ada rincian manual untuk SP2D ini.
          // AUTO_HEADER adalah placeholder gelondongan; kehadiran rincian manual membuatnya redundant.
          if (sp2dMatch?.id && !autoHeaderDeletedIds.has(sp2dMatch.id)) {
            await tx.data_sp2d_potongan.deleteMany({
              where: { id_sp2d: sp2dMatch.id, keterangan: 'AUTO_HEADER' }
            });
            autoHeaderDeletedIds.add(sp2dMatch.id);
          }

          const newPotongan = await tx.data_sp2d_potongan.create({
            data: {
              id_sp2d: sp2dMatch?.id || null,
              nomor_sp2d: nomorSp2d.substring(0, 100),
              opd: String(finalOpd).substring(0, 255),
              jenis_potongan: jenis,
              nilai: taxValue,
              uraian: taxName || 'Rincian SIPD',
              id_billing: billingCode ? String(billingCode).substring(0, 50) : null,
              keterangan: ntpn ? `NTPN: ${String(ntpn).substring(0, 50)}` : null,
              tanggal_pencairan: finalDate,
              id_sumber_dana: sp2dSumberDana
            }
          });

          potonganEntries.push(newPotongan);
          successCount++;
        } catch (rowErr) {
          console.error(`[SIPD-IMPORT] Gagal simpan baris:`, rowErr.message);
          failCount++;
        }
      }

      // 4. Lakukan Penjurnalan Otomatis ke BKU
      if (potonganEntries.length > 0) {
        await accountingEngine.processPotonganJournalBulk(potonganEntries, tx);
      }
    }, {
      timeout: 300000 // 5 Minutes
    });

    try { if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath); } catch (e) {}

    res.json({ 
      message: 'Impor Data SIPD Berhasil', 
      summary: { 
        total_diproses: rawData.length, 
        berhasil: successCount, 
        gagal: failCount 
      } 
    });

  } catch (err) {
    console.error('CRITICAL ERROR SIPD IMPORT:', err);
    res.status(500).json({ 
      message: 'Terjadi kesalahan sistem saat memproses file SIPD', 
      error: err.message 
    });
  }
};

const updatePotongan = async (req, res) => {
  const { jenis_potongan, nilai, id_billing, keterangan, tanggal_pencairan, uraian, opd, status_rekon, selisih_rekon, keterangan_rekon } = req.body;
  try {
    const updated = await prisma.data_sp2d_potongan.update({
      where: { id: id },
      data: { 
        jenis_potongan, 
        nilai: nilai !== undefined ? parseFloat(nilai) : undefined, 
        id_billing, 
        keterangan,
        uraian,
        opd,
        status_rekon,
        selisih_rekon: selisih_rekon !== undefined ? parseFloat(selisih_rekon) : undefined,
        keterangan_rekon,
        tanggal_pencairan: tanggal_pencairan ? new Date(tanggal_pencairan) : undefined
      }
    });
    res.json({ message: 'Potongan diperbarui', data: updated });
  } catch (err) {
    res.status(500).json({ message: 'Error updating potongan', error: err.message });
  }
};

const deletePotongan = async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.data_sp2d_potongan.delete({ where: { id: id } });
    res.json({ message: 'Potongan berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting potongan', error: err.message });
  }
};

const deletePotonganByMonth = async (req, res) => {
  const { bulan, tahun } = req.query;
  if (!bulan || !tahun) return res.status(400).json({ message: 'Bulan dan Tahun harus diisi' });

  try {
    const result = await prisma.$executeRaw`
      DELETE FROM data_sp2d_potongan 
      WHERE id_sp2d IN (
        SELECT id FROM data_sp2d 
        WHERE tahun = ${parseInt(tahun)} AND EXTRACT(MONTH FROM tanggal) = ${parseInt(bulan)}
      )
    `;
    res.json({ message: `Berhasil menghapus rincian untuk periode ${bulan}/${tahun}`, deletedCount: result });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting monthly deductions', error: err.message });
  }
};

const getPotonganCount = async (req, res) => {
  const { bulan, tahun } = req.query;
  try {
    const count = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM data_sp2d_potongan 
      WHERE 1=1
      ${tahun ? Prisma.sql`AND EXTRACT(YEAR FROM tanggal_pencairan) = ${parseInt(tahun)}` : Prisma.empty}
      ${(bulan && bulan !== '0') ? Prisma.sql`AND EXTRACT(MONTH FROM tanggal_pencairan) = ${parseInt(bulan)}` : Prisma.empty}
    `;
    res.json({ count: Number(count[0].count) });
  } catch (err) {
    res.status(500).json({ message: 'Error counting monthly deductions', error: err.message });
  }
};

const bulkDeletePotongan = async (req, res) => {
  const { items } = req.body; // Array of { id, source }
  if (!items || !Array.isArray(items)) return res.status(400).json({ message: 'Items must be an array' });

  try {
    await prisma.$transaction(async (tx) => {
      const bankIds = items.filter(i => i.source === 'bank').map(i => i.id);
      const manualIds = items.filter(i => i.source === 'manual').map(i => i.id);

      if (bankIds.length > 0) {
        await tx.data_sp2d_potongan.deleteMany({ where: { id: { in: bankIds } } });
      }
      if (manualIds.length > 0) {
        await tx.setoran_pajak.deleteMany({ where: { id: { in: manualIds } } });
      }
    });

    await auditService.logActivity(req, 'HAPUS_BULK', 'POTONGAN_PAJAK', `Jumlah: ${items.length}`);
    res.json({ message: `Berhasil menghapus ${items.length} data potongan` });
  } catch (err) {
    console.error('BULK DELETE POTONGAN ERROR:', err.message);
    res.status(500).json({ message: 'Gagal melakukan hapus masal', error: err.message });
  }
};

const bulkDeleteIntegrated = async (req, res) => {
  const ids = req.body.ids || (req.body.items ? req.body.items.map((i) => i.id) : null);
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ message: 'IDs must be an array' });
  try {
    await prisma.$transaction(async (tx) => {
       const sp2ds = await tx.data_sp2d.findMany({ where: { id: { in: ids } } });
       const nomors = sp2ds.map(s => s.nomor);
       await tx.jurnal_talangan.deleteMany({ where: { no_referensi: { in: nomors } } });
       await tx.jurnal_umum.deleteMany({ where: { ref_id: { in: nomors } } });
       await tx.detail_sp2d.deleteMany({ where: { id_sp2d: { in: ids } } });
       await tx.data_sp2d.deleteMany({ where: { id: { in: ids } } });
    });
    await auditService.logActivity(req, 'HAPUS_BULK', 'SP2D', `Jumlah: ${ids.length}`);
    res.json({ message: 'Data berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Error bulk deleting', error: err.message });
  }
};

// ─── FITUR: Kelengkapan Tanggal Pencairan ────────────────────────────────────

const getMissingPencairanStats = async (req, res) => {
  const { tahun } = req.query;
  try {
    const tahunFilter = tahun ? Prisma.sql`AND EXTRACT(YEAR FROM s.tanggal) = ${parseInt(tahun)}` : Prisma.empty;
    const tahunFilterPot = tahun ? Prisma.sql`AND sp.tahun = ${parseInt(tahun)}` : Prisma.empty;

    const sp2dByBulan = await prisma.$queryRaw`
      SELECT
        TO_CHAR(s.tanggal, 'YYYY-MM') AS bulan,
        COUNT(*)::int AS cnt,
        COALESCE(SUM(CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total,0)),0)::DECIMAL AS neto
      FROM data_sp2d s
      LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
      WHERE s.tanggal_pencairan IS NULL
      ${tahunFilter}
      GROUP BY TO_CHAR(s.tanggal,'YYYY-MM')
      ORDER BY bulan DESC
    `;

    const potByBulan = await prisma.$queryRaw`
      SELECT
        TO_CHAR(sp.tanggal,'YYYY-MM') AS bulan,
        COUNT(*)::int AS cnt,
        COALESCE(SUM(CAST(p.nilai AS DECIMAL)),0)::DECIMAL AS total
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
      WHERE p.tanggal_pencairan IS NULL
        AND (sp.tanggal_pencairan IS NULL OR sp.id IS NULL)
      ${tahunFilterPot}
      GROUP BY TO_CHAR(sp.tanggal,'YYYY-MM')
      ORDER BY bulan DESC
    `;

    const sp2dCount = sp2dByBulan.reduce((s, r) => s + Number(r.cnt), 0);
    const sp2dNeto  = sp2dByBulan.reduce((s, r) => s + Number(r.neto || 0), 0);
    const potonganCount = potByBulan.reduce((s, r) => s + Number(r.cnt), 0);
    const potonganNilai = potByBulan.reduce((s, r) => s + Number(r.total || 0), 0);

    const bulanMap = {};
    sp2dByBulan.forEach(r => {
      bulanMap[r.bulan] = { bulan: r.bulan, sp2dCount: Number(r.cnt), potonganCount: 0 };
    });
    potByBulan.forEach(r => {
      if (!r.bulan) return;
      if (!bulanMap[r.bulan]) bulanMap[r.bulan] = { bulan: r.bulan, sp2dCount: 0, potonganCount: 0 };
      bulanMap[r.bulan].potonganCount += Number(r.cnt);
    });

    res.json({
      sp2dCount,
      sp2dNeto,
      potonganCount,
      potonganNilai,
      byBulan: Object.values(bulanMap).sort((a, b) => b.bulan.localeCompare(a.bulan)),
    });
  } catch (err) {
    console.error('getMissingPencairanStats error:', err);
    res.status(500).json({ message: 'Gagal mengambil statistik', error: err.message });
  }
};

const getMissingPencairan = async (req, res) => {
  const { type = 'sp2d', tahun, bulan, opd, page = 1, limit = 50 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  try {
    if (type === 'sp2d') {
      const where = { tanggal_pencairan: null };
      if (tahun) where.tahun = parseInt(tahun);
      if (opd) where.opd = { contains: opd, mode: 'insensitive' };
      if (bulan && tahun) {
        const m = bulan.padStart(2, '0');
        const y = parseInt(tahun);
        const lastDay = new Date(y, parseInt(m), 0).getDate();
        where.tanggal = {
          gte: new Date(`${y}-${m}-01`),
          lte: new Date(`${y}-${m}-${lastDay}`)
        };
      }

      const [data, total] = await Promise.all([
        prisma.data_sp2d.findMany({
          where,
          include: { potongan: { select: { nilai: true, jenis_potongan: true } } },
          orderBy: [{ tanggal: 'asc' }, { nomor: 'asc' }],
          skip,
          take,
        }),
        prisma.data_sp2d.count({ where }),
      ]);

      const result = data.map(s => {
        const totalPot = s.potongan.reduce((acc, p) => acc + Number(p.nilai || 0), 0);
        return {
          id: s.id,
          nomor: s.nomor,
          tanggal: s.tanggal,
          tahun: s.tahun,
          opd: s.opd,
          jenis: s.jenis,
          uraian: s.uraian,
          penerima: s.penerima,
          nilai_bruto: Number(s.nilai_bruto),
          total_potongan: totalPot,
          nilai_neto: Number(s.nilai_bruto) - totalPot,
          status_rekon: s.status_rekon,
          jml_potongan: s.potongan.length,
        };
      });

      return res.json({ data: result, total, page: parseInt(page), totalPages: Math.ceil(total / take) });
    }

    if (type === 'potongan') {
      const tahunFilter = tahun ? Prisma.sql`AND sp.tahun = ${parseInt(tahun)}` : Prisma.empty;
      const bulanFilter = (bulan && tahun) ? Prisma.sql`AND TO_CHAR(sp.tanggal,'MM') = ${bulan.padStart(2,'0')}` : Prisma.empty;
      const opdFilter = opd ? Prisma.sql`AND sp.opd ILIKE ${'%' + opd + '%'}` : Prisma.empty;

      const rows = await prisma.$queryRaw`
        SELECT
          p.id::text AS id,
          p.jenis_potongan,
          CAST(p.nilai AS DECIMAL) AS nilai,
          p.uraian,
          p.status_rekon,
          sp.id AS sp2d_id,
          sp.nomor AS sp2d_nomor,
          sp.tanggal AS sp2d_tanggal,
          sp.opd,
          sp.tahun
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
        WHERE p.tanggal_pencairan IS NULL
          AND (sp.tanggal_pencairan IS NULL OR sp.id IS NULL)
          ${tahunFilter}
          ${bulanFilter}
          ${opdFilter}
        ORDER BY sp.tanggal ASC, p.jenis_potongan
        LIMIT ${take} OFFSET ${skip}
      `;

      const countRows = await prisma.$queryRaw`
        SELECT COUNT(*)::int AS cnt
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
        WHERE p.tanggal_pencairan IS NULL
          AND (sp.tanggal_pencairan IS NULL OR sp.id IS NULL)
          ${tahunFilter}
          ${bulanFilter}
          ${opdFilter}
      `;

      const total = Number(countRows[0]?.cnt || 0);
      return res.json({ data: rows, total, page: parseInt(page), totalPages: Math.ceil(total / take) });
    }

    return res.status(400).json({ message: 'Parameter type tidak valid (sp2d|potongan)' });
  } catch (err) {
    console.error('getMissingPencairan error:', err);
    res.status(500).json({ message: 'Gagal mengambil data', error: err.message });
  }
};

const updateTanggalPencairanBulk = async (req, res) => {
  const { ids, tanggal_pencairan, type = 'sp2d' } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ message: 'ids harus berupa array tidak kosong' });
  if (!tanggal_pencairan)
    return res.status(400).json({ message: 'tanggal_pencairan wajib diisi' });

  const newDate = parseDateSafe(tanggal_pencairan);
  if (isNaN(newDate.getTime()))
    return res.status(400).json({ message: 'Format tanggal tidak valid' });

  try {
    let updatedSp2d = 0;
    let updatedPotongan = 0;
    const autoMatched = [];

    if (type === 'sp2d') {
      // Update SP2D headers
      const r1 = await prisma.data_sp2d.updateMany({
        where: { id: { in: ids }, tanggal_pencairan: null },
        data: { tanggal_pencairan: newDate },
      });
      updatedSp2d = r1.count;

      // Cascade: update child potongan yang masih null
      const r2 = await prisma.data_sp2d_potongan.updateMany({
        where: { id_sp2d: { in: ids }, tanggal_pencairan: null },
        data: { tanggal_pencairan: newDate },
      });
      updatedPotongan = r2.count;

      // Auto-rematch: cari bank entry yang cocok untuk setiap SP2D yang baru diupdate
      const sp2dList = await prisma.data_sp2d.findMany({
        where: { id: { in: ids } },
        include: { potongan: { select: { nilai: true } } },
      });

      for (const sp2d of sp2dList) {
        if (sp2d.status_rekon === 'SUDAH') continue;

        const totalPot = sp2d.potongan.reduce((s, p) => s + Number(p.nilai || 0), 0);
        const neto = Number(sp2d.nilai_bruto) - totalPot;

        const candidates = await prisma.$queryRaw`
          SELECT id, CAST(debet AS DECIMAL) AS debet,
                 ABS(CAST(debet AS DECIMAL) - ${neto}::DECIMAL) AS selisih
          FROM bank_statement
          WHERE debet > 0
            AND is_matched = false
            AND ABS(CAST(debet AS DECIMAL) - ${neto}::DECIMAL) < 1000
            AND tanggal::DATE BETWEEN ${newDate}::DATE - 7 AND ${newDate}::DATE + 7
          ORDER BY selisih ASC
          LIMIT 1
        `;

        if (candidates.length > 0) {
          const bank = candidates[0];
          const selisih = Number(bank.selisih);
          try {
            await prisma.$transaction([
              prisma.bank_statement.update({
                where: { id: parseInt(String(bank.id), 10) },
                data: {
                  is_matched: true,
                  ref_bku_id: sp2d.id,
                  match_type: 'PENCAIRAN_FIX',
                  selisih_nilai: selisih,
                  catatan_selisih: selisih < 1 ? null : `Selisih Rp ${Math.round(selisih).toLocaleString('id-ID')}`,
                },
              }),
              prisma.data_sp2d.update({
                where: { id: sp2d.id },
                data: {
                  status_rekon: 'SUDAH',
                  selisih_rekon: selisih,
                  keterangan_rekon: 'Auto-matched setelah tanggal pencairan diisi',
                },
              }),
            ]);
            autoMatched.push({ sp2dId: sp2d.id, sp2dNomor: sp2d.nomor, bankId: bank.id, selisih });
          } catch (matchErr) {
            console.error(`Auto-match gagal SP2D ${sp2d.id}:`, matchErr.message);
          }
        }
      }
    } else if (type === 'potongan') {
      const r = await prisma.data_sp2d_potongan.updateMany({
        where: { id: { in: ids }, tanggal_pencairan: null },
        data: { tanggal_pencairan: newDate },
      });
      updatedPotongan = r.count;
    }

    await auditService.logActivity(req, 'UPDATE', 'TANGGAL_PENCAIRAN', `Bulk update ${ids.length} ${type}: ${tanggal_pencairan}`);

    const parts = [];
    if (updatedSp2d > 0) parts.push(`${updatedSp2d} SP2D`);
    if (updatedPotongan > 0) parts.push(`${updatedPotongan} potongan`);
    const matchNote = autoMatched.length > 0 ? ` ${autoMatched.length} SP2D berhasil auto-match ke bank.` : '';

    res.json({
      updatedSp2d,
      updatedPotongan,
      autoMatched,
      message: `${parts.join(' + ')} diupdate.${matchNote}`,
    });
  } catch (err) {
    console.error('updateTanggalPencairanBulk error:', err);
    res.status(500).json({ message: 'Gagal update tanggal pencairan', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Audit Potongan: Perbandingan Gelondongan vs Rincian Manual
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /sp2d/selisih-potongan/stats
 * Ringkasan jumlah & nilai SP2D berdasarkan kelengkapan rincian potongan manual.
 */
const getSelisihPotonganStats = async (req, res) => {
  const tahunInt = parseInt(req.query.tahun) || new Date().getFullYear();
  try {
    const rows = await prisma.$queryRaw`
      SELECT
        CASE
          WHEN ROUND(COALESCE(r.total_manual, 0), 0) < ROUND(CAST(h.nilai_potongan AS DECIMAL), 0) THEN 'KURANG'
          WHEN ROUND(COALESCE(r.total_manual, 0), 0) > ROUND(CAST(h.nilai_potongan AS DECIMAL), 0) THEN 'LEBIH'
          ELSE 'LENGKAP'
        END as status_kel,
        COUNT(*)::int as jumlah,
        COALESCE(SUM(CAST(h.nilai_potongan AS DECIMAL) - COALESCE(r.total_manual, 0)), 0) as total_selisih
      FROM data_sp2d h
      LEFT JOIN (
        SELECT id_sp2d,
               SUM(CAST(nilai AS DECIMAL)) as total_manual
        FROM data_sp2d_potongan
        WHERE (keterangan IS NULL OR keterangan <> 'AUTO_HEADER')
        GROUP BY id_sp2d
      ) r ON r.id_sp2d = h.id
      WHERE h.nilai_potongan > 0
        AND h.tahun = ${tahunInt}
      GROUP BY status_kel
    `;

    const result = {
      KURANG:  { jumlah: 0, total_selisih: 0 },
      LENGKAP: { jumlah: 0, total_selisih: 0 },
      LEBIH:   { jumlah: 0, total_selisih: 0 },
    };
    for (const row of rows) {
      result[row.status_kel] = {
        jumlah: Number(row.jumlah),
        total_selisih: Math.abs(Number(row.total_selisih)),
      };
    }
    result.total = result.KURANG.jumlah + result.LENGKAP.jumlah + result.LEBIH.jumlah;
    res.json(result);
  } catch (err) {
    console.error('getSelisihPotonganStats error:', err);
    res.status(500).json({ message: 'Gagal mengambil statistik', error: err.message });
  }
};

/**
 * GET /sp2d/selisih-potongan
 * Daftar SP2D dengan perbandingan nilai potongan gelondongan vs rincian manual.
 * Query params: tahun, bulan, opd, status (KURANG|LENGKAP|LEBIH), page, limit
 */
const getSelisihPotongan = async (req, res) => {
  const {
    tahun, bulan, opd, status,
    page = 1, limit = 30,
  } = req.query;

  const tahunInt = parseInt(tahun) || new Date().getFullYear();
  const offset = (parseInt(page) - 1) * parseInt(limit);

  // Bangun kondisi WHERE dinamis dengan placeholder aman
  const conditions = [`h.nilai_potongan > 0`, `h.tahun = ${tahunInt}`];
  if (bulan)  conditions.push(`EXTRACT(MONTH FROM h.tanggal) = ${parseInt(bulan)}`);
  if (opd)    conditions.push(`h.opd ILIKE '%${opd.replace(/'/g, "''")}%'`);

  const whereClause = conditions.join(' AND ');

  // Subquery status HAVING-style: filter dilakukan di outer query
  const statusFilter = ['KURANG', 'LENGKAP', 'LEBIH'].includes(status)
    ? `WHERE status_kel = '${status}'`
    : '';

  try {
    const countRows = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as total
      FROM (
        SELECT
          CASE
            WHEN ROUND(COALESCE(r.total_manual, 0), 0) < ROUND(CAST(h.nilai_potongan AS DECIMAL), 0) THEN 'KURANG'
            WHEN ROUND(COALESCE(r.total_manual, 0), 0) > ROUND(CAST(h.nilai_potongan AS DECIMAL), 0) THEN 'LEBIH'
            ELSE 'LENGKAP'
          END as status_kel
        FROM data_sp2d h
        LEFT JOIN (
          SELECT id_sp2d, SUM(CAST(nilai AS DECIMAL)) as total_manual
          FROM data_sp2d_potongan
          WHERE (keterangan IS NULL OR keterangan <> 'AUTO_HEADER')
          GROUP BY id_sp2d
        ) r ON r.id_sp2d = h.id
        WHERE ${whereClause}
      ) sub
      ${statusFilter}
    `);

    const totalRows = Number(countRows[0]?.total || 0);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT
        h.id, h.nomor, h.tanggal, h.tanggal_pencairan,
        h.opd, h.penerima, h.uraian, h.jenis,
        CAST(h.nilai_bruto AS DECIMAL) as nilai_bruto,
        CAST(h.nilai_potongan AS DECIMAL) as potongan_gelondongan,
        COALESCE(r.total_manual, 0) as sum_rincian_manual,
        CAST(h.nilai_potongan AS DECIMAL) - COALESCE(r.total_manual, 0) as selisih,
        COALESCE(r.count_manual, 0)::int as count_rincian,
        CASE
          WHEN ROUND(COALESCE(r.total_manual, 0), 0) < ROUND(CAST(h.nilai_potongan AS DECIMAL), 0) THEN 'KURANG'
          WHEN ROUND(COALESCE(r.total_manual, 0), 0) > ROUND(CAST(h.nilai_potongan AS DECIMAL), 0) THEN 'LEBIH'
          ELSE 'LENGKAP'
        END as status_kel
      FROM data_sp2d h
      LEFT JOIN (
        SELECT id_sp2d,
               SUM(CAST(nilai AS DECIMAL)) as total_manual,
               COUNT(*) as count_manual
        FROM data_sp2d_potongan
        WHERE (keterangan IS NULL OR keterangan <> 'AUTO_HEADER')
        GROUP BY id_sp2d
      ) r ON r.id_sp2d = h.id
      WHERE ${whereClause}
      ORDER BY
        CASE WHEN ROUND(COALESCE(r.total_manual, 0), 0) < ROUND(CAST(h.nilai_potongan AS DECIMAL), 0) THEN 0 ELSE 1 END,
        ABS(CAST(h.nilai_potongan AS DECIMAL) - COALESCE(r.total_manual, 0)) DESC,
        h.tanggal DESC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `);

    // Filter status di JS agar lebih aman
    const filtered = status && ['KURANG', 'LENGKAP', 'LEBIH'].includes(status)
      ? rows.filter(r => r.status_kel === status)
      : rows;

    res.json({
      data: filtered.map(r => ({
        id: r.id,
        nomor: r.nomor,
        tanggal: r.tanggal,
        tanggal_pencairan: r.tanggal_pencairan,
        opd: r.opd,
        penerima: r.penerima,
        uraian: r.uraian,
        jenis: r.jenis,
        nilai_bruto: Number(r.nilai_bruto),
        potongan_gelondongan: Number(r.potongan_gelondongan),
        sum_rincian_manual: Number(r.sum_rincian_manual),
        selisih: Number(r.selisih),
        count_rincian: Number(r.count_rincian),
        status_kel: r.status_kel,
      })),
      total: totalRows,
      totalPages: Math.ceil(totalRows / parseInt(limit)),
      page: parseInt(page),
    });
  } catch (err) {
    console.error('getSelisihPotongan error:', err);
    res.status(500).json({ message: 'Gagal mengambil data', error: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// RESTORE TANGGAL PENCAIRAN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Preview: hitung berapa SP2D yang tanggal_pencairan-nya null dan bisa dipulihkan.
 */
const restoreTanggalPencairanPreview = async (req, res) => {
  const tahun = parseInt(req.query.tahun) || new Date().getFullYear();
  try {
    const nullCount = await prisma.data_sp2d.count({
      where: { tahun, tanggal_pencairan: null }
    });

    // Cek berapa yang bisa dipulihkan dari data_sp2d_potongan
    const fromPotongan = await prisma.$queryRaw`
      SELECT COUNT(DISTINCT id_sp2d) as count
      FROM data_sp2d_potongan p
      WHERE tanggal_pencairan IS NOT NULL
        AND id_sp2d IN (
          SELECT id FROM data_sp2d WHERE tahun = ${tahun} AND tanggal_pencairan IS NULL
        )
    `;

    res.json({
      tahun,
      total_null: nullCount,
      bisa_pulih_dari_potongan: Number(fromPotongan[0]?.count || 0)
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Jalankan restore tanggal_pencairan (setara restore_tanggal_pencairan.js).
 * Strategi 1: dari data_sp2d_potongan (tidak ikut reset).
 * Strategi 2: fuzzy-match dari bank_statement.
 */
const restoreTanggalPencairan = async (req, res) => {
  const tahun = parseInt(req.body.tahun) || new Date().getFullYear();
  const dryRun = req.body.dry_run === true;

  try {
    const sp2dNull = await prisma.$queryRaw`
      SELECT id, nomor, tanggal, nilai_neto, nilai_bruto
      FROM data_sp2d
      WHERE tahun = ${tahun} AND tanggal_pencairan IS NULL
      ORDER BY tanggal
    `;

    if (sp2dNull.length === 0) {
      return res.json({ message: 'Tidak ada data yang perlu dipulihkan.', restored: 0 });
    }

    let restoredFromPotongan = 0;
    let restoredFromBank = 0;
    let tidakDitemukan = 0;
    const log = [];

    for (const sp2d of sp2dNull) {
      let restoredDate = null;
      let sumber = null;

      // Sumber 1: data_sp2d_potongan
      const potRows = await prisma.$queryRaw`
        SELECT tanggal_pencairan FROM data_sp2d_potongan
        WHERE id_sp2d = ${sp2d.id} AND tanggal_pencairan IS NOT NULL
        ORDER BY tanggal_pencairan LIMIT 1
      `;
      if (potRows.length > 0 && potRows[0].tanggal_pencairan) {
        restoredDate = new Date(potRows[0].tanggal_pencairan);
        sumber = 'POTONGAN';
      }

      // Sumber 2: bank_statement (fuzzy)
      if (!restoredDate) {
        const neto = parseFloat(String(sp2d.nilai_neto || sp2d.nilai_bruto || 0));
        const tglSipd = new Date(sp2d.tanggal);
        const tglMin = new Date(tglSipd); tglMin.setDate(tglMin.getDate() - 1);
        const tglMax = new Date(tglSipd); tglMax.setDate(tglMax.getDate() + 14);

        if (neto > 0) {
          const bankRows = await prisma.$queryRaw`
            SELECT tanggal FROM bank_statement
            WHERE ABS(CAST(debet AS DECIMAL) - ${neto}::DECIMAL) < GREATEST(${neto} * 0.01, 1000)
              AND tanggal::DATE BETWEEN ${tglMin}::DATE AND ${tglMax}::DATE
            ORDER BY ABS(tanggal::DATE - ${tglSipd}::DATE) ASC
            LIMIT 1
          `;
          if (bankRows.length > 0 && bankRows[0].tanggal) {
            restoredDate = new Date(bankRows[0].tanggal);
            sumber = 'BANK_FUZZY';
          }
        }
      }

      if (restoredDate) {
        if (!dryRun) {
          await prisma.data_sp2d.update({
            where: { id: sp2d.id },
            data: { tanggal_pencairan: restoredDate }
          });
        }
        if (sumber === 'POTONGAN') restoredFromPotongan++;
        else restoredFromBank++;
        log.push({ nomor: sp2d.nomor, sumber, tanggal: restoredDate.toISOString().split('T')[0] });
      } else {
        tidakDitemukan++;
        log.push({ nomor: sp2d.nomor, sumber: 'TIDAK_DITEMUKAN', tanggal: null });
      }
    }

    if (!dryRun) {
      await prisma.log_aktivitas.create({
        data: {
          user_pelaksana: req.user?.username || req.user?.email || 'SYSTEM',
          aksi: 'RESTORE_TANGGAL_PENCAIRAN',
          detail: `Dipulihkan: ${restoredFromPotongan + restoredFromBank} SP2D (${restoredFromPotongan} dari potongan, ${restoredFromBank} dari bank). Tidak ditemukan: ${tidakDitemukan}.`
        }
      }).catch(() => {});
    }

    res.json({
      dry_run: dryRun,
      tahun,
      total_diproses: sp2dNull.length,
      restored_from_potongan: restoredFromPotongan,
      restored_from_bank: restoredFromBank,
      tidak_ditemukan: tidakDitemukan,
      log
    });
  } catch (err) {
    console.error('RESTORE TANGGAL PENCAIRAN ERROR:', err);
    res.status(500).json({ message: err.message });
  }
};

/**
 * Membersihkan record AUTO_HEADER yang sudah redundant karena rincian manual sudah diimport.
 * dry_run=true hanya menghitung tanpa mengubah data.
 */
const fixAutoHeaderPotongan = async (req, res) => {
  const dryRun = req.body.dry_run === true;
  try {
    // SP2D yang memiliki setidaknya 1 rincian manual (bukan AUTO_HEADER)
    const candidates = await prisma.$queryRaw`
      SELECT DISTINCT id_sp2d
      FROM data_sp2d_potongan
      WHERE id_sp2d IS NOT NULL
        AND (keterangan IS NULL OR keterangan != 'AUTO_HEADER')
    `;
    const sp2dIds = candidates.map(r => r.id_sp2d);

    if (sp2dIds.length === 0) {
      return res.json({ dry_run: dryRun, deleted: 0, message: 'Tidak ada AUTO_HEADER yang perlu dihapus' });
    }

    // Hitung berapa AUTO_HEADER yang akan dihapus
    const toDelete = await prisma.data_sp2d_potongan.count({
      where: { id_sp2d: { in: sp2dIds }, keterangan: 'AUTO_HEADER' }
    });

    if (!dryRun && toDelete > 0) {
      await prisma.data_sp2d_potongan.deleteMany({
        where: { id_sp2d: { in: sp2dIds }, keterangan: 'AUTO_HEADER' }
      });
      await prisma.log_aktivitas.create({
        data: {
          user_pelaksana: req.user?.username || 'SYSTEM',
          aksi: 'FIX_AUTO_HEADER_POTONGAN',
          detail: `Dihapus ${toDelete} record AUTO_HEADER redundant dari ${sp2dIds.length} SP2D`
        }
      }).catch(() => {});
    }

    res.json({
      dry_run: dryRun,
      deleted: toDelete,
      sp2d_affected: sp2dIds.length,
      message: dryRun
        ? `Preview: ${toDelete} AUTO_HEADER akan dihapus dari ${sp2dIds.length} SP2D`
        : `${toDelete} AUTO_HEADER berhasil dihapus dari ${sp2dIds.length} SP2D`
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  createSp2d,
  getSp2dList,
  getSp2dById,
  checkSp2dNomor,
  updateSp2dRekon,
  updateSp2d,
  deleteSp2d,
  getOpdList,
  getDistinctOpd,
  getJenisList,
  syncSp2dWithBank,
  importPotonganManual,
  importExcelPajak,
  updatePotongan,
  deletePotongan,
  deletePotonganByMonth,
  getPotonganCount,
  bulkDeletePotongan,
  bulkDeleteIntegrated,
  getMissingPencairanStats,
  getMissingPencairan,
  updateTanggalPencairanBulk,
  getSelisihPotonganStats,
  getSelisihPotongan,
  restoreTanggalPencairanPreview,
  restoreTanggalPencairan,
  fixAutoHeaderPotongan,
};
