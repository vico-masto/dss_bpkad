const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditMissed() {
  console.log('--- AUDIT: MISSED MATCH OPPORTUNITIES ---');
  
  // 1. Get all unmatched Bank Mutations
  const bankItems = await prisma.bank_statement.findMany({
    where: { is_matched: false },
    orderBy: { tanggal: 'asc' }
  });

  console.log('Total Unmatched Bank Items:', bankItems.length);

  let missedPerfect = 0;

  for (const bank of bankItems) {
    const val = Number(bank.debet) || Number(bank.kredit);
    if (val === 0) continue;

    // Search for EXACT value match in BKU (SP2D, Potongan, etc)
    // We'll search in data_sp2d (neto)
    const candidates = await prisma.$queryRaw`
      SELECT 'SP2D' as source, nomor as bukti, nilai_bruto, 
             (nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0)) as nilai_neto,
             tanggal
      FROM data_sp2d h
      WHERE status_rekon = 'BELUM' 
      AND ABS((nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id), 0)) - ${val}) < 1
      LIMIT 5
    `;

    if (candidates.length > 0) {
      missedPerfect++;
      if (missedPerfect <= 5) {
        console.log(`\nPotential Match for Bank [${bank.tanggal.toISOString().split('T')[0]}] Rp ${val}:`);
        candidates.forEach(c => {
          console.log(`  - BKU ${c.source} ${c.bukti} [${c.tanggal.toISOString().split('T')[0]}] Value: ${c.nilai_neto}`);
        });
      }
    }
  }

  console.log('\nTotal Potential Perfect Matches found in DB:', missedPerfect);
  
  // Check if any bank mutations have NULL values or weird types
  const nullBank = await prisma.bank_statement.count({
    where: { AND: [{ debet: 0 }, { kredit: 0 }] }
  });
  console.log('Bank Mutations with 0 value:', nullBank);

  process.exit(0);
}

auditMissed();
