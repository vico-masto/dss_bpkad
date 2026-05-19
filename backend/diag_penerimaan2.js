/**
 * Diagnostik Lanjutan: Cross-match bank kredit vs data_pendapatan
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

function fmtIDR(n) {
  return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
}

const SEP = '─'.repeat(80);

async function main() {
  console.log('=== DIAGNOSTIK LANJUTAN: CROSS MATCH BANK vs PENDAPATAN ===\n');

  // 1. Semua data_pendapatan BELUM beserta nilainya
  const pendapatan = await prisma.$queryRaw`
    SELECT
      CAST(id AS VARCHAR) as id,
      nomor_bukti,
      uraian,
      CAST(nilai AS DECIMAL) as nilai,
      tanggal,
      status_rekon,
      EXISTS(
        SELECT 1 FROM bank_statement bx
        WHERE TRIM(bx.ref_bku_id) = TRIM(CAST(data_pendapatan.id AS VARCHAR))
      ) as linked_bank
    FROM data_pendapatan
    WHERE COALESCE(UPPER(TRIM(status_rekon)), '') NOT LIKE '%SUDAH%'
    ORDER BY tanggal ASC
  `;
  console.log('DATA_PENDAPATAN BELUM REKON:');
  console.log(SEP);
  pendapatan.forEach((p, i) => {
    const tgl = fmtDateWIT(p.tanggal);
    console.log(`[${String(i+1).padStart(3)}] ${tgl} | Rp ${fmtIDR(p.nilai).padStart(22)} | nb:${String(p.nomor_bukti||'-').padEnd(15)} | linked:${p.linked_bank} | ${String(p.uraian||'').substring(0,40)}`);
  });

  // 2. Semua bank kredit belum cocok
  const bankKredit = await prisma.$queryRaw`
    SELECT id, tanggal, deskripsi, CAST(kredit AS DECIMAL) as kredit, nomor_bukti
    FROM bank_statement
    WHERE is_matched = false AND kredit > 0
    ORDER BY tanggal ASC
  `;

  console.log('\n\nBANK KREDIT BELUM COCOK:');
  console.log(SEP);
  bankKredit.forEach((b, i) => {
    const tgl = fmtDateWIT(b.tanggal);
    console.log(`[${String(i+1).padStart(3)}] ${tgl} | Rp ${fmtIDR(b.kredit).padStart(22)} | nb:${String(b.nomor_bukti||'-').padEnd(20)} | ${String(b.deskripsi||'').substring(0,40)}`);
  });

  // 3. Cek apakah bank kredit yang belum cocok ada pasangannya di pendapatan
  //    dengan jendela tanggal yang LEBAR (H-30 sd H+30) dan toleransi nilai (ABS < 1000)
  console.log('\n\nANALISIS PASANGAN POTENSIAL (jendela 30 hari, toleransi Rp 1.000):');
  console.log(SEP);

  const pNilais = new Set(pendapatan.map(p => Math.round(Number(p.nilai) * 100)));
  const bNilais = bankKredit.map(b => Math.round(Number(b.kredit) * 100));

  const matched = bNilais.filter(v => pNilais.has(v));
  const unmatched = bNilais.filter(v => !pNilais.has(v));

  console.log('Bank kredit nilai cocok PERSIS dengan pendapatan  :', matched.length);
  console.log('Bank kredit nilai TIDAK ADA di pendapatan          :', unmatched.length);

  // 4. Nilai pendapatan yang cocok dengan bank kredit mana
  const pNilaisArr = [...new Set(pendapatan.map(p => Number(p.nilai)))];
  const bNilaisArr = [...new Set(bankKredit.map(b => Number(b.kredit)))];

  console.log('\nNilai di data_pendapatan yang COCOK dengan bank kredit:');
  pNilaisArr.forEach(pv => {
    const bankMatch = bankKredit.filter(b => Math.abs(Number(b.kredit) - pv) < 1);
    if (bankMatch.length > 0) {
      console.log(`  Rp ${fmtIDR(pv)} → cocok dengan ${bankMatch.length} bank kredit`);
    }
  });

  console.log('\nNilai di data_pendapatan yang TIDAK COCOK dengan bank kredit mana pun:');
  pNilaisArr.forEach(pv => {
    const bankMatch = bankKredit.filter(b => Math.abs(Number(b.kredit) - pv) < 1);
    if (bankMatch.length === 0) {
      const p = pendapatan.find(px => Math.abs(Number(px.nilai) - pv) < 1);
      console.log(`  Rp ${fmtIDR(pv)} | nb:${p?.nomor_bukti||'-'} | ${String(p?.uraian||'').substring(0,50)}`);
    }
  });

  // 5. Cek apakah ada bank kredit sudah COCOK (is_matched=true) dengan pendapatan
  const alreadyLinked = await prisma.$queryRaw`
    SELECT
      CAST(p.id AS VARCHAR) as p_id,
      p.nomor_bukti,
      CAST(p.nilai AS DECIMAL) as nilai,
      p.tanggal as p_tgl,
      p.status_rekon,
      bs.id as bs_id,
      bs.tanggal as bs_tgl,
      CAST(bs.kredit AS DECIMAL) as bs_kredit
    FROM data_pendapatan p
    JOIN bank_statement bs ON TRIM(bs.ref_bku_id) = TRIM(CAST(p.id AS VARCHAR))
    ORDER BY p.tanggal DESC
    LIMIT 10
  `;
  console.log('\n\nCONTOH DATA PENDAPATAN YANG SUDAH TERCOCOKKAN (sampel 10):');
  console.log(SEP);
  alreadyLinked.forEach((r, i) => {
    console.log(`[${i+1}] Pendapatan Rp ${fmtIDR(r.nilai)} tgl ${fmtDateWIT(r.p_tgl)} → Bank Rp ${fmtIDR(r.bs_kredit)} tgl ${fmtDateWIT(r.bs_tgl)} | status:${r.status_rekon}`);
  });

  // 6. Ringkasan: mengapa bank kredit tidak bisa match
  console.log('\n\nRINGKASAN AKAR MASALAH:');
  console.log(SEP);

  // Cek deskripsi bank yang umum
  const descCount = {};
  bankKredit.forEach(b => {
    const desc = String(b.deskripsi || 'NULL').split(' ').slice(0, 3).join(' ');
    descCount[desc] = (descCount[desc] || 0) + 1;
  });
  console.log('Top deskripsi bank kredit belum cocok:');
  Object.entries(descCount).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([d, c]) => {
    console.log(`  ${c}x "${d}"`);
  });

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
