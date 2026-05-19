const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deepAudit(month, targetVariance) {
  const start = new Date(2026, month - 1, 1);
  const end = new Date(2026, month, 0, 23, 59, 59, 999);
  
  console.log(`\n--- DEEP AUDIT MONTH ${month} (Target Variance: ${targetVariance}) ---`);

  // 1. Get ALL unmatched BKU items in this month
  const unmatchedBku = await prisma.$queryRaw`
    SELECT 'SP2D' as tipe, nomor, CAST(nilai_neto AS DECIMAL) as nilai, uraian, status_rekon
    FROM data_sp2d WHERE COALESCE(tanggal_pencairan, tanggal) BETWEEN ${start} AND ${end} AND status_rekon = 'BELUM'
    UNION ALL
    SELECT 'POTONGAN' as tipe, nomor_sp2d as nomor, CAST(nilai AS DECIMAL) as nilai, uraian, status_rekon
    FROM data_sp2d_potongan WHERE tanggal_pencairan BETWEEN ${start} AND ${end} AND status_rekon = 'BELUM'
    UNION ALL
    SELECT 'PAJAK' as tipe, nomor_bukti as nomor, CAST(nilai AS DECIMAL) as nilai, uraian, status_rekon
    FROM setoran_pajak WHERE tanggal BETWEEN ${start} AND ${end} AND status_rekon = 'BELUM'
  `;

  // 2. Get ALL unmatched Bank Debet (Pengeluaran) in this month
  const unmatchedBank = await prisma.bank_statement.findMany({
    where: {
      tanggal: { gte: start, lte: end },
      is_matched: false,
      debet: { gt: 0 }
    }
  });

  // 3. Get all Anomaly differences (Matched with diff)
  const anomalies = await prisma.bank_statement.findMany({
    where: {
      tanggal: { gte: start, lte: end },
      is_matched: true,
      selisih_nilai: { not: 0 }
    }
  });

  console.log(`\nUnmatched BKU Expenditures:`);
  let sumBku = 0;
  unmatchedBku.forEach(i => {
    console.log(`  [${i.tipe}] ${i.nomor}: Rp ${Number(i.nilai).toLocaleString('id-ID')} - ${i.uraian.slice(0, 40)}`);
    sumBku += Number(i.nilai);
  });

  console.log(`\nUnmatched Bank Debets:`);
  let sumBank = 0;
  unmatchedBank.forEach(i => {
    console.log(`  [BANK] ${i.tanggal.toISOString().split('T')[0]}: Rp ${Number(i.debet).toLocaleString('id-ID')} - ${i.deskripsi.slice(0, 40)}`);
    sumBank += Number(i.debet);
  });

  console.log(`\nAnomaly Variances (Bank - BKU):`);
  let sumAnomali = 0;
  anomalies.forEach(i => {
    console.log(`  [ANOMALI] Bank ID ${i.id}: Rp ${Number(i.selisih_nilai).toLocaleString('id-ID')} (Catatan: ${i.catatan_selisih?.slice(0, 50)})`);
    sumAnomali += Number(i.selisih_nilai);
  });

  const calculatedVariance = sumBank - sumBku + sumAnomali;
  console.log(`\n-----------------------------------------`);
  console.log(`Calculated Variance (Bank - BKU): Rp ${calculatedVariance.toLocaleString('id-ID')}`);
  console.log(`Target Variance from Image:      Rp ${targetVariance.toLocaleString('id-ID')}`);
  console.log(`Gap:                             Rp ${(calculatedVariance - targetVariance).toLocaleString('id-ID')}`);
}

async function run() {
  await deepAudit(3, 18661.8);
  await deepAudit(4, -3601); // April in image has BKU > Bank, so Bank - BKU is negative
  await prisma.$disconnect();
}

run();
