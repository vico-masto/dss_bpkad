const db = require('./config/db');
require('dotenv').config();

async function migrate() {
  try {
    console.log('Migrating Audit Logs table...');
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        username TEXT,
        action TEXT,
        module TEXT,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Seed some dummy logs
    const dummyLogs = [
      { user: 'ADMIN', action: 'LOGIN', module: 'AUTH', details: 'Login sukses dari IP 192.168.1.10' },
      { user: 'ADMIN', action: 'UPDATE_PAGU', module: 'BUDGET', details: 'Mengubah pagu APBD Induk menjadi 1.2T' },
      { user: 'ADMIN', action: 'MATCH_BANK', module: 'RECONCILIATION', details: 'Melakukan Magic Match untuk 12 transaksi' },
      { user: 'ADMIN', action: 'EXPORT_PDF', module: 'REPORT', details: 'Mengunduh Buku Pembantu Pajak April 2026' },
    ];

    for (const log of dummyLogs) {
      await db.query(
        'INSERT INTO audit_logs (username, action, module, details) VALUES ($1, $2, $3, $4)',
        [log.user, log.action, log.module, log.details]
      );
    }

    console.log('SUCCESS: Audit Logs table created and seeded');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

migrate();
