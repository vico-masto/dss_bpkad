const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runCheckBank() {
  console.log("=== ANALYZING UNMATCHED BANK DEBETS AND THEIR POTENTIAL SP2Ds ===");

  // Fetch all unmatched bank statements where debet > 0 (Feb–Apr 2026)
  const unmatchedBanks = await prisma.bank_statement.findMany({
    where: {
      debet: { gt: 0 },
      is_matched: false,
      tanggal: {
        gte: new Date('2026-02-01T00:00:00Z'),
        lte: new Date('2026-04-30T23:59:59Z')
      }
    },
    orderBy: { tanggal: 'asc' }
  });

  console.log(`Total Unmatched Bank Debets in Feb–Apr 2026: ${unmatchedBanks.length}`);

  // For each unmatched bank statement, let's see if there is an unmatched SP2D with matching neto value
  let matchedCount = 0;
  for (const b of unmatchedBanks) {
    const startWindow = new Date(b.tanggal.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endWindow = new Date(b.tanggal.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get all SP2Ds in the window that are unmatched
    const candidates = await prisma.$queryRaw`
      SELECT 
        s.id, s.nomor, s.status_rekon, s.nilai_bruto,
        COALESCE(s.tanggal_pencairan, s.tanggal) as tgl
      FROM data_sp2d s
      WHERE s.status_rekon = 'BELUM'
        AND COALESCE(s.tanggal_pencairan, s.tanggal)::DATE BETWEEN ${startWindow.toISOString().split('T')[0]}::DATE AND ${endWindow.toISOString().split('T')[0]}::DATE
    `;

    const matches = [];
    for (const c of candidates) {
      // get deductions
      const potRes = await prisma.data_sp2d_potongan.aggregate({
        where: { id_sp2d: c.id },
        _sum: { nilai: true }
      });
      const pot = Number(potRes._sum.nilai || 0);
      const neto = Number(c.nilai_bruto) - pot;

      if (Math.abs(neto - Number(b.debet)) < 1) {
        matches.push({ ...c, neto, type: 'NETO' });
      } else if (Math.abs(Number(c.nilai_bruto) - Number(b.debet)) < 1) {
        matches.push({ ...c, neto, type: 'BRUTO' });
      }
    }

    console.log(`Bank Statement ID ${b.id} | Debet: Rp ${Number(b.debet).toLocaleString('id-ID')} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | Desc: ${b.deskripsi.substring(0, 50)}`);
    if (matches.length > 0) {
      matchedCount++;
      for (const m of matches) {
        console.log(`  -> Match Candidate: SP2D ${m.nomor} | Neto: Rp ${m.neto.toLocaleString('id-ID')} | Bruto: Rp ${Number(m.nilai_bruto).toLocaleString('id-ID')} | Tgl: ${new Date(m.tgl).toISOString().split('T')[0]} (${m.type})`);
      }
    } else {
      console.log(`  -> NO MATCHING CANDIDATE`);
    }
    console.log();
  }

  console.log(`Total bank statements with potential matches: ${matchedCount} out of ${unmatchedBanks.length}`);

  await prisma.$disconnect();
}

runCheckBank();
