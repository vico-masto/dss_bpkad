const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixMissingPencairan() {
  console.log('--- REPAIRING MISSING TANGGAL_PENCAIRAN FOR MATCHED SP2Ds ---');

  // Find all SP2Ds that are matched but have null tanggal_pencairan
  const sp2ds = await prisma.data_sp2d.findMany({
    where: {
      status_rekon: { in: ['SUDAH', 'SUDAH_BRUTO', 'ANOMALI', '!!! HIGH ANOMALI'] },
      tanggal_pencairan: null
    }
  });

  console.log(`Found ${sp2ds.length} matched SP2Ds with NULL tanggal_pencairan.`);

  let fixCount = 0;
  for (const s of sp2ds) {
    // Find the linked bank record
    const bank = await prisma.bank_statement.findFirst({
      where: { ref_bku_id: s.id }
    });

    if (bank) {
      await prisma.data_sp2d.update({
        where: { id: s.id },
        data: { tanggal_pencairan: bank.tanggal }
      });
      console.log(`  - Fixed ${s.nomor} using bank date ${bank.tanggal.toISOString().split('T')[0]}`);
      fixCount++;
    } else {
      console.log(`  - WARN: No bank record found for ${s.nomor} despite being matched.`);
    }
  }

  console.log(`\nTOTAL FIXED: ${fixCount}`);
}

fixMissingPencairan().finally(() => prisma.$disconnect());
