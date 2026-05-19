const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const stats = await prisma.bank_statement.groupBy({
    by: ['is_matched'],
    _count: { id: true }
  });
  console.log('Bank Statement Stats:', JSON.stringify(stats, null, 2));
  
  const sample = await prisma.bank_statement.findMany({
    where: { is_matched: false },
    take: 5,
    orderBy: { tanggal: 'asc' }
  });
  console.log('Sample Unmatched:', JSON.stringify(sample, null, 2));
  
  await prisma.$disconnect();
}

check();
