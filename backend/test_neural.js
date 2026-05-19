// Test script for calculateSimilarityScore
function calculateSimilarityScore(desc1, desc2, bukti) {
  if (!desc1 || !desc2) return 0;
  const d1 = String(desc1).toLowerCase();
  const d2 = String(desc2).toLowerCase();
  const b = String(bukti || '').toLowerCase();
  
  let score = 0;

  // 1. Direct Proof (Nomor Bukti/SP2D) - Highest Weight
  if (b.length > 5) {
    const coreMatch = b.match(/\d{5,}/);
    const coreNum = coreMatch ? coreMatch[0] : b;
    if (d1.includes(coreNum)) score += 200;
  }

  // 2. Keyword Matching
  const keywords = ['gaji', 'iwp', 'pajak', 'ppn', 'pph', 'bpjs', 'jkk', 'jkm', 'tpp', 'sertifikasi'];
  keywords.forEach(kw => {
    if (d1.includes(kw) && d2.includes(kw)) score += 40;
  });

  // 3. OPD/Entity Matching with Abbreviation Support
  const opdKeywords = d2.split(/\s+/).filter(w => w.length > 3);
  opdKeywords.forEach(w => {
    if (d1.includes(w)) {
      score += 20; // Exact word match
    } else {
      // Check for abbreviations (e.g. "BAPP" in "BAPPEDA")
      const prefix = w.substring(0, 4);
      if (d1.includes(prefix)) score += 10;
    }
  });

  // 4. Pattern Recognition for common bank abbreviations
  const patterns = [
    { key: 'gaji', alt: 'gj' },
    { key: 'tpp', alt: 'tp' },
    { key: 'sertifikasi', alt: 'sert' },
    { key: 'pajak', alt: 'pjk' }
  ];
  patterns.forEach(p => {
    if (d1.includes(p.alt) && d2.includes(p.key)) score += 30;
  });

  // 5. Jaccard Similarity on word tokens
  const tokens1 = new Set(d1.split(/[^a-z0-9]/).filter(t => t.length > 2));
  const tokens2 = new Set(d2.split(/[^a-z0-9]/).filter(t => t.length > 2));
  const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
  const union = new Set([...tokens1, ...tokens2]);
  
  if (union.size > 0) {
    score += (intersection.size / union.size) * 100;
  }

  return score;
}

// TEST CASES
console.log('--- NEURAL MATCHING TEST ---');

// Case 1: Exact Match with SP2D Number
const score1 = calculateSimilarityScore('PEMBAYARAN SP2D 000123 GAJI BAPPEDA', 'GAJI JANUARI BAPPEDA', '000123');
console.log('Test 1 (SP2D Number):', score1, ' (Exp: > 240)');

// Case 2: Abbreviation Match
const score2 = calculateSimilarityScore('PBYR GJ JAN 2026 BAPP', 'GAJI JANUARI BAPPEDA', '000456');
console.log('Test 2 (Abbreviation):', score2, ' (Exp: > 50)');

// Case 3: Completely Different
const score3 = calculateSimilarityScore('SETORAN PAJAK PT ABC', 'GAJI DINAS KESEHATAN', '000789');
console.log('Test 3 (Different):', score3, ' (Exp: < 20)');

// Case 4: IWP with partial name
const score4 = calculateSimilarityScore('IWP 1% GJP3KAPR26-BAPENDA', 'IURAN WAJIB PEGAWAI 1% BAPENDA', '81.07/04.0/000001');
console.log('Test 4 (IWP Partial):', score4, ' (Exp: > 40)');
