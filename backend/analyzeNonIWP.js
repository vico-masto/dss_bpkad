const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- TRANSAKSI BANK UNMATCHED (NON-IWP) ---");

  const bankNonIWP = await prisma.bank_statement.findMany({
    where: { 
      is_matched: false, 
      NOT: [
        { deskripsi: { contains: 'IWP', mode: 'insensitive' } },
        { deskripsi: { contains: 'SALDO AWAL', mode: 'insensitive' } }
      ]
    }
  });

  bankNonIWP.forEach(b => {
    const val = Number(b.debet) > 0 ? Number(b.debet) : Number(b.kredit);
    console.log(`- ID: ${b.id} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | Nilai: ${val.toLocaleString('id-ID')} | Desc: ${b.deskripsi}`);
  });
}

run().finally(() => prisma.$disconnect());
