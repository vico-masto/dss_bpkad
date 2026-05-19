/**
 * diagnose_selisih_bku.js
 * Analisa mendalam: cari penyebab selisih BKU Belum Rekon Rp 2.725.277
 * Jalankan: node diagnose_selisih_bku.js
 */
const prisma = require('./prismaClient');

function fmt(n) {
  return `Rp ${Number(n).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(d) {
  if (!d) return '-';
  const s = new Date(d).toISOString();
  return s.split('T')[0];
}

const TARGET_YEAR = 2026;

async function main() {
  console.log(`\n=== Diagnosa Selisih BKU ${TARGET_YEAR} ===\n`);

  // ─── 1. Total BKU sisi pengeluaran (SP2D neto baku) ───────────────────────
  const [bkuExp] = await prisma.$queryRaw`
    SELECT SUM(
      CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto
      ELSE h.nilai_bruto - COALESCE(
        (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
         WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
        h.nilai_potongan)
      END
    )::DECIMAL AS total_sp2d_neto
    FROM data_sp2d h
    WHERE h.tahun = ${TARGET_YEAR}
  `;

  // ─── 2. Total potongan BKU (rincian, non-AUTO_HEADER, non-SUDAH_BRUTO parent) ─
  const [bkuPot] = await prisma.$queryRaw`
    SELECT SUM(CAST(p.nilai AS DECIMAL)) AS total_pot
    FROM data_sp2d_potongan p
    JOIN data_sp2d h ON p.id_sp2d = h.id
    WHERE h.tahun = ${TARGET_YEAR}
      AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
      AND h.status_rekon != 'SUDAH_BRUTO'
  `;

  // ─── 3. Total setoran pajak BKU ───────────────────────────────────────────
  const [bkuSjk] = await prisma.$queryRaw`
    SELECT SUM(CAST(s.nilai AS DECIMAL)) AS total_sjk
    FROM setoran_pajak s
    WHERE EXTRACT(YEAR FROM s.tanggal) = ${TARGET_YEAR}
      AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
  `;

  // ─── 4. Total penerimaan BKU ──────────────────────────────────────────────
  const [bkuPend] = await prisma.$queryRaw`
    SELECT SUM(CAST(nilai AS DECIMAL)) AS total_pend
    FROM data_pendapatan
    WHERE tahun = ${TARGET_YEAR}
  `;

  // ─── 5. Total DEBET bank (pengeluaran) ────────────────────────────────────
  const [bankDeb] = await prisma.$queryRaw`
    SELECT SUM(CAST(COALESCE(debet,0) AS DECIMAL)) AS total_debet
    FROM bank_statement
    WHERE EXTRACT(YEAR FROM tanggal) = ${TARGET_YEAR}
      AND CAST(COALESCE(debet,0) AS DECIMAL) > 0
      AND deskripsi NOT ILIKE '%saldo awal%'
  `;

  // ─── 6. Total KREDIT bank (penerimaan) ────────────────────────────────────
  const [bankKrd] = await prisma.$queryRaw`
    SELECT SUM(CAST(COALESCE(kredit,0) AS DECIMAL)) AS total_kredit
    FROM bank_statement
    WHERE EXTRACT(YEAR FROM tanggal) = ${TARGET_YEAR}
      AND CAST(COALESCE(kredit,0) AS DECIMAL) > 0
      AND deskripsi NOT ILIKE '%saldo awal%'
  `;

  const nSp2d  = Number(bkuExp?.total_sp2d_neto  || 0);
  const nPot   = Number(bkuPot?.total_pot         || 0);
  const nSjk   = Number(bkuSjk?.total_sjk         || 0);
  const nPend  = Number(bkuPend?.total_pend        || 0);
  const nDebet = Number(bankDeb?.total_debet       || 0);
  const nKred  = Number(bankKrd?.total_kredit      || 0);

  const bkuTotalKeluar = nSp2d + nPot + nSjk;
  const selisihKeluar  = bkuTotalKeluar - nDebet;
  const selisihMasuk   = nPend - nKred;

  console.log('─── Rekap Pengeluaran ─────────────────────────────────────────');
  console.log(`  SP2D Neto     BKU : ${fmt(nSp2d)}`);
  console.log(`  Potongan Rincian  : ${fmt(nPot)}`);
  console.log(`  Setoran Pajak     : ${fmt(nSjk)}`);
  console.log(`  TOTAL KELUAR BKU  : ${fmt(bkuTotalKeluar)}`);
  console.log(`  TOTAL DEBET BANK  : ${fmt(nDebet)}`);
  console.log(`  SELISIH KELUAR    : ${fmt(selisihKeluar)}  ${selisihKeluar !== 0 ? '⚠' : '✓'}\n`);

  console.log('─── Rekap Penerimaan ──────────────────────────────────────────');
  console.log(`  Pendapatan BKU    : ${fmt(nPend)}`);
  console.log(`  TOTAL KREDIT BANK : ${fmt(nKred)}`);
  console.log(`  SELISIH MASUK     : ${fmt(selisihMasuk)}  ${selisihMasuk !== 0 ? '⚠' : '✓'}\n`);

  // ─── 7. Breakdown per bulan ────────────────────────────────────────────────
  console.log('─── Selisih per Bulan (SP2D Neto BKU vs Debet Bank) ──────────');
  const monthly = await prisma.$queryRaw`
    SELECT
      m.bulan,
      COALESCE(bku.total_neto, 0)::DECIMAL AS bku_neto,
      COALESCE(bank.total_debet, 0)::DECIMAL AS bank_debet,
      (COALESCE(bku.total_neto, 0) - COALESCE(bank.total_debet, 0))::DECIMAL AS selisih
    FROM generate_series(1, 12) AS m(bulan)
    LEFT JOIN (
      SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int AS bln,
             SUM(CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto
               ELSE nilai_bruto - COALESCE(
                 (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
                  WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
                 nilai_potongan)
               END) AS total_neto
      FROM data_sp2d h WHERE tahun = ${TARGET_YEAR}
      GROUP BY bln
    ) bku ON bku.bln = m.bulan
    LEFT JOIN (
      SELECT EXTRACT(MONTH FROM tanggal)::int AS bln,
             SUM(CAST(COALESCE(debet,0) AS DECIMAL)) AS total_debet
      FROM bank_statement
      WHERE EXTRACT(YEAR FROM tanggal) = ${TARGET_YEAR}
        AND CAST(COALESCE(debet,0) AS DECIMAL) > 0
        AND deskripsi NOT ILIKE '%saldo awal%'
      GROUP BY bln
    ) bank ON bank.bln = m.bulan
    WHERE COALESCE(bku.total_neto, 0) > 0 OR COALESCE(bank.total_debet, 0) > 0
    ORDER BY m.bulan
  `;

  monthly.forEach(r => {
    const sel = Number(r.selisih);
    const flag = Math.abs(sel) > 1 ? ' ⚠' : ' ✓';
    console.log(
      `  Bln ${String(r.bulan).padStart(2,'0')} | BKU: ${fmt(r.bku_neto).padStart(22)} | Bank: ${fmt(r.bank_debet).padStart(22)} | Selisih: ${fmt(sel)}${flag}`
    );
  });

  // ─── 8. Cek status_rekon SP2D yang masih BELUM tapi sudah ter-match di bank ─
  console.log('\n─── SP2D status BELUM tapi ada di bank (Ghost Mismatch) ───────');
  const ghostSp2d = await prisma.$queryRaw`
    SELECT h.nomor, h.opd, h.tanggal_pencairan, h.status_rekon,
           CAST(h.nilai_bruto AS DECIMAL) AS bruto,
           b.debet, b.is_matched, b.match_type, b.ref_bku_id
    FROM data_sp2d h
    JOIN bank_statement b ON b.ref_bku_id = h.id
    WHERE h.tahun = ${TARGET_YEAR}
      AND (h.status_rekon = 'BELUM' OR h.status_rekon IS NULL)
      AND b.is_matched = true
  `;
  if (ghostSp2d.length === 0) {
    console.log('  Tidak ada.');
  } else {
    ghostSp2d.forEach(r => {
      console.log(`  SP2D: ${r.nomor} | ${fmt(r.bruto)} | Status: ${r.status_rekon} | Bank Matched: ${r.is_matched}`);
    });
  }

  // ─── 9. Potongan BELUM rekon yang statusnya masih BELUM ──────────────────
  console.log('\n─── Potongan Rincian Belum Rekon (semua) ──────────────────────');
  const potBelum = await prisma.$queryRaw`
    SELECT p.jenis_potongan, p.nomor_sp2d, CAST(p.nilai AS DECIMAL) AS nilai,
           p.tanggal_pencairan, p.status_rekon, p.uraian,
           s.opd, s.status_rekon AS status_sp2d
    FROM data_sp2d_potongan p
    JOIN data_sp2d s ON p.id_sp2d = s.id
    WHERE s.tahun = ${TARGET_YEAR}
      AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
      AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL)
    ORDER BY p.tanggal_pencairan, p.nilai DESC
  `;
  let totalPotBelum = 0;
  potBelum.forEach(r => {
    totalPotBelum += Number(r.nilai);
    console.log(
      `  ${fmtDate(r.tanggal_pencairan)} | ${r.jenis_potongan} | ${fmt(r.nilai)} | SP2D: ${r.nomor_sp2d.substring(0,35)} | Status Pot: ${r.status_rekon} | Status SP2D: ${r.status_sp2d}`
    );
  });
  console.log(`  TOTAL Potongan Belum Rekon: ${fmt(totalPotBelum)}`);

  // ─── 10. Setoran Pajak Belum Rekon ────────────────────────────────────────
  console.log('\n─── Setoran Pajak Belum Rekon ─────────────────────────────────');
  const sjkBelum = await prisma.$queryRaw`
    SELECT s.nomor_bukti, s.uraian, CAST(s.nilai AS DECIMAL) AS nilai, s.tanggal, s.status_rekon
    FROM setoran_pajak s
    WHERE EXTRACT(YEAR FROM s.tanggal) = ${TARGET_YEAR}
      AND (s.status_rekon = 'BELUM' OR s.status_rekon IS NULL)
      AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
  `;
  let totalSjkBelum = 0;
  sjkBelum.forEach(r => {
    totalSjkBelum += Number(r.nilai);
    console.log(`  ${fmtDate(r.tanggal)} | ${r.nomor_bukti} | ${fmt(r.nilai)} | ${r.status_rekon}`);
  });
  console.log(`  TOTAL Setoran Pajak Belum Rekon: ${fmt(totalSjkBelum)}`);

  // ─── 11. Bank unmatched (semua) ───────────────────────────────────────────
  console.log('\n─── Bank UNMATCHED (semua) ─────────────────────────────────────');
  const bankUnmatched = await prisma.$queryRaw`
    SELECT id, tanggal, deskripsi,
           CAST(COALESCE(debet,0) AS DECIMAL) AS debet,
           CAST(COALESCE(kredit,0) AS DECIMAL) AS kredit
    FROM bank_statement
    WHERE is_matched = false
      AND EXTRACT(YEAR FROM tanggal) = ${TARGET_YEAR}
      AND (CAST(COALESCE(debet,0) AS DECIMAL) > 0 OR CAST(COALESCE(kredit,0) AS DECIMAL) > 0)
    ORDER BY tanggal
  `;
  let totalBankUnmatchedDebet = 0;
  let totalBankUnmatchedKredit = 0;
  bankUnmatched.forEach(r => {
    totalBankUnmatchedDebet += Number(r.debet);
    totalBankUnmatchedKredit += Number(r.kredit);
    const arah = Number(r.debet) > 0 ? `D: ${fmt(r.debet)}` : `K: ${fmt(r.kredit)}`;
    console.log(`  Bank#${r.id} | ${fmtDate(r.tanggal)} | ${arah} | ${r.deskripsi || '-'}`);
  });
  console.log(`  TOTAL Bank Unmatched DEBET : ${fmt(totalBankUnmatchedDebet)}`);
  console.log(`  TOTAL Bank Unmatched KREDIT: ${fmt(totalBankUnmatchedKredit)}`);

  await prisma.$disconnect();
  console.log('\n=== Selesai ===');
}

main().catch(e => {
  console.error('[ERROR]', e.message);
  prisma.$disconnect();
  process.exit(1);
});
