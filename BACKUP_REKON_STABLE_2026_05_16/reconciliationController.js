const prisma = require('../prismaClient');
const { parseDateSafe } = require('../utils/dateUtils');

const fmtIDR = (n) =>
  new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(n) || 0);

const endOfDay = (d) => {
  const date = new Date(d);
  date.setHours(23, 59, 59, 999);
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
  const tgl = raw && !isNaN(raw.getTime()) ? raw.toISOString().split('T')[0] : '-';
  const desk = String(bankItem?.deskripsi || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
  const core = `Selisih rekon: Rp ${fmtIDR(selisih)} (Mutasi bank Rp ${fmtIDR(bankAmount)} vs BKU Rp ${fmtIDR(
    bkuAmount
  )}, tgl bank ${tgl})`;
  return (desk ? `${core}. Uraian bank: ${desk}` : core).slice(0, 2000);
}

function appendPotonganKeterangan(existing, block) {
  const base = String(existing || '').trim();
  const sep = '\n--- Catatan rekonsiliasi ---\n';
  return (base ? `${base}${sep}${block}` : block).slice(0, 4000);
}

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
    finalCatatan = catatanSistem 
      ? `${catatanSistem} | Catatan Admin: ${keterangan_admin}` 
      : `Catatan Admin: ${keterangan_admin}`;
  }

  const updates = [];
  const tanggal_pencairan = bankItem.tanggal ? new Date(bankItem.tanggal) : new Date();

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

    updates.push(prisma.data_sp2d_potongan.updateMany({
      where: { id_sp2d: idStr },
      data: { 
        status_rekon: finalStatus,
        tanggal_pencairan,
        keterangan_rekon: finalCatatan || `[LOG] Induk SP2D cair pada ${tanggal_pencairan.toISOString().split('T')[0]}`
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
  const { startDate, endDate, opd, search, status } = req.query;
  const sDate = startDate || '1970-01-01';
  const eDate = endDate || '2099-12-31';

  try {
    const bankWhere = {
      tanggal: {
        gte: parseDateSafe(sDate),
        lte: parseDateSafe(eDate)
      }
    };

    if (search) bankWhere.deskripsi = { contains: search, mode: 'insensitive' };
    if (status === 'BELUM') bankWhere.is_matched = false;
    if (status === 'SUDAH') bankWhere.is_matched = true;

    const bank = await prisma.bank_statement.findMany({
      where: bankWhere,
      orderBy: { tanggal: 'asc' }
    });
    
    // Logika filter BKU yang lebih toleran (Menyertasi NULL sebagai BELUM)
    let statusFilter = (alias = '') => {
      const pfx = alias ? `${alias}.` : '';
      if (status === 'BELUM') return `AND (${pfx}status_rekon = 'BELUM' OR ${pfx}status_rekon IS NULL)`;
      if (status === 'SUDAH') return `AND ${pfx}status_rekon LIKE 'SUDAH%'`;
      if (status === 'SELISIH') return `AND ${pfx}status_rekon LIKE '%ANOMALI%'`;
      return '';
    };

    const opdFilter = opd ? `AND opd = '${opd}'` : '';
    const searchFilter = search ? `AND (nomor ILIKE '%${search}%' OR uraian ILIKE '%${search}%')` : '';

    // 1. Fetch Summary Data (Global for the period)
    // NEW: Including Deductions in the summary to match 'Strict Independence' logic
    const summaryAgg = await prisma.$queryRawUnsafe(`
      SELECT 
        SUM(CASE WHEN tipe = 'KELUAR' THEN nilai ELSE 0 END) as total_keluar,
        SUM(CASE WHEN tipe = 'MASUK' THEN nilai ELSE 0 END) as total_masuk,
        SUM(CASE WHEN tipe = 'KELUAR' AND status_rekon = 'BELUM' THEN nilai ELSE 0 END) as unmatched_keluar,
        SUM(CASE WHEN tipe = 'MASUK' AND status_rekon = 'BELUM' THEN nilai ELSE 0 END) as unmatched_masuk
      FROM (
        -- SP2D (Always Neto for summary if we include deductions separately)
        SELECT (nilai_bruto - COALESCE(pot.total, 0)) as nilai, 'KELUAR' as tipe, COALESCE(s.status_rekon, 'BELUM') as status_rekon 
        FROM data_sp2d s
        LEFT JOIN (SELECT id_sp2d, SUM(nilai) as total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
        WHERE (s.tanggal_pencairan >= '${sDate}' AND s.tanggal_pencairan <= '${eDate}')
           OR (s.tanggal_pencairan IS NULL AND s.tanggal >= '${sDate}' AND s.tanggal <= '${eDate}')
        
        UNION ALL
        -- Rincian Potongan (Now independent)
        SELECT p.nilai, 'KELUAR' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE (s.tanggal_pencairan >= '${sDate}' AND s.tanggal_pencairan <= '${eDate}')
           OR (s.tanggal_pencairan IS NULL AND s.tanggal >= '${sDate}' AND s.tanggal <= '${eDate}')

        UNION ALL
        SELECT nilai, 'MASUK' as tipe, COALESCE(status_rekon, 'BELUM') as status_rekon 
        FROM data_pendapatan 
        WHERE tanggal >= '${sDate}' AND tanggal <= '${eDate}'
        
        UNION ALL
        SELECT nilai, 'KELUAR' as tipe, COALESCE(status_rekon, 'BELUM') as status_rekon 
        FROM setoran_pajak s
        WHERE tanggal >= '${sDate}' AND tanggal <= '${eDate}'
        AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
      ) as global_bku
    `);

    const s = summaryAgg[0];
    const totalBkuKeluarGlobal = Number(s.total_keluar || 0);
    const totalBkuUnmatchedGlobal = Number(s.unmatched_keluar || 0);
    const totalIncomeUnmatchedGlobal = Number(s.unmatched_masuk || 0);

    // 2. Fetch Bank Summary (Global)
    const bankSummary = await prisma.bank_statement.aggregate({
      where: {
        tanggal: { gte: parseDateSafe(sDate), lte: parseDateSafe(eDate) }
      },
      _sum: { debet: true, kredit: true },
      _count: { id: true, is_matched: true }
    });

    const bankMatchedCount = await prisma.bank_statement.count({
      where: {
        tanggal: { gte: parseDateSafe(sDate), lte: parseDateSafe(eDate) },
        is_matched: true
      }
    });

    // 3. Fetch Filtered Data for Table
    // Optimized: Using LEFT JOIN for deductions instead of correlated subquery
    const bku = await prisma.$queryRawUnsafe(`
      SELECT * FROM (
        SELECT
          s.id::text,
          COALESCE(s.tanggal_pencairan, s.tanggal) as tanggal,
          s.nomor as bukti,
          s.uraian,
          CAST(CASE 
            WHEN s.status_rekon = 'SUDAH_BRUTO' THEN s.nilai_bruto 
            ELSE (s.nilai_bruto - COALESCE(pot.total_nilai, 0)) 
          END AS DECIMAL) as nilai,
          'KELUAR' as tipe,
          COALESCE(s.status_rekon, 'BELUM') as status_rekon,
          'SP2D' as source,
          COALESCE(s.selisih_rekon, 0)::numeric AS selisih_rekon,
          s.keterangan_rekon,
          s.id as id_sp2d,
          s.opd
        FROM data_sp2d s
        LEFT JOIN (
          SELECT id_sp2d, SUM(nilai) as total_nilai 
          FROM data_sp2d_potongan 
          GROUP BY id_sp2d
        ) pot ON s.id = pot.id_sp2d
        WHERE ((s.tanggal_pencairan >= '${sDate}' AND s.tanggal_pencairan <= '${eDate}')
           OR (s.tanggal_pencairan IS NULL AND s.tanggal >= '${sDate}' AND s.tanggal <= '${eDate}'))
           ${statusFilter('s')} ${opdFilter} ${searchFilter}
        
        UNION ALL
        
        SELECT
          p.id::text as id,
          p.tanggal,
          p.nomor_bukti as bukti,
          p.uraian,
          p.nilai,
          'MASUK' as tipe,
          COALESCE(p.status_rekon, 'BELUM') as status_rekon,
          'PENDAPATAN' as source,
          COALESCE(p.selisih_rekon, 0)::numeric AS selisih_rekon,
          p.keterangan_rekon,
          NULL as id_sp2d,
          'BENDAHARA' as opd
        FROM data_pendapatan p
        WHERE p.tanggal >= '${sDate}' AND p.tanggal <= '${eDate}' ${statusFilter('p')} ${searchFilter}
        
        UNION ALL
        
        SELECT
          s.id::text as id,
          s.tanggal,
          s.nomor_bukti as bukti,
          s.uraian,
          s.nilai,
          'KELUAR' as tipe,
          COALESCE(s.status_rekon, 'BELUM') as status_rekon,
          'SETORAN' as source,
          COALESCE(s.selisih_rekon, 0)::numeric AS selisih_rekon,
          s.keterangan_rekon,
          NULL as id_sp2d,
          opd
        FROM setoran_pajak s
        WHERE s.tanggal >= '${sDate}' AND s.tanggal <= '${eDate}' ${statusFilter('s')} ${opdFilter} ${searchFilter}
        AND NOT EXISTS (
          SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti
        )
        
        UNION ALL
        
        SELECT
          p.id::text,
          COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal,
          p.nomor_sp2d as bukti,
          p.uraian,
          p.nilai,
          'KELUAR' as tipe,
          COALESCE(p.status_rekon, 'BELUM') as status_rekon,
          'POTONGAN' as source,
          COALESCE(p.selisih_rekon, 0)::numeric AS selisih_rekon,
          p.keterangan_rekon,
          p.id_sp2d,
          p.opd
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE ((s.tanggal_pencairan >= '${sDate}' AND s.tanggal_pencairan <= '${eDate}')
           OR (s.tanggal_pencairan IS NULL AND s.tanggal >= '${sDate}' AND s.tanggal <= '${eDate}'))
           ${statusFilter('p')} ${opdFilter} ${searchFilter}
      ) combined
      ORDER BY tanggal ASC
    `);

    const matchedCount = bank.filter(b => b.is_matched).length;
    const unmatchedCount = bank.filter(b => !b.is_matched).length;
    const totalDebet = bank.reduce((sum, b) => sum + Number(b.debet), 0);
    const totalKredit = bank.reduce((sum, b) => sum + Number(b.kredit), 0);
    const totalUnmatchedVal = bank.filter(b => !b.is_matched).reduce((sum, b) => sum + (Number(b.debet) || Number(b.kredit)), 0);

    const bkuSanitized = bku.map(item => {
      let cleanUraian = String(item.uraian || '').trim();
      const auditTags = [
        /\[BELUM COCOK\]:?\s?/gi,
        /\[Rekon\]:?\s?/gi,
        /!!!\s?HIGH\s?ANOMALI:?\s?/gi,
        /!!!\s?ANOMALI:?\s?/gi,
        /\[PENYESUAIAN\s?BRUTO\]:?\s?/gi
      ];
      auditTags.forEach(tag => {
        cleanUraian = cleanUraian.replace(tag, '');
      });
      return { ...item, uraian: cleanUraian.trim() || item.uraian };
    });

    const totalBkuMasuk = bku.filter(i => i.tipe === 'MASUK').reduce((sum, i) => sum + Number(i.nilai), 0);
    const totalBkuKeluar = bku.filter(i => i.tipe === 'KELUAR' || i.tipe === 'POTONGAN' || i.tipe === 'PAJAK').reduce((sum, i) => sum + Number(i.nilai), 0);
    const totalBkuUnmatched = bku.filter(i => i.status_rekon === 'BELUM').reduce((sum, i) => sum + Number(i.nilai), 0);
    res.json({ 
      bank, 
      bku: bkuSanitized,
      summary: {
        totalBku: totalBkuKeluarGlobal,
        totalUnmatched: totalBkuUnmatchedGlobal,
        totalIncomeUnmatched: totalIncomeUnmatchedGlobal,
        matchedCount: bankMatchedCount,
        unmatchedCount: bankSummary._count.id - bankMatchedCount,
        accuracy: bankSummary._count.id > 0 ? Math.round((bankMatchedCount / bankSummary._count.id) * 100) : 0,
        bankBalance: Number(bankSummary._sum.kredit || 0) - Number(bankSummary._sum.debet || 0),
        totalBankDebet: Number(bankSummary._sum.debet || 0),
        totalBankKredit: Number(bankSummary._sum.kredit || 0),
        totalBkuMasuk: Number(s.total_masuk || 0),
        bkuVariance: Number(s.total_masuk || 0) - totalBkuKeluarGlobal,
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server Error', error: err.message });
  }
};

/**
 * Intelligent Matching Engine
 */
const runMagicMatch = async (req, res) => {
  const { startDate, endDate } = req.body;
  const sDate = startDate || '1970-01-01';
  const eDate = endDate || '2099-12-31';

  console.log(`[DEBUG] runMagicMatch input: ${sDate} to ${eDate}`);

  try {
    const bankItems = await prisma.bank_statement.findMany({ 
      where: { 
        is_matched: false,
        tanggal: {
          gte: parseDateSafe(sDate),
          lte: parseDateSafe(eDate)
        }
      },
      take: 5000,
      orderBy: { tanggal: 'asc' }
    });
    
    const bkuItems = await prisma.$queryRaw`
        SELECT CAST(h.id AS VARCHAR) as id, CAST(h.nomor AS VARCHAR) as bukti, CAST(h.uraian AS VARCHAR) as uraian, 
               CAST(CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.nilai_bruto ELSE (h.nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0)) END AS DECIMAL) as nilai, 
               CAST(h.nilai_bruto AS DECIMAL) as nilai_bruto, COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal, 'KELUAR' as tipe 
       FROM data_sp2d h
       LEFT JOIN bank_statement b ON CAST(h.id AS VARCHAR) = b.ref_bku_id
       WHERE h.status_rekon = 'BELUM' AND b.id IS NULL AND CAST(COALESCE(h.tanggal_pencairan, h.tanggal) AS DATE) BETWEEN CAST(${parseDateSafe(sDate)} AS DATE) AND CAST(${parseDateSafe(eDate)} AS DATE)
       
       UNION ALL
       
        SELECT CAST(s.id AS VARCHAR) as id, CAST(s.nomor_bukti AS VARCHAR) as bukti, CAST(s.uraian AS VARCHAR) as uraian, 
               CAST(s.nilai AS DECIMAL) as nilai, CAST(s.nilai AS DECIMAL) as nilai_bruto, s.tanggal as tanggal, 'PAJAK' as tipe 
        FROM setoran_pajak s
        LEFT JOIN bank_statement b ON CAST(s.id AS VARCHAR) = b.ref_bku_id
        WHERE s.status_rekon = 'BELUM' AND b.id IS NULL AND CAST(s.tanggal AS DATE) BETWEEN CAST(${parseDateSafe(sDate)} AS DATE) AND CAST(${parseDateSafe(eDate)} AS DATE)
        AND NOT EXISTS (
          SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti
        )
       
       UNION ALL
       
        SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_bukti AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, 
               CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto, p.tanggal as tanggal, 'MASUK' as tipe 
        FROM data_pendapatan p
        LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
        WHERE p.status_rekon = 'BELUM' AND b.id IS NULL AND CAST(p.tanggal AS DATE) BETWEEN CAST(${parseDateSafe(sDate)} AS DATE) AND CAST(${parseDateSafe(eDate)} AS DATE)
       
       UNION ALL
       
       SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, 
              CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto, COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, 'POTONGAN' as tipe 
       FROM data_sp2d_potongan p
       LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
       LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
       WHERE p.status_rekon = 'BELUM' AND b.id IS NULL AND CAST(COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) AS DATE) BETWEEN CAST(${parseDateSafe(sDate)} AS DATE) AND CAST(${parseDateSafe(eDate)} AS DATE)
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
    let perfectMatchCount = 0;
    let anomalyCount = 0;
    let anomalyHighCount = 0;
    const updateTasks = [];

    for (const bankItem of bankItems) {
      const rawVal = toNum(bankItem.debet) > 0 ? toNum(bankItem.debet) : toNum(bankItem.kredit);
      const valKey = Math.round(rawVal * 100);
      const isOut = toNum(bankItem.debet) > 0;
      const bankDate = new Date(bankItem.tanggal);

      if (rawVal === 0) continue;
      
      const potentialMatches = bkuValueMap.get(valKey) || [];

      // Refined filtering on the high-precision bucket
      const candidates = potentialMatches
        .filter(bku => {
          if (bku._isMatched) return false;
          if (isOut && bku.tipe === 'MASUK') return false;
          if (!isOut && bku.tipe !== 'MASUK') return false;
          
          const bkuDate = new Date(bku.tanggal);
          if (isNaN(bkuDate.getTime())) return false;

          const diffDays = (bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24);
          
          // Strict Nomor Check
          const bankDesc = String(bankItem.deskripsi || '');
          const bkuBukti = String(bku.bukti || '');
          if (bkuBukti.length > 4 && bku.source !== 'PENDAPATAN') {
            const coreMatch = bkuBukti.match(/\d{5,}/);
            const coreNum = coreMatch ? coreMatch[0] : bkuBukti;
            const numbersInBank = bankDesc.match(/\d{5,}/g) || [];
            const hasDifferentNomor = numbersInBank.some(n => n !== coreNum && !bkuBukti.includes(n));
            if (hasDifferentNomor && !bankDesc.includes(coreNum)) return false;
          }

          const maxDays = (bku.tipe === 'MASUK') ? 5 : 7; 
          const minDays = (bku.tipe === 'MASUK') ? -5 : -1;
          return diffDays >= minDays && diffDays <= maxDays;
        })
        .sort((a, b) => {
          const refA = String(a.bukti || '').length > 5 && bankItem.deskripsi?.includes(String(a.bukti));
          const refB = String(b.bukti || '').length > 5 && bankItem.deskripsi?.includes(String(b.bukti));
          if (refA !== refB) return refA ? -1 : 1;
          const diffA = Math.abs(bankDate.getTime() - new Date(a.tanggal).getTime());
          const diffB = Math.abs(bankDate.getTime() - new Date(b.tanggal).getTime());
          return diffA - diffB;
        });

      // AMBIGUITY CHECK
      if (candidates.length > 1) {
        const mentionedMatches = candidates.filter(c => 
          String(c.bukti || '').length > 5 && bankItem.deskripsi?.includes(String(c.bukti))
        );
        if (mentionedMatches.length !== 1) continue; 
      }

      const match = candidates[0] || null;

      if (match) {
        const neto = toNum(match.nilai);
        const bruto = toNum(match.nilai_bruto);
        const closerIsBruto = Math.abs(bruto - val) < Math.abs(neto - val);
        const refAmount = closerIsBruto ? bruto : neto;
        const valDiff = val - refAmount;
        const absDiff = Math.abs(valDiff);
        let status_rekon = 'SUDAH';
        
        if (absDiff > 0) {
          const diffFmt = new Intl.NumberFormat('id-ID').format(valDiff);
          status_rekon = absDiff > 100000 ? `!!! HIGH ANOMALI (Rp ${diffFmt})` : `ANOMALI (Rp ${diffFmt})`;
          anomalyCount += 1;
          if (absDiff > 100000) anomalyHighCount += 1;
        } else {
          perfectMatchCount += 1;
        }

        updateTasks.push(prisma.bank_statement.update({
          where: { id: bankItem.id },
          data: {
            is_matched: true,
            ref_bku_id: match.id,
            selisih_nilai: absDiff > 0 ? valDiff : 0,
            catatan_selisih: absDiff > 0 ? `Selisih Rp ${new Intl.NumberFormat('id-ID').format(valDiff)}` : null,
            match_type: closerIsBruto ? 'BRUTO' : 'NETO',
          }
        }));

        const finalUpdateData = {
          status_rekon,
          selisih_rekon: absDiff > 0 ? valDiff : 0,
          keterangan_rekon: absDiff > 0 ? buildCatatanSelisihRekon(bankItem, val, refAmount, valDiff) : null,
          tanggal_pencairan: match.tanggal_pencairan || bankDate
        };

        if (match.tipe === 'KELUAR') {
          if (closerIsBruto) {
            finalUpdateData.status_rekon = 'SUDAH_BRUTO';
            finalUpdateData.keterangan_rekon = (finalUpdateData.keterangan_rekon || '') + ' [PENYESUAIAN BRUTO]';
          }
          updateTasks.push(prisma.data_sp2d.update({ where: { id: match.id }, data: finalUpdateData }));
          // REMOVED: No more cascading to deductions. Deductions must match independently.
        } else if (match.tipe === 'POTONGAN') {
          updateTasks.push(prisma.data_sp2d_potongan.update({ where: { id: match.id }, data: finalUpdateData }));
        } else if (match.tipe === 'PAJAK') {
          updateTasks.push(prisma.setoran_pajak.update({ where: { id: match.id }, data: finalUpdateData }));
        } else if (match.tipe === 'MASUK') {
          updateTasks.push(prisma.data_pendapatan.update({ where: { id: match.id }, data: finalUpdateData }));
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
          data: { keterangan: cat } // Potongan doesn't have selisih_rekon column yet, use keterangan
        }));
      } else if (bku.tipe === 'PAJAK' || bku.tipe === 'MASUK') {
        const table = bku.tipe === 'PAJAK' ? prisma.setoran_pajak : prisma.data_pendapatan;
        bkuUpdateTasks.push(table.updateMany({
          where: { id: bku.id, status_rekon: 'BELUM' },
          data: { 
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
      perfectMatchCount,
      anomalyCount,
      anomalyHighCount,
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
    const bankVal = Number(bankItem.debet) || Number(bankItem.kredit);
    const diff = bankVal - bkuValue;
    const absDiff = Math.abs(diff);
    let status_rekon = 'SUDAH';
    
    if (absDiff > 0.01) {
      const diffFmt = new Intl.NumberFormat('id-ID').format(diff);
      status_rekon = absDiff > 100000 ? `!!! HIGH ANOMALI (Rp ${diffFmt})` : `ANOMALI (Rp ${diffFmt})`;
    }

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
          ? `Selisih ${diff > 0 ? 'LEBIH' : 'KURANG'} Rp ${new Intl.NumberFormat('id-ID').format(Math.abs(diff))} [MANUAL]`
          : null,
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
  const { year } = req.body;
  const currentYear = parseInt(year) || new Date().getFullYear();
  const sDate = `${currentYear}-01-01`;
  const eDate = `${currentYear}-12-31`;

  try {
    // Reset global progress
    smartMatchProgress = {
      isOpen: true,
      total: 0,
      current: 0,
      success: 0,
      fails: 0,
      status: 'fetching',
      message: 'Menganalisa data bank...'
    };

    // 1. Fetch all unmatched Bank Statements for the year
    const bankItems = await prisma.bank_statement.findMany({
      where: {
        is_matched: false,
        tanggal: {
          gte: new Date(sDate),
          lte: new Date(endOfDay(new Date(eDate)))
        }
      }
    });

    if (bankItems.length === 0) {
      return res.json({ message: 'Tidak ada data mutasi bank yang perlu dicocokkan.', matchCount: 0 });
    }

    smartMatchProgress.total = bankItems.length;
    smartMatchProgress.status = 'matching';
    smartMatchProgress.message = `Mencocokkan ${bankItems.length} transaksi...`;

    // 2. Fetch all unmatched BKU candidates for the year
    // Optimized: Using JOIN for deductions
    const bkuItems = await prisma.$queryRawUnsafe(`
      SELECT 
        CAST(h.id AS VARCHAR) as id, 
        CAST(h.nomor AS VARCHAR) as bukti, 
        CAST(h.uraian AS VARCHAR) as uraian, 
        CAST((h.nilai_bruto - COALESCE(pot_agg.total, 0)) AS DECIMAL) as nilai,
        CAST(h.nilai_bruto AS DECIMAL) as nilai_bruto, 
        COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal, 
        'KELUAR' as tipe, 
        'SP2D' as source
      FROM data_sp2d h
      LEFT JOIN (
        SELECT id_sp2d, SUM(nilai) as total FROM data_sp2d_potongan GROUP BY id_sp2d
      ) pot_agg ON h.id = pot_agg.id_sp2d
      LEFT JOIN bank_statement b ON CAST(h.id AS VARCHAR) = b.ref_bku_id
      WHERE h.status_rekon = 'BELUM' AND b.id IS NULL AND h.tahun = ${currentYear}
      
      UNION ALL
      
      SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_bukti AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, 
             CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto, p.tanggal as tanggal, 'MASUK' as tipe, 'PENDAPATAN' as source
      FROM data_pendapatan p
      LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
      WHERE p.status_rekon = 'BELUM' AND b.id IS NULL AND p.tahun = ${currentYear}

      UNION ALL

      SELECT CAST(s.id AS VARCHAR) as id, CAST(s.nomor_bukti AS VARCHAR) as bukti, CAST(s.uraian AS VARCHAR) as uraian, 
             CAST(s.nilai AS DECIMAL) as nilai, CAST(s.nilai AS DECIMAL) as nilai_bruto, s.tanggal as tanggal, 'KELUAR' as tipe, 'SETORAN' as source
      FROM setoran_pajak s
      LEFT JOIN bank_statement b ON CAST(s.id AS VARCHAR) = b.ref_bku_id
      WHERE s.status_rekon = 'BELUM' AND b.id IS NULL AND s.tanggal >= '${sDate}' AND s.tanggal <= '${eDate}'

      UNION ALL

      SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, 
             CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto, COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, 'POTONGAN' as tipe, 'POTONGAN' as source
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
      WHERE p.status_rekon = 'BELUM' AND b.id IS NULL AND s.tahun = ${currentYear}
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

    for (const bankItem of bankItems) {
      const rawVal = toNum(bankItem.debet) > 0 ? toNum(bankItem.debet) : toNum(bankItem.kredit);
      const valKey = Math.round(rawVal * 100);
      const isOut = toNum(bankItem.debet) > 0;
      const bankDate = new Date(bankItem.tanggal);

      if (rawVal === 0) continue;
      
      const potentialMatches = bkuValueMap.get(valKey) || [];

      const candidates = potentialMatches
        .filter(bku => {
          if (bku._isMatched) return false;
          if (isOut && bku.tipe === 'MASUK') return false;
          if (!isOut && bku.tipe !== 'MASUK') return false;
          
          const bkuDate = new Date(bku.tanggal);
          if (isNaN(bkuDate.getTime())) return false;

          const diffDays = (bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24);
          
          // Strict Nomor Check
          const bankDesc = String(bankItem.deskripsi || '');
          const bkuBukti = String(bku.bukti || '');
          if (bkuBukti.length > 4 && bku.source !== 'PENDAPATAN') {
            const coreMatch = bkuBukti.match(/\d{5,}/);
            const coreNum = coreMatch ? coreMatch[0] : bkuBukti;
            const numbersInBank = bankDesc.match(/\d{5,}/g) || [];
            const hasDifferentNomor = numbersInBank.some(n => n !== coreNum && !bkuBukti.includes(n));
            if (hasDifferentNomor && !bankDesc.includes(coreNum)) return false;
          }

          const maxDays = (bku.tipe === 'MASUK') ? 5 : 7; 
          const minDays = (bku.tipe === 'MASUK') ? -5 : -1;
          return diffDays >= minDays && diffDays <= maxDays;
        })
        .sort((a, b) => {
          const refA = String(a.bukti || '').length > 5 && bankItem.deskripsi?.includes(String(a.bukti));
          const refB = String(b.bukti || '').length > 5 && bankItem.deskripsi?.includes(String(b.bukti));
          if (refA !== refB) return refA ? -1 : 1;
          return Math.abs(bankDate.getTime() - new Date(a.tanggal).getTime()) - Math.abs(bankDate.getTime() - new Date(b.tanggal).getTime());
        });

      // Ambiguity Resolution
      if (candidates.length > 1) {
        const mentioned = candidates.filter(c => String(c.bukti || '').length > 5 && bankItem.deskripsi?.includes(String(c.bukti)));
        if (mentioned.length !== 1) continue;
      }

      const match = candidates[0];
      if (match) {
        const neto = toNum(match.nilai);
        const bruto = toNum(match.nilai_bruto);
        const closerIsBruto = Math.abs(bruto - rawVal) < Math.abs(neto - rawVal);
        const refAmount = closerIsBruto ? bruto : neto;
        const valDiff = rawVal - refAmount;
        const absDiff = Math.abs(valDiff);
        
        let status_rekon = 'SUDAH';
        if (absDiff > 0.01) {
          const diffFmt = new Intl.NumberFormat('id-ID').format(valDiff);
          status_rekon = absDiff > 100000 ? `!!! HIGH ANOMALI (Rp ${diffFmt})` : `ANOMALI (Rp ${diffFmt})`;
        }

        updateTasks.push(prisma.bank_statement.update({
          where: { id: bankItem.id },
          data: {
            is_matched: true,
            ref_bku_id: match.id,
            match_type: closerIsBruto ? 'SMART_BRUTO' : 'SMART_AUTO',
            selisih_nilai: absDiff > 0.01 ? valDiff : 0,
            catatan_selisih: absDiff > 0.01 ? `Selisih Rp ${new Intl.NumberFormat('id-ID').format(valDiff)}` : null
          }
        }));

        const finalUpdateData = {
          status_rekon: (closerIsBruto && match.tipe === 'KELUAR') ? 'SUDAH_BRUTO' : status_rekon,
          selisih_rekon: absDiff > 0.01 ? valDiff : 0,
          keterangan_rekon: absDiff > 0.01 ? buildCatatanSelisihRekon(bankItem, rawVal, refAmount, valDiff) : `Auto-Matched to Bank @ ${bankItem.tanggal}`,
          tanggal_pencairan: bankDate
        };

        if (match.tipe === 'KELUAR') {
           updateTasks.push(prisma.data_sp2d.update({ where: { id: match.id }, data: finalUpdateData }));
        } else if (match.tipe === 'MASUK') {
           updateTasks.push(prisma.data_pendapatan.update({ where: { id: match.id }, data: finalUpdateData }));
        } else if (match.tipe === 'POTONGAN') {
           updateTasks.push(prisma.data_sp2d_potongan.update({ where: { id: match.id }, data: finalUpdateData }));
        } else if (match.tipe === 'PAJAK') {
           updateTasks.push(prisma.setoran_pajak.update({ where: { id: match.id }, data: finalUpdateData }));
        }

        match._isMatched = true;
        matchCount++;
      }
    }

    // Execute updates in batches and report real progress
    const BATCH_SIZE = 50;
    let processedItems = 0;
    
    // We update progress as we iterate through the loop or in chunks
    // Since updateTasks contains multiple updates per match, let's map updates back to bank items
    // But a simpler way is to update progress during the matching loop itself
    // Let's refine the matching loop to update progress every 50 items
    
    for (let i = 0; i < updateTasks.length; i += BATCH_SIZE) {
      await prisma.$transaction(updateTasks.slice(i, i + BATCH_SIZE));
      
      // REAL PROGRESS UPDATE (Based on matching loop estimates)
      // Since one match usually involves 2 updates (Bank + BKU)
      // i / 2 is a better approximation of bank items processed
      processedItems = Math.floor(i / 2); 
      smartMatchProgress.current = Math.min(processedItems, smartMatchProgress.total);
      smartMatchProgress.success = matchCount;
      smartMatchProgress.message = `Berhasil mencocokkan ${matchCount} transaksi...`;
    }

    smartMatchProgress.status = 'done';
    smartMatchProgress.current = smartMatchProgress.total;
    smartMatchProgress.message = `Selesai! ${matchCount} transaksi berhasil dicocokkan.`;

    setTimeout(() => {
      smartMatchProgress.isOpen = false;
      smartMatchProgress.status = 'idle';
    }, 5000);

    res.json({ message: `Smart Engine selesai. Berhasil mencocokkan ${matchCount} transaksi secara otomatis.`, matchCount });
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
    const ids = bankIds ? bankIds.split(',').map(id => parseInt(id)) : [parseInt(bankId)];
    const bankItems = await prisma.bank_statement.findMany({ where: { id: { in: ids } } });
    if (bankItems.length === 0) return res.status(404).json({ message: 'Bank items not found' });
    const bankDate = new Date(bankItems[0].tanggal);
    const bankDateStr = bankDate.toISOString().split('T')[0];
    
    const totalVal = bankItems.reduce((sum, item) => sum + (Number(item.debet) || Number(item.kredit)), 0);
    const isOut = bankItems.some(item => Number(item.debet) > 0);

    // Query SP2D with BOTH nilai_neto and nilai_bruto for flexible matching
    const sp2dCandidates = await prisma.$queryRaw`
      SELECT 
        CAST(h.id AS VARCHAR) as id,
        h.nomor as bukti,
        h.uraian,
        CAST(h.nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0) AS DECIMAL) as nilai_neto,
        CAST(h.nilai_bruto AS DECIMAL) as nilai_bruto,
        h.tanggal,
        h.opd,
        'KELUAR' as tipe,
        h.status_rekon
      FROM data_sp2d h
      LEFT JOIN bank_statement b ON CAST(h.id AS VARCHAR) = b.ref_bku_id
      WHERE (
        ABS(CAST(h.nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0) AS DECIMAL) - ${totalVal}) < 10000 OR
        ABS(CAST(h.nilai_bruto AS DECIMAL) - ${totalVal}) < 10000
      )
      AND h.status_rekon NOT LIKE 'SUDAH%'
      AND h.status_rekon NOT LIKE '%ANOMALI%'
      AND b.id IS NULL
      AND CAST(COALESCE(h.tanggal_pencairan, h.tanggal) AS DATE) BETWEEN (CAST(${bankDateStr} AS DATE) - INTERVAL '7 days') AND (CAST(${bankDateStr} AS DATE) + INTERVAL '1 day')
      ORDER BY ABS(CAST(h.nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0) AS DECIMAL) - ${totalVal}) ASC
      LIMIT 15
    `;

    const potonganCandidates = await prisma.$queryRaw`
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
      LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
      WHERE (
        ABS(CAST(p.nilai AS DECIMAL) - ${totalVal}) < 10000
      )
      AND p.status_rekon NOT LIKE 'SUDAH%'
      AND b.id IS NULL
      AND CAST(COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) AS DATE) BETWEEN (CAST(${bankDateStr} AS DATE) - INTERVAL '7 days') AND (CAST(${bankDateStr} AS DATE) + INTERVAL '1 day')
      ORDER BY ABS(CAST(p.nilai AS DECIMAL) - ${totalVal}) ASC
      LIMIT 15
    `;

    const pajakCandidates = await prisma.$queryRaw`
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
      LEFT JOIN bank_statement b ON CAST(s.id AS VARCHAR) = b.ref_bku_id
      WHERE (
        ABS(CAST(s.nilai AS DECIMAL) - ${totalVal}) < 10000
      )
      AND s.status_rekon NOT LIKE 'SUDAH%'
      AND b.id IS NULL
      AND CAST(COALESCE(s.tanggal_pencairan, s.tanggal) AS DATE) BETWEEN (CAST(${bankDateStr} AS DATE) - INTERVAL '5 days') AND (CAST(${bankDateStr} AS DATE) + INTERVAL '5 days')
      ORDER BY ABS(CAST(s.nilai AS DECIMAL) - ${totalVal}) ASC
      LIMIT 15
    `;

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
        'BELUM' as status_rekon
      FROM data_pendapatan p
      LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
      WHERE b.id IS NULL
      AND (p.status_rekon IS NULL OR p.status_rekon = 'BELUM')
      AND ABS(CAST(p.nilai AS DECIMAL) - ${totalVal}) < 10000
      AND CAST(p.tanggal AS DATE) BETWEEN (CAST(${bankDateStr} AS DATE) - INTERVAL '5 days') AND (CAST(${bankDateStr} AS DATE) + INTERVAL '5 days')
      ORDER BY ABS(CAST(p.nilai AS DECIMAL) - ${totalVal}) ASC
      LIMIT 10
    ` : [];

    const toNumber = (v) => { const n = Number(v?.toString()); return isNaN(n) ? 0 : n; };

    const allCandidates = [...sp2dCandidates, ...potonganCandidates, ...pajakCandidates, ...pendapatanCandidates]
      .map(c => {
        const neto = toNumber(c.nilai_neto);
        const bruto = toNumber(c.nilai_bruto);
        const selisihNeto = Math.abs(neto - totalVal);
        const selisihBruto = Math.abs(bruto - totalVal);
        const bestSelisih = Math.min(selisihNeto, selisihBruto);
        const matchMode = selisihNeto <= selisihBruto ? 'neto' : 'bruto';
        return {
          ...c,
          nilai_neto: neto,
          nilai_bruto: bruto,
          selisih: bestSelisih,
          match_mode: matchMode,    // 'neto' or 'bruto'
          is_exact: bestSelisih < 1,
          is_bruto_match: matchMode === 'bruto' && selisihBruto < 1,
          suggestion_type: bestSelisih < 1 ? 'EXACT' : 'CLOSE'
        };
      })
      .sort((a, b) => a.selisih - b.selisih);

    res.json({ 
      data: allCandidates, 
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

    const diff = totalBankVal - bkuVal;
    const absDiff = Math.abs(diff);
    let status_rekon = 'SUDAH';
    if (absDiff > 0) {
      const diffFmt = new Intl.NumberFormat('id-ID').format(diff);
      status_rekon = absDiff > 100000 ? `!!! HIGH ANOMALI (Rp ${diffFmt})` : `ANOMALI (Rp ${diffFmt})`;
    }

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
      `${new Date(e.tanggal).toISOString().split('T')[0]}_${String(e.deskripsi || '').trim()}_${Number(e.saldo_akhir).toFixed(2)}`
    ));

    const toCreate = [];
    for (const item of data) {
      const dateObj = parseDateSafe(item.TANGGAL);
      if (isNaN(dateObj.getTime())) continue;

      const dateStr = dateObj.toISOString().split('T')[0];
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

  if (bkuRefs.length > 0) {
    const data = { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null, tanggal_pencairan: null };
    
    // Process each BKU ref
    for (const refId of bkuRefs) {
      const sp2d = await prisma.data_sp2d.findUnique({ where: { id: refId } });
      await Promise.all([
        prisma.data_sp2d.updateMany({ where: { id: refId }, data }).catch(() => {}),
        prisma.data_pendapatan.updateMany({ where: { id: refId }, data }).catch(() => {}),
        prisma.data_sp2d_potongan.updateMany({ where: { id: refId }, data }).catch(() => {}),
        prisma.setoran_pajak.updateMany({ where: { id: refId }, data }).catch(() => {}),
        ...(sp2d ? [prisma.data_sp2d_potongan.updateMany({ where: { nomor_sp2d: sp2d.nomor }, data }).catch(() => {})] : [])
      ]);
    }
  }

  await prisma.bank_statement.updateMany({
    where: { id: { in: bankIds } },
    data: { 
      is_matched: false, 
      ref_bku_id: null,
      match_type: null,
      selisih_nilai: 0,
      catatan_selisih: null
    }
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

      const updateData = { status_rekon: 'SUDAH', selisih_rekon: 0, keterangan_rekon: `Matched by Ref: ${ref}` };
      await Promise.all([
        prisma.data_sp2d.updateMany({ where: { nomor: { contains: ref, mode: 'insensitive' } }, data: updateData }),
        prisma.data_pendapatan.updateMany({ where: { nomor_bukti: { contains: ref, mode: 'insensitive' } }, data: updateData }),
        prisma.data_sp2d_potongan.updateMany({ where: { nomor_sp2d: { contains: ref, mode: 'insensitive' } }, data: updateData }),
        prisma.setoran_pajak.updateMany({ where: { nomor_bukti: { contains: ref, mode: 'insensitive' } }, data: updateData })
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

    await prisma.bank_statement.updateMany({
      where: { id: { in: bankIds.map(id => parseInt(id)) } },
      data: {
        is_matched: true,
        ref_bku_id: targetBkuId,
        match_type: bankIds.length > 1 ? 'MULTI' : 'INDIVIDUAL',
        catatan_selisih: keterangan || 'Bulk Match'
      }
    });

    const updateData = { status_rekon: 'SUDAH', selisih_rekon: 0, keterangan_rekon: keterangan || 'Bulk Match' };
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

    const [data, total] = await Promise.all([
      prisma.bank_statement.findMany({
        where,
        orderBy: [{ tanggal: 'desc' }, { id: 'desc' }],
        skip,
        take
      }),
      prisma.bank_statement.count({ where })
    ]);

    res.json({
      data,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / take)
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
      dateFilter = {
        gte: new Date(targetTahun, targetBulan - 1, 1),
        lt: new Date(targetTahun, targetBulan, 1)
      };
    }

    // 1. SP2D Belum Rekon
    const sp2dWhere = { 
      tahun: targetTahun, 
      status_rekon: 'BELUM',
      ...(targetBulan ? { tanggal_pencairan: dateFilter } : {})
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
        SELECT p.id::text as id, p.tanggal, p.nomor_bukti, p.uraian, p.nilai::numeric, p.id_sumber_dana, 'PENDAPATAN' as tipe
        FROM data_pendapatan p
        LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
        WHERE p.tahun = ${targetTahun} ${targetBulan ? `AND EXTRACT(MONTH FROM p.tanggal) = ${targetBulan}` : ''} 
        AND b.id IS NULL AND p.status_rekon = 'BELUM'
        ORDER BY tanggal DESC
        LIMIT ${limit}
      `);

      const countPendapatan = await prisma.$queryRawUnsafe(`
        SELECT COUNT(*)::int as count 
        FROM data_pendapatan p
        LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
        WHERE p.tahun = ${targetTahun} ${targetBulan ? `AND EXTRACT(MONTH FROM p.tanggal) = ${targetBulan}` : ''} 
        AND b.id IS NULL AND p.status_rekon = 'BELUM'
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
        CAST(COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) AS DATE) as tanggal, 
        p.nomor_sp2d as nomor_bukti, p.uraian, p.nilai::numeric, p.id_sumber_dana, 'SELISIH_POTONGAN' as tipe, p.status_rekon,
        COALESCE(p.selisih_rekon, 0)::numeric as selisih_rekon, p.keterangan_rekon
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
      WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${targetTahun} 
      ${targetBulan ? `AND EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${targetBulan}` : ''}
      AND (
        p.status_rekon = 'BELUM' 
        OR p.status_rekon LIKE 'ANOMALI%'
        OR (p.status_rekon = 'SUDAH' AND b.id IS NULL)
        OR ABS(COALESCE(p.selisih_rekon, 0)) > 1
      )
      
      UNION ALL
      
      SELECT 
        s.id::text as id, CAST(s.tanggal AS DATE) as tanggal, s.nomor_bukti, s.uraian, s.nilai::numeric, s.id_sumber_dana, 'SELISIH_PAJAK' as tipe, s.status_rekon,
        COALESCE(s.selisih_rekon, 0)::numeric as selisih_rekon, s.keterangan_rekon
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
          LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
          LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
          WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal)) = ${targetTahun} 
          ${targetBulan ? `AND EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, s.tanggal)) = ${targetBulan}` : ''}
          AND (
            p.status_rekon = 'BELUM' 
            OR p.status_rekon LIKE 'ANOMALI%'
            OR (p.status_rekon = 'SUDAH' AND b.id IS NULL)
          )
          
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
          p.nilai::numeric as nilai, p.status_rekon, CAST(COALESCE(p.tanggal_pencairan, s.tanggal) AS TEXT) as tanggal,
          p.uraian, COALESCE(p.opd, '') as opd
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
        WHERE p.status_rekon NOT IN ('BELUM')
          AND b.id IS NULL
          AND EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal)) = ${targetTahun}
          ${targetBulan ? `AND EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, s.tanggal)) = ${targetBulan}` : ''}

        UNION ALL

        SELECT
          'PENDAPATAN' as tipe, pnd.id::text as id, pnd.nomor_bukti as bukti,
          pnd.nilai::numeric as nilai, pnd.status_rekon, CAST(pnd.tanggal AS TEXT) as tanggal,
          pnd.uraian, '' as opd
        FROM data_pendapatan pnd
        LEFT JOIN bank_statement b ON pnd.id::text = b.ref_bku_id
        WHERE pnd.status_rekon NOT IN ('BELUM')
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
          WHERE p.status_rekon NOT IN ('BELUM') AND b.id IS NULL
          AND EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal)) = ${targetTahun}
          ${targetBulan ? `AND EXTRACT(MONTH FROM COALESCE(p.tanggal_pencairan, s.tanggal)) = ${targetBulan}` : ''}
          UNION ALL
          SELECT pnd.id::text FROM data_pendapatan pnd
          LEFT JOIN bank_statement b ON pnd.id::text = b.ref_bku_id
          WHERE pnd.status_rekon NOT IN ('BELUM') AND b.id IS NULL
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
    const isoDate = targetDate.toISOString().split('T')[0];
    const startOfYear = `${currentYear}-01-01`;

    const startOfYearDate = new Date(currentYear, 0, 1);
    const endOfPeriodDate = new Date(targetDate);
    endOfPeriodDate.setHours(23, 59, 59, 999);

    console.log(`[DEBUG] getBalanceComparison date: ${isoDate}, targetDate: ${targetDate}`);

    // 1. BKU Metrics - INDIVIDUAL QUERIES FOR BETTER DEBUGGING
    let sa_sum = 0, inc_sum = 0, exp_sum = 0, tax_pot_sum = 0, adj_in_sum = 0, adj_out_sum = 0;

    try {
      const sa_res = await prisma.saldo_awal.aggregate({ _sum: { nilai: true } });
      sa_sum = Number(sa_res._sum.nilai || 0);
    } catch (e) { console.error('[ERROR] SA Query:', e.message); }

    try {
      const inc_res = await prisma.data_pendapatan.aggregate({ where: { tanggal: { lte: endOfPeriodDate } }, _sum: { nilai: true } });
      inc_sum = Number(inc_res._sum.nilai || 0);
    } catch (e) { console.error('[ERROR] INC Query:', e.message); }

    try {
      const exp_res = await prisma.$queryRaw`
        SELECT SUM(CAST(d.nilai_bruto - (COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0))) AS NUMERIC)) as total 
        FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id 
        WHERE CAST((CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.tanggal_pencairan ELSE COALESCE(h.tanggal_pencairan, h.tanggal) END) AS DATE) <= CAST(${endOfPeriodDate} AS DATE)
      `;
      exp_sum = Number(exp_res[0]?.total || 0);
    } catch (e) { console.error('[ERROR] EXP Query:', e.message); }

    try {
      const tax_pot_res = await prisma.$queryRaw`
        SELECT SUM(CAST(p.nilai AS NUMERIC)) as total 
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE CAST(COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) AS DATE) <= CAST(${endOfPeriodDate} AS DATE)
      `;
      tax_pot_sum = Number(tax_pot_res[0]?.total || 0);
    } catch (e) { console.error('[ERROR] TAX_POT Query:', e.message); }

    try {
      const adj_in_res = await prisma.data_penyesuaian.aggregate({ where: { jenis: 'MASUK', tanggal: { lte: endOfPeriodDate } }, _sum: { nilai: true } });
      adj_in_sum = Number(adj_in_res._sum.nilai || 0);
    } catch (e) { console.error('[ERROR] ADJ_IN Query:', e.message); }

    try {
      const adj_out_res = await prisma.data_penyesuaian.aggregate({ where: { jenis: 'KELUAR', tanggal: { lte: endOfPeriodDate } }, _sum: { nilai: true } });
      adj_out_sum = Number(adj_out_res._sum.nilai || 0);
    } catch (e) { console.error('[ERROR] ADJ_OUT Query:', e.message); }

    const metrics = {
      sa: sa_sum,
      inc: inc_sum,
      exp: exp_sum,
      tax_pot: tax_pot_sum,
      adj_in: adj_in_sum,
      adj_out: adj_out_sum
    };

    const saldoBKU = metrics.sa + metrics.inc - metrics.exp - metrics.tax_pot + metrics.adj_in - metrics.adj_out;

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
      selisih: saldoBKU - saldoBank,
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
          pengeluaran: metrics.exp + metrics.tax_pot,
          sp2d_neto: metrics.exp,
          rincian_potongan: metrics.tax_pot
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
        SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0) AS DECIMAL)) as total_neto
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
        SELECT bln, SUM(nilai) as total_pengeluaran FROM (
          SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bln, 
                 (CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE (nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0)) END) as nilai 
          FROM data_sp2d WHERE tahun = ${currentYear}
        ) combined_exp
        GROUP BY bln
      ) exp ON exp.bln = m.bulan
      LEFT JOIN (
        SELECT 
          EXTRACT(MONTH FROM tanggal)::int as bln,
          SUM(CAST(kredit AS DECIMAL)) - SUM(CAST(debet AS DECIMAL)) as saldo_akhir_bank
        FROM bank_statement
        WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear}
        GROUP BY EXTRACT(MONTH FROM tanggal)
      ) bank ON bank.bln = m.bulan
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bln, SUM(CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE (nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0)) END) as total
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
        SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS DECIMAL)) as total_neto,
        SUM(CASE WHEN status_rekon = 'BELUM' OR status_rekon IS NULL THEN CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS DECIMAL) ELSE 0 END) as neto_belum_rekon
      FROM data_sp2d
      WHERE tahun = ${currentYear}
      GROUP BY opd
    `.catch(e => { console.error('Error Q5:', e); return []; });

    const matchedWithDiscrepancy = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT id, 'SP2D' as tipe, tanggal_pencairan as tanggal, nomor as bukti, opd, uraian, CAST(nilai_neto AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM data_sp2d WHERE tahun = ${currentYear} AND ABS(COALESCE(selisih_rekon, 0)) > 0
        UNION ALL
        SELECT id, 'PENDAPATAN' as tipe, tanggal, nomor_bukti as bukti, 'BENDAHARA' as opd, uraian, CAST(nilai AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM data_pendapatan WHERE tahun = ${currentYear} AND ABS(COALESCE(selisih_rekon, 0)) > 0
      ) combined WHERE ABS(selisih) > 0.01 ORDER BY tanggal DESC LIMIT 100
    `.catch(e => { console.error('Error Q6:', e); return []; });

    const serialize = (arr) => (arr || []).map(row => {
      const out = {};
      for (const [k, v] of Object.entries(row)) {
        if (v === null || v === undefined) out[k] = 0;
        else if (typeof v === 'bigint') out[k] = Number(v);
        else if (typeof v === 'object' && v.constructor.name === 'Decimal') out[k] = Number(v.toString());
        else out[k] = v;
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
        SELECT id, 'SP2D' as tipe, COALESCE(tanggal_pencairan, tanggal) as tanggal, nomor as bukti, opd, uraian, CAST(nilai_neto AS DECIMAL) as nilai, 'KELUAR' as d_k
        FROM data_sp2d WHERE tahun = ${currentYear} AND (status_rekon = 'BELUM' OR status_rekon IS NULL)
        UNION ALL
        SELECT id, 'BANK' as tipe, tanggal, '' as bukti, 'BANK' as opd, deskripsi as uraian, CAST(debet AS DECIMAL) as nilai, 'KELUAR' as d_k
        FROM bank_statement WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
      ) comb ORDER BY tanggal DESC LIMIT 50
    `.catch(() => []);

    console.log(`[DEBUG DISCREPANCY] Summary: Unmatched=${sp2dUnmatched.length}, Balance=${monthlyBalance.length}, OPD=${opdSummary.length}`);

    res.json({
      sp2dUnmatched: serialize(sp2dUnmatched),
      sp2dMatched: serialize(sp2dMatched),
      bankDebetUnmatched: serialize(bankDebetUnmatched),
      monthlyBalance: serialize(monthlyBalance),
      opdSummary: serialize(opdSummary),
      matchedWithDiscrepancy: serialize(matchedWithDiscrepancy),
      potonganUnmatched: serialize(potonganUnmatched),
      unmatchedDetails: serialize(unmatchedDetails)
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
        p.tanggal_pencairan as "Tanggal_SP2D",
        p.nomor_sp2d as "Nomor_SP2D",
        p.opd as "OPD",
        p.jenis_potongan as "Jenis_Potongan",
        p.nilai as "Nilai_BKU",
        p.uraian as "Uraian_BKU",
        p.status_rekon as "Status_Audit",
        b.tanggal as "Tanggal_Bank",
        b.deskripsi as "Keterangan_Bank",
        b.debet as "Nilai_Bank"
      FROM data_sp2d_potongan p
      LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
      WHERE (p.tanggal_pencairan BETWEEN ${new Date(sDate)} AND ${new Date(eDate)})
      
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
      "Keterangan Bank": item.Keterangan_Bank || 'BELUM MATCH',
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
      AND (s.nilai_potongan > 0 OR p.total_rincian > 0)
      AND ABS(s.nilai_potongan - COALESCE(p.total_rincian, 0)) > 1
      ORDER BY ABS(s.nilai_potongan - COALESCE(p.total_rincian, 0)) DESC
    `;

    res.json({ 
      data: mismatches,
      summary: {
        totalMismatches: mismatches.length,
        totalVariance: mismatches.reduce((acc, m) => acc + Number(m.selisih), 0)
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Error checking potongan integrity', error: err.message });
  }
};

/**
 * Hard Reset All Reconciliations
 * CAUTION: Destructive Action
 */
const resetAllReconciliation = async (req, res) => {
  const { year, code } = req.body;
  const currentYear = parseInt(year) || new Date().getFullYear();

  if (code !== 'RESET REKON ' + currentYear) {
    return res.status(400).json({ message: 'Kode konfirmasi tidak valid. Harap ketik "RESET REKON ' + currentYear + '".' });
  }

  // Optimize: Use indexed date ranges instead of EXTRACT YEAR
  const startOfYear = `${currentYear}-01-01`;
  const endOfYear = `${currentYear}-12-31`;

  try {
    await prisma.$transaction([
      // 1. Reset Bank Statements (Using Indexed Range)
      prisma.$executeRaw`
        UPDATE bank_statement
        SET is_matched = false, ref_bku_id = null,
            selisih_nilai = 0, catatan_selisih = null, match_type = null
        WHERE tanggal >= CAST(${startOfYear} AS DATE) AND tanggal <= CAST(${endOfYear} AS DATE)
      `,
      // 2. Reset SP2D
      prisma.$executeRaw`
        UPDATE data_sp2d
        SET status_rekon = 'BELUM', selisih_rekon = 0, keterangan_rekon = null
        WHERE tahun = ${currentYear}
      `,
      // 3. Reset SP2D Potongan
      prisma.$executeRaw`
        UPDATE data_sp2d_potongan
        SET status_rekon = 'BELUM', selisih_rekon = 0, keterangan_rekon = null
        WHERE (tanggal_pencairan >= CAST(${startOfYear} AS DATE) AND tanggal_pencairan <= CAST(${endOfYear} AS DATE))
           OR (tanggal_pencairan IS NULL AND created_at >= CAST(${startOfYear} AS DATE) AND created_at <= CAST(${endOfYear} AS DATE))
      `,
      // 4. Reset Pendapatan
      prisma.$executeRaw`
        UPDATE data_pendapatan
        SET status_rekon = 'BELUM', selisih_rekon = 0, keterangan_rekon = null
        WHERE tahun = ${currentYear}
      `,
      // 5. Reset Setoran Pajak
      prisma.$executeRaw`
        UPDATE setoran_pajak
        SET status_rekon = 'BELUM', selisih_rekon = 0, keterangan_rekon = null
        WHERE tanggal >= CAST(${startOfYear} AS DATE) AND tanggal <= CAST(${endOfYear} AS DATE)
      `
    ]);

    res.json({ message: 'Semua data rekonsiliasi tahun ' + currentYear + ' telah di-reset ke kondisi awal (BELUM).' });
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

  try {
    if (type === 'BANK') {
      await prisma.bank_statement.update({
        where: { id: parseInt(id) },
        data: {
          catatan_selisih: note,
          match_type: status || 'RESOLVED_BY_ADMIN'
        }
      });
    } else if (type === 'SP2D') {
      await prisma.data_sp2d.update({
        where: { id: parseInt(id) },
        data: {
          keterangan_rekon: note,
          status_rekon: status || 'SUDAH_DIVERIFIKASI'
        }
      });
    } else if (type === 'POTONGAN') {
      await prisma.data_sp2d_potongan.update({
        where: { id: parseInt(id) },
        data: {
          keterangan_rekon: note,
          status_rekon: status || 'SUDAH_DIVERIFIKASI'
        }
      });
    } else if (type === 'STS' || type === 'PENDAPATAN') {
      await prisma.data_pendapatan.update({
        where: { id: parseInt(id) },
        data: {
          keterangan_rekon: note,
          status_rekon: status || 'SUDAH_DIVERIFIKASI'
        }
      });
    }

    res.json({ message: 'Resolusi audit berhasil disimpan.' });
  } catch (err) {
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
      prisma.$queryRaw`SELECT SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS NUMERIC)) as total FROM data_sp2d WHERE tanggal >= ${sDate} AND tanggal <= ${eDate}`,
      prisma.data_sp2d_potongan.aggregate({ where: { tanggal_pencairan: { gte: sDate, lte: eDate } }, _sum: { nilai: true } }),
      prisma.bank_statement.aggregate({ where: { tanggal: { gte: sDate, lte: eDate } }, _sum: { debet: true, kredit: true } }),
      // Unmatched BKU
      prisma.$queryRaw`
        SELECT 'PENDAPATAN' as tipe, tanggal, nomor_bukti as bukti, uraian, CAST(nilai AS DECIMAL) as nilai FROM data_pendapatan 
        WHERE status_rekon = 'BELUM' AND tanggal BETWEEN ${sDate} AND ${eDate}
        UNION ALL
        SELECT 'SP2D' as tipe, tanggal, nomor as bukti, uraian, CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS DECIMAL) as nilai FROM data_sp2d 
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
      Tanggal: item.tanggal ? item.tanggal.toISOString().split('T')[0] : '-',
      Tipe: item.tipe,
      Nomor: item.bukti,
      Keterangan: item.uraian,
      Nilai: Number(item.nilai)
    }));
    const wsOutstanding = XLSX.utils.json_to_sheet(outstandingData);
    XLSX.utils.book_append_sheet(wb, wsOutstanding, "Outstanding BKU");

    // SHEET 3: UNIDENTIFIED BANK
    const unidentifiedData = unmatchedBank.map(item => ({
      Tanggal: item.tanggal.toISOString().split('T')[0],
      Keterangan: item.deskripsi,
      Masuk: Number(item.kredit || 0),
      Keluar: Number(item.debet || 0)
    }));
    const wsUnidentified = XLSX.utils.json_to_sheet(unidentifiedData);
    XLSX.utils.book_append_sheet(wb, wsUnidentified, "Unidentified Bank");

    // SHEET 4: ANOMALI & SELISIH
    const anomalyData = anomalies.map(item => ({
      Tanggal: item.tanggal.toISOString().split('T')[0],
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

module.exports = {
  getReconciliationData,
  runMagicMatch,
  getSuggestions,
  importBankData,
  undoMatch,
  matchIndividual,
  matchMultiple,
  getBankStatements,
  deleteBankItem,
  getAnomalies,
  getBalanceComparison,
  getDiscrepancyReport,
  getMatchedPotonganReport,
  getPotonganIntegrity,
  bulkMatchByValue,
  bulkMatchSmart,
  undoMatchBatch,
  resetAllReconciliation,
  saveResolution,
  exportReconciliationAudit,
  getSmartMatchProgress
};