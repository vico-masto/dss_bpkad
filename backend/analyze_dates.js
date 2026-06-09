const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeDates() {
  const sp2ds = await prisma.data_sp2d.findMany({
    where: {
      tanggal_pencairan: {
        gte: new Date('2026-05-01T00:00:00.000Z'),
        lte: new Date('2026-05-31T23:59:59.999Z')
      },
      status_rekon: 'BELUM'
    },
    select: {
      tanggal_pencairan: true,
      nilai_neto: true
    },
    orderBy: {
      tanggal_pencairan: 'desc'
    }
  });
  
  console.log("Unmatched SP2Ds in May (by Date):");
  sp2ds.forEach(s => console.log(`${s.tanggal_pencairan.toISOString().split('T')[0]}: ${s.nilai_neto}`));
}

analyzeDates().catch(console.error).finally(() => prisma.$disconnect());
