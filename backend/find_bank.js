const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findMissingBankStmts() {
  const vals = [2969724700, 1484870221, 1046883693];
  
  const bs = await prisma.bank_statement.findMany({
    where: {
      debet: { in: vals }
    }
  });
  
  console.log("Bank statements matching the big SP2D values:");
  console.log(bs);
}

findMissingBankStmts().catch(console.error).finally(() => prisma.$disconnect());
