const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const unmatchedBank = await prisma.bank_statement.findMany({
    where: { is_matched: false },
  });

  const bkuItems = await prisma.$queryRaw`
    SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, CAST(p.nilai AS DECIMAL) as nilai, p.tanggal_pencairan as tanggal, 'POTONGAN' as tipe FROM data_sp2d_potongan p
    LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
    WHERE b.id IS NULL
    UNION ALL
    SELECT CAST(s.id AS VARCHAR) as id, CAST(s.nomor_bukti AS VARCHAR) as bukti, CAST(s.uraian AS VARCHAR) as uraian, CAST(s.nilai AS DECIMAL) as nilai, s.tanggal, 'PAJAK' as tipe FROM setoran_pajak s
    LEFT JOIN bank_statement b ON CAST(s.id AS VARCHAR) = b.ref_bku_id
    WHERE b.id IS NULL
    UNION ALL
    SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_bukti AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, CAST(p.nilai AS DECIMAL) as nilai, p.tanggal, 'MASUK' as tipe FROM data_pendapatan p
    LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
    WHERE b.id IS NULL
  `;

  let potentialMatches = 0;

  for (const bank of unmatchedBank) {
    const debet = Number(bank.debet) || 0;
    const kredit = Number(bank.kredit) || 0;
    const val = debet > 0 ? debet : kredit;
    const isOut = debet > 0;

    const matchingBku = bkuItems.filter(bku => {
      const bkuVal = Number(bku.nilai) || 0;
      if (isOut && bku.tipe === 'MASUK') return false;
      if (!isOut && bku.tipe !== 'MASUK') return false;
      return Math.abs(bkuVal - val) <= 1;
    });

    if (matchingBku.length > 0) {
      console.log(`\nBank: ${bank.deskripsi} (Val: ${val}, Date: ${bank.tanggal})`);
      matchingBku.forEach(bku => {
        const diffDays = isOut 
          ? (new Date(bank.tanggal).getTime() - new Date(bku.tanggal).getTime()) / (1000 * 3600 * 24)
          : Math.abs(new Date(bku.tanggal).getTime() - new Date(bank.tanggal).getTime()) / (1000 * 3600 * 24);
        console.log(`  -> ${bku.tipe}: ${bku.bukti} (Val: ${bku.nilai}, Date: ${bku.tanggal}, Diff: ${diffDays} days)`);
      });
      potentialMatches++;
    }
  }

  console.log(`\nTotal Bank items with potential Potongan/Pajak/Pendapatan match: ${potentialMatches}`);
}

run().finally(() => prisma.$disconnect());
