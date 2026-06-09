const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMay13() {
  const bs = await prisma.bank_statement.findMany({
    where: {
      tanggal: {
        gte: new Date('2026-05-13T00:00:00.000Z'),
        lte: new Date('2026-05-13T23:59:59.999Z')
      }
    }
  });
  console.log(`Number of bank statements on May 13: ${bs.length}`);
}

checkMay13().catch(console.error).finally(() => prisma.$disconnect());
