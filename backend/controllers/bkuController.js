const prisma = require('../prismaClient');
const { Prisma } = require('@prisma/client');

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
    const sdFilter = sumberDana ? Prisma.sql`AND id_sumber_dana = ${sumberDana}` : Prisma.empty;
    const sdFilterSp2d = sumberDana ? Prisma.sql`AND d.id_sumber_dana = ${sumberDana}` : Prisma.empty;

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
        AND NOT EXISTS (SELECT 1 FROM data_sp2d hx WHERE TRIM(hx.nomor) = TRIM(s.nomor_bukti))
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
          tanggal, COALESCE(NULLIF(TRIM(nomor_bukti), ''), 'PND-' || id) as bukti, uraian, 'PENERIMAAN DAERAH' as opd,
          NULL::VARCHAR as uraian_induk,
          id_sumber_dana, nilai as penerimaan, 0 as pengeluaran, 'PENDAPATAN' as tipe,
          status_rekon
        FROM data_pendapatan
        WHERE tanggal BETWEEN ${new Date(sDate)} AND ${new Date(eDate)}

        UNION ALL

        -- SP2D (NETO DINAMIS - Memastikan Saldo Tetap Bruto)
        SELECT 
          COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal, h.nomor as bukti, h.uraian, h.opd,
          NULL::VARCHAR as uraian_induk,
          d.id_sumber_dana,
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
          p.tanggal_pencairan as tanggal,
          COALESCE(NULLIF(TRIM(s.nomor), ''), NULLIF(TRIM(p.nomor_sp2d), ''), '(TANPA NOMOR)') as bukti,
          p.uraian, 'POTONGAN SP2D' as opd,
          CASE WHEN s.id IS NOT NULL AND COALESCE(TRIM(s.uraian), '') <> ''
               THEN TRIM(s.uraian)
          END as uraian_induk,
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
          CASE WHEN sh.id IS NOT NULL AND COALESCE(TRIM(sh.uraian), '') <> ''
               THEN TRIM(sh.uraian)
          END as uraian_induk,
          s.id_sumber_dana, 0 as penerimaan, s.nilai as pengeluaran, 'SETORAN' as tipe,
          s.status_rekon
        FROM setoran_pajak s
        LEFT JOIN data_sp2d sh ON TRIM(sh.nomor) = TRIM(s.nomor_bukti)
        WHERE s.tanggal BETWEEN ${new Date(sDate)} AND ${new Date(eDate)}
        AND NOT EXISTS (
          SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti
        )
        AND sh.id IS NULL

        UNION ALL

        -- PENYESUAIAN
        SELECT 
          tanggal, 'ADJ-' || id as bukti, uraian, 'PENYESUAIAN KAS' as opd,
          NULL::VARCHAR as uraian_induk,
          id_sumber_dana, CASE WHEN jenis = 'MASUK' THEN nilai ELSE 0 END as penerimaan, 
          CASE WHEN jenis = 'KELUAR' THEN nilai ELSE 0 END as pengeluaran, 'PENYESUAIAN' as tipe,
          'SUDAH' as status_rekon
        FROM data_penyesuaian
        WHERE tanggal BETWEEN ${new Date(sDate)} AND ${new Date(eDate)}
      ) combined
      WHERE 1=1 ${sumberDana ? Prisma.sql`AND id_sumber_dana = ${sumberDana}` : Prisma.empty}
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

    // [KANONIK-B] Koreksi potongan mengendap 'Lainnya' (logika Q7 terkunci, dibatasi tahun periode)
    const koreksiRes = await prisma.$queryRaw`
      SELECT COALESCE(SUM(CAST(p.nilai AS DECIMAL)),0)::float8 AS t
      FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      WHERE (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL)
        AND EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = EXTRACT(YEAR FROM CAST(${eDate} AS DATE))
        AND (LOWER(p.uraian) LIKE '%lainnya%' OR LOWER(p.keterangan) LIKE '%lainnya%')`;
    const koreksiMengendap = Number(koreksiRes[0]?.t || 0);

    res.json({
      data: paginatedData,
      summary: { saldoAwal: saldoAwalValue, totalPenerimaan, totalPengeluaran, saldoAkhir: runningBalance, koreksiMengendap, saldoAkhirRekonsiliasi: runningBalance + koreksiMengendap },
      pagination: { totalData: fullData.length, page: parseInt(page), totalPages: Math.ceil(fullData.length / parseInt(limit)) }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error generating BKU', error: err.message });
  }
};

module.exports = { getBku };
