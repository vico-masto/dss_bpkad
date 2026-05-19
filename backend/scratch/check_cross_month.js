const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCrossMonth() {
  const aprilEnd = new Date('2026-04-30T23:59:59.999Z');

  console.log('--- BKU (<= April) matched to Bank (> April) ---');
  
  // SP2D
  const crossSp2d = await prisma.$queryRaw`
    SELECT h.nomor, h.nilai_neto, b.tanggal as bank_tgl
    FROM data_sp2d h
    JOIN bank_statement b ON b.ref_bku_id = h.id
    WHERE COALESCE(h.tanggal_pencairan, h.tanggal) <= ${aprilEnd}
    AND b.tanggal > ${aprilEnd}
  `;
  console.log('SP2D:', crossSp2d);

  // Potongan
  const crossPot = await prisma.$queryRaw`
    SELECT p.nomor_sp2d, p.nilai, b.tanggal as bank_tgl
    FROM data_sp2d_potongan p
    JOIN bank_statement b ON b.ref_bku_id = p.id
    WHERE p.tanggal_pencairan <= ${aprilEnd}
    AND b.tanggal > ${aprilEnd}
  `;
  console.log('Potongan:', crossPot);
}

checkCrossMonth().finally(() => prisma.$disconnect());
