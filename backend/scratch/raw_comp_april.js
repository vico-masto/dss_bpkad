const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function rawComp() {
  const start = new Date('2026-04-01');
  const end = new Date('2026-04-30T23:59:59.999Z');

  console.log('--- RAW COMPARISON APRIL 2026 ---');

  const bank = await prisma.bank_statement.aggregate({
    where: { tanggal: { gte: start, lte: end } },
    _sum: { debet: true }
  });

  const sp2d = await prisma.$queryRaw`SELECT SUM(nilai_neto) as v FROM data_sp2d WHERE COALESCE(tanggal_pencairan, tanggal) BETWEEN ${start} AND ${end}`;
  const pot = await prisma.data_sp2d_potongan.aggregate({
    where: { tanggal_pencairan: { gte: start, lte: end } },
    _sum: { nilai: true }
  });
  const tax = await prisma.$queryRaw`SELECT SUM(nilai) as v FROM setoran_pajak WHERE tanggal BETWEEN ${start} AND ${end} AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = setoran_pajak.nomor_bukti)`;

  const totalBku = Number(sp2d[0].v || 0) + Number(pot._sum.nilai || 0) + Number(tax[0].v || 0);
  const totalBank = Number(bank._sum.debet || 0);

  console.log(`BKU Exp:  ${totalBku.toLocaleString()}`);
  console.log(`Bank Exp: ${totalBank.toLocaleString()}`);
  console.log(`Diff:     ${(totalBku - totalBank).toLocaleString()}`);
}

rawComp().finally(() => prisma.$disconnect());
