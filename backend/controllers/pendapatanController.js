const { Prisma } = require('@prisma/client');
const prisma = require('../prismaClient');
const dssService = require('../services/dssService');
const auditService = require('../services/auditService');
const accountingEngine = require('../utils/accountingEngine');
const { parseDateSafe, parseNilaiExcel } = require('../utils/dateUtils');

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
      const searchTerms = search.split(' ').map(t => t.trim()).filter(t => t.length > 0);
      if (searchTerms.length > 0) {
        where.AND = searchTerms.map(term => {
          const termClean = term.replace(/\./g, '').replace(/,/g, '.');
          const termNum = parseFloat(termClean);
          const orConds = [
            { nomor_bukti: { contains: term, mode: 'insensitive' } },
            { uraian: { contains: term, mode: 'insensitive' } }
          ];

          if (!isNaN(termNum)) {
            orConds.push({ nilai: { equals: termNum } });
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

        // Auto-link ke bank_statement: cari kredit dengan nilai & tanggal sama (±2 hari)
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
      error: err.message
    });
  }
};

module.exports = {
  createPendapatan,
  getPendapatanList,
  updatePendapatan,
  deletePendapatan,
  deleteMultiplePendapatan,
  importBulkPendapatan
};


