const prisma = require('../prismaClient');
const { parseDateSafe, toNativeDate, fmtDate } = require('../utils/dateUtils');

const fmtIDR = (n) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const endOfDay = (d) => {
  const date = new Date(d);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

const toNum = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

// Helper untuk memvalidasi UUID (mencegah error 500 pada PostgreSQL saat query findUnique)
const isValidUuid = (id) => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
};

// WIT-Safe Date: Ekstrak tanggal kalender dengan offset GMT+9 sebelum memotong komponen waktu.
// Mencegah H-1 bleeding saat bank CSV diimpor dengan timestamp WIT yang disimpan sebagai UTC
// (contoh: 2026-03-11 00:30 WIT → 2026-03-10T15:30Z → fmtDate naif membaca "2026-03-10").
const WIT_OFFSET_MS = 9 * 60 * 60 * 1000;
const fmtDateWIT = (d) => {
  if (!d) return null;
  const raw = d instanceof Date ? d : new Date(String(d));
  if (isNaN(raw.getTime())) return null;
  const wit = new Date(raw.getTime() + WIT_OFFSET_MS);
  return wit.toISOString().split('T')[0];
};

// ─── Smart Match Scoring Helpers ─────────────────────────────────────────────

// Ekstrak token numerik ≥3 digit dari string (nomor SP2D, nomor dokumen, dll.)
const extractNumericTokens = (str) => (String(str || '').match(/\d{3,}/g) || []);

// Nilai unik = ada komponen sen tidak nol.
// Probabilitas dua transaksi berbeda bernilai persis sama hingga ke sen sangat kecil.
const isUniqueValue = (val) => (Math.round(val * 100) % 100) !== 0;

// Skor tie-breaker berbasis kecocokan uraian/deskripsi:
// MODE NORMAL  (skala 0–80):
//   +80  nomor dokumen dari deskripsi bank cocok persis di uraian/nomor BKU
//   +30  kecocokan parsial (salah satu token adalah substring dari token lain)
// MODE STRICT (skala 0–320): bobot 4x lebih tinggi untuk memecah ambiguitas data kembar
//   +320 nomor dokumen cocok persis   (sinyal pasti = identitas unik)
//   +120 kecocokan parsial            (sinyal kuat)
const computeUraianScore = (bankDesc, bkuUraian, bkuBukti, strictMode = false) => {
  const bankTokens = extractNumericTokens(bankDesc);
  if (bankTokens.length === 0) return 0;
  const bkuTokens = extractNumericTokens(String(bkuUraian || '') + ' ' + String(bkuBukti || ''));
  if (bkuTokens.length === 0) return 0;
  const multiplier = strictMode ? 4 : 1;
  if (bankTokens.some(t => bkuTokens.includes(t))) return 80 * multiplier;
  if (bankTokens.some(bt => bkuTokens.some(kt => kt.includes(bt) || bt.includes(kt)))) return 30 * multiplier;
  return 0;
};

// Skor Nomor Bukti: khusus data_pendapatan — cocokkan nomor_bukti dengan deskripsi bank.
// Berbeda dengan computeUraianScore (hanya token numerik), fungsi ini mengenali format
// nomor dokumen pemerintah yang mengandung huruf: STS-001/2024, BP.001/IV/2026, SSBP-xxx.
// Skala:
//   +250  nomor_bukti ditemukan lengkap di deskripsi (konfirmasi definitif)
//   +120  setidaknya satu segmen alfanumerik (≥3 kar, mengandung huruf) cocok
const computeNomorBuktiScore = (bankItemOrDesc, nomorBukti) => {
  if (!bankItemOrDesc || !nomorBukti) return 0;
  
  let bankBukti = null;
  let bankDesc = '';
  
  if (typeof bankItemOrDesc === 'object') {
    bankBukti = bankItemOrDesc.nomor_bukti;
    bankDesc = bankItemOrDesc.deskripsi || '';
  } else {
    bankDesc = String(bankItemOrDesc);
  }
  
  const bkuClean = String(nomorBukti).toLowerCase().replace(/\s+/g, ' ').trim();
  if (bkuClean.length < 3) return 0;
  
  // 1. Direct Nomor Bukti Comparison (Strongest Signal)
  if (bankBukti) {
    const bankBuktiClean = String(bankBukti).toLowerCase().replace(/\s+/g, ' ').trim();
    if (bankBuktiClean === bkuClean) {
      return 500; // Perfect match!
    }
    if (bankBuktiClean.length >= 3 && (bankBuktiClean.includes(bkuClean) || bkuClean.includes(bankBuktiClean))) {
      return 300; // Partial match (e.g. STS-001 vs STS-001/2026)
    }
  }
  
  // 2. Fallback to Description Matching (Legacy / Backup)
  if (bankDesc) {
    const descClean = String(bankDesc).toLowerCase().replace(/\s+/g, ' ').trim();
    if (descClean.includes(bkuClean)) {
      return 250;
    }
    
    // Segment matching for codes like STS-001/2024
    // Filter segments: alfanumerik >= 5 (allow purely numeric >= 5 like 2600125) OR letters >= 3
    const segments = bkuClean.split(/[\s\/\-\._]+/).filter(s => s.length >= 5 || (s.length >= 3 && /[a-z]/.test(s)));
    if (segments.length > 0 && segments.some(seg => descClean.includes(seg))) {
      return 120;
    }
  }
  
  return 0;
};

// ─── Duplicate Guard Config ───────────────────────────────────────────────────
// Jika kandidat duplikat (nilai + jendela waktu sama) ≥ threshold ini,
// sistem WAJIB memiliki sinyal uraian yang jelas sebelum boleh mencocokkan.
const STRICT_MODE_THRESHOLD = 5;   // aktifkan strict jika ≥ 5 kandidat bersaing
const STRICT_MIN_URAIAN_SCORE = 80; // skor uraian minimum agar boleh dicocokkan di strict mode
const STRICT_MIN_MARGIN = 50;       // selisih skor top-1 vs top-2 harus ≥ ini (mencegah coin-flip)

// Global store for real-time progress tracking
let smartMatchProgress = {
  isOpen: false,
  total: 0,
  current: 0,
  success: 0,
  fails: 0,
  status: 'idle',
  message: ''
};

const getSmartMatchProgress = async (req, res) => {
  res.json(smartMatchProgress);
};

/** Catatan selisih mutasi bank vs nilai BKU (untuk keterangan_rekon / keterangan / uraian). */
function buildCatatanSelisihRekon(bankItem, bankAmount, bkuAmount, selisih) {
  const raw =
    bankItem?.tanggal instanceof Date
      ? bankItem.tanggal
      : bankItem?.tanggal
        ? new Date(bankItem.tanggal)
        : null;
  const tgl = raw && !isNaN(raw.getTime()) ? fmtDate(raw) : '-';
  const desk = String(bankItem?.deskripsi || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  const core = `Selisih rekon: Rp ${fmtIDR(selisih)} (Mutasi bank Rp ${fmtIDR(bankAmount)} vs BKU Rp ${fmtIDR(
    bkuAmount
  )}, tgl bank ${tgl})`;
  return (desk ? `${core}. Uraian bank: ${desk}` : core).slice(0, 2000);
}

/**
 * Cascade SUDAH_BRUTO ke semua data_sp2d_potongan milik SP2D tertentu.
 * Dipanggil setiap kali sebuah data_sp2d di-set status_rekon = 'SUDAH_BRUTO'.
 * Menggunakan nomor_sp2d (lebih reliable dari id_sp2d yang sering kosong).
 * Tidak overwrite potongan yang sudah punya bank match sendiri.
 */
async function cascadeSudahBrutoToPotongan(prismaClient, sp2dId, tglBank) {
  const sp2d = await prismaClient.data_sp2d.findUnique({ where: { id: sp2dId }, select: { nomor: true } });
  if (!sp2d) return 0;
  const keterangan = `Tercakup dalam bruto SP2D ${sp2d.nomor} @ bank tgl ${tglBank || '-'}`;
  // tglBankDate: digunakan untuk mengisi tanggal_pencairan potongan yang masih null
  // sehingga potongan bruto dapat ditemukan di Audit Potongan (getMatchedPotonganReport)
  const tglBankDate = tglBank ? new Date(tglBank) : new Date();
  const result = await prismaClient.$executeRaw`
    UPDATE data_sp2d_potongan
    SET status_rekon     = 'SUDAH_BRUTO',
        keterangan_rekon = ${keterangan},
        selisih_rekon    = 0,
        tanggal_pencairan = COALESCE(tanggal_pencairan, ${tglBankDate})
    WHERE (nomor_sp2d = ${sp2d.nomor} OR id_sp2d = ${sp2dId})
      AND (status_rekon = 'BELUM' OR status_rekon IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement b
        WHERE b.ref_bku_id = data_sp2d_potongan.id::text
          AND b.is_matched = true
      )
  `;
  return result;
}

function appendPotonganKeterangan(existing, block) {
  const base = String(existing || '').trim();
  const sep = '\n--- Catatan rekonsiliasi ---\n';
  return (base ? `${base}${sep}${block}` : block).slice(0, 4000);
}

/**
 * [AUDIT 2026-05-16] Parameter pencocokan berbasis URAIAN (text similarity) telah DIHAPUS.
 * 
 * ALASAN:
 * - Data uraian BKU (SP2D/Potongan) dan deskripsi bank menggunakan format yang sangat berbeda,
 *   sehingga text matching rawan menghasilkan false positive (cocok salah) maupun false negative (tidak ketemu).
 * - Integritas keuangan lebih terjamin dengan pencocokan murni berbasis:
 *   1. NILAI NOMINAL (exact cents-level matching via Math.round * 100)
 *   2. JARAK TANGGAL (dalam jendela waktu yang ketat)
 * - Sistem menjadi lebih DETERMINISTIK, TRANSPARAN, dan TIDAK BERGANTUNG pada kualitas teks input.
 */

/**
 * Set status rekon + catatan selisih pada baris BKU yang cocok dengan mutasi bank.
 */
async function applyBkuRekonCatatanSelisih({
  bkuId,
  bankItem,
  bankAmount,
  bkuAmount,
  diff,
  absDiff,
  status_rekon,
  sp2dRow = null,
  keterangan_admin = null
}) {
  const idStr = String(bkuId);
  const finalStatus = status_rekon || 'SUDAH';
  const catatanSistem = absDiff > 0 ? buildCatatanSelisihRekon(bankItem, bankAmount, bkuAmount, diff) : null;
  
  // Gabungkan catatan otomatis sistem dengan catatan manual admin
  let finalCatatan = catatanSistem;
  if (keterangan_admin) {
    const systemLabels = [
      'Pencocokan Masal (Bulk Match)', 
      'Rekon Massal (Manual Labeling)', 
      'Bulk Match: Smart Group Manual Labeling',
      'Pencocokan Manual 1-ke-1',
      'MANUAL_1TO1_BATCH',
      'SMART_GROUP_MANUAL_LABEL',
      'Bulk Match'
    ];
    
    // Jika bukan label sistem, berarti ini catatan manual dari user -> beri prefix "Catatan Admin:"
    // Agar terbaca oleh filter discrepancy: LIKE '%Catatan Admin:%'
    const isManual = !systemLabels.some(label => keterangan_admin.includes(label));
    
    if (isManual) {
      finalCatatan = catatanSistem 
        ? `${catatanSistem} | Catatan Admin: ${keterangan_admin}` 
        : `Catatan Admin: ${keterangan_admin}`;
    } else {
      // Jika label sistem, simpan apa adanya (tanpa prefix Catatan Admin)
      finalCatatan = catatanSistem 
        ? `${catatanSistem} | ${keterangan_admin}` 
        : keterangan_admin;
    }
  }

  const updates = [];
  // tanggal dari bank statement = momen kas keluar (C.4).
  const tglDariBank = bankItem.tanggal ? new Date(bankItem.tanggal) : new Date();

  // ATURAN KRITIS: tanggal_pencairan tidak boleh hilang dalam kondisi apapun.
  // Jika SP2D sudah punya tanggal_pencairan (dari SIPD/input manual sebelumnya), PERTAHANKAN.
  // Hanya isi dari bank jika SP2D belum memiliki tanggal_pencairan sama sekali.
  const tanggal_pencairan = (sp2dRow?.tanggal_pencairan) ? sp2dRow.tanggal_pencairan : tglDariBank;

  // Diagnostik Logging untuk Debugging Error 500
  console.log(`[APPLY_REKON_START] ID: ${idStr} | Status: ${finalStatus} | Tgl: ${tanggal_pencairan.toISOString()}`);
  if (finalCatatan && finalCatatan.length > 500) {
    console.log(`[APPLY_REKON_INFO] Catatan panjang dideteksi (${finalCatatan.length} chars)`);
  }

  if (sp2dRow) {
    console.log(`[APPLY_REKON] Memproses sebagai SP2D Utama: ${sp2dRow.nomor}`);
    updates.push(prisma.data_sp2d.update({
      where: { id: idStr },
      data: {
        status_rekon: finalStatus,
        selisih_rekon: absDiff > 0 ? diff : 0,
        keterangan_rekon: finalCatatan,
        tanggal_pencairan
      },
    }));

    // Update Potongan terkait: HANYA sinkronkan Tanggal Pencairan (jika masih kosong)
    // Sesuai instruksi User 2026-05-16: Status rekon potongan TIDAK dipengaruhi SP2D induk
    // Hal ini untuk mencegah 'Ghost Match' (Status SUDAH tapi tidak ada link bank)
    updates.push(prisma.data_sp2d_potongan.updateMany({
      where: { 
        id_sp2d: idStr,
        tanggal_pencairan: null 
      },
      data: { 
        tanggal_pencairan
      },
    }));
  } else {
    // Cari di tabel lain secara berurutan
    let targetTable = null;
    
    // 1. Cek Potongan (Format UUID)
    if (isValidUuid(idStr)) {
      const pot = await prisma.data_sp2d_potongan.findUnique({ where: { id: idStr } });
      if (pot) targetTable = 'data_sp2d_potongan';
    }

    // 2. Cek Pajak
    if (!targetTable) {
      const sjk = await prisma.setoran_pajak.findUnique({ where: { id: idStr } });
      if (sjk) targetTable = 'setoran_pajak';
    }

    // 3. Cek Pendapatan
    if (!targetTable) {
      const pnd = await prisma.data_pendapatan.findUnique({ where: { id: idStr } });
      if (pnd) targetTable = 'data_pendapatan';
    }

    if (targetTable) {
      console.log(`[APPLY_REKON] Data ditemukan di tabel: ${targetTable}`);
      updates.push(prisma[targetTable].update({
        where: { id: idStr },
        data: {
          status_rekon: finalStatus,
          selisih_rekon: absDiff > 0 ? diff : 0,
          keterangan_rekon: finalCatatan,
          tanggal_pencairan
        }
      }));
    }
  }

  if (updates.length > 0) {
    try {
      console.log(`[APPLY_REKON_EXECUTE] Sinkronisasi ${updates.length} tabel...`);
      return await prisma.$transaction(updates);
    } catch (dbErr) {
      // Tangani kasus data tidak ditemukan (P2025) agar tidak 500
      if (dbErr.code === 'P2025') {
        console.warn(`[APPLY_REKON_WARN] Data dengan ID ${idStr} tidak ditemukan di database saat akan diupdate.`);
        return { message: 'Data tidak ditemukan, mungkin sudah dihapus atau diubah', warning: true };
      }
      console.error('[APPLY_REKON_TRANSACTION_ERROR]:', dbErr.message);
      throw dbErr;
    }
  } else {
    console.warn(`[APPLY_REKON_SKIP] ID ${idStr} tidak terdaftar di tabel manapun (SP2D/POT/PJK/PND).`);
  }
}

/**
 * Mendapatkan data untuk perbandingan Rekonsiliasi
 */
const getReconciliationData = async (req, res) => {
  const { startDate, endDate, search, status, page = 1, limit = 15 } = req.query;
  const p = Math.max(1, parseInt(page));
  const l = Math.max(1, parseInt(limit));
  const offset = (p - 1) * l;

  // Validasi format tanggal — tolak input yang bukan YYYY-MM-DD (mencegah SQL injection via date strings)
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if ((startDate && !DATE_RE.test(startDate)) || (endDate && !DATE_RE.test(endDate))) {
    return res.status(400).json({ message: 'Format tanggal tidak valid. Gunakan YYYY-MM-DD.' });
  }

  // Kunci Tanggal: gunakan string asli parameter — tidak melalui objek Date agar tidak bergeser TZ
  const sDate = startDate || '2026-01-01';
  const eDate = endDate   || '2026-12-31';
  const sDateObj = new Date(`${sDate}T00:00:00.000Z`);
  const eDateObj = new Date(`${eDate}T23:59:59.999Z`);

  try {
    const bankWhere = {
      tanggal: { gte: sDateObj, lte: eDateObj }
    };

    if (search) bankWhere.deskripsi = { contains: search, mode: 'insensitive' };
    
    // Mapping status dari UI (SELESAI) ke DB (SUDAH)
    const normalizedStatus = status === 'SELESAI' ? 'SUDAH' : status;

    if (normalizedStatus === 'BELUM') bankWhere.is_matched = false;
    else if (normalizedStatus === 'SUDAH') bankWhere.is_matched = true;
    else if (normalizedStatus === 'SELISIH') {
      bankWhere.is_matched = true;
      bankWhere.selisih_nilai = { not: 0 };
    }

    // Tambahkan filter tipe (MASUK/KELUAR) untuk Mutasi Bank
    const type = req.query.type;
    if (type === 'MASUK') {
      bankWhere.kredit = { gt: 0 };
    } else if (type === 'KELUAR') {
      bankWhere.debet = { gt: 0 };
    }

    // 1. Bank Data with Pagination
    const [bank, bankCount, bankSummary] = await prisma.$transaction([
      prisma.bank_statement.findMany({
        where: bankWhere,
        orderBy: { tanggal: 'asc' },
        skip: offset,
        take: l
      }),
      prisma.bank_statement.count({ where: bankWhere }),
      prisma.bank_statement.aggregate({
        where: { tanggal: { gte: sDateObj, lte: eDateObj } },
        _sum: { debet: true, kredit: true },
        _count: { id: true }
      })
    ]);
    
    const bankMatchedCount = await prisma.bank_statement.count({
      where: {
        tanggal: { gte: sDateObj, lte: eDateObj },
        is_matched: true
      }
    });

    let statusFilter = (alias = '') => {
      const pfx = alias ? `${alias}.` : '';
      const normalizedStatus = status === 'SELESAI' ? 'SUDAH' : status;

      if (normalizedStatus === 'BELUM') return `AND (${pfx}status_rekon = 'BELUM' OR ${pfx}status_rekon IS NULL OR ${pfx}status_rekon = '')`;
      if (normalizedStatus === 'SUDAH') return `AND ${pfx}status_rekon LIKE 'SUDAH%'`;
      if (normalizedStatus === 'SELISIH') return `AND ${pfx}status_rekon LIKE 'SUDAH%' AND ABS(COALESCE(${pfx}selisih_rekon, 0)) > 0`; 
      return '';
    };

    // Sanitasi search untuk PostgreSQL ILIKE: escape single-quote (SQL injection) dan wildcard literal
    const safSearch = search
      ? search.substring(0, 200).replace(/\\/g, '\\\\').replace(/'/g, "''").replace(/%/g, '\\%').replace(/_/g, '\\_')
      : null;
    const getSearchFilter = (col) => safSearch ? `AND (${col} ILIKE '%${safSearch}%' OR uraian ILIKE '%${safSearch}%')` : '';

    // 2. Global BKU Summary (Includes ALL sources)
    // ARSITEKTUR BENAR (jangan ubah tanpa klarifikasi domain):
    //   SP2D Neto   = bruto - SUM(rincian_potongan) → pembayaran ke penerima via bank
    //   Rincian Potongan (data_sp2d_potongan) → NTPN ke DJP / otoritas pajak, transaksi bank tersendiri
    //   Total Keluar = Neto + Rincian = Bruto = total kas yang benar-benar keluar dari RKUD ✓
    //
    // Potongan Gelondongan (data_sp2d.nilai_potongan) adalah pengontrol/verifikasi saja —
    // tidak masuk UNION ini. Yang masuk hanya rincian (data_sp2d_potongan) sebagai transaksi nyata.
    //
    // Guard NOT EXISTS pada setoran_pajak: mencegah NTPN terhitung dua kali
    // (sisi BKU sudah diwakili data_sp2d_potongan, sisi bank oleh setoran_pajak — pilih salah satu).
    const summaryAgg = await prisma.$queryRawUnsafe(`
      SELECT
        SUM(CASE WHEN tipe = 'KELUAR' THEN nilai ELSE 0 END) as total_keluar,
        SUM(CASE WHEN tipe = 'MASUK' THEN nilai ELSE 0 END) as total_masuk,
        SUM(CASE WHEN tipe = 'KELUAR' AND (status_rekon = 'BELUM' OR status_rekon IS NULL OR status_rekon = '') THEN nilai ELSE 0 END) as unmatched_keluar,
        SUM(CASE WHEN tipe = 'MASUK' AND (status_rekon = 'BELUM' OR status_rekon IS NULL OR status_rekon = '') THEN nilai ELSE 0 END) as unmatched_masuk,
        COUNT(*) as total_count
      FROM (
        SELECT CASE WHEN s.status_rekon = 'SUDAH_BRUTO' THEN s.nilai_bruto
                    ELSE s.nilai_bruto - COALESCE(
                      (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
                       WHERE p.id_sp2d = s.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
                      CAST(s.nilai_potongan AS DECIMAL)
                    ) END as nilai, 'KELUAR' as tipe, COALESCE(s.status_rekon, 'BELUM') as status_rekon
        FROM data_sp2d s
        WHERE ((s.tanggal_pencairan::DATE >= '${sDate}' AND s.tanggal_pencairan::DATE <= '${eDate}')
           OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE >= '${sDate}' AND s.tanggal::DATE <= '${eDate}'))

        UNION ALL
        SELECT p.nilai, 'KELUAR' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}'

        UNION ALL
        SELECT p.nilai, 'MASUK' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon
        FROM data_pendapatan p
        WHERE p.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'

        UNION ALL
        SELECT s.nilai, 'KELUAR' as tipe, COALESCE(s.status_rekon, 'BELUM') as status_rekon
        FROM setoran_pajak s
        WHERE s.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'
        AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
      ) as global_bku
    `);

    const s = summaryAgg[0];

    // 3. Paginated BKU Data dengan window function untuk total count & per-source count
    // SP2D filter menggunakan s.tanggal (tanggal terbit) agar konsisten —
    // SP2D terbit di bulan X selalu tampil saat user memilih bulan X, lepas dari kapan dicairkan.
    const bku = await prisma.$queryRawUnsafe(`
      SELECT
        id, tanggal, bukti, uraian, nilai, tipe, status_rekon, source, opd, selisih_rekon,
        COUNT(*) OVER()::int                                               AS _total_bku,
        COUNT(*) FILTER (WHERE source = 'SP2D') OVER()::int               AS _count_sp2d,
        COUNT(*) FILTER (WHERE source = 'PENDAPATAN') OVER()::int         AS _count_pendapatan,
        COUNT(*) FILTER (WHERE source IN ('POTONGAN','SETORAN')) OVER()::int AS _count_potongan
      FROM (
        SELECT s.id::text, COALESCE(s.tanggal_pencairan, s.tanggal) as tanggal, s.nomor as bukti, s.uraian,
               CAST(CASE WHEN s.status_rekon = 'SUDAH_BRUTO' THEN s.nilai_bruto
                         ELSE s.nilai_bruto - COALESCE(
                           (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
                            WHERE p.id_sp2d = s.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
                           CAST(s.nilai_potongan AS DECIMAL)
                         ) END AS DECIMAL) as nilai,
               'KELUAR' as tipe, COALESCE(s.status_rekon, 'BELUM') as status_rekon, 'SP2D' as source, s.opd,
               COALESCE(s.selisih_rekon, 0)::numeric as selisih_rekon
        FROM data_sp2d s
        WHERE (
               (s.tanggal_pencairan::DATE BETWEEN '${sDate}' AND '${eDate}')
            OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}')
          ) ${statusFilter('s')} ${getSearchFilter('s.nomor')}

        UNION ALL
        SELECT p.id::text, p.tanggal, p.nomor_bukti as bukti, p.uraian, p.nilai, 'MASUK' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon, 'PENDAPATAN' as source, 'BENDAHARA' as opd,
               COALESCE(p.selisih_rekon, 0)::numeric as selisih_rekon
        FROM data_pendapatan p
        WHERE p.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}' ${statusFilter('p')} ${getSearchFilter('p.nomor_bukti')}

        UNION ALL
        SELECT tx.id::text, tx.tanggal, tx.nomor_bukti as bukti, tx.uraian, tx.nilai, 'KELUAR' as tipe, COALESCE(tx.status_rekon, 'BELUM') as status_rekon, 'SETORAN' as source, tx.opd,
               COALESCE(tx.selisih_rekon, 0)::numeric as selisih_rekon
        FROM setoran_pajak tx
        WHERE tx.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}' ${statusFilter('tx')} ${getSearchFilter('tx.nomor_bukti')}
        AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = tx.nomor_bukti)

        UNION ALL
        SELECT p.id::text, COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, p.nomor_sp2d as bukti, p.uraian, p.nilai, 'KELUAR' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon, 'POTONGAN' as source, p.opd,
               COALESCE(p.selisih_rekon, 0)::numeric as selisih_rekon
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE (
               (p.tanggal_pencairan::DATE BETWEEN '${sDate}' AND '${eDate}')
            OR (p.tanggal_pencairan IS NULL AND COALESCE(s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}')
          ) ${statusFilter('p')} ${getSearchFilter('p.nomor_sp2d')}
      ) combined
      ORDER BY tanggal ASC
      LIMIT ${l} OFFSET ${offset}
    `);

    // Ekstrak counts dari window function (ada di setiap baris, ambil dari baris pertama)
    const firstRow = bku[0] || {};
    const bkuCounts = {
      totalBku:    Number(firstRow._total_bku    || 0),
      sp2d:        Number(firstRow._count_sp2d   || 0),
      pendapatan:  Number(firstRow._count_pendapatan || 0),
      potongan:    Number(firstRow._count_potongan  || 0),
    };

    // Buang kolom internal window function dari item yang dikirim ke frontend
    const bkuSanitized = bku.map(({ _total_bku, _count_sp2d, _count_pendapatan, _count_potongan, ...item }) => ({
       ...item,
       uraian: String(item.uraian || '').replace(/\[BELUM COCOK\]|\[Rekon\]|!!! HIGH ANOMALI|!!! ANOMALI|\[PENYESUAIAN BRUTO\]/gi, '').trim()
    }));

    res.json({
      bank,
      bku: bkuSanitized,
      counts: bkuCounts,
      pagination: {
        totalBank: bankCount,
        totalBku: bkuCounts.totalBku,   // Sekarang benar: count dengan status filter
        page: p,
        limit: l
      },
      summary: {
        totalBku: Number(s.total_keluar || 0),
        totalUnmatched: Number(s.unmatched_keluar || 0),
        totalIncomeUnmatched: Number(s.unmatched_masuk || 0),
        matchedCount: bankMatchedCount,
        unmatchedCount: bankSummary._count.id - bankMatchedCount,
        accuracy: bankSummary._count.id > 0 ? Math.round((bankMatchedCount / bankSummary._count.id) * 100) : 0,
        bankBalance: Number(bankSummary._sum.kredit || 0) - Number(bankSummary._sum.debet || 0),
        totalBankDebet: Number(bankSummary._sum.debet || 0),
        totalBankKredit: Number(bankSummary._sum.kredit || 0),
        totalBkuMasuk: Number(s.total_masuk || 0),
        bkuVariance: Number(s.total_masuk || 0) - Number(s.total_keluar || 0),
      }
    });
  } catch (err) {
    console.error('getReconciliationData Error:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Intelligent Matching Engine
 */
const runMagicMatch = async (req, res) => {
  const { startDate, endDate } = req.body;
  // Kunci Tanggal: string asli → Date UTC eksplisit (parseDateSafe menghasilkan UTC-noon yang memotong data)
  const sDate = startDate || '1970-01-01';
  const eDate = endDate   || '2099-12-31';
  const sDateObj = new Date(`${sDate}T00:00:00.000Z`);
  const eDateObj = new Date(`${eDate}T23:59:59.999Z`);

  console.log(`[DEBUG] runMagicMatch input: ${sDate} to ${eDate}`);

  try {
    const bankItems = await prisma.bank_statement.findMany({
      where: {
        is_matched: false,
        tanggal: {
          gte: sDateObj,
          lte: eDateObj
        }
      },
      take: 5000,
      orderBy: { tanggal: 'asc' }
    });
    
    const bkuItems = await prisma.$queryRaw`
        SELECT CAST(h.id AS VARCHAR) as id, CAST(h.nomor AS VARCHAR) as bukti, CAST(h.uraian AS VARCHAR) as uraian,
               CAST(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto ELSE (h.nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), h.nilai_potongan)) END AS DECIMAL) as nilai,
               CAST(h.nilai_bruto AS DECIMAL) as nilai_bruto, COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal, 'KELUAR' as tipe
       FROM data_sp2d h
       LEFT JOIN bank_statement b ON TRIM(CAST(h.id AS VARCHAR)) = TRIM(b.ref_bku_id)
       WHERE COALESCE(UPPER(TRIM(h.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
         AND CAST(COALESCE(h.tanggal_pencairan, h.tanggal) AS DATE) BETWEEN CAST(${parseDateSafe(sDate)} AS DATE) AND CAST(${parseDateSafe(eDate)} AS DATE)

       UNION ALL

        SELECT CAST(s.id AS VARCHAR) as id, CAST(s.nomor_bukti AS VARCHAR) as bukti, CAST(s.uraian AS VARCHAR) as uraian,
               CAST(s.nilai AS DECIMAL) as nilai, CAST(s.nilai AS DECIMAL) as nilai_bruto,
               COALESCE(s.tanggal_pencairan, s.tanggal) as tanggal, 'PAJAK' as tipe
        FROM setoran_pajak s
        LEFT JOIN bank_statement b ON TRIM(CAST(s.id AS VARCHAR)) = TRIM(b.ref_bku_id)
        WHERE COALESCE(UPPER(TRIM(s.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
          AND CAST(COALESCE(s.tanggal_pencairan, s.tanggal) AS DATE) BETWEEN CAST(${parseDateSafe(sDate)} AS DATE) AND CAST(${parseDateSafe(eDate)} AS DATE)
          AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)

       UNION ALL

        SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_bukti AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian,
               CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto, p.tanggal as tanggal, 'MASUK' as tipe
        FROM data_pendapatan p
        LEFT JOIN bank_statement b ON TRIM(CAST(p.id AS VARCHAR)) = TRIM(b.ref_bku_id)
        WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
          AND CAST(p.tanggal AS DATE) BETWEEN CAST(${parseDateSafe(sDate)} AS DATE) AND CAST(${parseDateSafe(eDate)} AS DATE)

       UNION ALL

       SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian,
              CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto, COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, 'POTONGAN' as tipe
       FROM data_sp2d_potongan p
       LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
       LEFT JOIN bank_statement b ON TRIM(CAST(p.id AS VARCHAR)) = TRIM(b.ref_bku_id)
       WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
         AND CAST(COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) AS DATE) BETWEEN CAST(${parseDateSafe(sDate)} AS DATE) AND CAST(${parseDateSafe(eDate)} AS DATE)
    `;
    
    // --- OPTIMIZATION: HIGH-PRECISION CENTS MAP ---
    // Using Math.round(val * 100) to ensure absolute accuracy for financial values
    const bkuValueMap = new Map();
    for (const bku of bkuItems) {
      const netoKey = Math.round(toNum(bku.nilai) * 100);
      const brutoKey = Math.round(toNum(bku.nilai_bruto) * 100);
      
      if (!bkuValueMap.has(netoKey)) bkuValueMap.set(netoKey, []);
      bkuValueMap.get(netoKey).push(bku);
      
      if (brutoKey !== netoKey) {
        if (!bkuValueMap.has(brutoKey)) bkuValueMap.set(brutoKey, []);
        bkuValueMap.get(brutoKey).push(bku);
      }
    }

    let matchCount = 0;
    const updateTasks = [];

    for (const bankItem of bankItems) {
      const rawVal = toNum(bankItem.debet) > 0 ? toNum(bankItem.debet) : toNum(bankItem.kredit);
      const valKey = Math.round(rawVal * 100);
      const isOut = toNum(bankItem.debet) > 0;
      // Pillar 1+3: strip time component — perbandingan murni berdasarkan tanggal saja
      const bankDate = toNativeDate(fmtDate(bankItem.tanggal));

      if (rawVal === 0) continue;

      const potentialMatches = bkuValueMap.get(valKey) || [];

      // Intelligent Ranking & Selection
      const candidates = potentialMatches
        .filter(bku => {
          if (bku._isMatched) return false;
          if (isOut && bku.tipe === 'MASUK') return false;
          if (!isOut && bku.tipe !== 'MASUK') return false;

          const bkuDateStr = fmtDate(bku.tanggal);
          if (!bkuDateStr) return false;
          const bkuDate = toNativeDate(bkuDateStr);

          const diffDays = (bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24);
          // Aturan Emas Jendela Waktu: Penerimaan ±2 hari, Pengeluaran/Potongan -1 s/d +7 hari
          if (bku.tipe === 'MASUK') return Math.abs(diffDays) <= 2;
          return diffDays >= -1 && diffDays <= 7;
        })
        .map(bku => {
           const bkuDate = toNativeDate(fmtDate(bku.tanggal));
           const diffDays = Math.abs(bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24);

           // Jendela Waktu Adaptif: same-day=50, 1-3 hari tetap layak (jeda kliring)
           const dateScore = diffDays === 0 ? 50 : Math.max(0, 42 - (diffDays * 6));

           // Tie-Breaker Uraian: +80 nomor dokumen cocok, +30 parsial
           const uraianScore = computeUraianScore(bankItem.deskripsi, bku.uraian, bku.bukti);

           // Skor Nomor Bukti: khusus PENDAPATAN — menambah sinyal identitas lewat nomor_bukti (0-500)
           const nomorBuktiScore = (bku.tipe === 'MASUK')
             ? computeNomorBuktiScore(bankItem, bku.bukti)
             : 0;

           // Relaksasi Nilai Unik: sen tidak nol → probabilitas duplikat sangat kecil
           const valueBonus = isUniqueValue(rawVal) ? 15 : 0;

           return { ...bku, totalConfidence: dateScore + uraianScore + valueBonus + nomorBuktiScore, _nomorBuktiScore: nomorBuktiScore };
        })
        .sort((a, b) => b.totalConfidence - a.totalConfidence);

      const topMatch = candidates[0];
      if (!topMatch) continue;

      // Nilai sudah sama persis (bkuValueMap) — langsung cocokkan dengan kandidat tanggal terbaik
      const match = topMatch;

      if (match) {
        const val = Math.round(rawVal);
        const neto = Math.round(toNum(match.nilai));
        const bruto = Math.round(toNum(match.nilai_bruto));
        const closerIsBruto = Math.abs(bruto - val) < Math.abs(neto - val);
        const refAmount = closerIsBruto ? bruto : neto;
        const valDiff = val - refAmount;
        const absDiff = Math.abs(valDiff);
        const status_rekon = 'SUDAH';

        const isBuktiDrivenMagic = match.tipe === 'MASUK' && (match._nomorBuktiScore || 0) >= 120;
        const magicMatchType = isBuktiDrivenMagic ? 'SMART_BUKTI' : (closerIsBruto ? 'BRUTO' : 'NETO');

        updateTasks.push(prisma.bank_statement.update({
          where: { id: bankItem.id },
          data: {
            is_matched: true,
            ref_bku_id: String(match.id), // WAJIB String agar JOIN CAST(id AS VARCHAR) = ref_bku_id konsisten
            selisih_nilai: absDiff > 0 ? valDiff : 0,
            catatan_selisih: absDiff > 0 ? `Selisih Rp ${new Intl.NumberFormat('id-ID').format(valDiff)}` : null,
            match_type: magicMatchType,
          }
        }));

        const finalUpdateData = {
          status_rekon,
          selisih_rekon: absDiff > 0 ? valDiff : 0,
          keterangan_rekon: absDiff > 0 ? buildCatatanSelisihRekon(bankItem, val, refAmount, valDiff) : null,
          tanggal_pencairan: match.tanggal_pencairan || bankDate
        };

        const targetId = match.id;

        if (match.tipe === 'KELUAR') {
          if (closerIsBruto) {
            finalUpdateData.status_rekon = 'SUDAH_BRUTO';
            finalUpdateData.keterangan_rekon = (finalUpdateData.keterangan_rekon || '') + ' [PENYESUAIAN BRUTO]';
          }
          updateTasks.push(prisma.data_sp2d.update({ where: { id: targetId }, data: finalUpdateData }));
          if (closerIsBruto) {
            const tglBank = bankItem?.tanggal ? String(bankItem.tanggal).slice(0, 10) : null;
            updateTasks.push(cascadeSudahBrutoToPotongan(prisma, targetId, tglBank));
          }
        } else if (match.tipe === 'POTONGAN') {
          updateTasks.push(prisma.data_sp2d_potongan.update({ where: { id: targetId }, data: finalUpdateData }));
        } else if (match.tipe === 'PAJAK') {
          updateTasks.push(prisma.setoran_pajak.update({ where: { id: targetId }, data: finalUpdateData }));
        } else if (match.tipe === 'MASUK') {
          updateTasks.push(prisma.data_pendapatan.update({ where: { id: targetId }, data: finalUpdateData }));
        }

        // Fix Shallow Copy Bug: Tandai objek asli di potentialMatches agar tidak dicocokkan kembali
        const originalBku = potentialMatches.find(b => b.id === match.id);
        if (originalBku) {
          originalBku._isMatched = true;
        }
        match._isMatched = true;
        matchCount++;
      }
    }

    const BATCH_SIZE = 50;
    for (let i = 0; i < updateTasks.length; i += BATCH_SIZE) {
      await prisma.$transaction(updateTasks.slice(i, i + BATCH_SIZE));
    }

    // RECORD DISCREPANCIES FOR UNMATCHED BKU ITEMS
    // Logic: If a BKU item was scanned but not matched, set its selisih_rekon to -nilai 
    // to reflect that it's missing from the bank.
    const bkuUpdateTasks = [];
    for (const bku of bkuItems) {
      if (bku._isMatched) continue;

      const val = toNum(bku.nilai);
      const cat = 'Selisih total: Transaksi BKU belum ditemukan pada mutasi bank dalam rentang waktu yang ditentukan.';
      
      if (bku.tipe === 'KELUAR') {
        bkuUpdateTasks.push(prisma.data_sp2d.updateMany({
          where: { id: bku.id, status_rekon: 'BELUM' },
          data: { selisih_rekon: -val, keterangan_rekon: cat }
        }));
      } else if (bku.tipe === 'POTONGAN') {
        bkuUpdateTasks.push(prisma.data_sp2d_potongan.updateMany({
          where: { id: bku.id, status_rekon: 'BELUM' },
          data: { selisih_rekon: -val, keterangan_rekon: cat }
        }));
      } else if (bku.tipe === 'PAJAK' || bku.tipe === 'MASUK') {
        const table = bku.tipe === 'PAJAK' ? prisma.setoran_pajak : prisma.data_pendapatan;
        bkuUpdateTasks.push(table.updateMany({
          where: { id: bku.id, status_rekon: 'BELUM' },
          data: { 
            selisih_rekon: -val,
            keterangan_rekon: cat 
          }
        }));
      }
    }

    if (bkuUpdateTasks.length > 0) {
      for (let i = 0; i < bkuUpdateTasks.length; i += BATCH_SIZE) {
        const batch = bkuUpdateTasks.slice(i, i + BATCH_SIZE);
        await prisma.$transaction(batch).catch(e => console.error('Error updating unmatched BKU:', e));
      }
    }

    // postRekonNotes logic is now handled inline in updateTasks for better atomicity

    res.json({
      message: 'Magic Match completed',
      matchCount,
      bankRowsScanned: bankItems.length,
    });
  } catch (err) {
    console.error('Magic Match Error:', err);
    res.status(500).json({ message: 'Error running magic match', error: err.message });
  }
};

// Helper for JSON serialization (handles BigInt)
const serialize = (obj) => {
  return JSON.parse(JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
};

/**
 * Force Match Individual Transaction
 * Supports match_type: 'neto' (default) or 'bruto'
 */
const matchIndividual = async (req, res) => {
  const { bankId, bkuId, match_type, keterangan_admin } = req.body;
  
  // 1. Hard Validation
  if (!bankId || !bkuId) {
    return res.status(400).json({ message: 'Bank ID and BKU ID are required' });
  }

  const numericBankId = parseInt(bankId);
  if (isNaN(numericBankId)) {
    return res.status(400).json({ message: 'Invalid Bank ID format' });
  }

  const isBrutoMatch = match_type === 'bruto';

  try {
    // 2. Fetch Bank Item
    const bankItem = await prisma.bank_statement.findUnique({ where: { id: numericBankId } });
    if (!bankItem) return res.status(404).json({ message: 'Mutasi bank tidak ditemukan' });
    
    let bkuValue = 0;
    let bkuRowData = null;
    const idStr = String(bkuId);
    
    // 3. Search BKU across tables
    // Check SP2D
    const sp2d = await prisma.data_sp2d.findUnique({ where: { id: idStr } });
    if (sp2d) {
      const potSum = await prisma.data_sp2d_potongan.aggregate({ 
        where: { id_sp2d: sp2d.id }, 
        _sum: { nilai: true } 
      });
      const currentNeto = Number(sp2d.nilai_bruto) - Number(potSum._sum.nilai || 0);
      bkuValue = isBrutoMatch ? Number(sp2d.nilai_bruto) : currentNeto;
      bkuRowData = sp2d;
    } else {
      // Check Pendapatan
      const pnd = await prisma.data_pendapatan.findUnique({ where: { id: idStr } });
      if (pnd) {
        bkuValue = Number(pnd.nilai);
        bkuRowData = pnd;
      } else {
        // Check Potongan (UUID)
        if (isValidUuid(idStr)) {
          const pot = await prisma.data_sp2d_potongan.findUnique({ where: { id: idStr } });
          if (pot) {
            bkuValue = Number(pot.nilai);
            bkuRowData = pot;
          }
        }
        
        // Check Pajak
        if (!bkuRowData) {
          const sjk = await prisma.setoran_pajak.findUnique({ where: { id: idStr } });
          if (sjk) {
            bkuValue = Number(sjk.nilai);
            bkuRowData = sjk;
          }
        }
      }
    }

    if (!bkuRowData) {
      return res.status(404).json({ message: 'Data BKU tidak ditemukan' });
    }

    // 4. Calculation
    const bankVal = Math.round(Number(bankItem.debet) || Number(bankItem.kredit));
    const bkuValRounded = Math.round(bkuValue);
    const diff = bankVal - bkuValRounded;
    const absDiff = Math.abs(diff);
    // Bruto manual: SP2D mendapat SUDAH_BRUTO agar cascade potongan berjalan.
    // Tipe lain (Potongan/Pendapatan/Pajak) tetap SUDAH karena tidak punya child potongan.
    const status_rekon = (isBrutoMatch && sp2d) ? 'SUDAH_BRUTO' : 'SUDAH';

    // 5. Database Transaction
    // Execute bank update and BKU updates in one go if possible, or sequentially
    await prisma.bank_statement.update({
      where: { id: numericBankId },
      data: {
        is_matched: true,
        ref_bku_id: idStr,
        match_type: isBrutoMatch ? 'MANUAL_BRUTO' : 'MANUAL',
        selisih_nilai: absDiff > 0.01 ? diff : 0,
        catatan_selisih: absDiff > 0.01
          ? `Selisih ${diff > 0 ? 'LEBIH' : 'KURANG'} Rp ${new Intl.NumberFormat('id-ID').format(Math.abs(diff))} [MANUAL]${keterangan_admin ? ' | Catatan: ' + keterangan_admin : ''}`
          : (keterangan_admin ? `Catatan: ${keterangan_admin}` : null),
      }
    });

    // Update BKU (via helper)
    await applyBkuRekonCatatanSelisih({
      bkuId: idStr,
      bankItem,
      bankAmount: bankVal,
      bkuAmount: bkuValue,
      diff,
      absDiff,
      status_rekon,
      sp2dRow: sp2d,
      keterangan_admin
    });

    // Cascade SUDAH_BRUTO ke child potongan saat match manual bruto pada SP2D
    if (isBrutoMatch && sp2d) {
      const tglBank = bankItem?.tanggal ? String(bankItem.tanggal).slice(0, 10) : null;
      await cascadeSudahBrutoToPotongan(prisma, idStr, tglBank);
    }

    // Log Activity
    await prisma.log_aktivitas.create({
      data: {
        user_pelaksana: 'AUDITOR',
        aksi: isBrutoMatch ? 'FORCE_MATCH_BRUTO' : 'FORCE_MATCH',
        detail: `Manual Match (${isBrutoMatch ? 'BRUTO' : 'NETO'}) Bank ID ${numericBankId} ↔ BKU ID ${idStr} | Status: ${status_rekon}`
      }
    });

    res.json({
      message: `Berhasil dicocokkan (${isBrutoMatch ? 'nilai Brutto' : 'nilai Netto'})`,
      status: status_rekon
    });

  } catch (err) {
    console.error('[MATCH_INDIVIDUAL_FATAL_ERROR]:', err);
    res.status(500).json({ 
      message: 'Gagal memproses rekonsiliasi', 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    });
  }
};
/**
 * Smart Bulk Match Engine
 * Automatically reconciles perfect 1:1 matches (Value & Date proximity)
 */
const bulkMatchSmart = async (req, res) => {
  const { startDate, endDate, year } = req.body;
  
  // Kunci Tanggal: gunakan string asli parameter — tidak melalui objek Date agar tidak bergeser TZ
  const currentYear = parseInt(year) || new Date().getFullYear();
  const sDate = startDate || `${currentYear}-01-01`;
  const eDate = endDate   || `${currentYear}-12-31`;
  const sDateObj = new Date(`${sDate}T00:00:00.000Z`);
  const eDateObj = new Date(`${eDate}T23:59:59.999Z`);

  console.log(`[MAGIC ENGINE] Starting with range: ${sDate} to ${eDate}`);

  try {
    // Reset global progress
    smartMatchProgress = {
      isOpen: true,
      total: 0,
      current: 0,
      success: 0,
      fails: 0,
      status: 'fetching',
      message: 'Menganalisa data mutasi bank...'
    };

    // 1. Fetch all unmatched Bank Statements for the specified range
    const bankItems = await prisma.bank_statement.findMany({
      where: {
        is_matched: false,
        tanggal: {
          gte: sDateObj,
          lte: eDateObj
        }
      },
      orderBy: { tanggal: 'asc' }
    });

    if (bankItems.length === 0) {
      smartMatchProgress.isOpen = false;
      return res.json({ message: 'Tidak ada data mutasi bank yang perlu dicocokkan pada rentang ini.', matchCount: 0 });
    }

    smartMatchProgress.total = bankItems.length;
    smartMatchProgress.status = 'matching';
    smartMatchProgress.message = `Menganalisa ${bankItems.length} transaksi bank...`;

    // 2. Fetch all unmatched BKU candidates for the specified range
    const bkuItems = await prisma.$queryRawUnsafe(`
      SELECT
        CAST(h.id AS VARCHAR) as id,
        CAST(h.nomor AS VARCHAR) as bukti,
        CAST(h.uraian AS VARCHAR) as uraian,
        CAST(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto
                  ELSE h.nilai_bruto - COALESCE(
                    (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
                     WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
                    CAST(h.nilai_potongan AS DECIMAL)
                  ) END AS DECIMAL) as nilai,
        CAST(h.nilai_bruto AS DECIMAL) as nilai_bruto,
        COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal,
        'KELUAR' as tipe,
        'SP2D' as source,
        '' as opd,
        '' as jenis_potongan
      FROM data_sp2d h
      LEFT JOIN bank_statement b ON TRIM(CAST(h.id AS VARCHAR)) = TRIM(b.ref_bku_id)
      WHERE COALESCE(UPPER(TRIM(h.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
        AND COALESCE(h.tanggal_pencairan, h.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}'

      UNION ALL

      SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_bukti AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian,
             CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto, p.tanggal as tanggal, 'MASUK' as tipe, 'PENDAPATAN' as source,
             '' as opd, '' as jenis_potongan
      FROM data_pendapatan p
      LEFT JOIN bank_statement b ON TRIM(CAST(p.id AS VARCHAR)) = TRIM(b.ref_bku_id)
      WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
        AND p.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'

      UNION ALL

      SELECT CAST(s.id AS VARCHAR) as id, CAST(s.nomor_bukti AS VARCHAR) as bukti, CAST(s.uraian AS VARCHAR) as uraian,
             CAST(s.nilai AS DECIMAL) as nilai, CAST(s.nilai AS DECIMAL) as nilai_bruto,
             COALESCE(s.tanggal_pencairan, s.tanggal) as tanggal, 'KELUAR' as tipe, 'SETORAN' as source,
             '' as opd, '' as jenis_potongan
      FROM setoran_pajak s
      LEFT JOIN bank_statement b ON TRIM(CAST(s.id AS VARCHAR)) = TRIM(b.ref_bku_id)
      WHERE COALESCE(UPPER(TRIM(s.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
        AND CAST(COALESCE(s.tanggal_pencairan, s.tanggal) AS DATE) BETWEEN '${sDate}' AND '${eDate}'
        AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)

      UNION ALL

      SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian,
             CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto,
             COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal,
             'POTONGAN' as tipe, 'POTONGAN' as source,
             COALESCE(s.opd, '') as opd, COALESCE(p.jenis_potongan, '') as jenis_potongan
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      LEFT JOIN bank_statement b ON TRIM(CAST(p.id AS VARCHAR)) = TRIM(b.ref_bku_id)
      WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
        AND COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}'
    `);

    // --- OPTIMIZATION: HIGH-PRECISION CENTS MAP ---
    const bkuValueMap = new Map();
    for (const bku of bkuItems) {
      const netoKey = Math.round(toNum(bku.nilai) * 100);
      const brutoKey = Math.round(toNum(bku.nilai_bruto) * 100);
      
      if (!bkuValueMap.has(netoKey)) bkuValueMap.set(netoKey, []);
      bkuValueMap.get(netoKey).push(bku);
      
      if (brutoKey !== netoKey) {
        if (!bkuValueMap.has(brutoKey)) bkuValueMap.set(brutoKey, []);
        bkuValueMap.get(brutoKey).push(bku);
      }
    }

    let matchCount = 0;
    const updateTasks = [];

    for (let idx = 0; idx < bankItems.length; idx++) {
      const bankItem = bankItems[idx];
      const rawVal = toNum(bankItem.debet) > 0 ? toNum(bankItem.debet) : toNum(bankItem.kredit);
      const valKey = Math.round(rawVal * 100);
      const isOut = toNum(bankItem.debet) > 0;
      // WIT-Safe Date: offset +9 jam sebelum potong hari — cegah H-1 bleeding dari import CSV WIT
      const bankTgl = fmtDateWIT(bankItem.tanggal) || fmtDate(bankItem.tanggal);
      const bankDate = toNativeDate(bankTgl);

      if (rawVal === 0) continue;

      const potentialMatches = bkuValueMap.get(valKey) || [];

      // ── DUPLICATE GUARD ──────────────────────────────────────────────────────
      // Hitung kandidat aktif dalam jendela waktu. Jika >= threshold, aktifkan
      // Strict Mode: sistem hanya boleh cocokkan jika ada sinyal uraian yang jelas.
      const activeDuplicates = potentialMatches.filter(bku => {
        if (bku._isMatched) return false;
        if (isOut && bku.tipe === 'MASUK') return false;
        if (!isOut && bku.tipe !== 'MASUK') return false;
        const bkuDateStr = fmtDate(bku.tanggal);
        if (!bkuDateStr) return false;
        const bkuDate = toNativeDate(bkuDateStr);
        const diffDays = (bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24);
        if (bku.tipe === 'MASUK') return Math.abs(diffDays) <= 2;
        return diffDays >= -1 && diffDays <= 7;
      });
      const isStrictMode = activeDuplicates.length >= STRICT_MODE_THRESHOLD;

      if (isStrictMode) {
        console.log(`[DUPLICATE GUARD] Bank #${bankItem.id} Rp${rawVal} — ${activeDuplicates.length} kandidat kembar. STRICT MODE aktif.`);
      }

      const candidates = potentialMatches
        .filter(bku => {
          if (bku._isMatched) return false;
          if (isOut && bku.tipe === 'MASUK') return false;
          if (!isOut && bku.tipe !== 'MASUK') return false;
          const bkuDateStr = fmtDate(bku.tanggal);
          if (!bkuDateStr) return false;
          const bkuDate = toNativeDate(bkuDateStr);
          const diffDays = (bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24);
          if (bku.tipe === 'MASUK') return Math.abs(diffDays) <= 2;
          return diffDays >= -1 && diffDays <= 7;
        })
        .map(bku => {
           const bkuTgl = fmtDate(bku.tanggal);
           const bkuDate = toNativeDate(bkuTgl);
           const diffDays = Math.abs(bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24);

           // Jendela Waktu Adaptif (skala 0–200)
           let dateScore = 0;
           if (bankTgl === bkuTgl)        { dateScore = 200; }
           else if (diffDays <= 1)        { dateScore = 150; }
           else if (diffDays <= 3)        { dateScore = 130 - ((diffDays - 1) * 20); }
           else if (diffDays <= 7)        { dateScore = 60  - ((diffDays - 3) * 10); }
           else                           { dateScore = Math.max(-100, 10 - (diffDays * 5)); }

           // Tie-Breaker Uraian — bobot 4x lebih tinggi saat Strict Mode aktif
           const uraianScore = computeUraianScore(bankItem.deskripsi, bku.uraian, bku.bukti, isStrictMode);

           // Skor Nomor Bukti: PENDAPATAN pakai nomor_bukti, POTONGAN pakai nomor_sp2d sebagai bukti
           const nomorBuktiScore = (bku.source === 'PENDAPATAN' || bku.source === 'POTONGAN')
             ? computeNomorBuktiScore(bankItem, bku.bukti)
             : 0;

           // Skor OPD untuk POTONGAN: JKM/JKK banyak SP2D dengan nilai sama — pakai nama OPD di
           // deskripsi bank sebagai tiebreaker (misal "JKM08/LS GJP3KMAR26/BAPENDA" → "BAPENDA")
           let opdScore = 0;
           if (bku.source === 'POTONGAN' && bku.opd) {
             const bankDesc = (bankItem.deskripsi || '').toUpperCase();
             // Coba beberapa kata dari nama OPD (max 3 kata pertama, min 4 karakter)
             const opdWords = bku.opd.toUpperCase().split(/\s+/).filter(w => w.length >= 4);
             if (opdWords.some(w => bankDesc.includes(w))) opdScore = 120;
           }

           // Relaksasi Nilai Unik (0–30)
           const valueBonus = isUniqueValue(rawVal) ? 30 : 0;

           return { ...bku, totalConfidence: dateScore + uraianScore + valueBonus + nomorBuktiScore + opdScore, _uraianScore: uraianScore, _nomorBuktiScore: nomorBuktiScore, _opdScore: opdScore };
        })
        .sort((a, b) => b.totalConfidence - a.totalConfidence);

      const topMatch = candidates[0];
      if (!topMatch) continue;

      // ── STRICT MODE: Skip & Flag ──────────────────────────────────────────────
      // Jika ada banyak kandidat kembar DAN tidak ada sinyal identitas yang jelas,
      // sistem MENOLAK cocokkan daripada mengambil risiko salah pasang.
      // Sinyal diterima: uraian numerik (computeUraianScore) ATAU nomor_bukti (computeNomorBuktiScore).
      if (isStrictMode) {
        const runnerUp = candidates[1];
        const margin = runnerUp ? topMatch.totalConfidence - runnerUp.totalConfidence : Infinity;
        const hasStrongUraian  = topMatch._uraianScore >= STRICT_MIN_URAIAN_SCORE;
        const hasNomorBuktiHit = (topMatch._nomorBuktiScore || 0) >= 120; // partial atau exact
        const hasOpdHit        = (topMatch._opdScore || 0) >= 120;        // OPD match untuk POTONGAN
        const hasIdentitySignal = hasStrongUraian || hasNomorBuktiHit || hasOpdHit;
        const hasClearLead = margin >= STRICT_MIN_MARGIN;

        if (!hasIdentitySignal || !hasClearLead) {
          // Tandai di bank statement agar auditor tahu ada ambiguitas
          updateTasks.push(prisma.bank_statement.update({
            where: { id: bankItem.id },
            data: {
              catatan_selisih: `[PERLU MANUAL] ${activeDuplicates.length} kandidat kembar Rp ${new Intl.NumberFormat('id-ID').format(rawVal)} — uraian/nomor bukti tidak cukup jelas untuk pencocokan otomatis. (Skor: ${topMatch.totalConfidence} vs ${runnerUp?.totalConfidence ?? 'N/A'})`
            }
          }));
          console.log(`[STRICT SKIP] Bank #${bankItem.id} — margin=${margin}, uraianScore=${topMatch._uraianScore}, nomorBuktiScore=${topMatch._nomorBuktiScore || 0}. Ditandai PERLU MANUAL.`);
          continue; // Lewati, jangan cocokkan
        }

        console.log(`[STRICT MATCH ✓] Bank #${bankItem.id} — margin=${margin}, uraianScore=${topMatch._uraianScore}. Aman dicocokkan.`);
      }

      // Nilai 100% sama (valueMap) — cocokkan dengan kandidat terbaik
      const match = topMatch;

      if (match) {
        const val = Math.round(rawVal);
        const neto = Math.round(toNum(match.nilai));
        const bruto = Math.round(toNum(match.nilai_bruto));
        const closerIsBruto = Math.abs(bruto - val) < Math.abs(neto - val);
        const refAmount = closerIsBruto ? bruto : neto;
        const valDiff = val - refAmount;
        const absDiff = Math.abs(valDiff);
        
        const status_rekon = 'SUDAH';
        const targetId = match.id;

        // Tentukan match_type: SMART_BUKTI jika nomor_bukti pendapatan menjadi sinyal utama
        const isBuktiDriven = match.source === 'PENDAPATAN' && (match._nomorBuktiScore || 0) >= 120;
        const resolvedMatchType = isBuktiDriven ? 'SMART_BUKTI' : (closerIsBruto ? 'SMART_BRUTO' : 'SMART_AUTO');

        updateTasks.push(prisma.bank_statement.update({
          where: { id: bankItem.id },
          data: {
            is_matched: true,
            ref_bku_id: String(targetId),
            match_type: resolvedMatchType,
            selisih_nilai: absDiff > 0.01 ? valDiff : 0,
            catatan_selisih: absDiff > 0.01 ? `Selisih Rp ${new Intl.NumberFormat('id-ID').format(valDiff)}` : null
          }
        }));

        const finalUpdateData = {
          status_rekon: (closerIsBruto && match.tipe === 'KELUAR') ? 'SUDAH_BRUTO' : status_rekon,
          selisih_rekon: absDiff > 0.01 ? valDiff : 0,
          keterangan_rekon: absDiff > 0.01 ? buildCatatanSelisihRekon(bankItem, val, refAmount, valDiff) : `Auto-Matched to Bank @ ${bankItem.tanggal}`,
          tanggal_pencairan: bankDate
        };

        if (match.tipe === 'KELUAR') {
           updateTasks.push(prisma.data_sp2d.update({ where: { id: targetId }, data: finalUpdateData }));
           // Cascade SUDAH_BRUTO ke child potongan (pajak/iuran yg dibayar via e-billing)
           if (closerIsBruto) {
             const cascadeDate = String(bankItem.tanggal).slice(0, 10);
             updateTasks.push(cascadeSudahBrutoToPotongan(prisma, targetId, cascadeDate));
           }
        } else if (match.tipe === 'MASUK') {
           updateTasks.push(prisma.data_pendapatan.update({ where: { id: targetId }, data: finalUpdateData }));
        } else if (match.tipe === 'POTONGAN') {
           updateTasks.push(prisma.data_sp2d_potongan.update({ where: { id: targetId }, data: finalUpdateData }));
        } else if (match.tipe === 'PAJAK') {
           updateTasks.push(prisma.setoran_pajak.update({ where: { id: targetId }, data: finalUpdateData }));
        }

        // Fix Shallow Copy Bug: Tandai objek asli di potentialMatches agar tidak dicocokkan kembali
        const originalBku = potentialMatches.find(b => b.id === match.id);
        if (originalBku) {
          originalBku._isMatched = true;
        }
        match._isMatched = true;
        matchCount++;
      }

      // Update progress setiap 50 item bank
      if (idx % 50 === 0) {
        smartMatchProgress.current = idx;
        smartMatchProgress.message = `Menganalisa transaksi... (${idx}/${bankItems.length})`;
      }
    }


    // Execute updates in batches
    const BATCH_SIZE = 50;
    for (let i = 0; i < updateTasks.length; i += BATCH_SIZE) {
      await prisma.$transaction(updateTasks.slice(i, i + BATCH_SIZE));
      smartMatchProgress.success = Math.min(matchCount, Math.floor((i / updateTasks.length) * matchCount) + 1);
    }

    smartMatchProgress.status = 'done';
    smartMatchProgress.current = smartMatchProgress.total;
    smartMatchProgress.success = matchCount;
    smartMatchProgress.message = `Selesai! ${matchCount} transaksi berhasil dicocokkan secara akurat.`;

    setTimeout(() => {
      smartMatchProgress.isOpen = false;
      smartMatchProgress.status = 'idle';
    }, 5000);

    res.json({ message: `Smart Engine selesai. Berhasil mencocokkan ${matchCount} transaksi secara akurat.`, matchCount });
  } catch (err) {
    console.error('bulkMatchSmart error:', err);
    smartMatchProgress.status = 'error';
    smartMatchProgress.message = err.message;
    setTimeout(() => { smartMatchProgress.isOpen = false; }, 5000);
    res.status(500).json({ message: 'Gagal menjalankan Smart Engine', error: err.message });
  }
};

/**
 * Get Suggestions for Manual Reconciliation
 */
const getSuggestions = async (req, res) => {
  const { bankId } = req.params;
  const { bankIds } = req.query;
  
  try {
    // bank_statement.id adalah Int (autoincrement) — wajib parseInt, bukan string
    const ids = (bankIds ? bankIds.split(',') : [bankId])
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id));

    if (ids.length === 0) {
      return res.status(400).json({ message: 'ID bank tidak valid atau tidak diberikan' });
    }

    const bankItems = await prisma.bank_statement.findMany({ where: { id: { in: ids } } });

    if (bankItems.length === 0) {
      console.warn(`[SUGGEST] bankId="${bankId}", bankIds="${bankIds}" → TIDAK DITEMUKAN di database.`);
      return res.status(404).json({ message: 'Bank items not found' });
    }

    // WIT-Safe Date: gunakan fmtDateWIT (offset +9 jam) agar tanggal tidak bergeser H-1
    // saat bank CSV diimpor dengan timestamp WIT yang disimpan sebagai UTC.
    const bankDateStr = fmtDateWIT(bankItems[0].tanggal) || fmtDate(bankItems[0].tanggal);
    const bankDate = toNativeDate(bankDateStr);
    
    // [FIX] Gunakan nilai absolut untuk pencarian nominal
    const totalVal = bankItems.reduce((sum, item) => sum + Math.abs(Number(item.debet) || Number(item.kredit)), 0);
    const isOut = bankItems.some(item => Number(item.debet) > 0);

    // ── DIAGNOSTIK ─────────────────────────────────────────────────────────────
    console.log(`[SUGGEST] bankId="${bankId}" | ids=[${ids}] | totalVal=${totalVal} | isOut=${isOut} | bankDateStr="${bankDateStr}"`);


    // [ARAH TRANSAKSI] SP2D hanya untuk PENGELUARAN (debet). PENERIMAAN (kredit) → pendapatan saja.
    // [KUNCI DATA] Query SP2D - hanya kandidat yang BENAR-BENAR belum cocok
    const sp2dCandidates = isOut ? await prisma.$queryRaw`
      SELECT 
        CAST(h.id AS VARCHAR) as id,
        h.nomor as bukti,
        h.uraian,
        CAST(h.nilai_bruto - h.nilai_potongan AS DECIMAL) as nilai_neto_gelondongan,
        CAST(h.nilai_bruto - COALESCE(
          (SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
          h.nilai_potongan
        ) AS DECIMAL) as nilai_neto_rincian,
        CAST(h.nilai_potongan AS DECIMAL) as nilai_potongan_gelondongan,
        CAST(COALESCE(
          (SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
          h.nilai_potongan
        ) AS DECIMAL) as nilai_potongan_rincian,
        CAST(h.nilai_bruto AS DECIMAL) as nilai_bruto,
        h.tanggal,
        h.opd,
        'KELUAR' as tipe,
        h.status_rekon
      FROM data_sp2d h
      WHERE (
        -- [TOLERANCE] Izinkan selisih hingga 10% atau Maks Rp 1 Juta agar "Close Match" muncul
        ABS(CAST(h.nilai_bruto AS DECIMAL) - ${totalVal}) <= GREATEST(${totalVal} * 0.1, 1000000)
      )
      AND COALESCE(UPPER(TRIM(h.status_rekon)), '') NOT LIKE '%SUDAH%'
      -- Double-Lock: eksklusi item BKU yang sudah terlink ke mutasi bank mana pun (termasuk draf)
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement bx
        WHERE TRIM(bx.ref_bku_id) = TRIM(CAST(h.id AS VARCHAR))
      )
      -- [LOOSE] Jendela tanggal diperlebar H-1 s/d H+30
      AND CAST(COALESCE(h.tanggal_pencairan, h.tanggal) AS DATE)
          BETWEEN (CAST(${bankDateStr} AS DATE) - INTERVAL '1 day')
          AND     (CAST(${bankDateStr} AS DATE) + INTERVAL '30 days')
      ORDER BY ABS(ROUND(CAST(h.nilai_bruto - COALESCE(
        (SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
        h.nilai_potongan
      ) AS DECIMAL)) - ROUND(${totalVal})) ASC
    ` : [];
    console.log(`[SUGGEST] sp2dCandidates: ${sp2dCandidates.length}`);

    // [ARAH TRANSAKSI] Potongan hanya untuk PENGELUARAN (debet).
    // [KUNCI DATA] Query Potongan - hanya yang benar-benar BELUM rekon
    const potonganCandidates = isOut ? await prisma.$queryRaw`
      SELECT 
        CAST(p.id AS VARCHAR) as id,
        p.nomor_sp2d as bukti,
        p.uraian,
        CAST(p.nilai AS DECIMAL) as nilai_neto,
        CAST(p.nilai AS DECIMAL) as nilai_bruto,
        COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal,
        p.opd,
        'POTONGAN' as tipe,
        p.status_rekon
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      WHERE (
        -- [TOLERANCE] Izinkan selisih hingga 10% atau Maks Rp 1 Juta
        ABS(CAST(p.nilai AS DECIMAL) - ${totalVal}) <= GREATEST(${totalVal} * 0.1, 1000000)
      )
      AND COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%'
      -- Double-Lock: eksklusi item BKU yang sudah terlink ke mutasi bank mana pun (termasuk draf)
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement bx
        WHERE TRIM(bx.ref_bku_id) = TRIM(CAST(p.id AS VARCHAR))
      )
      -- [LOOSE] Jendela tanggal H-1 s/d H+30
      AND CAST(COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) AS DATE)
          BETWEEN (CAST(${bankDateStr} AS DATE) - INTERVAL '1 day')
          AND     (CAST(${bankDateStr} AS DATE) + INTERVAL '30 days')
      ORDER BY ABS(ROUND(CAST(p.nilai AS DECIMAL)) - ROUND(${totalVal})) ASC
    ` : [];
    console.log(`[SUGGEST] potonganCandidates: ${potonganCandidates.length}`);

    // [ARAH TRANSAKSI] Pajak hanya untuk PENGELUARAN (debet).
    // [KUNCI DATA] Query Pajak - dengan double-guard: status + referensi bank + bukan rincian SP2D
    const pajakCandidates = isOut ? await prisma.$queryRaw`
      SELECT 
        CAST(s.id AS VARCHAR) as id,
        s.nomor_bukti as bukti,
        s.uraian,
        CAST(s.nilai AS DECIMAL) as nilai_neto,
        CAST(s.nilai AS DECIMAL) as nilai_bruto,
        COALESCE(s.tanggal_pencairan, s.tanggal) as tanggal,
        s.opd,
        'PAJAK' as tipe,
        s.status_rekon
      FROM setoran_pajak s
      WHERE (
        -- [TOLERANCE] Izinkan selisih hingga 10% atau Maks Rp 1 Juta
        ABS(CAST(s.nilai AS DECIMAL) - ${totalVal}) <= GREATEST(${totalVal} * 0.1, 1000000)
      )
      AND COALESCE(UPPER(TRIM(s.status_rekon)), '') NOT LIKE '%SUDAH%'
      AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
      -- Double-Lock: eksklusi item BKU yang sudah terlink ke mutasi bank mana pun (termasuk draf)
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement bx
        WHERE TRIM(bx.ref_bku_id) = TRIM(CAST(s.id AS VARCHAR))
      )
      -- Jendela tanggal H-1 s/d H+7 (pajak biasanya tepat waktu)
      AND CAST(COALESCE(s.tanggal_pencairan, s.tanggal) AS DATE)
          BETWEEN (CAST(${bankDateStr} AS DATE) - INTERVAL '1 day')
          AND     (CAST(${bankDateStr} AS DATE) + INTERVAL '7 days')
      ORDER BY ABS(ROUND(CAST(s.nilai AS DECIMAL)) - ROUND(${totalVal})) ASC
    ` : [];
    console.log(`[SUGGEST] pajakCandidates: ${pajakCandidates.length}`);

    // [KUNCI DATA] Query Pendapatan - hanya jika transaksi bank adalah penerimaan (kredit)
    const pendapatanCandidates = !isOut ? await prisma.$queryRaw`
      SELECT 
        CAST(p.id AS VARCHAR) as id,
        p.nomor_bukti as bukti,
        p.uraian,
        CAST(p.nilai AS DECIMAL) as nilai_neto,
        CAST(p.nilai AS DECIMAL) as nilai_bruto,
        p.tanggal,
        '' as opd,
        'MASUK' as tipe,
        p.status_rekon
      FROM data_pendapatan p
      -- Poin 3a: status wajib BELUM atau NULL — cek SUDAH di posisi mana pun (TRIM + %SUDAH%)
      WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%'
      -- Poin 3b: Double-Lock — eksklusi item yang sudah terlink ke mutasi bank mana pun (termasuk draf)
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement bx
        WHERE TRIM(bx.ref_bku_id) = TRIM(CAST(p.id AS VARCHAR))
      )
      -- Poin 2: Zero Tolerance — nilai wajib sama persis hingga sen (selisih < Rp 1)
      AND ABS(CAST(p.nilai AS DECIMAL) - ${totalVal}) < 1
      -- Poin 1: Jendela Tanggal Super Ketat H-1 s/d H+1
      AND CAST(p.tanggal AS DATE) BETWEEN (CAST(${bankDateStr} AS DATE) - INTERVAL '1 day') AND (CAST(${bankDateStr} AS DATE) + INTERVAL '1 day')
      ORDER BY ABS(CAST(p.nilai AS DECIMAL) - ${totalVal}) ASC
    ` : [];
    console.log(`[SUGGEST] pendapatanCandidates: ${Array.isArray(pendapatanCandidates) ? pendapatanCandidates.length : 0} (isOut=${isOut})`);

    const toNumber = (v) => { const n = Number(v?.toString()); return isNaN(n) ? 0 : n; };

    const allCandidates = [...sp2dCandidates, ...potonganCandidates, ...pajakCandidates, ...pendapatanCandidates]
      .map(c => {
        const neto = toNumber(c.nilai_neto_gelondongan || c.nilai_neto_rincian || c.nilai_neto);
        const bruto = toNumber(c.nilai_bruto);
        const selisihNeto = Math.abs(neto - totalVal);
        const selisihBruto = Math.abs(bruto - totalVal);
        const bestSelisih = Math.min(selisihNeto, selisihBruto);
        const matchMode = selisihNeto <= selisihBruto ? 'neto' : 'bruto';
        // Pure Date: strip time component agar perbandingan hari tidak bergeser TZ
        const bkuTgl = fmtDate(c.tanggal);
        const candDate = toNativeDate(bkuTgl);
        const dateDiff = Math.abs(bankDate.getTime() - candDate.getTime());

        // Internal Integrity Check
        const potGelondongan = toNumber(c.nilai_potongan_gelondongan);
        const potRincian = toNumber(c.nilai_potongan_rincian);
        const integrityMismatch = c.tipe === 'KELUAR' && Math.abs(potGelondongan - potRincian) > 1 && c.status_rekon !== 'SUDAH_BRUTO';

        const bankTgl = bankDateStr;
        const diffDays = dateDiff / (1000 * 3600 * 24);

        // Skor Tanggal: same-day > dekat hari > jauh hari (skala 0-200)
        let dateScore = 0;
        if (bankTgl === bkuTgl) {
          dateScore = 200;
        } else if (diffDays <= 1) {
          dateScore = 150;
        } else if (diffDays <= 3) {
          dateScore = 130 - ((diffDays - 1) * 20); // H+2=110, H+3=90
        } else if (diffDays <= 7) {
          dateScore = 60  - ((diffDays - 3) * 10);  // H+4=50 .. H+7=20
        } else {
          dateScore = Math.max(-100, 10 - (diffDays * 5));
        }

        // Skor Uraian: cocokkan token numerik dari uraian/bukti BKU (skala 0-80)
        const bankDescAll = bankItems.map(b => b.deskripsi).join(' ');
        const uraianScore = computeUraianScore(bankDescAll, c.uraian, c.bukti);

        // Skor Nomor Bukti: khusus pendapatan — cek semua bankItem dalam grup, ambil skor tertinggi
        const nomorBuktiScore = (c.tipe === 'MASUK')
          ? Math.max(...bankItems.map(bi => computeNomorBuktiScore(bi, c.bukti)))
          : 0;

        // Skor Kedekatan Nilai: semakin kecil selisih, semakin tinggi skor (skala 0-100)
        // Ini memastikan EXACT match selalu unggul di atas CLOSE match
        const valueProximity = bestSelisih < 1 ? 100 : Math.max(0, 100 - Math.round((bestSelisih / totalVal) * 1000));

        // Fast Track Penerimaan: nilai & tanggal sama persis → skor prioritas tertinggi
        // nomorBuktiScore ditambahkan sebagai bonus identitas di atas fast track
        const isFastTrackIncome = (c.tipe === 'MASUK') && (bankTgl === bkuTgl) && (bestSelisih < 1);
        const totalConfidence = isFastTrackIncome
          ? 500 + nomorBuktiScore
          : dateScore + uraianScore + valueProximity + nomorBuktiScore;

        return {
          ...c,
          is_fast_track: isFastTrackIncome,
          nilai_neto: neto,
          nilai_bruto: bruto,
          selisih: bestSelisih,
          match_mode: matchMode,
          date_diff: dateDiff,
          is_exact: bestSelisih < 1,
          integrity_mismatch: integrityMismatch,
          potongan_gelondongan: potGelondongan,
          potongan_rincian: potRincian,
          totalConfidence: Math.round(totalConfidence),
          suggestion_type: bestSelisih < 1 ? 'EXACT' : 'CLOSE'
        };
      })
      .sort((a, b) => {
        // Prioritas ranking:
        // 1. EXACT selalu di atas CLOSE
        // 2. totalConfidence (date + uraian + value proximity) terbesar
        // 3. Tiebreaker: selisih nilai terkecil
        if (a.is_exact !== b.is_exact) return a.is_exact ? -1 : 1;
        if (Math.abs(a.totalConfidence - b.totalConfidence) > 5) return b.totalConfidence - a.totalConfidence;
        return a.selisih - b.selisih;
      });

    // Post-filter agresif: hanya tampilkan yang belum dicocokkan
    // JS Triple-Check: filter defensif setelah SQL — tangkap semua edge case
    // NULL dianggap BELUM; cek kata SUDAH di posisi MANA PUN (termasuk 'sudah', ' SUDAH ', 'SELESAI/SUDAH')
    const filteredCandidates = allCandidates.filter(c => {
      const s = String(c.status_rekon ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
      return !s.includes('SUDAH');
    });

    const totalCandidates = filteredCandidates.length;

    console.log(`[SUGGEST] allCandidates=${allCandidates.length} → filtered=${totalCandidates} (unlimited)`);

    res.json({
      data: filteredCandidates,
      totalCandidates,
      isTruncated: false,
      totalBankValue: totalVal,
      itemCount: bankItems.length
    });
  } catch (err) {
    console.error('getSuggestions error:', err);
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Match Multiple Bank Items to One BKU
 */
const matchMultiple = async (req, res) => {
  const { bankIds, bkuId, keterangan_admin } = req.body;
  if (!bankIds || !Array.isArray(bankIds) || !bkuId) {
    return res.status(400).json({ message: 'Bank IDs (array) and BKU ID are required' });
  }

  try {
    const results = await prisma.bank_statement.updateMany({
      where: { id: { in: bankIds.map(id => parseInt(id)) } },
      data: {
        is_matched: true,
        ref_bku_id: String(bkuId),
        match_type: 'MULTI',
        catatan_selisih: keterangan_admin ? `Catatan: ${keterangan_admin}` : null,
      }
    });

    // Update status_rekon on whichever table it belongs to
    // For multiple match, we mark all bank items as matched and the BKU item as matched
    // We should ideally calculate the diff here too
    const bankItems = await prisma.bank_statement.findMany({ where: { id: { in: bankIds.map(id => parseInt(id)) } } });
    const totalBankVal = bankItems.reduce((sum, item) => sum + (Number(item.debet) || Number(item.kredit)), 0);
    
    // Fetch BKU value (semua tipe baris BKU yang bisa di-multi-match)
    let bkuVal = 0;
    const idStr = String(bkuId);
    const sp2d = await prisma.data_sp2d.findUnique({ where: { id: idStr } });
    if (sp2d) {
      const potSum = await prisma.data_sp2d_potongan.aggregate({ where: { id_sp2d: sp2d.id }, _sum: { nilai: true } });
      bkuVal = Number(sp2d.nilai_bruto) - Number(potSum._sum.nilai || 0);
    }
    else {
      const pnd = await prisma.data_pendapatan.findUnique({ where: { id: idStr } });
      if (pnd) bkuVal = Number(pnd.nilai);
      else {
        const pot = await prisma.data_sp2d_potongan.findUnique({ where: { id: idStr } });
        if (pot) bkuVal = Number(pot.nilai || 0);
        else {
          const sjk = await prisma.setoran_pajak.findUnique({ where: { id: idStr } });
          if (sjk) bkuVal = Number(sjk.nilai || 0);
        }
      }
    }

    const diff = Math.round(totalBankVal) - Math.round(bkuVal);
    const absDiff = Math.abs(diff);
    // [2026-05-16] Hanya 2 status: SUDAH atau BELUM — tidak ada ANOMALI
    const status_rekon = 'SUDAH';

    const syntheticBank =
      bankItems.length === 1
        ? bankItems[0]
        : {
            tanggal: bankItems[0]?.tanggal,
            deskripsi: `Gabungan ${bankItems.length} mutasi bank (ID: ${bankIds.join(',')}). ${bankItems
              .map((b) => String(b.deskripsi || '').slice(0, 50))
              .join(' | ')}`.slice(0, 500),
          };

    await applyBkuRekonCatatanSelisih({
      bkuId: idStr,
      bankItem: syntheticBank,
      bankAmount: totalBankVal,
      bkuAmount: bkuVal,
      diff,
      absDiff,
      status_rekon,
      sp2dRow: sp2d,
      keterangan_admin
    });

    res.json({ message: 'Transactions matched successfully', matchedCount: results.count, status: status_rekon });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Mengimpor data Bank dari JSON
 */
const importBankData = async (req, res) => {
  const { data } = req.body;
  if (!data || !Array.isArray(data)) return res.status(400).json({ message: 'Data tidak valid' });

  try {
    // 1. Fetch existing for deduplication
    const existing = await prisma.bank_statement.findMany({
      select: { tanggal: true, deskripsi: true, saldo_akhir: true },
      where: {
        tanggal: { gte: new Date(new Date().getFullYear(), new Date().getMonth() - 6, 1) }
      }
    });

    const existingSet = new Set(existing.map(e => 
      `${fmtDate(e.tanggal)}_${String(e.deskripsi || '').trim()}_${Number(e.saldo_akhir).toFixed(2)}`
    ));

    const toCreate = [];
    for (const item of data) {
      const dateObj = parseDateSafe(item.TANGGAL);
      if (isNaN(dateObj.getTime())) continue;

      const dateStr = fmtDate(dateObj);
      const desc = String(item.URAIAN || '').replace(/[^\x20-\x7E]/g, '').trim(); // Remove non-printable chars
      const saldo = Number(item.SALDO || 0);
      const key = `${dateStr}_${desc}_${saldo.toFixed(2)}`;

      if (!existingSet.has(key)) {
        const debet = Number(item.PENGELUARAN || 0);
        const kredit = Number(item.PENERIMAAN || 0);

        // Ensure all numbers are valid finite numbers
        if (Number.isFinite(debet) && Number.isFinite(kredit) && Number.isFinite(saldo)) {
          toCreate.push({
            tanggal: dateObj,
            nomor_bukti: String(item.NOMOR_BUKTI || '').trim().substring(0, 100) || null,
            deskripsi: desc.substring(0, 500) || 'Transaksi Bank',
            debet: debet,
            kredit: kredit,
            saldo_akhir: saldo,
            is_matched: false
          });
          existingSet.add(key);
        }
      }
    }

    let successCount = 0;
    if (toCreate.length > 0) {
      // Chunk into 500 rows per batch
      for (let i = 0; i < toCreate.length; i += 500) {
        const batch = toCreate.slice(i, i + 500);
        await prisma.bank_statement.createMany({
          data: batch,
          skipDuplicates: true
        });
        successCount += batch.length;
      }
    }

    res.json({ message: 'Import selesai', importedCount: successCount });
  } catch (err) {
    console.error('[IMPORT FINAL ERROR]', err);
    res.status(500).json({ 
      message: 'Gagal memproses data bank. Silakan periksa format angka di Excel Anda.', 
      error: err.message 
    });
  }
};

/**
 * Membatalkan pencocokan
 */
const undoMatch = async (req, res) => {
  const { id } = req.params;
  try {
    await performUnmatch([parseInt(id)]);
    res.json({ message: 'Pencocokan dibatalkan (Unmatch success)' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Batch Unmatch
 */
const undoMatchBatch = async (req, res) => {
  const { ids } = req.body; // Array of bank statement IDs
  if (!ids || !Array.isArray(ids)) return res.status(400).json({ message: 'IDs array is required' });
  
  try {
    await performUnmatch(ids.map(id => parseInt(id)));
    res.json({ message: `Berhasil membatalkan ${ids.length} pencocokan.` });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

// Helper for unmatching
async function performUnmatch(bankIds) {
  const bankItems = await prisma.bank_statement.findMany({
    where: { id: { in: bankIds } }
  });

  const bkuRefs = [...new Set(bankItems.filter(b => b.ref_bku_id).map(b => String(b.ref_bku_id)))];

  // Bungkus semua write dalam satu transaksi atomik:
  // Jika reset bank_statement gagal setelah BKU di-reset, state akan inkonsisten
  // (BKU=BELUM tapi bank masih is_matched=true) → lebih parah dari Ghost Match.
  await prisma.$transaction(async (tx) => {
    if (bkuRefs.length > 0) {
      // Saat unmatch: reset status rekon tapi JANGAN hapus tanggal_pencairan.
      // tanggal_pencairan bisa berasal dari input SIPD manual — menghapusnya menyebabkan hilangnya data valid.
      // Potongan juga tidak dihapus tanggal_pencairan-nya karena bisa punya tanggal terpisah.
      const dataResetStatus   = { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null };
      const dataResetPotongan = { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null };

      // [ATURAN C.1 — INDEPENDENSI POTONGAN]
      // Hanya reset record yang langsung di-unlink via ref_bku_id (cocok persis dengan ID bank yang di-unmatch).
      // DILARANG cascade reset semua potongan by nomor_sp2d — mekanisme itu adalah akar 2.086 Ghost Match Mei 2026.
      // Potongan yang punya pasangan bank statement sendiri wajib di-unmatch via aksi eksplisit pada record itu.
      for (const refId of bkuRefs) {
        await Promise.all([
          tx.data_sp2d.updateMany({ where: { id: refId }, data: dataResetStatus }),
          tx.data_pendapatan.updateMany({ where: { id: refId }, data: dataResetStatus }),
          tx.data_sp2d_potongan.updateMany({ where: { id: refId }, data: dataResetPotongan }),
          tx.setoran_pajak.updateMany({ where: { id: refId }, data: dataResetPotongan }),
        ]);
      }
    }

    await tx.bank_statement.updateMany({
      where: { id: { in: bankIds } },
      data: {
        is_matched: false,
        ref_bku_id: null,
        match_type: null,
        selisih_nilai: 0,
        catatan_selisih: null
      }
    });
  });
}

/**
 * Bulk Match by exact value or Reference Number
 */
const bulkMatchByValue = async (req, res) => {
  const { bkuIds, bankIds, referenceNumber, keterangan } = req.body;

  try {
    // Scenario 1: Reference Number based matching (Smart Linking)
    if (referenceNumber) {
      const ref = String(referenceNumber).trim();
      
      // Find all bank statements with this reference in description
      const bankItems = await prisma.bank_statement.findMany({
        where: { 
          is_matched: false,
          deskripsi: { contains: ref, mode: 'insensitive' }
        }
      });

      if (bankItems.length === 0) {
        return res.status(404).json({ message: `Tidak ditemukan mutasi bank dengan referensi "${ref}"` });
      }

      // Find all BKU candidates with this reference number
      const [sp2d, pendapatan, potongan, pajak] = await Promise.all([
        prisma.data_sp2d.findMany({ where: { nomor: { contains: ref, mode: 'insensitive' }, status_rekon: 'BELUM' } }),
        prisma.data_pendapatan.findMany({ where: { nomor_bukti: { contains: ref, mode: 'insensitive' }, status_rekon: 'BELUM' } }),
        prisma.data_sp2d_potongan.findMany({ where: { nomor_sp2d: { contains: ref, mode: 'insensitive' }, status_rekon: 'BELUM' } }),
        prisma.setoran_pajak.findMany({ where: { nomor_bukti: { contains: ref, mode: 'insensitive' }, status_rekon: 'BELUM' } })
      ]);

      const bkuCount = sp2d.length + pendapatan.length + potongan.length + pajak.length;
      if (bkuCount === 0) {
        return res.status(404).json({ message: `Tidak ditemukan data BKU dengan referensi "${ref}"` });
      }

      const firstBkuId = sp2d[0]?.id || pendapatan[0]?.id || potongan[0]?.id || pajak[0]?.id;

      // Update Bank
      await prisma.bank_statement.updateMany({
        where: { id: { in: bankItems.map(b => b.id) } },
        data: {
          is_matched: true,
          ref_bku_id: String(firstBkuId),
          match_type: 'REFERENCE',
          catatan_selisih: `Matched by Ref: ${ref}`
        }
      });

      // Guard: hanya update BKU yang masih BELUM — mencegah override record yang sudah ter-match
      const updateData = { status_rekon: 'SUDAH', selisih_rekon: 0, keterangan_rekon: `Matched by Ref: ${ref}` };
      const belumFilter = { OR: [{ status_rekon: 'BELUM' }, { status_rekon: null }, { status_rekon: '' }] };
      await Promise.all([
        prisma.data_sp2d.updateMany({ where: { nomor: { contains: ref, mode: 'insensitive' }, ...belumFilter }, data: updateData }),
        prisma.data_pendapatan.updateMany({ where: { nomor_bukti: { contains: ref, mode: 'insensitive' }, ...belumFilter }, data: updateData }),
        prisma.data_sp2d_potongan.updateMany({ where: { nomor_sp2d: { contains: ref, mode: 'insensitive' }, ...belumFilter }, data: updateData }),
        prisma.setoran_pajak.updateMany({ where: { nomor_bukti: { contains: ref, mode: 'insensitive' }, ...belumFilter }, data: updateData })
      ]);

      return res.json({ message: `Berhasil mencocokkan ${bankItems.length} mutasi dengan ${bkuCount} data BKU menggunakan referensi "${ref}"` });
    }

    // Scenario 2: Batch ID matching
    if (!bkuIds || !bankIds || !Array.isArray(bkuIds) || !Array.isArray(bankIds)) {
       return res.status(400).json({ message: 'bkuIds and bankIds arrays are required' });
    }

    // Logic: If multiple BKU match multiple Bank, we link them all to the first BKU or create a group
    // In this system, we usually link bank statements to a BKU ID.
    // If multiple BKU are involved, we might need a more complex schema, 
    // but typically it's 1 BKU to N Bank or vice versa.
    
    // For simplicity, if multiple BKU are selected, we will process them one by one if they match 1:1 
    // or group them if the user explicitly says they are a set.
    
    // USER REQUEST: "Pencocokan bisa dilakukan secara masal dengan syarat memiliki nilai yang sama persis"
    // If sum(BKU) == sum(Bank), we match.
    
    // We will use the first BKU ID as the primary reference if multiple Bank items match.
    // If multiple BKU match, it's better to match them individually or provide a "Group ID".
    // Currently, ref_bku_id is a single string.
    
    const targetBkuId = String(bkuIds[0]);

    const finalKeterangan = keterangan ? `Bulk Match: ${keterangan}` : 'Bulk Match';

    await prisma.bank_statement.updateMany({
      where: { id: { in: bankIds.map(id => parseInt(id)) } },
      data: {
        is_matched: true,
        ref_bku_id: targetBkuId,
        match_type: bankIds.length > 1 ? 'MULTI' : 'INDIVIDUAL',
        catatan_selisih: finalKeterangan
      }
    });

    const updateData = { status_rekon: 'SUDAH', selisih_rekon: 0, keterangan_rekon: finalKeterangan };
    await Promise.all(bkuIds.map(id => {
       const sid = String(id);
       return Promise.all([
         prisma.data_sp2d.updateMany({ where: { id: sid }, data: updateData }).catch(() => {}),
         prisma.data_pendapatan.updateMany({ where: { id: sid }, data: updateData }).catch(() => {}),
         prisma.data_sp2d_potongan.updateMany({ where: { id: sid }, data: updateData }).catch(() => {}),
         prisma.setoran_pajak.updateMany({ where: { id: sid }, data: updateData }).catch(() => {})
       ]);
    }));

    res.json({ message: 'Bulk match success' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Mendapatkan Daftar Lengkap Rekening Koran
 */
const getBankStatements = async (req, res) => {
  const { page = 1, limit = 10, search, is_matched, startDate, endDate } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const take = parseInt(limit);

  try {
    const where = {};
    if (search) where.deskripsi = { contains: search, mode: 'insensitive' };
    if (is_matched !== undefined && is_matched !== '') where.is_matched = is_matched === 'true';
    if (startDate && endDate) {
      where.tanggal = {
        gte: parseDateSafe(startDate),
        lte: parseDateSafe(endDate)
      };
    }

    const [data, total, summary] = await Promise.all([
      prisma.bank_statement.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
        skip,
        take
      }),
      prisma.bank_statement.count({ where }),
      prisma.bank_statement.aggregate({
        where,
        _sum: { debet: true, kredit: true },
        _count: { id: true }
      })
    ]);

    // Get last balance for summary
    const lastItem = await prisma.bank_statement.findFirst({
      orderBy: [{ tanggal: 'desc' }, { id: 'desc' }]
    });

    res.json({
      data,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / take),
      summary: {
        totalDebet: Number(summary._sum.debet || 0),
        totalKredit: Number(summary._sum.kredit || 0),
        totalItems: summary._count.id,
        lastBalance: Number(lastItem?.saldo_akhir || 0)
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Menghapus Item Rekening Koran
 */
const deleteBankItem = async (req, res) => {
  const { id } = req.params;
  try {
    const bankItem = await prisma.bank_statement.findUnique({ where: { id: parseInt(id) } });
    
    if (bankItem && bankItem.ref_bku_id) {
       const refId = String(bankItem.ref_bku_id);
       const resetData = { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null };
       await Promise.all([
         prisma.data_sp2d.updateMany({ where: { id: refId }, data: resetData }).catch(() => {}),
         prisma.data_pendapatan.updateMany({ where: { id: refId }, data: resetData }).catch(() => {}),
         prisma.data_sp2d_potongan.updateMany({ where: { id: refId }, data: resetData }).catch(() => {}),
         prisma.setoran_pajak.updateMany({ where: { id: refId }, data: resetData }).catch(() => {})
       ]);
    }

    await prisma.bank_statement.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'Item rekening koran berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Menghapus Item Rekening Koran Berdasarkan Rentang Tanggal
 */
const deleteBankByDateRange = async (req, res) => {
  const { startDate, endDate } = req.body;
  
  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'Tanggal awal dan tanggal akhir wajib diisi' });
  }

  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Set jam ke 23:59:59 untuk hari terakhir agar mencakup seluruh hari itu
    end.setUTCHours(23, 59, 59, 999);

    // 1. Cari bank statement yang akan dihapus dan memiliki relasi rekon
    const bankItems = await prisma.bank_statement.findMany({
      where: {
        tanggal: {
          gte: start,
          lte: end
        },
        ref_bku_id: { not: null }
      },
      select: { ref_bku_id: true }
    });

    const refIds = bankItems.map(b => String(b.ref_bku_id));

    // 2. Jika ada data rekon, reset dulu status rekonnya di modul Buku (SP2D, Pendapatan, Pajak, dll)
    if (refIds.length > 0) {
      const resetData = { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null };
      await Promise.all([
        prisma.data_sp2d.updateMany({ where: { id: { in: refIds } }, data: resetData }),
        prisma.data_pendapatan.updateMany({ where: { id: { in: refIds } }, data: resetData }),
        prisma.data_sp2d_potongan.updateMany({ where: { id: { in: refIds } }, data: resetData }),
        prisma.setoran_pajak.updateMany({ where: { id: { in: refIds } }, data: resetData })
      ]);
    }

    // 3. Hapus data bank statement dalam rentang tanggal tersebut
    const deleteResult = await prisma.bank_statement.deleteMany({
      where: {
        tanggal: {
          gte: start,
          lte: end
        }
      }
    });

    // 4. Catat aktivitas ke log log_aktivitas
    await prisma.log_aktivitas.create({
      data: {
        user_pelaksana: req.user?.username || req.user?.email || 'SYSTEM',
        aksi: 'HAPUS_BANK_RENTANG',
        detail: `Hapus rekening koran rentang ${startDate} s/d ${endDate}: ${deleteResult.count} record dihapus.`
      }
    }).catch(() => {});

    res.json({ 
      message: `Berhasil menghapus ${deleteResult.count} data rekening koran dalam rentang tanggal tersebut.`,
      count: deleteResult.count
    });

  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Deteksi Anomali Integritas Data (Rekon vs Buku)
 */
const getAnomalies = async (req, res) => {
  console.log(`[DEBUG RECON CONTROLLER] getAnomalies entered with params:`, req.query);
  const { tahun, bulan, all } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();
  const targetBulan = bulan ? parseInt(bulan) : null;
  const limit = all === 'true' ? 5000 : 100; // Increase limit for export

  try {
    console.log(`[DEBUG] getAnomalies called with tahun=${tahun}, bulan=${bulan}, all=${all}`);
    // Construct Date Filter for month if applicable
    let dateFilter = {};
    if (targetBulan) {
      // Pillar 1: Date.UTC agar tidak bergantung timezone server
      dateFilter = {
        gte: new Date(Date.UTC(targetTahun, targetBulan - 1, 1, 0, 0, 0)),
        lt: new Date(Date.UTC(targetTahun, targetBulan, 1, 0, 0, 0))
      };
    }

    // 1. SP2D Belum Rekon
    // OR condition: SP2D cair di bulan tsb, ATAU SP2D terbit di bulan tsb tapi tanggal_pencairan masih null (belum cair = anomali terpenting)
    const sp2dWhere = {
      tahun: targetTahun,
      status_rekon: 'BELUM',
      ...(targetBulan ? {
        OR: [
          { tanggal_pencairan: dateFilter },
          { tanggal_pencairan: null, tanggal: dateFilter }
        ]
      } : {})
    };

    let unmatchedSP2D = [], totalUnmatchedSP2D = 0;
    try {
      const [resData, resCount] = await Promise.all([
        prisma.data_sp2d.findMany({
          where: sp2dWhere,
          select: { 
            id: true, nomor: true, tanggal: true, tanggal_pencairan: true, 
            opd: true, uraian: true, nilai_neto: true,
            selisih_rekon: true, keterangan_rekon: true
          },
          orderBy: { tanggal_pencairan: 'desc' },
          take: limit
        }),
        prisma.data_sp2d.count({ where: sp2dWhere })
      ]);
      unmatchedSP2D = resData;
      totalUnmatchedSP2D = resCount;
    } catch (e) {
      console.error('[ERROR QUERY 1 SP2D]', e);
      throw new Error(`Gagal query SP2D: ${e.message}`);
    }

    // 2. Pendapatan Belum Rekon
    let unmatchedPendapatan = [], totalUnmatchedPendapatan = 0;
    try {
      unmatchedPendapatan = await prisma.$queryRawUnsafe(`
        SELECT p.id::text as id, p.tanggal, p.nomor_bukti, p.uraian, p.nilai::numeric, p.id_sumber_dana, 'PENDAPATAN' as tipe,
               p.status_rekon, COALESCE(p.selisih_rekon, 0)::numeric as selisih_rekon, p.keterangan_rekon
        FROM data_pendapatan p
        LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
        WHERE p.tahun = ${targetTahun} ${targetBulan ? `AND EXTRACT(MONTH FROM p.tanggal) = ${targetBulan}` : ''}
        AND (
          (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL OR p.status_rekon = '') AND b.id IS NULL
          OR (p.status_rekon = 'SUDAH' AND b.id IS NULL)
          OR ABS(COALESCE(p.selisih_rekon, 0)) > 1
        )
        ORDER BY tanggal DESC
        LIMIT ${limit}
      `);

      const countPendapatan = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as count
        FROM data_pendapatan p
        LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
        WHERE p.tahun = ${targetTahun} ${targetBulan ? `AND EXTRACT(MONTH FROM p.tanggal) = ${targetBulan}` : ''}
        AND (
          (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL OR p.status_rekon = '') AND b.id IS NULL
          OR (p.status_rekon = 'SUDAH' AND b.id IS NULL)
          OR ABS(COALESCE(p.selisih_rekon, 0)) > 1
        )
      `);
      totalUnmatchedPendapatan = countPendapatan[0]?.count || 0;
    } catch (e) {
      console.error('[ERROR QUERY 2 PENDAPATAN]', e);
      throw new Error(`Gagal query Pendapatan: ${e.message}`);
    }

    // 3. Potongan Belum Rekon / Selisih Nominal / Ghost Matches
    let unmatchedPotongan = [], totalUnmatchedPotongan = 0;
    try {
      unmatchedPotongan = await prisma.$queryRawUnsafe(`
      SELECT
        p.id::text as id,
        CAST(COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal) AS DATE) as tanggal,
        p.nomor_sp2d as nomor_bukti, p.uraian, p.nilai::numeric, p.id_sumber_dana, 'SELISIH_POTONGAN' as tipe, p.status_rekon,
        COALESCE(p.selisih_rekon, 0)::numeric as selisih_rekon, p.keterangan_rekon,
        COALESCE(p.opd, sp.opd) as opd,
        sp.uraian as uraian_sp2d
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d sp ON sp.nomor = p.nomor_sp2d
      LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
      WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)) = ${targetTahun}
      ${targetBulan ? `AND EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)) = ${targetBulan}` : ''}
      AND (
        p.status_rekon = 'BELUM'
        OR p.status_rekon LIKE 'ANOMALI%'
        OR (p.status_rekon = 'SUDAH' AND b.id IS NULL)
        OR ABS(COALESCE(p.selisih_rekon, 0)) > 1
      )
      -- SUDAH_BRUTO dikecualikan: potongan tercakup dalam bruto SP2D, bukan anomali
      AND p.status_rekon <> 'SUDAH_BRUTO'
      -- Opsi C: jika SP2D induknya SUDAH_BRUTO, potongannya otomatis bukan anomali
      AND COALESCE(sp.status_rekon, '') <> 'SUDAH_BRUTO'

      UNION ALL

      SELECT
        s.id::text as id, CAST(s.tanggal AS DATE) as tanggal, s.nomor_bukti, s.uraian, s.nilai::numeric, s.id_sumber_dana, 'SELISIH_PAJAK' as tipe, s.status_rekon,
        COALESCE(s.selisih_rekon, 0)::numeric as selisih_rekon, s.keterangan_rekon,
        NULL::text as opd, NULL::text as uraian_sp2d
      FROM setoran_pajak s
      LEFT JOIN bank_statement b ON s.id::text = b.ref_bku_id
      WHERE EXTRACT(YEAR FROM s.tanggal) = ${targetTahun}
      ${targetBulan ? `AND EXTRACT(MONTH FROM s.tanggal) = ${targetBulan}` : ''}
      AND (
        s.status_rekon = 'BELUM'
        OR s.status_rekon LIKE 'ANOMALI%'
        OR (s.status_rekon = 'SUDAH' AND b.id IS NULL)
        OR ABS(COALESCE(s.selisih_rekon, 0)) > 1
      )

      ORDER BY tanggal DESC
      LIMIT ${limit}
    `);

      const countPotongan = await prisma.$queryRawUnsafe(`
        SELECT SUM(count)::int as count FROM (
          SELECT COUNT(*) as count 
          FROM data_sp2d_potongan p
          LEFT JOIN data_sp2d sp2 ON sp2.nomor = p.nomor_sp2d
          LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
          WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, sp2.tanggal_pencairan, sp2.tanggal)) = ${targetTahun}
          ${targetBulan ? `AND EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, sp2.tanggal_pencairan, sp2.tanggal)) = ${targetBulan}` : ''}
          AND (
            p.status_rekon = 'BELUM'
            OR p.status_rekon LIKE 'ANOMALI%'
            OR (p.status_rekon = 'SUDAH' AND b.id IS NULL)
            OR ABS(COALESCE(p.selisih_rekon, 0)) > 1
          )
          AND p.status_rekon <> 'SUDAH_BRUTO'
          AND COALESCE(sp2.status_rekon, '') <> 'SUDAH_BRUTO'

          UNION ALL

          SELECT COUNT(*) as count
          FROM setoran_pajak s
          LEFT JOIN bank_statement b ON s.id::text = b.ref_bku_id
          WHERE EXTRACT(YEAR FROM s.tanggal) = ${targetTahun}
          ${targetBulan ? `AND EXTRACT(MONTH FROM s.tanggal) = ${targetBulan}` : ''}
          AND (
            s.status_rekon = 'BELUM'
            OR s.status_rekon LIKE 'ANOMALI%'
            OR (s.status_rekon = 'SUDAH' AND b.id IS NULL)
            OR ABS(COALESCE(s.selisih_rekon, 0)) > 1
          )
        ) as combined
      `);
      totalUnmatchedPotongan = countPotongan[0]?.count || 0;
    } catch (e) {
      console.error('[ERROR QUERY 3 POTONGAN]', e);
      throw new Error(`Gagal query Potongan/Pajak: ${e.message}`);
    }

    // 4. Ghost Match
    let ghostMatches = [], totalGhostMatches = 0;
    try {
      ghostMatches = await prisma.$queryRawUnsafe(`
        SELECT
          'POTONGAN' as tipe, p.id::text as id, p.nomor_sp2d as bukti,
          p.nilai::numeric as nilai, p.status_rekon, CAST(COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) AS TEXT) as tanggal,
          p.uraian, COALESCE(p.opd, '') as opd
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
        WHERE COALESCE(p.status_rekon, 'BELUM') NOT IN ('BELUM', 'SUDAH_BRUTO')
          AND COALESCE(s.status_rekon, '') <> 'SUDAH_BRUTO'
          AND b.id IS NULL
          AND EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${targetTahun}
          ${targetBulan ? `AND EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${targetBulan}` : ''}

        UNION ALL

        SELECT
          'PENDAPATAN' as tipe, pnd.id::text as id, pnd.nomor_bukti as bukti,
          pnd.nilai::numeric as nilai, pnd.status_rekon, CAST(pnd.tanggal AS TEXT) as tanggal,
          pnd.uraian, '' as opd
        FROM data_pendapatan pnd
        LEFT JOIN bank_statement b ON pnd.id::text = b.ref_bku_id
        WHERE COALESCE(pnd.status_rekon, 'BELUM') NOT IN ('BELUM')
          AND b.id IS NULL
          AND pnd.tahun = ${targetTahun}
          ${targetBulan ? `AND EXTRACT(MONTH FROM pnd.tanggal) = ${targetBulan}` : ''}

        ORDER BY tanggal DESC
        LIMIT ${limit}
      `);

      const countGhostRes = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as count FROM (
          SELECT p.id::text FROM data_sp2d_potongan p
          LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
          LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
          WHERE COALESCE(p.status_rekon, 'BELUM') NOT IN ('BELUM', 'SUDAH_BRUTO') AND COALESCE(s.status_rekon, '') <> 'SUDAH_BRUTO' AND b.id IS NULL
          AND EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${targetTahun}
          ${targetBulan ? `AND EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${targetBulan}` : ''}
          UNION ALL
          SELECT pnd.id::text FROM data_pendapatan pnd
          LEFT JOIN bank_statement b ON pnd.id::text = b.ref_bku_id
          WHERE COALESCE(pnd.status_rekon, 'BELUM') NOT IN ('BELUM') AND b.id IS NULL
          AND pnd.tahun = ${targetTahun}
          ${targetBulan ? `AND EXTRACT(MONTH FROM pnd.tanggal) = ${targetBulan}` : ''}
        ) combined
      `);
      totalGhostMatches = countGhostRes[0]?.count || 0;
    } catch (e) {
      console.error('[ERROR QUERY 4 GHOST]', e);
      throw new Error(`Gagal query Ghost Match: ${e.message}`);
    }

    // 5. Bank Statement Unidentified
    const bankWhere = {
      is_matched: false,
      ...(targetBulan && { tanggal: dateFilter })
    };

    const [unidentifiedBank, totalUnidentifiedBank] = await Promise.all([
      prisma.bank_statement.findMany({
        where: bankWhere,
        orderBy: { tanggal: 'desc' },
        take: limit
      }),
      prisma.bank_statement.count({ where: bankWhere })
    ]);

    // Final mapping dengan proteksi tipe data
    res.json({
      summary: {
        totalUnmatchedSP2D: Number(totalUnmatchedSP2D || 0),
        totalUnmatchedPendapatan: Number(totalUnmatchedPendapatan || 0),
        totalUnmatchedPotongan: Number(totalUnmatchedPotongan || 0),
        totalUnidentifiedBank: Number(totalUnidentifiedBank || 0),
        totalGhostMatches: Number(totalGhostMatches || 0),
      },
      unmatchedSP2D: unmatchedSP2D.map(s => ({ 
        ...s, 
        nilai_neto: Number(s.nilai_neto || 0) 
      })),
      unmatchedPendapatan: unmatchedPendapatan.map(p => ({ 
        ...p, 
        nilai: Number(p.nilai || 0) 
      })),
      unmatchedPotongan: unmatchedPotongan.map(p => ({ 
        ...p, 
        nilai: Number(p.nilai || 0) 
      })),
      unidentifiedBank: unidentifiedBank.map(b => ({
        ...b,
        debet: Number(b.debet || 0),
        kredit: Number(b.kredit || 0),
        saldo_akhir: Number(b.saldo_akhir || 0),
        selisih_nilai: Number(b.selisih_nilai || 0)
      })),
      ghostMatches: (ghostMatches || []).map(g => ({ 
        ...g, 
        nilai: Number(g.nilai || 0) 
      })),
    });
  } catch (err) {
    console.error('ANOMALY DETECTION CRITICAL ERROR:', err);
    res.status(500).json({ 
      message: 'Server Error saat analisis integritas', 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

/**
 * Komparasi Saldo Akhir BKU vs Bank
 */
const getBalanceComparison = async (req, res) => {
  const { date } = req.query;
  const targetDate = parseDateSafe(date);

  try {
    const currentYear = targetDate.getFullYear();
    const isoDate = fmtDate(targetDate);
    const startOfYear = `${currentYear}-01-01`;

    const startOfYearDate = new Date(currentYear, 0, 1);
    const endOfPeriodDate = new Date(targetDate);
    endOfPeriodDate.setHours(23, 59, 59, 999);

    console.log(`[DEBUG] getBalanceComparison date: ${isoDate}, targetDate: ${targetDate}`);

    // 1. BKU Metrics - INDIVIDUAL QUERIES FOR BETTER DEBUGGING
    let sa_sum = 0, inc_sum = 0, exp_sum = 0, tax_pot_sum = 0, sjk_sum = 0, adj_in_sum = 0, adj_out_sum = 0;

    try {
      const sa_res = await prisma.saldo_awal.aggregate({ where: { tahun: currentYear }, _sum: { nilai: true } });
      sa_sum = Number(sa_res._sum.nilai || 0);
    } catch (e) { console.error('[ERROR] SA Query:', e.message); }

    try {
      const inc_res = await prisma.data_pendapatan.aggregate({
        where: {
          tanggal: {
            gte: startOfYearDate,
            lte: endOfPeriodDate
          }
        },
        _sum: { nilai: true }
      });
      inc_sum = Number(inc_res._sum.nilai || 0);
    } catch (e) { console.error('[ERROR] INC Query:', e.message); }

    try {
      const exp_res = await prisma.$queryRaw`
        SELECT SUM(CAST(CASE WHEN s.status_rekon = 'SUDAH_BRUTO' THEN s.nilai_bruto
                             ELSE s.nilai_bruto - COALESCE(
                               (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
                                WHERE p.id_sp2d = s.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
                               CAST(s.nilai_potongan AS DECIMAL)
                             ) END AS NUMERIC)) as total
        FROM data_sp2d s
        WHERE (
          (s.tanggal_pencairan::DATE BETWEEN CAST(${startOfYear} AS DATE) AND CAST(${isoDate} AS DATE))
          OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE BETWEEN CAST(${startOfYear} AS DATE) AND CAST(${isoDate} AS DATE))
        )
      `;
      exp_sum = Number(exp_res[0]?.total || 0);
    } catch (e) { console.error('[ERROR] EXP Query:', e.message); }

    try {
      const tax_pot_res = await prisma.$queryRaw`
        SELECT SUM(CAST(p.nilai AS NUMERIC)) as total
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)::DATE BETWEEN CAST(${startOfYear} AS DATE) AND CAST(${isoDate} AS DATE)
        AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
        AND (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO')
      `;
      tax_pot_sum = Number(tax_pot_res[0]?.total || 0);
    } catch (e) { console.error('[ERROR] TAX_POT Query:', e.message); }

    try {
      const adj_in_res = await prisma.data_penyesuaian.aggregate({
        where: {
          jenis: 'MASUK',
          tanggal: {
            gte: startOfYearDate,
            lte: endOfPeriodDate
          }
        },
        _sum: { nilai: true }
      });
      adj_in_sum = Number(adj_in_res._sum.nilai || 0);
    } catch (e) { console.error('[ERROR] ADJ_IN Query:', e.message); }

    try {
      const adj_out_res = await prisma.data_penyesuaian.aggregate({
        where: {
          jenis: 'KELUAR',
          tanggal: {
            gte: startOfYearDate,
            lte: endOfPeriodDate
          }
        },
        _sum: { nilai: true }
      });
      adj_out_sum = Number(adj_out_res._sum.nilai || 0);
    } catch (e) { console.error('[ERROR] ADJ_OUT Query:', e.message); }

    // Setoran pajak standalone — yang tidak punya pasangan di data_sp2d_potongan.
    // Ini adalah pengeluaran kas yang muncul di bank tapi TIDAK tercatat sebagai potongan SP2D,
    // sehingga harus ikut mengurangi saldoBKU agar formula konsisten dengan getBku().
    try {
      const sjk_res = await prisma.$queryRaw`
        SELECT SUM(CAST(s.nilai AS NUMERIC)) as total
        FROM setoran_pajak s
        WHERE s.tanggal::DATE BETWEEN CAST(${startOfYear} AS DATE) AND CAST(${isoDate} AS DATE)
        AND NOT EXISTS (
          SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti
        )
      `;
      sjk_sum = Number(sjk_res[0]?.total || 0);
    } catch (e) { console.error('[ERROR] SJK Query:', e.message); }

    const metrics = {
      sa: sa_sum,
      inc: inc_sum,
      exp: exp_sum,
      tax_pot: tax_pot_sum,
      sjk: sjk_sum,
      adj_in: adj_in_sum,
      adj_out: adj_out_sum
    };

    // Cents-level arithmetic: hilangkan floating-point precision loss (0.000000004 rupiah fiktif)
    // Semua nilai dibulatkan ke sen terdekat sebelum operasi aritmatika, lalu dibagi kembali ke rupiah.
    const toCents = (v) => Math.round(Number(v || 0) * 100);
    const saldoBKUCents = toCents(metrics.sa) + toCents(metrics.inc)
      - toCents(metrics.exp) - toCents(metrics.tax_pot)
      - toCents(metrics.sjk)
      + toCents(metrics.adj_in) - toCents(metrics.adj_out);
    const saldoBKU = saldoBKUCents / 100;

    // 2. Saldo Bank - RESTORED ORIGINAL LOGIC (Using saldo_akhir column from latest record)
    const bankMetrics = await prisma.$queryRaw`
      SELECT 
        COALESCE(SUM(CAST(kredit AS NUMERIC)) - SUM(CAST(debet AS NUMERIC)), 0) as calculated_balance,
        COALESCE(SUM(CASE WHEN is_matched = false THEN CAST(debet AS NUMERIC) ELSE 0 END), 0) as unmatched_debet,
        COALESCE(SUM(CASE WHEN is_matched = false THEN CAST(kredit AS NUMERIC) ELSE 0 END), 0) as unmatched_kredit
      FROM bank_statement 
      WHERE tanggal <= ${endOfPeriodDate}
    `;

    const bMetrics = bankMetrics[0];
    const saldoBank = Number(bMetrics.calculated_balance);

    // Calculate Total Bank In/Out for the period (Jan 1 to targetDate)
    const bankTotals = await prisma.bank_statement.aggregate({
      where: {
        tanggal: { gte: startOfYearDate, lte: endOfPeriodDate }
      },
      _sum: {
        debet: true,
        kredit: true
      }
    });
    const bTotals = bankTotals._sum;

    res.json({
      date: targetDate,
      saldoBKU,
      saldoBank,
      selisih: (toCents(saldoBKU) - toCents(saldoBank)) / 100,
      unmatchedBank: {
        debet: Number(bMetrics.unmatched_debet),
        kredit: Number(bMetrics.unmatched_kredit)
      },
      // Comparison Totals (Memory Point 5 compliance)
      comparison: {
        bku: {
          // "Penerimaan BKU" untuk panel audit mencakup saldo awal/SILPA + pendapatan berjalan.
          penerimaan: metrics.sa + metrics.inc,
          pendapatan_berjalan: metrics.inc,
          saldo_awal_silpa: metrics.sa,
          pengeluaran: metrics.exp + metrics.tax_pot + metrics.sjk,
          sp2d_neto: metrics.exp,
          rincian_potongan: metrics.tax_pot,
          setoran_pajak_standalone: metrics.sjk
        },
        bank: {
          penerimaan: Number(bTotals.kredit || 0),
          pengeluaran: Number(bTotals.debet || 0)
        }
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error in balance comparison', error: err.message });
  }
};

/**
 * Laporan Selisih & Ketidakcocokan Terperinci
 * Breakdown per bulan, per OPD, per tipe transaksi
 */
const getDiscrepancyReport = async (req, res) => {
  const { year } = req.query;
  const currentYear = parseInt(year) || new Date().getFullYear();

  try {
    console.log(`[DEBUG DISCREPANCY] Fetching for year: ${currentYear}`);

    // 1. SP2D Belum Rekon - grouped by month & OPD
    const sp2dUnmatched = await prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bulan,
        opd,
        COUNT(*)::int as jumlah,
        SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), h.nilai_potongan) AS DECIMAL)) as total_neto
      FROM data_sp2d h
      WHERE h.tahun = ${currentYear} AND (h.status_rekon = 'BELUM' OR h.status_rekon IS NULL)
      GROUP BY EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal)), opd
      ORDER BY bulan ASC
    `.catch(e => { console.error('Error Q1:', e); return []; });

    // 2. SP2D Sudah Rekon - grouped by month
    const sp2dMatched = await prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM tanggal_pencairan)::int as bulan,
        COUNT(*)::int as jumlah,
        SUM(CAST(nilai_neto AS DECIMAL)) as total_neto
      FROM data_sp2d
      WHERE tahun = ${currentYear} AND (status_rekon LIKE 'SUDAH%' OR status_rekon LIKE 'ANOMALI%') AND tanggal_pencairan IS NOT NULL
      GROUP BY EXTRACT(MONTH FROM tanggal_pencairan)
      ORDER BY bulan ASC
    `.catch(e => { console.error('Error Q2:', e); return []; });

    // 3. Bank Debet Belum Cocok
    const bankDebetUnmatched = await prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM tanggal)::int as bulan,
        COUNT(*)::int as jumlah,
        SUM(CAST(debet AS DECIMAL)) as total_debet
      FROM bank_statement
      WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
      GROUP BY EXTRACT(MONTH FROM tanggal)
    `.catch(e => { console.error('Error Q3:', e); return []; });

    // 4. Monthly Balance Comparison
    const monthlyBalance = await prisma.$queryRaw`
      SELECT 
        m.bulan,
        COALESCE(inc.total_penerimaan, 0) as penerimaan,
        COALESCE(exp.total_pengeluaran, 0) as pengeluaran,
        COALESCE(bank.saldo_akhir_bank, 0) as saldo_bank,
        COALESCE(exp_unmatched.total, 0) as pengeluaran_belum_rekon,
        COALESCE(debet_unmatched.total, 0) as bank_debet_belum_cocok
      FROM (SELECT generate_series(1,12) as bulan) m
      LEFT JOIN (
        SELECT bln, SUM(total) as total_penerimaan FROM (
          SELECT 1 as bln, SUM(CAST(nilai AS DECIMAL)) as total FROM saldo_awal WHERE tahun = ${currentYear}
          UNION ALL
          SELECT EXTRACT(MONTH FROM tanggal)::int as bln, SUM(CAST(nilai AS DECIMAL)) as total
          FROM data_pendapatan WHERE tahun = ${currentYear}
          GROUP BY EXTRACT(MONTH FROM tanggal)
        ) sub GROUP BY bln
      ) inc ON inc.bln = m.bulan
      LEFT JOIN (
        -- Formula baku: SP2D Bruto + Setoran Standalone
        -- Bruto = Neto + Rincian Potongan (konsisten dengan summaryAgg di getReconciliationData)
        -- Setoran standalone: NOT EXISTS guard cegah double-count dengan rincian potongan SP2D
        SELECT bln, SUM(nilai) as total_pengeluaran FROM (
          SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bln,
                 nilai_bruto as nilai
          FROM data_sp2d WHERE tahun = ${currentYear}
          UNION ALL
          SELECT EXTRACT(MONTH FROM tanggal)::int as bln, CAST(nilai AS DECIMAL) as nilai
          FROM setoran_pajak
          WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear}
          AND NOT EXISTS (
            SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = setoran_pajak.nomor_bukti
          )
        ) combined_exp
        GROUP BY bln
      ) exp ON exp.bln = m.bulan
      LEFT JOIN (
        SELECT bln,
          SUM(monthly_delta) OVER (ORDER BY bln ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as saldo_akhir_bank
        FROM (
          SELECT EXTRACT(MONTH FROM tanggal)::int as bln,
            SUM(CAST(kredit AS DECIMAL)) - SUM(CAST(debet AS DECIMAL)) as monthly_delta
          FROM bank_statement
          WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear}
          GROUP BY EXTRACT(MONTH FROM tanggal)
        ) monthly_bank
      ) bank ON bank.bln = m.bulan
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bln, SUM(CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE (nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), nilai_potongan)) END) as total
        FROM data_sp2d WHERE tahun = ${currentYear} AND (status_rekon = 'BELUM' OR status_rekon IS NULL)
        GROUP BY EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))
      ) exp_unmatched ON exp_unmatched.bln = m.bulan
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM tanggal)::int as bln, SUM(CAST(debet AS DECIMAL)) as total
        FROM bank_statement 
        WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
        GROUP BY EXTRACT(MONTH FROM tanggal)
      ) debet_unmatched ON debet_unmatched.bln = m.bulan
      ORDER BY m.bulan ASC
    `.catch(e => { console.error('Error Q4:', e); return []; });

    // 5. OPD Summary
    const opdSummary = await prisma.$queryRaw`
      SELECT 
        opd,
        COUNT(*)::int as total_sp2d,
        COUNT(CASE WHEN status_rekon LIKE 'SUDAH%' OR status_rekon LIKE 'ANOMALI%' THEN 1 END)::int as sudah_rekon,
        COUNT(CASE WHEN status_rekon = 'BELUM' OR status_rekon IS NULL THEN 1 END)::int as belum_rekon,
        SUM(CAST(CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), nilai_potongan) END AS DECIMAL)) as total_neto,
        SUM(CASE WHEN status_rekon = 'BELUM' OR status_rekon IS NULL THEN CAST(nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), nilai_potongan) AS DECIMAL) ELSE 0 END) as neto_belum_rekon
      FROM data_sp2d
      WHERE tahun = ${currentYear}
      GROUP BY opd
    `.catch(e => { console.error('Error Q5:', e); return []; });

    const matchedWithDiscrepancy = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT CAST(id AS VARCHAR) as id, 'SP2D' as tipe, tanggal_pencairan as tanggal, nomor as bukti, opd, uraian, CAST(nilai_neto AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM data_sp2d WHERE tahun = ${currentYear} AND (ABS(COALESCE(selisih_rekon, 0)) > 0 OR (keterangan_rekon LIKE '%Catatan Admin:%' AND keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%'))
        UNION ALL
        SELECT CAST(id AS VARCHAR) as id, 'PENDAPATAN' as tipe, tanggal, nomor_bukti as bukti, 'BENDAHARA' as opd, uraian, CAST(nilai AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM data_pendapatan WHERE tahun = ${currentYear} AND (ABS(COALESCE(selisih_rekon, 0)) > 0 OR (keterangan_rekon LIKE '%Catatan Admin:%' AND keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%'))
        UNION ALL
        SELECT CAST(p.id AS VARCHAR) as id, 'POTONGAN' as tipe, COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, p.nomor_sp2d as bukti, p.opd, p.uraian, CAST(p.nilai AS DECIMAL) as nilai, CAST(COALESCE(p.selisih_rekon, 0) AS DECIMAL) as selisih, p.keterangan_rekon, p.status_rekon FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${currentYear} AND (ABS(COALESCE(p.selisih_rekon, 0)) > 0 OR (p.keterangan_rekon LIKE '%Catatan Admin:%' AND p.keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%')) AND p.status_rekon <> 'SUDAH_BRUTO' AND COALESCE(s.status_rekon, '') <> 'SUDAH_BRUTO'
        UNION ALL
        SELECT CAST(id AS VARCHAR) as id, 'PAJAK' as tipe, COALESCE(tanggal_pencairan, tanggal) as tanggal, nomor_bukti as bukti, opd, uraian, CAST(nilai AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM setoran_pajak WHERE EXTRACT(YEAR FROM COALESCE(tanggal_pencairan, tanggal)) = ${currentYear} AND (ABS(COALESCE(selisih_rekon, 0)) > 0 OR (keterangan_rekon LIKE '%Catatan Admin:%' AND keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%'))
      ) combined WHERE (ABS(selisih) > 0.01 OR (keterangan_rekon LIKE '%Catatan Admin:%' AND keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%')) ORDER BY tanggal DESC LIMIT 100
    `.catch(e => { console.error('Error Q6:', e); return []; });

    // Kolom numerik yang harus di-fallback ke 0 jika null
    const NUMERIC_KEYS = new Set(['bulan','jumlah','total_neto','total_debet','penerimaan','pengeluaran',
      'saldo_bank','pengeluaran_belum_rekon','bank_debet_belum_cocok','total_sp2d','sudah_rekon',
      'belum_rekon','neto_belum_rekon','nilai','selisih','total_nilai','total_rincian','total_penerimaan']);
    const serialize = (arr) => (arr || []).map(row => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'bigint') {
          out[k] = Number(v);
        } else if (v !== null && v !== undefined && typeof v === 'object' && v.constructor?.name === 'Decimal') {
          out[k] = Number(v.toString());
        } else if (v instanceof Date) {
          out[k] = v.toISOString();
        } else if (v === null || v === undefined) {
          // Kolom numerik → 0, kolom string → null (bukan 0!)
          out[k] = NUMERIC_KEYS.has(k) ? 0 : null;
        } else {
          out[k] = v;
        }
      }
      return out;
    });

    // 7. Potongan & Pajak Unmatched (Restored)
    const potonganUnmatched = await prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, s.tanggal))::int as bulan,
        p.opd,
        p.jenis_potongan,
        COUNT(*)::int as jumlah,
        SUM(CAST(p.nilai AS DECIMAL)) as total_nilai
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      WHERE (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL) 
        AND EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal)) = ${currentYear}
      GROUP BY EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, s.tanggal)), p.opd, p.jenis_potongan
    `.catch(() => []);

    // 8. Unmatched Details (Restored)
    const unmatchedDetails = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT CAST(id AS VARCHAR) as id, 'SP2D' as tipe, COALESCE(tanggal_pencairan, tanggal) as tanggal, nomor as bukti, opd, uraian, CAST(nilai_neto AS DECIMAL) as nilai, 'KELUAR' as d_k
        FROM data_sp2d WHERE tahun = ${currentYear} AND (status_rekon = 'BELUM' OR status_rekon IS NULL)
        UNION ALL
        SELECT CAST(id AS VARCHAR) as id, 'BANK' as tipe, tanggal, '' as bukti, 'BANK' as opd, deskripsi as uraian, CAST(debet AS DECIMAL) as nilai, 'KELUAR' as d_k
        FROM bank_statement WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
      ) comb ORDER BY tanggal DESC LIMIT 50
    `.catch(() => []);

    const saldoAwalSilpaRaw = await prisma.$queryRaw`
      SELECT COALESCE(SUM(CAST(nilai AS DECIMAL)), 0) as total FROM saldo_awal WHERE tahun = ${currentYear}
    `.catch(() => [{ total: 0 }]);
    const saldoAwalSilpa = Number(saldoAwalSilpaRaw[0]?.total || 0);

    console.log(`[DEBUG DISCREPANCY] Summary: Unmatched=${sp2dUnmatched.length}, Balance=${monthlyBalance.length}, OPD=${opdSummary.length}, Silpa=${saldoAwalSilpa}`);

    res.json({
      sp2dUnmatched: serialize(sp2dUnmatched),
      sp2dMatched: serialize(sp2dMatched),
      bankDebetUnmatched: serialize(bankDebetUnmatched),
      monthlyBalance: serialize(monthlyBalance),
      opdSummary: serialize(opdSummary),
      matchedWithDiscrepancy: serialize(matchedWithDiscrepancy),
      potonganUnmatched: serialize(potonganUnmatched),
      unmatchedDetails: serialize(unmatchedDetails),
      saldoAwalSilpa: saldoAwalSilpa
    });
  } catch (err) {
    console.error('DISCREPANCY REPORT ERROR:', err);
    res.status(500).json({ message: 'Error generating discrepancy report', error: err.message });
  }
};

const getMatchedPotonganReport = async (req, res) => {
  const { startDate, endDate } = req.query;
  const sDate = startDate || '1970-01-01';
  const eDate = endDate || '2099-12-31';

  try {
    const data = await prisma.$queryRaw`
      SELECT
        COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal) as "Tanggal_SP2D",
        COALESCE(p.nomor_sp2d, sp.nomor) as "Nomor_SP2D",
        COALESCE(p.opd, sp.opd) as "OPD",
        p.jenis_potongan as "Jenis_Potongan",
        p.nilai as "Nilai_BKU",
        p.uraian as "Uraian_BKU",
        p.status_rekon as "Status_Audit",
        b.tanggal as "Tanggal_Bank",
        b.deskripsi as "Keterangan_Bank",
        b.debet as "Nilai_Bank"
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
      LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
      WHERE (COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal) BETWEEN ${new Date(sDate)} AND ${new Date(eDate)})
      
      UNION ALL
      
      SELECT 
        s.tanggal as "Tanggal_SP2D",
        s.nomor_bukti as "Nomor_SP2D",
        s.opd as "OPD",
        s.jenis_pajak as "Jenis_Potongan",
        s.nilai as "Nilai_BKU",
        s.uraian as "Uraian_BKU",
        s.status_rekon as "Status_Audit",
        b.tanggal as "Tanggal_Bank",
        b.deskripsi as "Keterangan_Bank",
        b.debet as "Nilai_Bank"
      FROM setoran_pajak s
      LEFT JOIN bank_statement b ON s.id::text = b.ref_bku_id
      WHERE (s.tanggal BETWEEN ${new Date(sDate)} AND ${new Date(eDate)})
      
      ORDER BY "Tanggal_SP2D" ASC
    `;

    // Map to user-friendly column names
    const mappedData = data.map(item => ({
      "Tanggal SP2D": item.Tanggal_SP2D ? new Date(item.Tanggal_SP2D).toLocaleDateString('id-ID') : '-',
      "Nomor SP2D": item.Nomor_SP2D,
      "OPD": item.OPD,
      "Jenis Potongan": item.Jenis_Potongan,
      "Nilai BKU": Number(item.Nilai_BKU),
      "Uraian BKU": item.Uraian_BKU,
      "Status Audit": item.Status_Audit,
      "Tanggal Bank": item.Tanggal_Bank ? new Date(item.Tanggal_Bank).toLocaleDateString('id-ID') : '-',
      "Keterangan Bank": item.Keterangan_Bank || (item.Status_Audit === 'SUDAH_BRUTO' ? 'TERCAKUP BRUTO SP2D' : 'BELUM MATCH'),
      "Nilai Bank": item.Nilai_Bank ? Number(item.Nilai_Bank) : 0
    }));

    res.json(mappedData);
  } catch (err) {
    console.error('MATCHED POTONGAN REPORT ERROR:', err);
    res.status(500).json({ message: 'Error fetching matched deductions', error: err.message });
  }
};

/**
 * Integrity Checker: Potongan Gelondongan vs Rincian
 * Membandingkan total potongan di header SP2D (Gelondongan) vs total di detail potongan (Rincian Manual)
 */
const getPotonganIntegrity = async (req, res) => {
  const { tahun } = req.query;
  const targetTahun = parseInt(tahun) || new Date().getFullYear();

  try {
    const mismatches = await prisma.$queryRaw`
      SELECT 
        s.id, s.nomor, s.tanggal, s.opd, s.uraian,
        s.nilai_bruto, s.nilai_neto,
        s.nilai_potongan as gelondongan,
        COALESCE(p.total_rincian, 0) as rincian,
        (s.nilai_potongan - COALESCE(p.total_rincian, 0)) as selisih
      FROM data_sp2d s
      LEFT JOIN (
        SELECT id_sp2d, SUM(nilai) as total_rincian 
        FROM data_sp2d_potongan 
        GROUP BY id_sp2d
      ) p ON s.id = p.id_sp2d
      WHERE s.tahun = ${targetTahun}
      AND s.status_rekon != 'SUDAH_BRUTO'
      AND (s.nilai_potongan > 0 OR p.total_rincian > 0)
      AND ABS(s.nilai_potongan - COALESCE(p.total_rincian, 0)) > 1
      ORDER BY ABS(s.nilai_potongan - COALESCE(p.total_rincian, 0)) DESC
    `;

    // Serialisasi: BigInt → Number, Decimal → Number, Date → ISO string
    const serialized = mismatches.map(row => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        if (typeof v === 'bigint') out[k] = Number(v);
        else if (v !== null && typeof v === 'object' && v.constructor?.name === 'Decimal') out[k] = Number(v.toString());
        else if (v instanceof Date) out[k] = v.toISOString();
        else out[k] = v;
      }
      return out;
    });

    const totalVariance = serialized.reduce((acc, m) => acc + (Number(m.selisih) || 0), 0);

    res.json({
      data: serialized,
      summary: {
        totalMismatches: serialized.length,
        totalVariance
      }
    });
  } catch (err) {
    console.error('POTONGAN INTEGRITY ERROR:', err);
    res.status(500).json({ message: 'Error checking potongan integrity', error: err.message });
  }
};

/**
 * Preview dampak sebelum Reset — kembalikan jumlah record yang akan terpengaruh
 * tanpa melakukan perubahan apapun ke database.
 */
const getResetPreview = async (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const scope = req.query.scope || 'REKON';
  const startOfYear = new Date(`${year}-01-01T00:00:00.000Z`);
  const endOfYear   = new Date(`${year}-12-31T23:59:59.999Z`);

  try {
    if (scope === 'BANK_ONLY') {
      const [total, matched] = await Promise.all([
        prisma.bank_statement.count({
          where: { tanggal: { gte: startOfYear, lte: endOfYear } }
        }),
        prisma.bank_statement.count({
          where: { tanggal: { gte: startOfYear, lte: endOfYear }, is_matched: true }
        })
      ]);
      return res.json({ scope, year, total_bank: total, sudah_match: matched });
    }

    // Scope REKON: hitung semua BKU yang sudah punya status_rekon != BELUM
    const [sp2d, pendapatan, bank] = await Promise.all([
      prisma.data_sp2d.count({ where: { tahun: year, status_rekon: { not: 'BELUM' } } }),
      prisma.data_pendapatan.count({ where: { tahun: year, status_rekon: { not: 'BELUM' } } }),
      prisma.bank_statement.count({
        where: { tanggal: { gte: startOfYear, lte: endOfYear }, is_matched: true }
      })
    ]);
    return res.json({ scope, year, sp2d_sudah_rekon: sp2d, pendapatan_sudah_rekon: pendapatan, bank_sudah_match: bank });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/**
 * Hard Reset All Reconciliations
 * CAUTION: Destructive Action
 */
/**
 * Reset Rekonsiliasi Berdasarkan Rentang Tanggal
 */
const resetReconciliationByDateRange = async (req, res) => {
  const { startDate, endDate } = req.body;
  if (!startDate || !endDate) {
    return res.status(400).json({ message: 'Tanggal awal dan akhir wajib diisi.' });
  }

  try {
    // 1. Reset Bank Statement
    await prisma.$executeRaw`
      UPDATE bank_statement
      SET is_matched = false,
          ref_bku_id = null,
          selisih_nilai = 0,
          catatan_selisih = null,
          match_type = null
      WHERE tanggal >= CAST(${startDate} AS DATE) AND tanggal <= CAST(${endDate} AS DATE)
    `;

    // 2. Reset SP2D
    await prisma.$executeRaw`
      UPDATE data_sp2d
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = null
      WHERE COALESCE(tanggal_pencairan, tanggal) >= CAST(${startDate} AS DATE) AND COALESCE(tanggal_pencairan, tanggal) <= CAST(${endDate} AS DATE)
    `;

    // 3. Reset Potongan
    await prisma.$executeRaw`
      UPDATE data_sp2d_potongan
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = null
      WHERE COALESCE(tanggal_pencairan, (SELECT s.tanggal FROM data_sp2d s WHERE s.id = data_sp2d_potongan.id_sp2d)) >= CAST(${startDate} AS DATE) AND COALESCE(tanggal_pencairan, (SELECT s.tanggal FROM data_sp2d s WHERE s.id = data_sp2d_potongan.id_sp2d)) <= CAST(${endDate} AS DATE)
    `;

    // 4. Reset Pendapatan
    await prisma.$executeRaw`
      UPDATE data_pendapatan
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = null
      WHERE COALESCE(tanggal_pencairan, tanggal) >= CAST(${startDate} AS DATE) AND COALESCE(tanggal_pencairan, tanggal) <= CAST(${endDate} AS DATE)
    `;

    // 5. Reset Setoran Pajak
    await prisma.$executeRaw`
      UPDATE setoran_pajak
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = null
      WHERE COALESCE(tanggal_pencairan, tanggal) >= CAST(${startDate} AS DATE) AND COALESCE(tanggal_pencairan, tanggal) <= CAST(${endDate} AS DATE)
    `;

    // 6. Log aktivitas
    await prisma.log_aktivitas.create({
      data: {
        user_pelaksana: req.user?.username || req.user?.email || 'SYSTEM',
        aksi: 'RESET_REKON_RENTANG',
        detail: `Reset rekon rentang ${startDate} s/d ${endDate} oleh ${req.user?.username || req.user?.email || 'SYSTEM'}.`
      }
    }).catch(() => {});

    res.json({ message: `Berhasil mereset data rekonsiliasi dari tanggal ${startDate} s/d ${endDate}.` });
  } catch (err) {
    console.error('RESET REKON RENTANG ERROR:', err);
    res.status(500).json({ message: 'Gagal melakukan reset rekonsiliasi berdasarkan rentang tanggal', error: err.message });
  }
};

const resetAllReconciliation = async (req, res) => {
  const { year, code, scope } = req.body;
  const currentYear = parseInt(year) || new Date().getFullYear();
  const isBankOnly = scope === 'BANK_ONLY';

  const expectedCode = (isBankOnly ? 'RESET BANK ' + currentYear : 'RESET REKON ' + currentYear).trim().toUpperCase();
  const receivedCode = (code || '').trim().toUpperCase();

  console.log(`[DEBUG RESET] Received: "${receivedCode}", Expected: "${expectedCode}", Scope: ${scope}`);

  if (receivedCode !== expectedCode) {
    return res.status(400).json({ 
      message: `Kode konfirmasi tidak valid.`,
      received: receivedCode,
      expected: expectedCode,
      hint: `Harap ketik "${expectedCode}"`
    });
  }

  const startOfYear = `${currentYear}-01-01`;
  const endOfYear = `${currentYear}-12-31`;

  try {
    if (isBankOnly) {
       // Reset status rekon di BKU yang terhubung ke bank data yang akan dihapus
       const bankItems = await prisma.bank_statement.findMany({
         where: { 
           tanggal: { gte: new Date(startOfYear), lte: new Date(endOfYear) },
           ref_bku_id: { not: null }
         },
         select: { ref_bku_id: true }
       });

       const refIds = bankItems.map(b => String(b.ref_bku_id));
       
       if (refIds.length > 0) {
         const resetData = { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null };
         await Promise.all([
           prisma.data_sp2d.updateMany({ where: { id: { in: refIds } }, data: resetData }),
           prisma.data_pendapatan.updateMany({ where: { id: { in: refIds } }, data: resetData }),
           prisma.data_sp2d_potongan.updateMany({ where: { id: { in: refIds } }, data: resetData }),
           prisma.setoran_pajak.updateMany({ where: { id: { in: refIds } }, data: resetData })
         ]);
       }

       // Hapus permanen data bank
       await prisma.bank_statement.deleteMany({
         where: { tanggal: { gte: new Date(startOfYear), lte: new Date(endOfYear) } }
       });

       await prisma.log_aktivitas.create({
         data: {
           user_pelaksana: req.user?.username || req.user?.email || 'SYSTEM',
           aksi: 'RESET_BANK',
           detail: `RESET BANK ${currentYear}: ${refIds.length} rekening koran dihapus permanen oleh ${req.user?.username || req.user?.email || 'SYSTEM'}`
         }
       }).catch(() => {});
       return res.json({ message: 'Seluruh data mutasi bank tahun ' + currentYear + ' berhasil dibersihkan.' });
    }

    // Default: Reset Rekon (Old Logic)
    await prisma.$executeRaw`
      UPDATE bank_statement
      SET is_matched = false,
          ref_bku_id = null,
          selisih_nilai = 0,
          catatan_selisih = null,
          match_type = null
      WHERE tanggal >= CAST(${startOfYear} AS DATE) AND tanggal <= CAST(${endOfYear} AS DATE)
    `;

    // CATATAN: tanggal_pencairan TIDAK direset — nilainya bisa berasal dari input SIPD manual
    // yang sudah diverifikasi sebelum rekonsiliasi. Menghapusnya menyebabkan hilangnya data valid
    // dan membebani admin untuk memasukkan ulang semua tanggal pencairan.
    await prisma.$executeRaw`
      UPDATE data_sp2d
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = null
      WHERE tahun = ${currentYear}
    `;

    await prisma.$executeRaw`
      UPDATE data_sp2d_potongan
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = null
      WHERE (tanggal_pencairan >= CAST(${startOfYear} AS DATE) AND tanggal_pencairan <= CAST(${endOfYear} AS DATE))
         OR (tanggal_pencairan IS NULL AND created_at >= CAST(${startOfYear} AS DATE) AND created_at <= CAST(${endOfYear} AS DATE))
    `;

    await prisma.$executeRaw`
      UPDATE data_pendapatan
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = null
      WHERE tahun = ${currentYear}
    `;


    // ================================================================
    // STEP 5: Reset Setoran Pajak
    // ================================================================
    await prisma.$executeRaw`
      UPDATE setoran_pajak
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = null
      WHERE tanggal >= CAST(${startOfYear} AS DATE) AND tanggal <= CAST(${endOfYear} AS DATE)
    `;

    // ================================================================
    // STEP 6: [ORPHAN GUARD] Bersihkan ANOMALI lama jika masih ada
    // Ini proteksi jika ada data di luar tahun filter yang masih kotor
    // ================================================================
    await prisma.$executeRaw`
      UPDATE data_sp2d SET status_rekon = 'BELUM', selisih_rekon = 0, keterangan_rekon = null
      WHERE status_rekon LIKE '%ANOMALI%'
    `;
    await prisma.$executeRaw`
      UPDATE data_sp2d_potongan SET status_rekon = 'BELUM', selisih_rekon = 0, keterangan_rekon = null
      WHERE status_rekon LIKE '%ANOMALI%'
    `;
    await prisma.$executeRaw`
      UPDATE setoran_pajak SET status_rekon = 'BELUM', selisih_rekon = 0, keterangan_rekon = null
      WHERE status_rekon LIKE '%ANOMALI%'
    `;
    await prisma.$executeRaw`
      UPDATE data_pendapatan SET status_rekon = 'BELUM', selisih_rekon = 0, keterangan_rekon = null
      WHERE status_rekon LIKE '%ANOMALI%'
    `;

    // ================================================================
    // STEP 7: [GHOST MATCH GUARD] Bersihkan bank yang is_matched=true
    // tapi tidak punya ref_bku_id (data sampah dari bulk match parsial)
    // ================================================================
    await prisma.$executeRaw`
      UPDATE bank_statement
      SET is_matched = false, selisih_nilai = 0, catatan_selisih = null, match_type = null
      WHERE is_matched = true AND ref_bku_id IS NULL
    `;

    await prisma.log_aktivitas.create({
      data: {
        user_pelaksana: req.user?.username || req.user?.email || 'SYSTEM',
        aksi: 'RESET_REKON',
        detail: `RESET REKON ${currentYear}: seluruh status rekonsiliasi BKU & bank direset oleh ${req.user?.username || req.user?.email || 'SYSTEM'}. tanggal_pencairan TIDAK dihapus.`
      }
    }).catch(() => {});

    res.json({
      message: `Semua data rekonsiliasi tahun ${currentYear} telah di-reset secara menyeluruh. Semua data sampah (ANOMALI, Ghost Match, Orphan) ikut dibersihkan.`,
      tahun: currentYear
    });
  } catch (err) {
    console.error('RESET RECONCILIATION ERROR:', err);
    res.status(500).json({ message: 'Terjadi kesalahan sistem saat mereset data', error: err.message });
  }
};


/**
 * Save Audit Resolution Note and Status
 */
const saveResolution = async (req, res) => {
  const { type, id, note, status, manualTag } = req.body;

  if (!type || !id) {
    return res.status(400).json({ message: 'Parameter type dan id wajib diisi.' });
  }

  // Validasi tipe yang diizinkan
  const allowedTypes = ['BANK', 'SP2D', 'POTONGAN', 'STS', 'PENDAPATAN'];
  if (!allowedTypes.includes(type)) {
    return res.status(400).json({ message: `Tipe tidak dikenal: ${type}` });
  }

  try {
    if (type === 'BANK') {
      // bank_statement.id adalah INT autoincrement — wajib parseInt
      const numericId = parseInt(id, 10);
      if (isNaN(numericId)) {
        return res.status(400).json({ message: 'ID bank tidak valid (harus berupa angka).' });
      }
      await prisma.bank_statement.update({
        where: { id: numericId },
        data: {
          catatan_selisih: note || null,
          match_type: status || 'RESOLVED_BY_ADMIN'
        }
      });
    } else if (type === 'SP2D') {
      // data_sp2d.id adalah VARCHAR — gunakan String langsung
      await prisma.data_sp2d.update({
        where: { id: String(id) },
        data: {
          keterangan_rekon: note || null,
          status_rekon: status || 'SUDAH_DIVERIFIKASI'
        }
      });
    } else if (type === 'POTONGAN') {
      // data_sp2d_potongan.id adalah UUID — gunakan String langsung (JANGAN parseInt)
      await prisma.data_sp2d_potongan.update({
        where: { id: String(id) },
        data: {
          keterangan_rekon: note || null,
          status_rekon: status || 'SUDAH_DIVERIFIKASI'
        }
      });
    } else if (type === 'STS' || type === 'PENDAPATAN') {
      // data_pendapatan.id adalah UUID/VARCHAR — gunakan String langsung
      await prisma.data_pendapatan.update({
        where: { id: String(id) },
        data: {
          keterangan_rekon: note || null,
          status_rekon: status || 'SUDAH_DIVERIFIKASI'
        }
      });
    }

    console.log(`[SAVE_RESOLUTION] type=${type} id=${id} status=${status}`);
    res.json({ message: 'Resolusi audit berhasil disimpan.' });
  } catch (err) {
    // P2025 = record tidak ditemukan di DB
    if (err.code === 'P2025') {
      return res.status(404).json({ message: `Data dengan ID ${id} (${type}) tidak ditemukan.` });
    }
    console.error('SAVE RESOLUTION ERROR:', err);
    res.status(500).json({ message: 'Gagal menyimpan resolusi', error: err.message });
  }
};

/**
 * Ekspor Laporan Audit Rekonsiliasi ke Excel
 */
const exportReconciliationAudit = async (req, res) => {
  const { year, startDate, endDate } = req.query;
  const currentYear = parseInt(year) || new Date().getFullYear();
  const sDate = startDate ? new Date(startDate) : new Date(currentYear, 0, 1);
  const eDate = endDate ? new Date(endDate) : new Date(currentYear, 11, 31);
  eDate.setHours(23, 59, 59, 999);

  try {
    const XLSX = require('xlsx');

    // 1. GATHER DATA (Using the robust logic we built)
    const [sa, inc, exp, taxPot, bankMutations, unmatchedBKU, unmatchedBank, anomalies] = await Promise.all([
      prisma.saldo_awal.aggregate({ _sum: { nilai: true } }),
      prisma.data_pendapatan.aggregate({ where: { tanggal: { gte: sDate, lte: eDate } }, _sum: { nilai: true } }),
      prisma.$queryRaw`SELECT SUM(CAST(CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), nilai_potongan) END AS NUMERIC)) as total FROM data_sp2d WHERE tanggal >= ${sDate} AND tanggal <= ${eDate}`,
      prisma.data_sp2d_potongan.aggregate({ where: { tanggal_pencairan: { gte: sDate, lte: eDate } }, _sum: { nilai: true } }),
      prisma.bank_statement.aggregate({ where: { tanggal: { gte: sDate, lte: eDate } }, _sum: { debet: true, kredit: true } }),
      // Unmatched BKU
      prisma.$queryRaw`
        SELECT 'PENDAPATAN' as tipe, tanggal, nomor_bukti as bukti, uraian, CAST(nilai AS DECIMAL) as nilai FROM data_pendapatan 
        WHERE status_rekon = 'BELUM' AND tanggal BETWEEN ${sDate} AND ${eDate}
        UNION ALL
        SELECT 'SP2D' as tipe, tanggal, nomor as bukti, uraian, CAST(nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), nilai_potongan) AS DECIMAL) as nilai FROM data_sp2d
        WHERE status_rekon = 'BELUM' AND tanggal BETWEEN ${sDate} AND ${eDate}
        UNION ALL
        SELECT 'POTONGAN' as tipe, COALESCE(p.tanggal_pencairan, s.tanggal) as tanggal, p.nomor_sp2d as bukti, p.uraian, CAST(p.nilai AS DECIMAL) as nilai FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE p.status_rekon = 'BELUM' AND COALESCE(p.tanggal_pencairan, s.tanggal) BETWEEN ${sDate} AND ${eDate}
      `,
      // Unmatched Bank
      prisma.bank_statement.findMany({ where: { is_matched: false, tanggal: { gte: sDate, lte: eDate } } }),
      // Anomalies
      prisma.bank_statement.findMany({ where: { is_matched: true, selisih_nilai: { not: 0 }, tanggal: { gte: sDate, lte: eDate } } })
    ]);

    const metrics = {
      saldoAwal: Number(sa._sum.nilai || 0),
      penerimaanBKU: Number(inc._sum.nilai || 0),
      pengeluaranBKU: Number(exp[0].total || 0) + Number(taxPot._sum.nilai || 0),
      bankMasuk: Number(bankMutations._sum.kredit || 0),
      bankKeluar: Number(bankMutations._sum.debet || 0)
    };

    const saldoBKU = metrics.saldoAwal + metrics.penerimaanBKU - metrics.pengeluaranBKU;
    const saldoBank = metrics.bankMasuk - metrics.bankKeluar;

    // 2. CREATE WORKBOOK
    const wb = XLSX.utils.book_new();

    // SHEET 1: RINGKASAN
    const summaryData = [
      ["LAPORAN AUDIT REKONSILIASI KAS"],
      ["Periode:", `${sDate.toLocaleDateString('id-ID')} s/d ${eDate.toLocaleDateString('id-ID')}`],
      [],
      ["PARAMETER", "BUKU KAS UMUM (BKU)", "REKENING KORAN (BANK)", "SELISIH"],
      ["Total Penerimaan (inc. Saldo Awal)", metrics.saldoAwal + metrics.penerimaanBKU, metrics.bankMasuk, (metrics.saldoAwal + metrics.penerimaanBKU) - metrics.bankMasuk],
      ["Total Pengeluaran", metrics.pengeluaranBKU, metrics.bankKeluar, metrics.pengeluaranBKU - metrics.bankKeluar],
      ["SALDO AKHIR", saldoBKU, saldoBank, saldoBKU - saldoBank],
      [],
      ["KESIMPULAN AUDIT:", (Math.abs(saldoBKU - saldoBank) < 100) ? "SINKRON" : "TERDAPAT SELISIH"]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, "Ringkasan Audit");

    // SHEET 2: OUTSTANDING BKU
    const outstandingData = unmatchedBKU.map(item => ({
      Tanggal: item.tanggal ? fmtDate(item.tanggal) : '-',
      Tipe: item.tipe,
      Nomor: item.bukti,
      Keterangan: item.uraian,
      Nilai: Number(item.nilai)
    }));
    const wsOutstanding = XLSX.utils.json_to_sheet(outstandingData);
    XLSX.utils.book_append_sheet(wb, wsOutstanding, "Outstanding BKU");

    // SHEET 3: UNIDENTIFIED BANK
    const unidentifiedData = unmatchedBank.map(item => ({
      Tanggal: fmtDate(item.tanggal),
      Keterangan: item.deskripsi,
      Masuk: Number(item.kredit || 0),
      Keluar: Number(item.debet || 0)
    }));
    const wsUnidentified = XLSX.utils.json_to_sheet(unidentifiedData);
    XLSX.utils.book_append_sheet(wb, wsUnidentified, "Unidentified Bank");

    // SHEET 4: ANOMALI & SELISIH
    const anomalyData = anomalies.map(item => ({
      Tanggal: fmtDate(item.tanggal),
      Keterangan: item.deskripsi,
      Nilai_Bank: Number(item.debet || item.kredit),
      Selisih: Number(item.selisih_nilai),
      Penjelasan: item.catatan_selisih || "Selisih Nominal"
    }));
    const wsAnomaly = XLSX.utils.json_to_sheet(anomalyData);
    XLSX.utils.book_append_sheet(wb, wsAnomaly, "Anomali & Selisih");

    // 3. SEND FILE
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Laporan_Audit_Rekon.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.send(buf);

  } catch (err) {
    console.error('EXPORT AUDIT ERROR:', err);
    res.status(500).json({ message: 'Gagal ekspor laporan audit', error: err.message });
  }
};

/**
 * Smart Cluster Match AI
 * Mencocokkan sekelompok mutasi bank bernilai sama secara sekuensial 1-to-1 ke BKU
 * menggunakan prisma.$transaction untuk integritas audit 100%.
 */
const clusterMatch = async (req, res) => {
  const { bankIds, startDate, endDate } = req.body;
  if (!bankIds || !Array.isArray(bankIds) || bankIds.length < 2) {
    return res.status(400).json({ message: 'Minimal 2 bank ID diperlukan untuk Cluster Match.' });
  }

  const sDate = startDate || '1970-01-01';
  const eDate = endDate   || '2099-12-31';

  try {
    // 1. Ambil bank items — hanya yang belum dicocokkan
    const numericIds = bankIds.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    const bankItems = await prisma.bank_statement.findMany({
      where: { id: { in: numericIds }, is_matched: false },
      orderBy: { tanggal: 'asc' }
    });

    if (bankItems.length === 0) {
      return res.status(404).json({ message: 'Tidak ada mutasi bank yang belum dicocokkan dari ID yang diberikan.' });
    }

    // 2. Verifikasi cluster — semua nilai harus seragam (zero-tolerance)
    const firstVal = Math.round((Number(bankItems[0].debet) || Number(bankItems[0].kredit)) * 100);
    const isHomogeneous = bankItems.every(b => {
      const v = Math.round((Number(b.debet) || Number(b.kredit)) * 100);
      return Math.abs(v - firstVal) <= 1; // toleransi 1 sen untuk floating point
    });
    if (!isHomogeneous) {
      return res.status(400).json({ message: 'Nilai mutasi bank dalam cluster tidak seragam — tidak aman untuk auto-match.' });
    }

    const targetVal = firstVal / 100;
    const isOut = Number(bankItems[0].debet) > 0; // true = PENGELUARAN, false = PENERIMAAN

    // 3. Cari kandidat BKU dengan nilai sama persis (zero tolerance ± Rp 1)
    let bkuCandidates = [];

    if (isOut) {
      // [ATURAN C.2 — PRIORITAS NETO→BRUTO]
      // Prioritas 1: cari berdasarkan nilai Neto (bruto - total potongan rincian).
      // Prioritas 2 (fallback): jika neto tidak cocok, cari berdasarkan nilai Bruto.
      // Alasan: pemindahbukuan RKUD tanpa rincian potongan dicairkan sebesar Bruto — inilah
      // sumber selisih Rp 64M/86M yang pernah terjadi. Keduanya harus dicek.
      // ORDER BY: neto match diprioritaskan (selisih neto terkecil tampil duluan).
      const sp2dList = await prisma.$queryRaw`
        WITH sp2d_neto AS (
          SELECT h.id, h.nomor, h.uraian, h.nilai_bruto, h.tanggal_pencairan, h.tanggal,
            CAST(
              CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto
              ELSE h.nilai_bruto - COALESCE(
                (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
                 WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
                CAST(h.nilai_potongan AS DECIMAL)
              ) END AS DECIMAL) as neto_val
          FROM data_sp2d h
          LEFT JOIN bank_statement b ON TRIM(CAST(h.id AS VARCHAR)) = TRIM(b.ref_bku_id)
          WHERE COALESCE(UPPER(TRIM(h.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
            AND CAST(COALESCE(h.tanggal_pencairan, h.tanggal) AS DATE) BETWEEN CAST(${sDate} AS DATE) AND CAST(${eDate} AS DATE)
        )
        SELECT CAST(id AS VARCHAR) as id, CAST(nomor AS VARCHAR) as bukti,
               CAST(uraian AS VARCHAR) as uraian,
               neto_val as nilai_neto,
               CAST(nilai_bruto AS DECIMAL) as nilai_bruto,
               neto_val as nilai,
               COALESCE(tanggal_pencairan, tanggal) as tanggal, 'SP2D' as source
        FROM sp2d_neto
        WHERE ABS(neto_val - ${targetVal}) < 1 OR ABS(CAST(nilai_bruto AS DECIMAL) - ${targetVal}) < 1
        ORDER BY ABS(neto_val - ${targetVal}) ASC, COALESCE(tanggal_pencairan, tanggal) ASC
      `;

      const potonganList = await prisma.$queryRaw`
        SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti,
               CAST(p.uraian AS VARCHAR) as uraian,
               CAST(p.nilai AS DECIMAL) as nilai,
               COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, 'POTONGAN' as source
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        LEFT JOIN bank_statement b ON TRIM(CAST(p.id AS VARCHAR)) = TRIM(b.ref_bku_id)
        WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
          AND ABS(CAST(p.nilai AS DECIMAL) - ${targetVal}) < 1
          AND CAST(COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) AS DATE) BETWEEN CAST(${sDate} AS DATE) AND CAST(${eDate} AS DATE)
        ORDER BY COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) ASC
      `;

      const pajakList = await prisma.$queryRaw`
        SELECT CAST(s.id AS VARCHAR) as id, CAST(s.nomor_bukti AS VARCHAR) as bukti,
               CAST(s.uraian AS VARCHAR) as uraian,
               CAST(s.nilai AS DECIMAL) as nilai,
               COALESCE(s.tanggal_pencairan, s.tanggal) as tanggal, 'PAJAK' as source
        FROM setoran_pajak s
        LEFT JOIN bank_statement b ON TRIM(CAST(s.id AS VARCHAR)) = TRIM(b.ref_bku_id)
        WHERE COALESCE(UPPER(TRIM(s.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
          AND ABS(CAST(s.nilai AS DECIMAL) - ${targetVal}) < 1
          AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
          AND CAST(COALESCE(s.tanggal_pencairan, s.tanggal) AS DATE) BETWEEN CAST(${sDate} AS DATE) AND CAST(${eDate} AS DATE)
        ORDER BY COALESCE(s.tanggal_pencairan, s.tanggal) ASC
      `;

      bkuCandidates = [...sp2dList, ...potonganList, ...pajakList];
    } else {
      // PENERIMAAN → Pendapatan
      const pendapatanList = await prisma.$queryRaw`
        SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_bukti AS VARCHAR) as bukti,
               CAST(p.uraian AS VARCHAR) as uraian,
               CAST(p.nilai AS DECIMAL) as nilai,
               p.tanggal, 'PENDAPATAN' as source
        FROM data_pendapatan p
        LEFT JOIN bank_statement b ON TRIM(CAST(p.id AS VARCHAR)) = TRIM(b.ref_bku_id)
        WHERE COALESCE(UPPER(TRIM(p.status_rekon)), '') NOT LIKE '%SUDAH%' AND b.id IS NULL
          AND COALESCE(p.nilai, 0) > 0
          AND ABS(CAST(p.nilai AS DECIMAL) - ${targetVal}) < 1
          AND CAST(p.tanggal AS DATE) BETWEEN CAST(${sDate} AS DATE) AND CAST(${eDate} AS DATE)
        ORDER BY p.tanggal ASC
      `;
      bkuCandidates = pendapatanList;
    }

    if (bkuCandidates.length === 0) {
      return res.status(404).json({
        message: `Tidak ada kandidat BKU dengan nilai Rp ${new Intl.NumberFormat('id-ID').format(targetVal)} yang tersedia.`,
        needed: bankItems.length, available: 0
      });
    }

    // 4. Date-Aware H±1 Pairing — PENERIMAAN hanya dipasangkan dengan BKU dalam jendela ±1 hari
    //    PENGELUARAN: tanggal tidak difilter (SP2D/POTONGAN sering beda hari dari bank)
    //    safeTs: geser ke WIT (GMT+9) sebelum ekstrak tanggal — cegah shift 1 hari akibat UTC storage
    const WIT_OFFSET_MS = 9 * 60 * 60 * 1000;
    const safeTs = (d) => {
      if (!d) return 0;
      const raw = d instanceof Date ? d : new Date(String(d));
      if (isNaN(raw.getTime())) return 0;
      const witDate = new Date(raw.getTime() + WIT_OFFSET_MS);
      return Date.UTC(witDate.getUTCFullYear(), witDate.getUTCMonth(), witDate.getUTCDate());
    };
    const pairs = [];
    const usedBkuIds = new Set();
    for (const bank of bankItems) {
      const bankTs = safeTs(bank.tanggal);
      const matchingBku = bkuCandidates.find(bku => {
        if (usedBkuIds.has(String(bku.id))) return false;
        if (!isOut) {
          const bkuTs = safeTs(bku.tanggal);
          const diffDays = Math.abs(bankTs - bkuTs) / 86400000;
          return diffDays <= 1.05;
        }
        return true;
      });
      if (matchingBku) {
        pairs.push({ bank, bku: matchingBku });
        usedBkuIds.add(String(matchingBku.id));
      }
    }
    // [GUARD E.3] Jika date-aware filter menghasilkan 0 pasangan, kembalikan error spesifik —
    // "Berhasil 0" adalah kontradiksi logika yang menyesatkan operator.
    if (pairs.length === 0) {
      return res.status(422).json({
        message: `Tidak ada pasangan yang memenuhi syarat${!isOut ? ' jendela H±1' : ''}. ` +
          `Tersedia ${bkuCandidates.length} kandidat BKU tapi tidak ada yang memiliki tanggal cocok. ` +
          `Periksa rentang tanggal filter atau lakukan pencocokan manual.`,
        needed: bankItems.length, available: bkuCandidates.length, pairsFound: 0
      });
    }

    let matched = 0;
    // Identitas pelaksana dari JWT (authMiddleware menetapkan req.user)
    const pelaksana = req.user?.username || req.user?.nama || req.user?.name || 'SYSTEM';
    const tglEksekusi = new Date().toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jayapura', day: '2-digit', month: '2-digit', year: 'numeric'
    });

    await prisma.$transaction(async (tx) => {
      for (const { bank, bku } of pairs) {
        const bkuId = String(bku.id);
        const bankAmt = Number(bank.debet) || Number(bank.kredit);

        // [ATURAN C.2] Tentukan apakah match via Neto (normal) atau Bruto (fallback pemindahbukuan)
        let matchedBkuValue = Number(bku.nilai);
        let sp2dStatus = 'SUDAH';
        if (bku.source === 'SP2D') {
          const netoV  = Number(bku.nilai_neto != null ? bku.nilai_neto : bku.nilai);
          const brutoV = Number(bku.nilai_bruto) || netoV;
          const isNetoMatch = Math.abs(netoV - bankAmt) < 1;
          matchedBkuValue = isNetoMatch ? netoV : brutoV;
          sp2dStatus = isNetoMatch ? 'SUDAH' : 'SUDAH_BRUTO';
        }

        const selisih    = matchedBkuValue - bankAmt;
        const absSelisih = Math.abs(selisih);

        // [ATURAN C.4 + E.5] tanggal_pencairan diambil dari tanggal mutasi bank
        // (momen uang benar-benar keluar/masuk kas daerah — bukan tanggal SP2D)
        const tglPencairan = bank.tanggal ? new Date(bank.tanggal) : new Date();

        // [ATURAN E.3] keterangan_rekon wajib ada sebagai audit trail
        const keteranganRekon =
          `Cluster AI (${tglEksekusi}) oleh ${pelaksana} — ` +
          `Bank ID ${bank.id}: Rp ${fmtIDR(bankAmt)}, tgl ${fmtDate(bank.tanggal) || '-'}` +
          (bku.source === 'SP2D' && sp2dStatus === 'SUDAH_BRUTO' ? ' [MATCH BRUTO]' : '');

        // 1. Update bank_statement
        await tx.bank_statement.update({
          where: { id: bank.id },
          data: {
            is_matched: true,
            ref_bku_id: bkuId,
            match_type: bku.source === 'SP2D' && sp2dStatus === 'SUDAH_BRUTO'
              ? 'CLUSTER_AI_BRUTO' : 'CLUSTER_AI',
            selisih_nilai: absSelisih > 0.01 ? selisih : 0,
            catatan_selisih: absSelisih > 0.01
              ? `Selisih Rp ${fmtIDR(selisih)} [CLUSTER_AI]` : null
          }
        });

        // 2. Update BKU — tulis tanggal_pencairan & keterangan_rekon (Aturan C.4, E.3, E.5)
        const bkuBase = {
          selisih_rekon:     absSelisih > 0.01 ? selisih : 0,
          tanggal_pencairan: tglPencairan,
          keterangan_rekon:  keteranganRekon
        };
        if (bku.source === 'SP2D') {
          await tx.data_sp2d.update({
            where: { id: bkuId },
            data: { status_rekon: sp2dStatus, ...bkuBase }
          });
          if (sp2dStatus === 'SUDAH_BRUTO') {
            await cascadeSudahBrutoToPotongan(tx, bkuId, fmtDate(tglPencairan));
          }
        } else if (bku.source === 'POTONGAN') {
          await tx.data_sp2d_potongan.update({
            where: { id: bkuId },
            data: { status_rekon: 'SUDAH', ...bkuBase }
          });
        } else if (bku.source === 'PAJAK') {
          await tx.setoran_pajak.update({
            where: { id: bkuId },
            data: { status_rekon: 'SUDAH', ...bkuBase }
          });
        } else if (bku.source === 'PENDAPATAN') {
          await tx.data_pendapatan.update({
            where: { id: bkuId },
            data: { status_rekon: 'SUDAH', ...bkuBase }
          });
        }
        matched++;
      }
    });

    // [ATURAN E.3] Audit log — best-effort, tidak membatalkan match jika log gagal
    try {
      await prisma.log_aktivitas.create({
        data: {
          user_pelaksana: pelaksana,
          aksi: 'CLUSTER_MATCH',
          detail: `Cluster AI: ${matched} cocok dari ${bankItems.length} bank | ` +
            `Nilai Rp ${fmtIDR(targetVal)} | Mode: ${isOut ? 'PENGELUARAN' : 'PENERIMAAN (H±1)'} | ` +
            `Bank IDs: [${pairs.map(p => p.bank.id).join(',')}] | ` +
            `BKU IDs: [${pairs.map(p => p.bku.id).join(',')}]`
        }
      });
    } catch (logErr) {
      console.warn('[CLUSTER_AI] log_aktivitas gagal (non-fatal):', logErr.message);
    }

    const remaining = bankItems.length - matched;
    const isPartial = remaining > 0;
    const dateMode = isOut ? 'PENGELUARAN (no-date-filter)' : 'PENERIMAAN (H±1)';
    console.log(`[CLUSTER_AI] matched=${matched}/${bankItems.length} | candidates=${bkuCandidates.length} | pairs=${pairs.length} | mode=${dateMode} | partial=${isPartial} | value=Rp${targetVal}`);
    res.json({
      matched,
      total: bankItems.length,
      available: bkuCandidates.length,
      remaining,
      isPartial,
      value: targetVal,
      message: isPartial
        ? `Rekon Parsial Berhasil! Cocok ${matched} dari ${bankItems.length} transaksi. Sisa ${remaining} bank belum memiliki BKU di database.`
        : `${matched} pasang data berhasil direkonsiliasi oleh Neural Cluster AI.`
    });

  } catch (err) {
    console.error('[CLUSTER_AI] Error:', err);
    if (err.code === 'P2025') {
      return res.status(404).json({ message: 'Salah satu data tidak ditemukan selama transaksi.', error: err.message });
    }
    res.status(500).json({ message: 'Gagal memproses Cluster Match.', error: err.message });
  }
};


const getPotonganMengendap = async (req, res) => {
  try {
    const { opd, bulan } = req.query;

    let whereClause = {
      status_rekon: 'BELUM',
      OR: [
        { uraian: { contains: 'lainnya', mode: 'insensitive' } },
        { keterangan: { contains: 'lainnya', mode: 'insensitive' } }
      ]
    };
    
    const sp2dFilter = {};
    if (opd) sp2dFilter.opd = opd;
    if (bulan && bulan !== '0') {
      const b = Number(bulan);
      const year = req.query.tahun ? Number(req.query.tahun) : 2026;
      sp2dFilter.tanggal = {
        gte: new Date(year, b - 1, 1),
        lt: new Date(year, b, 1)
      };
    }
    
    if (Object.keys(sp2dFilter).length > 0) {
      whereClause.sp2d = sp2dFilter;
    }

    const records = await prisma.data_sp2d_potongan.findMany({
      where: whereClause,
      include: {
        sp2d: {
          select: {
            nomor: true,
            tanggal: true,
            opd: true
          }
        }
      },
      orderBy: {
        sp2d: {
          tanggal: 'desc'
        }
      }
    });

    const formatted = records.map(r => ({
      id: r.id,
      keterangan: r.uraian || r.keterangan || '-',
      nilai: Number(r.nilai) || 0,
      no_sp2d: r.sp2d?.nomor || r.nomor_sp2d || '-',
      tanggal_sp2d: r.sp2d?.tanggal || null,
      opd: r.sp2d?.opd || r.opd || '-',
      status_rekon: r.status_rekon
    }));

    res.json(formatted);
  } catch (err) {
    console.error('Error in getPotonganMengendap:', err);
    res.status(500).json({ message: 'Gagal mengambil data potongan mengendap', error: err.message });
  }
};

module.exports = {
  getPotonganMengendap,
  getReconciliationData,
  runMagicMatch,
  getSuggestions,
  importBankData,
  undoMatch,
  matchIndividual,
  matchMultiple,
  getBankStatements,
  deleteBankItem,
  deleteBankByDateRange,
  getAnomalies,
  getBalanceComparison,
  getDiscrepancyReport,
  getMatchedPotonganReport,
  getPotonganIntegrity,
  bulkMatchByValue,
  bulkMatchSmart,
  undoMatchBatch,
  getResetPreview,
  resetAllReconciliation,
  resetAllReconciliation,
  resetReconciliationByDateRange,
  saveResolution,
  exportReconciliationAudit,
  getSmartMatchProgress,
  clusterMatch
};