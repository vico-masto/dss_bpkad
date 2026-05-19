const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const bank = await prisma.bank_statement.findMany({
    where: { ref_bku_id: 'SP2D-1777906413559' }
  });
  console.log('Bank matching this SP2D:', bank);
}

run().finally(() => prisma.$disconnect());
