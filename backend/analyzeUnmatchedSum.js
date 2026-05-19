const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- ANALISA SELISIH UNMATCHED ---");

  // 1. Unmatched Bank
  const bankUnmatched = await prisma.bank_statement.findMany({
    where: { is_matched: false }
  });
  const bankSumD = bankUnmatched.reduce((sum, b) => sum + Number(b.debet), 0);
  const bankSumK = bankUnmatched.reduce((sum, b) => sum + Number(b.kredit), 0);

  // 2. Unmatched SP2D
  const sp2dUnmatched = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'BELUM' }
  });
  const sp2dSum = sp2dUnmatched.reduce((sum, s) => sum + Number(s.nilai_neto), 0);

  // 3. Unmatched Pendapatan (joined with bank)
  const incUnmatched = await prisma.$queryRaw`
    SELECT p.nilai FROM data_pendapatan p
    LEFT JOIN bank_statement b ON p.id = b.ref_bku_id
    WHERE b.id IS NULL
  `;
  const incSum = incUnmatched.reduce((sum, p) => sum + Number(p.nilai), 0);

  console.log(`Bank Unmatched (Debet/Out): ${bankSumD}`);
  console.log(`Bank Unmatched (Kredit/In): ${bankSumK}`);
  console.log(`SP2D Unmatched (Out): ${sp2dSum}`);
  console.log(`Pendapatan Unmatched (In): ${incSum}`);
  
  console.log(`\nSelisih Netto (In - Out):`);
  console.log(`- Bank: ${bankSumK - bankSumD}`);
  console.log(`- BKU: ${incSum - sp2dSum}`);
}

run().finally(() => prisma.$disconnect());
