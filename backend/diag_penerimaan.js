/**
 * Diagnostik: Penerimaan Bank Belum Cocok & Tidak Ada Rekomendasi
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

const WIT_OFFSET_MS = 9 * 60 * 60 * 1000;
const fmtDateWIT = (d) => {
  if (!d) return null;
  const raw = d instanceof Date ? d : new Date(String(d));
  if (isNaN(raw.getTime())) return null;
  const wit = new Date(raw.getTime() + WIT_OFFSET_MS);
  return wit.toISOString().split('T')[0];
};

async function main() {
  console.log('=== DIAGNOSTIK PENERIMAAN BELUM COCOK ===\n');

  // 1. Jumlah total
  const totalUnmatched = await prisma.bank_statement.count({
    where: { is_matched: false, kredit: { gt: 0 } }
  });
  console.log('Total penerimaan (kredit>0) belum cocok :', totalUnmatched);

  // 2. Semua data_pendapatan belum rekon
  const pendapatanBelum = await prisma.data_pendapatan.count({
    where: { OR: [{ status_rekon: 'BELUM' }, { status_rekon: null }, { status_rekon: '' }] }
  });
  console.log('Total data_pendapatan status BELUM      :', pendapatanBelum);

  // 3. Ambil semua penerimaan belum cocok
  const bankItems = await prisma.bank_statement.findMany({
    where: { is_matched: false, kredit: { gt: 0 } },
    orderBy: { tanggal: 'desc' },
    select: { id: true, tanggal: true, deskripsi: true, kredit: true, nomor_bukti: true }
  });

  const kredit = bankItems.map(b => Number(b.kredit));
  const unikNilai = [...new Set(kredit)].sort((a, b) => a - b);
  console.log('\nDistribusi nilai unik (Rp):', unikNilai.length, 'nilai berbeda');

  // 4. Cari kandidat pendapatan untuk masing-masing bank item
  let noCandidate = 0;
  let withCandidate = 0;
  const noMatchDetails = [];

  for (const bank of bankItems) {
    const bankDateStr = fmtDateWIT(bank.tanggal);
    const val = Number(bank.kredit);

    // Cari pendapatan dengan nilai sama & tanggal dalam H-7 sd H+7
    const candidates = await prisma.$queryRaw`
      SELECT id, nomor_bukti, uraian, CAST(nilai AS DECIMAL) as nilai, tanggal, status_rekon
      FROM data_pendapatan p
      WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%'
        AND NOT EXISTS (SELECT 1 FROM bank_statement bx WHERE TRIM(bx.ref_bku_id) = TRIM(CAST(p.id AS VARCHAR)))
        AND ABS(CAST(p.nilai AS DECIMAL) - ${val}) < 1
        AND CAST(p.tanggal AS DATE) BETWEEN (CAST(${bankDateStr} AS DATE) - INTERVAL '7 days') AND (CAST(${bankDateStr} AS DATE) + INTERVAL '7 days')
    `;

    if (candidates.length === 0) {
      noCandidate++;
      noMatchDetails.push({
        id: String(bank.id).substring(0, 8),
        tanggal: bankDateStr,
        nilai: val,
        deskripsi: String(bank.deskripsi || '').substring(0, 60),
        nomor_bukti: String(bank.nomor_bukti || '-')
      });
    } else {
      withCandidate++;
    }
  }

  console.log('\n--- HASIL ANALISIS ---');
  console.log('Bank penerimaan DENGAN kandidat pendapatan :', withCandidate);
  console.log('Bank penerimaan TANPA kandidat pendapatan  :', noCandidate);

  // 5. Analisis penyebab "tanpa kandidat"
  if (noMatchDetails.length > 0) {
    console.log('\n--- SAMPEL 30 YANG TIDAK PUNYA KANDIDAT ---');
    noMatchDetails.slice(0, 30).forEach((d, i) => {
      console.log(`[${String(i+1).padStart(3)}] ${d.tanggal} | Rp ${d.nilai.toLocaleString('id-ID').padStart(18)} | nb:${d.nomor_bukti} | ${d.deskripsi}`);
    });

    // Cek: apakah ada pendapatan dengan nilai cocok tapi sudah di-link ke bank lain (bisa jadi BKU Ganda)
    console.log('\n--- CEK NILAI-NILAI YANG ADA DI PENDAPATAN (TANPA BATASAN TANGGAL) ---');
    let nilaiAdaDiPendapatan = 0;
    const sampelCek = noMatchDetails.slice(0, 10);
    for (const d of sampelCek) {
      const allPend = await prisma.$queryRaw`
        SELECT id, tanggal, CAST(nilai AS DECIMAL) as nilai, status_rekon,
               EXISTS(SELECT 1 FROM bank_statement bx WHERE TRIM(bx.ref_bku_id) = TRIM(CAST(data_pendapatan.id AS VARCHAR))) as linked
        FROM data_pendapatan
        WHERE ABS(CAST(nilai AS DECIMAL) - ${d.nilai}) < 1
        LIMIT 5
      `;
      if (allPend.length > 0) {
        nilaiAdaDiPendapatan++;
        const tgl = allPend.map(p => {
          const t = fmtDateWIT(p.tanggal);
          return `${t} status=${p.status_rekon||'NULL'} linked=${p.linked}`;
        }).join(' | ');
        console.log(`  Rp ${d.nilai.toLocaleString('id-ID')} (bank tgl ${d.tanggal}): PENDAPATAN ada → ${tgl}`);
      } else {
        console.log(`  Rp ${d.nilai.toLocaleString('id-ID')} (bank tgl ${d.tanggal}): TIDAK ADA di data_pendapatan sama sekali`);
      }
    }

    // 6. Cek tahun data pendapatan vs tahun transaksi bank
    console.log('\n--- CEK DISTRIBUSI TAHUN BANK ITEMS TANPA KANDIDAT ---');
    const tahunDist = {};
    noMatchDetails.forEach(d => {
      const tahun = d.tanggal ? d.tanggal.substring(0, 4) : 'unknown';
      tahunDist[tahun] = (tahunDist[tahun] || 0) + 1;
    });
    Object.entries(tahunDist).sort().forEach(([t, c]) => console.log(`  ${t}: ${c} transaksi`));

    // 7. Cek filter tahun di SQL
    const currentYear = new Date().getFullYear();
    const tahunPendapatanDist = await prisma.$queryRaw`
      SELECT tahun, COUNT(*)::int as jumlah FROM data_pendapatan
      WHERE COALESCE(UPPER(TRIM(status_rekon)), '') NOT LIKE '%SUDAH%'
      GROUP BY tahun ORDER BY tahun
    `;
    console.log('\n--- DISTRIBUSI TAHUN di data_pendapatan (BELUM) ---');
    tahunPendapatanDist.forEach(r => console.log(`  Tahun ${r.tahun}: ${r.jumlah} records`));
  }

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
