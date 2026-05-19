const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // Find all bank statements that are matched and have a ref_bku_id
  const matchedBanks = await prisma.bank_statement.findMany({
    where: { is_matched: true, ref_bku_id: { not: null } }
  });

  const matchedBkuIds = Array.from(new Set(matchedBanks.map(b => b.ref_bku_id)));

  // Update SP2Ds that are BELUM but should be SUDAH
  const toSudah = await prisma.data_sp2d.findMany({
    where: { 
      id: { in: matchedBkuIds },
      status_rekon: 'BELUM'
    }
  });

  if (toSudah.length > 0) {
    console.log(`Fixing ${toSudah.length} SP2Ds from BELUM to SUDAH...`);
    const resSudah = await prisma.data_sp2d.updateMany({
      where: { id: { in: toSudah.map(s => s.id) } },
      data: { status_rekon: 'SUDAH' }
    });
    console.log(`Fixed ${resSudah.count} SP2Ds.`);
  } else {
    console.log("No SP2Ds need to be changed to SUDAH.");
  }
}

run().finally(() => prisma.$disconnect());
