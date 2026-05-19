const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBank() {
  const bank = await prisma.bank_statement.findMany({ 
    where: { ref_bku_id: 'SP2D-1777906405131' } 
  });
  console.log('Bank records matched to SP2D ...000003:', bank);
}

checkBank().finally(() => prisma.$disconnect());
