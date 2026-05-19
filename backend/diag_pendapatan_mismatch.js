/**
 * Diagnosa: data_pendapatan BELUM tapi bank_statement sudah matched ke record tersebut
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const SEP = '═'.repeat(90);
const SEP2 = '─'.repeat(90);
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }

async function main() {
  console.log('\n' + SEP);
  console.log(' DIAGNOSA: data_pendapatan BELUM ↔ bank_statement SUDAH MATCHED');
  console.log(SEP + '\n');

  // ── Kasus 1: bank.ref_bku_id → p.id, tapi p.status_rekon masih BELUM/NULL ──
  const case1 = await prisma.$queryRaw`
    SELECT
      p.id::text            AS p_id,
      p.nomor_bukti         AS p_nb,
      p.uraian              AS p_uraian,
      CAST(p.nilai AS DECIMAL) AS p_nilai,
      p.status_rekon        AS p_status,
      p.tanggal             AS p_tgl,
      bs.id                 AS bs_id,
      bs.nomor_bukti        AS bs_nb,
      bs.deskripsi          AS bs_desc,
      CAST(bs.kredit AS DECIMAL) AS bs_kredit,
      bs.tanggal            AS bs_tgl,
      bs.match_type         AS bs_match,
      bs.is_matched         AS bs_matched
    FROM data_pendapatan p
    JOIN bank_statement bs ON TRIM(bs.ref_bku_id) = p.id::text
    WHERE bs.is_matched = true
      AND (
        p.status_rekon IS NULL OR
        p.status_rekon = '' OR
        p.status_rekon = 'BELUM'
      )
    ORDER BY p.tanggal, p.nomor_bukti
  `;

  console.log(`① Bank MATCHED → Pendapatan masih BELUM (via ref_bku_id): ${case1.length} record\n`);
  case1.forEach((r, i) => {
    const tgl = r.p_tgl ? new Date(r.p_tgl).toISOString().split('T')[0] : '-';
    const diff = Math.abs(Number(r.p_nilai) - Number(r.bs_kredit));
    console.log(`  [${String(i+1).padStart(3)}] ${tgl} | p.nb:${String(r.p_nb||'').padEnd(22)} | p.nilai:${fmtIDR(r.p_nilai).padStart(18)} | bs.kredit:${fmtIDR(r.bs_kredit).padStart(18)} | selisih:${fmtIDR(diff).padStart(10)} | match:${r.bs_match||'-'} | p.status:${r.p_status||'NULL'}`);
  });

  // ── Kasus 2: nomor_bukti sama, nilai cocok, bank matched tapi pendapatan BELUM ──
  const case2 = await prisma.$queryRaw`
    SELECT
      p.id::text            AS p_id,
      p.nomor_bukti         AS p_nb,
      p.uraian              AS p_uraian,
      CAST(p.nilai AS DECIMAL) AS p_nilai,
      p.status_rekon        AS p_status,
      p.tanggal             AS p_tgl,
      bs.id                 AS bs_id,
      bs.nomor_bukti        AS bs_nb,
      CAST(bs.kredit AS DECIMAL) AS bs_kredit,
      bs.tanggal            AS bs_tgl,
      bs.match_type         AS bs_match,
      bs.ref_bku_id         AS bs_ref
    FROM data_pendapatan p
    JOIN bank_statement bs
      ON LOWER(TRIM(bs.nomor_bukti)) = LOWER(TRIM(p.nomor_bukti))
      AND ABS(CAST(p.nilai AS DECIMAL) - CAST(bs.kredit AS DECIMAL)) < 1
    WHERE bs.is_matched = true
      AND (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement bx WHERE TRIM(bx.ref_bku_id) = p.id::text AND bx.is_matched = true
      )
    ORDER BY p.tanggal, p.nomor_bukti
  `;

  console.log(`\n② Bank MATCHED (nomor_bukti+nilai sama) tapi ref_bku_id tidak menunjuk ke p.id: ${case2.length} record\n`);
  case2.forEach((r, i) => {
    const tgl = r.p_tgl ? new Date(r.p_tgl).toISOString().split('T')[0] : '-';
    console.log(`  [${String(i+1).padStart(3)}] ${tgl} | nb:${String(r.p_nb||'').padEnd(22)} | p.nilai:${fmtIDR(r.p_nilai).padStart(18)} | bs.kredit:${fmtIDR(r.bs_kredit).padStart(18)} | bs.ref:${String(r.bs_ref||'NULL').substring(0,15)} | match:${r.bs_match||'-'}`);
  });

  // ── Kasus 3: pendapatan BELUM tapi ada bank kredit dengan nilai IDENTIK (toleransi <1) ──
  const case3 = await prisma.$queryRaw`
    SELECT
      p.id::text            AS p_id,
      p.nomor_bukti         AS p_nb,
      p.uraian              AS p_uraian,
      CAST(p.nilai AS DECIMAL) AS p_nilai,
      p.status_rekon        AS p_status,
      p.tanggal             AS p_tgl,
      bs.id                 AS bs_id,
      bs.nomor_bukti        AS bs_nb,
      bs.deskripsi          AS bs_desc,
      CAST(bs.kredit AS DECIMAL) AS bs_kredit,
      bs.tanggal            AS bs_tgl,
      bs.is_matched         AS bs_matched,
      bs.ref_bku_id         AS bs_ref
    FROM data_pendapatan p
    JOIN bank_statement bs
      ON ABS(CAST(p.nilai AS DECIMAL) - CAST(bs.kredit AS DECIMAL)) < 1
      AND bs.kredit > 0
    WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement bx WHERE TRIM(bx.ref_bku_id) = p.id::text
      )
    ORDER BY p.tanggal, p.nomor_bukti
    LIMIT 50
  `;

  console.log(`\n③ Pendapatan BELUM + bank kredit nilai identik (tanpa link sama sekali): ${case3.length} record (maks 50)\n`);
  case3.forEach((r, i) => {
    const tgl = r.p_tgl ? new Date(r.p_tgl).toISOString().split('T')[0] : '-';
    const btgl = r.bs_tgl ? new Date(r.bs_tgl).toISOString().split('T')[0] : '-';
    console.log(`  [${String(i+1).padStart(3)}] p.tgl:${tgl} | nb:${String(r.p_nb||'').padEnd(22)} | Rp ${fmtIDR(r.p_nilai).padStart(18)} | bs.tgl:${btgl} | bs.nb:${String(r.bs_nb||'').padEnd(22)} | bs.matched:${r.bs_matched}`);
  });

  // ── Ringkasan total ──
  const totalBelum = await prisma.data_pendapatan.count({
    where: { OR: [{ status_rekon: 'BELUM' }, { status_rekon: null }, { status_rekon: '' }] }
  });
  const totalPendapatan = await prisma.data_pendapatan.count();

  console.log('\n' + SEP);
  console.log(` RINGKASAN`);
  console.log(SEP2);
  console.log(`  Total data_pendapatan          : ${totalPendapatan}`);
  console.log(`  Status BELUM/NULL/kosong        : ${totalBelum}`);
  console.log(`  Kasus 1 (bs.ref→p.id, p BELUM) : ${case1.length} → bisa langsung difix`);
  console.log(`  Kasus 2 (nb+nilai cocok, p BELUM): ${case2.length} → perlu link ulang`);
  console.log(`  Kasus 3 (nilai identik, unlinked): ${case3.length} → perlu investigasi`);
  console.log(SEP + '\n');

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
