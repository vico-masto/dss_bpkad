const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const count = await prisma.data_sp2d_potongan.count();
  console.log(`Total Potongan in DB: ${count}`);
}

run().finally(() => prisma.$disconnect());
