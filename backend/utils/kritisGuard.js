/**
 * kritisGuard.js
 *
 * ATURAN BISNIS KRITIS (ditetapkan 2026-05-19):
 *   tanggal_pencairan TIDAK BOLEH dihapus (di-null-kan) dalam kondisi apapun,
 *   KECUALI SP2D dihapus permanen dari database.
 *
 * Latar belakang: insiden Mei 2026 — "Reset Rekon" menghapus seluruh tanggal_pencairan
 * dari data_sp2d, menyebabkan rekonsiliasi tidak dapat menemukan transaksi yang sudah cair.
 *
 * Field kritis lain yang juga dilindungi: nilai_bruto, nilai_neto, nilai_potongan.
 */

const FIELD_KRITIS = ['tanggal_pencairan', 'nilai_bruto', 'nilai_neto', 'nilai_potongan'];

/**
 * Periksa objek `updates` terhadap nilai `existing`.
 * Setiap field kritis yang akan di-set ke null/undefined padahal existing-nya bernilai
 * akan dikeluarkan dari updates dan dicatat sebagai peringatan.
 *
 * @param {object} updates   - Objek data yang akan dikirim ke Prisma update
 * @param {object} existing  - Record yang ada di DB saat ini
 * @param {string} context   - Label untuk log (mis. 'updateSp2d #uuid')
 * @returns {object}         - Salinan `updates` yang sudah dibersihkan
 */
function jagaFieldKritis(updates, existing, context = '') {
  const cleaned = { ...updates };
  for (const field of FIELD_KRITIS) {
    const nilaiLama = existing[field];
    const nilaiBaru = cleaned[field];
    if ((nilaiBaru === null || nilaiBaru === undefined) && nilaiLama != null) {
      console.warn(
        `[kritisGuard] DITOLAK — ${context}: field kritis "${field}" akan di-null-kan ` +
        `(nilai saat ini: ${nilaiLama}). Operasi ini DILARANG per aturan 2026-05-19.`
      );
      delete cleaned[field];
    }
  }
  return cleaned;
}

/**
 * ATURAN: tanggal_pencairan TIDAK PERNAH dikembalikan null jika existing bernilai.
 *
 * Kembalikan nilai yang aman untuk field tanggal_pencairan:
 *   - Input valid (string/Date non-kosong) → parse ke Date
 *   - Input kosong / null / undefined → kembalikan nilai existing (JAGA nilai lama)
 *   - Tidak ada nilai existing dan input kosong → null (SP2D baru yang belum cair)
 *
 * @param {string|Date|null|undefined} inputStr  - Nilai dari request body / form
 * @param {Date|null}                  existing  - Nilai saat ini di database
 */
function tanggalCairAman(inputStr, existing) {
  if (inputStr && String(inputStr).trim() !== '') {
    const parsed = new Date(inputStr);
    if (!isNaN(parsed.getTime())) return parsed;
  }
  // Input tidak valid → kembalikan existing (bisa null jika memang belum pernah diisi)
  return existing ?? null;
}

/**
 * Validasi cepat sebelum operasi UPDATE — throw Error jika update akan null-kan tanggal_pencairan.
 * Digunakan sebagai guard di titik-titik kritis (bulk update, import, reset).
 *
 * @param {object} updateData - Data yang akan di-update
 * @param {string} context    - Nama operasi untuk pesan error
 */
function tolakNullingTanggalCair(updateData, context = '') {
  if ('tanggal_pencairan' in updateData && (updateData.tanggal_pencairan === null || updateData.tanggal_pencairan === undefined)) {
    const msg = `[kritisGuard] OPERASI DIBLOKIR — ${context}: mencoba menghapus tanggal_pencairan. ` +
                `Field ini TIDAK BOLEH dihapus kecuali record SP2D dihapus permanen.`;
    console.error(msg);
    throw new Error(msg);
  }
}

module.exports = { jagaFieldKritis, tanggalCairAman, tolakNullingTanggalCair };
