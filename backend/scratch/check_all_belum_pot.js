const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const res = await prisma.data_sp2d_potongan.findMany({ where: { status_rekon: 'BELUM' } });
  let sum = 0;
  res.forEach(r => {
    console.log(`${r.nomor_sp2d} | ${r.tanggal_pencairan.toISOString().split('T')[0]} | ${r.nilai}`);
    sum += Number(r.nilai);
  });
  console.log('TOTAL BELUM:', sum);
}

check().finally(() => prisma.$disconnect());
