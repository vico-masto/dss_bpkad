const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findValue() {
  const v = 86199800;
  const sp2d = await prisma.data_sp2d.findMany({ where: { OR: [{ nilai_neto: v }, { nilai_bruto: v }] } });
  const pnd = await prisma.data_pendapatan.findMany({ where: { nilai: v } });
  const pot = await prisma.data_sp2d_potongan.findMany({ where: { nilai: v } });

  console.log('SP2D:', sp2d);
  console.log('PND:', pnd);
  console.log('POT:', pot);
}

findValue().finally(() => prisma.$disconnect());
