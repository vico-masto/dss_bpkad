// Test getDiscrepancyReport backend queries
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const currentYear = 2026;

async function test() {
  try {
    console.log('\n=== Test 1: SP2D Unmatched ===');
    const sp2d = await prisma.$queryRaw`
      SELECT EXTRACT(MONTH FROM tanggal)::int as bulan, opd,
        COUNT(*)::int as jumlah, SUM(CAST(nilai_neto AS DECIMAL)) as total_neto
      FROM data_sp2d WHERE tahun = ${currentYear} AND status_rekon = 'BELUM'
      GROUP BY EXTRACT(MONTH FROM tanggal), opd ORDER BY bulan ASC LIMIT 3
    `;
    console.log('SP2D unmatched rows:', sp2d.length, sp2d[0] || 'empty');

    console.log('\n=== Test 2: Bank Debet Unmatched (ARRAY_AGG issue) ===');
    // ARRAY_AGG ... LIMIT inside aggregate is NOT valid PostgreSQL!
    // This will cause a 500 error
    try {
      const bank = await prisma.$queryRaw`
        SELECT EXTRACT(MONTH FROM tanggal)::int as bulan, COUNT(*)::int as jumlah,
          SUM(CAST(debet AS DECIMAL)) as total_debet,
          ARRAY_AGG(deskripsi ORDER BY tanggal LIMIT 5) as contoh_deskripsi
        FROM bank_statement
        WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
        GROUP BY EXTRACT(MONTH FROM tanggal) ORDER BY bulan ASC
      `;
      console.log('Bank rows:', bank.length);
    } catch(e) {
      console.error('ARRAY_AGG ERROR (expected):', e.message);
    }

    console.log('\n=== Test 2 Fixed: Bank Debet without ARRAY_AGG ===');
    const bankFixed = await prisma.$queryRaw`
      SELECT EXTRACT(MONTH FROM tanggal)::int as bulan, COUNT(*)::int as jumlah,
        SUM(CAST(debet AS DECIMAL)) as total_debet
      FROM bank_statement
      WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
      GROUP BY EXTRACT(MONTH FROM tanggal) ORDER BY bulan ASC
    `;
    console.log('Bank debet fixed rows:', bankFixed.length, bankFixed[0] || 'empty');

    console.log('\n=== Test 3: Monthly Balance ===');
    const monthly = await prisma.$queryRaw`
      SELECT m.bulan,
        COALESCE(inc.total_penerimaan, 0) as penerimaan,
        COALESCE(exp.total_pengeluaran, 0) as pengeluaran
      FROM (SELECT generate_series(1,12) as bulan) m
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM tanggal)::int as bln, SUM(CAST(nilai AS DECIMAL)) as total_penerimaan
        FROM data_pendapatan WHERE tahun = ${currentYear} GROUP BY EXTRACT(MONTH FROM tanggal)
      ) inc ON inc.bln = m.bulan
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM tanggal)::int as bln, SUM(CAST(nilai_neto AS DECIMAL)) as total_pengeluaran
        FROM data_sp2d WHERE tahun = ${currentYear} GROUP BY EXTRACT(MONTH FROM tanggal)
      ) exp ON exp.bln = m.bulan
      ORDER BY m.bulan ASC
    `;
    console.log('Monthly rows:', monthly.length);
    const withData = monthly.filter(r => Number(r.penerimaan) > 0 || Number(r.pengeluaran) > 0);
    console.log('Months with data:', withData.map(r => `bulan=${r.bulan} inc=${Number(r.penerimaan)} exp=${Number(r.pengeluaran)}`));

    console.log('\n=== Test 4: Serialize function (Decimal type check) ===');
    // Check what Prisma Decimal's constructor name actually is at runtime
    const testDecimal = await prisma.$queryRaw`SELECT CAST(100 AS DECIMAL) as val`;
    const val = testDecimal[0].val;
    console.log('Decimal type:', typeof val);
    console.log('Constructor name:', val?.constructor?.name);
    console.log('Value:', val);
    console.log('Number(val):', Number(val));

    console.log('\n=== Test 5: data_sp2d_potongan fields ===');
    const pot = await prisma.data_sp2d_potongan.findFirst();
    if (pot) {
      console.log('Potongan fields:', Object.keys(pot).join(', '));
      // Check if 'opd' and 'jenis_potongan' exist
      console.log('Has opd:', 'opd' in pot);
      console.log('Has jenis_potongan:', 'jenis_potongan' in pot);
    }

  } catch(e) {
    console.error('FATAL ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}
test();
