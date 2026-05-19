const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // Find all SP2D marked as 'SUDAH'
  const sp2dSudah = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'SUDAH' },
    select: { id: true, nomor: true }
  });

  // Get all matched ref_bku_id from bank statements
  const matchedBanks = await prisma.bank_statement.findMany({
    where: { is_matched: true, ref_bku_id: { not: null } },
    select: { ref_bku_id: true }
  });

  const matchedBankBkuIds = new Set(matchedBanks.map(b => b.ref_bku_id));

  const orphanSp2dIds = sp2dSudah
    .filter(sp2d => !matchedBankBkuIds.has(sp2d.id))
    .map(sp2d => sp2d.id);

  console.log(`Found ${orphanSp2dIds.length} orphaned SP2Ds with 'SUDAH' status but no bank statement pointing to them.`);

  if (orphanSp2dIds.length > 0) {
    const result = await prisma.data_sp2d.updateMany({
      where: { id: { in: orphanSp2dIds } },
      data: { status_rekon: 'BELUM' }
    });
    console.log(`Successfully reverted ${result.count} SP2Ds back to 'BELUM'.`);
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
