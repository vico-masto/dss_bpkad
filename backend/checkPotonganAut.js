const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const potong = await prisma.$queryRaw`
    SELECT * FROM data_sp2d_potongan 
    WHERE uraian ILIKE '%ARU UTARA TIMUR%'
  `;
  console.log('Potongan KEC AUT:', potong);
}

run().finally(() => prisma.$disconnect());
