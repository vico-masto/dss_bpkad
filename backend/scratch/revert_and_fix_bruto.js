const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function revertAndFix() {
  const targetNumbers = [
    '81.07/04.0/000025/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000020/LS/1.03.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000026/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000023/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000024/LS/2.11.0.00.0.00.01.0000/M/4/2026'
  ];

  console.log('--- REVERTING DUMMY POTONGAN ---');
  const deleted = await prisma.data_sp2d_potongan.deleteMany({
    where: {
      uraian: { contains: 'Potongan Otomatis (Penyesuaian Integritas Data)' }
    }
  });
  console.log(`Deleted ${deleted.count} dummy records.`);

  console.log('--- UPDATING SP2D STATUS TO SUDAH_BRUTO ---');
  const updated = await prisma.data_sp2d.updateMany({
    where: { nomor: { in: targetNumbers } },
    data: { status_rekon: 'SUDAH_BRUTO' }
  });
  console.log(`Updated ${updated.count} SP2Ds to SUDAH_BRUTO.`);
}

revertAndFix().finally(() => prisma.$disconnect());
