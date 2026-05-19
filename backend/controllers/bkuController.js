const prisma = require('../prismaClient');

/**
 * Controller untuk Buku Kas Umum (BKU)
 * Mengagregasikan data dari Pendapatan, SP2D, dan Penyesuaian
 */
const getBku = async (req, res) => {
  const { startDate, endDate, sumberDana, page = 1, limit = 100 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const sDate = startDate || '1970-01-01';
  const eDate = endDate || '2099-12-31';

  try {
    // 1. Hitung Saldo Awal (Sebelum startDate)
    const sdFilter = sumberDana ? prisma.sql`AND id_sumber_dana = ${sumberDana}` : prisma.empty;
    const sdFilterSp2d = sumberDana ? prisma.sql`AND d.id_sumber_dana = ${sumberDana}` : prisma.empty;

    const [pInc, pExp, pPot, pAdjIn, pAdjOut, pSa, pSjk] = await Promise.all([
      prisma.$queryRaw`SELECT SUM(nilai) as total FROM data_pendapatan WHERE tanggal < ${new Date(sDate)} ${sdFilter}`,
      prisma.$queryRaw`
        SELECT SUM(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END) as total
        FROM detail_sp2d d
        JOIN data_sp2d h ON d.id_sp2d = h.id
        WHERE COALESCE(h.tanggal_pencairan, h.tanggal) < ${new Date(sDate)} ${sdFilterSp2d}
      `,
      prisma.$queryRaw`SELECT SUM(p.nilai) as total FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id WHERE p.tanggal_pencairan < ${new Date(sDate)} AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER') AND (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO') ${sdFilter}`,
      prisma.$queryRaw`SELECT SUM(nilai) as total FROM data_penyesuaian WHERE tanggal < ${new Date(sDate)} AND jenis = 'MASUK' ${sdFilter}`,
      prisma.$queryRaw`SELECT SUM(nilai) as total FROM data_penyesuaian WHERE tanggal < ${new Date(sDate)} AND jenis = 'KELUAR' ${sdFilter}`,
      prisma.$queryRaw`SELECT SUM(nilai) as total FROM saldo_awal WHERE 1=1 ${sdFilter}`,
      prisma.$queryRaw`
        SELECT SUM(s.nilai) as total FROM setoran_pajak s
        WHERE s.tanggal < ${new Date(sDate)}
        AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
        ${sdFilter}
      `
    ]);

    const saldoAwalValue =
      Number(pSa[0].total || 0) +
      Number(pInc[0].total || 0) -
      Number(pExp[0].total || 0) -
      Number(pPot[0].total || 0) +
      Number(pAdjIn[0].total || 0) -
      Number(pAdjOut[0].total || 0) -
      Number(pSjk[0].total || 0);

    // 2. Ambil Transaksi Periode Berjalan
    const allTransactions = await prisma.$queryRaw`
      SELECT * FROM (
        -- PENDAPATAN
        SELECT 
          tanggal, 'PND-' || id as bukti, uraian, 'PENERIMAAN DAERAH' as opd, 
          id_sumber_dana, nilai as penerimaan, 0 as pengeluaran, 'PENDAPATAN' as tipe,
          status_rekon
        FROM data_pendapatan
        WHERE tanggal BETWEEN ${new Date(sDate)} AND ${new Date(eDate)}

        UNION ALL

        -- SP2D (NETO DINAMIS - Memastikan Saldo Tetap Bruto)
        SELECT 
          COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal, h.nomor as bukti, h.uraian, h.opd, d.id_sumber_dana,
          0 as penerimaan,
          (CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END) as pengeluaran,
          'SP2D_NETO' as tipe,
          h.status_rekon
        FROM detail_sp2d d
        JOIN data_sp2d h ON d.id_sp2d = h.id
        WHERE COALESCE(h.tanggal_pencairan, h.tanggal) BETWEEN ${new Date(sDate)} AND ${new Date(eDate)}

        UNION ALL

        -- RINCIAN POTONGAN (Sesuai Memory Point 5)
        SELECT
          p.tanggal_pencairan as tanggal, p.nomor_sp2d as bukti, p.uraian, 'POTONGAN SP2D' as opd,
          p.id_sumber_dana, 0 as penerimaan, p.nilai as pengeluaran, 'POTONGAN' as tipe,
          p.status_rekon
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE p.tanggal_pencairan BETWEEN ${new Date(sDate)} AND ${new Date(eDate)}
        AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
        AND (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO')

        UNION ALL

        -- SETORAN PAJAK (Abaikan jika rincian sudah ada - Point 6)
        SELECT 
          s.tanggal, s.nomor_bukti as bukti, s.uraian, 'SETORAN PAJAK' as opd,
          s.id_sumber_dana, 0 as penerimaan, s.nilai as pengeluaran, 'SETORAN' as tipe,
          s.status_rekon
        FROM setoran_pajak s
        WHERE s.tanggal BETWEEN ${new Date(sDate)} AND ${new Date(eDate)}
        AND NOT EXISTS (
          SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti
        )

        UNION ALL

        -- PENYESUAIAN
        SELECT 
          tanggal, 'ADJ-' || id as bukti, uraian, 'PENYESUAIAN KAS' as opd, 
          id_sumber_dana, CASE WHEN jenis = 'MASUK' THEN nilai ELSE 0 END as penerimaan, 
          CASE WHEN jenis = 'KELUAR' THEN nilai ELSE 0 END as pengeluaran, 'PENYESUAIAN' as tipe,
          'SUDAH' as status_rekon
        FROM data_penyesuaian
        WHERE tanggal BETWEEN ${new Date(sDate)} AND ${new Date(eDate)}
      ) combined
      WHERE 1=1 ${sumberDana ? prisma.sql`AND id_sumber_dana = ${sumberDana}` : prisma.empty}
      ORDER BY tanggal ASC, bukti ASC
    `;

    // 3. Kalkulasi Running Balance
    let runningBalance = saldoAwalValue;
    const bkuDataInitial = [{
      tanggal: sDate,
      bukti: '-',
      uraian: 'SALDO AWAL PERIODE',
      opd: '-',
      id_sumber_dana: sumberDana || 'SEMUA',
      penerimaan: 0,
      pengeluaran: 0,
      saldo: saldoAwalValue,
      tipe: 'SALDO_AWAL'
    }];

    let totalPenerimaan = 0;
    let totalPengeluaran = 0;

    const processedTransactions = allTransactions.map(tx => {
      const p = Number(tx.penerimaan);
      const k = Number(tx.pengeluaran);
      totalPenerimaan += p;
      totalPengeluaran += k;
      runningBalance += (p - k);
      return { ...tx, penerimaan: p, pengeluaran: k, saldo: runningBalance };
    });

    const fullData = [...bkuDataInitial, ...processedTransactions];
    const paginatedData = fullData.slice(offset, offset + parseInt(limit));

    res.json({
      data: paginatedData,
      summary: { saldoAwal: saldoAwalValue, totalPenerimaan, totalPengeluaran, saldoAkhir: runningBalance },
      pagination: { totalData: fullData.length, page: parseInt(page), totalPages: Math.ceil(fullData.length / parseInt(limit)) }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error generating BKU', error: err.message });
  }
};

module.exports = { getBku };
