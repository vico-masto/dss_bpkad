/**
 * Utility untuk parsing tanggal yang aman dari timezone shift 
 * dan format Excel Serial Number.
 */
const parseDateSafe = (dateVal) => {
  if (!dateVal) return new Date();
  
  let d;
  
  // 1. Handle Excel Serial Number (e.g., 46024)
  if (typeof dateVal === 'number' || (!isNaN(parseFloat(dateVal)) && !String(dateVal).includes('/') && !String(dateVal).includes('-'))) {
    const serial = parseFloat(dateVal);
    // Excel base date: 1899-12-30. 25569 is for 1970-01-01.
    const ms = Math.round((serial - 25569) * 86400 * 1000);
    const temp = new Date(ms);
    // Re-create as clean UTC to be absolutely sure
    d = new Date(Date.UTC(temp.getFullYear(), temp.getMonth(), temp.getDate(), 12, 0, 0));
  } 
  // 2. Handle Indonesian String Format DD/MM/YYYY
  else if (typeof dateVal === 'string' && dateVal.includes('/')) {
    const parts = dateVal.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const year = parseInt(parts[2]);
      d = new Date(Date.UTC(year, month, day, 12, 0, 0));
    } else {
      const temp = new Date(dateVal);
      d = new Date(Date.UTC(temp.getFullYear(), temp.getMonth(), temp.getDate(), 12, 0, 0));
    }
  } 
  // 3. Fallback
  else {
    const temp = new Date(dateVal);
    if (isNaN(temp.getTime())) {
      d = new Date();
      d.setUTCHours(12, 0, 0, 0);
    } else {
      d = new Date(Date.UTC(temp.getFullYear(), temp.getMonth(), temp.getDate(), 12, 0, 0));
    }
  }

  return d;
};

/**
 * Parse string 'YYYY-MM-DD' menjadi Date UTC midnight — tidak bergantung timezone server.
 * Gunakan fungsi ini setiap kali membuat Date dari string tanggal untuk perbandingan.
 */
const toNativeDate = (dateStr) => {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
};

/**
 * Ekstrak komponen tanggal saja ('YYYY-MM-DD') dari Date object atau string apapun.
 * Selalu gunakan UTC sehingga tidak terpengaruh timezone server.
 */
const fmtDate = (dateVal) => {
  if (!dateVal) return null;
  const s = String(dateVal);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = dateVal instanceof Date ? dateVal : new Date(dateVal);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
};

/**
 * Parse nilai angka dari Excel secara format-aware.
 * Mendeteksi otomatis format Indonesia (titik=ribuan, koma=desimal)
 * vs format US/default Excel (koma=ribuan, titik=desimal).
 *
 * Bug lama: replace(/\./g,'') selalu menghapus semua titik sehingga
 * nilai "8624.51" (US format) menjadi 862451 — 100x lipat salah.
 * Fungsi ini menghindari masalah tersebut dengan melihat separator terakhir.
 */
const parseNilaiExcel = (raw) => {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  const lastDot   = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let result;
  if (lastComma > lastDot) {
    // Format Indonesia: "1.000.000,50" — hapus titik, ganti koma → titik
    result = parseFloat(s.replace(/\./g, '').replace(/,/g, '.'));
  } else {
    // Format US atau tanpa separator ribuan: "1,000.50" / "8624.51" — hapus koma saja
    result = parseFloat(s.replace(/,/g, ''));
  }
  return isNaN(result) ? 0 : result;
};

module.exports = {
  parseDateSafe,
  toNativeDate,
  fmtDate,
  parseNilaiExcel,
};
