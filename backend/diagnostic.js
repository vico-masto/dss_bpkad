const { PrismaClient } = require('./prismaClient');

const prisma = new PrismaClient();

async function runDiagnostics() {
  try {
    console.log("=== BPKAD GARBAGE DATA DIAGNOSTICS ===");

    // 1. Ghost Match Bank -> BKU (Bank says matched, but ref_bku_id is null)
    const ghostBankNoRef = await prisma.$queryRaw`
      SELECT id, tanggal, deskripsi, debet, kredit 
      FROM bank_statement 
      WHERE is_matched = true AND (ref_bku_id IS NULL OR TRIM(ref_bku_id) = '')
    `;
    console.log(`\n[1] Mutasi Bank berstatus 'SUDAH' tapi ref_bku_id KOSONG: ${ghostBankNoRef.length} data`);

    // 2. Ghost Match BKU -> Bank (BKU says SUDAH, but no bank statement links to it)
    const ghostSp2d = await prisma.$queryRaw`
      SELECT id, nomor, tanggal, status_rekon 
      FROM data_sp2d h
      WHERE h.status_rekon LIKE '%SUDAH%' 
      AND NOT EXISTS (SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = CAST(h.id AS VARCHAR))
    `;
    console.log(`[2A] SP2D 'SUDAH' tapi tidak ada Mutasi Bank: ${ghostSp2d.length} data`);

    const ghostPendapatan = await prisma.$queryRaw`
      SELECT id, nomor_bukti, tanggal, status_rekon 
      FROM data_pendapatan p
      WHERE p.status_rekon LIKE '%SUDAH%' 
      AND NOT EXISTS (SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = CAST(p.id AS VARCHAR))
    `;
    console.log(`[2B] Pendapatan 'SUDAH' tapi tidak ada Mutasi Bank: ${ghostPendapatan.length} data`);

    const ghostPotongan = await prisma.$queryRaw`
      SELECT id, nomor_sp2d, uraian, status_rekon 
      FROM data_sp2d_potongan p
      WHERE p.status_rekon LIKE '%SUDAH%' 
      AND NOT EXISTS (SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = CAST(p.id AS VARCHAR))
    `;
    console.log(`[2C] Potongan 'SUDAH' tapi tidak ada Mutasi Bank: ${ghostPotongan.length} data`);

    const ghostPajak = await prisma.$queryRaw`
      SELECT id, nomor_bukti, uraian, status_rekon 
      FROM setoran_pajak p
      WHERE p.status_rekon LIKE '%SUDAH%' 
      AND NOT EXISTS (SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = CAST(p.id AS VARCHAR))
    `;
    console.log(`[2D] Pajak 'SUDAH' tapi tidak ada Mutasi Bank: ${ghostPajak.length} data`);

    // 3. Duplicate Bank Linking (Multiple bank statements pointing to the same BKU)
    const dupBank = await prisma.$queryRaw`
      SELECT ref_bku_id, COUNT(*) as count 
      FROM bank_statement 
      WHERE is_matched = true AND ref_bku_id IS NOT NULL AND TRIM(ref_bku_id) != ''
      GROUP BY ref_bku_id 
      HAVING COUNT(*) > 1
    `;
    console.log(`\n[3] BKU ID ganda (Satu BKU di-claim oleh banyak Mutasi Bank): ${dupBank.length} kasus`);

    console.log("\n=== SELESAI ===");
  } catch (e) {
    console.error("Error running diagnostics:", e);
  } finally {
    await prisma.$disconnect();
  }
}

runDiagnostics();
