const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getDetails() {
  const targetNumbers = [
    '81.07/04.0/000025/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000020/LS/1.03.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000026/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000023/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000024/LS/2.11.0.00.0.00.01.0000/M/4/2026'
  ];

  const sp2ds = await prisma.data_sp2d.findMany({
    where: { nomor: { in: targetNumbers } }
  });

  console.log(JSON.stringify(sp2ds.map(s => ({
    nomor: s.nomor,
    opd: s.opd,
    uraian: s.uraian,
    bruto: s.nilai_bruto,
    neto: s.nilai_neto,
    potongan: s.nilai_potongan
  })), null, 2));
}

getDetails().finally(() => prisma.$disconnect());
