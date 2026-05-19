const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const sp2d = await prisma.data_sp2d.findMany({ 
    where: { 
      OR: [
        { nomor: { contains: '000003/LS' } },
        { nilai_neto: 39039200 },
        { nilai_bruto: 39039200 }
      ]
    } 
  });
  console.log('SP2D:', sp2d);
  
  const bank = await prisma.bank_statement.findMany({ 
    where: { debet: 39039200 } 
  });
  console.log('Bank:', bank);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
