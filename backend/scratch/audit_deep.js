const prisma = require('../prismaClient');

async function auditPotonganDeep() {
    try {
        console.log("1. Checking total records in data_sp2d_potongan...");
        const total = await prisma.data_sp2d_potongan.count();
        console.log("Total Records:", total);

        console.log("\n2. Checking status distribution (all time):");
        const statusAll = await prisma.$queryRaw`
            SELECT status_rekon, COUNT(*)::int as jumlah 
            FROM data_sp2d_potongan 
            GROUP BY status_rekon
        `;
        console.log(statusAll);

        console.log("\n3. Checking 'Ghost Matches' (Status NOT BELUM but NO bank link):");
        const ghost = await prisma.$queryRaw`
            SELECT p.id, p.nomor_sp2d, p.status_rekon, p.nilai 
            FROM data_sp2d_potongan p
            LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
            WHERE p.status_rekon != 'BELUM' AND b.id IS NULL
            LIMIT 10
        `;
        console.log("Ghost Matches Count:", ghost.length, "(sample)");
        console.log(ghost);

        console.log("\n4. Checking SP2D without potongan link but might have them (data inconsistency):");
        const orphanPot = await prisma.$queryRaw`
            SELECT id, nomor_sp2d, id_sp2d 
            FROM data_sp2d_potongan 
            WHERE id_sp2d IS NULL OR id_sp2d NOT IN (SELECT id FROM data_sp2d)
            LIMIT 5
        `;
        console.log("Orphan Potongan (No SP2D parent):", orphanPot.length);
        console.log(orphanPot);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

auditPotonganDeep();
