const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function find64() {
  const sp2ds = await prisma.data_sp2d.findMany({
    where: {
      nilai_neto: { gte: 64340000, lte: 64350000 }
    }
  });
  console.log(sp2ds);
}

find64().finally(() => prisma.$disconnect());
