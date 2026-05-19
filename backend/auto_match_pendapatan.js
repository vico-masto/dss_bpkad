/**
 * AUTO MATCH: Cocokkan 98 bank kredit (nilai sudah dikoreksi) ke data_pendapatan
 * via nomor_bukti exact match — atomic, satu transaksi per pasangan
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
function fmtIDR(n) {
  return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
}

async function main() {
  console.log(`\n=== AUTO MATCH PENDAPATAN | Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===\n`);

  // Cari semua pasangan siap cocok: nomor_bukti sama, nilai cocok persis (toleransi <1)
  const pairs = await prisma.$queryRaw`
    SELECT
      CAST(bs.id AS VARCHAR)        AS bs_id,
      CAST(bs.kredit AS DECIMAL)    AS bs_kredit,
      bs.tanggal                    AS bs_tgl,
      bs.nomor_bukti                AS bs_nb,
      CAST(p.id AS VARCHAR)         AS p_id,
      CAST(p.nilai AS DECIMAL)      AS p_nilai,
      p.tanggal                     AS p_tgl,
      p.uraian
    FROM bank_statement bs
    JOIN data_pendapatan p
      ON LOWER(TRIM(bs.nomor_bukti)) = LOWER(TRIM(p.nomor_bukti))
    WHERE bs.kredit > 0
      AND bs.is_matched = false
      AND bs.nomor_bukti IS NOT NULL AND bs.nomor_bukti NOT IN ('SiLPA', '')
      AND COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%'
      AND NOT EXISTS (SELECT 1 FROM bank_statement bx WHERE TRIM(bx.ref_bku_id) = TRIM(CAST(p.id AS VARCHAR)))
      AND ABS(CAST(p.nilai AS DECIMAL) - CAST(bs.kredit AS DECIMAL)) < 1
    ORDER BY bs.tanggal, bs.nomor_bukti
  `;

  console.log(`Pasangan siap cocok (nomor_bukti + nilai sama): ${pairs.length}\n`);
  pairs.forEach((p, i) => {
    const tgl = fmtDateWIT(p.bs_tgl);
    console.log(`[${String(i+1).padStart(3)}] ${tgl} | nb:${String(p.bs_nb).padEnd(20)} | Rp ${fmtIDR(p.bs_kredit)}`);
  });

  // Cek SiLPA
  const silpa = await prisma.bank_statement.findFirst({
    where: { nomor_bukti: 'SiLPA', is_matched: false }
  });
  if (silpa) {
    console.log(`\n⚠️  SiLPA (Rp ${fmtIDR(silpa.kredit)}) tidak dicocokkan di sini — perlu perlakuan khusus via modul Saldo Awal.`);
  }

  if (pairs.length === 0 || DRY_RUN) {
    if (DRY_RUN) console.log('\nDRY RUN — tidak ada perubahan.');
    await prisma.$disconnect();
    return;
  }

  console.log('\n🚨 MULAI AUTO MATCH...\n');
  let berhasil = 0;
  let gagal = 0;

  for (const pair of pairs) {
    try {
      await prisma.$transaction(async (tx) => {
        const bankDate = new Date(pair.bs_tgl);
        const bsIdInt = parseInt(pair.bs_id, 10); // bank_statement.id adalah INT

        // Update bank_statement
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

        // Update data_pendapatan
        await tx.$queryRaw`
          UPDATE data_pendapatan
          SET status_rekon = 'SUDAH',
              selisih_rekon = 0,
              keterangan_rekon = 'Auto-Matched via Nomor Bukti',
              tanggal_pencairan = ${bankDate}
          WHERE id::text = ${pair.p_id}
        `;
      });

      console.log(`  ✅ ${pair.bs_nb} | Rp ${fmtIDR(pair.bs_kredit)}`);
      berhasil++;
    } catch (err) {
      console.error(`  ❌ ${pair.bs_nb}: ${err.message}`);
      gagal++;
    }
  }

  // Verifikasi akhir
  const sisaUnmatch = await prisma.bank_statement.count({
    where: { is_matched: false, kredit: { gt: 0 }, nomor_bukti: { not: 'SiLPA' } }
  });
  const sisaBelum = await prisma.data_pendapatan.count({
    where: { OR: [{ status_rekon: 'BELUM' }, { status_rekon: null }, { status_rekon: '' }] }
  });

  console.log(`\n${'═'.repeat(60)}`);
  console.log(` RINGKASAN AUTO MATCH`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Berhasil dicocokkan  : ${berhasil}`);
  console.log(`  Gagal                : ${gagal}`);
  console.log(`  Sisa bank belum cocok: ${sisaUnmatch} (di luar SiLPA)`);
  console.log(`  Sisa pendapatan BELUM: ${sisaBelum}`);
  if (gagal === 0 && sisaUnmatch === 0) {
    console.log(`\n  ✅ SEMUA PENERIMAAN TERCOCOKKAN!\n`);
  } else if (sisaUnmatch > 0) {
    console.log(`\n  ⚠️  Masih ada ${sisaUnmatch} bank penerimaan tanpa pasangan pendapatan — perlu dicek manual.\n`);
  }
  console.log(`${'═'.repeat(60)}\n`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('FATAL:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
