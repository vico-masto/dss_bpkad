const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditNulls() {
  const total = await prisma.bank_statement.count();
  const matched = await prisma.bank_statement.count({ where: { is_matched: true } });
  const unmatchedFalse = await prisma.bank_statement.count({ where: { is_matched: false } });
  const unmatchedNull = await prisma.bank_statement.count({ where: { is_matched: null } });

  console.log('Total Bank Items:', total);
  console.log('Matched (true):', matched);
  console.log('Unmatched (false):', unmatchedFalse);
  console.log('Unmatched (null):', unmatchedNull);

  // Check if any BKU items have status other than BELUM or SUDAH
  const bkuStatuses = await prisma.$queryRaw`
    SELECT status_rekon, COUNT(*)::text as jumlah 
    FROM data_sp2d 
    GROUP BY status_rekon
  `;
  console.log('\nBKU Statuses:', bkuStatuses);

  process.exit(0);
}

auditNulls();
