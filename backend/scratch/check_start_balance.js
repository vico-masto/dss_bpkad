const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkStart() {
  const d = new Date('2026-01-01T00:00:00.000Z');
  
  const sa = await prisma.saldo_awal.aggregate({ _sum: { nilai: true } });
  const bank = await prisma.bank_statement.findFirst({
    where: { tanggal: { lt: d } },
    orderBy: { tanggal: 'desc' }
  });
  
  console.log('Saldo Awal BKU:', Number(sa._sum.nilai || 0).toLocaleString());
  console.log('Saldo Awal Bank (Latest before 2026):', bank ? bank.saldo_akhir : 'NULL');
}

checkStart().finally(() => prisma.$disconnect());
