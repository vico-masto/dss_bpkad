const { Prisma } = require('@prisma/client');
const prisma = require('../prismaClient');
const dssService = require('../services/dssService');
const auditService = require('../services/auditService');
const accountingEngine = require('../utils/accountingEngine');
const { parseDateSafe, parseNilaiExcel } = require('../utils/dateUtils');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

/**
 * Deteksi baris koreksi/pemindahbukuan internal bank (BO0* dan pola "PB/KOREKSI/KKURANGAN/KSALHN")
 * yang BUKAN pendapatan riil. Baris seperti ini harus ditangani via menu Koreksi Bank,
 * bukan dicatat sebagai penerimaan di data_pendapatan.
 */
const isKoreksiBank = (nomorBukti, uraian) => {
  const nb = (nomorBukti || '').toString().trim().toUpperCase();
  const ur = (uraian || '').toString().toUpperCase();
  if (nb.startsWith('BO0')) return true;
  if (/\bPB\b/.test(ur)) return true;
  return ['KSALHN', 'KKURANGAN', 'KOREKSI', 'KOREK'].some((k) => ur.includes(k));
};

/**
 * Mencatat Kas Masuk / Pendapatan dengan Auto-Settlement Talangan
 */
const createPendapatan = async (req, res) => {
  let { tanggal, nomor_bukti, uraian, id_sumber_dana, nilai } = req.body;

  if (!nomor_bukti || nomor_bukti.trim() === '') {
    const ts = Date.now();
    const rs = Math.random().toString(36).substring(7).toUpperCase();
    nomor_bukti = `BKT-AUTO-${ts}-${rs}`;
  }

  try {
    const tglObj = parseDateSafe(tanggal);
    let targetTanggal = tglObj;
    let tahun = tglObj.getFullYear();

    // Handle file upload
    const file_url = req.file ? `/uploads/${req.file.filename}` : null;

    // Logika Khusus SiLPA: Tanggal dipaksa ke 1 Januari
    if (id_sumber_dana.toUpperCase().includes('SILPA')) {
      targetTanggal = parseDateSafe(`${tahun}-01-01`);
    } else {
      targetTanggal = tglObj;
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const id = `TRX-${Date.now()}-${randomSuffix}`;

    let pendapatan;
    let settlementResult = { settledCount: 0 };

    await prisma.$transaction(async (tx) => {
      // Tolak baris koreksi/pemindahbukuan internal bank (BO0* dan pola PB/KOREKSI) —
      // ini BUKAN pendapatan riil, harus ditangani via menu Koreksi Bank.
      if (isKoreksiBank(nomor_bukti, uraian)) {
        throw new Error(`KOREKSI_BANK_BUKTI:${nomor_bukti}|${uraian}`);
      }
      const { skipDuplicate = false } = req.body;
      if (skipDuplicate) {
        const existing = await tx.data_pendapatan.findUnique({ where: { nomor_bukti } });
        if (existing) {
          throw new Error(`DUPLICATE_BUKTI:${nomor_bukti}`);
        }
      }

      pendapatan = await tx.data_pendapatan.create({
        data: {
          id,
          tanggal: targetTanggal,
          tahun,
          nomor_bukti,
          uraian,
          id_sumber_dana,
          nilai: parseFloat(nilai),
          file_url
        }
      });

      // Posting ke Buku Besar (General Ledger) - Sekarang dalam transaction!
      await accountingEngine.processIncomeJournal({
        nomor_bukti,
        tanggal: targetTanggal,
        uraian,
        nilai: parseFloat(nilai)
      }, tx);
    });

    // Auto-Settlement Talangan (Di luar transaction utama agar tidak mengunci tabel terlalu lama)
    try {
      settlementResult = await dssService.processAutoSettlement(id_sumber_dana);
    } catch (sErr) {
      console.warn('Auto-settlement warning:', sErr.message);
    }

    // 2. Log Aktivitas
    await auditService.logActivity(req, 'TAMBAH', 'PENDAPATAN', `No Bukti: ${nomor_bukti} | Rp ${parseFloat(nilai).toLocaleString('id-ID')}`);

    res.status(201).json({
      message: 'Pendapatan berhasil disimpan',
      id: pendapatan.id,
      settledCount: settlementResult.settledCount
    });
  } catch (err) {
    console.error('CREATE PENDAPATAN ERROR:', err.message);
    console.error('PAYLOAD WAS:', req.body);

    if (err.message.startsWith('KOREKSI_BANK_BUKTI:')) {
      const info = err.message.slice('KOREKSI_BANK_BUKTI:'.length);
      const [bkt, ...ur] = info.split('|');
      return res.status(400).json({
        message: `Baris '${ur.join('|') || bkt}' (bukti ${bkt}) terdeteksi sebagai koreksi/pemindahbukuan internal bank, bukan pendapatan. Gunakan menu Koreksi Bank.`,
        error: err.message
      });
    }

    if (err.message.startsWith('DUPLICATE_BUKTI:')) {
      const bkt = err.message.split(':')[1];
      return res.status(400).json({
        message: `Nomor Bukti ${bkt} sudah terdaftar`,
        error: err.message
      });
    }

    if (err.code === 'P2002') { // Prisma unique constraint error
      return res.status(400).json({
        message: `Nomor Bukti ${req.body.nomor_bukti} sudah terdaftar`,
        error: err.message
      });
    }

    if (err.code === 'P2003') { // Prisma foreign key error
      return res.status(400).json({
        message: `ID Sumber Dana '${req.body.id_sumber_dana}' tidak valid. Silakan gunakan kode standar (e.g., SD-DAU, SD-PAD).`,
        error: err.message
      });
    }

    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const getPendapatanList = async (req, res) => {
  const { page = 1, limit = 15, id_sumber_dana, tahun, tgl_awal, tgl_akhir, search, min_nilai, max_nilai } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  try {
    const where = {};
    if (id_sumber_dana) where.id_sumber_dana = id_sumber_dana;

    const targetTahun = parseInt(tahun);
    if (!isNaN(targetTahun)) {
      where.tahun = targetTahun;
    }

    const startDate = tgl_awal ? new Date(tgl_awal) : null;
    const endDate = tgl_akhir ? new Date(tgl_akhir) : null;

    if (startDate && !isNaN(startDate.getTime())) {
      where.tanggal = { ...where.tanggal, gte: startDate };
    }
    if (endDate && !isNaN(endDate.getTime())) {
      where.tanggal = { ...where.tanggal, lte: endDate };
    }

    if (min_nilai || max_nilai) {
      where.nilai = {
        ...(min_nilai ? { gte: parseFloat(min_nilai) } : {}),
        ...(max_nilai ? { lte: parseFloat(max_nilai) } : {})
      };
    }

    if (search) {
      // Bersihkan awalan mata uang seperti Rp, Rp., IDR agar tidak mengacaukan pemisahan kata
      const searchClean = search.replace(/rp\.?/gi, '').replace(/idr/gi, '').trim();
      const searchTerms = searchClean.split(' ').map(t => t.trim()).filter(t => t.length > 0);
      if (searchTerms.length > 0) {
        where.AND = searchTerms.map(term => {
          const termClean = term.replace(/\./g, '').replace(/,/g, '.');
          const termNum = parseFloat(termClean);
          const orConds = [
            { nomor_bukti: { contains: term, mode: 'insensitive' } },
            { uraian: { contains: term, mode: 'insensitive' } },
            { id_sumber_dana: { contains: term, mode: 'insensitive' } },
            { status_rekon: { contains: term, mode: 'insensitive' } },
            { keterangan_rekon: { contains: term, mode: 'insensitive' } }
          ];

          // Jika berupa angka, cari juga di nilai dan selisih
          if (!isNaN(termNum)) {
            orConds.push({ nilai: { equals: termNum } });
            orConds.push({ selisih_rekon: { equals: termNum } });
            
            // Jika persis 4 digit, cari di kolom tahun
            if (/^\d{4}$/.test(term)) {
              orConds.push({ tahun: { equals: parseInt(term) } });
            }
          }

          // Cek format tanggal (e.g. DD/MM/YYYY, DD-MM-YYYY, atau YYYY-MM-DD)
          if (term.includes('/') || term.includes('-')) {
            const parts = term.split(/[-/]/);
            if (parts.length === 3) {
              let day, month, year;
              if (parts[0].length === 4) { // YYYY-MM-DD
                year = parseInt(parts[0]);
                month = parseInt(parts[1]) - 1;
                day = parseInt(parts[2]);
              } else { // DD-MM-YYYY atau DD/MM/YYYY
                day = parseInt(parts[0]);
                month = parseInt(parts[1]) - 1;
                year = parseInt(parts[2]);
              }
              if (!isNaN(day) && !isNaN(month) && !isNaN(year) && year > 1000) {
                // Gunakan range 00:00:00 sampai 23:59:59 UTC
                const startOfDay = new Date(Date.UTC(year, month, day, 0, 0, 0));
                const endOfDay = new Date(Date.UTC(year, month, day, 23, 59, 59));
                orConds.push({ tanggal: { gte: startOfDay, lte: endOfDay } });
              }
            }
          }

          return { OR: orConds };
        });
      }
    }

    // Execute core queries
    const [data, total, summary, summaryPengeluaran] = await Promise.all([
      prisma.data_pendapatan.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { created_at: 'desc' }],
        skip,
        take
      }),
      prisma.data_pendapatan.count({ where }),
      prisma.data_pendapatan.aggregate({
        where,
        _sum: { nilai: true }
      }),
      prisma.detail_sp2d.aggregate({
        where: {
          id_sumber_dana: id_sumber_dana || undefined,
          sp2d: {
            tahun: tahun ? parseInt(tahun) : undefined,
            tanggal: {
              ...(startDate && !isNaN(startDate.getTime()) ? { gte: startDate } : {}),
              ...(endDate && !isNaN(endDate.getTime()) ? { lte: endDate } : {})
            }
          }
        },
        _sum: { nilai_neto: true }
      })
    ]);

    // Simplified Monthly Totals Query
    const finalTahun = isNaN(parseInt(tahun)) ? new Date().getFullYear() : parseInt(tahun);
    const monthlyTotals = await prisma.$queryRaw`
      SELECT EXTRACT(MONTH FROM tanggal)::int as bulan, SUM(nilai)::float as total
      FROM data_pendapatan
      WHERE tahun = ${finalTahun}
      GROUP BY bulan
      ORDER BY bulan ASC
    `;

    res.json({
      data,
      total,
      totalNilai: summary._sum.nilai || 0,
      totalPengeluaran: summaryPengeluaran._sum.nilai_neto || 0,
      monthlyTotals: monthlyTotals.map(m => ({ bulan: Number(m.bulan), total: Number(m.total) })),
      page: parseInt(page),
      totalPages: Math.ceil(total / take)
    });
  } catch (err) {
    console.error('GET PENDAPATAN ERROR:', err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const updatePendapatan = async (req, res) => {
  const { id } = req.params;
  const { tanggal, nomor_bukti, uraian, id_sumber_dana, nilai, status_rekon, selisih_rekon, keterangan_rekon } = req.body;

  try {
    const tglObj = parseDateSafe(tanggal);
    let targetTanggal = tglObj;
    let tahun = tglObj.getFullYear();

    // Handle file upload
    const file_url = req.file ? `/uploads/${req.file.filename}` : null;

    if (id_sumber_dana.toUpperCase().includes('SILPA')) {
      targetTanggal = parseDateSafe(`${tahun}-01-01`);
    } else {
      targetTanggal = tglObj;
    }

    await prisma.$transaction(async (tx) => {
      // 0. Bersihkan Jurnal Umum (General Ledger) terkait nomor bukti lama
      const oldData = await tx.data_pendapatan.findUnique({
        where: { id },
        select: { nomor_bukti: true }
      });

      if (oldData) {
        await tx.jurnal_umum.deleteMany({
          where: { ref_id: oldData.nomor_bukti }
        });
      }

      // 1. Update Data Utama
      const updateData = {
        tanggal: targetTanggal,
        tahun,
        nomor_bukti,
        uraian,
        id_sumber_dana,
        nilai: parseFloat(nilai),
        status_rekon,
        selisih_rekon: selisih_rekon !== undefined ? parseFloat(selisih_rekon) : undefined,
        keterangan_rekon,
        updated_at: new Date()
      };

      if (file_url) updateData.file_url = file_url;

      await tx.data_pendapatan.update({
        where: { id },
        data: updateData
      });

      // 2. Posting ke Buku Besar (General Ledger)
      await accountingEngine.processIncomeJournal({
        nomor_bukti,
        tanggal: targetTanggal,
        uraian,
        nilai: parseFloat(nilai)
      });
    });

    // Re-run auto-settlement
    await dssService.processAutoSettlement(id_sumber_dana);

    await auditService.logActivity(req, 'UPDATE', 'PENDAPATAN', `No Bukti: ${nomor_bukti} | Rp ${parseFloat(nilai).toLocaleString('id-ID')}`);

    res.json({ message: 'Pendapatan berhasil diperbarui' });
  } catch (err) {
    console.error('ERROR UPDATE PENDAPATAN:', err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const deletePendapatan = async (req, res) => {
  const { id } = req.params;

  try {
    const info = await prisma.data_pendapatan.findUnique({
      where: { id }
    });

    if (!info) {
      return res.status(404).json({ message: 'Data tidak ditemukan' });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Hapus Jurnal Umum
      await tx.jurnal_umum.deleteMany({
        where: { ref_id: info.nomor_bukti }
      });

      // 2. Hapus Data Utama
      await tx.data_pendapatan.delete({
        where: { id }
      });
    });

    await auditService.logActivity(req, 'HAPUS', 'PENDAPATAN', `No Bukti: ${info.nomor_bukti} | Rp ${parseFloat(info.nilai).toLocaleString('id-ID')}`);

    res.json({ message: 'Pendapatan berhasil dihapus' });
  } catch (err) {
    console.error('ERROR DELETE PENDAPATAN:', err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

const deleteMultiplePendapatan = async (req, res) => {
  const { ids } = req.body;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ message: 'Tidak ada ID yang dipilih' });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Ambil nomor bukti untuk hapus jurnal
      const items = await tx.data_pendapatan.findMany({
        where: { id: { in: ids } },
        select: { nomor_bukti: true }
      });

      const nomorBuktis = items.map(i => i.nomor_bukti);

      // 2. Hapus Jurnal
      await tx.jurnal_umum.deleteMany({
        where: { ref_id: { in: nomorBuktis } }
      });

      // 3. Hapus Data Utama
      await tx.data_pendapatan.deleteMany({
        where: { id: { in: ids } }
      });
    });

    await auditService.logActivity(req, 'HAPUS_BULK', 'PENDAPATAN', `Jumlah: ${ids.length} data`);

    res.json({ message: `${ids.length} data pendapatan berhasil dihapus` });
  } catch (err) {
    console.error('ERROR DELETE BANYAK PENDAPATAN:', err.message);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * [KELOLA] Hapus seluruh Pendapatan satu bulan (kascade jurnal)
 */
const deletePendapatanByBulan = async (req, res) => {
  let deletedCount = 0;
  const tahun = parseInt(req.query.tahun);
  const bulan = parseInt(req.query.bulan);
  if (!tahun || !bulan || bulan < 1 || bulan > 12) {
    return res.status(400).json({ message: 'Tahun & Bulan wajib valid' });
  }
  try {
    await prisma.$transaction(async (tx) => {
      const items = await tx.data_pendapatan.findMany({
        where: { tahun, },
        select: { id: true, nomor_bukti: true, tanggal: true }
      });
      const inMonth = items.filter(i => {
        const t = i.tanggal ? new Date(i.tanggal) : null;
        return t && !isNaN(t) && (t.getMonth() + 1) === bulan;
      });
      if (inMonth.length > 0) {
        const nomorBuktis = inMonth.map(i => i.nomor_bukti).filter(Boolean);
        if (nomorBuktis.length > 0) {
          await tx.jurnal_umum.deleteMany({ where: { ref_id: { in: nomorBuktis } } });
        }
        await tx.data_pendapatan.deleteMany({
          where: { id: { in: inMonth.map(i => i.id) } }
        });
      }

      deletedCount = inMonth.length;
    }, { timeout: 60000 });

    await auditService.logActivity(req, 'RESET_BULAN', 'PENDAPATAN', `Hapus ${deletedCount} pendapatan bulan ${bulan}/${tahun}`);
    res.json({ message: `Berhasil menghapus ${deletedCount} pendapatan bulan ${bulan}/${tahun}`, deleted: deletedCount });
  } catch (err) {
    console.error('DELETE PENDAPATAN BY BULAN:', err.message);
    res.status(500).json({ message: 'Gagal menghapus pendapatan bulanan', error: err.message });
  }
};

const importBulkPendapatan = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File Excel tidak ditemukan' });
  }

  const xlsx = require('xlsx');
  const fs = require('fs');
  const path = require('path');

  const { mode = 'add', bulan, tahun } = req.body;
  const targetBulan = parseInt(bulan || '0');
  const targetTahun = parseInt(tahun || new Date().getFullYear().toString());

  try {
    const absolutePath = path.resolve(req.file.path);
    const workbook = xlsx.readFile(absolutePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = xlsx.utils.sheet_to_json(worksheet);

    if (rawData.length === 0) {
      throw new Error('File Excel kosong atau tidak terbaca');
    }

    // Helper untuk mapping kolom secara dinamis (seperti di SP2D)
    const getVal = (item, keyTarget) => {
      const found = Object.keys(item).find(k => {
        const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanTarget = keyTarget.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanKey === cleanTarget;
      });
      return found ? item[found] : '';
    };

    const validSources = await prisma.master_sumber_dana.findMany({ select: { id: true, nama: true } });
    const sourceIds = new Set(validSources.map(s => s.id));
    const sourceNamesMap = new Map(validSources.map(s => [s.nama.toUpperCase(), s.id]));

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errors = [];

    await prisma.$transaction(async (tx) => {
      // 1. Pembersihan Periodik (Jika mode 'replace')
      if (mode === 'replace' && targetBulan > 0) {
        const itemsToDelete = await tx.data_pendapatan.findMany({
          where: {
            tahun: targetTahun,
            tanggal: {
              gte: new Date(targetTahun, targetBulan - 1, 1),
              lte: new Date(targetTahun, targetBulan, 0)
            }
          },
          select: { id: true, nomor_bukti: true }
        });
        const refs = itemsToDelete.map(i => i.nomor_bukti);
        const ids  = itemsToDelete.map(i => i.id);
        // Reset bank links agar tidak jadi ghost match setelah data diganti
        if (ids.length > 0) {
          await tx.bank_statement.updateMany({
            where: { ref_bku_id: { in: ids } },
            data: { ref_bku_id: null, is_matched: false, match_type: null }
          });
        }
        await tx.jurnal_umum.deleteMany({ where: { ref_id: { in: refs } } });
        await tx.data_pendapatan.deleteMany({
          where: {
            tahun: targetTahun,
            tanggal: {
              gte: new Date(targetTahun, targetBulan - 1, 1),
              lte: new Date(targetTahun, targetBulan, 0)
            }
          }
        });
      }

      // 2. Persiapan Batch Insert
      const toCreate = [];
      const batchDuplicateCheck = new Set();
      // Auto-link: kumpulkan ID bank yang sudah diklaim dalam batch ini agar tidak double-match
      const claimedBankIds = new Set();
      const bankLinkUpdates = []; // { bankId, pendapatanId }

      for (const item of rawData) {
        let rawTanggal = getVal(item, 'tanggal') || getVal(item, 'tgl');
        let rawNomor = getVal(item, 'nomorbukti') || getVal(item, 'nobukti') || getVal(item, 'sts') || getVal(item, 'nomor') || getVal(item, 'bukti');
        let rawSumber = getVal(item, 'idsumberdana') || getVal(item, 'sumberdana') || getVal(item, 'kode') || getVal(item, 'sd');
        let rawNilai = getVal(item, 'nilai') || getVal(item, 'nominal') || getVal(item, 'jumlah');
        let rawUraian = getVal(item, 'uraian') || getVal(item, 'keterangan') || getVal(item, 'deskripsi');

        if (!rawTanggal || !rawNilai) continue;

        let finalNomor = (rawNomor?.toString() || '').trim();
        if (!finalNomor) {
          finalNomor = `BKT-AUTO-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        }

        const tglObj = parseDateSafe(rawTanggal);
        const finalTglStr = tglObj.toISOString().split('T')[0];
        const uniqueKey = `${finalNomor}|${finalTglStr}`;

        // Cek duplikat di database (jika tidak mode replace)
        if (mode === 'add') {
          const existing = await tx.data_pendapatan.findUnique({
            where: { tanggal_nomor_bukti: { tanggal: tglObj, nomor_bukti: finalNomor } }
          });
          if (existing) {
            skippedCount++;
            continue;
          }
        }

        // Cek duplikat di batch ini
        if (batchDuplicateCheck.has(uniqueKey)) {
          skippedCount++;
          continue;
        }
        batchDuplicateCheck.add(uniqueKey);

        // Normalisasi Sumber Dana
        let sdVal = (rawSumber?.toString() || '').trim().toUpperCase();
        let finalSourceId = sdVal;
        if (sdVal) {
          if (!sourceIds.has(sdVal)) {
            const byName = sourceNamesMap.get(sdVal);
            if (byName) finalSourceId = byName;
            else {
              errorCount++;
              errors.push(`Bukti ${finalNomor}: SD '${sdVal}' tidak valid.`);
              continue;
            }
          }
        } else {
          errorCount++;
          errors.push(`Bukti ${finalNomor}: SD kosong.`);
          continue;
        }

        const nilaiParsed = parseNilaiExcel(rawNilai);
        const rowData = {
          id: `TRX-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${successCount}`,
          tanggal: tglObj,
          tahun: tglObj.getFullYear(),
          nomor_bukti: finalNomor,
          uraian: (rawUraian?.toString() || '').trim() || 'Penerimaan Kas (Import)',
          id_sumber_dana: finalSourceId,
          nilai: nilaiParsed,
          status_rekon: 'BELUM'
        };

        // Tolak baris koreksi/pemindahbukuan internal bank (BO02/419... dan pola PB/KOREKSI) —
        // BUKAN pendapatan riil; harus lewat menu Koreksi Bank. Jangan di-auto-link ke bank.
        if (isKoreksiBank(finalNomor, rowData.uraian)) {
          errorCount++;
          errors.push(`Bukti ${finalNomor}: baris koreksi/pemindahbukuan internal bank, dilewati. Gunakan menu Koreksi Bank.`);
          continue;
        }

        // Auto-link ke bank_statement: cari kredit dengan nilai & tanggal sama (Â±2 hari)
        // Pendapatan bersumber dari rekening koran, jadi seharusnya langsung cocok saat import.
        if (nilaiParsed > 0) {
          const bankMatch = await tx.$queryRawUnsafe(`
            SELECT id FROM bank_statement
            WHERE kredit = ${nilaiParsed}
              AND is_matched = false
              AND id NOT IN (${claimedBankIds.size > 0 ? [...claimedBankIds].join(',') : '0'})
              AND ABS(tanggal - '${finalTglStr}'::date) <= 2
            ORDER BY ABS(tanggal - '${finalTglStr}'::date) ASC
            LIMIT 1
          `);
          if (bankMatch.length > 0) {
            const bankId = Number(bankMatch[0].id);
            claimedBankIds.add(bankId);
            bankLinkUpdates.push({ bankId, pendapatanId: rowData.id });
            rowData.status_rekon = 'SUDAH';
            rowData.tanggal_pencairan = bankMatch[0].tanggal ?? tglObj;
          }
        }

        toCreate.push(rowData);
        successCount++;
      }

      if (toCreate.length > 0) {
        // Pecah batch jika terlalu besar (per 500 records)
        for (let i = 0; i < toCreate.length; i += 500) {
          const chunk = toCreate.slice(i, i + 500);
          await tx.data_pendapatan.createMany({ data: chunk });
          await accountingEngine.processIncomeJournalBulk(chunk, tx);
        }
      }

      // Tulis link bank_statement setelah semua pendapatan selesai dibuat
      for (const { bankId, pendapatanId } of bankLinkUpdates) {
        await tx.bank_statement.update({
          where: { id: bankId },
          data: { ref_bku_id: pendapatanId, is_matched: true, match_type: 'AUTO_IMPORT' }
        });
      }
    }, { timeout: 300000 }); // 5 Menit Timeout seperti SP2D

    // Cleanup file sementara
    try { if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath); } catch (e) { }

    await auditService.logActivity(req, 'IMPORT_BULK', 'PENDAPATAN', `Berhasil: ${successCount}, Dilewati: ${skippedCount}, Gagal: ${errorCount}`);

    res.json({
      message: 'Proses import selesai (Metode SP2D)',
      successCount,
      skippedCount,
      errorCount,
      errors: errors.slice(0, 20)
    });

  } catch (err) {
    console.error('BULK IMPORT PENDAPATAN ERROR:', err);
    res.status(500).json({
      message: 'Gagal memproses file import (Metode SP2D)',
    });
  }
};

// â”€â”€â”€ Export Template untuk Update Massal Uraian & Sumber Dana â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const exportTemplateUpdatePendapatan = async (req, res) => {
  try {
    const { tahun, tgl_awal, tgl_akhir, id_sumber_dana } = req.query;

    // Ambil data pendapatan dengan filter
    const where = {};
    if (tahun) where.tahun = parseInt(tahun);
    if (tgl_awal || tgl_akhir) {
      where.tanggal = {};
      if (tgl_awal) where.tanggal.gte = new Date(tgl_awal);
      if (tgl_akhir) where.tanggal.lte = new Date(tgl_akhir);
    }
    if (id_sumber_dana) where.id_sumber_dana = id_sumber_dana;

    const data = await prisma.data_pendapatan.findMany({
      where,
      orderBy: [{ tanggal: 'asc' }, { nomor_bukti: 'asc' }],
      select: { nomor_bukti: true, tanggal: true, uraian: true, id_sumber_dana: true, nilai: true }
    });

    // Ambil daftar sumber dana untuk sheet referensi
    const sumberDana = await prisma.master_sumber_dana.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, nama: true }
    });

    // Sheet 1: Data untuk diupdate
    const wsData = [
      ['Nomor Bukti', 'Tanggal', 'Uraian (Saat Ini)', 'Uraian Baru', 'Sumber Dana (Saat Ini)', 'Sumber Dana Baru'],
      ...data.map(d => [
        d.nomor_bukti,
        d.tanggal.toISOString().split('T')[0],
        d.uraian || '',
        '',
        d.id_sumber_dana || '',
        ''
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Sheet 2: Referensi Sumber Dana
    const refData = [
      ['ID Sumber Dana', 'Nama Sumber Dana'],
      ...sumberDana.map(s => [s.id, s.nama])
    ];
    const wsRef = XLSX.utils.aoa_to_sheet(refData);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Update Data');
    XLSX.utils.book_append_sheet(wb, wsRef, 'Daftar Sumber Dana');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Template_Update_Pendapatan_${Date.now()}.xlsx"`);
    res.send(buf);
  } catch (err) {
    console.error('exportTemplateUpdatePendapatan error:', err);
    res.status(500).json({ message: 'Gagal mengekspor template', error: err.message });
  }
};

// â”€â”€â”€ Import Update Massal Uraian & Sumber Dana â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const importUpdatePendapatan = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'File Excel tidak ditemukan' });
  }
  try {
    const absolutePath = path.resolve(req.file.path);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`File tidak ditemukan di path: ${absolutePath}`);
    }

    const workbook = XLSX.readFile(absolutePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet);

    if (rows.length === 0) {
      throw new Error('File Excel kosong atau tidak terbaca');
    }

    // Mapping nama kolom (case-insensitive)
    const getVal = (item, keyTarget) => {
      const found = Object.keys(item).find(k => {
        const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanTarget = keyTarget.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanKey === cleanTarget;
      });
      return found ? item[found] : '';
    };

    // Ambil daftar sumber dana untuk validasi
    const sumberDanaList = await prisma.master_sumber_dana.findMany({ select: { id: true, nama: true } });
    const sdById = new Map(sumberDanaList.map(s => [s.id, s]));
    const sdByName = new Map(sumberDanaList.map(s => [s.nama.toUpperCase(), s.id]));

    let updated = 0;
    let skipped = 0;
    const errors = [];

    // Proses per baris
    for (const row of rows) {
      const nomorBukti = (getVal(row, 'Nomor Bukti') || '').toString().trim();
      const uraianBaru = (getVal(row, 'Uraian Baru') || '').toString().trim();
      const sdBaru = (getVal(row, 'Sumber Dana Baru') || '').toString().trim().toUpperCase();

      if (!nomorBukti) {
        skipped++;
        continue;
      }
      if (!uraianBaru && !sdBaru) {
        skipped++;
        continue;
      }

      // Cari data existing berdasarkan nomor_bukti
      const existing = await prisma.data_pendapatan.findFirst({
        where: { nomor_bukti: nomorBukti }
      });
      if (!existing) {
        errors.push(`Nomor bukti '${nomorBukti}' tidak ditemukan di database`);
        continue;
      }

      // Siapkan data update
      const updateData = { updated_at: new Date() };
      if (uraianBaru) updateData.uraian = uraianBaru;
      if (sdBaru) {
        // Coba cocokkan sebagai ID dulu, lalu sebagai Nama
        let finalSdId = sdById.has(sdBaru) ? sdBaru : sdByName.get(sdBaru);
        if (!finalSdId) {
          errors.push(`Nomor bukti '${nomorBukti}': Sumber dana '${sdBaru}' tidak valid. Cek sheet referensi.`);
          continue;
        }
        updateData.id_sumber_dana = finalSdId;
      }

      await prisma.data_pendapatan.update({
        where: { id: existing.id },
        data: updateData
      });
      updated++;
    }

    // Hapus file temporary
    try { if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath); } catch (e) { /* ok */ }

    res.json({
      message: `Selesai: ${updated} data diupdate, ${skipped} dilewati`,
      updated,
      skipped,
      errors: errors.slice(0, 50)
    });
  } catch (err) {
    console.error('importUpdatePendapatan error:', err);
    // Hapus file jika ada error
    if (req.file && req.file.path) {
      try { if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); } catch (e) { /* ok */ }
    }
    res.status(500).json({ message: 'Gagal memproses file update', error: err.message });
  }
};

module.exports = {
  createPendapatan,
  getPendapatanList,
  updatePendapatan,
  deletePendapatan,
  deleteMultiplePendapatan,
  deletePendapatanByBulan,
  importBulkPendapatan,
  exportTemplateUpdatePendapatan,
  importUpdatePendapatan
};




