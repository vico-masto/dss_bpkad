const db = require('./config/db');
require('dotenv').config();

async function run() {
  try {
    await db.query('DELETE FROM bank_statement');
    const res = await db.query('SELECT * FROM data_sp2d LIMIT 20');
    
    for (const s of res.rows) {
      const lastDigits = s.nomor.substring(s.nomor.length - 6);
      const desc = (lastDigits + '/' + s.jenis.substring(0,10) + '/' + s.opd.substring(0,10)).toUpperCase();
      await db.query('INSERT INTO bank_statement (tanggal, deskripsi, debet, kredit) VALUES ($1, $2, $3, $4)', [s.tanggal, desc, s.nilai_neto, 0]);
    }
    
    await db.query('INSERT INTO bank_statement (tanggal, deskripsi, debet, kredit) VALUES ($1, $2, $3, $4)', ['2026-05-30', 'JASA GIRO MEI 2026', 0, 1500000]);
    await db.query('INSERT INTO bank_statement (tanggal, deskripsi, debet, kredit) VALUES ($1, $2, $3, $4)', ['2026-05-30', 'BIAYA ADMIN BANK', 25000, 0]);
    
    console.log('SUCCESS');
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

run();
