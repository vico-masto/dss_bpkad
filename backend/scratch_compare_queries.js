const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runCompare() {
  console.log("=== COMPARING BANK RECON AND ANOMALY COUNTS ===");

  // 1. Get date range of data_sp2d
  const sp2dDates = await prisma.$queryRaw`
    SELECT MIN(tanggal)::text as min_tgl, MAX(tanggal)::text as max_tgl,
           MIN(tanggal_pencairan)::text as min_cair, MAX(tanggal_pencairan)::text as max_cair
    FROM data_sp2d
  `;
  console.log("\nSP2D Date Bounds:", sp2dDates);

  // 2. Count unmatched SP2D per month in data_sp2d (based on tanggal / tanggal_pencairan)
  const sp2dUnmatchedMonthly = await prisma.$queryRaw`
    SELECT 
      TO_CHAR(COALESCE(tanggal_pencairan, tanggal), 'YYYY-MM') as bulan,
      COUNT(*)::int as total_unmatched
    FROM data_sp2d
    WHERE status_rekon = 'BELUM'
    GROUP BY TO_CHAR(COALESCE(tanggal_pencairan, tanggal), 'YYYY-MM')
    ORDER BY bulan
  `;
  console.log("\nUnmatched SP2Ds grouped by YYYY-MM (COALESCE(tanggal_pencairan, tanggal)):");
  console.log(sp2dUnmatchedMonthly);

  // 3. Count unmatched SP2D per month in getReconciliationData's count logic
  // Let's run a query for each month of 2026 to see if any month returns 12!
  console.log("\nChecking getReconciliationData count vs getAnomalies count for each month in 2026:");
  for (let month = 1; month <= 12; month++) {
    const sMonth = String(month).padStart(2, '0');
    const sDate = `2026-${sMonth}-01`;
    // End date calculation
    const eDateObj = new Date(2026, month, 0); // last day of month
    const eDate = `2026-${sMonth}-${String(eDateObj.getDate()).padStart(2, '0')}`;

    // getReconciliationData style count (status = 'BELUM')
    const bkuCount = await prisma.$queryRawUnsafe(`
      SELECT COUNT(*)::int as count
      FROM data_sp2d s
      LEFT JOIN (SELECT id_sp2d, SUM(nilai) as total_nilai FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
      WHERE (
             (s.tanggal_pencairan::DATE BETWEEN '${sDate}' AND '${eDate}')
          OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}')
        ) AND (s.status_rekon = 'BELUM' OR s.status_rekon IS NULL OR s.status_rekon = '')
    `);

    // getAnomalies style count (using year=2026, bulan=month)
    // sp2dWhere targetBulan = month
    const targetTahun = 2026;
    const dateFilter = {
      gte: new Date(Date.UTC(targetTahun, month - 1, 1, 0, 0, 0)),
      lt: new Date(Date.UTC(targetTahun, month, 1, 0, 0, 0))
    };
    const anomaliesCount = await prisma.data_sp2d.count({
      where: {
        tahun: targetTahun,
        status_rekon: 'BELUM',
        OR: [
          { tanggal_pencairan: dateFilter },
          { tanggal_pencairan: null, tanggal: dateFilter }
        ]
      }
    });

    if (bkuCount[0].count > 0 || anomaliesCount > 0) {
      console.log(`Month 2026-${sMonth}: BKU Unmatched SP2D Count = ${bkuCount[0].count} | Anomalies SP2D Count = ${anomaliesCount}`);
    }
  }

  // 4. Let's look for "Ghost Matches" or bank statements linked to BELUM sp2ds!
  // Is it possible that 11 SP2Ds are linked to matched bank statement but their status_rekon is still BELUM?
  // 23 (total unmatched) - 12 (truly unmatched) = 11?
  // Let's run a query to find how many SP2Ds have status_rekon = 'BELUM' but have a bank statement linked to them!
  const ghostMatchesCount = await prisma.$queryRaw`
    SELECT COUNT(DISTINCT s.id)::int as count
    FROM data_sp2d s
    JOIN bank_statement bs ON bs.ref_bku_id = s.id::text
    WHERE s.status_rekon = 'BELUM'
  `;
  console.log(`\n4. SP2Ds with status_rekon = 'BELUM' but linked to a bank_statement: ${ghostMatchesCount[0].count}`);

  const ghostSamples = await prisma.$queryRaw`
    SELECT s.id, s.nomor, s.status_rekon, bs.id as bank_id, bs.is_matched as bank_matched, bs.debet as bank_debet
    FROM data_sp2d s
    JOIN bank_statement bs ON bs.ref_bku_id = s.id::text
    WHERE s.status_rekon = 'BELUM'
    LIMIT 5
  `;
  console.log("Samples of these ghost-linked SP2Ds:", ghostSamples);

  // 5. Let's check if there are duplicate matches or unmatched but is_matched in bank statement
  const totalSp2dBelum = await prisma.data_sp2d.count({ where: { status_rekon: 'BELUM' } });
  console.log(`\nTotal SP2D with status_rekon = 'BELUM': ${totalSp2dBelum}`);

  await prisma.$disconnect();
}

runCompare();
