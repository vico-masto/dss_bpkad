const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findLeapers() {
  const febStart = new Date('2026-02-01');
  const febEnd = new Date('2026-02-28T23:59:59.999Z');

  console.log('--- SP2D Created in Feb but Disbursed later ---');
  const leapers = await prisma.data_sp2d.findMany({
    where: {
      tanggal: { gte: febStart, lte: febEnd },
      tanggal_pencairan: { gt: febEnd }
    }
  });

  let sum = 0;
  leapers.forEach(l => {
    console.log(`  - ${l.nomor} | Created: ${l.tanggal.toISOString().split('T')[0]} | Disbursed: ${l.tanggal_pencairan.toISOString().split('T')[0]} | Nilai: ${l.nilai_neto}`);
    sum += Number(l.nilai_neto);
  });
  console.log(`Total Leapers: Rp ${sum.toLocaleString('id-ID')}`);
}

findLeapers().finally(() => prisma.$disconnect());
