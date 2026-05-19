const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- ANALISA SUMBER SELISIH ---");

  // 1. Saldo Awal
  const sa = await prisma.saldo_awal.findMany();
  console.log("\nSaldo Awal BKU:");
  console.log(sa);

  // 2. Bank Saldo Awal (The earliest record or the one marked as SALDO AWAL)
  const bankSA = await prisma.bank_statement.findFirst({
    where: { deskripsi: { contains: 'SALDO AWAL', mode: 'insensitive' } }
  });
  console.log("\nBank Saldo Awal:");
  console.log(bankSA);

  // 3. Penyesuaian
  const adj = await prisma.data_penyesuaian.findMany();
  console.log("\nData Penyesuaian:");
  console.log(adj);

  // 4. Pajak yang belum setor?
  // (Potongan SP2D - Setoran Pajak)
  const pot = await prisma.data_sp2d_potongan.aggregate({ _sum: { nilai: true } });
  const setor = await prisma.setoran_pajak.aggregate({ _sum: { nilai: true } });
  console.log(`\nTotal Potongan: ${pot._sum.nilai}`);
  console.log(`Total Setoran: ${setor._sum.nilai}`);
  console.log(`Pajak tertahan di Kas: ${Number(pot._sum.nilai) - Number(setor._sum.nilai)}`);
}

run().finally(() => prisma.$disconnect());
