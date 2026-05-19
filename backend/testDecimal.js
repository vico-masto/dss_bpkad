const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const search = '500';
    const numSearch = parseFloat(search);
    
    const res = await prisma.data_sp2d.findMany({
      where: {
        OR: [
          { nomor: { contains: search, mode: 'insensitive' } },
          { nilai_bruto: { equals: numSearch } }
        ]
      },
      take: 2
    });
    console.log('Success, found rows:', res.length);
  } catch(e) {
    console.error('Prisma Error:', e);
  } finally {
    await prisma.$disconnect();
  }
}
main();
