const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const bank = await prisma.bank_statement.findUnique({ where: { id: 6943 } });
  const sp2d = await prisma.data_sp2d.findUnique({ where: { id: 'SP2D-1777906395771' } });

  console.log("EXACT VALUES FROM DB:");
  console.log(`Bank Debet: ${bank.debet} (Type: ${typeof bank.debet})`);
  console.log(`SP2D Neto: ${sp2d.nilai_neto} (Type: ${typeof sp2d.nilai_neto})`);
  
  const bVal = Number(bank.debet.toString());
  const sVal = Number(sp2d.nilai_neto.toString());
  
  console.log(`Converted numbers: Bank=${bVal}, SP2D=${sVal}`);
  console.log(`Difference: ${Math.abs(bVal - sVal)}`);
  console.log(`Is diff < 0.01? ${Math.abs(bVal - sVal) < 0.01}`);
}

run().finally(() => prisma.$disconnect());
