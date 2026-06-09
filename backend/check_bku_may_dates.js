const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBkuMayDates() {
  const sp2d = await prisma.data_sp2d.groupBy({
    by: ['tanggal_pencairan'],
    where: {
      tanggal_pencairan: {
        gte: new Date('2026-05-01T00:00:00.000Z'),
        lte: new Date('2026-05-31T23:59:59.999Z')
      }
    },
    _count: { tanggal_pencairan: true },
    orderBy: { tanggal_pencairan: 'asc' }
  });
  console.log("SP2D counts by date in May:");
  sp2d.forEach(b => console.log(`${b.tanggal_pencairan.toISOString().split('T')[0]}: ${b._count.tanggal_pencairan}`));
}

checkBkuMayDates().catch(console.error).finally(() => prisma.$disconnect());
