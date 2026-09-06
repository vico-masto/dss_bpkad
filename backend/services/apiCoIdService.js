/**
 * Service verifikasi masal - integrasi API eksternal (api.co.id).
 *
 * Mode:
 *  - DRY_RUN (DEFAULT): respons deterministic simulasi, TIDAK menyentuh jaringan.
 *    Dipakai untuk pengembangan & uji tanpa menghabiskan kuota API.
 *    Env: API_COID_MODE=DRY_RUN  (default bila tidak di-set).
 *  - LIVE: panggilan API nyata. Env: API_COID_MODE=LIVE, API_COID_BASE_URL,
 *    API_COID_KEY. Kontrak resmi api.co.id (September 2026):
 *      - Bank Validation: GET {BASE_URL}/validation/bank?bank_code=..&account_number=..&account_name=..
 *        header `x-api-co-id`, respons { data:{ is_valid, score(0-10), name(masked), message, note } }.
 *      - Produk "ID Billing / NTPN pajak" TIDAK disediakan api.co.id -> cek billing
 *        selalu berjalan DRY_RUN hingga produk resmi tersedia.
 *    Pemanggil (worker/controller) tidak perlu berubah.
 *
 * Rate limit: HTTP 429 -> service mengembalikan { rateLimited:true, retryAfterMs }
 * dan worker menangani jeda+retry secara inline (tanpa menghabiskan attempts job).
 */
'use strict';

const getMode = () => (process.env.API_COID_MODE || 'DRY_RUN').toString().toUpperCase();
const isLiveMode = () => getMode() === 'LIVE';

const BASE_URL = process.env.API_COID_BASE_URL || 'https://use.api.co.id';
const API_KEY = process.env.API_COID_KEY || '';
// Kode bank default untuk validasi rekening (permintaan ini = Bank Maluku).
// Bisa di-override per-panggilan lewat param `bankCode`.
const BANK_CODE_DEFAULT = process.env.API_COID_BANK_CODE || 'bank_maluku';
const REQUEST_TIMEOUT_MS = 15000;

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const fetchWithTimeout = (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
};

/* ------------------------------------------------------------------ */
/* DRY_RUN - relevan deterministic (agar hasil uji konsisten)         */
/* ------------------------------------------------------------------ */

const dryRunCheckBank = ({ accountNo, accountName }) => {
  const no = String(accountNo || '').replace(/\s/g, '');
  const onlyDigits = /^\d+$/.test(no);

  if (!onlyDigits || no.length < 8) {
    return {
      ok: false,
      status: 'INVALID',
      registeredName: null,
      apiResponse: JSON.stringify({ simulated: true, account_no: no, reason: 'format_rekening' }),
      errorMessage: 'Nomor rekening tidak valid (harus numerik, minimal 8 digit).',
    };
  }
  if (no.endsWith('000')) {
    return {
      ok: false,
      status: 'NOT_FOUND',
      registeredName: null,
      apiResponse: JSON.stringify({ simulated: true, account_no: no }),
      errorMessage: 'Nomor rekening tidak ditemukan pada data bank (simulasi).',
    };
  }
  if (no.includes('9999')) {
    return {
      ok: false,
      status: 'ERROR',
      registeredName: null,
      apiResponse: JSON.stringify({ simulated: true, account_no: no }),
      errorMessage: 'Simulasi gangguan koneksi API eksternal (kode 9999).',
    };
  }
  // Jika nama sudah memuat gelar "H.", biarkan tanpa duplikasi (gelar diuji oleh normalisasi name match).
  const base = String(accountName || '').trim().toUpperCase().replace(/^H\.?\s+/, '');
  const registeredName = base ? `H. ${base}` : null;
  return {
    ok: true,
    status: 'VALID',
    registeredName,
    apiResponse: JSON.stringify({ simulated: true, account_no: no, registered_name: registeredName }),
  };
};

const dryRunCheckBilling = ({ billingId, name }) => {
  const id = String(billingId || '').replace(/\s/g, '');
  const onlyDigits = /^\d+$/.test(id);

  if (!onlyDigits || id.length < 15) {
    return {
      ok: false,
      status: 'INVALID',
      taxType: null,
      taxTypeName: null,
      taxAmount: null,
      payerName: null,
      apiResponse: JSON.stringify({ simulated: true, billing_id: id, reason: 'format_billing' }),
      errorMessage: 'ID Billing tidak valid (harus numerik, minimal 15 digit).',
    };
  }
  const last6 = parseInt(id.slice(-6), 10) || 100000;
  const taxAmount = Math.round(last6 / 100) * 100;
  const payerName = String(name || '').trim().toUpperCase() || 'PT KARYA BERSAMA (SIMULASI)';

  if (id.startsWith('15')) {
    return {
      ok: false,
      status: 'EXPIRED',
      taxType: '410100',
      taxTypeName: 'PPN Dalam Negeri',
      taxAmount,
      payerName,
      apiResponse: JSON.stringify({ simulated: true, billing_id: id, tax_type: '410100', tax_amount: taxAmount, payer_name: payerName }),
      errorMessage: 'ID Billing berstatus telah kadaluarsa (simulasi).',
    };
  }
  if (id.endsWith('9999')) {
    return {
      ok: false,
      status: 'ERROR',
      taxType: null,
      taxTypeName: null,
      taxAmount: null,
      payerName: null,
      apiResponse: JSON.stringify({ simulated: true, billing_id: id }),
      errorMessage: 'Simulasi gangguan koneksi API eksternal (kode 9999).',
    };
  }
  return {
    ok: true,
    status: 'ACTIVE',
    taxType: '410100',
    taxTypeName: 'PPN Dalam Negeri',
    taxAmount,
    payerName,
    apiResponse: JSON.stringify({ simulated: true, billing_id: id, tax_type: '410100', tax_amount: taxAmount, payer_name: payerName }),
  };
};

/* ------------------------------------------------------------------ */
/* LIVE - kontrak resmi api.co.id (Bank Validation; September 2026)    */
/* ------------------------------------------------------------------ */

/**
 * Petakan skor nama api.co.id (0.0-10.0) ke skor 0-100 + label.
 * Threshold mengikuti dokumentasi provider: score >= 7.0 dianggap valid.
 */
const mapScore = (score10) => {
  const raw = Number(score10);
  if (!Number.isFinite(raw)) return { score: null, label: 'UNVERIFIED' };
  const score = Math.min(100, Math.max(0, Math.round(raw * 10)));
  let label;
  if (score >= 70) label = 'MATCH';
  else if (score >= 40) label = 'PARTIAL';
  else label = 'MISMATCH';
  return { score, label };
};

/**
 * Validasi rekening bank - GET /validation/bank (kontrak api.co.id).
 * Nama pemilik dari provider DALAM KONDISI TERMASKING (mis. "Rif**** Eln****"),
 * sehingga skor nama memakai `score` dari API, BUKAN matchNames lokal terhadap
 * nama terpotong (yang tidak bermakna).
 */
const liveCheckBank = async ({ accountNo, accountName, bankCode }) => {
  const params = new URLSearchParams({
    bank_code: String(bankCode || BANK_CODE_DEFAULT),
    account_number: String(accountNo || '').replace(/\s/g, ''),
    account_name: String(accountName || ''),
  });
  const url = `${BASE_URL}/validation/bank?${params.toString()}`;
  const res = await fetchWithTimeout(url, {
    method: 'GET',
    headers: { 'x-api-co-id': API_KEY },
  });
  const body = await res.json().catch(() => null);
  if (res.status === 429) {
    // Bedakan rate-limit (bisa retry) vs kuota habis (percuma retry - perlu subscribe).
    if (body && body.error === 'quota_exceeded') {
      return {
        ok: false,
        status: 'ERROR',
        errorMessage: 'Kuota produk bank-verification habis/belum aktif. Subscribe di dashboard.api.co.id.',
        apiResponse: JSON.stringify(body),
      };
    }
    const retryAfterMs = parseInt(res.headers.get('retry-after') || '60', 10) * 1000;
    return { ok: false, status: 'ERROR', rateLimited: true, retryAfterMs };
  }
  if (!res.ok) {
    const msg = (body && body.message) || `API HTTP ${res.status}`;
    return { ok: false, status: 'ERROR', errorMessage: msg, apiResponse: JSON.stringify(body) };
  }
  if (!body || !body.data || typeof body.data.is_valid !== 'boolean') {
    return {
      ok: false,
      status: 'ERROR',
      errorMessage: (body && body.message) || 'Respons API tidak dapat diproses.',
      apiResponse: JSON.stringify(body),
    };
  }
  const d = body.data;
  const isValid = d.is_valid;
  const { score, label } = mapScore(d.score);
  return {
    ok: isValid,
    status: isValid ? 'VALID' : 'INVALID',
    registeredName: isValid ? d.name || null : null,
    nameScore: score,
    nameMatchLabel: label,
    apiResponse: JSON.stringify(body),
    errorMessage: isValid ? null : (d.note || d.message || 'Rekening/atas nama tidak cocok pada data bank.'),
  };
};

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {{ accountNo: string, accountName?: string, bankCode?: string }} param0
 * @returns {Promise<{ok:boolean,status:string,registeredName?:string|null,nameScore?:number|null,nameMatchLabel?:string|null,errorMessage?:string,rateLimited?:boolean,retryAfterMs?:number,apiResponse?:string}>}
 */
const checkBankAccount = async ({ accountNo, accountName, bankCode }) => {
  if (!isLiveMode()) return dryRunCheckBank({ accountNo, accountName });
  return liveCheckBank({ accountNo, accountName, bankCode });
};

/**
 * Cek ID Billing pajak - SELALU DRY_RUN: produk tsb tidak tersedia di api.co.id.
 * Walaupun mode LIVE aktif, billing tidak menyentuh jaringan (dokumentasi produk).
 * @param {{ billingId: string, name?: string }} param0
 * @returns {Promise<{ok:boolean,status:string,taxType?:string|null,taxTypeName?:string|null,taxAmount?:number|null,payerName?:string|null,errorMessage?:string,rateLimited?:boolean,retryAfterMs?:number,apiResponse?:string}>}
 */
const checkBillingId = async ({ billingId, name }) => {
  return dryRunCheckBilling({ billingId, name });
};

module.exports = { checkBankAccount, checkBillingId, isLiveMode, delay };