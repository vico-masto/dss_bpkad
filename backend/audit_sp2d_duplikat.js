/**
 * Verifikasi: SP2D-format ID vs UUID SP2D — apakah duplikat?
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const SEP = '═'.repeat(90);
const SEP2 = '─'.repeat(90);
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }
function tgl(d) { return d ? new Date(d).toISOString().split('T')[0] : '-'; }

async function main() {
  console.log('\n' + SEP);
  console.log(' VERIFIKASI DUPLIKAT: SP2D-format ID vs UUID SP2D BELUM');
  console.log(SEP + '\n');

  // SP2D BELUM Feb-Mar yang bank-nya diklaim oleh SP2D-format records
  const belumSP2D = await prisma.$queryRaw`
    SELECT
      s.id::text AS uuid_id,
      s.nomor,
      COALESCE(s.tanggal_pencairan, s.tanggal)::DATE AS tgl,
      CAST(s.nilai_bruto AS DECIMAL) AS bruto,
      COALESCE(pot.total,0)::DECIMAL AS pot,
      (CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total,0)) AS neto,
      s.status_rekon,
      s.uraian
    FROM data_sp2d s
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
    WHERE (s.status_rekon IS NULL OR s.status_rekon = '' OR s.status_rekon = 'BELUM')
      AND COALESCE(s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '2026-02-01' AND '2026-03-31'
    ORDER BY tgl, s.nomor
  `;

  // Kumpulkan semua SP2D-format IDs yang ada di bank.ref_bku_id
  const spFormatRefs = await prisma.$queryRaw`
    SELECT DISTINCT TRIM(ref_bku_id) AS ref_id
    FROM bank_statement
    WHERE ref_bku_id LIKE 'SP2D-%' AND is_matched = true
      AND tanggal::DATE BETWEEN '2026-02-01' AND '2026-03-31'
  `;
  const refIds = spFormatRefs.map(r => r.ref_id);

  // Ambil detail SP2D-format records
  let sp2dFormatRecords = [];
  if (refIds.length > 0) {
    sp2dFormatRecords = await prisma.$queryRaw`
      SELECT
        s.id::text AS sp2d_id,
        s.nomor,
        COALESCE(s.tanggal_pencairan, s.tanggal)::DATE AS tgl,
        CAST(s.nilai_bruto AS DECIMAL) AS bruto,
        COALESCE(pot.total,0)::DECIMAL AS pot,
        (CAST(s.nilai_bruto AS DECIMAL) - COALESCE(pot.total,0)) AS neto,
        s.status_rekon,
        s.uraian
      FROM data_sp2d s
      LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
      WHERE s.id = ANY(${refIds}::text[])
      ORDER BY tgl, s.nomor
    `;
  }

  console.log(`SP2D BELUM (UUID): ${belumSP2D.length} record`);
  console.log(`SP2D-format terhubung ke bank: ${sp2dFormatRecords.length} record\n`);

  // Build lookup by nomor+neto untuk cek duplikat
  const formatByNomor = new Map();
  sp2dFormatRecords.forEach(r => {
    formatByNomor.set(String(r.nomor).trim(), r);
  });

  let dupCount = 0, noDupCount = 0;

  console.log('PERBANDINGAN per nomor SP2D:');
  console.log(SEP2);

  belumSP2D.forEach(u => {
    const nomor = String(u.nomor).trim();
    const formatRec = formatByNomor.get(nomor);

    if (formatRec) {
      dupCount++;
      const nilaiSama = Math.abs(Number(u.neto) - Number(formatRec.neto)) < 1000;
      const tglSama = tgl(u.tgl) === tgl(formatRec.tgl);
      const isDup = nilaiSama && tglSama;
      const mark = isDup ? '🔴 DUPLIKAT KONFIRMASI' : '🟡 NOMOR SAMA, NILAI/TGL BEDA';
      console.log(`${mark}`);
      console.log(`  UUID  : id=${u.uuid_id.substring(0,10)}.. | ${tgl(u.tgl)} | neto Rp ${fmtIDR(u.neto)} | status:${u.status_rekon||'NULL'}`);
      console.log(`  FORMAT: id=${String(formatRec.sp2d_id).substring(0,15)}.. | ${tgl(formatRec.tgl)} | neto Rp ${fmtIDR(formatRec.neto)} | status:${formatRec.status_rekon||'NULL'}`);
      console.log(`  NOMOR: ${nomor}`);
    } else {
      noDupCount++;
      console.log(`⚫ TIDAK ADA PASANGAN FORMAT: ${nomor} | neto Rp ${fmtIDR(u.neto)} | ${tgl(u.tgl)}`);
    }
  });

  console.log('\n' + SEP2);
  console.log(`RINGKASAN:`);
  console.log(`  Total BELUM UUID SP2D (Feb-Mar): ${belumSP2D.length}`);
  console.log(`  Terkonfirmasi duplikat (nomor+nilai+tgl sama): ${dupCount}`);
  console.log(`  Tidak ada pasangan SP2D-format: ${noDupCount}`);

  // Cek: apakah ada SP2D-format records dari luar Feb-Mar juga?
  const totalSpFormat = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt FROM data_sp2d WHERE id LIKE 'SP2D-%'
  `;
  const totalUUID = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt FROM data_sp2d WHERE id NOT LIKE 'SP2D-%'
  `;
  console.log(`\n  Total SP2D dengan ID format SP2D-XXXXX : ${totalSpFormat[0].cnt}`);
  console.log(`  Total SP2D dengan ID format UUID        : ${totalUUID[0].cnt}`);

  // Berapa SP2D-format yang SUDAH vs BELUM?
  const spFormatStatus = await prisma.$queryRaw`
    SELECT COALESCE(status_rekon, 'NULL') AS status, COUNT(*)::int AS cnt
    FROM data_sp2d WHERE id LIKE 'SP2D-%'
    GROUP BY status ORDER BY cnt DESC
  `;
  console.log('\n  Status SP2D-format records:');
  spFormatStatus.forEach(r => console.log(`    ${r.status}: ${r.cnt}`));

  console.log('\n' + SEP + '\n');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
