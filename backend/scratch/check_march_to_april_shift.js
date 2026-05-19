const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkShift() {
  const marchEnd = new Date('2026-03-31T23:59:59.999Z');
  const aprilEnd = new Date('2026-04-30T23:59:59.999Z');

  console.log('--- BKU March matched to Bank April ---');
  
  const res = await prisma.$queryRaw`
    SELECT h.nomor, h.nilai_neto, b.tanggal as bank_tgl, COALESCE(h.tanggal_pencairan, h.tanggal) as bku_tgl
    FROM data_sp2d h
    JOIN bank_statement b ON b.ref_bku_id::VARCHAR = h.id::VARCHAR
    WHERE COALESCE(h.tanggal_pencairan, h.tanggal) <= ${marchEnd}
    AND b.tanggal > ${marchEnd} AND b.tanggal <= ${aprilEnd}
  `;
  console.log(res);

  let sum = 0;
  res.forEach(r => sum += Number(r.nilai_neto));
  console.log('TOTAL SHIFT:', sum);
}

checkShift().finally(() => prisma.$disconnect());
