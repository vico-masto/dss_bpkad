const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditFeb() {
  const start = new Date('2026-02-01');
  const end = new Date('2026-02-28T23:59:59.999Z');

  console.log(`--- AUDIT FEBRUARI 2026 ---`);

  // BKU Expenditures (Logic: COALESCE(pencairan, tanggal))
  const [expRaw, taxPot] = await Promise.all([
    prisma.$queryRaw`
      SELECT SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS NUMERIC)) as total 
      FROM data_sp2d 
      WHERE COALESCE(tanggal_pencairan, tanggal) BETWEEN ${start} AND ${end}`,
    prisma.data_sp2d_potongan.aggregate({ 
      where: { tanggal_pencairan: { gte: start, lte: end } }, 
      _sum: { nilai: true } 
    })
  ]);

  const totalBku = Number(expRaw[0].total || 0) + Number(taxPot._sum.nilai || 0);

  // Bank Expenditures
  const bankMutations = await prisma.bank_statement.aggregate({
    where: { tanggal: { gte: start, lte: end } },
    _sum: { debet: true }
  });
  const totalBank = Number(bankMutations._sum.debet || 0);

  console.log(`Total BKU Expenditure: Rp ${totalBku.toLocaleString('id-ID')}`);
  console.log(`Total Bank Expenditure: Rp ${totalBank.toLocaleString('id-ID')}`);
  console.log(`SELISIH:               Rp ${(totalBku - totalBank).toLocaleString('id-ID')}`);

  // List large unmatched items in Feb
  const unmatched = await prisma.$queryRaw`
    SELECT 'SP2D' as tipe, nomor, CAST(nilai_neto AS DECIMAL) as nilai, uraian
    FROM data_sp2d 
    WHERE COALESCE(tanggal_pencairan, tanggal) BETWEEN ${start} AND ${end} 
    AND status_rekon = 'BELUM'
    ORDER BY nilai_neto DESC
  `;
  console.log('\nUnmatched BKU Feb (Potential causes):');
  unmatched.forEach(u => console.log(`  - ${u.nomor}: Rp ${Number(u.nilai).toLocaleString('id-ID')} - ${u.uraian.slice(0, 50)}`));
}

auditFeb().finally(() => prisma.$disconnect());
