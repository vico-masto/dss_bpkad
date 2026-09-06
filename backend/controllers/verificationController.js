/**
 * Controller modul Verifikasi Masal (rekening bank / ID billing pajak).
 * SEMUA endpoint hanya untuk role admin (di-gate di routes).
 *
 * ISOLASI: hanya membaca/menulis tabel `verification_*` (+ baca `users` untuk
 * nama pembuat/pengecek, `master_opd` untuk dropdown OPD). Tidak menyentuh
 * modul rekon/SP2D/BKU.
 */
'use strict';

const XLSX = require('xlsx');
const { checkBankAccount, checkBillingId, isLiveMode } = require('../services/apiCoIdService');
const { matchNames } = require('../utils/nameMatch');
const prisma = require('../prismaClient');
const { queue, QUEUE_JOB_OPTIONS } = require('../services/verificationQueue');

const MAX_ROWS = 1000;
const CONST_TYPE = { REKENING: 'REKENING', BILLING: 'BILLING' };

const num = (v) => (v == null ? null : Number(v));

/** Periode bulan berjalan dalam format YYYY-MM. */
const currentPeriode = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
};

/** Guard rate-limit sederhana utk cek satuan (hanya berpengaruh saat LIVE). */
let lastSingleAt = 0;

/** Pastikan OPD terdaftar di master_opd bila tabel master berisi data. */
const assertOpdExists = async (opd) => {
  if (!opd) return;
  const opdCount = await prisma.master_opd.count();
  if (opdCount === 0) return; // master kosong -> terima apa adanya
  const found = await prisma.master_opd.findFirst({
    where: { nama: { equals: opd, mode: 'insensitive' } },
    select: { id: true },
  });
  if (!found) {
    const err = new Error('OPD tidak terdaftar di master data.');
    err.status = 400;
    throw err;
  }
};

/* ------------------------------------------------------------------ */
/* Helper validasi baris                                               */
/* ------------------------------------------------------------------ */

const validateRekeningRow = (r) => {
  const no = String(r.nomor_rekening || '').replace(/\s/g, '').replace(/-/g, '');
  const nama = String(r.nama || '').trim();
  const noOk = /^\d+$/.test(no) && no.length >= 10 && no.length <= 20;
  const namaOk = nama.length >= 3;
  const ok = noOk && namaOk;
  return {
    ok,
    message: !ok ? (!noOk ? 'Nomor rekening harus numerik 10-20 digit.' : 'Nama penerima wajib diisi (min 3 karakter).') : null,
    data: {
      input_account_no: no || null,
      input_account_name: nama || null,
      bank_status: ok ? 'UNVERIFIED' : 'INVALID',
      verified_at: ok ? null : new Date(),
      validation_message: !ok ? (!noOk ? 'Nomor rekening harus numerik 10-20 digit.' : 'Nama penerima wajib diisi (min 3 karakter).') : null,
    },
  };
};

const validateBillingRow = (r) => {
  const id = String(r.id_billing || '').replace(/\s/g, '');
  const nama = String(r.nama || '').trim();
  const ok = /^\d+$/.test(id) && id.length >= 15;
  return {
    ok,
    message: ok ? null : 'ID Billing harus numerik minimal 15 digit.',
    data: {
      input_billing_id: id || null,
      input_account_name: nama || null,
      tax_status: ok ? 'UNVERIFIED' : 'INVALID',
      verified_at: ok ? null : new Date(),
      validation_message: ok ? null : 'ID Billing harus numerik minimal 15 digit.',
    },
  };
};

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

const uploadBatch = async (req, res) => {
  try {
    const type = String(req.body.type || '').toUpperCase();
    const filename = String(req.body.filename || '').trim();
    const rows = req.body.rows;
    const opd = String(req.body.opd || '').trim();
    const periode = String(req.body.periode || '').trim() || currentPeriode();

    if (type !== CONST_TYPE.REKENING && type !== CONST_TYPE.BILLING) {
      return res.status(400).json({ message: 'type harus REKENING atau BILLING.' });
    }
    if (!opd) {
      return res.status(400).json({ message: 'opd wajib diisi.' });
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return res.status(400).json({ message: 'periode harus format YYYY-MM.' });
    }
    await assertOpdExists(opd);
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ message: 'rows wajib berupa array non-kosong.' });
    }
    if (rows.length > MAX_ROWS) {
      return res.status(400).json({ message: `Maksimal ${MAX_ROWS} baris per batch.` });
    }

    // Hanya satu batch aktif sekaligus (cegah bakar kuota API).
    const active = await prisma.verification_batches.findFirst({
      where: { status: { in: ['PENDING', 'PROCESSING'] } },
      select: { id: true },
    });
    if (active) {
      return res.status(400).json({ message: 'Masih ada batch yang sedang diproses. Selesaikan atau batalkan dulu.' });
    }

    // Validasi per baris.
    const validated = rows.map((r) =>
      type === CONST_TYPE.REKENING ? validateRekeningRow(r) : validateBillingRow(r)
    );
    const validRows = validated.filter((v) => v.ok);
    const invalidRows = validated.filter((v) => !v.ok);

    if (validRows.length === 0) {
      return res.status(400).json({
        message: 'Semua baris gagal validasi.',
        invalidCount: invalidRows.length,
        samples: invalidRows.slice(0, 5).map((v) => v.message),
      });
    }

    // Insert batch + items dalam satu transaksi.
    const batch = await prisma.$transaction(async (tx) => {
      const b = await tx.verification_batches.create({
        data: {
          verification_type: type,
          filename: filename || `batch-${Date.now()}.xlsx`,
          created_by: req.user?.id || null,
          opd,
          periode,
          total_records: rows.length,
          processed: invalidRows.length,
          fail_count: invalidRows.length,
          status: 'PENDING',
          updated_at: new Date(),
        },
      });
      const items = rows.map((r, i) => {
        const v = validated[i];
        return { batch_id: b.id, row_no: i + 1, ...v.data };
      });
      await tx.verification_items.createMany({ data: items });
      return b;
    });

    // Enqueue job (hanya bila ada baris valid).
    if (validRows.length > 0) {
      try {
        await queue.add(batch.id, { batchId: batch.id }, QUEUE_JOB_OPTIONS);
      } catch (e) {
        console.error('[verification] gagal enqueue:', e.message);
        await prisma.verification_batches.update({
          where: { id: batch.id },
          data: { status: 'FAILED', error_message: 'Gagal membuat antrean job: ' + e.message, updated_at: new Date() },
        });
        return res.status(500).json({ message: 'Batch dibuat tetapi gagal masuk antrean.', batchId: batch.id });
      }
    }

    return res.status(201).json({
      batchId: batch.id,
      total: rows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
    });
  } catch (err) {
    console.error('[verification:upload]', err);
    return res.status(500).json({ message: 'Gagal membuat batch verifikasi.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Template                                                           */
/* ------------------------------------------------------------------ */

const getTemplate = (req, res) => {
  try {
    const type = (req.query.type || 'REKENING').toString().toUpperCase();
    const headers = type === 'BILLING'
      ? [['ID_BILLING', 'NAMA (opsional)']]
      : [['NAMA', 'NOMOR_REKENING']];
    const ws = XLSX.utils.aoa_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    wb.Workbook = { Views: [{ RTL: false }] };
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="template-${type.toLowerCase()}.xlsx"`);
    return res.send(buf);
  } catch (err) {
    console.error('[verification:template]', err);
    return res.status(500).json({ message: 'Gagal membuat template.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Daftar batch                                                       */
/* ------------------------------------------------------------------ */

const listBatches = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const status = req.query.status ? String(req.query.status).toUpperCase() : '';
    const opd = req.query.opd ? String(req.query.opd).trim() : '';
    const periode = req.query.periode ? String(req.query.periode).trim() : '';
    const where = {};
    if (status && status !== 'ALL') where.status = status;
    if (opd && opd !== 'ALL') where.opd = opd;
    if (periode) where.periode = periode;

    const [total, batches] = await Promise.all([
      prisma.verification_batches.count({ where }),
      prisma.verification_batches.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const creatorIds = [...new Set(batches.map((b) => b.created_by).filter(Boolean))];
    const users = creatorIds.length
      ? await prisma.users.findMany({ where: { id: { in: creatorIds } }, select: { id: true, username: true } })
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.username]));

    const data = batches.map((b) => ({
      ...b,
      created_by_name: b.created_by ? userMap[b.created_by] || null : null,
      progress: b.total_records ? Math.round((b.processed / b.total_records) * 1000) / 10 : 0,
    }));

    return res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[verification:list]', err);
    return res.status(500).json({ message: 'Gagal mengambil daftar batch.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Detail batch + distribusi status                                   */
/* ------------------------------------------------------------------ */

const getBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await prisma.verification_batches.findUnique({ where: { id } });
    if (!batch) return res.status(404).json({ message: 'Batch tidak ditemukan.' });

    const [byBank, byTax] = await Promise.all([
      prisma.verification_items.groupBy({ by: ['bank_status'], where: { batch_id: id }, _count: { _all: true } }),
      prisma.verification_items.groupBy({ by: ['tax_status'], where: { batch_id: id }, _count: { _all: true } }),
    ]);

    return res.json({
      batch: {
        ...batch,
        progress: batch.total_records ? Math.round((batch.processed / batch.total_records) * 1000) / 10 : 0,
      },
      status_counts: {
        bank: byBank.map((r) => ({ status: r.bank_status, count: r._count._all })),
        tax: byTax.map((r) => ({ status: r.tax_status, count: r._count._all })),
      },
    });
  } catch (err) {
    console.error('[verification:detail]', err);
    return res.status(500).json({ message: 'Gagal mengambil detail batch.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Items batch (paginasi + filter)                                    */
/* ------------------------------------------------------------------ */

const getBatchItems = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await prisma.verification_batches.findUnique({ where: { id } });
    if (!batch) return res.status(404).json({ message: 'Batch tidak ditemukan.' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const status = req.query.status ? String(req.query.status).toUpperCase() : '';
    const search = req.query.search ? req.query.search.toString().trim() : '';

    const isRekening = batch.verification_type === 'REKENING';
    const where = { batch_id: id };
    if (status) where[isRekening ? 'bank_status' : 'tax_status'] = status;
    if (search) {
      where.OR = isRekening
        ? [
            { input_account_name: { contains: search, mode: 'insensitive' } },
            { input_account_no: { contains: search } },
          ]
        : [
            { input_billing_id: { contains: search } },
            { input_account_name: { contains: search, mode: 'insensitive' } },
          ];
    }

    const [total, items] = await Promise.all([
      prisma.verification_items.count({ where }),
      prisma.verification_items.findMany({ where, orderBy: { row_no: 'asc' }, skip: (page - 1) * limit, take: limit }),
    ]);

    const data = items.map((it) => ({
      ...it,
      name_match_score: num(it.name_match_score),
      tax_amount: num(it.tax_amount),
    }));

    return res.json({
      verification_type: batch.verification_type,
      data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[verification:items]', err);
    return res.status(500).json({ message: 'Gagal mengambil item batch.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Cancel / Retry                                                     */
/* ------------------------------------------------------------------ */

const cancelBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await prisma.verification_batches.findUnique({ where: { id } });
    if (!batch) return res.status(404).json({ message: 'Batch tidak ditemukan.' });
    if (!['PENDING', 'PROCESSING'].includes(batch.status)) {
      return res.status(400).json({ message: 'Batch sudah selesai/dibatalkan, tidak bisa dibatalkan lagi.' });
    }

    // Hapus job dari antrean bila masih menunggu; bila sedang aktif, worker
    // membaca status CANCELLED dan berhenti (checkpoint per 50 item).
    try {
      await queue.remove(id);
    } catch (e) {
      console.warn('[verification] job remove saat cancel:', e.message);
    }

    await prisma.verification_batches.update({
      where: { id },
      data: { status: 'CANCELLED', finished_at: new Date(), updated_at: new Date() },
    });
    return res.json({ message: 'Batch dibatalkan.', batchId: id });
  } catch (err) {
    console.error('[verification:cancel]', err);
    return res.status(500).json({ message: 'Gagal membatalkan batch.', error: err.message });
  }
};

const retryFailed = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await prisma.verification_batches.findUnique({ where: { id } });
    if (!batch) return res.status(404).json({ message: 'Batch tidak ditemukan.' });
    if (batch.status === 'PROCESSING' || batch.status === 'PENDING') {
      return res.status(400).json({ message: 'Batch sedang berjalan, tunggu hingga selesai.' });
    }

    const isRekening = batch.verification_type === 'REKENING';
    // Reset item yang gagal dari API / tidak ketemu / kedaluarsa (BUKAN format invalid di sisi kita).
    const resetWhere = {
      batch_id: id,
      validation_message: null,
      verified_at: { not: null },
      [isRekening ? 'bank_status' : 'tax_status']: {
        in: isRekening ? ['INVALID', 'NOT_FOUND', 'ERROR'] : ['EXPIRED', 'INVALID', 'ERROR'],
      },
    };
    const resetRes = await prisma.verification_items.updateMany({
      where: resetWhere,
      data: {
        [isRekening ? 'bank_status' : 'tax_status']: 'UNVERIFIED',
        bank_registered_name: null,
        name_match_score: null,
        name_match_label: null,
        tax_type: null,
        tax_type_name: null,
        tax_amount: null,
        payer_name: null,
        api_response: null,
        api_error_message: null,
        verified_at: null,
        retry_count: { increment: 1 },
      },
    });

    if (resetRes.count === 0) {
      return res.status(400).json({ message: 'Tidak ada item yang perlu di-retry.' });
    }

    // Rehitung counter dari item yang tetap terverifikasi.
    const verifiedNow = await prisma.verification_items.count({
      where: { batch_id: id, verified_at: { not: null } },
    });
    const okCount = await prisma.verification_items.count({
      where: isRekening ? { batch_id: id, bank_status: 'VALID' } : { batch_id: id, tax_status: 'ACTIVE' },
    });
    await prisma.verification_batches.update({
      where: { id },
      data: {
        status: 'PENDING',
        processed: verifiedNow,
        ok_count: okCount,
        fail_count: Math.max(0, verifiedNow - okCount),
        error_message: null,
        finished_at: null,
        updated_at: new Date(),
      },
    });

    await queue.add(id, { batchId: id }, QUEUE_JOB_OPTIONS);
    return res.json({ message: `${resetRes.count} item dijadwalkan ulang.`, batchId: id, resetCount: resetRes.count });
  } catch (err) {
    console.error('[verification:retry]', err);
    return res.status(500).json({ message: 'Gagal retry batch.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Export Excel hasil akhir                                           */
/* ------------------------------------------------------------------ */

const exportBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await prisma.verification_batches.findUnique({ where: { id } });
    if (!batch) return res.status(404).json({ message: 'Batch tidak ditemukan.' });

    const items = await prisma.verification_items.findMany({
      where: { batch_id: id },
      orderBy: { row_no: 'asc' },
    });

    const isRekening = batch.verification_type === 'REKENING';
    const aoa = [
      isRekening
        ? ['No', 'OPD', 'Periode', 'Nama Penerima (Input)', 'Nomor Rekening', 'Nama Terdaftar di Bank', 'Status Bank', 'Skor Cocok (%)', 'Label', 'Keterangan']
        : ['No', 'OPD', 'Periode', 'ID Billing', 'Nama (Input)', 'Status Pajak', 'Jenis Pajak', 'Nilai', 'Nama Penyetor', 'Keterangan'],
    ];

    for (const it of items) {
      if (isRekening) {
        aoa.push([
          it.row_no,
          batch.opd || '',
          batch.periode || '',
          it.input_account_name || '',
          it.input_account_no || '',
          it.bank_registered_name || '',
          it.bank_status || '',
          num(it.name_match_score) ?? '',
          it.name_match_label || '',
          it.validation_message || it.api_error_message || '',
        ]);
      } else {
        aoa.push([
          it.row_no,
          batch.opd || '',
          batch.periode || '',
          it.input_billing_id || '',
          it.input_account_name || '',
          it.tax_status || '',
          it.tax_type_name || it.tax_type || '',
          num(it.tax_amount) ?? '',
          it.payer_name || '',
          it.validation_message || it.api_error_message || '',
        ]);
      }
    }

    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = isRekening
      ? [{ wch: 5 }, { wch: 28 }, { wch: 9 }, { wch: 30 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 40 }]
      : [{ wch: 5 }, { wch: 28 }, { wch: 9 }, { wch: 20 }, { wch: 30 }, { wch: 12 }, { wch: 22 }, { wch: 15 }, { wch: 30 }, { wch: 40 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Hasil Verifikasi');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const safeName = (batch.filename || 'batch').replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="hasil-verifikasi-${safeName}"`);
    return res.send(buf);
  } catch (err) {
    console.error('[verification:export]', err);
    return res.status(500).json({ message: 'Gagal mengekspor hasil.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Hapus batch (items ikut terhapus via ON DELETE CASCADE)            */
/* ------------------------------------------------------------------ */

const deleteBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const batch = await prisma.verification_batches.findUnique({ where: { id } });
    if (!batch) return res.status(404).json({ message: 'Batch tidak ditemukan.' });
    if (batch.status === 'PENDING' || batch.status === 'PROCESSING') {
      return res.status(400).json({ message: 'Batch masih aktif. Batalkan dulu sebelum menghapus.' });
    }
    await prisma.verification_batches.delete({ where: { id } });
    return res.json({ message: 'Batch dihapus.', batchId: id });
  } catch (err) {
    console.error('[verification:delete]', err);
    return res.status(500).json({ message: 'Gagal menghapus batch.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Verifikasi satuan (cek cepat 1 rekening / 1 billing, langsung API)  */
/* ------------------------------------------------------------------ */

const verifySingle = async (req, res) => {
  try {
    const type = String(req.body.type || '').toUpperCase();
    const opd = String(req.body.opd || '').trim() || null;
    const periode = String(req.body.periode || '').trim() || currentPeriode();
    const nama = String(req.body.nama || '').trim();

    if (type !== CONST_TYPE.REKENING && type !== CONST_TYPE.BILLING) {
      return res.status(400).json({ message: 'type harus REKENING atau BILLING.' });
    }
    if (!/^\d{4}-\d{2}$/.test(periode)) {
      return res.status(400).json({ message: 'periode harus format YYYY-MM.' });
    }
    await assertOpdExists(opd);

    const vr = type === CONST_TYPE.REKENING
      ? validateRekeningRow({ nama, nomor_rekening: String(req.body.nomor_rekening || '') })
      : validateBillingRow({ nama, id_billing: String(req.body.id_billing || '') });
    if (!vr.ok) return res.status(400).json({ message: vr.message });

    // Guard rate-limit: jeda minimal 1 detik antar cek satuan saat LIVE.
    const now = Date.now();
    if (isLiveMode() && now - lastSingleAt < 1000) {
      return res.status(429).json({ message: 'Tunggu sebentar sebelum cek berikutnya.', retryAfterMs: 1000 - (now - lastSingleAt) });
    }
    lastSingleAt = now;

    const result = type === CONST_TYPE.REKENING
      ? await checkBankAccount({
          accountNo: vr.data.input_account_no,
          accountName: vr.data.input_account_name,
          bankCode: String(req.body.bank_code || '').trim() || undefined,
        })
      : await checkBillingId({ billingId: vr.data.input_billing_id, name: vr.data.input_account_name });

    if (result.rateLimited) {
      return res.status(429).json({ message: 'API eksternal sedang membatasi permintaan.', retryAfterMs: result.retryAfterMs });
    }

    const isBank = type === CONST_TYPE.REKENING;
    const status = result.status || 'ERROR';
    let nameScore = null;
    let nameLabel = 'UNVERIFIED';
    if (isBank && status === 'VALID' && result.registeredName) {
      if (result.nameScore != null) {
        // LIVE: skor nama langsung dari provider (nama termasking tak bisa dibanding lokal).
        nameScore = result.nameScore;
        nameLabel = result.nameMatchLabel || 'UNVERIFIED';
      } else {
        const m = matchNames(vr.data.input_account_name, result.registeredName);
        nameScore = m.score;
        nameLabel = m.label;
      }
    }

    // Simpan log audit (429 tidak dicatat).
    const log = await prisma.verification_single_log.create({
      data: {
        verification_type: type,
        opd,
        periode,
        input_account_name: vr.data.input_account_name,
        input_account_no: isBank ? vr.data.input_account_no : null,
        input_billing_id: isBank ? null : vr.data.input_billing_id,
        bank_registered_name: isBank ? result.registeredName : null,
        bank_status: isBank ? status : null,
        name_match_score: isBank ? nameScore : null,
        name_match_label: isBank ? nameLabel : null,
        tax_status: isBank ? null : status,
        tax_type: isBank ? null : result.taxType || null,
        tax_type_name: isBank ? null : result.taxTypeName || null,
        tax_amount: isBank ? null : result.taxAmount != null ? Number(result.taxAmount) : null,
        payer_name: isBank ? null : result.payerName || null,
        api_response: result.apiResponse || null,
        error_message: result.errorMessage || null,
        checked_by: req.user?.id || null,
        created_at: new Date(),
      },
    });

    const payload = {
      logId: log.id,
      type,
      opd,
      periode,
      input: isBank
        ? { nama: vr.data.input_account_name, nomor_rekening: vr.data.input_account_no }
        : { nama: vr.data.input_account_name, id_billing: vr.data.input_billing_id },
      result: isBank
        ? {
            status,
            registeredName: result.registeredName || null,
            name_match_score: nameScore,
            name_match_label: nameLabel,
            message: result.errorMessage || null,
          }
        : {
            status,
            tax_type: result.taxType || null,
            tax_type_name: result.taxTypeName || null,
            tax_amount: result.taxAmount != null ? Number(result.taxAmount) : null,
            payer_name: result.payerName || null,
            message: result.errorMessage || null,
          },
      checked_at: new Date(),
    };
    return res.status(201).json(payload);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ message: err.message });
    }
    console.error('[verification:single]', err);
    return res.status(500).json({ message: 'Gagal melakukan verifikasi satuan.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Riwayat verifikasi satuan                                          */
/* ------------------------------------------------------------------ */

const listSingleLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const type = req.query.type ? String(req.query.type).toUpperCase() : '';
    const opd = req.query.opd ? String(req.query.opd).trim() : '';
    const periode = req.query.periode ? String(req.query.periode).trim() : '';
    const status = req.query.status ? String(req.query.status).toUpperCase() : '';
    const search = req.query.search ? req.query.search.toString().trim() : '';

    const conditions = [];
    if (type === 'REKENING' || type === 'BILLING') conditions.push({ verification_type: type });
    if (opd) conditions.push({ opd });
    if (periode) conditions.push({ periode });
    if (status) {
      if (type === 'REKENING') conditions.push({ bank_status: status });
      else if (type === 'BILLING') conditions.push({ tax_status: status });
      else conditions.push({ OR: [{ bank_status: status }, { tax_status: status }] });
    }
    if (search) {
      const idCond = type === 'REKENING' ? { input_account_no: { contains: search } } : { input_billing_id: { contains: search } };
      conditions.push({ OR: [idCond, { input_account_name: { contains: search, mode: 'insensitive' } }] });
    }
    const where = conditions.length ? { AND: conditions } : {};

    const [total, logs] = await Promise.all([
      prisma.verification_single_log.count({ where }),
      prisma.verification_single_log.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const checkerIds = [...new Set(logs.map((l) => l.checked_by).filter(Boolean))];
    const users = checkerIds.length
      ? await prisma.users.findMany({ where: { id: { in: checkerIds } }, select: { id: true, username: true } })
      : [];
    const userMap = Object.fromEntries(users.map((u) => [u.id, u.username]));

    const data = logs.map((l) => ({
      ...l,
      name_match_score: num(l.name_match_score),
      tax_amount: num(l.tax_amount),
      checked_by_name: l.checked_by ? userMap[l.checked_by] || null : null,
    }));

    return res.json({ data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[verification:single-logs]', err);
    return res.status(500).json({ message: 'Gagal mengambil riwayat verifikasi satuan.', error: err.message });
  }
};

const clearSingleLogs = async (req, res) => {
  try {
    const del = await prisma.verification_single_log.deleteMany({});
    return res.json({ message: `${del.count} riwayat verifikasi satuan dihapus.`, deleted: del.count });
  } catch (err) {
    console.error('[verification:clear-single-logs]', err);
    return res.status(500).json({ message: 'Gagal membersihkan riwayat.', error: err.message });
  }
};

/* ------------------------------------------------------------------ */
/* Ringkasan per OPD + info mode API                                   */
/* ------------------------------------------------------------------ */

const getSummary = async (req, res) => {
  try {
    const periode = req.query.periode ? String(req.query.periode).trim() : '';
    const where = periode ? { periode } : {};

    const rows = await prisma.verification_batches.groupBy({
      by: ['opd'],
      where,
      _count: { _all: true },
      _sum: { total_records: true, processed: true, ok_count: true, fail_count: true },
    });

    const data = rows
      .filter((r) => r.opd)
      .map((r) => ({
        opd: r.opd,
        batchCount: r._count._all,
        totalRecords: r._sum.total_records || 0,
        processed: r._sum.processed || 0,
        okCount: r._sum.ok_count || 0,
        failCount: r._sum.fail_count || 0,
        percentDone: r._sum.total_records ? Math.round(((r._sum.processed || 0) / r._sum.total_records) * 1000) / 10 : 0,
        percentOk: r._sum.processed ? Math.round(((r._sum.ok_count || 0) / r._sum.processed) * 1000) / 10 : 0,
      }))
      .sort((a, b) => a.opd.localeCompare(b.opd));

    const totals = data.reduce(
      (acc, r) => {
        acc.batchCount += r.batchCount;
        acc.totalRecords += r.totalRecords;
        acc.processed += r.processed;
        acc.okCount += r.okCount;
        acc.failCount += r.failCount;
        return acc;
      },
      { batchCount: 0, totalRecords: 0, processed: 0, okCount: 0, failCount: 0 }
    );
    if (totals.totalRecords) totals.percentDone = Math.round((totals.processed / totals.totalRecords) * 1000) / 10;
    if (totals.processed) totals.percentOk = Math.round((totals.okCount / totals.processed) * 1000) / 10;

    return res.json({ periode: periode || null, data, totals });
  } catch (err) {
    console.error('[verification:summary]', err);
    return res.status(500).json({ message: 'Gagal menghitung ringkasan per OPD.', error: err.message });
  }
};

const getMode = (req, res) => {
  const live = isLiveMode();
  return res.json({ mode: live ? 'LIVE' : 'DRY_RUN', isLive: live });
};

module.exports = {
  uploadBatch,
  getTemplate,
  listBatches,
  getBatch,
  getBatchItems,
  cancelBatch,
  retryFailed,
  deleteBatch,
  verifySingle,
  listSingleLogs,
  clearSingleLogs,
  getSummary,
  getMode,
  exportBatch,
};