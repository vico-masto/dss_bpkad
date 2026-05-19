/**
 * diagnose_anomaly_2725277.js
 * Lacak asal-usul nilai Rp 2.725.277 yang muncul sebagai BKU Belum Rekon.
 * Jalankan: node diagnose_anomaly_2725277.js
 */
const prisma = require('./prismaClient');
const TARGET = 2725277;
const TOLERANCE = 1; // Sen

function fmt(n) {
  return `Rp ${Number(n).toLocaleString('id-ID')}`;
}
function fmtDate(d) {
  if (!d) return '-';
  return String(d).split('T')[0].replace(/^(\d{4})-(\d{2})-(\d{2}).*/, '$3-$2-$1');
}

async function main() {
  console.log(`\n=== Diagnosa Anomali BKU Belum Rekon: ${fmt(TARGET)} ===\n`);

  // ─── 1. data_sp2d (nilai neto) ────────────────────────────────────────────
  const sp2dRows = await prisma.$queryRaw`
    SELECT
      h.id, h.nomor, h.tanggal, h.tanggal_pencairan, h.opd, h.jenis,
      h.nilai_bruto, h.nilai_potongan, h.status_rekon,
      CAST(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto
        ELSE h.nilai_bruto - COALESCE(
          (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
           WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
          h.nilai_potongan)
      END AS DECIMAL) AS neto_calc,
      (SELECT is_matched FROM bank_statement b WHERE b.ref_bku_id = h.id LIMIT 1) AS matched_di_bank
    FROM data_sp2d h
    WHERE ABS(
      CAST(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto
        ELSE h.nilai_bruto - COALESCE(
          (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
           WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
          h.nilai_potongan)
      END AS DECIMAL) - ${TARGET}
    ) <= ${TOLERANCE}
  `;

  console.log(`[1] data_sp2d (neto): ${sp2dRows.length} record ditemukan`);
  sp2dRows.forEach(r => {
    console.log(
      `    Nomor    : ${r.nomor}\n` +
      `    OPD      : ${r.opd}\n` +
      `    Tanggal  : ${fmtDate(r.tanggal)}  |  Cair: ${fmtDate(r.tanggal_pencairan)}\n` +
      `    Bruto    : ${fmt(r.nilai_bruto)}  Potongan: ${fmt(r.nilai_potongan)}\n` +
      `    Neto Cal : ${fmt(r.neto_calc)}\n` +
      `    Status   : ${r.status_rekon}  |  Cocok di Bank: ${r.matched_di_bank ?? 'tidak ada ref'}\n`
    );
  });

  // ─── 2. data_sp2d_potongan ────────────────────────────────────────────────
  const potRows = await prisma.$queryRaw`
    SELECT p.id, p.nomor_sp2d, p.jenis_potongan, p.nilai, p.tanggal_pencairan,
           p.uraian, p.status_rekon, p.keterangan,
           (SELECT is_matched FROM bank_statement b WHERE b.ref_bku_id = p.id::text LIMIT 1) AS matched_di_bank
    FROM data_sp2d_potongan p
    WHERE ABS(CAST(p.nilai AS DECIMAL) - ${TARGET}) <= ${TOLERANCE}
      AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
  `;

  console.log(`[2] data_sp2d_potongan (rincian): ${potRows.length} record ditemukan`);
  potRows.forEach(r => {
    console.log(
      `    SP2D     : ${r.nomor_sp2d}\n` +
      `    Jenis    : ${r.jenis_potongan}  |  Uraian: ${r.uraian || '-'}\n` +
      `    Nilai    : ${fmt(r.nilai)}\n` +
      `    Tgl Cair : ${fmtDate(r.tanggal_pencairan)}\n` +
      `    Status   : ${r.status_rekon}  |  Cocok di Bank: ${r.matched_di_bank ?? 'tidak ada ref'}\n`
    );
  });

  // ─── 3. setoran_pajak ─────────────────────────────────────────────────────
  const sjkRows = await prisma.$queryRaw`
    SELECT s.id, s.nomor_bukti, s.uraian, s.nilai, s.tanggal, s.tanggal_pencairan,
           s.opd, s.jenis_pajak, s.status_rekon,
           (SELECT is_matched FROM bank_statement b WHERE b.ref_bku_id = s.id::text LIMIT 1) AS matched_di_bank
    FROM setoran_pajak s
    WHERE ABS(CAST(s.nilai AS DECIMAL) - ${TARGET}) <= ${TOLERANCE}
  `;

  console.log(`[3] setoran_pajak: ${sjkRows.length} record ditemukan`);
  sjkRows.forEach(r => {
    console.log(
      `    NTPN     : ${r.nomor_bukti}\n` +
      `    OPD      : ${r.opd}  |  Jenis: ${r.jenis_pajak}\n` +
      `    Uraian   : ${r.uraian || '-'}\n` +
      `    Nilai    : ${fmt(r.nilai)}\n` +
      `    Tanggal  : ${fmtDate(r.tanggal)}  |  Cair: ${fmtDate(r.tanggal_pencairan)}\n` +
      `    Status   : ${r.status_rekon}  |  Cocok di Bank: ${r.matched_di_bank ?? 'tidak ada ref'}\n`
    );
  });

  // ─── 4. data_pendapatan ───────────────────────────────────────────────────
  const pendRows = await prisma.$queryRaw`
    SELECT p.id, p.nomor_bukti, p.uraian, p.nilai, p.tanggal, p.status_rekon,
           (SELECT is_matched FROM bank_statement b WHERE b.ref_bku_id = p.id LIMIT 1) AS matched_di_bank
    FROM data_pendapatan p
    WHERE ABS(CAST(p.nilai AS DECIMAL) - ${TARGET}) <= ${TOLERANCE}
  `;

  console.log(`[4] data_pendapatan: ${pendRows.length} record ditemukan`);
  pendRows.forEach(r => {
    console.log(
      `    Bukti    : ${r.nomor_bukti}\n` +
      `    Uraian   : ${r.uraian || '-'}\n` +
      `    Nilai    : ${fmt(r.nilai)}\n` +
      `    Tanggal  : ${fmtDate(r.tanggal)}\n` +
      `    Status   : ${r.status_rekon}  |  Cocok di Bank: ${r.matched_di_bank ?? 'tidak ada ref'}\n`
    );
  });

  // ─── 5. bank_statement (ada di bank tapi belum cocok?) ───────────────────
  const bankRows = await prisma.$queryRaw`
    SELECT id, tanggal, deskripsi, debet, kredit, is_matched, ref_bku_id, match_type
    FROM bank_statement
    WHERE ABS(CAST(COALESCE(debet, 0) AS DECIMAL) - ${TARGET}) <= ${TOLERANCE}
       OR ABS(CAST(COALESCE(kredit, 0) AS DECIMAL) - ${TARGET}) <= ${TOLERANCE}
    ORDER BY tanggal DESC
  `;

  console.log(`[5] bank_statement (nilai ≈ ${fmt(TARGET)}): ${bankRows.length} record ditemukan`);
  bankRows.forEach(r => {
    const arah = Number(r.debet) > 0 ? `DEBET ${fmt(r.debet)}` : `KREDIT ${fmt(r.kredit)}`;
    console.log(
      `    ID       : ${r.id}\n` +
      `    Tanggal  : ${fmtDate(r.tanggal)}\n` +
      `    Keterangan: ${r.deskripsi || '-'}\n` +
      `    Nilai    : ${arah}\n` +
      `    Matched  : ${r.is_matched}  |  ref_bku_id: ${r.ref_bku_id || '-'}  |  type: ${r.match_type || '-'}\n`
    );
  });

  // ─── 6. Cek selisih bulanan yang bisa menyebabkan nilai ini muncul ─────────
  console.log('\n[6] Cek kombinasi potongan yang mungkin membentuk nilai ini:');
  const potCombCheck = await prisma.$queryRaw`
    SELECT nomor_sp2d, SUM(CAST(nilai AS DECIMAL)) AS total_pot, COUNT(*) AS jml_rincian,
           MAX(tanggal_pencairan) AS tgl_cair, MAX(status_rekon) AS status
    FROM data_sp2d_potongan
    WHERE keterangan IS NULL OR keterangan != 'AUTO_HEADER'
    GROUP BY nomor_sp2d
    HAVING ABS(SUM(CAST(nilai AS DECIMAL)) - ${TARGET}) <= ${TOLERANCE}
  `;
  if (potCombCheck.length > 0) {
    console.log(`    SP2D dengan SUM rincian potongan ≈ ${fmt(TARGET)}:`);
    potCombCheck.forEach(r => {
      console.log(
        `    SP2D: ${r.nomor_sp2d}  |  Total Pot: ${fmt(r.total_pot)}  |  Rincian: ${r.jml_rincian}  |  Status: ${r.status}`
      );
    });
  } else {
    console.log(`    Tidak ada kombinasi potongan per-SP2D yang cocok.`);
  }

  // ─── 7. Periksa apakah ada bank_statement unmatched dekat nilai target ─────
  console.log('\n[7] Bank statement UNMATCHED dengan nilai paling dekat ke target:');
  const nearBank = await prisma.$queryRaw`
    SELECT id, tanggal, deskripsi, debet, kredit,
           ABS(CAST(COALESCE(debet,0) AS DECIMAL) - ${TARGET}) AS selisih_debet,
           ABS(CAST(COALESCE(kredit,0) AS DECIMAL) - ${TARGET}) AS selisih_kredit
    FROM bank_statement
    WHERE is_matched = false
      AND (CAST(COALESCE(debet,0) AS DECIMAL) > 0 OR CAST(COALESCE(kredit,0) AS DECIMAL) > 0)
    ORDER BY LEAST(
      ABS(CAST(COALESCE(debet,0) AS DECIMAL) - ${TARGET}),
      ABS(CAST(COALESCE(kredit,0) AS DECIMAL) - ${TARGET})
    ) ASC
    LIMIT 5
  `;
  nearBank.forEach(r => {
    const arah = Number(r.debet) > 0 ? `DEBET ${fmt(r.debet)}` : `KREDIT ${fmt(r.kredit)}`;
    const selisih = Math.min(Number(r.selisih_debet), Number(r.selisih_kredit));
    console.log(
      `    Bank ID ${r.id}  |  ${fmtDate(r.tanggal)}  |  ${arah}  |  Selisih: ${fmt(selisih)}\n` +
      `    Ket: ${r.deskripsi || '-'}`
    );
  });

  await prisma.$disconnect();
  console.log('\n=== Selesai ===');
}

main().catch(e => {
  console.error('[ERROR]', e.message);
  prisma.$disconnect();
  process.exit(1);
});
