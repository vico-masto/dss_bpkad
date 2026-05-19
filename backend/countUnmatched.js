const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const count = await prisma.bank_statement.count({ where: { is_matched: false } });
  console.log('Unmatched bank statements:', count);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
