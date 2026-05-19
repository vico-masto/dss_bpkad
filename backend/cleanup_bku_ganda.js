/**
 * GARBAGE COLLECTOR — BKU GANDA (Polygamy Data)
 * ================================================
 * Masalah: 1 ref_bku_id diklaim oleh > 1 bank_statement (is_matched = true).
 * Penyebab: kegagalan proses Batal Rekon (Undo) sebelum ACID transaction diterapkan.
 *
 * Tindakan:
 *   - Reset SEMUA bank_statement yang mengklaim BKU ganda → is_matched=false
 *   - Reset BKU terkait (SP2D / Pendapatan / Potongan / Pajak) → status_rekon='BELUM'
 *   - Setiap grup diproses dalam satu $transaction atomik (tidak ada partial reset)
 *
 * Mode:
 *   node cleanup_bku_ganda.js --dry-run   → laporan saja, tidak ada perubahan
 *   node cleanup_bku_ganda.js             → eksekusi nyata
 *
 * Setelah selesai: lakukan scan ulang rekon dari antarmuka utama.
 */

const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = process.argv.includes('--dry-run');

const SEP  = '═'.repeat(60);
const SEP2 = '─'.repeat(60);

function fmtIDR(n) {
  return new Intl.NumberFormat('id-ID').format(Number(n) || 0);
}

async function main() {
  console.log('\n' + SEP);
  console.log(' DSS BPKAD — GARBAGE COLLECTOR: BKU GANDA');
  console.log(SEP);
  console.log(` Mode  : ${DRY_RUN ? '🔍 DRY RUN (tidak ada perubahan ke DB)' : '🚨 LIVE EXECUTION'}`);
  console.log(` Waktu : ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jayapura' })}`);
  console.log(SEP + '\n');

  // ── Langkah 1: Deteksi semua BKU Ganda ───────────────────────────────────────
  const duplicates = await prisma.$queryRaw`
    SELECT
      bs.ref_bku_id,
      COUNT(bs.id)::int                          AS claim_count,
      ARRAY_AGG(bs.id ORDER BY bs.id)            AS bank_ids,
      ARRAY_AGG(bs.tanggal::text ORDER BY bs.id) AS tanggals,
      ARRAY_AGG(bs.deskripsi ORDER BY bs.id)     AS deskripsis,
      ARRAY_AGG(
        CAST(COALESCE(bs.debet, 0) + COALESCE(bs.kredit, 0) AS TEXT)
        ORDER BY bs.id
      )                                           AS nilais,
      ARRAY_AGG(COALESCE(bs.match_type, '-') ORDER BY bs.id) AS match_types
    FROM bank_statement bs
    WHERE bs.ref_bku_id IS NOT NULL
      AND bs.is_matched = true
    GROUP BY bs.ref_bku_id
    HAVING COUNT(bs.id) > 1
    ORDER BY COUNT(bs.id) DESC, bs.ref_bku_id
  `;

  const totalGanda = duplicates.length;
  const totalBankTerdampak = duplicates.reduce((s, d) => s + Number(d.claim_count), 0);

  console.log(`📊 HASIL DETEKSI`);
  console.log(SEP2);
  console.log(`  BKU Ganda (unique ref_bku_id): ${totalGanda}`);
  console.log(`  Bank Statement terdampak      : ${totalBankTerdampak}`);
  console.log('');

  if (totalGanda === 0) {
    console.log('✅ Tidak ada BKU Ganda. Database bersih. Selesai.\n');
    await prisma.$disconnect();
    return;
  }

  // ── Langkah 2: Cetak detail tiap kasus ───────────────────────────────────────
  console.log(`📋 DETAIL KASUS BKU GANDA`);
  console.log(SEP2);

  let no = 0;
  for (const dup of duplicates) {
    no++;
    const { ref_bku_id, claim_count, bank_ids, tanggals, deskripsis, nilais, match_types } = dup;
    console.log(`\n  [${String(no).padStart(3, '0')}] BKU ID : ${ref_bku_id}`);
    console.log(`        Diklaim : ${claim_count} bank statement`);
    for (let i = 0; i < bank_ids.length; i++) {
      const tgl   = String(tanggals[i] || '-').substring(0, 10);
      const nil   = fmtIDR(nilais[i]);
      const mtype = match_types[i] || '-';
      const desk  = String(deskripsis[i] || '-').substring(0, 40);
      console.log(`        Bank #${bank_ids[i].toString().padStart(5)} | ${tgl} | Rp ${nil.padStart(15)} | ${mtype.padEnd(12)} | ${desk}`);
    }
  }

  console.log('\n' + SEP2);

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN — Tidak ada perubahan dilakukan.');
    console.log(`   Untuk eksekusi: node cleanup_bku_ganda.js\n`);
    await prisma.$disconnect();
    return;
  }

  // ── Langkah 3: Reset semua kasus (atomik per grup) ───────────────────────────
  console.log('\n🚨 MULAI PROSES RESET...\n');

  const bkuResetData = {
    status_rekon    : 'BELUM',
    selisih_rekon   : 0,
    keterangan_rekon: null,
    tanggal_pencairan: null
  };

  const bankResetData = {
    is_matched     : false,
    ref_bku_id     : null,
    match_type     : null,
    selisih_nilai  : 0,
    catatan_selisih: null
  };

  let berhasil = 0;
  let gagal    = 0;

  for (const dup of duplicates) {
    const { ref_bku_id, bank_ids, claim_count } = dup;
    const bkuId = String(ref_bku_id);

    try {
      await prisma.$transaction(async (tx) => {
        // Reset semua bank statement yang mengklaim BKU ini
        // (ref_bku_id adalah VARCHAR — aman untuk Prisma ORM)
        await tx.bank_statement.updateMany({
          where: { ref_bku_id: bkuId, is_matched: true },
          data : bankResetData
        });

        // Reset BKU via $queryRaw — bypass Prisma UUID validation untuk ID non-UUID
        // (SP2D-xxx, TRX-xxx, dll.) yang ada di data historis sebelum sistem diubah ke UUID murni
        // id::text — cast UUID ke text sebelum membandingkan, agar tidak gagal untuk
        // ref_bku_id non-UUID (SP2D-xxx, TRX-xxx). Jika ID tidak ditemukan, 0 baris diupdate — aman.
        await Promise.all([
          tx.$queryRaw`UPDATE data_sp2d SET status_rekon='BELUM', selisih_rekon=0, keterangan_rekon=NULL, tanggal_pencairan=NULL WHERE id::text = ${bkuId}`,
          tx.$queryRaw`UPDATE data_pendapatan SET status_rekon='BELUM', selisih_rekon=0, keterangan_rekon=NULL, tanggal_pencairan=NULL WHERE id::text = ${bkuId}`,
          tx.$queryRaw`UPDATE data_sp2d_potongan SET status_rekon='BELUM', selisih_rekon=0, keterangan_rekon=NULL, tanggal_pencairan=NULL WHERE id::text = ${bkuId}`,
          tx.$queryRaw`UPDATE setoran_pajak SET status_rekon='BELUM', selisih_rekon=0, keterangan_rekon=NULL, tanggal_pencairan=NULL WHERE id::text = ${bkuId}`,
        ]);
      });

      console.log(`  ✅ RESET OK — BKU ${bkuId} (${claim_count} bank statement dilepas)`);
      berhasil++;
    } catch (err) {
      console.error(`  ❌ GAGAL  — BKU ${bkuId}: ${err.message}`);
      gagal++;
    }
  }

  // ── Langkah 4: Verifikasi pasca-cleanup ──────────────────────────────────────
  const sisa = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT ref_bku_id)::int AS jumlah
    FROM bank_statement
    WHERE ref_bku_id IS NOT NULL AND is_matched = true
    GROUP BY ref_bku_id
    HAVING COUNT(*) > 1
  `;

  const sisaGanda = sisa.length;

  console.log('\n' + SEP);
  console.log(' RINGKASAN HASIL CLEANUP');
  console.log(SEP);
  console.log(`  BKU Ganda ditemukan  : ${totalGanda}`);
  console.log(`  Berhasil direset     : ${berhasil}`);
  console.log(`  Gagal                : ${gagal}`);
  console.log(`  Bank statement dilepas: ${totalBankTerdampak}`);
  console.log(`  Sisa BKU Ganda (verif): ${sisaGanda}`);
  console.log('');

  if (sisaGanda === 0) {
    console.log('  ✅ DATABASE BERSIH SEMPURNA — Siap scan ulang dari antarmuka rekon.\n');
  } else {
    console.log(`  ⚠️  Masih ada ${sisaGanda} BKU Ganda — periksa log GAGAL di atas.\n`);
  }

  console.log(SEP + '\n');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ FATAL ERROR:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
