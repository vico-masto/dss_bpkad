const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const sp2d = await prisma.data_sp2d.findUnique({
    where: { nomor: '81.07/04.0/000008/LS/2.07.3.32.0.00.02.0000/M/3/2026' }
  });
  console.log('SP2D:', sp2d);
}

run().finally(() => prisma.$disconnect());
