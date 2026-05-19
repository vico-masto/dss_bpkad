const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const result = await prisma.bank_statement.updateMany({
    where: { ref_bku_id: 'ALREADY_MATCHED' },
    data: { 
      is_matched: false, 
      ref_bku_id: null 
    }
  });
  console.log(`Unmatched ${result.count} corrupted bank statements.`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
