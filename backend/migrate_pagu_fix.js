const db = require('./config/db');

async function migrate() {
  try {
    console.log('Starting migration...');
    
    // 1. Add SD-ALL if missing
    await db.query(`
      INSERT INTO master_sumber_dana (id, nama, kategori)
      VALUES ('SD-ALL', 'TOTAL APBD (GLOBAL)', 'BEBAS')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('Ensured SD-ALL exists in master_sumber_dana');

    // 2. Increase precision for master_pagu.nilai
    await db.query(`
      ALTER TABLE master_pagu ALTER COLUMN nilai TYPE NUMERIC(20, 2);
    `);
    console.log('Increased master_pagu.nilai precision to NUMERIC(20, 2)');

    // 3. Do the same for other tables that might hold large values
    await db.query(`ALTER TABLE data_pendapatan ALTER COLUMN nilai TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE data_sp2d ALTER COLUMN nilai_bruto TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE data_sp2d ALTER COLUMN nilai_potongan TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE detail_sp2d ALTER COLUMN nilai_bruto TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE detail_sp2d ALTER COLUMN nilai_neto TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE jurnal_talangan ALTER COLUMN nilai TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE data_penyesuaian ALTER COLUMN nilai TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE setoran_pajak ALTER COLUMN nilai TYPE NUMERIC(20, 2);`);
    await db.query(`ALTER TABLE saldo_awal ALTER COLUMN nilai TYPE NUMERIC(20, 2);`);
    console.log('Updated all numeric columns to NUMERIC(20, 2)');

    console.log('Migration successful!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    process.exit(0);
  }
}

migrate();
