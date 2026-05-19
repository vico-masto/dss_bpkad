const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditRevenue(month) {
  const start = new Date(2026, month - 1, 1);
  const end = new Date(2026, month, 0, 23, 59, 59, 999);
  
  console.log(`--- REVENUE AUDIT MONTH ${month} ---`);

  const pndBku = await prisma.data_pendapatan.aggregate({
    where: { tanggal: { gte: start, lte: end } },
    _sum: { nilai: true }
  });

  const pndBank = await prisma.bank_statement.aggregate({
    where: { tanggal: { gte: start, lte: end } },
    _sum: { kredit: true }
  });

  console.log(`BKU Revenue: Rp ${Number(pndBku._sum.nilai || 0).toLocaleString()}`);
  console.log(`Bank Revenue: Rp ${Number(pndBank._sum.kredit || 0).toLocaleString()}`);
  console.log(`Diff: Rp ${(Number(pndBku._sum.nilai || 0) - Number(pndBank._sum.kredit || 0)).toLocaleString()}`);
}

auditRevenue(4).finally(() => prisma.$disconnect());
