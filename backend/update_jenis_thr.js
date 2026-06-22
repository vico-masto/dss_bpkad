const db = require('./config/db');

async function updateJenisTHR() {
  const keyword = '%Pembayaran Tunjangan Hari Raya (THR)%';
  const newJenis = 'LS GAJI THR';

  try {
    // Preview data yang akan diubah
    const preview = await db.query(
      `SELECT id, nomor, tanggal, jenis, uraian, opd
       FROM data_sp2d
       WHERE uraian ILIKE $1
       ORDER BY tanggal`,
      [keyword]
    );

    console.log(`\n=== PREVIEW: ${preview.rows.length} record ditemukan ===`);
    if (preview.rows.length === 0) {
      console.log('Tidak ada data yang cocok. Script selesai.');
      process.exit(0);
    }

    const jenisLama = {};
    preview.rows.forEach((r, i) => {
      const key = r.jenis || '(kosong)';
      jenisLama[key] = (jenisLama[key] || 0) + 1;
      console.log(`[${i + 1}] ${r.nomor} | ${r.tanggal?.toISOString().slice(0,10)} | jenis: "${r.jenis}" | ${r.opd}`);
    });

    console.log('\n--- Distribusi jenis saat ini ---');
    Object.entries(jenisLama).forEach(([k, v]) => console.log(`  "${k}": ${v} record`));
    console.log(`\nSemua record di atas akan diubah jenis → "${newJenis}"`);

    // Jalankan UPDATE
    const result = await db.query(
      `UPDATE data_sp2d
       SET jenis = $1
       WHERE uraian ILIKE $2`,
      [newJenis, keyword]
    );

    console.log(`\n✓ UPDATE berhasil: ${result.rowCount} record diperbarui.`);
  } catch (err) {
    console.error('ERROR:', err.message);
  }

  process.exit();
}

updateJenisTHR();
