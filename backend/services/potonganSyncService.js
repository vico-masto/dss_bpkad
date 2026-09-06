const prisma = require('../prismaClient');

// ═══════════════════════════════════════════════════════════════════════════════
// POTONGAN SYNC SERVICE
// Menjamin INVARIANT: Header SP2D ber-nilai_potongan>0 WAJIB memiliki >=1 baris
// data_sp2d_potongan. Jalur UPLOAD selalu memenuhinya (rincian asli / AUTO_HEADER);
// jalur MANUAL kini dinormalisasi ke perilaku yang sama melalui service ini.
// ═══════════════════════════════════════════════════════════════════════════════

// Klasifikasi jenis potongan dari teks — mirror mapping importer (importExcelPajak /
// importPotonganManual). Jangan ubah urutan agar konsisten.
const classifyJenis = (teks) => {
  const u = String(teks || '').toUpperCase();
  if (u.includes('PPN')) return 'PPN';
  if (u.includes('PPH 21')) return 'PPh 21';
  if (u.includes('PPH 4(2)') || u.includes('PASAL 4') || u.includes('PPH FINAL')) return 'PPh 4(2)';
  if (u.includes('PPH 22')) return 'PPh 22';
  if (u.includes('PPH 23')) return 'PPh 23';
  if (u.includes('IWP 8') || (u.includes('IURAN WAJIB') && u.includes('8%'))) return 'IWP 8%';
  if (u.includes('IWP 1') || (u.includes('IURAN WAJIB') && u.includes('1%'))) return 'IWP 1%';
  if (u.includes('KESEHATAN 4') || u.includes('BPJS 4')) return 'JKES 4%';
  if (u.includes('KECELAKAAN') || u.includes('JKK')) return 'JKK';
  if (u.includes('KEMATIAN') || u.includes('JKM')) return 'JKM';
  if (u.includes('TAPERUM')) return 'Taperum';
  if (u.includes('BERAS') || u.includes('BULOG')) return 'BULOG';
  if (u.includes('ZAKAT')) return 'Zakat';
  if (u.includes('IWP')) return 'IWP';
  if (u.includes('BPJS')) return 'BPJS';
  return 'PAJAK';
};

async function logAktivitas(actor, aksi, detail) {
  try {
    await prisma.log_aktivitas.create({ data: { user_pelaksana: actor, aksi, detail } });
  } catch (_) { /* logging tidak boleh menggagalkan alur utama */ }
}

// Header dicari dengan pembanding TRIM — nomor bersifat unik global (terverifikasi).
const findHeaderByNomor = async (db, nomor) => {
  const n = String(nomor || '').trim();
  if (!n) return null;
  const rows = await db.$queryRaw`
    SELECT id::text as id, nomor, opd,
           CAST(nilai_potongan AS DECIMAL) as nilai_potongan,
           COALESCE(tanggal_pencairan, tanggal) as tgl_cair
    FROM data_sp2d WHERE TRIM(nomor) = ${n} LIMIT 1`;
  return rows[0] || null;
};

const countRincian = async (db, headerId) => {
  const rows = await db.$queryRaw`
    SELECT COUNT(*)::int as n FROM data_sp2d_potongan WHERE id_sp2d::text = ${String(headerId)}`;
  return rows[0]?.n || 0;
};

/**
 * Dipanggil SETELAH Setoran Pajak tersimpan.
 * Jika nomor_bukti menunjuk sebuah header SP2D yang belum punya rincian dan
 * nilai_potongan > 0 → materialisasikan SATU baris rincian riil berstatus SUDAH
 * (uang sudah terekonsiliasi via setoran tersebut), identik dengan kondisi akhir
 * dokumen-upload-yang-sudah-direkonsiliasi. Idempotent.
 */
const ensureRincianForSetoran = async (setoran, actor, db = prisma) => {
  const out = { synced: false, reason: null };
  try {
    const header = await findHeaderByNomor(db, setoran.nomor_bukti);
    if (!header) { out.reason = 'NO_HEADER'; return out; }

    // Bedah kondisi rincian header: total / rincian-manual / placeholder AUTO_HEADER
    const stat = await db.$queryRaw`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE COALESCE(keterangan,'') <> 'AUTO_HEADER')::int AS manual,
             MAX(CASE WHEN COALESCE(keterangan,'') = 'AUTO_HEADER' THEN id::text END) AS ah_id
      FROM data_sp2d_potongan WHERE id_sp2d::text = ${String(header.id)}`;
    const total = stat[0]?.total || 0;
    const manual = stat[0]?.manual || 0;
    const ahId = stat[0]?.ah_id || null;

    const np = Number(header.nilai_potongan);
    if (!np || np <= 0) { out.reason = 'NO_POTONGAN'; return out; }
    if (manual > 0) { out.reason = 'HAS_MANUAL_RINCIAN'; return out; }

    const jenis = classifyJenis(setoran.uraian || setoran.jenis_pajak);
    const uraianFinal = (setoran.uraian && String(setoran.uraian).trim()) || jenis;

    // id_sumber_dana dari detail pertama header (fallback NULL)
    const sdRows = await db.$queryRaw`
      SELECT id_sumber_dana::text as sd FROM detail_sp2d
      WHERE id_sp2d::text = ${header.id} AND id_sumber_dana IS NOT NULL LIMIT 1`;
    const sdId = sdRows[0]?.sd || null;

    // Placeholder AUTO_HEADER yang menunjuk header sama → DIKONVERSI menjadi
    // rincian riil (bukan dibungkam): identitas diambil dari setoran penunjuk.
    if (ahId && total === 1) {
      await db.$executeRaw`
        UPDATE data_sp2d_potongan SET
          jenis_potongan = ${jenis},
          uraian         = ${uraianFinal},
          opd            = COALESCE(opd, ${header.opd || null}),
          tanggal_pencairan = ${header.tgl_cair},
          id_sumber_dana = ${sdId},
          keterangan     = NULL,
          status_rekon   = 'SUDAH',
          selisih_rekon  = 0,
          keterangan_rekon = ${`Auto-sync dari setoran manual ${setoran.id}`}
        WHERE id::text = ${ahId}`;
      out.synced = true; out.reason = 'CONVERTED_FROM_AUTO_HEADER';
      out.jenis = jenis; out.nilai = np;
      await logAktivitas(actor || 'SYSTEM', 'AUTO_SYNC_RINCIAN',
        `Setoran ${setoran.id} → header ${header.nomor}: placeholder AUTO_HEADER dikonversi rincian ${jenis} Rp${np.toLocaleString('id-ID')} (SUDAH, terwakili setoran)`);
      return out;
    }

    // Tanpa baris apa pun → buat rincian riil baru (SUDAH)
    await db.$executeRaw`
      INSERT INTO data_sp2d_potongan
        (id_sp2d, nomor_sp2d, opd, jenis_potongan, uraian, nilai,
         tanggal_pencairan, id_sumber_dana, status_rekon, selisih_rekon,
         keterangan, keterangan_rekon)
      VALUES (${header.id},
              ${header.nomor},
              ${header.opd || null},
              ${jenis},
              ${uraianFinal},
              ${np},
              ${header.tgl_cair},
              ${sdId},
              'SUDAH', 0,
              ${'Auto-sync setoran manual'},
              ${`Auto-sync dari setoran manual ${setoran.id}`})`;

    out.synced = true; out.reason = 'CREATED'; out.jenis = jenis; out.nilai = np;
    await logAktivitas(actor || 'SYSTEM', 'AUTO_SYNC_RINCIAN',
      `Setoran ${setoran.id} → header ${header.nomor}: rincian ${jenis} Rp${np.toLocaleString('id-ID')} dibuat otomatis (SUDAH, terwakili setoran)`);
    return out;
  } catch (e) {
    console.error('[potonganSync] ensureRincianForSetoran:', e.message);
    out.reason = 'ERROR: ' + e.message;
    return out;
  }
};

/**
 * Placeholder gaya-upload untuk header BER-POTONGAN yang kosong rincian
 * (tanpa setoran penunjuk). Persis semantik createSp2d/updateSp2d.
 */
const createAutoHeaderPlaceholder = async (db, header, actor) => {
  await db.$executeRaw`
    INSERT INTO data_sp2d_potongan
      (id_sp2d, nomor_sp2d, opd, jenis_potongan, uraian, nilai,
       tanggal_pencairan, keterangan)
    VALUES (${header.id},
            ${header.nomor},
            ${header.opd || null},
            ${'Potongan Pajak/Lainnya'},
            ${'AUTO_HEADER'},
            ${Number(header.nilai_potongan)},
            ${header.tgl_cair},
            ${'AUTO_HEADER'})`;
  await logAktivitas(actor || 'SYSTEM', 'AUTO_PLACEHOLDER_RINCIAN',
    `Header ${header.nomor}: placeholder AUTO_HEADER Rp${Number(header.nilai_potongan).toLocaleString('id-ID')} dirematerialisasi`);
};

const repairHeaderInvariant = async (db, headerId, actor) => {
  const rows = await db.$queryRaw`
    SELECT id::text as id, nomor, opd, CAST(nilai_potongan AS DECIMAL) as nilai_potongan,
           COALESCE(tanggal_pencairan, tanggal)::date as tgl_cair
    FROM data_sp2d WHERE id::text = ${String(headerId)} LIMIT 1`;
  const header = rows[0];
  if (!header) return false;
  const n = Number(header.nilai_potongan);
  if (!n || n <= 0) return false;
  if ((await countRincian(db, headerId)) > 0) return false;
  await createAutoHeaderPlaceholder(db, header, actor);
  return true;
};

/**
 * Dipanggil SETELAS operasi penghapusan rincian massal/individual.
 * Header korban yang masih ber-potongan namun kini tanpa satu pun baris
 * → placeholder AUTO_HEADER dirematerialisasi (invariant tetap terjaga).
 */
const reMaterializePlaceholders = async (db, headerIds, actor) => {
  let fixed = 0;
  for (const hid of [...new Set((headerIds || []).filter(Boolean).map(String))]) {
    try {
      const rows = await db.$queryRaw`
        SELECT id::text as id, nomor, opd, CAST(nilai_potongan AS DECIMAL) as nilai_potongan,
               COALESCE(tanggal_pencairan, tanggal)::date as tgl_cair
        FROM data_sp2d WHERE id::text = ${hid}
          AND CAST(nilai_potongan AS DECIMAL) > 0
          AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan x WHERE x.id_sp2d::text = ${hid})`;
      if (rows[0]) {
        await createAutoHeaderPlaceholder(db, rows[0], actor);
        fixed++;
      }
    } catch (e) {
      console.error('[potonganSync] reMaterialize:', hid, e.message);
    }
  }
  return fixed;
};

/**
 * Backfill global: semua header ber-potongan tanpa satu pun rincian.
 * dry_run=true → hanya daftar. Eksekusi:
 *   - ada setoran penunjuk → rincian riil SUDAH (ensureRincianForSetoran path)
 *   - tidak ada            → placeholder AUTO_HEADER (repairHeaderInvariant path)
 */
const backfillHandler = async (req, res) => {
  const dryRun = req.query.dry_run !== '0';
  const actor = req.user?.username || 'SYSTEM';
  try {
    const targets = await prisma.$queryRaw`
      SELECT h.id::text as id, h.nomor, CAST(h.nilai_potongan AS DECIMAL) as nilai_potongan,
             (SELECT COUNT(*)::int FROM setoran_pajak sp
               WHERE TRIM(sp.nomor_bukti) = TRIM(h.nomor)) as jml_setoran,
             (SELECT COUNT(*)::int FROM data_sp2d_potongan x WHERE x.id_sp2d = h.id) as total_rincian,
             (SELECT COUNT(*)::int FROM data_sp2d_potongan x
               WHERE x.id_sp2d = h.id AND COALESCE(x.keterangan,'') <> 'AUTO_HEADER') as manual_rincian
      FROM data_sp2d h
      WHERE CAST(h.nilai_potongan AS DECIMAL) > 0
        AND (
          NOT EXISTS (SELECT 1 FROM data_sp2d_potongan x WHERE x.id_sp2d = h.id)
          OR (
            EXISTS (SELECT 1 FROM data_sp2d_potongan x WHERE x.id_sp2d = h.id
                     AND COALESCE(x.keterangan,'') = 'AUTO_HEADER')
            AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan x WHERE x.id_sp2d = h.id
                     AND COALESCE(x.keterangan,'') <> 'AUTO_HEADER')
            AND EXISTS (SELECT 1 FROM setoran_pajak sp WHERE TRIM(sp.nomor_bukti) = TRIM(h.nomor))
          )
        )
      ORDER BY h.tahun DESC, h.nomor ASC`;
    if (dryRun) {
      return res.json({ dry_run: true, total: targets.length, targets });
    }
    let syncedReal = 0, converted = 0, placeholder = 0, failed = 0;
    for (const t of targets) {
      try {
        if (t.jml_setoran > 0) {
          const sp = await prisma.$queryRaw`
            SELECT id::text as id, nomor_bukti, uraian, jenis_pajak FROM setoran_pajak
            WHERE TRIM(nomor_bukti) = TRIM(${t.nomor})
            ORDER BY created_at DESC LIMIT 1`;
          const r = await ensureRincianForSetoran(sp[0], actor);
          if (!r.synced) { failed++; continue; }
          if (r.reason === 'CONVERTED_FROM_AUTO_HEADER') converted++; else syncedReal++;
        } else {
          const ok = await repairHeaderInvariant(prisma, t.id, actor);
          ok ? placeholder++ : failed++;
        }
      } catch (_) { failed++; }
    }
    await logAktivitas(actor, 'BACKFILL_POTONGAN_MANUAL',
      `Backfill invariant: ${syncedReal} rincian-riil(SUDAH) + ${converted} konversi-AUTO_HEADER + ${placeholder} placeholder baru dari ${targets.length} target, gagal ${failed}`);
    res.json({ dry_run: false, total_target: targets.length, rincian_riil_sudah: syncedReal, dikonversi_auto_header: converted, placeholder_auto_header: placeholder, gagal: failed });
  } catch (e) {
    res.status(500).json({ message: 'Backfill gagal', error: e.message });
  }
};

module.exports = {
  classifyJenis,
  ensureRincianForSetoran,
  repairHeaderInvariant,
  reMaterializePlaceholders,
  backfillHandler,
};
