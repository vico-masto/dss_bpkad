const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runDetailedAudit() {
  console.log("=== DETAILED AUDIT OF SP2D RECONCILIATION DATA ===");

  // 1. Let's look at February 2026
  console.log("\n--- FEBRUARY 2026 ---");
  const febSp2d = await prisma.$queryRaw`
    SELECT id, nomor, tanggal, tanggal_pencairan, status_rekon, nilai_bruto
    FROM data_sp2d
    WHERE (
      (tanggal_pencairan::DATE BETWEEN '2026-02-01' AND '2026-02-28')
      OR (tanggal_pencairan IS NULL AND tanggal::DATE BETWEEN '2026-02-01' AND '2026-02-28')
    )
  `;
  console.log(`Total SP2D in Feb 2026: ${febSp2d.length}`);
  console.log(`Unmatched (status_rekon = 'BELUM' or NULL or ''): ${febSp2d.filter(s => s.status_rekon === 'BELUM').length}`);
  console.log(`Matched (status_rekon = 'SUDAH'): ${febSp2d.filter(s => s.status_rekon === 'SUDAH').length}`);

  // 2. Let's look at March 2026
  console.log("\n--- MARCH 2026 ---");
  const marSp2d = await prisma.$queryRaw`
    SELECT id, nomor, tanggal, tanggal_pencairan, status_rekon, nilai_bruto
    FROM data_sp2d
    WHERE (
      (tanggal_pencairan::DATE BETWEEN '2026-03-01' AND '2026-03-31')
      OR (tanggal_pencairan IS NULL AND tanggal::DATE BETWEEN '2026-03-01' AND '2026-03-31')
    )
  `;
  console.log(`Total SP2D in March 2026: ${marSp2d.length}`);
  console.log(`Unmatched (status_rekon = 'BELUM'): ${marSp2d.filter(s => s.status_rekon === 'BELUM').length}`);
  console.log(`Matched (status_rekon = 'SUDAH'): ${marSp2d.filter(s => s.status_rekon === 'SUDAH').length}`);

  // Let's see if there are any unmatched SP2Ds in March that are actually matched to bank statement but not updated in data_sp2d table
  // Let's check March bank_statement records that are matched:
  const matchedBankMar = await prisma.bank_statement.findMany({
    where: {
      tanggal: { gte: new Date('2026-03-01T00:00:00Z'), lte: new Date('2026-03-31T23:59:59Z') },
      is_matched: true,
      debet: { gt: 0 }
    }
  });
  console.log(`Matched Bank Debet in March 2026: ${matchedBankMar.length}`);

  // 3. Let's analyze the exact 23 unmatched SP2Ds in the entire database:
  console.log("\n--- ANALYZING ALL 23 UNMATCHED SP2Ds ---");
  const allUnmatched = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'BELUM' },
    select: { id: true, nomor: true, tanggal: true, tanggal_pencairan: true, nilai_bruto: true }
  });
  
  // Let's check for each unmatched SP2D if there is a matching bank statement by value ± 7 days
  let countWithNearMatch = 0;
  let countWithNoMatch = 0;
  const matchDetails = [];

  for (const sp of allUnmatched) {
    const tgl = sp.tanggal_pencairan || sp.tanggal;
    const tglDate = new Date(tgl);
    const startWindow = new Date(tglDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endWindow = new Date(tglDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Find if there is an unmatched bank debet with same net value (or close to bruto value)
    // SP2D net value = bruto - deductions
    const potRes = await prisma.data_sp2d_potongan.aggregate({
      where: { id_sp2d: sp.id },
      _sum: { nilai: true }
    });
    const pot = Number(potRes._sum.nilai || 0);
    const neto = Number(sp.nilai_bruto) - pot;

    const nearBank = await prisma.bank_statement.findMany({
      where: {
        debet: { gt: 0 },
        is_matched: false,
        tanggal: { gte: startWindow, lte: endWindow }
      }
    });

    const exactNetoMatch = nearBank.filter(b => Math.abs(Number(b.debet) - neto) < 1);
    const exactBrutoMatch = nearBank.filter(b => Math.abs(Number(b.debet) - Number(sp.nilai_bruto)) < 1);

    if (exactNetoMatch.length > 0 || exactBrutoMatch.length > 0) {
      countWithNearMatch++;
      matchDetails.push({
        sp2d: sp.nomor,
        neto,
        bruto: Number(sp.nilai_bruto),
        matches: exactNetoMatch.map(b => `BankDebet=${b.debet} @ ${b.tanggal.toISOString().split('T')[0]}`)
      });
    } else {
      countWithNoMatch++;
    }
  }

  console.log(`Total Unmatched SP2Ds: ${allUnmatched.length}`);
  console.log(`SP2Ds that have a potential bank debet match but are NOT matched: ${countWithNearMatch}`);
  console.log(`SP2Ds that have absolutely NO bank debet match: ${countWithNoMatch}`);

  console.log("\nDetails of potential matches for unmatched SP2Ds:");
  console.log(JSON.stringify(matchDetails.slice(0, 10), null, 2));

  // Let's check how many unmatched bank statements there are in total for debet > 0
  const totalUnmatchedBankDebet = await prisma.bank_statement.count({
    where: { debet: { gt: 0 }, is_matched: false }
  });
  console.log(`\nTotal Unmatched Bank Debet items: ${totalUnmatchedBankDebet}`);

  await prisma.$disconnect();
}

runDetailedAudit();
