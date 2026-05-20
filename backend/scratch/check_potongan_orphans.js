const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("=== Auditing Mismatched/Orphan Potongan Details for the 5 SP2Ds ===");
  
  const targetNumbers = [
    '81.07/04.0/000026/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000023/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000025/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000020/LS/1.03.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000024/LS/2.11.0.00.0.00.01.0000/M/4/2026'
  ];

  for (const nomor of targetNumbers) {
    console.log(`\nChecking SP2D: ${nomor}`);
    
    // Check if SP2D exists in header
    const sp2d = await prisma.data_sp2d.findUnique({
      where: { nomor }
    });
    
    if (!sp2d) {
      console.log(`  -> Header SP2D does not exist!`);
      continue;
    }
    
    console.log(`  -> Header ID: ${sp2d.id} | Bruto: ${Number(sp2d.nilai_bruto)} | Potongan: ${Number(sp2d.nilai_potongan)} | Neto: ${Number(sp2d.nilai_neto)}`);
    
    // Check details in detail_sp2d
    const details = await prisma.detail_sp2d.findMany({
      where: { id_sp2d: sp2d.id }
    });
    console.log(`  -> Number of detail_sp2d rows: ${details.length}`);
    for (const d of details) {
      console.log(`     - Detail ID: ${d.id} | Sumber Dana: ${d.id_sumber_dana} | Bruto: ${Number(d.nilai_bruto)} | Neto: ${Number(d.nilai_neto)}`);
    }

    // Check if there are any data_sp2d_potongan linked by id_sp2d
    const potById = await prisma.data_sp2d_potongan.findMany({
      where: { id_sp2d: sp2d.id }
    });
    console.log(`  -> Linked potongan (by id_sp2d): ${potById.length}`);

    // Check if there are any data_sp2d_potongan linked by nomor_sp2d (string match)
    const potByNomor = await prisma.$queryRaw`
      SELECT id, id_sp2d, nomor_sp2d, jenis_potongan, nilai
      FROM data_sp2d_potongan
      WHERE TRIM(nomor_sp2d) = TRIM(${nomor})
    `;
    console.log(`  -> Potongan matched by nomor_sp2d text: ${potByNomor.length}`);
    for (const p of potByNomor) {
      console.log(`     - Potongan ID: ${p.id} | Linked id_sp2d: ${p.id_sp2d} | Jenis: ${p.jenis_potongan} | Nilai: ${Number(p.nilai)}`);
    }
  }

  await prisma.$disconnect();
}

run().catch(console.error);
