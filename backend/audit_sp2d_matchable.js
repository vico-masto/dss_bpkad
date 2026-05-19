/**
 * Investigasi: SP2D BELUM Feb-Mar yang bisa dicocokkan vs yang tidak bisa
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const SEP = '═'.repeat(90);
const SEP2 = '─'.repeat(90);
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }
function tgl(d) { return d ? new Date(d).toISOString().split('T')[0] : '-'; }

async function main() {
  console.log('\n' + SEP);
  console.log(' INVESTIGASI: SP2D BELUM — Bank Tersedia vs Tidak');
  console.log(SEP + '\n');

  // ── Bank debet unmatched Mar 2026 ─────────────────────────────────────────
  const bankUnmatchMar = await prisma.$queryRaw`
    SELECT id, tanggal, CAST(debet AS DECIMAL) AS debet, deskripsi, nomor_bukti, ref_bku_id
    FROM bank_statement
    WHERE debet > 0 AND is_matched = false
      AND tanggal::DATE BETWEEN '2026-03-01' AND '2026-03-31'
    ORDER BY debet DESC
  `;
  console.log(`① Bank debet UNMATCHED Maret 2026: ${bankUnmatchMar.length} entry`);
  console.log(SEP2);
  bankUnmatchMar.forEach((b, i) => {
    console.log(`  [${i+1}] ${tgl(b.tanggal)} | Rp ${fmtIDR(b.debet).padStart(22)} | nb:${String(b.nomor_bukti||'-').padEnd(20)} | ${String(b.deskripsi||'').substring(0,40)}`);
  });

  // ── SP2D BELUM Feb 2026 — detail + cari bank neto tersedia ───────────────
  const sp2dBelumFeb = await prisma.$queryRaw`
    SELECT
      s.id::text AS id, s.nomor,
      COALESCE(s.tanggal_pencairan, s.tanggal)::DATE AS tgl,
      CAST(s.nilai_bruto AS DECIMAL) AS bruto,
      COALESCE(pot.total, 0)::DECIMAL AS pot,
      (CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total, 0)) AS neto,
      s.uraian, s.status_rekon
    FROM data_sp2d s
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
    WHERE (s.status_rekon IS NULL OR s.status_rekon = '' OR s.status_rekon = 'BELUM')
      AND COALESCE(s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '2026-02-01' AND '2026-02-28'
    ORDER BY tgl, s.nomor
  `;

  console.log(`\n② SP2D BELUM Februari 2026: ${sp2dBelumFeb.length} item`);
  console.log(SEP2);
  for (const s of sp2dBelumFeb) {
    // Cari bank debet yang cocok (unmatched ATAU matched ke sp2d lain)
    const bankMatch = await prisma.$queryRaw`
      SELECT id, tanggal, CAST(debet AS DECIMAL) AS debet, is_matched, ref_bku_id, deskripsi
      FROM bank_statement
      WHERE debet > 0
        AND ABS(CAST(debet AS DECIMAL) - ${Number(s.neto)}) < 1000
        AND tanggal::DATE BETWEEN ${s.tgl}::DATE - 7 AND ${s.tgl}::DATE + 7
      LIMIT 5
    `;
    const avail = bankMatch.filter(b => !b.is_matched);
    const used  = bankMatch.filter(b => b.is_matched);
    console.log(`  ${tgl(s.tgl)} | neto: Rp ${fmtIDR(s.neto).padStart(22)} | ${String(s.nomor||'').substring(0,30)}`);
    if (avail.length > 0) {
      avail.forEach(b => console.log(`    ✅ BANK TERSEDIA: ${tgl(b.tanggal)} | Rp ${fmtIDR(b.debet)} | id:${b.id}`));
    } else if (used.length > 0) {
      used.forEach(b => console.log(`    🔒 bank sudah dipakai oleh: ref=${b.ref_bku_id?.substring(0,20)} | Rp ${fmtIDR(b.debet)}`));
    } else {
      console.log(`    ❌ tidak ada bank debet dengan nilai cocok`);
    }
  }

  // ── SP2D BELUM Mar 2026 — detail + cari bank neto tersedia ───────────────
  const sp2dBelumMar = await prisma.$queryRaw`
    SELECT
      s.id::text AS id, s.nomor,
      COALESCE(s.tanggal_pencairan, s.tanggal)::DATE AS tgl,
      CAST(s.nilai_bruto AS DECIMAL) AS bruto,
      COALESCE(pot.total, 0)::DECIMAL AS pot,
      (CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total, 0)) AS neto,
      s.uraian, s.status_rekon
    FROM data_sp2d s
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
    WHERE (s.status_rekon IS NULL OR s.status_rekon = '' OR s.status_rekon = 'BELUM')
      AND COALESCE(s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '2026-03-01' AND '2026-03-31'
    ORDER BY tgl, s.nomor
  `;

  console.log(`\n③ SP2D BELUM Maret 2026: ${sp2dBelumMar.length} item`);
  console.log(SEP2);
  let matchableCount = 0;
  for (const s of sp2dBelumMar) {
    const bankMatch = await prisma.$queryRaw`
      SELECT id, tanggal, CAST(debet AS DECIMAL) AS debet, is_matched, ref_bku_id, deskripsi, nomor_bukti
      FROM bank_statement
      WHERE debet > 0
        AND ABS(CAST(debet AS DECIMAL) - ${Number(s.neto)}) < 1000
        AND tanggal::DATE BETWEEN ${s.tgl}::DATE - 7 AND ${s.tgl}::DATE + 7
      LIMIT 5
    `;
    const avail = bankMatch.filter(b => !b.is_matched);
    const used  = bankMatch.filter(b => b.is_matched);
    if (avail.length > 0) matchableCount++;
    const icon = avail.length > 0 ? '✅' : (used.length > 0 ? '🔒' : '❌');
    console.log(`  ${icon} ${tgl(s.tgl)} | neto: Rp ${fmtIDR(s.neto).padStart(22)} | ${String(s.nomor||'').substring(0,30)}`);
    if (avail.length > 0) {
      avail.forEach(b => console.log(`     BANK TERSEDIA: ${tgl(b.tanggal)} | Rp ${fmtIDR(b.debet)} | id:${b.id} | nb:${b.nomor_bukti||'-'}`));
    }
  }
  console.log(`\n  Dapat dicocokkan (bank tersedia): ${matchableCount}/${sp2dBelumMar.length}`);

  // ── Konfirmasi April kosong ───────────────────────────────────────────────
  console.log('\n④ Konfirmasi status bank April 2026:');
  console.log(SEP2);
  const aprBank = await prisma.bank_statement.count({
    where: { tanggal: { gte: new Date('2026-04-01'), lte: new Date('2026-04-30') } }
  });
  const aprBankDebet = await prisma.bank_statement.count({
    where: { debet: { gt: 0 }, tanggal: { gte: new Date('2026-04-01'), lte: new Date('2026-04-30') } }
  });
  console.log(`  Total bank_statement April: ${aprBank} baris (debet: ${aprBankDebet})`);
  if (aprBank === 0) console.log('  ⚠️  Bank statement April 2026 BELUM DIIMPOR.');

  console.log('\n' + SEP + '\n');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
