const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function repair() {
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

  console.log(`Repairing ${sp2ds.length} SP2Ds...`);
  
  for (const s of sp2ds) {
    // Create a dummy potongan record
    await prisma.data_sp2d_potongan.create({
      data: {
        id_sp2d: s.id,
        nomor_sp2d: s.nomor,
        tanggal_pencairan: s.tanggal_pencairan || s.tanggal,
        opd: s.opd,
        jenis_potongan: 'Lainnya',
        uraian: `Potongan Otomatis (Penyesuaian Integritas Data) - ${s.nomor}`,
        nilai: s.nilai_potongan,
        status_rekon: s.status_rekon,
        id_sumber_dana: 'SD-DAU' // Default
      }
    });
    console.log(`  - Created potongan for ${s.nomor} (Rp ${s.nilai_potongan.toLocaleString()})`);
  }
}

repair().finally(() => prisma.$disconnect());
