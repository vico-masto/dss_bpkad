const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const bank = await prisma.bank_statement.findUnique({
    where: { id: 6943 }
  });
  console.log("Bank 6943 Details:");
  console.log(bank);
}

run().finally(() => prisma.$disconnect());
