const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBruto() {
  const sp2ds = await prisma.data_sp2d.findMany({
    where: {
      status_rekon: 'SUDAH_BRUTO'
    }
  });
  console.log(sp2ds.map(s => ({ nomor: s.nomor, tgl: s.tanggal_pencairan, bruto: s.nilai_bruto, neto: s.nilai_neto, pot: s.nilai_potongan })));
}

checkBruto().finally(() => prisma.$disconnect());
