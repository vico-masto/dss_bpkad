const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkIntegrity() {
  const sp2ds = await prisma.$queryRaw`
    SELECT 
      h.nomor, 
      h.nilai_neto as neto_col,
      h.nilai_bruto as bruto_col,
      h.nilai_potongan as pot_col,
      (SELECT SUM(d.nilai_bruto) FROM detail_sp2d d WHERE d.id_sp2d = h.id) as sum_bruto_detail,
      (SELECT SUM(d.nilai_bruto - (h.nilai_potongan * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) FROM detail_sp2d d WHERE d.id_sp2d = h.id) as calc_neto
    FROM data_sp2d h
    LIMIT 100
  `;

  console.log('Discrepancies found:');
  sp2ds.forEach(s => {
    const diff = Number(s.neto_col) - Number(s.calc_neto);
    if (Math.abs(diff) > 0.1) {
      console.log(`- ${s.nomor} | Neto Col: ${s.neto_col} | Calc: ${s.calc_neto} | Diff: ${diff}`);
    }
  });
}

checkIntegrity().finally(() => prisma.$disconnect());
