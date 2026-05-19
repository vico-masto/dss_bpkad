const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const bank = await prisma.bank_statement.findMany({ 
    where: { ref_bku_id: 'ALREADY_MATCHED' } 
  });
  console.log(`Found ${bank.length} bank statements with ref_bku_id = 'ALREADY_MATCHED'`);
  console.log(bank.slice(0, 5));
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
