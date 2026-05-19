require('dotenv').config();
const db = require('../config/db');

async function migrate() {
  console.log('Adding tanggal_pencairan to data_sp2d_potongan...');
  try {
    await db.query(`
      ALTER TABLE data_sp2d_potongan 
      ADD COLUMN IF NOT EXISTS tanggal_pencairan DATE;
    `);
    console.log('✓ Column tanggal_pencairan added successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  }
}

migrate();
