const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const targetValue = 1313884.8;
  console.log(`Mencari nilai: ${targetValue}\n`);

  // 1. Cari di Bank Statement
  const bankMatches = await prisma.bank_statement.findMany({
    where: {
      OR: [
        { debet: { gte: targetValue - 1, lte: targetValue + 1 } },
        { kredit: { gte: targetValue - 1, lte: targetValue + 1 } }
      ]
    }
  });

  console.log("--- Rekening Koran ---");
  bankMatches.forEach(b => {
    console.log(`[BANK] ID: ${b.id} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | Desc: ${b.deskripsi} | D: ${b.debet} | K: ${b.kredit}`);
  });

  // 2. Cari di SP2D
  const sp2dMatches = await prisma.data_sp2d.findMany({
    where: {
      OR: [
        { nilai_neto: { gte: targetValue - 1, lte: targetValue + 1 } },
        { nilai_bruto: { gte: targetValue - 1, lte: targetValue + 1 } }
      ]
    }
  });

  console.log("\n--- BKU (SP2D) ---");
  sp2dMatches.forEach(s => {
    console.log(`[SP2D] No: ${s.nomor} | Neto: ${s.nilai_neto} | Bruto: ${s.nilai_bruto}`);
  });

  // 3. Cari di Potongan
  const potonganMatches = await prisma.data_sp2d_potongan.findMany({
    where: { nilai: { gte: targetValue - 1, lte: targetValue + 1 } }
  });
  console.log("\n--- BKU (Potongan) ---");
  potonganMatches.forEach(p => {
    console.log(`[POT] No SP2D: ${p.nomor_sp2d} | Nilai: ${p.nilai}`);
  });

  // 4. Cari di Pendapatan
  const pendapatanMatches = await prisma.data_pendapatan.findMany({
    where: { nilai: { gte: targetValue - 1, lte: targetValue + 1 } }
  });
  console.log("\n--- BKU (Pendapatan) ---");
  pendapatanMatches.forEach(p => {
    console.log(`[INC] Bukti: ${p.nomor_bukti} | Nilai: ${p.nilai}`);
  });
}

run().finally(() => prisma.$disconnect());
