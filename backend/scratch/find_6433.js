const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findValue() {
  const v = 64330427;
  const res = await prisma.data_sp2d.findMany({
    where: {
      OR: [{ nilai_neto: v }, { nilai_bruto: v }]
    }
  });
  console.log(res);
}

findValue().finally(() => prisma.$disconnect());
