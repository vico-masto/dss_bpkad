const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findLarge() {
  const sp2ds = await prisma.data_sp2d.findMany({
    where: {
      nilai_neto: { gte: 1000000000 }
    },
    orderBy: { tanggal: 'asc' }
  });
  console.log(sp2ds.map(s => ({ 
    nomor: s.nomor, 
    tgl: s.tanggal.toISOString().split('T')[0], 
    tgl_pencairan: s.tanggal_pencairan ? s.tanggal_pencairan.toISOString().split('T')[0] : 'NULL',
    nilai: s.nilai_neto 
  })));
}

findLarge().finally(() => prisma.$disconnect());
