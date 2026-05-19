const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditFeb() {
  const start = new Date('2026-02-01');
  const end = new Date('2026-02-28T23:59:59.999Z');

  console.log(`--- AUDIT FEBRUARI 2026 ---`);

  // BKU Expenditures (Logic: TANGGAL PEMBUATAN)
  const [expOld] = await prisma.$queryRaw`
    SELECT SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS NUMERIC)) as total 
    FROM data_sp2d 
    WHERE tanggal BETWEEN ${start} AND ${end}`;

  const totalBkuOld = Number(expOld[0].total || 0);

  console.log(`Total BKU (Creation Date): Rp ${totalBkuOld.toLocaleString('id-ID')}`);
}

auditFeb().finally(() => prisma.$disconnect());
