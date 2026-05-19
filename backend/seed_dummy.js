const db = require('./config/db');

async function seed() {
  console.log('--- RESETTING AND SEEDING DUMMY DATA ---');
  
  try {
    // 1. Clear existing data
    await db.query('DELETE FROM detail_sp2d');
    await db.query('DELETE FROM data_sp2d');
    await db.query('DELETE FROM data_pendapatan');
    await db.query('DELETE FROM data_penyesuaian');
    await db.query('DELETE FROM saldo_awal');
    console.log('Cleared all previous data.');

    // 2. Fetch Master Data
    const opdRes = await db.query('SELECT nama FROM master_opd ORDER BY urutan ASC');
    const opds = opdRes.rows.map(r => r.nama);
    
    const sdRes = await db.query('SELECT id FROM master_sumber_dana');
    const sds = sdRes.rows.map(r => r.id);

    const jenisRes = await db.query('SELECT nama FROM master_jenis_belanja ORDER BY urutan ASC');
    const jenisBelanja = jenisRes.rows.map(r => r.nama);

    // 3. Create Initial Income (100 Billion)
    // Distributed across sources for balance
    const totalIncome = 100000000000; // 100M
    const incomePerSd = totalIncome / sds.length;
    
    for (let i = 0; i < sds.length; i++) {
      const sdId = sds[i];
      await db.query(`
        INSERT INTO data_pendapatan (id, tanggal, tahun, nomor_bukti, uraian, id_sumber_dana, nilai)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [`PND-2026-${i+1}`, '2026-01-01', 2026, 'BKT-001-' + sdId, 'PENERIMAAN KAS AWAL TAHUN - ' + sdId, sdId, incomePerSd]);
    }
    console.log('Inserted 100 Billion IDR across all sources.');

    // 4. Create 100 SP2D
    console.log('Generating 100 SP2Ds...');
    for (let i = 1; i <= 100; i++) {
      const date = new Date(2026, Math.floor(Math.random() * 5), Math.floor(Math.random() * 28) + 1);
      const formattedDate = date.toISOString().split('T')[0];
      const opd = opds[Math.floor(Math.random() * opds.length)];
      const jenis = jenisBelanja[Math.floor(Math.random() * jenisBelanja.length)];
      const bruto = Math.floor(Math.random() * 500000000) + 10000000; // 10M to 510M
      const potongan = Math.floor(bruto * 0.11); // 11% tax approx
      const neto = bruto - potongan;
      const sdId = sds[Math.floor(Math.random() * sds.length)];

      const sp2dRes = await db.query(`
        INSERT INTO data_sp2d (id, nomor, tanggal, tahun, opd, jenis, uraian, penerima, nilai_bruto, nilai_potongan, status_dana)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id
      `, [
        i,
        `00${i}/SP2D/${opd.substring(0, 3)}/2026`,
        formattedDate,
        2026,
        opd,
        jenis,
        `PEMBAYARAN ${jenis} TAHAP ${Math.ceil(i/10)}`,
        `PT. DUMMY REJEKI ${i}`,
        bruto,
        potongan,
        'Aman'
      ]);

      const sp2dId = sp2dRes.rows[0].id;

      await db.query(`
        INSERT INTO detail_sp2d (id_sp2d, id_sumber_dana, nilai_bruto, nilai_neto)
        VALUES ($1, $2, $3, $4)
      `, [sp2dId, sdId, bruto, neto]);
    }

    console.log('Successfully seeded 100 SP2D records.');
    process.exit(0);
  } catch (err) {
    console.error('Error seeding data:', err);
    process.exit(1);
  }
}

seed();
