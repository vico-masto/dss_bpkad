const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Cleaning up data_pendapatan...');
  const res1 = await prisma.$executeRawUnsafe(`
    UPDATE data_pendapatan 
    SET uraian = split_part(uraian, '[Rekon]:', 1)
    WHERE uraian LIKE '%[Rekon]:%'
  `);
  console.log(`Updated ${res1} rows in data_pendapatan`);

  console.log('Cleaning up setoran_pajak...');
  const res2 = await prisma.$executeRawUnsafe(`
    UPDATE setoran_pajak 
    SET uraian = split_part(uraian, '[Rekon]:', 1)
    WHERE uraian LIKE '%[Rekon]:%'
  `);
  console.log(`Updated ${res2} rows in setoran_pajak`);

  console.log('Done.');
  await prisma.$disconnect();
}

main();
