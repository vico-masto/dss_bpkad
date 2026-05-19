const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBank() {
  const targetDate = new Date('2026-04-30T23:59:59.999Z');
  const res = await prisma.bank_statement.findMany({ 
    where: { 
      is_matched: false, 
      debet: { gt: 0 },
      tanggal: { lte: targetDate }
    } 
  });
  
  let sum = 0;
  res.forEach(r => {
    console.log(`${r.tanggal.toISOString().split('T')[0]} | ${r.debet} | ${r.deskripsi}`);
    sum += Number(r.debet);
  });
  console.log('TOTAL UNMATCHED BANK DEBET:', sum);
}

checkBank().finally(() => prisma.$disconnect());
