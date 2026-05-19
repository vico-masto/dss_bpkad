const db = require('./config/db');

async function patchDatabase() {
  console.log('Starting Database Patch...');
  try {
    // 1. Add updated_at to saldo_awal if not exists
    await db.query(`
      ALTER TABLE saldo_awal 
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    console.log('✓ Column updated_at added to saldo_awal');

    // 2. Create log_aktivitas table if not exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS log_aktivitas (
        id SERIAL PRIMARY KEY,
        user_pelaksana VARCHAR(100),
        aksi VARCHAR(100),
        detail TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ Table log_aktivitas verified/created');

    console.log('Database Patch Completed Successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Error during database patch:', err.message);
    process.exit(1);
  }
}

patchDatabase();
