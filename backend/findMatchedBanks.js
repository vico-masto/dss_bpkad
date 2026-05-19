const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const sp2dIds = [
    'SP2D-1777906416954', // ...000015...
    'SP2D-1777906395771', // ...000002...
    'SP2D-1777906399081', // ...000004...
    'SP2D-1777906413989'  // ...000010...
  ];

  const banks = await prisma.bank_statement.findMany({
    where: { ref_bku_id: { in: sp2dIds } }
  });

  console.log("Bank statements matched to these SP2Ds:");
  banks.forEach(b => {
    console.log(`- Bank ID: ${b.id} | Deskripsi: ${b.deskripsi} | Debet: ${b.debet} | ref_bku_id: ${b.ref_bku_id}`);
  });
}

run().finally(() => prisma.$disconnect());
