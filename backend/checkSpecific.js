const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const bankItems = await prisma.bank_statement.findMany({
    where: { debet: 39039200 }
  });
  console.log('Bank items for 39039200:');
  console.log(bankItems);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
