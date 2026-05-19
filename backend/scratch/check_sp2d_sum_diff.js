const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkSum() {
  const res = await prisma.$queryRaw`
    SELECT SUM(h.nilai_neto) as sum_col,
           SUM((SELECT SUM(d.nilai_bruto - (h.nilai_potongan * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) FROM detail_sp2d d WHERE d.id_sp2d = h.id)) as sum_calc
    FROM data_sp2d h
  `;
  console.log(res[0]);
  console.log('Diff:', Number(res[0].sum_col) - Number(res[0].sum_calc));
}

checkSum().finally(() => prisma.$disconnect());
