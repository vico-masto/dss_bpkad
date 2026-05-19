/**
 * FIX: data_pendapatan.nilai = kredit_bank × 10 (Bug Import Desimal Varian ×10)
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

function fmtIDR(n) {
  return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
}

async function main() {
  console.log(`\n=== FIX NILAI ×10 | Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===\n`);

  const pairs = await prisma.$queryRaw`
    SELECT
      CAST(p.id AS VARCHAR)        AS p_id,
      p.nomor_bukti                AS p_nb,
      CAST(p.nilai AS DECIMAL)     AS p_nilai,
      CAST(bs.kredit AS DECIMAL)   AS bs_kredit
    FROM data_pendapatan p
    JOIN bank_statement bs ON LOWER(TRIM(bs.nomor_bukti)) = LOWER(TRIM(p.nomor_bukti))
    WHERE p.nomor_bukti IS NOT NULL AND p.nomor_bukti <> ''
      AND bs.kredit > 0 AND bs.is_matched = false
      AND COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%'
      AND ABS(CAST(p.nilai AS DECIMAL) - (CAST(bs.kredit AS DECIMAL) * 10)) < 10
      AND ABS(CAST(p.nilai AS DECIMAL) - (CAST(bs.kredit AS DECIMAL) * 100)) >= 100
    ORDER BY p.nomor_bukti
  `;

  console.log(`Pasangan ×10 terdeteksi: ${pairs.length}\n`);
  pairs.forEach((p, i) => {
    console.log(`[${i+1}] nb:${String(p.p_nb).padEnd(20)} | Bank Rp ${fmtIDR(p.bs_kredit).padStart(12)} | Pendapatan Rp ${fmtIDR(p.p_nilai).padStart(14)} | Fix→Rp ${fmtIDR(Number(p.p_nilai) / 10)}`);
  });

  if (pairs.length === 0 || DRY_RUN) {
    if (DRY_RUN) console.log('\nDRY RUN — tidak ada perubahan.');
    await prisma.$disconnect();
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const p of pairs) {
      const nilaiSesudah = Number(p.p_nilai) / 10;
      await tx.$queryRaw`UPDATE data_pendapatan SET nilai = ${nilaiSesudah} WHERE id::text = ${p.p_id}`;
      console.log(`  ✅ ${p.p_nb}: Rp ${fmtIDR(p.p_nilai)} → Rp ${fmtIDR(nilaiSesudah)}`);
    }
  });

  console.log(`\n✅ ${pairs.length} record nilai ×10 terkoreksi.\n`);
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('FATAL:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
