const db = require('./config/db');

async function run() {
    try {
        console.log("=== SINKRONISASI NILAI JURNAL KE BRUTO ===");
        
        // Cari record yang tidak sesuai Bruto
        const mismatch = await db.query(`
            SELECT j.id, s.nomor, s.nilai_bruto, j.nilai as nilai_lama
            FROM jurnal_talangan j
            JOIN data_sp2d s ON j.no_referensi = s.nomor
            WHERE j.status = 'BELUM' AND CAST(j.nilai AS NUMERIC) != s.nilai_bruto
        `);

        console.log(`Ditemukan ${mismatch.rows.length} record yang perlu disinkronisasi ke Nilai Bruto.`);

        for (const row of mismatch.rows) {
            await db.query(
                "UPDATE jurnal_talangan SET nilai = $1 WHERE id = $2",
                [row.nilai_bruto, row.id]
            );
            console.log(`  - [UPDATED] ${row.nomor}: Rp ${parseFloat(row.nilai_lama).toLocaleString()} -> Rp ${parseFloat(row.nilai_bruto).toLocaleString()}`);
        }

        console.log("\nSinkronisasi selesai.");

    } catch (e) {
        console.error(e);
    } finally {
        process.exit();
    }
}

run();
