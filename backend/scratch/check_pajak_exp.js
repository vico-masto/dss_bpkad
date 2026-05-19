const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPajak() {
  const res = await prisma.$queryRaw`
    SELECT SUM(nilai) as v 
    FROM setoran_pajak 
    WHERE tanggal <= '2026-04-30' 
    AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p2 WHERE p2.nomor_sp2d = setoran_pajak.nomor_bukti)
  `;
  console.log('Setoran Pajak Murni (Exp):', res[0].v);
}

checkPajak().finally(() => prisma.$disconnect());
