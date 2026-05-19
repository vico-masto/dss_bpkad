const prisma = require('../prismaClient');

async function testAnomalies() {
    const targetTahun = 2026;
    const targetBulan = null;
    const limit = 100;

    try {
        console.log("Testing Query 1: SP2D...");
        const sp2dWhere = { tahun: targetTahun, status_rekon: 'BELUM' };
        await prisma.data_sp2d.count({ where: sp2dWhere });
        console.log("Query 1 OK");

        console.log("Testing Query 2: Pendapatan...");
        await prisma.$queryRawUnsafe(`
            SELECT p.id::text as id, p.tanggal, p.nomor_bukti, p.uraian, p.nilai::numeric, p.id_sumber_dana, 'PENDAPATAN' as tipe
            FROM data_pendapatan p
            LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
            WHERE p.tahun = ${targetTahun} 
            AND b.id IS NULL AND p.status_rekon = 'BELUM'
            LIMIT ${limit}
        `);
        console.log("Query 2 OK");

        console.log("Testing Query 3: Potongan...");
        await prisma.$queryRawUnsafe(`
            SELECT p.id::text as id, CAST(COALESCE(p.tanggal_pencairan, s.tanggal) AS DATE) as tanggal, p.nomor_sp2d as nomor_bukti, p.uraian, p.nilai::numeric, p.id_sumber_dana, 'SELISIH_POTONGAN' as tipe
            FROM data_sp2d_potongan p
            LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
            LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
            WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal)) = ${targetTahun} 
            AND b.id IS NULL AND p.status_rekon = 'BELUM'
            UNION ALL
            SELECT s.id::text as id, CAST(s.tanggal AS DATE) as tanggal, s.nomor_bukti, s.uraian, s.nilai::numeric, s.id_sumber_dana, 'SELISIH_PAJAK' as tipe
            FROM setoran_pajak s
            LEFT JOIN bank_statement b ON s.id::text = b.ref_bku_id
            WHERE EXTRACT(YEAR FROM s.tanggal) = ${targetTahun}
            AND b.id IS NULL AND s.status_rekon = 'BELUM'
            LIMIT ${limit}
        `);
        console.log("Query 3 OK");

        console.log("Testing Query 4: Ghost Match...");
        await prisma.$queryRawUnsafe(`
            SELECT
              'POTONGAN' as tipe, p.id::text as id, p.nomor_sp2d as bukti,
              p.nilai::numeric as nilai, p.status_rekon, CAST(p.tanggal_pencairan AS TEXT) as tanggal,
              p.uraian, COALESCE(p.opd, '') as opd
            FROM data_sp2d_potongan p
            LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
            WHERE p.status_rekon NOT IN ('BELUM')
              AND b.id IS NULL
              AND EXTRACT(YEAR FROM p.tanggal_pencairan) = ${targetTahun}
            UNION ALL
            SELECT
              'PENDAPATAN' as tipe, pnd.id::text as id, pnd.nomor_bukti as bukti,
              pnd.nilai::numeric as nilai, pnd.status_rekon, CAST(pnd.tanggal AS TEXT) as tanggal,
              pnd.uraian, '' as opd
            FROM data_pendapatan pnd
            LEFT JOIN bank_statement b ON pnd.id::text = b.ref_bku_id
            WHERE pnd.status_rekon NOT IN ('BELUM')
              AND b.id IS NULL
              AND pnd.tahun = ${targetTahun}
            LIMIT ${limit}
        `);
        console.log("Query 4 OK");

        console.log("ALL QUERIES OK");
        process.exit(0);
    } catch (err) {
        console.error("FATAL ERROR IN QUERY:");
        console.error(err);
        process.exit(1);
    }
}

testAnomalies();
