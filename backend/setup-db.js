require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function setupDatabase() {
  const client = await pool.connect();
  try {
    console.log('⏳ Memulai pembuatan struktur tabel di PostgreSQL (Versi Upgrade 9.0)...');
    
    const sqlPath = path.join(__dirname, 'database', 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    await client.query(sql);
    
    console.log('✅ Semua tabel berhasil dibuat beserta data master default!');
  } catch (err) {
    console.error('❌ Terjadi kesalahan saat setup database:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

setupDatabase();
