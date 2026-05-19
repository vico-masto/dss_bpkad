const db = require('./config/db');

async function checkSpecific() {
  const nomor = '81.07/04.0/000012/GU/2.18.0.00.0.00.01.0000/M/4/2026';
  try {
    console.log(`--- MENGECEK NOMOR: ${nomor} ---`);
    const res = await db.query("SELECT id, nomor, opd, uraian FROM data_sp2d WHERE nomor = $1", [nomor]);
    
    if (res.rows.length === 0) {
      console.log("HASIL: Nomor ini TIDAK DITEMUKAN di tabel data_sp2d.");
      // Cek apakah ada yang mirip
      const partial = nomor.split('/')[2]; // Ambil bagian '000012'
      const similar = await db.query("SELECT nomor, opd FROM data_sp2d WHERE nomor LIKE $1 LIMIT 3", [`%${partial}%`]);
      console.log("\nDATA YANG MIRIP:");
      similar.rows.forEach(r => console.log(`- '${r.nomor}' (OPD: ${r.opd})`));
    } else {
      console.log("HASIL: Data ditemukan.");
      res.rows.forEach(r => console.log(`- ID: ${r.id}\n- OPD: '${r.opd}'\n- Uraian: ${r.uraian}`));
    }
  } catch (err) {
    console.error(err.message);
  }
  process.exit();
}

checkSpecific();
