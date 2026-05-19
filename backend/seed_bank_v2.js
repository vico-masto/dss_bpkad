const db = require('./config/db');
require('dotenv').config();

async function run() {
  try {
    console.log('Seeding Bank Statement V2 (Excel Format)...');
    await db.query('DELETE FROM bank_statement');
    
    const data = [
      { tgl: '2026-04-01', desc: 'SALDO AWAL', in: 124139141708, out: 0, balance: 124139141707.56 },
      { tgl: '2026-04-01', desc: 'IWP 8%/LS GJP3KTHPIAPR26/DINKE', in: 0, out: 4380809, balance: 124134760898.56 },
      { tgl: '2026-04-01', desc: 'JKK 28/LS GJP3KTHPIAPR26/DINKE', in: 0, out: 309842, balance: 124134451056.56 },
      { tgl: '2026-04-01', desc: 'JKM 28/LS GJP3KTHPIAPR26/DINKE', in: 0, out: 929491, balance: 124133521565.56 },
      { tgl: '2026-04-01', desc: 'IWP 1%/LS GJP3KTHPIAPR26/DINKE', in: 0, out: 1431492, balance: 124132090073.56 },
      { tgl: '2026-04-01', desc: 'PPH 21/LS GJPNSAPR26/BPBD', in: 0, out: 139863, balance: 124131950210.56 },
      { tgl: '2026-04-01', desc: 'IWP 8%/LS GJPNSAPR26/BPBD', in: 0, out: 5641743, balance: 124126308467.56 },
    ];

    for (const item of data) {
      await db.query(
        'INSERT INTO bank_statement (tanggal, deskripsi, debet, kredit, saldo_akhir) VALUES ($1, $2, $3, $4, $5)',
        [item.tgl, item.desc, item.out, item.in, item.balance]
      );
    }

    console.log('SUCCESS: Bank Statement V2 Seeded');
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

run();
