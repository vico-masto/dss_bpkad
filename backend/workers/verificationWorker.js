/**
 * Worker Verifikasi Masal - proses TERPISAH (service docker "verification-worker").
 * Memproses job BullMQ per batch: memanggil layanan API (api.co.id) per item,
 * memperbarui status item & progres batch ke DB.
 *
 * ISOLASI: hanya menulis/update tabel `verification_*`. Tidak menyentuh modul
 * rekon maupun tabel lain yang dipakai aplikasi inti.
 *
 * Supervisor/docker memulai ulang proses bila crash -> job restart aman karena
 * worker hanya memproses item dengan `verified_at = NULL` (resume dari checkpoint).
 */
'use strict';

require('dotenv').config({ override: true });

const { Worker } = require('bullmq');
const prisma = require('../prismaClient');
const apiCoId = require('../services/apiCoIdService');
const { matchNames } = require('../utils/nameMatch');
const { QUEUE_NAME, REDIS_URL, createConnection } = require('../services/verificationQueue');

const CONCURRENCY = Math.max(1, parseInt(process.env.VERIFICATION_CONCURRENCY || '10', 10));
const RATE_LIMIT_MAX_ATTEMPTS = 3;
const OK_BANK = 'VALID';
const OK_TAX = 'ACTIVE';

/** Proses satu item sesuai jenis batch. Rate limit (429) di-retry inline. */
const processItem = async (item, type) => {
  if (type === 'REKENING') {
    let last = null;
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
      last = await apiCoId.checkBankAccount({
        accountNo: item.input_account_no,
        accountName: item.input_account_name,
      });
      if (!last.rateLimited) break;
      await apiCoId.delay(Math.min(last.retryAfterMs || 60000, 300000));
    }
    const score = last.status === OK_BANK
      ? (last.nameScore != null
          ? { score: last.nameScore, label: last.nameMatchLabel || 'UNVERIFIED' }
          : matchNames(item.input_account_name, last.registeredName))
      : { score: null, label: 'UNVERIFIED' };
    return {
      bank_status: last.status,
      bank_registered_name: last.status === OK_BANK ? last.registeredName || null : null,
      name_match_score: score.score,
      name_match_label: score.label,
      api_error_message: last.errorMessage || null,
      api_response: last.apiResponse || null,
    };
  }

  if (type === 'BILLING') {
    let last = null;
    for (let attempt = 0; attempt < RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
      last = await apiCoId.checkBillingId({
        billingId: item.input_billing_id,
        name: item.input_account_name,
      });
      if (!last.rateLimited) break;
      await apiCoId.delay(Math.min(last.retryAfterMs || 60000, 300000));
    }
    return {
      tax_status: last.status,
      tax_type: last.taxType || null,
      tax_type_name: last.taxTypeName || null,
      tax_amount: last.taxAmount != null ? last.taxAmount : null,
      payer_name: last.payerName || null,
      api_error_message: last.errorMessage || null,
      api_response: last.apiResponse || null,
    };
  }

  return { api_error_message: 'Jenis verifikasi tidak dikenali.' };
};

/** Jalankan fn atas items dengan membatasi concurrency (pool worker lokal). */
const mapWithConcurrency = async (items, limit, fn) => {
  const out = new Array(items.length);
  let next = 0;
  const workerLoop = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, workerLoop));
  return out;
};

/** Rehitung status final batch langsung dari tabel item (sumber kebenaran). */
const finalizeBatch = async (batchId, type) => {
  const batch = await prisma.verification_batches.findUnique({ where: { id: batchId } });
  if (!batch) return;

  if (batch.status === 'CANCELLED') {
    await prisma.verification_batches.update({
      where: { id: batchId },
      data: { finished_at: new Date(), updated_at: new Date() },
    });
    return;
  }

  const whereOk = type === 'REKENING' ? { bank_status: 'VALID' } : { tax_status: 'ACTIVE' };
  const processed = await prisma.verification_items.count({
    where: { batch_id: batchId, verified_at: { not: null } },
  });
  const okCount = await prisma.verification_items.count({ where: { batch_id: batchId, ...whereOk } });
  const failCount = processed - okCount;
  const finalStatus = processed === 0 ? 'FAILED' : failCount === 0 ? 'COMPLETED' : 'PARTIAL_FAILED';

  await prisma.verification_batches.update({
    where: { id: batchId },
    data: {
      status: finalStatus,
      processed,
      ok_count: okCount,
      fail_count: Math.max(0, failCount),
      finished_at: new Date(),
      updated_at: new Date(),
    },
  });
};

const processor = async (job) => {
  const { batchId } = job.data;
  if (!batchId) throw new Error('job.data.batchId wajib diisi');

  const batch = await prisma.verification_batches.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error(`Batch ${batchId} tidak ditemukan`);
  if (batch.status === 'CANCELLED') return { skipped: true };

  const type = batch.verification_type;
  const items = await prisma.verification_items.findMany({
    where: { batch_id: batchId, verified_at: null },
    orderBy: { row_no: 'asc' },
  });

  if (items.length === 0) {
    await finalizeBatch(batchId, type);
    return { noItems: true };
  }

  await prisma.verification_batches.update({
    where: { id: batchId },
    data: { status: 'PROCESSING', updated_at: new Date() },
  });

  let cancelled = false;

  await mapWithConcurrency(items, CONCURRENCY, async (item, i) => {
    if (cancelled) return;

    // Cek status cancel secara berkala (tiap 50 item) agar pembatalan cepat merespons.
    if (i % 50 === 0) {
      const cur = await prisma.verification_batches.findUnique({
        where: { id: batchId },
        select: { status: true },
      });
      if (cur && cur.status === 'CANCELLED') {
        cancelled = true;
        return;
      }
    }

    const res = await processItem(item, type);
    const ok = type === 'REKENING' ? res.bank_status === OK_BANK : res.tax_status === OK_TAX;

    await prisma.$transaction([
      prisma.verification_items.update({
        where: { id: item.id },
        data: { ...res, verified_at: new Date() },
      }),
      prisma.verification_batches.update({
        where: { id: batchId },
        data: {
          processed: { increment: 1 },
          ...(ok ? { ok_count: { increment: 1 } } : { fail_count: { increment: 1 } }),
          updated_at: new Date(),
        },
      }),
    ]);
  });

  if (cancelled) {
    await finalizeBatch(batchId, type);
    return { cancelled: true };
  }

  await finalizeBatch(batchId, type);
  return { done: true };
};

const connection = createConnection();
const worker = new Worker(QUEUE_NAME, processor, { connection, concurrency: CONCURRENCY });

worker.on('ready', () => console.log(`[verification-worker] READY (concurrency=${CONCURRENCY})`));
worker.on('completed', (job) => console.log(`[verification-worker] job ${job.id} selesai`));
worker.on('failed', (job, err) => {
  console.error(`[verification-worker] job ${job?.id} gagal: ${err.message}`);
  if (job?.data?.batchId) {
    prisma.verification_batches
      .update({
        where: { id: job.data.batchId },
        data: {
          status: 'FAILED',
          error_message: err.message,
          finished_at: new Date(),
          updated_at: new Date(),
        },
      })
      .catch((e) => console.error('[verification-worker] gagal update batch FAILED:', e.message));
  }
});
worker.on('error', (err) => console.error('[verification-worker] error:', err.message));

const shutdown = async () => {
  console.log('[verification-worker] shutdown...');
  try {
    await worker.close();
  } catch (e) {
    console.error('[verification-worker] close error:', e.message);
  }
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);