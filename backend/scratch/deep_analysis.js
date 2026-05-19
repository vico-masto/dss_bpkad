const prisma = require('../prismaClient');

async function run() {
  console.log("=== DEEP FORENSIC AUDIT ===");

  // 4. Calculate exact amount matches between BKU Penerimaan and Bank Kredit (using date subtraction directly in SQL)
  const matchedInc = await prisma.$queryRaw`
    SELECT COUNT(*) as count, SUM(p.nilai) as total_val
    FROM data_pendapatan p
    INNER JOIN bank_statement b ON p.nilai = b.kredit AND ABS(p.tanggal - b.tanggal) <= 7
  `;
  console.log(`\nExact amount matches (within H+7 window) for Penerimaan:`, matchedInc);

  // 5. Calculate exact amount matches between BKU SP2D Bruto/Neto and Bank Debet
  const matchedSp2dNeto = await prisma.$queryRaw`
    SELECT COUNT(*) as count, SUM(s.nilai_neto) as total_val
    FROM data_sp2d s
    INNER JOIN bank_statement b ON s.nilai_neto = b.debet AND ABS(s.tanggal - b.tanggal) <= 7
  `;
  console.log(`Exact matches (within H+7 window) for SP2D Neto with Bank Debet:`, matchedSp2dNeto);

  const matchedSp2dBruto = await prisma.$queryRaw`
    SELECT COUNT(*) as count, SUM(s.nilai_bruto) as total_val
    FROM data_sp2d s
    INNER JOIN bank_statement b ON s.nilai_bruto = b.debet AND ABS(s.tanggal - b.tanggal) <= 7
  `;
  console.log(`Exact matches (within H+7 window) for SP2D Bruto with Bank Debet:`, matchedSp2dBruto);

  // 6. Find large mismatched revenues in BKU
  const unmatchedBkuIn = await prisma.$queryRaw`
    SELECT id, tanggal, nomor_bukti, uraian, nilai
    FROM data_pendapatan p
    WHERE NOT EXISTS (
      SELECT 1 FROM bank_statement b 
      WHERE b.kredit = p.nilai AND ABS(b.tanggal - p.tanggal) <= 7
    )
    ORDER BY nilai DESC
    LIMIT 10
  `;
  console.log("\nTop 10 Unmatched BKU Revenues (Penerimaan BKU yang tidak ada di Bank):");
  unmatchedBkuIn.forEach(r => {
    console.log(`- ID: ${r.id}, Tanggal: ${r.tanggal.toISOString().split('T')[0]}, Nomor Bukti: "${r.nomor_bukti}", Uraian: "${r.uraian}", Nilai: ${Number(r.nilai).toLocaleString('id-ID')}`);
  });

  // Sum of all unmatched BKU revenues
  const totalUnmatchedBkuIn = await prisma.$queryRaw`
    SELECT COUNT(*) as count, SUM(nilai) as total
    FROM data_pendapatan p
    WHERE NOT EXISTS (
      SELECT 1 FROM bank_statement b 
      WHERE b.kredit = p.nilai AND ABS(b.tanggal - p.tanggal) <= 7
    )
  `;
  console.log("\nTotal Unmatched BKU Revenues:", totalUnmatchedBkuIn);

  // 7. Find large mismatched credits in Bank (excluding Saldo Awal)
  const unmatchedBankCredits = await prisma.$queryRaw`
    SELECT id, tanggal, deskripsi, kredit
    FROM bank_statement b
    WHERE b.kredit > 0 AND b.deskripsi != 'Saldo Awal' AND NOT EXISTS (
      SELECT 1 FROM data_pendapatan p 
      WHERE p.nilai = b.kredit AND ABS(p.tanggal - b.tanggal) <= 7
    )
    ORDER BY kredit DESC
    LIMIT 10
  `;
  console.log("\nTop 10 Unmatched Bank Credits (Mutasi Bank Masuk yang tidak ada di BKU):");
  unmatchedBankCredits.forEach(b => {
    console.log(`- ID: ${b.id}, Tanggal: ${b.tanggal.toISOString().split('T')[0]}, Deskripsi: "${b.deskripsi}", Kredit: ${Number(b.kredit).toLocaleString('id-ID')}`);
  });

  // Sum of all unmatched Bank credits (excluding Saldo Awal)
  const totalUnmatchedBankCredits = await prisma.$queryRaw`
    SELECT COUNT(*) as count, SUM(kredit) as total
    FROM bank_statement b
    WHERE b.kredit > 0 AND b.deskripsi != 'Saldo Awal' AND NOT EXISTS (
      SELECT 1 FROM data_pendapatan p 
      WHERE p.nilai = b.kredit AND ABS(p.tanggal - b.tanggal) <= 7
    )
  `;
  console.log("\nTotal Unmatched Bank Credits (excl. Saldo Awal):", totalUnmatchedBankCredits);
}

run()
  .catch(err => console.error("Error:", err))
  .finally(() => prisma.$disconnect());
