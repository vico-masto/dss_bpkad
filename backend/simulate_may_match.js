/**
 * simulate_may_match.js — READ-ONLY baseline simulation of the Smart Match engine
 * on May (2026-05) data. Mirrors bulkMatchSmart rules (bulk query + value map +
 * date window + strict-mode duplicate guard + scoring) WITHOUT writing to DB.
 *
 * Usage: node simulate_may_match.js
 */
const { PrismaClient } = require('D:/Antigravity/DSS_BPKAD/backend/node_modules/@prisma/client');
const prisma = new PrismaClient();
const Q = (s) => s.replace(/\s+/g, ' ').trim();

const toNum = (v) => Number(v) || 0;
const STRICT_MODE_THRESHOLD = 5;
const STRICT_MIN_URAIAN_SCORE = 80;
const STRICT_MIN_MARGIN = 50;
const WIT_OFFSET_MS = 9 * 60 * 60 * 1000;
const day = 86400000;

const fmtDateWIT = (d) => {
  if (!d) return null;
  const raw = d instanceof Date ? d : new Date(String(d));
  if (isNaN(raw.getTime())) return null;
  const wit = new Date(raw.getTime() + WIT_OFFSET_MS);
  return wit.toISOString().split('T')[0];
};
const fmtDate = (d) => {
  if (!d) return null;
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dd = d instanceof Date ? d : new Date(d);
  return isNaN(dd.getTime()) ? null : dd.toISOString().split('T')[0];
};
const toNativeDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const extractNumericTokens = (str) => (String(str || '').match(/\d{3,}/g) || []);
const isUniqueValue = (val) => (Math.round(val * 100) % 100) !== 0;

// Score mirrors computeUraianScore (numeric tokens only)
const uraianScore = (bankDesc, bkuUraian, bkuBukti, strict) => {
  const bt = extractNumericTokens(bankDesc);
  if (!bt.length) return 0;
  const ok = extractNumericTokens(String(bkuUraian || '') + ' ' + String(bkuBukti || ''));
  if (!ok.length) return 0;
  const m = strict ? 4 : 1;
  if (bt.some(t => ok.includes(t))) return 80 * m;
  if (bt.some(x => ok.some(k => k.includes(x) || x.includes(k)))) return 30 * m;
  return 0;
};

(async () => {
  const sDate = '2026-05-01', eDate = '2026-05-31';
  const day0 = new Date(`${sDate}`);
  const sDateObj = new Date(`${sDate}T00:00:00.000Z`);
  const eDateObj = new Date(`${eDate}T23:59:59.999Z`);

  // 1. Unmatched banks in range
  const bankItems = await prisma.bank_statement.findMany({
    where: { is_matched: false, tanggal: { gte: sDateObj, lte: eDateObj } },
    orderBy: { tanggal: 'asc' }
  });
  console.log(`Bank belum di rentang: ${bankItems.length}`);

  // 2. BKU candidates (mirror the bulkMatchSmart UNION query)
  const bkuItems = await prisma.$queryRawUnsafe(Q(`
    SELECT CAST(h.id AS VARCHAR) as id, CAST(h.nomor AS VARCHAR) as bukti, CAST(h.uraian AS VARCHAR) as uraian,
      CAST(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto
            ELSE h.nilai_bruto - COALESCE(
              (SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
              CAST(h.nilai_potongan AS DECIMAL)) END AS DECIMAL) as nilai,
      CAST(h.nilai_bruto AS DECIMAL) as nilai_bruto,
      COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal, 'KELUAR' as tipe, 'SP2D' as source, '' as opd, '' as jenis_potongan
    FROM data_sp2d h
    LEFT JOIN bank_statement b ON TRIM(CAST(h.id AS VARCHAR)) = TRIM(b.ref_bku_id)
    WHERE COALESCE(UPPER(TRIM(h.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
      AND COALESCE(h.tanggal_pencairan, h.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}'
    UNION ALL
    SELECT CAST(p.id AS VARCHAR), CAST(p.nomor_bukti AS VARCHAR), CAST(p.uraian AS VARCHAR),
      CAST(p.nilai AS DECIMAL), CAST(p.nilai AS DECIMAL), p.tanggal, 'MASUK', 'PENDAPATAN', '', ''
    FROM data_pendapatan p LEFT JOIN bank_statement b ON TRIM(CAST(p.id AS VARCHAR)) = TRIM(b.ref_bku_id)
    WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL AND p.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'
    UNION ALL
    SELECT CAST(s.id AS VARCHAR), CAST(s.nomor_bukti AS VARCHAR), CAST(s.uraian AS VARCHAR),
      CAST(s.nilai AS DECIMAL), CAST(s.nilai AS DECIMAL), COALESCE(s.tanggal_pencairan, s.tanggal), 'KELUAR', 'SETORAN', '', ''
    FROM setoran_pajak s LEFT JOIN bank_statement b ON TRIM(CAST(s.id AS VARCHAR)) = TRIM(b.ref_bku_id)
    WHERE COALESCE(UPPER(TRIM(s.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
      AND NOT EXISTS (SELECT 1 FROM data_sp2d hx WHERE TRIM(hx.nomor) = TRIM(s.nomor_bukti))
      AND CAST(COALESCE(s.tanggal_pencairan, s.tanggal) AS DATE) BETWEEN '${sDate}' AND '${eDate}'
      AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
    UNION ALL
    SELECT CAST(p.id AS VARCHAR), CAST(p.nomor_sp2d AS VARCHAR), CAST(p.uraian AS VARCHAR),
      CAST(p.nilai AS DECIMAL), CAST(p.nilai AS DECIMAL), COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal),
      'POTONGAN', 'POTONGAN', COALESCE(s.opd, ''), COALESCE(p.jenis_potongan, '')
    FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      LEFT JOIN bank_statement b ON TRIM(CAST(p.id AS VARCHAR)) = TRIM(b.ref_bku_id)
    WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
      AND NOT (LOWER(COALESCE(p.uraian, '')) LIKE '%lainnya%' OR LOWER(COALESCE(p.keterangan, '')) LIKE '%lainnya%')
      AND COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}'
  `));

  console.log(`Kandidat BKU: ${bkuItems.length} (SP2D=${bkuItems.filter(b=>b.source==='SP2D').length}, PENDAPATAN=${bkuItems.filter(b=>b.source==='PENDAPATAN').length}, POTONGAN=${bkuItems.filter(b=>b.source==='POTONGAN').length}, SETORAN=${bkuItems.filter(b=>b.source==='SETORAN').length})`);

  // Build value map (neto & bruto keys)
  const bkuValueMap = new Map();
  for (const bku of bkuItems) {
    const nk = Math.round(toNum(bku.nilai) * 100);
    const bk = Math.round(toNum(bku.nilai_bruto) * 100);
    if (!bkuValueMap.has(nk)) bkuValueMap.set(nk, []);
    bkuValueMap.get(nk).push(bku);
    if (bk !== nk) { if (!bkuValueMap.has(bk)) bkuValueMap.set(bk, []); bkuValueMap.get(bk).push(bku); }
  }

  let matched = 0, strictSkipped = 0, noCandidate = 0, outOfWindow = 0, valNoMatch = 0;
  const strictSkippedIds = [];

  for (const bankItem of bankItems) {
    const rawVal = toNum(bankItem.debet) > 0 ? toNum(bankItem.debet) : toNum(bankItem.kredit);
    const valKey = Math.round(rawVal * 100);
    const isOut = toNum(bankItem.debet) > 0;
    const bankTgl = fmtDateWIT(bankItem.tanggal) || fmtDate(bankItem.tanggal);
    const bankDate = toNativeDate(bankTgl);
    if (rawVal === 0) { noCandidate++; continue; }

    const potentialMatches = bkuValueMap.get(valKey) || [];
    if (!potentialMatches.length) { valNoMatch++; continue; }

    // active duplicates in tight window
    const actives = potentialMatches.filter(bku => {
      if (bku._isMatched) return false;
      if (isOut && bku.tipe === 'MASUK') return false;
      if (!isOut && bku.tipe !== 'MASUK') return false;
      const bkuDateStr = fmtDate(bku.tanggal); if (!bkuDateStr) return false;
      const bd = toNativeDate(bkuDateStr);
      const dd = (bankDate.getTime() - bd.getTime()) / day;
      if (bku.tipe === 'MASUK') return Math.abs(dd) <= 2;
      return dd >= -1 && dd <= 4;
    });
    const isStrictMode = actives.length >= STRICT_MODE_THRESHOLD;

    const candidates = potentialMatches.filter(bku => {
      if (bku._isMatched) return false;
      if (isOut && bku.tipe === 'MASUK') return false;
      if (!isOut && bku.tipe !== 'MASUK') return false;
      const bkuDateStr = fmtDate(bku.tanggal); if (!bkuDateStr) return false;
      const bd = toNativeDate(bkuDateStr);
      const dd = (bankDate.getTime() - bd.getTime()) / day;
      if (bku.tipe === 'MASUK') return Math.abs(dd) <= 2;
      return dd >= -1 && dd <= 4;
    }).map(bku => {
      const bkuDate = toNativeDate(fmtDate(bku.tanggal));
      const dd = Math.abs(bankDate.getTime() - bkuDate.getTime()) / day;
      let dateScore = 0;
      if (bankTgl === fmtDate(bku.tanggal)) dateScore = 200;
      else if (dd <= 1) dateScore = 150;
      else if (dd <= 3) dateScore = 130 - ((dd - 1) * 20);
      else if (dd <= 7) dateScore = 60 - ((dd - 3) * 10);
      else dateScore = Math.max(-100, 10 - (dd * 5));
      const us = uraianScore(bankItem.deskripsi, bku.uraian, bku.bukti, isStrictMode);
      const noBukti = (bku.source === 'PENDAPATAN' || bku.source === 'POTONGAN') ? (matchNomorBukti(bankItem, bku.bukti)) : 0;
      let opd = 0;
      if (bku.source === 'POTONGAN' && bku.opd) {
        const bd = (bankItem.deskripsi || '').toUpperCase();
        const words = bku.opd.toUpperCase().split(/\s+/).filter(w => w.length >= 4);
        if (words.some(w => bd.includes(w))) opd = 120;
      }
      const vb = isUniqueValue(rawVal) ? 30 : 0;
      return { ...bku, total: dateScore + us + vb + noBukti + opd, _us: us, _nb: noBukti, _opd: opd };
    }).sort((a, b) => b.total - a.total);

    if (!candidates.length) { outOfWindow++; continue; }
    const top = candidates[0];
    if (isStrictMode) {
      const runner = candidates[1];
      const margin = runner ? top.total - runner.total : Infinity;
      const hasIdentity = top._us >= STRICT_MIN_URAIAN_SCORE || top._nb >= 120 || top._opd >= 120;
      if (!hasIdentity || margin < STRICT_MIN_MARGIN) {
        strictSkipped++;
        strictSkippedIds.push(`Bank#${bankItem.id} Rp${rawVal} ${(bankItem.deskripsi||'').slice(0,40)} (skor ${top.total} vs ${runner?runner.total:'-'})`);
        continue;
      }
    }
    // match
    const original = potentialMatches.find(b => b.id === top.id);
    if (original) original._isMatched = true;
    top._isMatched = true;
    matched++;
  }

  console.log('\n===== BASELINE HASIL (read-only) =====');
  console.log(`Matched 1:1           : ${matched}`);
  console.log(`STRICT skipped (manual): ${strictSkipped}`);
  console.log(`Out of window (no kandidat): ${outOfWindow}`);
  console.log(`No exact-value candidate : ${valNoMatch}`);
  console.log(`(rawVal=0)             : ${noCandidate}`);
  const left = bankItems.length - matched - strictSkipped - outOfWindow - valNoMatch - noCandidate;
  console.log(`Total bank             : ${bankItems.length}`);
  console.log(`Tersisa (pembulatan)   : ${left}`);

  console.log('\n--- Sampel strict-skip (perlu manual) ---');
  strictSkippedIds.slice(0, 25).forEach(x => console.log('  ' + x));

  // ═══ PHASE 2 PROYEKSI — GRUP_POTONGAN (gelondongan) ═══
  // Estimasi berapa debit yang TIDAK ter-cocok fase 1 tetapi akan ter-cocok via
  // jumlah potongan per SP2D (fase 2 baru di bulkMatchSmart).
  const unmatchedValNoCand = bankItems.filter(b => {
    const rawVal = toNum(b.debet) > 0 ? toNum(b.debet) : toNum(b.kredit);
    if (rawVal === 0) return false;
    const k = Math.round(rawVal * 100);
    return !bkuValueMap.has(k);
  });
  // grup potongan per SP2D (belum, >=2) sum
  const belumPot = await prisma.$queryRawUnsafe(Q(`
    SELECT p.id_sp2d::text AS id_sp2d, SUM(p.nilai)::decimal AS total, COUNT(p.id)::int AS jumlah
    FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d=s.id
    WHERE COALESCE(UPPER(TRIM(p.status_rekon)),'') NOT LIKE '%SUDAH%'
      AND p.id_sp2d IS NOT NULL
      AND NOT (LOWER(COALESCE(p.uraian,'')) LIKE '%lainnya%' OR LOWER(COALESCE(p.keterangan,'')) LIKE '%lainnya%')
      AND COALESCE(p.tanggal_pencairan,s.tanggal_pencairan,s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}'
    GROUP BY p.id_sp2d HAVING COUNT(p.id)>=2`));
  const grpSumCount = new Map();
  for (const g of belumPot) grpSumCount.set(Math.round(Number(g.total)*100), (grpSumCount.get(Math.round(Number(g.total)*100))||0)+1);
  let phase2Grup = 0;
  for (const b of unmatchedValNoCand) {
    const v = Math.round((toNum(b.debet)>0?toNum(b.debet):toNum(b.kredit))*100);
    if (grpSumCount.get(v) === 1) phase2Grup++; // tepat 1 grup = deterministik
  }
  console.log('\n===== PROYEKSI FASE 2 (GRUP_POTONGAN) =====');
  console.log(`Debit tanpa pasangan 1:1  : ${unmatchedValNoCand.length}`);
  console.log(`→ yang cocok via SUM potongan/SP2D (deterministik): ${phase2Grup}`);

  await prisma.$disconnect();
})().catch(async (e) => { console.error('ERR:', e.message); await prisma.$disconnect(); process.exit(1); });

// Minimal nomor-bukti matcher for PENDAPATAN/POTONGAN (mirrors computeNomorBuktiScore coarse)
function matchNomorBukti(bankItemOrDesc, nomorBukti) {
  if (!bankItemOrDesc || !nomorBukti) return 0;
  let bd = typeof bankItemOrDesc === 'object' ? (bankItemOrDesc.deskripsi || '') : String(bankItemOrDesc);
  bd = bd.toUpperCase(); const nb = String(nomorBukti).toUpperCase().trim();
  if (!nb) return 0;
  // full containment
  if (bd.includes(nb)) return 250;
  // segment (alnum) containment
  const segs = nb.split(/[-\/ ]+/).filter(s => s.length >= 3 && /[A-Z]/.test(s));
  if (segs.some(s => bd.includes(s))) return 120;
  return 0;
}
