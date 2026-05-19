const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const targetDate = new Date('2026-04-30T23:59:59.999Z');
  const res = await prisma.data_sp2d.findMany({ 
    where: { 
      status_rekon: 'BELUM',
      tanggal: { lte: targetDate } // Rough check
    } 
  });
  
  let sum = 0;
  res.forEach(r => {
    const tgl = r.tanggal_pencairan || r.tanggal;
    if (tgl <= targetDate) {
      console.log(`${r.nomor} | ${tgl.toISOString().split('T')[0]} | ${r.nilai_neto}`);
      sum += Number(r.nilai_neto);
    }
  });
  console.log('TOTAL BELUM SP2D:', sum);
}

check().finally(() => prisma.$disconnect());
