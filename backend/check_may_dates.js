const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMayDates() {
  const bs = await prisma.bank_statement.groupBy({
    by: ['tanggal'],
    where: {
      tanggal: {
        gte: new Date('2026-05-01T00:00:00.000Z'),
        lte: new Date('2026-05-31T23:59:59.999Z')
      }
    },
    _count: {
      tanggal: true
    },
    orderBy: {
      tanggal: 'asc'
    }
  });
  console.log("Bank statement counts by date in May:");
  bs.forEach(b => console.log(`${b.tanggal.toISOString().split('T')[0]}: ${b._count.tanggal}`));
}

checkMayDates().catch(console.error).finally(() => prisma.$disconnect());
