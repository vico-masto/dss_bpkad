require('dotenv').config();
const db = require('../config/db');

async function migrate() {
  try {
    await db.query(`ALTER TABLE jurnal_umum ADD COLUMN IF NOT EXISTS id_sumber_dana INTEGER`);
    console.log('✓ id_sumber_dana added to jurnal_umum');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
migrate();
