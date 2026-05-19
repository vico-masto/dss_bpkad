/**
 * Cek SP2D yang di-link bank (Feb 27) vs SP2D BELUM — bandingkan nomor & nilai
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }
function tgl(d) { return d ? new Date(d).toISOString().split('T')[0] : '-'; }

async function main() {
  // Ambil 10 bank debet Feb 27 yang matched ke SP2D, dan lihat nomor SP2D-nya
  const bankFeb27 = await prisma.$queryRaw`
    SELECT
      bs.id AS bs_id,
      bs.tanggal AS bs_tgl,
      CAST(bs.debet AS DECIMAL) AS debet,
      bs.ref_bku_id,
      bs.deskripsi,
      s.id::text AS sp2d_id,
      s.nomor AS sp2d_nomor,
      CAST(s.nilai_bruto AS DECIMAL) AS bruto,
      COALESCE(pot.total,0)::DECIMAL AS potongan,
      (CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total,0)) AS neto,
      s.status_rekon,
      s.uraian
    FROM bank_statement bs
    JOIN data_sp2d s ON s.id = TRIM(bs.ref_bku_id)
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
    WHERE bs.tanggal::DATE = '2026-02-27'
      AND bs.debet > 0
      AND bs.is_matched = true
    ORDER BY bs.debet DESC
    LIMIT 15
  `;

  console.log('=== Bank debet Feb 27 → SP2D yang terhubung (sampel 15):');
  bankFeb27.forEach((r, i) => {
    console.log(`[${i+1}] bank:Rp ${fmtIDR(r.debet).padStart(18)} | sp2d.neto:Rp ${fmtIDR(r.neto).padStart(18)} | sp2d.nomor: ${r.sp2d_nomor}`);
  });

  console.log('\n=== SP2D BELUM Feb 27:');
  const belumFeb = await prisma.$queryRaw`
    SELECT s.id::text AS id, s.nomor,
           CAST(s.nilai_bruto AS DECIMAL) AS bruto,
           COALESCE(pot.total,0)::DECIMAL AS potongan,
           (CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total,0)) AS neto,
           s.status_rekon, s.uraian
    FROM data_sp2d s
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
    WHERE (s.status_rekon IS NULL OR s.status_rekon = '' OR s.status_rekon = 'BELUM')
      AND COALESCE(s.tanggal_pencairan, s.tanggal)::DATE = '2026-02-27'
    ORDER BY s.nomor
  `;
  belumFeb.forEach((r, i) => {
    console.log(`[${i+1}] neto:Rp ${fmtIDR(r.neto).padStart(18)} | nomor: ${r.nomor}`);
  });

  // Cek: berapa banyak SP2D dengan prefix nomor yang sama (truncate setelah karakter ke-25)?
  console.log('\n=== Cek kesamaan prefix nomor (30 char pertama):');
  const bankNomorSet = new Set(bankFeb27.map(r => String(r.sp2d_nomor).substring(0, 30).trim()));
  const belumNomorPrefixes = belumFeb.map(r => ({
    nomor: r.nomor,
    prefix: String(r.nomor).substring(0, 30).trim(),
    neto: r.neto
  }));

  belumNomorPrefixes.forEach(b => {
    const match = bankNomorSet.has(b.prefix);
    console.log(`  ${match ? '✅ PREFIX COCOK' : '❌ beda'} | ${b.prefix}...`);
  });

  // Semua SP2D unik: tampilkan distribusi panjang nomor
  console.log('\n=== Distribusi panjang nomor di data_sp2d:');
  const lenDist = await prisma.$queryRaw`
    SELECT LENGTH(nomor) AS panjang, COUNT(*)::int AS jumlah, MIN(nomor) AS contoh
    FROM data_sp2d
    GROUP BY LENGTH(nomor)
    ORDER BY panjang
  `;
  lenDist.forEach(r => {
    console.log(`  panjang ${String(r.panjang).padStart(3)} | ${String(r.jumlah).padStart(4)} SP2D | contoh: ${String(r.contoh||'').substring(0, 60)}`);
  });

  await prisma.$disconnect();
}
main().catch(async e => { console.error(e.message); await prisma.$disconnect(); });
