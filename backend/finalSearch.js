const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- MENCARI NILAI 1.313.884,8 DI SELURUH DATA ---");

  // 1. SP2D
  const s = await prisma.data_sp2d.findMany({
    where: {
      OR: [
        { nilai_neto: { gte: 1313884, lte: 1313886 } },
        { nilai_potongan: { gte: 1313884, lte: 1313886 } }
      ]
    }
  });
  console.log("SP2D Candidates:", s);

  // 2. Bank
  const b = await prisma.bank_statement.findMany({
    where: {
      OR: [
        { debet: { gte: 1313884, lte: 1313886 } },
        { kredit: { gte: 1313884, lte: 1313886 } }
      ]
    }
  });
  console.log("Bank Candidates:", b);

  // 3. Setoran Pajak
  const t = await prisma.setoran_pajak.findMany({
    where: { nilai: { gte: 1313884, lte: 1313886 } }
  });
  console.log("Tax Candidates:", t);

  // 4. Potongan Detail
  const p = await prisma.data_sp2d_potongan.findMany({
    where: { nilai: { gte: 1313884, lte: 1313886 } }
  });
  console.log("Potongan Candidates:", p);
}

run().finally(() => prisma.$disconnect());
