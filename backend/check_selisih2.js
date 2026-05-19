const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const q = await prisma.$queryRaw`SELECT * FROM data_sp2d WHERE status_rekon LIKE 'SUDAH%' AND selisih_rekon IS NOT NULL AND ABS(CAST(selisih_rekon AS DECIMAL)) > 0.005 LIMIT 5`;
  console.log('SP2D:', q.length, q.length > 0 ? q[0].selisih_rekon : '');
  
  const q2 = await prisma.$queryRaw`SELECT * FROM data_sp2d_potongan WHERE status_rekon LIKE 'SUDAH%' AND selisih_rekon IS NOT NULL AND ABS(CAST(selisih_rekon AS DECIMAL)) > 0.005 LIMIT 5`;
  console.log('Potongan:', q2.length, q2.length > 0 ? q2[0].selisih_rekon : '');
  
  const q3 = await prisma.$queryRaw`SELECT * FROM setoran_pajak WHERE status_rekon LIKE 'SUDAH%' AND selisih_rekon IS NOT NULL AND ABS(CAST(selisih_rekon AS DECIMAL)) > 0.005 LIMIT 5`;
  console.log('Setoran:', q3.length, q3.length > 0 ? q3[0].selisih_rekon : '');
}
main().catch(console.error).finally(() => prisma.$disconnect());
