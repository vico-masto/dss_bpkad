const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const unmatchedBank = await prisma.bank_statement.findMany({
    where: { is_matched: false },
  });

  const unmatchedSp2d = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'BELUM' }
  });

  console.log(`Unmatched Bank: ${unmatchedBank.length}`);
  console.log(`Unmatched SP2D: ${unmatchedSp2d.length}`);

  let potentialMatches = 0;

  for (const bank of unmatchedBank) {
    const debet = Number(bank.debet) || 0;
    const kredit = Number(bank.kredit) || 0;
    const val = debet > 0 ? debet : kredit;
    const isOut = debet > 0;
    
    if (!isOut) continue; // Only check SP2D (pengeluaran)

    const matchingSp2ds = unmatchedSp2d.filter(sp2d => {
      const sp2dNeto = Number(sp2d.nilai_neto) || 0;
      const sp2dBruto = Number(sp2d.nilai_bruto) || 0;
      return Math.abs(sp2dNeto - val) <= 1 || Math.abs(sp2dBruto - val) <= 1;
    });

    if (matchingSp2ds.length > 0) {
      console.log(`\nBank: ${bank.deskripsi} (Val: ${val}, Date: ${bank.tanggal})`);
      matchingSp2ds.forEach(sp2d => {
        const diffDays = (new Date(bank.tanggal).getTime() - new Date(sp2d.tanggal).getTime()) / (1000 * 3600 * 24);
        console.log(`  -> SP2D: ${sp2d.nomor} (Neto: ${sp2d.nilai_neto}, Bruto: ${sp2d.nilai_bruto}, Date: ${sp2d.tanggal}, Diff: ${diffDays} days)`);
      });
      potentialMatches++;
    }
  }

  console.log(`\nTotal Bank items with potential SP2D match: ${potentialMatches}`);
}

run().finally(() => prisma.$disconnect());
