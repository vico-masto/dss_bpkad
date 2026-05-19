const db = require('./config/db');

async function checkAllSchemas() {
  const tables = [
    'data_pendapatan',
    'data_sp2d',
    'detail_sp2d',
    'jurnal_talangan',
    'saldo_awal',
    'master_pagu',
    'setoran_pajak'
  ];
  
  for (const table of tables) {
    try {
      const res = await db.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${table}'
      `);
      console.log(`Table: ${table}`);
      console.log(res.rows.map(r => r.column_name).join(', '));
      console.log('---');
    } catch (err) {
      console.error(`Error checking ${table}: ${err.message}`);
    }
  }
  process.exit();
}

checkAllSchemas();
