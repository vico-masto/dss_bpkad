const prisma = require('../prismaClient');

async function auditBankAnomalies() {
    try {
        console.log("Checking bank_statement anomalies (matched but with diff)...");
        const bankAnomalies = await prisma.bank_statement.count({
            where: {
                is_matched: true,
                selisih_nilai: { not: 0 }
            }
        });
        console.log("Total Bank Anomalies (Matched with Diff):", bankAnomalies);

        const bankAnomaliesSample = await prisma.bank_statement.findMany({
            where: {
                is_matched: true,
                selisih_nilai: { not: 0 }
            },
            take: 5
        });
        console.log("Sample Bank Anomalies:", JSON.stringify(bankAnomaliesSample, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

auditBankAnomalies();
