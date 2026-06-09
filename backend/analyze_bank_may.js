const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeBankMay() {
  const startDate = new Date('2026-05-01T00:00:00.000Z');
  const endDate = new Date('2026-05-31T23:59:59.999Z');

  const bs = await prisma.bank_statement.findMany({
    where: {
      tanggal: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const belum = bs.filter(b => b.is_matched === false);
  const matched = bs.filter(b => b.is_matched === true);

  const debitBelum = belum.reduce((sum, b) => sum + Number(b.debet || 0), 0);
  const creditBelum = belum.reduce((sum, b) => sum + Number(b.kredit || 0), 0);
  
  console.log(`Bank Statements in May: Total: ${bs.length}, MATCHED: ${matched.length}, BELUM: ${belum.length}`);
  if (belum.length > 0) {
    console.log(`Total Debit (Pengeluaran Bank) BELUM matched: ${debitBelum}`);
    console.log(`Total Credit (Penerimaan Bank) BELUM matched: ${creditBelum}`);
  }
}

analyzeBankMay().catch(console.error).finally(() => prisma.$disconnect());
