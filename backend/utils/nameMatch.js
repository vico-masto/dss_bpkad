/**
 * Name matching untuk modul Verifikasi Masal.
 * Membandingkan nama input operator dengan nama terdaftar di bank/penyetor (dari API).
 *
 * Pendekatan:
 *  1. Normalisasi nama Indonesia (strip gelar H/Hj/Drs/dll, partikel, tanda baca,
 *     spasi ganda, huruf kecil).
 *  2. Hitung skor Jaro-Winkler terhadap dua varian nama terdaftar: asli dan
 *     urutan-kata-dibalik (mengakomodasi "NURHALIZA SITI" vs "SITI NURHALIZA").
 *  3. Label: >=90 MATCH, 70-89 PARTIAL (perlu review), <70 MISMATCH.
 *
 * Murni & stateless agar mudah diuji dengan script ad-hoc tanpa dependensi.
 */
'use strict';

/**
 * Hilangkan gelar akademik/keagamaan yang umum di nama Indonesia.
 * Contoh: "H. AHMAD" -> "AHMAD", "HJ. SITI NURHALIZA" -> "SITI NURHALIZA".
 */
const stripGelar = (s) =>
  (s || '')
    .replace(
      /\b(h|hj|hjj|drs|dra|dr|ir|se|sh|sp|si|ss|stp|spd|mm|msi|msc|ak|a\.md|amd|s\.e|s\.h|s\.i|s\.s|s\.sos|s\.kom|s\.pt|s\.pd|s\.ak|s\.stp|s\.ab|s\.ap)\b\.?\s*/gi,
      ' '
    )
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Normalisasi nama utk perbandingan: strip gelar, buang semua karakter non
 * alfanumerik, jadikan lowercase, rapatkan spasi.
 */
const normalizeName = (input) => {
  if (!input) return '';
  return stripGelar(String(input))
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Jaro distance antara dua string (tanpa normalisasi).
 */
const jaro = (s1, s2) => {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchDistance = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);
  let matches = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    matches / s1.length +
    matches / s2.length +
    (matches - transpositions / 2) / matches
  ) / 3;
};

/**
 * Jaro-Winkler: menaikkan skor bila awalan (prefix) sama, maksimal 4 karakter.
 */
const jaroWinkler = (s1, s2) => {
  const j = jaro(s1, s2);
  if (j < 0.7 || j === 1) return j;
  let prefix = 0;
  const maxPrefix = Math.min(4, s1.length, s2.length);
  while (prefix < maxPrefix && s1[prefix] === s2[prefix]) prefix++;
  return j + prefix * 0.1 * (1 - j);
};

/**
 * Bandingkan nama input dengan nama terdaftar.
 * Balik kata secara bergantian karena format nama di bank sering kali
 * "Nama Depan Nama Belakang" sementara input bisa terbalik.
 *
 * @returns {{score: number|null, label: 'MATCH'|'PARTIAL'|'MISMATCH'|'UNVERIFIED'}}
 *   score 0-100 (null bila salah satu nama kosong).
 */
const matchNames = (input, registered) => {
  const a = normalizeName(input);
  const b = normalizeName(registered);
  if (!a || !b) return { score: null, label: 'UNVERIFIED' };

  const bReversed = b.split(' ').reverse().join(' ');
  const score = Math.max(jaroWinkler(a, b), jaroWinkler(a, bReversed));
  const pct = Math.round(score * 1000) / 10;

  let label;
  if (pct >= 90) label = 'MATCH';
  else if (pct >= 70) label = 'PARTIAL';
  else label = 'MISMATCH';

  return { score: pct, label };
};

module.exports = { normalizeName, matchNames, jaro, jaroWinkler };