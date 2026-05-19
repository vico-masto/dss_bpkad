const db = require('./config/db');

async function audit() {
  const tables = [
    'master_sumber_dana',
    'users',
    'data_pendapatan',
    'data_sp2d',
    'detail_sp2d',
    'jurnal_talangan',
    'data_penyesuaian',
    'setoran_pajak',
    'saldo_awal',
    'log_aktivitas',
    'master_pagu'
  ];

  console.log('--- DATABASE AUDIT ---');
  for (const table of tables) {
    try {
      const res = await db.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`[OK] Table ${table}: ${res.rows[0].count} rows`);
    } catch (err) {
      console.error(`[ERROR] Table ${table}: ${err.message}`);
    }
  }

  console.log('\n--- DATA CONSISTENCY CHECK ---');
  try {
    const sp2dCount = await db.query('SELECT COUNT(*) FROM data_sp2d');
    const detailCount = await db.query('SELECT COUNT(*) FROM detail_sp2d');
    console.log(`SP2D Headers: ${sp2dCount.rows[0].count}`);
    console.log(`SP2D Details: ${detailCount.rows[0].count}`);
    
    const orphanDetails = await db.query('SELECT COUNT(*) FROM detail_sp2d d LEFT JOIN data_sp2d h ON d.id_sp2d = h.id WHERE h.id IS NULL');
    if (orphanDetails.rows[0].count > 0) {
      console.error(`[WARNING] Found ${orphanDetails.rows[0].count} orphan SP2D details!`);
    } else {
      console.log('[OK] No orphan details found.');
    }
  } catch (err) {
    console.error(`Error during consistency check: ${err.message}`);
  }

  process.exit();
}

audit();
