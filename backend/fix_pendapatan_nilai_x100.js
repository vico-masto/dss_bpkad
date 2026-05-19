/**
 * FIX: data_pendapatan.nilai = kredit_bank × 100 (Bug Import Desimal)
 * =====================================================================
 * Penyebab: Saat import Excel, nilai desimal (misal 4049.53) dibaca
 * sebagai integer 404953 (sen dianggap bagian dari bilangan bulat).
 * Akibat: nilai di data_pendapatan = 100× nilai sebenarnya di bank.
 *
 * Deteksi: nomor_bukti sama & nilai pendapatan ≈ kredit_bank × 100
 * Fix    : nilai pendapatan ← nilai pendapatan / 100
 *
 * Mode:
 *   node fix_pendapatan_nilai_x100.js --dry-run  → hanya laporan
 *   node fix_pendapatan_nilai_x100.js            → fix nyata
 */

const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

function fmtIDR(n) {
  return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
}
const SEP = '═'.repeat(70);
const SEP2 = '─'.repeat(70);

async function main() {
  console.log('\n' + SEP);
  console.log(' FIX: DATA_PENDAPATAN NILAI × 100 (BUG IMPORT DESIMAL)');
  console.log(SEP);
  console.log(` Mode  : ${DRY_RUN ? '🔍 DRY RUN' : '🚨 LIVE EXECUTION'}`);
  console.log(` Waktu : ${new Date().toLocaleString('id-ID')}\n`);

  // 1. Temukan semua pasangan bank ↔ pendapatan dengan nomor_bukti sama
  //    dan nilai pendapatan ≈ kredit bank × 100
  const pairs = await prisma.$queryRaw`
    SELECT
      CAST(p.id AS VARCHAR)        AS p_id,
      p.nomor_bukti                AS p_nb,
      CAST(p.nilai AS DECIMAL)     AS p_nilai,
      CAST(bs.kredit AS DECIMAL)   AS bs_kredit,
      CAST(bs.id AS VARCHAR)       AS bs_id,
      bs.tanggal                   AS bs_tgl,
      p.uraian                     AS p_uraian
    FROM data_pendapatan p
    JOIN bank_statement bs
      ON LOWER(TRIM(bs.nomor_bukti)) = LOWER(TRIM(p.nomor_bukti))
    WHERE p.nomor_bukti IS NOT NULL
      AND p.nomor_bukti <> ''
      AND bs.kredit > 0
      AND bs.is_matched = false
      AND COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%'
      -- Kondisi utama: nilai pendapatan = kredit bank × 100 (toleransi 1 rupiah per 100)
      AND ABS(CAST(p.nilai AS DECIMAL) - (CAST(bs.kredit AS DECIMAL) * 100)) < 100
    ORDER BY bs.tanggal, p.nomor_bukti
  `;

  console.log(`📊 PASANGAN TERDETEKSI (nilai pendapatan ≈ kredit bank × 100): ${pairs.length}\n`);

  if (pairs.length === 0) {
    console.log('✅ Tidak ada anomali × 100 ditemukan.\n');
    await prisma.$disconnect();
    return;
  }

  console.log(SEP2);
  console.log('DETAIL PASANGAN:');
  console.log(SEP2);
  for (const [i, p] of pairs.entries()) {
    const ratio = Number(p.p_nilai) / Number(p.bs_kredit);
    const nilaiSesudah = Number(p.p_nilai) / 100;
    console.log(`[${String(i+1).padStart(3)}] nb:${String(p.p_nb).padEnd(20)} | Bank Rp ${fmtIDR(p.bs_kredit).padStart(14)} | Pendapatan Rp ${fmtIDR(p.p_nilai).padStart(18)} | Rasio:${ratio.toFixed(2)} | Fix→Rp ${fmtIDR(nilaiSesudah)}`);
  }

  // 2. Cek pasangan yang nomor_buktinya cocok TAPI rasionya tidak ×100 (jangan disentuh)
  const allNbMatches = await prisma.$queryRaw`
    SELECT COUNT(*)::int as jumlah
    FROM data_pendapatan p
    JOIN bank_statement bs ON LOWER(TRIM(bs.nomor_bukti)) = LOWER(TRIM(p.nomor_bukti))
    WHERE p.nomor_bukti IS NOT NULL AND p.nomor_bukti <> ''
      AND bs.kredit > 0
      AND COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%'
  `;
  const tidakTerkena = (allNbMatches[0]?.jumlah || 0) - pairs.length;
  console.log(`\n  Total pasangan nb sama : ${allNbMatches[0]?.jumlah}`);
  console.log(`  Terkena bug × 100     : ${pairs.length}`);
  console.log(`  Tidak terkena (aman)  : ${tidakTerkena}`);

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — tidak ada perubahan dilakukan.');
    console.log(`   Jalankan tanpa --dry-run untuk eksekusi.\n`);
    await prisma.$disconnect();
    return;
  }

  // 3. Fix: UPDATE nilai = nilai / 100 dalam satu transaksi atomik
  console.log('\n🚨 MULAI FIX...\n');
  let berhasil = 0;
  let gagal = 0;

  await prisma.$transaction(async (tx) => {
    for (const p of pairs) {
      const nilaiSesudah = Number(p.p_nilai) / 100;
      try {
        await tx.$queryRaw`
          UPDATE data_pendapatan
          SET nilai = ${nilaiSesudah}
          WHERE id::text = ${p.p_id}
        `;
        console.log(`  ✅ ${p.p_nb} : Rp ${fmtIDR(p.p_nilai)} → Rp ${fmtIDR(nilaiSesudah)}`);
        berhasil++;
      } catch (err) {
        console.error(`  ❌ ${p.p_nb} : ${err.message}`);
        gagal++;
        throw err; // rollback seluruh transaksi jika ada yang gagal
      }
    }
  });

  // 4. Verifikasi: cek sisa anomali
  const sisaAnomalies = await prisma.$queryRaw`
    SELECT COUNT(*)::int as jumlah
    FROM data_pendapatan p
    JOIN bank_statement bs ON LOWER(TRIM(bs.nomor_bukti)) = LOWER(TRIM(p.nomor_bukti))
    WHERE p.nomor_bukti IS NOT NULL AND p.nomor_bukti <> ''
      AND bs.kredit > 0 AND bs.is_matched = false
      AND COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%'
      AND ABS(CAST(p.nilai AS DECIMAL) - (CAST(bs.kredit AS DECIMAL) * 100)) < 100
  `;

  console.log('\n' + SEP);
  console.log(' RINGKASAN');
  console.log(SEP);
  console.log(`  Terkena bug × 100 : ${pairs.length}`);
  console.log(`  Berhasil difix    : ${berhasil}`);
  console.log(`  Gagal             : ${gagal}`);
  console.log(`  Sisa anomali × 100: ${sisaAnomalies[0]?.jumlah || 0}`);
  console.log('');

  if ((sisaAnomalies[0]?.jumlah || 0) === 0 && gagal === 0) {
    console.log('  ✅ SEMUA NILAI TERKOREKSI — siap dicocokkan ulang.\n');
  } else {
    console.log('  ⚠️  Masih ada anomali atau kegagalan — periksa log di atas.\n');
  }

  console.log(SEP + '\n');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('\n❌ FATAL:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
