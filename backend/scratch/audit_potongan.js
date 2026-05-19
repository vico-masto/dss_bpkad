const prisma = require('../prismaClient');

async function auditData() {
    try {
        console.log("Checking data_sp2d_potongan summary...");
        const potStats = await prisma.$queryRaw`
            SELECT status_rekon, COUNT(*)::int as jumlah 
            FROM data_sp2d_potongan 
            GROUP BY status_rekon
        `;
        console.log("Potongan Status Stats:", potStats);

        console.log("\nChecking setoran_pajak summary...");
        const taxStats = await prisma.$queryRaw`
            SELECT status_rekon, COUNT(*)::int as jumlah 
            FROM setoran_pajak 
            GROUP BY status_rekon
        `;
        console.log("Pajak Status Stats:", taxStats);

        const yearStats = await prisma.$queryRaw`
            SELECT EXTRACT(YEAR FROM COALESCE(tanggal_pencairan, created_at))::int as tahun, COUNT(*)::int as jumlah
            FROM data_sp2d_potongan
            GROUP BY tahun
        `;
        console.log("\nPotongan Year Stats:", yearStats);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

auditData();
