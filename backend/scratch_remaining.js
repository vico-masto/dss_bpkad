const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function checkRemaining() {
  const items = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'BELUM' },
    select: { id: true, nomor: true, tanggal: true, tanggal_pencairan: true, nilai_bruto: true, uraian: true }
  });
  console.log("Daftar 2 SP2D yang Masih BELUM Rekon:");
  console.log(JSON.stringify(items, null, 2));
  await prisma.$disconnect();
}

checkRemaining();
