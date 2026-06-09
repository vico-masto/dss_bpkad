const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeSp2dMay() {
  const startDate = new Date('2026-05-01T00:00:00.000Z');
  const endDate = new Date('2026-05-31T23:59:59.999Z');

  const sp2ds = await prisma.data_sp2d.findMany({
    where: {
      tanggal_pencairan: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const belumCount = sp2ds.filter(s => s.status_rekon === 'BELUM').length;
  const matchCount = sp2ds.filter(s => s.status_rekon === 'MATCH').length;
  const anomaliCount = sp2ds.filter(s => s.status_rekon === 'ANOMALI').length;

  console.log(`SP2D in May: Total: ${sp2ds.length}, MATCH: ${matchCount}, BELUM: ${belumCount}, ANOMALI: ${anomaliCount}`);
  
  if (belumCount > 0) {
    const sumBelum = sp2ds.filter(s => s.status_rekon === 'BELUM').reduce((sum, s) => sum + Number(s.nilai_neto), 0);
    console.log(`Total Nilai Neto SP2D BELUM direkon: ${sumBelum}`);
  }

  // check if Potongan also has BELUM
  const potongan = await prisma.data_sp2d_potongan.findMany({
    where: {
      tanggal_pencairan: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const potBelumCount = potongan.filter(p => p.status_rekon === 'BELUM').length;
  if (potBelumCount > 0) {
    const sumPotBelum = potongan.filter(p => p.status_rekon === 'BELUM').reduce((sum, p) => sum + Number(p.nilai), 0);
    console.log(`Total Nilai Potongan BELUM direkon: ${sumPotBelum}`);
  }

}

analyzeSp2dMay().catch(console.error).finally(() => prisma.$disconnect());
