/**
 * AUDIT: Asal nilai Rp 2.000.867.364,00 pada BKU Belum Rekon
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

function fmtIDR(n) {
  return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
}
const SEP = '═'.repeat(72);
const SEP2 = '─'.repeat(72);

async function main() {
  console.log('\n' + SEP);
  console.log(' AUDIT: BKU BELUM REKON — Rp 2.000.867.364,00');
  console.log(SEP + '\n');

  const TARGET = 2000867364;

  // ── 1. Total masing-masing tabel BELUM ────────────────────────────────────
  const [sp2dSum, pndSum, potSum, pajSum, bankDebetSum, bankKreditSum] = await Promise.all([
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai_bruto AS DECIMAL)),0)::DECIMAL AS total FROM data_sp2d WHERE COALESCE(UPPER(TRIM(status_rekon)),'') NOT LIKE '%SUDAH%'`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai AS DECIMAL)),0)::DECIMAL AS total FROM data_pendapatan WHERE COALESCE(UPPER(TRIM(status_rekon)),'') NOT LIKE '%SUDAH%'`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai AS DECIMAL)),0)::DECIMAL AS total FROM data_sp2d_potongan WHERE COALESCE(UPPER(TRIM(status_rekon)),'') NOT LIKE '%SUDAH%'`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai AS DECIMAL)),0)::DECIMAL AS total FROM setoran_pajak WHERE COALESCE(UPPER(TRIM(status_rekon)),'') NOT LIKE '%SUDAH%'`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(debet AS DECIMAL)),0)::DECIMAL AS total FROM bank_statement WHERE is_matched = false AND debet > 0`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(kredit AS DECIMAL)),0)::DECIMAL AS total FROM bank_statement WHERE is_matched = false AND kredit > 0`,
  ]);

  const sp2d_total = Number(sp2dSum[0].total);
  const pnd_total  = Number(pndSum[0].total);
  const pot_total  = Number(potSum[0].total);
  const paj_total  = Number(pajSum[0].total);
  const bank_debet = Number(bankDebetSum[0].total);
  const bank_kred  = Number(bankKreditSum[0].total);

  console.log('① TOTAL BKU STATUS BELUM PER TABEL:');
  console.log(SEP2);
  console.log(`  data_sp2d (nilai_bruto)    : Rp ${fmtIDR(sp2d_total).padStart(28)}`);
  console.log(`  data_pendapatan (nilai)    : Rp ${fmtIDR(pnd_total).padStart(28)}`);
  console.log(`  data_sp2d_potongan (nilai) : Rp ${fmtIDR(pot_total).padStart(28)}`);
  console.log(`  setoran_pajak (nilai)      : Rp ${fmtIDR(paj_total).padStart(28)}`);
  console.log(`  bank_statement debet (unmatch): Rp ${fmtIDR(bank_debet).padStart(25)}`);
  console.log(`  bank_statement kredit (unmatch): Rp ${fmtIDR(bank_kred).padStart(24)}`);

  // ── 2. Cek apakah angka target cocok dengan kombinasi tertentu ─────────────
  console.log('\n② PENCOCOKAN KOMBINASI ke TARGET Rp ' + fmtIDR(TARGET) + ':');
  console.log(SEP2);
  const tol = 1000; // toleransi Rp 1000 (pembulatan)
  const checks = [
    { label: 'bank_debet saja', val: bank_debet },
    { label: 'bank_kredit saja', val: bank_kred },
    { label: 'sp2d saja', val: sp2d_total },
    { label: 'pendapatan saja', val: pnd_total },
    { label: 'sp2d + pendapatan', val: sp2d_total + pnd_total },
    { label: 'sp2d + potongan', val: sp2d_total + pot_total },
    { label: 'sp2d + pajak', val: sp2d_total + paj_total },
    { label: 'sp2d + pendapatan + potongan', val: sp2d_total + pnd_total + pot_total },
    { label: 'bank_debet - bank_kredit', val: bank_debet - bank_kred },
    { label: 'bank_kredit - bank_debet', val: bank_kred - bank_debet },
    { label: 'sp2d - pendapatan', val: sp2d_total - pnd_total },
  ];
  checks.forEach(c => {
    const diff = Math.abs(c.val - TARGET);
    const mark = diff < tol ? '✅ MATCH' : `  off by Rp ${fmtIDR(diff)}`;
    console.log(`  ${c.label.padEnd(35)}: Rp ${fmtIDR(c.val).padStart(22)} ${mark}`);
  });

  // ── 3. Breakdown SP2D BELUM per OPD/bulan ──────────────────────────────────
  console.log('\n③ SP2D BELUM — TOP 10 NILAI TERBESAR:');
  console.log(SEP2);
  const topSp2d = await prisma.$queryRaw`
    SELECT nomor, uraian, CAST(nilai_bruto AS DECIMAL) as nilai, tanggal, status_rekon
    FROM data_sp2d
    WHERE COALESCE(UPPER(TRIM(status_rekon)),'') NOT LIKE '%SUDAH%'
    ORDER BY nilai_bruto DESC LIMIT 10
  `;
  topSp2d.forEach((r, i) => {
    const tgl = r.tanggal ? new Date(r.tanggal).toISOString().split('T')[0] : '-';
    console.log(`  [${i+1}] ${tgl} | Rp ${fmtIDR(r.nilai).padStart(22)} | ${String(r.nomor||'-').substring(0,20)} | ${String(r.uraian||'').substring(0,30)}`);
  });

  // ── 4. Breakdown BANK DEBET BELUM (pengeluaran) ────────────────────────────
  console.log('\n④ BANK DEBET BELUM COCOK — TOP 10 NILAI TERBESAR:');
  console.log(SEP2);
  const topBankDebet = await prisma.$queryRaw`
    SELECT tanggal, deskripsi, CAST(debet AS DECIMAL) as debet, nomor_bukti
    FROM bank_statement
    WHERE is_matched = false AND debet > 0
    ORDER BY debet DESC LIMIT 10
  `;
  topBankDebet.forEach((r, i) => {
    const tgl = r.tanggal ? new Date(r.tanggal).toISOString().split('T')[0] : '-';
    console.log(`  [${i+1}] ${tgl} | Rp ${fmtIDR(r.debet).padStart(22)} | ${String(r.deskripsi||'').substring(0,40)}`);
  });

  // ── 5. Hitung saldo BKU vs saldo bank ─────────────────────────────────────
  console.log('\n⑤ KALKULASI SALDO BKU vs BANK (SEMUA DATA):');
  console.log(SEP2);
  const [saRes, spRes, pndAllRes, potAllRes, pajAllRes, adjInRes, adjOutRes, bankSaldoRes] = await Promise.all([
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(saldo AS DECIMAL)),0)::DECIMAL AS total FROM saldo_awal`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai_bruto AS DECIMAL)),0)::DECIMAL AS total FROM data_sp2d`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai AS DECIMAL)),0)::DECIMAL AS total FROM data_pendapatan`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai AS DECIMAL)),0)::DECIMAL AS total FROM data_sp2d_potongan`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai AS DECIMAL)),0)::DECIMAL AS total FROM setoran_pajak`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai AS DECIMAL)),0)::DECIMAL AS total FROM data_penyesuaian WHERE jenis = 'MASUK'`,
    prisma.$queryRaw`SELECT COALESCE(SUM(CAST(nilai AS DECIMAL)),0)::DECIMAL AS total FROM data_penyesuaian WHERE jenis = 'KELUAR'`,
    prisma.$queryRaw`SELECT COALESCE(MAX(CAST(saldo_akhir AS DECIMAL)),0)::DECIMAL AS total FROM bank_statement ORDER BY tanggal DESC, id DESC LIMIT 1`,
  ]);

  const sa     = Number(saRes[0].total);
  const sp2dAll = Number(spRes[0].total);
  const pndAll  = Number(pndAllRes[0].total);
  const potAll  = Number(potAllRes[0].total);
  const pajAll  = Number(pajAllRes[0].total);
  const adjIn   = Number(adjInRes[0].total);
  const adjOut  = Number(adjOutRes[0].total);
  const bankSaldo = Number(bankSaldoRes[0].total);

  const saldoBKU = sa + pndAll - sp2dAll - potAll - pajAll + adjIn - adjOut;
  const selisih  = saldoBKU - bankSaldo;

  console.log(`  Saldo Awal (SA)       : Rp ${fmtIDR(sa)}`);
  console.log(`  + Pendapatan          : Rp ${fmtIDR(pndAll)}`);
  console.log(`  - SP2D (bruto)        : Rp ${fmtIDR(sp2dAll)}`);
  console.log(`  - Potongan            : Rp ${fmtIDR(potAll)}`);
  console.log(`  - Setoran Pajak       : Rp ${fmtIDR(pajAll)}`);
  console.log(`  + Penyesuaian Masuk   : Rp ${fmtIDR(adjIn)}`);
  console.log(`  - Penyesuaian Keluar  : Rp ${fmtIDR(adjOut)}`);
  console.log(`  ─────────────────────────────────────────────`);
  console.log(`  = Saldo BKU           : Rp ${fmtIDR(saldoBKU)}`);
  console.log(`  Saldo Bank (saldo_akhir terakhir): Rp ${fmtIDR(bankSaldo)}`);
  console.log(`  SELISIH BKU - Bank    : Rp ${fmtIDR(selisih)}`);
  if (Math.abs(selisih - TARGET) < 1000) console.log(`  ✅ SELISIH = TARGET Rp ${fmtIDR(TARGET)}`);

  // ── 6. Cek total bank yang belum dicocokkan per bulan ─────────────────────
  console.log('\n⑥ TOTAL BANK BELUM COCOK PER BULAN:');
  console.log(SEP2);
  const bankPerBulan = await prisma.$queryRaw`
    SELECT
      TO_CHAR(tanggal, 'YYYY-MM') AS bulan,
      COUNT(*)::int AS jumlah,
      COALESCE(SUM(CAST(debet AS DECIMAL)),0)::DECIMAL AS total_debet,
      COALESCE(SUM(CAST(kredit AS DECIMAL)),0)::DECIMAL AS total_kredit
    FROM bank_statement
    WHERE is_matched = false
    GROUP BY bulan ORDER BY bulan
  `;
  bankPerBulan.forEach(r => {
    console.log(`  ${r.bulan} | ${String(r.jumlah).padStart(4)} transaksi | Debet Rp ${fmtIDR(r.total_debet).padStart(20)} | Kredit Rp ${fmtIDR(r.total_kredit).padStart(20)}`);
  });

  // ── 7. Total SP2D BELUM per bulan ──────────────────────────────────────────
  console.log('\n⑦ TOTAL SP2D BELUM PER BULAN:');
  console.log(SEP2);
  const sp2dPerBulan = await prisma.$queryRaw`
    SELECT
      TO_CHAR(COALESCE(tanggal_pencairan, tanggal), 'YYYY-MM') AS bulan,
      COUNT(*)::int AS jumlah,
      COALESCE(SUM(CAST(nilai_bruto AS DECIMAL)),0)::DECIMAL AS total
    FROM data_sp2d
    WHERE COALESCE(UPPER(TRIM(status_rekon)),'') NOT LIKE '%SUDAH%'
    GROUP BY bulan ORDER BY bulan
  `;
  sp2dPerBulan.forEach(r => {
    console.log(`  ${r.bulan} | ${String(r.jumlah).padStart(4)} SP2D | Rp ${fmtIDR(r.total)}`);
  });

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
