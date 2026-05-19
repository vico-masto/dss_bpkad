/**
 * diagnose_belum_rekon_detail.js
 * Cari sumber angka "BKU Belum Rekon 2.725.277"
 */
const prisma = require('./prismaClient');

function fmt(n) {
  return `Rp ${Number(n).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtDate(d) {
  if (!d) return '-';
  try { return new Date(d).toISOString().split('T')[0]; } catch { return String(d).substring(0,10); }
}

const YEAR = 2026;

async function main() {
  console.log('\n=== Diagnosa Lanjutan: BKU Belum Rekon ===\n');

  // ─── A. SP2D dengan status BELUM (belum ter-cocokkan ke bank) ────────────
  console.log('─── A. SP2D Status BELUM (tidak ada pasangan di bank) ──────────');
  const sp2dBelum = await prisma.$queryRaw`
    SELECT h.id, h.nomor, h.opd, h.jenis, h.tanggal, h.tanggal_pencairan,
           CAST(h.nilai_bruto AS DECIMAL) AS bruto,
           CAST(h.nilai_potongan AS DECIMAL) AS total_pot_header,
           h.status_rekon, h.keterangan_rekon,
           CAST(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto
             ELSE h.nilai_bruto - COALESCE(
               (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
                WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
               h.nilai_potongan)
           END AS DECIMAL) AS neto_baku
    FROM data_sp2d h
    WHERE h.tahun = ${YEAR}
      AND (h.status_rekon = 'BELUM' OR h.status_rekon IS NULL)
    ORDER BY COALESCE(h.tanggal_pencairan, h.tanggal)
  `;

  let totalSp2dBelum = 0;
  sp2dBelum.forEach(r => {
    totalSp2dBelum += Number(r.neto_baku);
    console.log(
      `  ${fmtDate(r.tanggal_pencairan||r.tanggal)} | ${r.nomor.substring(0,40)}\n` +
      `    OPD: ${r.opd} | Bruto: ${fmt(r.bruto)} | Neto Baku: ${fmt(r.neto_baku)} | Status: ${r.status_rekon}`
    );
  });
  console.log(`  Total SP2D Belum Rekon (neto): ${fmt(totalSp2dBelum)}  (${sp2dBelum.length} SP2D)\n`);

  // ─── B. Selisih per SP2D yang sudah matched (selisih_nilai di bank) ──────
  console.log('─── B. Selisih_Nilai pada Bank_Statement yang Matched ─────────');
  const bankSelisih = await prisma.$queryRaw`
    SELECT b.id, b.tanggal, b.deskripsi, b.ref_bku_id, b.match_type,
           CAST(b.debet AS DECIMAL) AS debet,
           CAST(b.selisih_nilai AS DECIMAL) AS selisih_nilai,
           b.catatan_selisih
    FROM bank_statement b
    WHERE b.is_matched = true
      AND EXTRACT(YEAR FROM b.tanggal) = ${YEAR}
      AND ABS(CAST(COALESCE(b.selisih_nilai, 0) AS DECIMAL)) > 1
    ORDER BY ABS(CAST(COALESCE(b.selisih_nilai, 0) AS DECIMAL)) DESC
  `;

  let totalSelisihNilai = 0;
  bankSelisih.forEach(r => {
    totalSelisihNilai += Number(r.selisih_nilai);
    console.log(
      `  Bank#${r.id} | ${fmtDate(r.tanggal)} | Debet: ${fmt(r.debet)} | Selisih: ${fmt(r.selisih_nilai)}\n` +
      `    Ref: ${r.ref_bku_id} | Type: ${r.match_type} | Ket: ${r.catatan_selisih || '-'}`
    );
  });
  console.log(`  Total Selisih Nilai dari Match: ${fmt(totalSelisihNilai)}\n`);

  // ─── C. Saldo Awal BKU vs Bank ───────────────────────────────────────────
  console.log('─── C. Saldo Awal ──────────────────────────────────────────────');
  const saldoAwal = await prisma.$queryRaw`
    SELECT id_sumber_dana, nilai, tahun FROM saldo_awal WHERE tahun = ${YEAR}
  `;
  let totalSaldoAwalBKU = 0;
  saldoAwal.forEach(r => {
    totalSaldoAwalBKU += Number(r.nilai);
    console.log(`  Sumber Dana: ${r.id_sumber_dana} | Saldo Awal: ${fmt(r.nilai)}`);
  });
  console.log(`  Total Saldo Awal BKU: ${fmt(totalSaldoAwalBKU)}`);

  const bankSaldoAwal = await prisma.$queryRaw`
    SELECT id, tanggal, deskripsi, CAST(kredit AS DECIMAL) AS kredit
    FROM bank_statement WHERE deskripsi ILIKE '%saldo awal%'
  `;
  bankSaldoAwal.forEach(r => {
    console.log(`  Bank Saldo Awal: ${fmt(r.kredit)} | Tanggal: ${fmtDate(r.tanggal)}`);
  });
  console.log('');

  // ─── D. Simulasi saldo akhir BKU vs Bank ─────────────────────────────────
  console.log('─── D. Simulasi Saldo Akhir ────────────────────────────────────');
  const [bkuKel] = await prisma.$queryRaw`
    SELECT SUM(
      CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto
      ELSE h.nilai_bruto - COALESCE(
        (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
         WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
        h.nilai_potongan)
      END
    )::DECIMAL AS total_keluar
    FROM data_sp2d h WHERE h.tahun = ${YEAR}
  `;
  const [bkuMas] = await prisma.$queryRaw`
    SELECT SUM(CAST(nilai AS DECIMAL)) AS total_masuk FROM data_pendapatan WHERE tahun = ${YEAR}
  `;
  const [bankAll] = await prisma.$queryRaw`
    SELECT
      SUM(CAST(COALESCE(debet,0) AS DECIMAL)) FILTER (WHERE deskripsi NOT ILIKE '%saldo awal%') AS total_debet,
      SUM(CAST(COALESCE(kredit,0) AS DECIMAL)) FILTER (WHERE deskripsi NOT ILIKE '%saldo awal%') AS total_kredit
    FROM bank_statement WHERE EXTRACT(YEAR FROM tanggal) = ${YEAR}
  `;

  const bankSA = bankSaldoAwal[0] ? Number(bankSaldoAwal[0].kredit) : 0;
  const bkuSA  = totalSaldoAwalBKU;
  const bkuKeluar = Number(bkuKel?.total_keluar || 0);
  const bkuMasuk  = Number(bkuMas?.total_masuk  || 0);
  const bankDebet  = Number(bankAll?.total_debet  || 0);
  const bankKredit = Number(bankAll?.total_kredit || 0);

  const saldoAkhirBKU  = bkuSA  + bkuMasuk  - bkuKeluar;
  const saldoAkhirBank = bankSA + bankKredit - bankDebet;
  const selisihSaldo   = saldoAkhirBKU - saldoAkhirBank;

  console.log(`  Saldo Awal  BKU  : ${fmt(bkuSA)}`);
  console.log(`  Penerimaan  BKU  : ${fmt(bkuMasuk)}`);
  console.log(`  Pengeluaran BKU  : ${fmt(bkuKeluar)}`);
  console.log(`  Saldo Akhir BKU  : ${fmt(saldoAkhirBKU)}`);
  console.log('');
  console.log(`  Saldo Awal  Bank : ${fmt(bankSA)}`);
  console.log(`  Kredit      Bank : ${fmt(bankKredit)}`);
  console.log(`  Debet       Bank : ${fmt(bankDebet)}`);
  console.log(`  Saldo Akhir Bank : ${fmt(saldoAkhirBank)}`);
  console.log(`\n  SELISIH SALDO (BKU - Bank): ${fmt(selisihSaldo)}  ${Math.abs(selisihSaldo) > 1 ? '⚠' : '✓'}\n`);

  // ─── E. Cek SUDAH_BRUTO SP2D: apakah selisih_rekon = 0 semua? ───────────
  console.log('─── E. SP2D SUDAH_BRUTO dengan selisih_rekon ≠ 0 ─────────────');
  const brutoSelisih = await prisma.$queryRaw`
    SELECT h.nomor, h.opd, CAST(h.nilai_bruto AS DECIMAL) AS bruto,
           CAST(h.selisih_rekon AS DECIMAL) AS selisih_rekon, h.keterangan_rekon,
           b.debet as bank_debet, b.selisih_nilai as bank_selisih
    FROM data_sp2d h
    LEFT JOIN bank_statement b ON b.ref_bku_id = h.id
    WHERE h.tahun = ${YEAR}
      AND h.status_rekon = 'SUDAH_BRUTO'
      AND ABS(CAST(COALESCE(h.selisih_rekon, 0) AS DECIMAL)) > 1
  `;
  if (brutoSelisih.length === 0) {
    console.log('  Tidak ada SP2D SUDAH_BRUTO dengan selisih_rekon ≠ 0. ✓\n');
  } else {
    brutoSelisih.forEach(r => {
      console.log(
        `  ${r.nomor}\n` +
        `    Bruto: ${fmt(r.bruto)} | Selisih Rekon: ${fmt(r.selisih_rekon)}\n` +
        `    Bank Debet: ${fmt(r.bank_debet)} | Bank Selisih: ${fmt(r.bank_selisih)}\n` +
        `    Ket: ${r.keterangan_rekon || '-'}`
      );
    });
  }

  // ─── F. SP2D yang ter-match di bank tapi selisih_nilai besar ────────────
  console.log('─── F. Bank match dengan selisih_nilai signifikan (>Rp 100.000) ─');
  const bigSelisih = await prisma.$queryRaw`
    SELECT b.id, b.tanggal, b.ref_bku_id, b.match_type,
           CAST(b.debet AS DECIMAL) AS debet,
           CAST(b.selisih_nilai AS DECIMAL) AS selisih_nilai,
           b.catatan_selisih, b.deskripsi
    FROM bank_statement b
    WHERE b.is_matched = true
      AND EXTRACT(YEAR FROM b.tanggal) = ${YEAR}
      AND ABS(CAST(COALESCE(b.selisih_nilai,0) AS DECIMAL)) > 100000
    ORDER BY ABS(CAST(COALESCE(b.selisih_nilai,0) AS DECIMAL)) DESC
  `;
  if (bigSelisih.length === 0) {
    console.log('  Tidak ada match dengan selisih > Rp 100.000. ✓\n');
  } else {
    let totalBigSelisih = 0;
    bigSelisih.forEach(r => {
      totalBigSelisih += Number(r.selisih_nilai);
      console.log(
        `  Bank#${r.id} | ${fmtDate(r.tanggal)} | ${r.match_type}\n` +
        `    Debet: ${fmt(r.debet)} | Selisih: ${fmt(r.selisih_nilai)}\n` +
        `    Ref BKU: ${r.ref_bku_id} | Ket: ${r.catatan_selisih || '-'}`
      );
    });
    console.log(`  TOTAL selisih besar: ${fmt(totalBigSelisih)}\n`);
  }

  // ─── G. Cek potongan rincian dari SUDAH SP2D yang tidak punya pasangan bank ─
  console.log('─── G. Potongan Rincian (SP2D SUDAH) yang tidak ada pasangan bank ─');
  const potOrphan = await prisma.$queryRaw`
    SELECT p.nomor_sp2d, p.jenis_potongan, CAST(p.nilai AS DECIMAL) AS nilai,
           p.tanggal_pencairan, p.status_rekon, p.uraian,
           h.status_rekon AS status_sp2d, h.opd
    FROM data_sp2d_potongan p
    JOIN data_sp2d h ON p.id_sp2d = h.id
    LEFT JOIN bank_statement b ON b.ref_bku_id = p.id::text
    WHERE h.tahun = ${YEAR}
      AND h.status_rekon IN ('SUDAH', 'SUDAH_BRUTO')
      AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
      AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL)
      AND b.id IS NULL
    ORDER BY p.tanggal_pencairan, p.nilai DESC
  `;
  let totalPotOrphan = 0;
  potOrphan.forEach(r => {
    totalPotOrphan += Number(r.nilai);
    console.log(
      `  ${fmtDate(r.tanggal_pencairan)} | ${r.jenis_potongan} | ${fmt(r.nilai)} | SP2D: ${r.nomor_sp2d?.substring(0,35)} | SPD-Status: ${r.status_sp2d}`
    );
  });
  console.log(`  TOTAL Potongan Orphan (ada di BKU, tidak ada di bank): ${fmt(totalPotOrphan)}  (${potOrphan.length} record)\n`);

  // ─── H. Cek nilai 2.725.277 dalam konteks selisih bank_statement ─────────
  const TARGET = 2725277;
  console.log(`─── H. Selisih bank per-bulan yang mendekati ${fmt(TARGET)} ─────`);
  const monthlySelisih = await prisma.$queryRaw`
    SELECT
      EXTRACT(MONTH FROM b.tanggal)::int AS bulan,
      SUM(CAST(COALESCE(b.selisih_nilai, 0) AS DECIMAL)) AS total_selisih
    FROM bank_statement b
    WHERE b.is_matched = true
      AND EXTRACT(YEAR FROM b.tanggal) = ${YEAR}
    GROUP BY EXTRACT(MONTH FROM b.tanggal)
    ORDER BY bulan
  `;
  monthlySelisih.forEach(r => {
    const flag = Math.abs(Number(r.total_selisih)) > 1 ? ' ⚠' : '';
    console.log(`  Bulan ${String(r.bulan).padStart(2,'0')}: ${fmt(r.total_selisih)}${flag}`);
  });

  await prisma.$disconnect();
  console.log('\n=== Selesai ===');
}

main().catch(e => {
  console.error('[ERROR]', e.message);
  prisma.$disconnect();
  process.exit(1);
});
