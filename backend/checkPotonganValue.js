const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const potong = await prisma.$queryRaw`
    SELECT * FROM data_sp2d_potongan WHERE nilai = 4520060
  `;
  console.log('Potongan with value 4520060:', potong);
}

run().finally(() => prisma.$disconnect());
