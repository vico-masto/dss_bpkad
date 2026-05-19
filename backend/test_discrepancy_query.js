const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  const currentYear = 2026;
  console.log('Testing Discrepancy Report for Year:', currentYear);

  try {
    console.log('1. Testing sp2dUnmatched...');
    const sp2dUnmatched = await prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bulan,
        opd,
        COUNT(*)::int as jumlah,
        SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0) AS DECIMAL)) as total_neto,
        SUM(CAST(nilai_bruto AS DECIMAL)) as total_bruto
      FROM data_sp2d h
      WHERE h.tahun = ${currentYear} AND h.status_rekon = 'BELUM'
      GROUP BY EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal)), opd
      ORDER BY bulan ASC, total_neto DESC
    `;
    console.log('Success. Rows:', sp2dUnmatched.length);

    console.log('2. Testing monthlyBalance...');
    // This is the long one
    const monthlyBalance = await prisma.$queryRaw`
      SELECT 
        m.bulan,
        COALESCE(inc.total_penerimaan, 0) as penerimaan,
        COALESCE(exp.total_pengeluaran, 0) as pengeluaran,
        COALESCE(bank.saldo_akhir_bank, 0) as saldo_bank,
        COALESCE(exp_unmatched.total, 0) as pengeluaran_belum_rekon,
        COALESCE(debet_unmatched.total, 0) as bank_debet_belum_cocok
      FROM (SELECT generate_series(1,12) as bulan) m
      LEFT JOIN (
        SELECT bln, SUM(total) as total_penerimaan FROM (
          SELECT 1 as bln, SUM(CAST(nilai AS DECIMAL)) as total FROM saldo_awal
          UNION ALL
          SELECT EXTRACT(MONTH FROM tanggal)::int as bln, SUM(CAST(nilai AS DECIMAL)) as total
          FROM data_pendapatan WHERE tahun = ${currentYear}
          GROUP BY EXTRACT(MONTH FROM tanggal)
        ) sub GROUP BY bln
      ) inc ON inc.bln = m.bulan
      LEFT JOIN (
        SELECT bln, SUM(nilai) as total_pengeluaran FROM (
          SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bln, (CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE (nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0)) END) as nilai FROM data_sp2d WHERE tahun = ${currentYear}
        ) combined_exp
        GROUP BY bln
      ) exp ON exp.bln = m.bulan
      LEFT JOIN (
        SELECT 
          EXTRACT(MONTH FROM tanggal)::int as bln,
          SUM(CAST(kredit AS NUMERIC)) - SUM(CAST(debet AS NUMERIC)) as saldo_akhir_bank
        FROM bank_statement
        WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear}
        GROUP BY EXTRACT(MONTH FROM tanggal)
      ) bank ON bank.bln = m.bulan
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bln, SUM(CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE (nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0)) END) as total
        FROM data_sp2d WHERE tahun = ${currentYear} AND status_rekon = 'BELUM'
        GROUP BY EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))
      ) exp_unmatched ON exp_unmatched.bln = m.bulan
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM tanggal)::int as bln, SUM(CAST(debet AS DECIMAL)) as total
        FROM bank_statement 
        WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
        GROUP BY EXTRACT(MONTH FROM tanggal)
      ) debet_unmatched ON debet_unmatched.bln = m.bulan
      ORDER BY m.bulan ASC
    `;
    console.log('Success. Rows:', monthlyBalance.length);

  } catch (err) {
    console.error('FAILED:', err);
  } finally {
    await prisma.$disconnect();
  }
}

test();
