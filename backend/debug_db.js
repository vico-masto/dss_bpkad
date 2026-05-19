const db = require('./config/db');

async function check() {
  try {
    const res = await db.query("SELECT * FROM master_sumber_dana WHERE id = 'SD-ALL'");
    console.log('SD-ALL exists:', res.rows.length > 0);
    
    const pagu = await db.query("SELECT * FROM master_pagu LIMIT 5");
    console.log('Pagu sample:', pagu.rows);
    
    const schema = await db.query(`
      SELECT column_name, data_type, character_maximum_length, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'master_pagu'
    `);
    console.log('Master Pagu Schema:', schema.rows);
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    process.exit(0);
  }
}

check();
