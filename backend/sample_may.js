const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyze() {
  const bs = await prisma.bank_statement.findMany({
    where: {
      tanggal: {
        gte: new Date('2026-05-01'),
        lte: new Date('2026-05-31')
      },
      OR: [
        { debet: { gt: 0 } },
        { kredit: { gt: 0 } }
      ]
    },
    take: 5
  });
  console.log("Bank Statements Sample:", bs);

  const sp = await prisma.data_sp2d.findMany({
    where: {
      tanggal_pencairan: {
        gte: new Date('2026-05-01'),
        lte: new Date('2026-05-31')
      }
    },
    take: 5
  });
  console.log("SP2D Sample:", sp.map(s => ({id: s.id, neto: s.nilai_neto})));
}

analyze().catch(console.error).finally(() => prisma.$disconnect());
