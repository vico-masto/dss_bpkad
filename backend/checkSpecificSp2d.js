const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const sp2d = await prisma.data_sp2d.findUnique({
    where: { nomor: '81.07/04.0/000006/LS/4.02.0.00.0.00.01.0000/M/3/2026' }
  });
  console.log('SP2D:', sp2d);

  if (sp2d) {
    const banks = await prisma.bank_statement.findMany({
      where: {
        OR: [
          { debet: sp2d.nilai_neto },
          { debet: sp2d.nilai_bruto }
        ]
      }
    });
    console.log(`Found ${banks.length} bank statements with value ${sp2d.nilai_neto} or ${sp2d.nilai_bruto}`);
    console.log(banks);
  }
}

run().finally(() => prisma.$disconnect());
