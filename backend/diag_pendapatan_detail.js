/**
 * Investigasi mendalam: 141 data_pendapatan BELUM — apa yang ada di bank_statement?
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const SEP = '═'.repeat(90);
const SEP2 = '─'.repeat(90);
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }

async function main() {
  console.log('\n' + SEP);
  console.log(' INVESTIGASI MENDALAM: 141 data_pendapatan BELUM');
  console.log(SEP + '\n');

  // Daftar semua pendapatan BELUM
  const belum = await prisma.$queryRaw`
    SELECT
      p.id::text AS p_id,
      p.nomor_bukti,
      p.uraian,
      CAST(p.nilai AS DECIMAL) AS nilai,
      p.tanggal,
      p.tahun,
      p.id_sumber_dana,
      p.status_rekon
    FROM data_pendapatan p
    WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
    ORDER BY p.tanggal, p.nomor_bukti
  `;

  console.log(`Total pendapatan BELUM: ${belum.length}\n`);

  // Cek format id dan apakah ada bank_statement.ref_bku_id yang mengarah ke sini
  // (termasuk dengan whitespace / case mismatch)
  const allRefs = await prisma.$queryRaw`
    SELECT DISTINCT TRIM(ref_bku_id) AS ref, is_matched, nomor_bukti, CAST(kredit AS DECIMAL) AS kredit
    FROM bank_statement
    WHERE ref_bku_id IS NOT NULL AND ref_bku_id <> ''
    ORDER BY ref
  `;

  const refSet = new Set(allRefs.map(r => String(r.ref).trim()));

  let linkedCount = 0, orphanCount = 0;

  // ── A: per nomor_bukti ── apakah ada pasangan di bank kredit?
  const nbs = belum.map(p => String(p.nomor_bukti || '').toLowerCase().trim()).filter(Boolean);
  const bankByNB = await prisma.$queryRaw`
    SELECT
      LOWER(TRIM(nomor_bukti)) AS nb,
      CAST(kredit AS DECIMAL) AS kredit,
      is_matched,
      ref_bku_id,
      id
    FROM bank_statement
    WHERE kredit > 0 AND nomor_bukti IS NOT NULL AND nomor_bukti <> ''
  `;
  const bankNBMap = new Map();
  bankByNB.forEach(b => {
    const k = String(b.nb).trim();
    if (!bankNBMap.has(k)) bankNBMap.set(k, []);
    bankNBMap.get(k).push(b);
  });

  console.log('① Pendapatan BELUM — cek apakah nomor_bukti ada di bank_statement:');
  console.log(SEP2);

  const noMatch = [], hasMatchUnlinked = [], hasMatchLinked = [];
  for (const p of belum) {
    const nb = String(p.nomor_bukti || '').toLowerCase().trim();
    const bankRows = bankNBMap.get(nb) || [];
    const isRefPointed = refSet.has(String(p.p_id).trim());

    if (isRefPointed) {
      linkedCount++;
      hasMatchLinked.push(p);
    } else if (bankRows.length > 0) {
      hasMatchUnlinked.push({ ...p, bankRows });
    } else {
      noMatch.push(p);
    }
  }

  console.log(`\n  A) Pendapatan BELUM tapi ada bank.ref_bku_id yang menunjuk padanya: ${hasMatchLinked.length}`);
  hasMatchLinked.forEach((p, i) => {
    const tgl = p.tanggal ? new Date(p.tanggal).toISOString().split('T')[0] : '-';
    console.log(`     [${i+1}] id:${p.p_id.substring(0,8)} | ${tgl} | nb:${String(p.nomor_bukti||'').padEnd(20)} | Rp ${fmtIDR(p.nilai)}`);
  });

  console.log(`\n  B) Pendapatan BELUM + nomor_bukti ada di bank (belum linked): ${hasMatchUnlinked.length}`);
  hasMatchUnlinked.forEach((p, i) => {
    const tgl = p.tanggal ? new Date(p.tanggal).toISOString().split('T')[0] : '-';
    const bRows = p.bankRows.map(b => `kredit:${fmtIDR(b.kredit)} matched:${b.is_matched} ref:${b.ref_bku_id||'NULL'}`).join(' | ');
    console.log(`     [${i+1}] ${tgl} | nb:${String(p.nomor_bukti||'').padEnd(20)} | p.nilai:${fmtIDR(p.nilai).padStart(18)} | bank→[${bRows}]`);
  });

  console.log(`\n  C) Pendapatan BELUM tanpa pasangan nomor_bukti apapun di bank: ${noMatch.length}`);

  // Untuk C: cek apakah nilai ada di bank (value-only match)
  const noMatchWithVal = [];
  const noMatchOrphan = [];
  for (const p of noMatch) {
    const valMatch = await prisma.$queryRaw`
      SELECT id, nomor_bukti, deskripsi, CAST(kredit AS DECIMAL) AS kredit, is_matched, ref_bku_id, tanggal
      FROM bank_statement
      WHERE kredit > 0 AND ABS(CAST(kredit AS DECIMAL) - ${Number(p.nilai)}) < 1
      LIMIT 5
    `;
    if (valMatch.length > 0) {
      noMatchWithVal.push({ ...p, valMatch });
    } else {
      noMatchOrphan.push(p);
    }
  }

  console.log(`\n     C1) Tanpa nomor_bukti, tapi nilai ada di bank: ${noMatchWithVal.length}`);
  noMatchWithVal.slice(0, 20).forEach((p, i) => {
    const tgl = p.tanggal ? new Date(p.tanggal).toISOString().split('T')[0] : '-';
    console.log(`       [${i+1}] ${tgl} | nb:${String(p.nomor_bukti||'NULL').padEnd(20)} | Rp ${fmtIDR(p.nilai)}`);
    p.valMatch.forEach(b => {
      const btgl = b.tanggal ? new Date(b.tanggal).toISOString().split('T')[0] : '-';
      console.log(`             → bs: ${btgl} | nb:${String(b.nomor_bukti||'').padEnd(20)} | kredit:${fmtIDR(b.kredit)} | matched:${b.is_matched} | ref:${b.ref_bku_id||'NULL'}`);
    });
  });

  console.log(`\n     C2) Benar-benar tidak ada pasangan (nilai pun tidak ada di bank): ${noMatchOrphan.length}`);
  noMatchOrphan.slice(0, 20).forEach((p, i) => {
    const tgl = p.tanggal ? new Date(p.tanggal).toISOString().split('T')[0] : '-';
    console.log(`       [${i+1}] ${tgl} | nb:${String(p.nomor_bukti||'NULL').padEnd(20)} | Rp ${fmtIDR(p.nilai)} | uraian:${String(p.uraian||'').substring(0,40)}`);
  });
  if (noMatchOrphan.length > 20) console.log(`       ... dan ${noMatchOrphan.length - 20} lainnya`);

  // ── Cek orphan ref: bank.ref_bku_id menunjuk ke ID pendapatan yang tidak ada ──
  console.log('\n② Cek "ghost link": bank.ref_bku_id menunjuk ke pendapatan ID yang tidak ada:');
  console.log(SEP2);
  const ghostLinks = await prisma.$queryRaw`
    SELECT bs.id AS bs_id, bs.ref_bku_id, bs.nomor_bukti, CAST(bs.kredit AS DECIMAL) AS kredit,
           bs.tanggal, bs.is_matched, bs.match_type
    FROM bank_statement bs
    WHERE bs.is_matched = true
      AND bs.ref_bku_id IS NOT NULL AND bs.ref_bku_id <> ''
      AND NOT EXISTS (
        SELECT 1 FROM data_pendapatan p WHERE p.id::text = TRIM(bs.ref_bku_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM data_sp2d s WHERE s.id::text = TRIM(bs.ref_bku_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM data_sp2d_potongan sp WHERE sp.id::text = TRIM(bs.ref_bku_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM setoran_pajak sj WHERE sj.id::text = TRIM(bs.ref_bku_id)
      )
    ORDER BY bs.tanggal
  `;
  console.log(`  Ghost links: ${ghostLinks.length}`);
  ghostLinks.slice(0, 10).forEach((b, i) => {
    const tgl = b.tanggal ? new Date(b.tanggal).toISOString().split('T')[0] : '-';
    console.log(`  [${i+1}] bs.id:${b.bs_id} | ${tgl} | nb:${String(b.nomor_bukti||'').padEnd(20)} | kredit:${fmtIDR(b.kredit)} | ref:${b.ref_bku_id}`);
  });

  // ── Cek bank.ref_bku_id yang menunjuk ke pendapatan dengan status berbeda ──
  console.log('\n③ Bank matched → pendapatan SUDAH (konsisten):');
  const consistent = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt FROM bank_statement bs
    JOIN data_pendapatan p ON p.id::text = TRIM(bs.ref_bku_id)
    WHERE bs.is_matched = true AND p.status_rekon LIKE 'SUDAH%'
  `;
  console.log(`  Konsisten (bank MATCHED + pendapatan SUDAH): ${consistent[0].cnt}`);

  const inconsistentDetail = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS cnt FROM bank_statement bs
    JOIN data_pendapatan p ON p.id::text = TRIM(bs.ref_bku_id)
    WHERE bs.is_matched = true AND (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
  `;
  console.log(`  Tidak konsisten (bank MATCHED + pendapatan BELUM): ${inconsistentDetail[0].cnt}`);

  console.log('\n' + SEP + '\n');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
