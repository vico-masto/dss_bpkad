const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const target = 64349500.8;
  console.log(`--- MENCARI RINCIAN UNTUK NILAI: ${target} ---`);

  // Search all relevant tables for this exact value
  
  // 1. data_sp2d
  const sp2d = await prisma.data_sp2d.findMany({
    where: { 
      OR: [
        { nilai_neto: target },
        { nilai_bruto: target },
        { selisih_rekon: target }
      ]
    }
  });

  // 2. data_pendapatan
  const pnd = await prisma.data_pendapatan.findMany({
    where: { nilai: target }
  });

  // 3. bank_statement
  const bank = await prisma.bank_statement.findMany({
    where: {
      OR: [
        { debet: target },
        { kredit: target }
      ]
    }
  });

  // 4. data_sp2d_potongan
  const pot = await prisma.data_sp2d_potongan.findMany({
    where: { nilai: target }
  });

  console.log(`Ditemukan di SP2D: ${sp2d.length}`);
  sp2d.forEach(s => console.log(`   - SP2D No: ${s.nomor} | Status: ${s.status_rekon} | Neto: ${s.nilai_neto} | Bruto: ${s.nilai_bruto} | Selisih: ${s.selisih_rekon}`));

  console.log(`Ditemukan di Pendapatan: ${pnd.length}`);
  pnd.forEach(p => console.log(`   - Pendapatan No: ${p.nomor_bukti} | Nilai: ${p.nilai}`));

  console.log(`Ditemukan di Bank: ${bank.length}`);
  bank.forEach(b => console.log(`   - Bank ID: ${b.id} | Desc: ${b.deskripsi} | Debet: ${b.debet} | Kredit: ${b.kredit}`));

  console.log(`Ditemukan di Potongan: ${pot.length}`);
  pot.forEach(p => console.log(`   - Potongan ID: ${p.id} | No Bukti: ${p.nomor_bukti} | Nilai: ${p.nilai}`));

  // Check if it's a sum of unmatched items
  if (sp2d.length === 0 && pnd.length === 0 && bank.length === 0 && pot.length === 0) {
    console.log("\nNilai eksak tidak ditemukan. Mengecek apakah ini adalah total dari beberapa item...");
    
    // Check unmatched SP2D sum
    const sp2dSum = await prisma.data_sp2d.aggregate({
      where: { status_rekon: 'BELUM' },
      _sum: { nilai_neto: true }
    });
    console.log(`Total SP2D Belum Rekon: ${sp2dSum._sum.nilai_neto}`);

    // Check bank unmatched sum
    const bankSum = await prisma.bank_statement.aggregate({
      where: { is_matched: false },
      _sum: { debet: true }
    });
    console.log(`Total Bank Debet Belum Cocok: ${bankSum._sum.debet}`);
  }
}

run().finally(() => prisma.$disconnect());
