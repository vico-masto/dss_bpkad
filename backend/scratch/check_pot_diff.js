const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkPotDiff() {
  const res = await prisma.$queryRaw`
    SELECT h.nomor, h.nilai_potongan as col_pot, 
           (SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id) as sum_pot
    FROM data_sp2d h
    WHERE h.nilai_potongan > 0
  `;
  
  let totalDiff = 0;
  res.forEach(r => {
    const diff = Number(r.col_pot) - Number(r.sum_pot || 0);
    if (Math.abs(diff) > 0.1) {
      console.log(`${r.nomor} | Col: ${r.col_pot} | Sum: ${r.sum_pot} | Diff: ${diff}`);
      totalDiff += diff;
    }
  });
  console.log('TOTAL POT DISCREPANCY:', totalDiff);
}

checkPotDiff().finally(() => prisma.$disconnect());
