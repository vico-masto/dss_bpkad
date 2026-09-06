/*
 * Ad-hoc sanity check untuk utils/nameMatch.js (bukan bagian dari server).
 * Jalankan: node check_nameMatch.js
 */
const { matchNames } = require('./utils/nameMatch');

let failed = 0;
const assert = (name, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) {
    failed++;
    console.log(`FAIL ${name} => actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
  } else {
    console.log(`ok   ${name} => ${JSON.stringify(actual)}`);
  }
};

const t = (input, reg) => matchNames(input, reg);

// Sama persis
assert('identik', t('AHMAD ZAIN', 'AHMAD ZAIN'), { score: 100, label: 'MATCH' });

// Gelar di hilangkan
assert('gelar H', t('H. AHMAD ZAIN', 'AHMAD ZAIN'), { score: 100, label: 'MATCH' });
assert('gelar HJ uppercase', t('HJ. SITI NURHALIZA', 'SITI NURHALIZA'), { score: 100, label: 'MATCH' });
assert('gelar DRS', t('DRS. BUDI SANTOSO', 'BUDI SANTOSO'), { score: 100, label: 'MATCH' });

// Urutan kata terbalik
const rev = t('SITI NURHALIZA', 'NURHALIZA SITI');
assert('urutan terbalik MATCH', rev, { score: 100, label: 'MATCH' });
assert('urutan terbalik label', rev.label, 'MATCH');

// Beberapa huruf beda -> PARTIAL (70-90)
const partial = t('SUKARNO', 'SUKARDI');
assert('mirip PARTIAL', partial.label, 'PARTIAL');
assert('mirip 70<=score<90', partial.score >= 70 && partial.score < 90, true);

// Sangat beda -> MISMATCH
const mismatch = t('MARIA GORETI', 'BUDI SANTOSO');
assert('beda total MISMATCH', mismatch.label, 'MISMATCH');
assert('beda total score <70', mismatch.score < 70, true);

// Nama terdaftar tidak lengkap (hanya awalan)
const short = t('AHMAD ZAIN', 'AHMAD');
assert('nama parsial tidak MISMATCH ekstrem', short.score >= 55, true);

// Salah satu kosong -> UNVERIFIED
assert('nama kosong', t('', 'AHMAD'), { score: null, label: 'UNVERIFIED' });
assert('terdaftar kosong', t('AHMAD', ''), { score: null, label: 'UNVERIFIED' });

if (failed === 0) {
  console.log('\nALL PASS');
} else {
  console.log(`\n${failed} FAILED`);
  process.exit(1);
}