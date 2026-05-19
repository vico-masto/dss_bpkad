const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const sp2ds = await prisma.data_sp2d.findMany({
    where: { opd: { contains: 'ARU UTARA TIMUR' } },
    select: { nomor: true, uraian: true, nilai_neto: true, nilai_bruto: true, nilai_potongan: true }
  });
  console.log('SP2D KEC AUT:', sp2ds);
}

run().finally(() => prisma.$disconnect());
