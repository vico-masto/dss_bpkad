const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditMonth(month, year = 2026) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  
  console.log(`\n=========================================`);
  console.log(`AUDIT DETIL BULAN: ${month} - ${year}`);
  console.log(`=========================================`);

  // 1. Get Unmatched BKU
  const unmatchedBku = await prisma.$queryRaw`
    SELECT 'SP2D' as tipe, nomor, nilai_neto as nilai, uraian FROM data_sp2d WHERE COALESCE(tanggal_pencairan, tanggal) BETWEEN ${start} AND ${end} AND status_rekon = 'BELUM'
    UNION ALL
    SELECT 'POTONGAN' as tipe, nomor_sp2d as nomor, nilai, uraian FROM data_sp2d_potongan WHERE tanggal_pencairan BETWEEN ${start} AND ${end} AND status_rekon = 'BELUM'
    UNION ALL
    SELECT 'PAJAK' as tipe, nomor_bukti as nomor, nilai, uraian FROM setoran_pajak WHERE tanggal BETWEEN ${start} AND ${end} AND status_rekon = 'BELUM' 
    AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = setoran_pajak.nomor_bukti)
  `;

  // 2. Get Unmatched Bank
  const unmatchedBank = await prisma.bank_statement.findMany({
    where: { tanggal: { gte: start, lte: end }, is_matched: false, debet: { gt: 0 } }
  });

  // 3. Get Matched with Anomaly
  const anomalies = await prisma.bank_statement.findMany({
    where: { tanggal: { gte: start, lte: end }, is_matched: true, selisih_nilai: { not: 0 } }
  });

  console.log(`\n1. TRANSAKSI BKU BELUM REKON (Pengeluaran):`);
  let sumBku = 0;
  unmatchedBku.forEach(item => {
    console.log(`   [${item.tipe}] ${item.nomor} | Rp ${Number(item.nilai).toLocaleString('id-ID')} | ${item.uraian.slice(0, 50)}`);
    sumBku += Number(item.nilai);
  });
  console.log(`   TOTAL BKU UNMATCHED: Rp ${sumBku.toLocaleString('id-ID')}`);

  console.log(`\n2. MUTASI BANK BELUM REKON (Debet):`);
  let sumBank = 0;
  unmatchedBank.forEach(item => {
    console.log(`   [BANK] ${item.tanggal.toISOString().split('T')[0]} | Rp ${Number(item.debet).toLocaleString('id-ID')} | ${item.deskripsi.slice(0, 50)}`);
    sumBank += Number(item.debet);
  });
  console.log(`   TOTAL BANK UNMATCHED: Rp ${sumBank.toLocaleString('id-ID')}`);

  console.log(`\n3. ANOMALI SELISIH NILAI (Sudah Match tapi Beda Nilai):`);
  let sumAnomali = 0;
  anomalies.forEach(item => {
    console.log(`   [ANOMALI] ID ${item.id} | Selisih: Rp ${Number(item.selisih_nilai).toLocaleString('id-ID')} | ${item.catatan_selisih}`);
    sumAnomali += Number(item.selisih_nilai);
  });
  console.log(`   TOTAL SELISIH ANOMALI: Rp ${sumAnomali.toLocaleString('id-ID')}`);

  const variance = sumBank - sumBku + sumAnomali;
  console.log(`\n-----------------------------------------`);
  console.log(`REKAPITULASI SELISIH AKHIR: Rp ${variance.toLocaleString('id-ID')}`);
  console.log(`-----------------------------------------`);
}

async function run() {
  await auditMonth(3);
  await auditMonth(4);
  await prisma.$disconnect();
}

run();
