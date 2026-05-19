const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- MENCARI TRANSAKSI BUNGA / PAJAK / ADMIN ---");

  const banks = await prisma.bank_statement.findMany({
    where: {
      OR: [
        { deskripsi: { contains: 'BUNGA', mode: 'insensitive' } },
        { deskripsi: { contains: 'PAJAK', mode: 'insensitive' } },
        { deskripsi: { contains: 'ADMIN', mode: 'insensitive' } },
        { deskripsi: { contains: 'BIAYA', mode: 'insensitive' } }
      ]
    },
    orderBy: { tanggal: 'asc' }
  });

  banks.forEach(b => {
    console.log(`[BANK] ID: ${b.id} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | Desc: ${b.deskripsi} | D: ${b.debet} | K: ${b.kredit} | Matched: ${b.is_matched}`);
  });
}

run().finally(() => prisma.$disconnect());
