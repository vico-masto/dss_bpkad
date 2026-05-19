const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  console.log('Starting BKU Uraian cleanup...');

  // 1. data_pendapatan
  const pendapatan = await prisma.data_pendapatan.findMany({
    where: {
      uraian: { contains: '[Rekon]:' }
    }
  });
  console.log(`Found ${pendapatan.length} records in data_pendapatan to clean.`);
  for (const p of pendapatan) {
    const cleanUraian = p.uraian.split('[Rekon]:')[0].trim();
    await prisma.data_pendapatan.update({
      where: { id: p.id },
      data: { uraian: cleanUraian }
    });
  }

  // 2. setoran_pajak
  const pajak = await prisma.setoran_pajak.findMany({
    where: {
      uraian: { contains: '[Rekon]:' }
    }
  });
  console.log(`Found ${pajak.length} records in setoran_pajak to clean.`);
  for (const s of pajak) {
    const cleanUraian = s.uraian.split('[Rekon]:')[0].trim();
    await prisma.setoran_pajak.update({
      where: { id: s.id },
      data: { uraian: cleanUraian }
    });
  }

  console.log('Cleanup complete.');
  await prisma.$disconnect();
}

cleanup().catch(e => {
  console.error(e);
  process.exit(1);
});
