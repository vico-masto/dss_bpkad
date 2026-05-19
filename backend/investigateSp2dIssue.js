const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const sp2dNo = '81.07/04.0/000002/LS/2.15.0.00.0.00.01.0000/M/3/2026';
  const sp2d = await prisma.data_sp2d.findUnique({
    where: { nomor: sp2dNo }
  });

  if (!sp2d) {
    console.log("SP2D tidak ditemukan:", sp2dNo);
    return;
  }

  console.log("Data SP2D ditemukan:");
  console.log(`- Nomor: ${sp2d.nomor}`);
  console.log(`- Nilai Neto: ${sp2d.nilai_neto}`);
  console.log(`- Nilai Bruto: ${sp2d.nilai_bruto}`);
  console.log(`- Tanggal: ${sp2d.tanggal}`);

  const valNeto = Number(sp2d.nilai_neto);
  const valBruto = Number(sp2d.nilai_bruto);

  // Cari di bank_statement yang nilainya mirip (± 5 rupiah)
  const similarBanks = await prisma.bank_statement.findMany({
    where: {
      OR: [
        { debet: { gte: valNeto - 5, lte: valNeto + 5 } },
        { debet: { gte: valBruto - 5, lte: valBruto + 5 } }
      ]
    }
  });

  console.log("\nKandidat Rekening Koran yang mirip:");
  similarBanks.forEach(b => {
    console.log(`- ID: ${b.id} | Deskripsi: ${b.deskripsi} | Debet: ${b.debet} | Tanggal: ${b.tanggal} | is_matched: ${b.is_matched}`);
  });
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
