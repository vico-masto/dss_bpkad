const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // Mencari semua transaksi bank yang memiliki desimal .8
  const banks = await prisma.$queryRaw`
    SELECT * FROM bank_statement 
    WHERE CAST(debet AS TEXT) LIKE '%.8%' 
       OR CAST(kredit AS TEXT) LIKE '%.8%'
  `;
  
  console.log("Transaksi dengan desimal .8:");
  console.log(banks);
}

run().finally(() => prisma.$disconnect());
