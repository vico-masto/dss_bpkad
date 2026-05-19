const db = require('./config/db');

async function run() {
    try {
        console.log("=== PENGECEKAN BRUTO VS NETO PADA JURNAL ===");
        
        const res = await db.query(`
            SELECT 
                s.nomor, 
                s.nilai_bruto, 
                s.nilai_neto, 
                j.nilai as nilai_jurnal,
                (s.nilai_bruto - CAST(j.nilai AS NUMERIC)) as selisih_bruto,
                (s.nilai_neto - CAST(j.nilai AS NUMERIC)) as selisih_neto
            FROM data_sp2d s 
            JOIN jurnal_talangan j ON s.nomor = j.no_referensi 
            WHERE j.status = 'BELUM'
            LIMIT 10
        `);

        res.rows.forEach(r => {
            console.log(`\nNomor: ${r.nomor}`);
            console.log(`- Bruto: ${parseFloat(r.nilai_bruto).toLocaleString()}`);
            console.log(`- Neto : ${parseFloat(r.nilai_neto).toLocaleString()}`);
            console.log(`- Jurnal: ${parseFloat(r.nilai_jurnal).toLocaleString()}`);
            
            if (Math.abs(r.selisih_bruto) < 1) console.log(">> MATCH WITH BRUTO");
            else if (Math.abs(r.selisih_neto) < 1) console.log(">> MATCH WITH NETO");
            else console.log(">> MISMATCH (Other)");
        });

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

run();
