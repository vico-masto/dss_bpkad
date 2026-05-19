const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const targetValue = 3117072983;
  console.log(`Mencari nilai: ${targetValue.toLocaleString('id-ID')}\n`);

  // 1. Cari di Bank Statement
  const bankMatches = await prisma.bank_statement.findMany({
    where: {
      OR: [
        { debet: targetValue },
        { kredit: targetValue }
      ]
    }
  });

  console.log("--- Rekening Koran ---");
  if (bankMatches.length > 0) {
    bankMatches.forEach(b => {
      console.log(`[BANK] ID: ${b.id} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | Desc: ${b.deskripsi} | D: ${b.debet} | K: ${b.kredit}`);
    });
  } else {
    console.log("Tidak ditemukan kecocokan tepat di Rekening Koran.");
  }

  // 2. Cari di SP2D
  const sp2dMatches = await prisma.data_sp2d.findMany({
    where: {
      OR: [
        { nilai_neto: targetValue },
        { nilai_bruto: targetValue }
      ]
    }
  });

  console.log("\n--- BKU (SP2D) ---");
  if (sp2dMatches.length > 0) {
    sp2dMatches.forEach(s => {
      console.log(`[SP2D] No: ${s.nomor} | Tgl: ${s.tanggal.toISOString().split('T')[0]} | Uraian: ${s.uraian} | Neto: ${s.nilai_neto} | Bruto: ${s.nilai_bruto}`);
    });
  } else {
    console.log("Tidak ditemukan kecocokan tepat di data SP2D.");
  }

  // 3. Cari di Potongan
  const potonganMatches = await prisma.data_sp2d_potongan.findMany({
    where: { nilai: targetValue }
  });
  console.log("\n--- BKU (Potongan) ---");
  if (potonganMatches.length > 0) {
    potonganMatches.forEach(p => {
      console.log(`[POT] No SP2D: ${p.nomor_sp2d} | Tgl: ${p.tanggal_pencairan} | Jenis: ${p.jenis_potongan} | Nilai: ${p.nilai}`);
    });
  } else {
    console.log("Tidak ditemukan kecocokan tepat di data Potongan.");
  }

  // 4. Cari di Pendapatan
  const pendapatanMatches = await prisma.data_pendapatan.findMany({
    where: { nilai: targetValue }
  });
  console.log("\n--- BKU (Pendapatan) ---");
  if (pendapatanMatches.length > 0) {
    pendapatanMatches.forEach(p => {
      console.log(`[INC] Bukti: ${p.nomor_bukti} | Tgl: ${p.tanggal} | Uraian: ${p.uraian} | Nilai: ${p.nilai}`);
    });
  } else {
    console.log("Tidak ditemukan kecocokan tepat di data Pendapatan.");
  }
}

run().finally(() => prisma.$disconnect());
