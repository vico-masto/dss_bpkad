const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runAudit() {
  console.log("=== DIAGNOSTIC AUDIT: SP2D COUNT DISCREPANCY ===");

  // 1. Check all status_rekon values in data_sp2d
  const statusCounts = await prisma.$queryRaw`
    SELECT COALESCE(status_rekon, 'NULL') as status, COUNT(*)::int as jumlah
    FROM data_sp2d
    GROUP BY status_rekon
  `;
  console.log("\n1. All status_rekon counts in data_sp2d:");
  console.log(statusCounts);

  // 2. Count "BELUM" rekon SP2D under different definitions
  // Definition A: status_rekon IS NULL OR status_rekon = '' OR status_rekon = 'BELUM'
  const defA = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count 
    FROM data_sp2d
    WHERE status_rekon IS NULL OR status_rekon = '' OR status_rekon = 'BELUM'
  `;
  console.log(`\n2. Definition A (NULL or Empty or 'BELUM'): ${defA[0].count}`);

  // Definition B: status_rekon = 'BELUM' (exactly)
  const defB = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count 
    FROM data_sp2d
    WHERE status_rekon = 'BELUM'
  `;
  console.log(`3. Definition B (Exactly 'BELUM'): ${defB[0].count}`);

  // Definition C: status_rekon IS NULL (exactly)
  const defC = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count 
    FROM data_sp2d
    WHERE status_rekon IS NULL
  `;
  console.log(`4. Definition C (Exactly NULL): ${defC[0].count}`);

  // Definition D: status_rekon = '' (exactly empty string)
  const defD = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count 
    FROM data_sp2d
    WHERE status_rekon = ''
  `;
  console.log(`5. Definition D (Exactly empty string): ${defD[0].count}`);

  // Let's run a check matching the getAnomalies logic
  // Target tahun 2026 (usually target year is 2026 based on files)
  const targetTahun = 2026;
  
  // Let's see if we query like getAnomalies (using Prisma sp2dWhere with status_rekon: 'BELUM')
  const anomaliesCountPrisma = await prisma.data_sp2d.count({
    where: {
      tahun: targetTahun,
      status_rekon: 'BELUM'
    }
  });
  console.log(`\n6. getAnomalies query count for targetTahun 2026 (exactly 'BELUM'): ${anomaliesCountPrisma}`);

  // Let's query targetTahun 2026 using (NULL or empty or 'BELUM')
  const anomaliesCountCorrect = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM data_sp2d
    WHERE tahun = ${targetTahun}
      AND (status_rekon IS NULL OR status_rekon = '' OR status_rekon = 'BELUM')
  `;
  console.log(`7. getAnomalies query count with (NULL or Empty or 'BELUM') for 2026: ${anomaliesCountCorrect[0].count}`);

  // Let's check getReconciliationData count for 2026 (excluding matching to bank)
  // Let's check what date limits are used, e.g. '2026-02-01' and '2026-04-30' or whole year '2026-01-01' to '2026-12-31'
  const reconCount2026 = await prisma.$queryRaw`
    SELECT COUNT(*)::int as count
    FROM data_sp2d s
    WHERE s.tahun = 2026
      AND (s.status_rekon IS NULL OR s.status_rekon = '' OR s.status_rekon = 'BELUM')
  `;
  console.log(`8. BKU SP2D Unmatched for 2026: ${reconCount2026[0].count}`);

  // Let's see the details of unmatched SP2Ds where status_rekon is NULL or empty string
  const sampleNulls = await prisma.$queryRaw`
    SELECT id, nomor, tanggal, status_rekon, nilai_bruto 
    FROM data_sp2d
    WHERE (status_rekon IS NULL OR status_rekon = '')
    LIMIT 5
  `;
  console.log("\n9. Sample SP2Ds with NULL/empty status_rekon:");
  console.log(sampleNulls);

  await prisma.$disconnect();
}

runAudit();
