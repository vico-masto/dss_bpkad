const db = require('./config/db');

async function diagnose() {
  try {
    console.log("--- SAMPEL JURNAL TALANGAN ---");
    const talangan = await db.query("SELECT no_referensi FROM jurnal_talangan LIMIT 5");
    talangan.rows.forEach(r => console.log(`'${r.no_referensi}' (Length: ${r.no_referensi?.length})`));

    console.log("\n--- SAMPEL DATA SP2D ---");
    const sp2d = await db.query("SELECT nomor FROM data_sp2d LIMIT 5");
    sp2d.rows.forEach(r => console.log(`'${r.nomor}' (Length: ${r.nomor?.length})`));

    if (talangan.rows.length > 0) {
        const sampleNo = talangan.rows[0].no_referensi;
        console.log(`\n--- MENCARI SPECIFIC: ${sampleNo} ---`);
        const search = await db.query("SELECT nomor, opd FROM data_sp2d WHERE nomor = $1", [sampleNo]);
        console.log(`Match Result: ${search.rows.length} rows found.`);
    }

  } catch (err) {
    console.error(err.message);
  }
  process.exit();
}

diagnose();
