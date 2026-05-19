const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.data_pendapatan.count();
  console.log('COUNT_RESULT:' + count);
  process.exit(0);
}

main();
