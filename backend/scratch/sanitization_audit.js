const prisma = require('../prismaClient');

async function sanitizationAudit() {
    try {
        console.log("--- START SANITIZATION AUDIT ---");

        // 1. Ghost Matches Potongan
        const ghostPot = await prisma.$queryRaw`
            SELECT COUNT(*)::int as jumlah 
            FROM data_sp2d_potongan p
            LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
            WHERE p.status_rekon != 'BELUM' AND b.id IS NULL
        `;
        console.log("1. Ghost Matches Potongan (Status Rekon tapi tak ada di Bank):", ghostPot[0].jumlah);

        // 2. Ghost Matches SP2D
        const ghostSp2d = await prisma.$queryRaw`
            SELECT COUNT(*)::int as jumlah 
            FROM data_sp2d s
            LEFT JOIN bank_statement b ON s.id::text = b.ref_bku_id
            WHERE s.status_rekon != 'BELUM' AND b.id IS NULL
        `;
        console.log("2. Ghost Matches SP2D:", ghostSp2d[0].jumlah);

        // 3. Status Mismatch between SP2D and its Potongan
        const mismatch = await prisma.$queryRaw`
            SELECT COUNT(*)::int as jumlah
            FROM data_sp2d_potongan p
            JOIN data_sp2d s ON p.id_sp2d = s.id
            WHERE p.status_rekon != s.status_rekon
        `;
        console.log("3. Status Mismatch (SP2D vs Potongan):", mismatch[0].jumlah);

        // 4. Bank items marked as matched but ref_bku_id is empty or invalid
        const invalidBank = await prisma.$queryRaw`
            SELECT COUNT(*)::int as jumlah
            FROM bank_statement
            WHERE is_matched = true AND (ref_bku_id IS NULL OR ref_bku_id = '')
        `;
        console.log("4. Invalid Matched Bank (No ref_bku_id):", invalidBank[0].jumlah);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

sanitizationAudit();
