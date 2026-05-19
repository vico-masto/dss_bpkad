const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditFeb() {
  const start = new Date('2026-02-01');
  const end = new Date('2026-02-28');
  end.setHours(23, 59, 59, 999);

  const exp = await prisma.$queryRaw`SELECT SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS NUMERIC)) as total FROM data_sp2d WHERE tanggal BETWEEN ${start} AND ${end}`;
  console.log('BKU (Tanggal):', exp[0].total);
}

auditFeb().finally(() => prisma.$disconnect());
