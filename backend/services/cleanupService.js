/**
 * cleanupService.js
 * Layanan pembersihan data sampah otomatis DSS BPKAD.
 *
 * Tugas:
 *  1. Reset bank_statement orphan refs (ref_bku_id menunjuk record yang sudah tidak ada)
 *  2. Hapus data_sp2d_potongan duplikat BELUM yang punya pasangan SUDAH/SUDAH_BRUTO
 *  3. Hapus log_aktivitas lebih dari LOG_RETENTION_DAYS hari
 *  4. Bersihkan file upload sementara di folder uploads/
 *
 * Dijadwalkan otomatis setiap CLEANUP_INTERVAL_HOURS jam via scheduleAutoCleanup().
 * Dapat dipanggil manual via endpoint POST /api/admin/cleanup.
 */

const prisma = require('../prismaClient');
const fs = require('fs');
const path = require('path');

const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '90');
const CLEANUP_INTERVAL_HOURS = parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24');
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

/**
 * Jalankan semua task pembersihan. Kembalikan ringkasan hasil.
 */
async function runCleanup() {
  const started = new Date();
  console.log(`[CLEANUP] Mulai pembersihan otomatis @ ${started.toISOString()}`);
  const summary = {};

  try {
    summary.orphanBankRefs   = await cleanOrphanBankRefs();
    summary.dupPotongan      = await cleanDuplikatPotongan();
    summary.oldLogs          = await cleanOldLogs();
    summary.uploadFiles      = await cleanTempUploads();
  } catch (err) {
    console.error('[CLEANUP] Error saat cleanup:', err.message);
    summary.error = err.message;
  }

  const elapsed = ((new Date() - started) / 1000).toFixed(1);
  console.log(`[CLEANUP] Selesai dalam ${elapsed}s. Ringkasan:`, JSON.stringify(summary));
  return { ...summary, elapsed_sec: parseFloat(elapsed), ran_at: started.toISOString() };
}

/**
 * Task 1: Reset bank_statement yang is_matched=true tapi ref_bku_id-nya menunjuk
 * ke record yang sudah tidak ada di mana pun (orphan FK).
 * Dampak: record menjadi unmatched dan bisa di-reconcile ulang.
 */
async function cleanOrphanBankRefs() {
  const result = await prisma.$executeRawUnsafe(`
    UPDATE bank_statement
    SET is_matched    = false,
        ref_bku_id    = NULL,
        match_type    = NULL,
        selisih_nilai = 0,
        catatan_selisih = NULL
    WHERE ref_bku_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM data_sp2d        WHERE id::text            = bank_statement.ref_bku_id)
      AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan WHERE id::text           = bank_statement.ref_bku_id)
      AND NOT EXISTS (SELECT 1 FROM setoran_pajak    WHERE id::text            = bank_statement.ref_bku_id)
      AND NOT EXISTS (SELECT 1 FROM data_pendapatan  WHERE id::text            = bank_statement.ref_bku_id)
      AND NOT EXISTS (SELECT 1 FROM data_penyesuaian WHERE id::text            = bank_statement.ref_bku_id)
  `);
  if (result > 0)
    console.log(`[CLEANUP] ${result} bank_statement orphan ref direset ke unmatched`);
  return { reset: result };
}

/**
 * Task 2: Hapus record data_sp2d_potongan BELUM yang merupakan duplikat dari
 * record SUDAH/SUDAH_BRUTO (nomor_sp2d + uraian + nilai sama).
 * Kondisi tambahan: tidak punya bank_statement yang menunjuk ke ID-nya.
 */
async function cleanDuplikatPotongan() {
  const deleted = await prisma.$executeRawUnsafe(`
    DELETE FROM data_sp2d_potongan
    WHERE status_rekon = 'BELUM'
      AND NOT EXISTS (
        SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = data_sp2d_potongan.id::text
      )
      AND EXISTS (
        SELECT 1 FROM data_sp2d_potongan p2
        WHERE p2.nomor_sp2d = data_sp2d_potongan.nomor_sp2d
          AND p2.uraian     = data_sp2d_potongan.uraian
          AND p2.nilai      = data_sp2d_potongan.nilai
          AND p2.id        <> data_sp2d_potongan.id
          AND p2.status_rekon IN ('SUDAH', 'SUDAH_BRUTO')
      )
  `);
  if (deleted > 0)
    console.log(`[CLEANUP] ${deleted} duplikat potongan BELUM dihapus`);
  return { deleted };
}

/**
 * Task 3: Hapus log_aktivitas yang lebih lama dari LOG_RETENTION_DAYS hari.
 */
async function cleanOldLogs() {
  let deleted = 0;
  try {
    deleted = await prisma.$executeRawUnsafe(`
      DELETE FROM log_aktivitas
      WHERE created_at < NOW() - INTERVAL '${LOG_RETENTION_DAYS} days'
    `);
    if (deleted > 0)
      console.log(`[CLEANUP] ${deleted} entri log_aktivitas (>${LOG_RETENTION_DAYS} hari) dihapus`);
  } catch {
    // Tabel mungkin tidak ada di semua environment
  }
  return { deleted, retention_days: LOG_RETENTION_DAYS };
}

/**
 * Task 4: Hapus file sementara di folder uploads/ yang lebih lama dari 1 hari.
 * File Excel/PDF yang sudah diproses tidak perlu disimpan.
 */
async function cleanTempUploads() {
  let deleted = 0;
  if (!fs.existsSync(UPLOAD_DIR)) return { deleted };

  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const walk = (dir) => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => {
        const full = path.join(dir, item.name);
        return item.isDirectory() ? walk(full) : [full];
      });
    } catch { return []; }
  };

  for (const file of walk(UPLOAD_DIR)) {
    try {
      const stat = fs.statSync(file);
      if (stat.mtimeMs < oneDayAgo) {
        fs.unlinkSync(file);
        deleted++;
      }
    } catch { /* file sudah terhapus atau permission denied */ }
  }
  if (deleted > 0)
    console.log(`[CLEANUP] ${deleted} file upload lama dihapus dari ${UPLOAD_DIR}`);
  return { deleted };
}

/**
 * Jadwalkan cleanup otomatis setiap CLEANUP_INTERVAL_HOURS jam.
 * Dipanggil sekali dari server.js saat startup.
 */
function scheduleAutoCleanup() {
  const intervalMs = CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;

  // Jalankan pertama kali setelah 5 menit (beri waktu server siap penuh)
  const firstRun = setTimeout(() => {
    runCleanup().catch(err => console.error('[CLEANUP] Error pada first run:', err.message));
  }, 5 * 60 * 1000);
  firstRun.unref(); // jangan tahan proses jika server shutdown

  // Lalu ulangi setiap interval
  const interval = setInterval(() => {
    runCleanup().catch(err => console.error('[CLEANUP] Error pada scheduled run:', err.message));
  }, intervalMs);
  interval.unref();

  console.log(`[CLEANUP] Auto-cleanup dijadwalkan setiap ${CLEANUP_INTERVAL_HOURS} jam (first run dalam 5 menit)`);
}

module.exports = { runCleanup, scheduleAutoCleanup };
