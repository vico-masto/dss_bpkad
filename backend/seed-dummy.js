require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function seed() {
  const client = await pool.connect();
  try {
    console.log('⏳ Memulai proses seeding data dummy...');
    
    // 1. Ambil Sumber Dana
    const resSD = await client.query('SELECT id FROM master_sumber_dana');
    const sources = resSD.rows.map(r => r.id);
    
    if (sources.length === 0) {
      console.log('❌ Master sumber dana kosong. Jalankan setup-db dulu.');
      return;
    }

    // 2. Insert Dummy Penerimaan (Revenue) - Rp 500 Juta per Sumber Dana
    console.log('📥 Memasukkan data Penerimaan...');
    for (const sd of sources) {
      const id = `REV-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      await client.query(`
        INSERT INTO data_pendapatan (id, tanggal, tahun, nomor_bukti, uraian, id_sumber_dana, nilai)
        VALUES ($1, CURRENT_DATE - INTERVAL '10 days', 2026, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
      `, [id, `BKM-${sd}-001`, `Penerimaan Kas dari ${sd}`, sd, 500000000]);
    }

    // 3. Insert 100 Dummy SP2D (> 10 Juta)
    console.log('📤 Memasukkan 100 data SP2D...');
    const opds = ['DINAS PENDIDIKAN', 'DINAS KESEHATAN', 'SEKRETARIAT DAERAH', 'DINAS PU', 'DINAS SOSIAL'];
    const jenis = ['LS Barang Jasa', 'LS Gaji', 'GU Nihil', 'TU Nihil'];

    for (let i = 1; i <= 100; i++) {
      const id = `SP2D-UUID-${i}-${Date.now()}`;
      const nomor = `${String(i).padStart(4, '0')}/SP2D/LS/2026`;
      const opd = opds[Math.floor(Math.random() * opds.length)];
      const jns = jenis[Math.floor(Math.random() * jenis.length)];
      const sd = sources[Math.floor(Math.random() * sources.length)];
      
      // Nilai antara 10 Juta s/d 50 Juta
      const bruto = 10000000 + Math.floor(Math.random() * 40000000);
      const pot = bruto * 0.115; // Asumsi PPN + PPh
      const neto = bruto - pot;

      // Insert Header
      await client.query(`
        INSERT INTO data_sp2d (id, nomor, tanggal, tahun, opd, jenis, uraian, penerima, nilai_bruto, nilai_potongan, status_dana, status_rekon)
        VALUES ($1, $2, CURRENT_DATE - (INTERVAL '1 day' * $3), 2026, $4, $5, $6, $7, $8, $9, 'Aman', 'COCOK')
        ON CONFLICT DO NOTHING
      `, [id, nomor, i % 10, opd, jns, `Pembayaran Tagihan ke-${i}`, `CV. MAJU JAYA ${i}`, bruto, pot]);

      // Insert Detail
      await client.query(`
        INSERT INTO detail_sp2d (id_sp2d, id_sumber_dana, nilai_bruto, nilai_neto)
        VALUES ($1, $2, $3, $4)
      `, [id, sd, bruto, neto]);
    }

    // 4. Log Aktivitas
    await client.query(`
      INSERT INTO log_aktivitas (user_pelaksana, aksi, detail)
      VALUES ('SYSTEM', 'SEED DATA DUMMY', 'Memasukkan 100 data SP2D dan penerimaan awal.')
    `);

    console.log('✅ Seeding Selesai! 100 data SP2D dan Penerimaan awal berhasil ditambahkan.');
  } catch (err) {
    console.error('❌ Error seeding:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
