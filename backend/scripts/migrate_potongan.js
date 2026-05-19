const db = require('../config/db');

async function migrate() {
  console.log('Starting Migration: Creating data_sp2d_potongan table...');
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS data_sp2d_potongan (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          id_sp2d VARCHAR NOT NULL,
          jenis_potongan VARCHAR NOT NULL,
          nilai DECIMAL(15, 2) NOT NULL,
          id_billing VARCHAR,
          rekening_tujuan VARCHAR,
          keterangan TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT fk_sp2d FOREIGN KEY (id_sp2d) REFERENCES data_sp2d(id) ON DELETE CASCADE
      );
    `);
    
    await db.query(`CREATE INDEX IF NOT EXISTS idx_potongan_sp2d ON data_sp2d_potongan(id_sp2d);`);
    
    console.log('✓ Table data_sp2d_potongan created/verified');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
