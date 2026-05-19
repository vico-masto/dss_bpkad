const db = require('./config/db');

async function migrate() {
  try {
    console.log('Starting cleanup migration...');
    
    // 1. Re-check SD-ALL
    await db.query(`
      INSERT INTO master_sumber_dana (id, nama, kategori)
      VALUES ('SD-ALL', 'TOTAL APBD (GLOBAL)', 'BEBAS')
      ON CONFLICT (id) DO NOTHING
    `);

    // 2. Fix generated column issue
    console.log('Fixing generated columns in data_sp2d...');
    await db.query(`ALTER TABLE data_sp2d DROP COLUMN nilai_neto;`);
    await db.query(`ALTER TABLE data_sp2d ALTER COLUMN nilai_bruto TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE data_sp2d ALTER COLUMN nilai_potongan TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE data_sp2d ADD COLUMN nilai_neto NUMERIC(20, 2) GENERATED ALWAYS AS (nilai_bruto - nilai_potongan) STORED;`);

    // 3. Other tables
    const tables = [
      ['data_pendapatan', 'nilai'],
      ['detail_sp2d', 'nilai_bruto'],
      ['detail_sp2d', 'nilai_neto'],
      ['jurnal_talangan', 'nilai'],
      ['data_penyesuaian', 'nilai'],
      ['setoran_pajak', 'nilai'],
      ['saldo_awal', 'nilai']
    ];

    for (const [table, col] of tables) {
      try {
        await db.query(`ALTER TABLE ${table} ALTER COLUMN ${col} TYPE NUMERIC(20, 2);`);
        console.log(`Updated ${table}.${col}`);
      } catch (e) {
        console.warn(`Could not update ${table}.${col}: ${e.message}`);
      }
    }

    console.log('Migration complete!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
