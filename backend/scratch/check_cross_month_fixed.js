const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkCrossMonth() {
  const aprilEnd = new Date('2026-04-30T23:59:59.999Z');

  console.log('--- BKU (<= April) matched to Bank (> April) ---');
  
  // SP2D
  const crossSp2d = await prisma.$queryRaw`
    SELECT h.nomor, h.nilai_neto, b.tanggal as bank_tgl
    FROM data_sp2d h
    JOIN bank_statement b ON b.ref_bku_id::VARCHAR = h.id::VARCHAR
    WHERE COALESCE(h.tanggal_pencairan, h.tanggal) <= ${aprilEnd}
    AND b.tanggal > ${aprilEnd}
  `;
  console.log('SP2D Cross:', crossSp2d);

  // Potongan
  const crossPot = await prisma.$queryRaw`
    SELECT p.nomor_sp2d, p.nilai, b.tanggal as bank_tgl
    FROM data_sp2d_potongan p
    JOIN bank_statement b ON b.ref_bku_id::VARCHAR = p.id::VARCHAR
    WHERE p.tanggal_pencairan <= ${aprilEnd}
    AND b.tanggal > ${aprilEnd}
  `;
  console.log('Potongan Cross:', crossPot);
  
  let sum = 0;
  crossSp2d.forEach(r => sum += Number(r.nilai_neto));
  crossPot.forEach(r => sum += Number(r.nilai));
  console.log('TOTAL CROSS MONTH (Out of Range):', sum);
}

checkCrossMonth().finally(() => prisma.$disconnect());
