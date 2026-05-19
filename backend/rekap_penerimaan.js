const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

const fmt = (n) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

async function run() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║    REKAP PENERIMAAN MURNI — DSS BPKAD                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── SISI BANK: total KREDIT (penerimaan) per bulan ─────────────────────
  const bankTotal = await p.$queryRaw`
    SELECT 
      TO_CHAR(tanggal, 'YYYY-MM') as bulan,
      COUNT(*) as jumlah_transaksi,
      SUM(COALESCE(kredit, 0)) as total_kredit,
      SUM(CASE WHEN is_matched THEN COALESCE(kredit, 0) ELSE 0 END) as sudah_rekon,
      SUM(CASE WHEN NOT is_matched THEN COALESCE(kredit, 0) ELSE 0 END) as belum_rekon
    FROM bank_statement
    WHERE COALESCE(kredit, 0) > 0
    GROUP BY TO_CHAR(tanggal, 'YYYY-MM')
    ORDER BY bulan
  `;

  console.log('═══ SISI BANK (Mutasi KREDIT / Penerimaan) ═══');
  console.log('Bulan     | Jml Trx | Total Kredit          | Sudah Rekon           | Belum Rekon');
  console.log('----------|---------|----------------------|----------------------|--------------------');
  let grandTotalBank = 0n, grandSudahBank = 0n, grandBelumBank = 0n;
  bankTotal.forEach(r => {
    const total = BigInt(Math.round(Number(r.total_kredit)));
    const sudah = BigInt(Math.round(Number(r.sudah_rekon)));
    const belum = BigInt(Math.round(Number(r.belum_rekon)));
    grandTotalBank += total;
    grandSudahBank += sudah;
    grandBelumBank += belum;
    console.log(`${r.bulan}   | ${String(r.jumlah_transaksi).padEnd(7)} | ${fmt(Number(total)).padEnd(22)} | ${fmt(Number(sudah)).padEnd(22)} | ${fmt(Number(belum))}`);
  });
  console.log('----------|---------|----------------------|----------------------|--------------------');
  console.log(`TOTAL     |         | ${fmt(Number(grandTotalBank)).padEnd(22)} | ${fmt(Number(grandSudahBank)).padEnd(22)} | ${fmt(Number(grandBelumBank))}`);

  // ── SISI BKU: total data_pendapatan per bulan ──────────────────────────
  const bkuTotal = await p.$queryRaw`
    SELECT 
      TO_CHAR(tanggal, 'YYYY-MM') as bulan,
      COUNT(*) as jumlah_transaksi,
      SUM(COALESCE(nilai, 0)) as total_nilai,
      SUM(CASE WHEN status_rekon LIKE 'SUDAH%' THEN COALESCE(nilai, 0) ELSE 0 END) as sudah_rekon,
      SUM(CASE WHEN (status_rekon IS NULL OR status_rekon = 'BELUM' OR status_rekon = '') THEN COALESCE(nilai, 0) ELSE 0 END) as belum_rekon
    FROM data_pendapatan
    GROUP BY TO_CHAR(tanggal, 'YYYY-MM')
    ORDER BY bulan
  `;

  console.log('\n═══ SISI BKU (Data Inputan Penerimaan) ═══');
  console.log('Bulan     | Jml Trx | Total Nilai           | Sudah Rekon           | Belum Rekon');
  console.log('----------|---------|----------------------|----------------------|--------------------');
  let grandTotalBku = 0n, grandSudahBku = 0n, grandBelumBku = 0n;
  bkuTotal.forEach(r => {
    const total = BigInt(Math.round(Number(r.total_nilai)));
    const sudah = BigInt(Math.round(Number(r.sudah_rekon)));
    const belum = BigInt(Math.round(Number(r.belum_rekon)));
    grandTotalBku += total;
    grandSudahBku += sudah;
    grandBelumBku += belum;
    console.log(`${r.bulan}   | ${String(r.jumlah_transaksi).padEnd(7)} | ${fmt(Number(total)).padEnd(22)} | ${fmt(Number(sudah)).padEnd(22)} | ${fmt(Number(belum))}`);
  });
  console.log('----------|---------|----------------------|----------------------|--------------------');
  console.log(`TOTAL     |         | ${fmt(Number(grandTotalBku)).padEnd(22)} | ${fmt(Number(grandSudahBku)).padEnd(22)} | ${fmt(Number(grandBelumBku))}`);

  // ── SELISIH BANK vs BKU ────────────────────────────────────────────────
  const selisih = Number(grandTotalBank) - Number(grandTotalBku);
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║    RINGKASAN PERBANDINGAN                                    ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Total Kredit Bank    : ${fmt(Number(grandTotalBank)).padEnd(37)}║`);
  console.log(`║  Total Data Pendapatan: ${fmt(Number(grandTotalBku)).padEnd(37)}║`);
  console.log(`║  Selisih (Bank - BKU) : ${fmt(selisih).padEnd(37)}║`);
  console.log('╠══════════════════════════════════════════════════════════════╣');
  if (selisih === 0) {
    console.log('║  ✅ SEIMBANG — Total Bank = Total BKU                        ║');
  } else if (selisih > 0) {
    console.log('║  ⚠️  Bank LEBIH BESAR dari BKU — ada penerimaan bank yang    ║');
    console.log('║     belum tercatat di data inputan                           ║');
  } else {
    console.log('║  ⚠️  BKU LEBIH BESAR dari Bank — ada data pendapatan yang    ║');
    console.log('║     belum masuk ke rekening bank                             ║');
  }
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  await p.$disconnect();
}

run().catch(e => { console.error('ERROR:', e.message); p.$disconnect(); });
