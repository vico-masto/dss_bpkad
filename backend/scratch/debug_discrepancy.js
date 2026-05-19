const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugDiscrepancy() {
  const currentYear = 2026;
  try {
    console.log('--- Checking SP2D Unmatched ---');
    const sp2d = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count, SUM(CAST(nilai_bruto AS DECIMAL)) as total
      FROM data_sp2d WHERE tahun = ${currentYear} AND status_rekon = 'BELUM'
    `;
    console.log('SP2D:', sp2d);

    console.log('--- Checking Bank Unmatched ---');
    const bank = await prisma.$queryRaw`
      SELECT COUNT(*)::int as count, SUM(CAST(debet AS DECIMAL)) as total_debet, SUM(CAST(kredit AS DECIMAL)) as total_kredit
      FROM bank_statement WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false
    `;
    console.log('Bank:', bank);

    console.log('--- Checking Combined Outstanding ---');
    const combined = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT 'SP2D' as tipe, COALESCE(tanggal_pencairan, tanggal) as tanggal, nomor as bukti, opd, uraian, CAST(nilai_bruto AS DECIMAL) as nilai, 'KELUAR' as d_k
        FROM data_sp2d WHERE tahun = ${currentYear} AND status_rekon = 'BELUM'
        UNION ALL
        SELECT 'BANK_KELUAR' as tipe, tanggal, '' as bukti, 'BANK' as opd, deskripsi as uraian, CAST(debet AS DECIMAL) as nilai, 'KELUAR' as d_k
        FROM bank_statement WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
      ) c
      LIMIT 5
    `;
    console.log('Combined Sample:', combined);

  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

debugDiscrepancy();
