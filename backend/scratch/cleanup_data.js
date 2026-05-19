const prisma = require('../prismaClient');

async function cleanData() {
    try {
        console.log("--- CLEANING GARBAGE DATA ---");

        // 1. Reset Ghost Matches Potongan to BELUM
        console.log("Step 1: Resetting Ghost Matches Potongan...");
        const resetPot = await prisma.$queryRaw`
            UPDATE data_sp2d_potongan
            SET status_rekon = 'BELUM', tanggal_pencairan = NULL, selisih_rekon = 0, keterangan_rekon = NULL
            WHERE id IN (
                SELECT p.id
                FROM data_sp2d_potongan p
                LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
                WHERE p.status_rekon != 'BELUM' AND b.id IS NULL
            )
        `;
        console.log("Result Step 1: Potongan cleaned.");

        // 2. Sync Mismatched Status (Potongan should follow SP2D parent)
        console.log("Step 2: Syncing Mismatched Status (Potongan -> SP2D)...");
        const syncPot = await prisma.$queryRaw`
            UPDATE data_sp2d_potongan p
            SET status_rekon = s.status_rekon
            FROM data_sp2d s
            WHERE p.id_sp2d = s.id AND p.status_rekon != s.status_rekon
        `;
        console.log("Result Step 2: Mismatched status synced.");

        console.log("--- CLEANUP COMPLETE ---");
        process.exit(0);
    } catch (err) {
        console.error("Cleanup failed:", err);
        process.exit(1);
    }
}

cleanData();
