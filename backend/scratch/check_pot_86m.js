const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const ids = ['SP2D-1777906411073', 'SP2D-1777906405131'];
  const pots = await prisma.data_sp2d_potongan.findMany({ where: { id_sp2d: { in: ids } } });
  console.log(pots);
}

check().finally(() => prisma.$disconnect());
