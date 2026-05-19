const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function find64() {
  const pnd = await prisma.data_pendapatan.findMany({
    where: {
      nilai: { gte: 64340000, lte: 64350000 }
    }
  });
  console.log(pnd);
}

find64().finally(() => prisma.$disconnect());
