/**
 * FIX BATCH 2: 141 data_pendapatan.nilai masih ×100 dari bank.kredit
 * Sekaligus: koreksi nilai + link ke bank_statement (is_matched=true, status_rekon=SUDAH)
 * Run: node fix_pendapatan_x100_batch2.js [--dry-run]
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const WIT_OFFSET_MS = 9 * 60 * 60 * 1000;
const fmtDateWIT = (d) => {
  if (!d) return null;
  const raw = d instanceof Date ? d : new Date(String(d));
  if (isNaN(raw.getTime())) return null;
  return new Date(raw.getTime() + WIT_OFFSET_MS).toISOString().split('T')[0];
};
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }

async function main() {
  console.log(`\n=== FIX PENDAPATAN ×100 BATCH 2 | Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===\n`);

  // Deteksi semua pasangan:
  // - pendapatan BELUM + nomor_bukti cocok
  // - bank kredit unmatched
  // - p.nilai ≈ bank.kredit × 100 (toleransi <100)
  // - BUKAN kasus bank.kredit × 10 (untuk membedakan)
  const pairs = await prisma.$queryRaw`
    SELECT
      CAST(p.id AS VARCHAR)        AS p_id,
      p.nomor_bukti                AS p_nb,
      CAST(p.nilai AS DECIMAL)     AS p_nilai,
      p.tanggal                    AS p_tgl,
      p.uraian                     AS p_uraian,
      CAST(bs.id AS VARCHAR)       AS bs_id,
      CAST(bs.kredit AS DECIMAL)   AS bs_kredit,
      bs.tanggal                   AS bs_tgl,
      bs.deskripsi                 AS bs_desc
    FROM data_pendapatan p
    JOIN bank_statement bs
      ON LOWER(TRIM(bs.nomor_bukti)) = LOWER(TRIM(p.nomor_bukti))
    WHERE bs.kredit > 0
      AND bs.is_matched = false
      AND p.nomor_bukti IS NOT NULL AND p.nomor_bukti <> ''
      AND (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement bx
        WHERE TRIM(bx.ref_bku_id) = p.id::text AND bx.is_matched = true
      )
      AND ABS(CAST(p.nilai AS DECIMAL) - (CAST(bs.kredit AS DECIMAL) * 100)) < 100
      AND ABS(CAST(p.nilai AS DECIMAL) - (CAST(bs.kredit AS DECIMAL) * 10)) >= 10
    ORDER BY p.tanggal, p.nomor_bukti
  `;

  console.log(`Pasangan ×100 terdeteksi: ${pairs.length}\n`);

  let totalNilaiSebelum = 0, totalNilaiSesudah = 0;
  pairs.forEach((p, i) => {
    const tgl = fmtDateWIT(p.p_tgl);
    const nilaiSesudah = Number(p.p_nilai) / 100;
    const diff = Math.abs(nilaiSesudah - Number(p.bs_kredit));
    totalNilaiSebelum += Number(p.p_nilai);
    totalNilaiSesudah += nilaiSesudah;
    const check = diff < 1 ? '✅' : `⚠️ selisih ${fmtIDR(diff)}`;
    console.log(`[${String(i+1).padStart(3)}] ${tgl} | nb:${String(p.p_nb).padEnd(22)} | Rp ${fmtIDR(p.p_nilai).padStart(18)} → Rp ${fmtIDR(nilaiSesudah).padStart(15)} (bank:${fmtIDR(p.bs_kredit)}) ${check}`);
  });

  console.log(`\n  Total nilai SEBELUM : Rp ${fmtIDR(totalNilaiSebelum)}`);
  console.log(`  Total nilai SESUDAH : Rp ${fmtIDR(totalNilaiSesudah)}`);

  if (pairs.length === 0) {
    console.log('\nTidak ada yang perlu diperbaiki.');
    await prisma.$disconnect();
    return;
  }

  if (DRY_RUN) {
    console.log('\nDRY RUN — tidak ada perubahan.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n🚨 MULAI FIX + AUTO-LINK...\n');
  let berhasil = 0, gagal = 0;

  for (const pair of pairs) {
    try {
      await prisma.$transaction(async (tx) => {
        const nilaiSesudah = Number(pair.p_nilai) / 100;
        const bsIdInt = parseInt(pair.bs_id, 10);
        const bankDate = new Date(pair.bs_tgl);

        // 1. Koreksi nilai pendapatan
        await tx.$queryRaw`
          UPDATE data_pendapatan
          SET nilai = ${nilaiSesudah}
          WHERE id::text = ${pair.p_id}
        `;

        // 2. Link bank_statement → pendapatan
        await tx.bank_statement.update({
          where: { id: bsIdInt },
          data: {
            is_matched: true,
            ref_bku_id: pair.p_id,
            match_type: 'SMART_BUKTI',
            selisih_nilai: 0,
            catatan_selisih: null
          }
        });

        // 3. Update status_rekon pendapatan
        await tx.$queryRaw`
          UPDATE data_pendapatan
          SET status_rekon       = 'SUDAH',
              selisih_rekon      = 0,
              keterangan_rekon   = 'Auto-Matched via Nomor Bukti (fix ×100)',
              tanggal_pencairan  = ${bankDate}
          WHERE id::text = ${pair.p_id}
        `;
      });

      console.log(`  ✅ ${pair.p_nb} | Rp ${fmtIDR(pair.p_nilai)} → Rp ${fmtIDR(Number(pair.p_nilai)/100)}`);
      berhasil++;
    } catch (err) {
      console.error(`  ❌ ${pair.p_nb}: ${err.message}`);
      gagal++;
    }
  }

  // Verifikasi akhir
  const sisaBelum = await prisma.data_pendapatan.count({
    where: { OR: [{ status_rekon: 'BELUM' }, { status_rekon: null }, { status_rekon: '' }] }
  });
  const sisaBankUnmatch = await prisma.bank_statement.count({
    where: { is_matched: false, kredit: { gt: 0 }, NOT: { nomor_bukti: 'SiLPA' } }
  });

  console.log(`\n${'═'.repeat(60)}`);
  console.log(` RINGKASAN FIX BATCH 2`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Berhasil difix+link  : ${berhasil}`);
  console.log(`  Gagal                : ${gagal}`);
  console.log(`  Sisa pendapatan BELUM: ${sisaBelum}`);
  console.log(`  Sisa bank kredit unmatched (di luar SiLPA): ${sisaBankUnmatch}`);
  if (sisaBelum === 0) console.log(`\n  ✅ SEMUA PENDAPATAN TERCOCOKKAN!\n`);
  console.log(`${'═'.repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('FATAL:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
