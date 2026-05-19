const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testLogic() {
    try {
        const targetDate = new Date("2026-05-14");
        const endOfPeriodDate = new Date(targetDate);
        endOfPeriodDate.setHours(23, 59, 59, 999);

        console.log("Running Query 1 (SP2D Neto)...");
        const res1 = await prisma.$queryRaw`
            SELECT SUM(CAST(d.nilai_bruto - (COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0))) AS NUMERIC)) as total 
            FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id 
            WHERE CAST((CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN h.tanggal_pencairan ELSE COALESCE(h.tanggal_pencairan, h.tanggal) END) AS DATE) <= CAST(${endOfPeriodDate} AS DATE)
        `;
        console.log("Result 1:", res1);

        console.log("Running Query 2 (Potongan)...");
        const res2 = await prisma.$queryRaw`
            SELECT SUM(CAST(p.nilai AS NUMERIC)) as total 
            FROM data_sp2d_potongan p
            LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
            WHERE CAST(COALESCE(p.tanggal_pencairan, s.tanggal) AS DATE) <= CAST(${endOfPeriodDate} AS DATE)
        `;
        console.log("Result 2:", res2);

        process.exit(0);
    } catch (err) {
        console.error("CRASH DETECTED:");
        console.error(err);
        process.exit(1);
    }
}

testLogic();
