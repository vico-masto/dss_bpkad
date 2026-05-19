const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const count = await prisma.data_sp2d_potongan.count({
    where: {
      tanggal_pencairan: null,
      status_rekon: 'SUDAH'
    }
  });
  console.log('Matched Potongan with NULL tanggal_pencairan:', count);
}

check().finally(() => prisma.$disconnect());
