const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const bankVal = 11501601;
  const sp2d = await prisma.data_sp2d.findMany({
    where: {
      OR: [
        { nilai_neto: bankVal },
        { nilai_bruto: bankVal }
      ]
    }
  });

  console.log(`SP2D dengan nilai tepat ${bankVal}:`);
  console.log(sp2d);

  const matchedSp2d = await prisma.data_sp2d.findUnique({
    where: { id: 'SP2D-1777906395771' }
  });
  console.log("\nData SP2D yang saat ini terhubung (SP2D-1777906395771):");
  console.log(matchedSp2d);
}

run().finally(() => prisma.$disconnect());
