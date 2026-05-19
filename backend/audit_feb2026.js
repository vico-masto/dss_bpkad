/**
 * Audit detail BKU BELUM Februari 2026 → sumber Rp 2.000.867.364,00
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const SEP = '═'.repeat(80);
const SEP2 = '─'.repeat(80);
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }

async function main() {
  console.log('\n' + SEP);
  console.log(' AUDIT DETAIL: BKU BELUM REKON — FEBRUARI 2026');
  console.log(SEP + '\n');

  const sDate = '2026-02-01';
  const eDate = '2026-02-28';

  // ① SP2D BELUM Februari
  const sp2dBelum = await prisma.$queryRaw`
    SELECT
      s.nomor, s.tanggal, s.tanggal_pencairan, s.uraian, s.opd,
      CAST(s.nilai_bruto AS DECIMAL) AS bruto,
      COALESCE(pot.total, 0)::DECIMAL AS potongan,
      (CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total, 0)) AS neto,
      s.status_rekon
    FROM data_sp2d s
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot
      ON s.id = pot.id_sp2d
    WHERE (
      (s.tanggal_pencairan::DATE BETWEEN ${sDate}::DATE AND ${eDate}::DATE)
      OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE BETWEEN ${sDate}::DATE AND ${eDate}::DATE)
    )
    AND (s.status_rekon = 'BELUM' OR s.status_rekon IS NULL OR s.status_rekon = '')
    ORDER BY COALESCE(s.tanggal_pencairan, s.tanggal)
  `;

  // ② Potongan BELUM Februari
  const potBelum = await prisma.$queryRaw`
    SELECT
      p.nomor_sp2d, p.uraian, CAST(p.nilai AS DECIMAL) AS nilai,
      COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE AS tgl,
      p.status_rekon, p.opd
    FROM data_sp2d_potongan p
    LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
    WHERE (
      (p.tanggal_pencairan::DATE BETWEEN ${sDate}::DATE AND ${eDate}::DATE)
      OR (p.tanggal_pencairan IS NULL AND COALESCE(sp.tanggal_pencairan, sp.tanggal)::DATE BETWEEN ${sDate}::DATE AND ${eDate}::DATE)
    )
    AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL OR p.status_rekon = '')
    ORDER BY tgl
  `;

  // ③ Setoran pajak BELUM Februari (yang tidak duplicate dengan potongan)
  const pajBelum = await prisma.$queryRaw`
    SELECT
      s.nomor_bukti, s.uraian, CAST(s.nilai AS DECIMAL) AS nilai,
      s.tanggal::DATE AS tgl, s.status_rekon
    FROM setoran_pajak s
    WHERE s.tanggal::DATE BETWEEN ${sDate}::DATE AND ${eDate}::DATE
      AND (s.status_rekon = 'BELUM' OR s.status_rekon IS NULL OR s.status_rekon = '')
      AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
    ORDER BY s.tanggal
  `;

  const sp2dTotal = sp2dBelum.reduce((s, r) => s + Number(r.neto || 0), 0);
  const potTotal  = potBelum.reduce((s, r) => s + Number(r.nilai || 0), 0);
  const pajTotal  = pajBelum.reduce((s, r) => s + Number(r.nilai || 0), 0);
  const grandTotal = sp2dTotal + potTotal + pajTotal;

  console.log('① SP2D NETO BELUM — Februari 2026:');
  console.log(SEP2);
  sp2dBelum.forEach((r, i) => {
    const tgl = r.tanggal_pencairan
      ? new Date(r.tanggal_pencairan).toISOString().split('T')[0]
      : new Date(r.tanggal).toISOString().split('T')[0];
    console.log(`  [${String(i+1).padStart(2)}] ${tgl} | Neto: Rp ${fmtIDR(r.neto).padStart(24)} | ${String(r.nomor||'').substring(0,25)} | ${String(r.uraian||'').substring(0,30)}`);
  });
  console.log(`\n       TOTAL SP2D neto BELUM : Rp ${fmtIDR(sp2dTotal)}`);

  console.log('\n② POTONGAN BELUM — Februari 2026:');
  console.log(SEP2);
  if (potBelum.length === 0) {
    console.log('  (tidak ada)');
  } else {
    potBelum.forEach((r, i) => {
      const tgl = r.tgl ? new Date(r.tgl).toISOString().split('T')[0] : '-';
      console.log(`  [${String(i+1).padStart(2)}] ${tgl} | Rp ${fmtIDR(r.nilai).padStart(24)} | ${String(r.nomor_sp2d||'').substring(0,25)} | ${String(r.uraian||'').substring(0,30)}`);
    });
  }
  console.log(`\n       TOTAL Potongan BELUM   : Rp ${fmtIDR(potTotal)}`);

  console.log('\n③ SETORAN PAJAK BELUM — Februari 2026:');
  console.log(SEP2);
  if (pajBelum.length === 0) {
    console.log('  (tidak ada)');
  } else {
    pajBelum.forEach((r, i) => {
      const tgl = r.tgl ? new Date(r.tgl).toISOString().split('T')[0] : '-';
      console.log(`  [${String(i+1).padStart(2)}] ${tgl} | Rp ${fmtIDR(r.nilai).padStart(24)} | ${String(r.nomor_bukti||'').substring(0,25)} | ${String(r.uraian||'').substring(0,30)}`);
    });
  }
  console.log(`\n       TOTAL Setoran Pajak BELUM: Rp ${fmtIDR(pajTotal)}`);

  console.log('\n' + SEP);
  console.log(` GRAND TOTAL BKU BELUM Februari 2026:`);
  console.log(`   SP2D neto   : Rp ${fmtIDR(sp2dTotal)}`);
  console.log(`   Potongan    : Rp ${fmtIDR(potTotal)}`);
  console.log(`   Setoran Pajak: Rp ${fmtIDR(pajTotal)}`);
  console.log(`   ─────────────────────────────────────────────`);
  console.log(`   TOTAL       : Rp ${fmtIDR(grandTotal)}`);
  console.log(SEP + '\n');

  // ④ Juga cari: apakah ada SP2D Februari yang SUDAH rekon (untuk konteks)
  const sp2dSudah = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt,
           SUM(CAST(nilai_bruto AS DECIMAL))::DECIMAL AS total_bruto
    FROM data_sp2d
    WHERE (
      (tanggal_pencairan::DATE BETWEEN ${sDate}::DATE AND ${eDate}::DATE)
      OR (tanggal_pencairan IS NULL AND tanggal::DATE BETWEEN ${sDate}::DATE AND ${eDate}::DATE)
    )
    AND status_rekon LIKE 'SUDAH%'
  `;
  const cntSudah = Number(sp2dSudah[0].cnt || 0);
  const totSudah = Number(sp2dSudah[0].total_bruto || 0);
  console.log(`KONTEKS: SP2D Februari yang SUDAH rekon: ${cntSudah} item, total bruto Rp ${fmtIDR(totSudah)}`);
  console.log(`KONTEKS: SP2D Februari yang BELUM rekon: ${sp2dBelum.length} item\n`);

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
