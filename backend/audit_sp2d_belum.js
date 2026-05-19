/**
 * Audit mendalam: SP2D & Potongan BELUM per bulan vs sisi bank debet
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const SEP = '═'.repeat(90);
const SEP2 = '─'.repeat(90);
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }
function tgl(d) { return d ? new Date(d).toISOString().split('T')[0] : '-'; }

async function main() {
  console.log('\n' + SEP);
  console.log(' AUDIT MENDALAM: SP2D + POTONGAN BELUM REKON (Feb–Apr 2026)');
  console.log(SEP + '\n');

  // ── 1. Kondisi bank debet saat ini ────────────────────────────────────────
  const bankDebetStats = await prisma.$queryRaw`
    SELECT
      TO_CHAR(tanggal,'YYYY-MM') AS bulan,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE is_matched = true)::int AS matched,
      COUNT(*) FILTER (WHERE is_matched = false)::int AS unmatched,
      SUM(CAST(debet AS DECIMAL)) FILTER (WHERE is_matched = false)::DECIMAL AS unmatched_val
    FROM bank_statement
    WHERE debet > 0
      AND tanggal::DATE BETWEEN '2026-02-01' AND '2026-04-30'
    GROUP BY TO_CHAR(tanggal,'YYYY-MM')
    ORDER BY bulan
  `;
  console.log('① STATUS BANK DEBET (Feb–Apr 2026):');
  console.log(SEP2);
  bankDebetStats.forEach(r => {
    console.log(`  ${r.bulan} | total:${String(r.total).padStart(4)} | matched:${String(r.matched).padStart(4)} | unmatched:${String(r.unmatched).padStart(4)} | unmatched_val: Rp ${fmtIDR(r.unmatched_val)}`);
  });

  // ── 2. SP2D BELUM per bulan + cek apakah bank debet sudah link ke SP2D ───
  console.log('\n② SP2D BELUM: cek apakah bank sudah link ke SP2D ini (via ref_bku_id):');
  console.log(SEP2);
  const sp2dBelum = await prisma.$queryRaw`
    SELECT
      s.id::text AS sp2d_id,
      s.nomor,
      COALESCE(s.tanggal_pencairan, s.tanggal)::DATE AS tgl,
      TO_CHAR(COALESCE(s.tanggal_pencairan, s.tanggal), 'YYYY-MM') AS bulan,
      CAST(s.nilai_bruto AS DECIMAL) AS bruto,
      COALESCE(pot.total, 0)::DECIMAL AS potongan,
      (CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total, 0)) AS neto,
      s.status_rekon,
      s.opd,
      s.uraian,
      -- apakah ada bank debet yg ref_bku_id menunjuk ke sp2d ini?
      (SELECT COUNT(*)::int FROM bank_statement bs WHERE TRIM(bs.ref_bku_id) = s.id::text AND bs.debet > 0) AS bank_debet_linked,
      -- apakah ada bank debet dengan nilai cocok di periode ±7 hari?
      (SELECT COUNT(*)::int FROM bank_statement bs
       WHERE bs.debet > 0
         AND ABS(CAST(bs.debet AS DECIMAL) - CAST(s.nilai_bruto AS DECIMAL)) < 1000
         AND bs.tanggal::DATE BETWEEN COALESCE(s.tanggal_pencairan,s.tanggal)::DATE - 7
                                  AND COALESCE(s.tanggal_pencairan,s.tanggal)::DATE + 7
      ) AS bank_bruto_near,
      (SELECT COUNT(*)::int FROM bank_statement bs
       WHERE bs.debet > 0
         AND ABS(CAST(bs.debet AS DECIMAL) - (CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total,0))) < 1000
         AND bs.tanggal::DATE BETWEEN COALESCE(s.tanggal_pencairan,s.tanggal)::DATE - 7
                                  AND COALESCE(s.tanggal_pencairan,s.tanggal)::DATE + 7
      ) AS bank_neto_near
    FROM data_sp2d s
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
    WHERE (s.status_rekon IS NULL OR s.status_rekon = '' OR s.status_rekon = 'BELUM')
      AND COALESCE(s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '2026-02-01' AND '2026-04-30'
    ORDER BY tgl, s.nomor
  `;

  const grouped = {};
  sp2dBelum.forEach(r => {
    if (!grouped[r.bulan]) grouped[r.bulan] = [];
    grouped[r.bulan].push(r);
  });

  let totalLinked = 0, totalUnlinked = 0;
  for (const [bulan, rows] of Object.entries(grouped)) {
    const linked = rows.filter(r => Number(r.bank_debet_linked) > 0);
    const unlinked = rows.filter(r => Number(r.bank_debet_linked) === 0);
    const nearBruto = rows.filter(r => Number(r.bank_bruto_near) > 0 && Number(r.bank_debet_linked) === 0);
    const nearNeto  = rows.filter(r => Number(r.bank_neto_near) > 0 && Number(r.bank_debet_linked) === 0);
    const noBank    = rows.filter(r => Number(r.bank_bruto_near) === 0 && Number(r.bank_neto_near) === 0 && Number(r.bank_debet_linked) === 0);
    const totalNeto = rows.reduce((s, r) => s + Number(r.neto || 0), 0);
    totalLinked += linked.length;
    totalUnlinked += unlinked.length;

    console.log(`\n  BULAN ${bulan} — ${rows.length} SP2D BELUM, total neto Rp ${fmtIDR(totalNeto)}`);
    console.log(`    Bank sudah link (ref_bku_id cocok)     : ${linked.length}`);
    console.log(`    Bank belum link, nilai bruto ada ±7hr  : ${nearBruto.length}`);
    console.log(`    Bank belum link, nilai neto ada ±7hr   : ${nearNeto.length}`);
    console.log(`    Tidak ada bank debet apapun yg dekat   : ${noBank.length}`);

    if (noBank.length > 0) {
      console.log(`\n    ⚠️  SP2D tanpa pasangan bank (${noBank.length} item):`);
      noBank.slice(0, 10).forEach((r, i) => {
        console.log(`      [${i+1}] ${tgl(r.tgl)} | neto: Rp ${fmtIDR(r.neto).padStart(22)} | ${String(r.nomor||'').substring(0,30)} | ${String(r.uraian||'').substring(0,30)}`);
      });
      if (noBank.length > 10) console.log(`      ... dan ${noBank.length - 10} lainnya`);
    }

    if (linked.length > 0) {
      console.log(`\n    ℹ️  SP2D sudah di-link bank TAPI masih BELUM (${linked.length} item — status inconsistency!):`);
      linked.slice(0, 5).forEach((r, i) => {
        console.log(`      [${i+1}] id:${r.sp2d_id.substring(0,8)} | ${tgl(r.tgl)} | neto: Rp ${fmtIDR(r.neto).padStart(22)} | status:${r.status_rekon||'NULL'}`);
      });
    }
  }

  // ── 3. Potongan BELUM per bulan ────────────────────────────────────────────
  console.log('\n' + SEP2);
  console.log('③ POTONGAN BELUM per bulan (Feb–Apr):');
  console.log(SEP2);
  const potBelum = await prisma.$queryRaw`
    SELECT
      TO_CHAR(COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal), 'YYYY-MM') AS bulan,
      COUNT(*)::int AS jumlah,
      SUM(CAST(p.nilai AS DECIMAL))::DECIMAL AS total,
      COUNT(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM bank_statement bs WHERE TRIM(bs.ref_bku_id) = p.id::text AND bs.debet > 0
      ))::int AS bank_linked
    FROM data_sp2d_potongan p
    LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
    WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
      AND COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE BETWEEN '2026-02-01' AND '2026-04-30'
    GROUP BY bulan
    ORDER BY bulan
  `;
  potBelum.forEach(r => {
    console.log(`  ${r.bulan} | ${String(r.jumlah).padStart(4)} item | total: Rp ${fmtIDR(r.total).padStart(26)} | bank_linked: ${r.bank_linked}`);
  });

  // ── 4. Bank debet yang ref_bku_id ke SP2D BELUM (status inconsistency) ───
  console.log('\n④ Bank debet MATCHED → SP2D masih BELUM (status inconsistency):');
  console.log(SEP2);
  const inconsistent = await prisma.$queryRaw`
    SELECT
      bs.id AS bs_id,
      bs.tanggal AS bs_tgl,
      CAST(bs.debet AS DECIMAL) AS bs_debet,
      bs.ref_bku_id,
      bs.match_type,
      s.id::text AS sp2d_id,
      s.nomor,
      CAST(s.nilai_bruto AS DECIMAL) AS sp2d_bruto,
      s.status_rekon,
      s.uraian
    FROM bank_statement bs
    JOIN data_sp2d s ON s.id::text = TRIM(bs.ref_bku_id)
    WHERE bs.is_matched = true
      AND bs.debet > 0
      AND (s.status_rekon IS NULL OR s.status_rekon = '' OR s.status_rekon = 'BELUM')
      AND bs.tanggal::DATE BETWEEN '2026-02-01' AND '2026-04-30'
    ORDER BY bs.tanggal, bs.id
  `;
  console.log(`  Jumlah: ${inconsistent.length}`);
  inconsistent.slice(0, 10).forEach((r, i) => {
    console.log(`  [${i+1}] bs:${r.bs_id} | ${tgl(r.bs_tgl)} | bank:Rp ${fmtIDR(r.bs_debet).padStart(22)} | sp2d.bruto:Rp ${fmtIDR(r.sp2d_bruto).padStart(22)} | ${r.nomor} | sp2d_status:${r.status_rekon||'NULL'}`);
  });

  console.log('\n' + SEP + '\n');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
