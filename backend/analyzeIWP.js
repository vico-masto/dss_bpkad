const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- ANALISA ITEM IWP (POTONGAN) BELUM COCOK ---");

  const bankIWP = await prisma.bank_statement.findMany({
    where: { 
      is_matched: false, 
      deskripsi: { contains: 'IWP', mode: 'insensitive' }
    }
  });

  const totalIWP = bankIWP.reduce((sum, item) => sum + Number(item.debet), 0);

  console.log(`Jumlah Item IWP Bank Belum Cocok: ${bankIWP.length}`);
  console.log(`Total Nilai IWP: ${totalIWP.toLocaleString('id-ID')}`);
  
  if (bankIWP.length > 0) {
     console.log("\nTop 10 Item IWP:");
     bankIWP.slice(0, 10).forEach(b => console.log(`- ID: ${b.id} | ${b.tanggal.toISOString().split('T')[0]} | ${b.debet.toLocaleString('id-ID')} | ${b.deskripsi}`));
  }
}

run().finally(() => prisma.$disconnect());
