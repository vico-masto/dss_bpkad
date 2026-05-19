const { Prisma } = require('@prisma/client');
const prisma = require('../prismaClient');

/**
 * Mendapatkan Data BKU (Buku Kas Umum) secara Kronologis
 */
const getBKU = async (req, res) => {
  const startDate = req.query.startDate || req.query.tgl_awal || '1970-01-01';
  const endDate = req.query.endDate || req.query.tgl_akhir || '2099-12-31';
  const sumberDana = req.query.sumberDana || req.query.id_sumber_dana;
  const { page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const prevDateObj = new Date(startDate);
    let qInc, qExp, qTax, qAdjIn, qAdjOut, qSa;

    const hasSumberDana = sumberDana && sumberDana !== '' && sumberDana !== 'undefined';

    if (hasSumberDana) {
      qInc = Prisma.sql`SELECT SUM(nilai) as total FROM data_pendapatan WHERE tanggal < ${prevDateObj} AND id_sumber_dana::VARCHAR = ${sumberDana}`;
      qExp = Prisma.sql`
        SELECT SUM(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END) as total
        FROM detail_sp2d d
        JOIN data_sp2d h ON d.id_sp2d = h.id
        WHERE COALESCE(h.tanggal_pencairan, h.tanggal) < ${prevDateObj} AND d.id_sumber_dana::VARCHAR = ${sumberDana}
      `;
      qTax = Prisma.sql`
        SELECT SUM(p.nilai) as total
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE COALESCE(p.tanggal_pencairan, s.tanggal) < ${prevDateObj} AND p.id_sumber_dana::VARCHAR = ${sumberDana}
        AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
        AND (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO')
      `;
      qAdjIn = Prisma.sql`SELECT SUM(nilai) as total FROM data_penyesuaian WHERE tanggal < ${prevDateObj} AND jenis = 'MASUK' AND id_sumber_dana::VARCHAR = ${sumberDana}`;
      qAdjOut = Prisma.sql`SELECT SUM(nilai) as total FROM data_penyesuaian WHERE tanggal < ${prevDateObj} AND jenis = 'KELUAR' AND id_sumber_dana::VARCHAR = ${sumberDana}`;
      qSa = Prisma.sql`SELECT SUM(nilai) as total FROM saldo_awal WHERE id_sumber_dana::VARCHAR = ${sumberDana}`;
    } else {
      qInc = Prisma.sql`SELECT SUM(nilai) as total FROM data_pendapatan WHERE tanggal < ${prevDateObj}`;
      qExp = Prisma.sql`
        SELECT SUM(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END) as total
        FROM detail_sp2d d
        JOIN data_sp2d h ON d.id_sp2d = h.id
        WHERE COALESCE(h.tanggal_pencairan, h.tanggal) < ${prevDateObj}
      `;
      qTax = Prisma.sql`
        SELECT SUM(p.nilai) as total
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE COALESCE(p.tanggal_pencairan, s.tanggal) < ${prevDateObj}
        AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
        AND (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO')
      `;
      qAdjIn = Prisma.sql`SELECT SUM(nilai) as total FROM data_penyesuaian WHERE tanggal < ${prevDateObj} AND jenis = 'MASUK'`;
      qAdjOut = Prisma.sql`SELECT SUM(nilai) as total FROM data_penyesuaian WHERE tanggal < ${prevDateObj} AND jenis = 'KELUAR'`;
      qSa = Prisma.sql`SELECT SUM(nilai) as total FROM saldo_awal`;
    }

    const [pInc, pExp, pTax, pAdjIn, pAdjOut, pSa] = await Promise.all([
      prisma.$queryRaw(qInc),
      prisma.$queryRaw(qExp),
      prisma.$queryRaw(qTax),
      prisma.$queryRaw(qAdjIn),
      prisma.$queryRaw(qAdjOut),
      prisma.$queryRaw(qSa)
    ]);

    const saldoAwalValue = 
      Number(pSa[0].total || 0) +
      Number(pInc[0].total || 0) - 
      Number(pExp[0].total || 0) -
      Number(pTax[0].total || 0) + 
      Number(pAdjIn[0].total || 0) - 
      Number(pAdjOut[0].total || 0);

    // 2. Query Utama BKU (Gunakan $queryRaw agar UNION tetap efisien)
    // 2. Query Utama BKU (Gunakan OFFSET & LIMIT untuk performa jangka panjang)
    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    
    // Hitung total data untuk pagination
    const countQuery = Prisma.sql`
      SELECT COUNT(*) as total FROM (
        SELECT id::TEXT FROM data_pendapatan WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
        UNION ALL
        SELECT d.id::TEXT FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id WHERE COALESCE(h.tanggal_pencairan, h.tanggal) BETWEEN ${startDateObj} AND ${endDateObj}
        UNION ALL
        SELECT p.id::TEXT FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id WHERE COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) BETWEEN ${startDateObj} AND ${endDateObj} AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER') AND (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO')
        UNION ALL
        SELECT id::TEXT FROM setoran_pajak WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
        AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = nomor_bukti)
        UNION ALL
        SELECT id::TEXT FROM data_penyesuaian WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
      ) c
    `;
    const countRes = await prisma.$queryRaw(countQuery);
    const totalData = Number(countRes[0].total || 0);

    // Hitung Saldo Kumulatif SEBELUM offset saat ini (untuk Running Balance yang akurat)
    // Kita ambil semua data dari startDate sampai tepat sebelum item pertama di halaman ini
    const balanceQuery = Prisma.sql`
      WITH bku_data AS (
        SELECT p.tanggal, p.created_at, p.nilai::NUMERIC as penerimaan, 0::NUMERIC as pengeluaran FROM data_pendapatan p WHERE p.tanggal BETWEEN ${startDateObj} AND ${endDateObj}
        UNION ALL
        SELECT COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal, h.created_at, 0::NUMERIC as penerimaan, (CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END)::NUMERIC as pengeluaran FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id WHERE COALESCE(h.tanggal_pencairan, h.tanggal) BETWEEN ${startDateObj} AND ${endDateObj}
        UNION ALL
        SELECT COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, p.created_at, 0::NUMERIC as penerimaan, p.nilai::NUMERIC as pengeluaran FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id WHERE COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) BETWEEN ${startDateObj} AND ${endDateObj} AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER') AND (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO')
        UNION ALL
        SELECT tanggal, created_at, 0::NUMERIC as penerimaan, nilai::NUMERIC as pengeluaran FROM setoran_pajak WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj} AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = nomor_bukti)
        UNION ALL
        SELECT tanggal, created_at, CASE WHEN jenis = 'MASUK' THEN nilai ELSE 0 END::NUMERIC as penerimaan, CASE WHEN jenis = 'KELUAR' THEN nilai ELSE 0 END::NUMERIC as pengeluaran FROM data_penyesuaian WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
      )
      SELECT 
        SUM(penerimaan) as total_p, 
        SUM(pengeluaran) as total_k
      FROM (
        SELECT penerimaan, pengeluaran 
        FROM bku_data
        ORDER BY tanggal ASC, created_at ASC
        LIMIT ${offset}
      ) final_sub
    `;
    const balanceRes = await prisma.$queryRaw(balanceQuery);
    const pageInitialBalance = saldoAwalValue + Number(balanceRes[0]?.total_p || 0) - Number(balanceRes[0]?.total_k || 0);

    let mainQuery = Prisma.sql`
      SELECT * FROM (
        SELECT 
          p.tanggal, 
          CAST(('PND-' || p.id::VARCHAR) AS VARCHAR) as bukti, 
          CAST(p.uraian AS VARCHAR) as uraian, 
          CAST('PENERIMAAN DAERAH' AS VARCHAR) as opd, 
          CAST(p.id_sumber_dana AS VARCHAR) as id_sumber_dana, 
          CAST(COALESCE(p.nilai, 0) AS DECIMAL) as penerimaan, 
          0::DECIMAL as pengeluaran, 
          CAST('PENDAPATAN' AS VARCHAR) as tipe, 
          p.created_at, 
          CAST(p.status_rekon AS VARCHAR) as status_rekon,
          CAST(p.keterangan_rekon AS VARCHAR) as keterangan_rekon
        FROM data_pendapatan p 
        WHERE p.tanggal BETWEEN ${startDateObj} AND ${endDateObj}
        
        UNION ALL
        
        SELECT 
          COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal, 
          CAST(h.nomor AS VARCHAR) as bukti, 
          CAST(h.uraian AS VARCHAR) as uraian, 
          CAST(h.opd AS VARCHAR) as opd, 
          CAST(d.id_sumber_dana AS VARCHAR) as id_sumber_dana, 
          0::DECIMAL as penerimaan, 
          CAST(COALESCE((CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END), 0) AS DECIMAL) as pengeluaran,
          CAST('PENGELUARAN' AS VARCHAR) as tipe, 
          h.created_at, 
          CAST(h.status_rekon AS VARCHAR) as status_rekon,
          CAST(h.keterangan_rekon AS VARCHAR) as keterangan_rekon
        FROM detail_sp2d d 
        JOIN data_sp2d h ON d.id_sp2d = h.id 
        WHERE COALESCE(h.tanggal_pencairan, h.tanggal) BETWEEN ${startDateObj} AND ${endDateObj}
        
        UNION ALL
        
        SELECT 
          COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, 
          CAST(COALESCE(p.nomor_sp2d, 'BANK') AS VARCHAR) as bukti, 
          CAST(p.uraian AS VARCHAR) as uraian, 
          CAST(p.opd AS VARCHAR) as opd, 
          CAST(p.id_sumber_dana AS VARCHAR) as id_sumber_dana, 
          0::DECIMAL as penerimaan, 
          CAST(COALESCE(p.nilai, 0) AS DECIMAL) as pengeluaran, 
          CAST('POTONGAN' AS VARCHAR) as tipe, 
          p.created_at, 
          CAST(p.status_rekon AS VARCHAR) as status_rekon,
          CAST(p.keterangan_rekon AS VARCHAR) as keterangan_rekon
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) BETWEEN ${startDateObj} AND ${endDateObj}
        AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
        AND (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO')

        UNION ALL

        SELECT 
          tanggal, 
          CAST(('STP-' || id::VARCHAR) AS VARCHAR) as bukti, 
          CAST(uraian AS VARCHAR) as uraian, 
          CAST('SETORAN PAJAK' AS VARCHAR) as opd, 
          CAST(id_sumber_dana AS VARCHAR) as id_sumber_dana, 
          0::DECIMAL as penerimaan, 
          CAST(COALESCE(nilai, 0) AS DECIMAL) as pengeluaran, 
          CAST('SETORAN' AS VARCHAR) as tipe, 
          created_at, 
          CAST(status_rekon AS VARCHAR) as status_rekon,
          CAST(keterangan_rekon AS VARCHAR) as keterangan_rekon
        FROM setoran_pajak
        WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
        AND NOT EXISTS (
          SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = nomor_bukti
        )

        UNION ALL

        SELECT 
          tanggal, 
          CAST(('ADJ-' || id::VARCHAR) AS VARCHAR) as bukti, 
          CAST(uraian AS VARCHAR) as uraian, 
          CAST('PENYESUAIAN KAS' AS VARCHAR) as opd, 
          CAST(id_sumber_dana AS VARCHAR) as id_sumber_dana, 
          CASE WHEN jenis = 'MASUK' THEN CAST(COALESCE(nilai, 0) AS DECIMAL) ELSE 0::DECIMAL END as penerimaan, 
          CASE WHEN jenis = 'KELUAR' THEN CAST(COALESCE(nilai, 0) AS DECIMAL) ELSE 0::DECIMAL END as pengeluaran, 
          CAST('PENYESUAIAN' AS VARCHAR) as tipe, 
          created_at, 
          CAST('N/A' AS VARCHAR) as status_rekon,
          CAST(NULL AS VARCHAR) as keterangan_rekon
        FROM data_penyesuaian 
        WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
      ) combined
      WHERE 1=1
      ${hasSumberDana ? Prisma.sql`AND id_sumber_dana::VARCHAR = ${sumberDana}` : Prisma.empty}
      ORDER BY tanggal ASC, created_at ASC
      LIMIT ${parseInt(limit)} OFFSET ${offset}
    `;

    const pageTransactions = await prisma.$queryRaw(mainQuery);

    // Hitung total global (untuk summary di header) tetap harus hitung seluruh periode
    const summaryQuery = Prisma.sql`
      SELECT SUM(penerimaan) as total_p, SUM(pengeluaran) as total_k FROM (
        SELECT nilai::NUMERIC as penerimaan, 0::NUMERIC as pengeluaran FROM data_pendapatan WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
        UNION ALL
        SELECT 0::NUMERIC as penerimaan, (CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END)::NUMERIC as pengeluaran FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id WHERE COALESCE(h.tanggal_pencairan, h.tanggal) BETWEEN ${startDateObj} AND ${endDateObj}
        UNION ALL
        SELECT 0::NUMERIC as penerimaan, p2.nilai::NUMERIC as pengeluaran FROM data_sp2d_potongan p2 LEFT JOIN data_sp2d s2 ON p2.id_sp2d = s2.id WHERE COALESCE(p2.tanggal_pencairan, s2.tanggal_pencairan, s2.tanggal) BETWEEN ${startDateObj} AND ${endDateObj} AND (p2.keterangan IS NULL OR p2.keterangan != 'AUTO_HEADER') AND (s2.id IS NULL OR s2.status_rekon != 'SUDAH_BRUTO')
        UNION ALL
        SELECT 0::NUMERIC as penerimaan, nilai::NUMERIC as pengeluaran FROM setoran_pajak WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj} AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = nomor_bukti)
        UNION ALL
        SELECT CASE WHEN jenis = 'MASUK' THEN nilai ELSE 0 END::NUMERIC as penerimaan, CASE WHEN jenis = 'KELUAR' THEN nilai ELSE 0 END::NUMERIC as pengeluaran FROM data_penyesuaian WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
      ) s
    `;
    const summaryRes = await prisma.$queryRaw(summaryQuery);
    const totalPenerimaan = Number(summaryRes[0]?.total_p || 0);
    const totalPengeluaran = Number(summaryRes[0]?.total_k || 0);

    let runningBalance = pageInitialBalance;
    const processedTransactions = pageTransactions.map((tx, idx) => {
      const p = Number(tx.penerimaan || 0);
      const k = Number(tx.pengeluaran || 0);
      runningBalance += (p - k);
      
      let cleanUraian = String(tx.uraian || '').trim();
      const auditTags = [/\[BELUM COCOK\]:?\s?/gi, /\[Rekon\]:?\s?/gi, /!!!\s?HIGH\s?ANOMALI:?\s?/gi, /!!!\s?ANOMALI:?\s?/gi, /\[PENYESUAIAN\s?BRUTO\]:?\s?/gi];
      auditTags.forEach(tag => cleanUraian = cleanUraian.replace(tag, ''));

      return { ...tx, uraian: cleanUraian.trim() || tx.uraian, penerimaan: p, pengeluaran: k, saldo: runningBalance };
    });

    res.json({
      data: offset === 0 ? [{
        tanggal: startDate,
        bukti: '-',
        uraian: 'SALDO AWAL PERIODE',
        opd: '-',
        id_sumber_dana: sumberDana || 'SEMUA',
        penerimaan: 0,
        pengeluaran: 0,
        saldo: saldoAwalValue,
        tipe: 'SALDO_AWAL'
      }, ...processedTransactions] : processedTransactions,
      summary: { saldoAwal: saldoAwalValue, totalPenerimaan, totalPengeluaran, saldoAkhir: saldoAwalValue + totalPenerimaan - totalPengeluaran },
      pagination: { totalData, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(totalData / parseInt(limit)) }
    });

  } catch (err) {
    console.error('CRITICAL ERROR BKU:', err);
    res.status(500).json({ 
      message: 'Error generating BKU', 
      error: err.message,
      detail: err.toString(),
      stack: err.stack 
    });
  }
};

/**
 * Mendapatkan Statistik Dashboard (Ringkasan Kas Efektif)
 */
const getDashboardStats = async (req, res) => {
  const { tahun } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();

  try {
    const statsResult = await prisma.$queryRaw`
      SELECT 
        s.id, s.nama, s.kategori,
        COALESCE((SELECT SUM(nilai) FROM data_pendapatan WHERE id_sumber_dana = s.id AND tahun = ${targetTahun}), 0) as total_masuk,
        COALESCE((SELECT SUM(d.nilai_bruto) FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id WHERE d.id_sumber_dana = s.id AND EXTRACT(YEAR FROM COALESCE(h.tanggal_pencairan, h.tanggal)) = ${targetTahun}), 0) as total_keluar_bruto,
        COALESCE((SELECT SUM(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END) FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id WHERE d.id_sumber_dana = s.id AND EXTRACT(YEAR FROM COALESCE(h.tanggal_pencairan, h.tanggal)) = ${targetTahun}), 0) as total_keluar_netto,
        COALESCE((SELECT SUM(nilai) FROM jurnal_talangan WHERE id_sumber_talangan = s.id AND status = 'BELUM'), 0) as talangan_diberikan,
        COALESCE((SELECT nilai FROM saldo_awal WHERE id_sumber_dana = s.id AND tahun = ${targetTahun}), 0) as saldo_awal
      FROM master_sumber_dana s
    `;
    
    const stats = statsResult.map(row => {
      const saldo_buku = Number(row.saldo_awal || 0) + Number(row.total_masuk || 0) - Number(row.total_keluar_netto || 0);
      const kas_efektif = saldo_buku - Number(row.talangan_diberikan || 0);
      return {
        ...row,
        total_keluar: Number(row.total_keluar_bruto),
        total_keluar_bruto: Number(row.total_keluar_bruto),
        total_keluar_netto: Number(row.total_keluar_netto),
        saldo_buku,
        kas_efektif
      };
    });

    // Pagu Query
    const paguRes = await prisma.$queryRaw`
      WITH best_pagu AS (
        SELECT DISTINCT ON (opd, id_sumber_dana) opd, id_sumber_dana, nilai, jenis
        FROM master_pagu 
        WHERE tahun = ${targetTahun} 
        ORDER BY opd, id_sumber_dana, CASE WHEN jenis = 'PERUBAHAN' THEN 1 ELSE 2 END
      )
      SELECT 
        CASE 
          WHEN EXISTS (SELECT 1 FROM best_pagu WHERE opd = 'APBD KESELURUHAN') 
          THEN (SELECT SUM(nilai) FROM best_pagu WHERE opd = 'APBD KESELURUHAN')
          ELSE (SELECT SUM(nilai) FROM best_pagu WHERE opd != 'APBD KESELURUHAN')
        END as total
    `;
    const totalPagu = Number(paguRes[0].total || 0);

    const outstandingTalanganCount = await prisma.jurnal_talangan.count({ where: { status: 'BELUM' } });

    const taxRes = await prisma.$queryRaw`
      SELECT 
        (SELECT COUNT(*) FROM data_sp2d WHERE nilai_potongan > 0 AND tahun = ${targetTahun}) as total_dokumen_pajak,
        (SELECT COALESCE(SUM(nilai_potongan), 0) FROM data_sp2d WHERE tahun = ${targetTahun}) as total_potongan,
        (SELECT COALESCE(SUM(nilai), 0) FROM (
          SELECT nilai FROM setoran_pajak WHERE EXTRACT(YEAR FROM tanggal) = ${targetTahun}
          UNION ALL
          SELECT nilai FROM data_sp2d_potongan WHERE EXTRACT(YEAR FROM tanggal_pencairan) = ${targetTahun}
        ) remitted) as total_setoran
    `;
    const taxData = taxRes[0];
    const outstandingTaxValue = Number(taxData.total_potongan) - Number(taxData.total_setoran);
    
    const remittedCountRes = await prisma.$queryRaw`
      SELECT COUNT(*) FROM (
        SELECT id::TEXT FROM setoran_pajak WHERE EXTRACT(YEAR FROM tanggal) = ${targetTahun}
        UNION ALL
        SELECT id::TEXT FROM data_sp2d_potongan WHERE EXTRACT(YEAR FROM tanggal_pencairan) = ${targetTahun}
      ) combined
    `;
    const totalRemittedCount = Number(remittedCountRes[0].count || 0);
    const lateTaxCount = outstandingTaxValue > 1000 ? Math.max(0, Number(taxData.total_dokumen_pajak) - totalRemittedCount) : 0;

    const totalPendapatan = stats.reduce((acc, s) => acc + Number(s.total_masuk || 0), 0);
    const totalSaldoAwal = stats.reduce((acc, s) => acc + Number(s.saldo_awal || 0), 0);
    const totalPengeluaran = stats.reduce((acc, s) => acc + Number(s.total_keluar_bruto || 0), 0);
    const totalKasFisik = stats.reduce((acc, s) => acc + Number(s.saldo_buku || 0), 0);
    const totalTalangan = stats.reduce((acc, s) => acc + Number(s.talangan_diberikan || 0), 0);
    const kasEfektif = totalKasFisik - totalTalangan;
    
    const totalKetersediaan = totalSaldoAwal + totalPendapatan;
    const totalPaguSafe = totalPagu || 1;
    
    const paguTypeRes = await prisma.master_pagu.findFirst({
      where: { tahun: targetTahun },
      orderBy: { jenis: 'asc' } // Logic: PERUBAHAN usually comes after MURNI
    });

    const lastUpdatePendapatan = await prisma.data_pendapatan.findFirst({
      where: { tahun: targetTahun },
      orderBy: { tanggal: 'desc' },
      select: { tanggal: true }
    });

    const lastUpdateSp2d = await prisma.data_sp2d.findFirst({
      where: { tahun: targetTahun },
      orderBy: { tanggal_pencairan: 'desc' },
      select: { tanggal_pencairan: true }
    });

    res.json({
      summary: {
        totalPagu,
        totalPendapatan,
        totalSaldoAwal,
        totalPengeluaran,
        totalKetersediaan,
        totalKasFisik,
        totalTalangan,
        kasEfektif,
        realisasiPersen: (totalPendapatan / totalPaguSafe) * 100,
        ketersediaanPersen: (totalKetersediaan / totalPaguSafe) * 100,
        silpaPersen: (totalSaldoAwal / totalPaguSafe) * 100,
        belanjaPersen: (totalPengeluaran / totalPaguSafe) * 100,
        jenisPagu: paguTypeRes?.jenis || 'MURNI',
        lateTaxCount: Math.max(0, lateTaxCount),
        outstandingTalanganCount,
        outstandingTaxValue,
        lastUpdatePendapatan: lastUpdatePendapatan?.tanggal || null,
        lastUpdateSp2d: lastUpdateSp2d?.tanggal_pencairan || null
      },
      stats
    });
  } catch (err) {
    console.error('ERROR in getDashboardStats:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Mendapatkan Analisis Pengeluaran SP2D
 */
const getSp2dAnalytics = async (req, res) => {
  const { tahun } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();

  try {
    const summary = await prisma.data_sp2d.aggregate({
      where: { tahun: targetTahun },
      _count: { id: true },
      _sum: { nilai_bruto: true }
    });

    const monthCount = await prisma.data_sp2d.count({
      where: { 
        tahun: targetTahun,
        tanggal_pencairan: {
          gte: new Date(targetTahun, new Date().getMonth(), 1),
          lte: new Date(targetTahun, new Date().getMonth() + 1, 0)
        }
      }
    });

    const masterJenis = await prisma.master_jenis_belanja.findMany({
      orderBy: { urutan: 'asc' }
    });

    const trends = await prisma.$queryRaw`
      SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal)) as bulan, jenis, SUM(nilai_bruto) as total
      FROM data_sp2d WHERE tahun = ${targetTahun}
      GROUP BY bulan, jenis ORDER BY bulan ASC
    `;

    const opdStats = await prisma.data_sp2d.groupBy({
      by: ['opd'],
      where: { tahun: targetTahun },
      _count: { id: true },
      _sum: { nilai_bruto: true },
      orderBy: { _sum: { nilai_bruto: 'desc' } }
    });

    const opdDetails = await prisma.data_sp2d.groupBy({
      by: ['opd', 'jenis'],
      where: { tahun: targetTahun },
      _count: { id: true },
      _sum: { nilai_bruto: true },
      orderBy: [{ opd: 'asc' }, { _sum: { nilai_bruto: 'desc' } }]
    });

    const recentTransactions = await prisma.data_sp2d.findMany({
      where: { tahun: targetTahun },
      select: { nomor: true, tanggal: true, opd: true, uraian: true, nilai_bruto: true, jenis: true },
      orderBy: { tanggal: 'desc' },
      take: 10
    });

    res.json({
      summary: {
        total_dokumen: summary._count.id,
        total_bruto: Number(summary._sum.nilai_bruto || 0),
        dokumen_bulan_ini: monthCount
      },
      masterJenis: masterJenis.map(j => j.nama),
      trends,
      opdStats: opdStats.map(s => ({ opd: s.opd, jml_dokumen: s._count.id, total_nilai: Number(s._sum.nilai_bruto || 0) })),
      opdDetails: opdDetails.map(d => ({ opd: d.opd, jenis: d.jenis, jml_dokumen: d._count.id, total_nilai: Number(d._sum.nilai_bruto || 0) })),
      recentTransactions
    });
  } catch (err) {
    console.error('ERROR in getSp2dAnalytics:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Mendapatkan Buku Pembantu Pajak
 */
const getTaxMonitoring = async (req, res) => {
  const { startDate, endDate } = req.query;
  const filter = (startDate && endDate) ? Prisma.sql`WHERE tanggal BETWEEN ${new Date(startDate)} AND ${new Date(endDate)}` : Prisma.empty;

  try {
    const result = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT id::VARCHAR as original_id, tanggal::DATE, nomor::VARCHAR as bukti, 
               uraian::VARCHAR as keterangan, NULL::VARCHAR as id_sumber_dana,
               'COLLECTED'::VARCHAR as tipe, nilai_potongan::NUMERIC as nilai,
               keterangan_rekon
        FROM data_sp2d WHERE nilai_potongan > 0
        ${(startDate && endDate) ? Prisma.sql`AND tanggal BETWEEN ${new Date(startDate)} AND ${new Date(endDate)}` : Prisma.empty}

        UNION ALL

        SELECT id::VARCHAR as original_id, tanggal::DATE, nomor_bukti::VARCHAR as bukti, uraian::VARCHAR as keterangan, 
               id_sumber_dana::VARCHAR, 'REMITTED'::VARCHAR as tipe, nilai::NUMERIC as nilai,
               keterangan_rekon
        FROM setoran_pajak ${filter}

        UNION ALL

        SELECT id::VARCHAR as original_id, tanggal_pencairan::DATE as tanggal, nomor_sp2d::VARCHAR as bukti, uraian::VARCHAR as keterangan, 
               id_sumber_dana::VARCHAR, 'REMITTED'::VARCHAR as tipe, nilai::NUMERIC as nilai,
               keterangan_rekon
        FROM data_sp2d_potongan
        ${(startDate && endDate) ? Prisma.sql`WHERE tanggal_pencairan BETWEEN ${new Date(startDate)} AND ${new Date(endDate)}` : Prisma.empty}
      ) combined
      ORDER BY tanggal ASC
    `;
    
    const prevDateObj = new Date(startDate);
    const prevCollectedRes = await prisma.$queryRaw`
      SELECT SUM(nilai_potongan) as total FROM data_sp2d WHERE nilai_potongan > 0 AND tanggal < ${prevDateObj}
    `;
    const prevRemittedSp2dRes = await prisma.$queryRaw`
      SELECT SUM(nilai) as total FROM data_sp2d_potongan WHERE tanggal_pencairan < ${prevDateObj}
    `;
    const prevRemittedSetoranRes = await prisma.$queryRaw`
      SELECT SUM(nilai) as total FROM setoran_pajak WHERE tanggal < ${prevDateObj}
    `;
    
    const saldoAwalTax = Number(prevCollectedRes[0]?.total || 0) - 
                         Number(prevRemittedSp2dRes[0]?.total || 0) - 
                         Number(prevRemittedSetoranRes[0]?.total || 0);

    let totalCollected = 0;
    let totalRemitted = 0;
    let runningSaldo = saldoAwalTax;
    
    const bkuDataInitial = [{
      tanggal: startDate,
      bukti: '-',
      keterangan: 'SALDO AWAL KEWAJIBAN PAJAK',
      tipe: 'SALDO_AWAL',
      nilai: 0,
      saldo: saldoAwalTax
    }];

    const processedItems = result.map(row => {
      const val = Number(row.nilai);
      if (row.tipe === 'COLLECTED') {
         totalCollected += val;
         runningSaldo += val;
      } else {
         totalRemitted += val;
         runningSaldo -= val;
      }
      return { ...row, nilai: val, saldo: runningSaldo };
    });

    res.json({
      data: [...bkuDataInitial, ...processedItems],
      summary: { totalCollected, totalRemitted, outstandingTax: runningSaldo }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Mendapatkan Buku Besar / Jurnal Umum
 */
const getGeneralLedger = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  try {
    const [data, total] = await Promise.all([
      prisma.jurnal_umum.findMany({ 
        orderBy: [{ tanggal: 'asc' }, { id: 'asc' }],
        skip,
        take
      }),
      prisma.jurnal_umum.count()
    ]);
    
    res.json({ 
      data,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / take)
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};


/**
 * Mendapatkan Monitoring Dana Talangan
 */
const getBailoutMonitoring = async (req, res) => {
  const { page = 1, limit = 10, search = '' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  try {
    const where = search ? {
      OR: [
        { no_referensi: { contains: search, mode: 'insensitive' } },
        { keterangan: { contains: search, mode: 'insensitive' } }
      ]
    } : {};

    const [data, total] = await Promise.all([
      prisma.jurnal_talangan.findMany({
        where,
        include: {
          sumber_talangan: { select: { nama: true } },
          sumber_asli: { select: { nama: true } }
        },
        orderBy: { tanggal: 'desc' },
        skip,
        take
      }),
      prisma.jurnal_talangan.count({ where })
    ]);

    // Fetch OPD names in bulk to avoid N+1 queries
    const refs = data.filter(t => t.no_referensi).map(t => t.no_referensi);
    const sp2ds = refs.length > 0 ? await prisma.data_sp2d.findMany({
      where: { nomor: { in: refs } },
      select: { nomor: true, opd: true }
    }) : [];

    const opdMap = sp2ds.reduce((acc, s) => {
      acc[s.nomor] = s.opd;
      return acc;
    }, {});

    const results = data.map(t => ({
      ...t,
      sumber_talangan: t.sumber_talangan?.nama,
      sumber_asli: t.sumber_asli?.nama,
      opd: t.no_referensi ? opdMap[t.no_referensi] || 'INPUT MANUAL' : 'INPUT MANUAL',
      nilai: Number(t.nilai)
    }));

    // Aggregate summary (optionally filter by tahun if needed, here we sum everything for monitoring)
    const aggregate = await prisma.jurnal_talangan.aggregate({
      _sum: { nilai: true }
    });
    
    const settledRes = await prisma.jurnal_talangan.aggregate({
      where: { status: 'SELESAI' },
      _sum: { nilai: true }
    });

    const total_diberikan = Number(aggregate._sum.nilai || 0);
    const total_dikembalikan = Number(settledRes._sum.nilai || 0);

    res.json({
      data: results,
      pagination: {
        totalData: total,
        page: parseInt(page),
        limit: take,
        totalPages: Math.ceil(total / take)
      },
      summary: { 
        total_diberikan, 
        total_dikembalikan, 
        outstanding: Math.max(0, total_diberikan - total_dikembalikan) 
      }
    });
  } catch (err) {
    console.error('ERROR in getBailoutMonitoring:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Mendapatkan Buku Pembantu Bank
 */
const getBankLedger = async (req, res) => {
  if (!req.query.sumberDana && !req.query.id_sumber_dana) {
    return res.status(400).json({ message: 'ID Sumber Dana (Bank) harus ditentukan' });
  }
  return getBKU(req, res);
};

/**
 * Mendapatkan Buku Pembantu Per OPD
 */
const getOpdLedger = async (req, res) => {
  const { opd, tahun } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();

  if (!opd) return res.status(400).json({ message: 'Nama OPD harus ditentukan' });

  try {
    const pagu = await prisma.$queryRaw`
      WITH best_pagu AS (
        SELECT DISTINCT ON (opd, id_sumber_dana) opd, id_sumber_dana, nilai, jenis
        FROM master_pagu 
        WHERE opd = ${opd} AND tahun = ${targetTahun} 
        ORDER BY opd, id_sumber_dana, CASE WHEN jenis = 'PERUBAHAN' THEN 1 ELSE 2 END
      )
      SELECT SUM(nilai) as total FROM best_pagu
    `;
    const totalPagu = Number(pagu[0]?.total || 0);

    const trans = await prisma.data_sp2d.findMany({
      where: { opd, tahun: targetTahun },
      orderBy: [{ tanggal: 'asc' }, { id: 'asc' }]
    });
    
    let runningTotal = 0;
    const transactions = trans.map(row => {
      const bruto = Number(row.nilai_bruto);
      runningTotal += bruto;
      return {
        ...row,
        bukti: row.nomor,
        nilai_bruto: bruto,
        nilai_potongan: Number(row.nilai_potongan),
        nilai_neto: Number(row.nilai_neto),
        realisasi_kumulatif: runningTotal,
        sisa_pagu: totalPagu - runningTotal
      };
    });

    res.json({
      summary: {
        totalPagu,
        totalRealisasi: runningTotal,
        sisaPagu: totalPagu - runningTotal,
        persentase: totalPagu > 0 ? (runningTotal / totalPagu) * 100 : 0
      },
      data: transactions
    });
  } catch (err) {
    res.status(500).json({ message: 'Error generating OPD Ledger', error: err.message });
  }
};

/**
 * Mendapatkan Ringkasan Potongan per OPD
 */
const getOpdTaxSummary = async (req, res) => {
  const { tahun, bulan } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();
  const targetBulan = bulan && bulan !== '0' ? parseInt(bulan) : null;

  try {
    const data = await prisma.$queryRaw`
      WITH collected AS (
        SELECT COALESCE(NULLIF(UPPER(TRIM(opd)), ''), 'TANPA OPD') as opd_name, SUM(nilai_potongan) as total_dipungut
        FROM data_sp2d 
        WHERE tahun = ${targetTahun} 
        ${targetBulan ? Prisma.sql`AND EXTRACT(MONTH FROM tanggal) = ${targetBulan}` : Prisma.empty}
        AND nilai_potongan > 0
        GROUP BY 1
      ),
      remitted AS (
        SELECT COALESCE(NULLIF(UPPER(TRIM(opd)), ''), 'TANPA OPD') as opd_name, SUM(nilai) as total_disetor
        FROM (
          SELECT opd, nilai, tanggal_pencairan as tanggal FROM data_sp2d_potongan
          WHERE EXTRACT(YEAR FROM tanggal_pencairan) = ${targetTahun}
          ${targetBulan ? Prisma.sql`AND EXTRACT(MONTH FROM tanggal_pencairan) = ${targetBulan}` : Prisma.empty}
          UNION ALL
          SELECT opd, nilai, tanggal FROM setoran_pajak
          WHERE EXTRACT(YEAR FROM tanggal) = ${targetTahun}
          ${targetBulan ? Prisma.sql`AND EXTRACT(MONTH FROM tanggal) = ${targetBulan}` : Prisma.empty}
        ) combined GROUP BY 1
      )
      SELECT COALESCE(c.opd_name, r.opd_name) as opd, COALESCE(c.total_dipungut, 0) as dipungut,
             COALESCE(r.total_disetor, 0) as disetor, (COALESCE(c.total_dipungut, 0) - COALESCE(r.total_disetor, 0)) as utang
      FROM collected c FULL OUTER JOIN remitted r ON c.opd_name = r.opd_name
      ORDER BY utang DESC, dipungut DESC
    `;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching OPD tax summary', error: err.message });
  }
};

/**
 * Mendapatkan Analitik Pajak Bulanan
 */
const getMonthlyTaxAnalytics = async (req, res) => {
  const { tahun } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();

  try {
    const global = await prisma.$queryRaw`
      WITH monthly_collected AS (
        SELECT EXTRACT(MONTH FROM tanggal) as bulan, SUM(nilai_potongan) as dipungut FROM data_sp2d WHERE tahun = ${targetTahun} GROUP BY 1
      ),
      monthly_remitted AS (
        SELECT EXTRACT(MONTH FROM tanggal) as bulan, SUM(nilai) as disetor FROM (
          SELECT tanggal_pencairan as tanggal, nilai FROM data_sp2d_potongan WHERE EXTRACT(YEAR FROM tanggal_pencairan) = ${targetTahun}
          UNION ALL
          SELECT tanggal, nilai FROM setoran_pajak WHERE EXTRACT(YEAR FROM tanggal) = ${targetTahun}
        ) combined GROUP BY 1
      )
      SELECT m.bulan, COALESCE(c.dipungut, 0) as dipungut, COALESCE(r.disetor, 0) as disetor
      FROM (SELECT generate_series(1,12) as bulan) m
      LEFT JOIN monthly_collected c ON m.bulan = c.bulan LEFT JOIN monthly_remitted r ON m.bulan = r.bulan ORDER BY 1
    `;

    const opd_breakdown = await prisma.$queryRaw`
      SELECT COALESCE(NULLIF(UPPER(TRIM(opd)), ''), 'TANPA OPD') as opd_name, EXTRACT(MONTH FROM tanggal) as bulan, SUM(nilai) as nilai
      FROM (
        SELECT opd, tanggal_pencairan as tanggal, nilai FROM data_sp2d_potongan WHERE EXTRACT(YEAR FROM tanggal_pencairan) = ${targetTahun}
        UNION ALL
        SELECT opd, tanggal, nilai FROM setoran_pajak WHERE EXTRACT(YEAR FROM tanggal) = ${targetTahun}
      ) combined GROUP BY 1, 2 ORDER BY 1, 2
    `;

    res.json({ global, opd_breakdown });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching monthly tax analytics', error: err.message });
  }
};

/**
 * Mendapatkan BKU Rister
 */
const getBKURister = async (req, res) => {
  const { bulan, tahun } = req.query;
  const targetBulan = parseInt(bulan);
  const targetTahun = parseInt(tahun) || new Date().getFullYear();

  try {
    const data = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT p.id::VARCHAR as id, p.tanggal_pencairan::DATE as tanggal, COALESCE(NULLIF(p.nomor_sp2d, ''), NULLIF(s.nomor, ''), 'NON-SP2D')::VARCHAR as bukti,
               COALESCE(NULLIF(p.opd, ''), NULLIF(s.opd, ''), 'TANPA OPD')::VARCHAR as opd, COALESCE(p.uraian, p.keterangan, s.uraian)::TEXT as uraian,
               p.nilai::NUMERIC as nilai, 'POTONGAN_BANK'::VARCHAR as tipe, p.id_sumber_dana::VARCHAR as id_sumber_dana,
               p.id_sp2d::VARCHAR as id_sp2d, p.jenis_potongan::VARCHAR as jenis_pajak
        FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        UNION ALL
        SELECT id::VARCHAR as id, tanggal::DATE as tanggal, nomor_bukti::VARCHAR as bukti, opd::VARCHAR as opd, uraian::TEXT as uraian,
               nilai::NUMERIC as nilai, 'INPUT_MANUAL'::VARCHAR as tipe, id_sumber_dana::VARCHAR as id_sumber_dana,
               NULL::VARCHAR as id_sp2d, jenis_pajak::VARCHAR as jenis_pajak FROM setoran_pajak
      ) combined
      WHERE 1=1
      ${targetBulan ? Prisma.sql`AND EXTRACT(MONTH FROM tanggal) = ${targetBulan}` : Prisma.empty}
      AND EXTRACT(YEAR FROM tanggal) = ${targetTahun}
      ORDER BY tanggal ASC, id ASC
    `;
    const totalDisetor = data.reduce((acc, row) => acc + Number(row.nilai), 0);
    
    // Fetch total withholding for the same period
    const totalDipungutRes = await prisma.$queryRaw`
      SELECT SUM(nilai_potongan) as total FROM data_sp2d
      WHERE tahun = ${targetTahun}
      ${targetBulan ? Prisma.sql`AND EXTRACT(MONTH FROM tanggal) = ${targetBulan}` : Prisma.empty}
      AND nilai_potongan > 0
    `;
    const totalDipungut = Number(totalDipungutRes[0].total || 0);

    res.json({ 
      data,
      summary: {
        totalPenerimaan: totalDipungut,
        totalPengeluaran: totalDisetor
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error fetching BKURister', error: err.message });
  }
};


module.exports = {
  getBKU,
  getDashboardStats,
  getSp2dAnalytics,
  getTaxMonitoring,
  getGeneralLedger,
  getBailoutMonitoring,
  getBankLedger,
  getOpdLedger,
  getOpdTaxSummary,
  getMonthlyTaxAnalytics,
  getBKURister
};
