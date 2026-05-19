const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findGlobalUnmatched() {
  const targetDate = new Date('2026-04-30T23:59:59.999Z');

  const unmatchedBku = await prisma.$queryRaw`
    SELECT 'SP2D' as tipe, nomor, nilai_neto as nilai, COALESCE(tanggal_pencairan, tanggal) as tgl FROM data_sp2d WHERE COALESCE(tanggal_pencairan, tanggal) <= ${targetDate} AND status_rekon = 'BELUM'
    UNION ALL
    SELECT 'POTONGAN' as tipe, nomor_sp2d as nomor, nilai, tanggal_pencairan as tgl FROM data_sp2d_potongan WHERE tanggal_pencairan <= ${targetDate} AND status_rekon = 'BELUM'
    UNION ALL
    SELECT 'PAJAK' as tipe, nomor_bukti as nomor, nilai, tanggal as tgl FROM setoran_pajak WHERE tanggal <= ${targetDate} AND status_rekon = 'BELUM' 
    AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = setoran_pajak.nomor_bukti)
  `;

  let sum = 0;
  unmatchedBku.forEach(u => {
    console.log(`[${u.tipe}] ${u.nomor} | ${u.tgl.toISOString().split('T')[0]} | Rp ${Number(u.nilai).toLocaleString()}`);
    sum += Number(u.nilai);
  });
  console.log(`TOTAL UNMATCHED BKU: Rp ${sum.toLocaleString()}`);
}

findGlobalUnmatched().finally(() => prisma.$disconnect());
