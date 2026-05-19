const db = require('./config/db');

async function migrate() {
  try {
    console.log('Migrating master_pagu to support Jenis Pagu...');
    
    // 1. Add jenis column
    await db.query(`
      ALTER TABLE master_pagu ADD COLUMN IF NOT EXISTS jenis VARCHAR(20) DEFAULT 'MURNI';
    `);

    // 2. Update unique constraint
    // First drop the old one (it usually has an auto-generated name if not specified, 
    // but in init.sql it was UNIQUE(tahun, opd, id_sumber_dana))
    // We can find the constraint name or just try to drop common names
    try {
      await db.query(`ALTER TABLE master_pagu DROP CONSTRAINT IF EXISTS master_pagu_tahun_opd_id_sumber_dana_key;`);
    } catch (e) {}

    await db.query(`
      ALTER TABLE master_pagu ADD CONSTRAINT master_pagu_unique_v2 
      UNIQUE(tahun, opd, id_sumber_dana, jenis);
    `);

    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
