const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const target = 1313884.8;
  console.log(`Mencari rincian untuk selisih: ${target}\n`);

  // 1. Check SP2D
  const sp2ds = await prisma.data_sp2d.findMany({
    where: {
      OR: [
        { nilai_neto: target },
        { nilai_bruto: target },
        { nilai_potongan: target }
      ]
    }
  });
  console.log("SP2D Matches:", sp2ds.length);
  sp2ds.forEach(s => console.log(`- ${s.nomor} | Ptg: ${s.nilai_potongan}`));

  // 2. Check Potongan
  const pots = await prisma.data_sp2d_potongan.findMany({
    where: { nilai: target }
  });
  console.log("Potongan Matches:", pots.length);
  pots.forEach(p => console.log(`- ${p.nomor_sp2d} | ${p.jenis_potongan} | ${p.nilai}`));

  // 3. Check Bank
  const banks = await prisma.bank_statement.findMany({
    where: {
      OR: [
        { debet: target },
        { kredit: target }
      ]
    }
  });
  console.log("Bank Matches:", banks.length);
  banks.forEach(b => console.log(`- ${b.id} | ${b.deskripsi} | ${b.debet} / ${b.kredit}`));

  // 4. Check if it's a sum of unmatched items on a specific date
  const unmatchedByDate = await prisma.$queryRaw`
    SELECT tanggal, SUM(debet) as total_debet, SUM(kredit) as total_kredit
    FROM bank_statement
    WHERE is_matched = false
    GROUP BY tanggal
    HAVING ABS(SUM(debet) - ${target}) < 1 OR ABS(SUM(kredit) - ${target}) < 1
  `;
  console.log("Unmatched Bank Grouped by Date:", unmatchedByDate);
}

run().finally(() => prisma.$disconnect());
