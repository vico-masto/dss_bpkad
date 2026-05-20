const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("=== Auditing SP2Ds with Header Potongan but No Detail Potongan ===");
  
  const targetYear = 2026;
  
  // Find SP2Ds with no detail potongan but non-zero header potongan
  const SP2Ds = await prisma.$queryRaw`
    SELECT s.id, s.nomor, s.tanggal, s.tanggal_pencairan, s.nilai_bruto, s.nilai_potongan, s.nilai_neto, s.status_rekon,
           COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = s.id), 0) as detail_potongan_sum
    FROM data_sp2d s
    WHERE s.tahun = ${targetYear}
      AND s.nilai_potongan > 0
  `;
  
  let totalHeaderPotonganNoDetail = 0;
  let mismatchCount = 0;
  
  console.log("\nList of SP2Ds with discrepancy between header nilai_potongan and detail potongan sum:");
  
  for (const s of SP2Ds) {
    const diff = Number(s.nilai_potongan) - Number(s.detail_potongan_sum);
    if (diff !== 0) {
      mismatchCount++;
      totalHeaderPotonganNoDetail += diff;
      console.log(`- SP2D: ${s.nomor} | Tgl Pencairan: ${s.tanggal_pencairan ? s.tanggal_pencairan.toISOString().split('T')[0] : 'NULL'} | Status Rekon: ${s.status_rekon} | Bruto: ${Number(s.nilai_bruto)} | Header Potongan: ${Number(s.nilai_potongan)} | Detail Potongan Sum: ${Number(s.detail_potongan_sum)} | Diff: ${diff}`);
    }
  }
  
  console.log(`\nSummary:`);
  console.log(`Total SP2D with mismatch: ${mismatchCount}`);
  console.log(`Total Mismatch Amount: Rp ${totalHeaderPotonganNoDetail.toLocaleString('id-ID')}`);
  
  await prisma.$disconnect();
}

run().catch(console.error);
