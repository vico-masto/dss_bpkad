const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPotApril() {
  const start = new Date('2026-04-01');
  const end = new Date('2026-04-30T23:59:59.999Z');

  const pots = await prisma.data_sp2d_potongan.findMany({
    where: {
      tanggal_pencairan: { gte: start, lte: end }
    }
  });

  console.log(`Total Potongan in April: ${pots.length}`);
  let sumBelum = 0;
  let sumSudah = 0;
  pots.forEach(p => {
    if (p.status_rekon === 'BELUM') sumBelum += Number(p.nilai);
    else sumSudah += Number(p.nilai);
  });

  console.log(`Sum BELUM: ${sumBelum.toLocaleString()}`);
  console.log(`Sum SUDAH: ${sumSudah.toLocaleString()}`);
}

checkPotApril().finally(() => prisma.$disconnect());
