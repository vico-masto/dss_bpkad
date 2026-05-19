const db = require('./config/db');

async function run() {
    try {
        console.log("=== DIAGNOSA REKONSILIASI TALANGAN ===");
        
        // 1. Total dari data_sp2d
        const sp2d = await db.query("SELECT SUM(nilai_bruto) as total, COUNT(*) as count FROM data_sp2d WHERE status_dana = 'Talangan'");
        console.log(`Arsip Kas Keluar (Status Talangan):`);
        console.log(`- Total Nilai: Rp ${parseFloat(sp2d.rows[0].total || 0).toLocaleString('id-ID')}`);
        console.log(`- Jumlah Record: ${sp2d.rows[0].count}`);

        // 2. Total dari jurnal_talangan
        const jurnal = await db.query("SELECT SUM(CAST(nilai AS NUMERIC)) as total, COUNT(*) as count FROM jurnal_talangan WHERE status = 'BELUM'");
        console.log(`\nJurnal Talangan (Status BELUM):`);
        console.log(`- Total Nilai: Rp ${parseFloat(jurnal.rows[0].total || 0).toLocaleString('id-ID')}`);
        console.log(`- Jumlah Record: ${jurnal.rows[0].count}`);

        // 3. Cari SP2D yang 'Talangan' tapi tidak ada di Jurnal
        const missingInJurnal = await db.query(`
            SELECT nomor, nilai_bruto 
            FROM data_sp2d 
            WHERE status_dana = 'Talangan' 
            AND nomor NOT IN (SELECT no_referensi FROM jurnal_talangan WHERE no_referensi IS NOT NULL)
        `);
        console.log(`\nSP2D berstatus Talangan tapi TIDAK ADA di Jurnal: ${missingInJurnal.rows.length}`);
        missingInJurnal.rows.forEach(r => console.log(`  - ${r.nomor}: Rp ${parseFloat(r.nilai_bruto).toLocaleString('id-ID')}`));

        // 4. Cari Jurnal yang ada tapi SP2D nya bukan 'Talangan'
        const mismatchStatus = await db.query(`
            SELECT j.no_referensi, j.nilai, s.status_dana
            FROM jurnal_talangan j
            JOIN data_sp2d s ON j.no_referensi = s.nomor
            WHERE j.status = 'BELUM' AND s.status_dana != 'Talangan'
        `);
        console.log(`\nJurnal 'BELUM' tapi SP2D berstatus '${mismatchStatus.rows[0]?.status_dana || 'Aman'}': ${mismatchStatus.rows.length}`);
        mismatchStatus.rows.forEach(r => console.log(`  - ${r.no_referensi}: Rp ${parseFloat(r.nilai).toLocaleString('id-ID')} (SP2D: ${r.status_dana})`));

        // 5. Talangan Manual (Tanpa SP2D)
        const manual = await db.query("SELECT SUM(CAST(nilai AS NUMERIC)) as total, COUNT(*) as count FROM jurnal_talangan WHERE status = 'BELUM' AND (no_referensi IS NULL OR no_referensi NOT IN (SELECT nomor FROM data_sp2d))");
        console.log(`\nTalangan Manual (Input Langsung):`);
        console.log(`- Total Nilai: Rp ${parseFloat(manual.rows[0].total || 0).toLocaleString('id-ID')}`);
        console.log(`- Jumlah Record: ${manual.rows[0].count}`);

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

run();
