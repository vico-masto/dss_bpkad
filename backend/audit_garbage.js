const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditGarbage() {
  console.log('--- STARTING POST-RESET AUDIT ---');
  
  try {
    // 1. Check for Bank Items marked as matched but without ref_bku_id
    const orphanedBank = await prisma.bank_statement.findMany({
      where: {
        is_matched: true,
        OR: [
          { ref_bku_id: null },
          { ref_bku_id: '' }
        ]
      }
    });
    console.log(`[BANK] Orphaned matched items (matched=true but no ref): ${orphanedBank.length}`);

    // 2. Check for BKU items marked as matched but not referenced in any bank item
    // We'll check SP2D as a sample, but we should check all
    const matchedSp2d = await prisma.data_sp2d.findMany({
      where: { status_rekon: { startsWith: 'SUDAH' } },
      select: { id: true, nomor: true }
    });

    let orphanedSp2d = 0;
    for (const sp2d of matchedSp2d) {
      const isReferenced = await prisma.bank_statement.count({
        where: {
          ref_bku_id: { contains: String(sp2d.id) }
        }
      });
      if (isReferenced === 0) {
        orphanedSp2d++;
        // console.log(`   - Orphaned SP2D found: ${sp2d.nomor} (ID: ${sp2d.id})`);
      }
    }
    console.log(`[BKU] Matched SP2D items with no bank reference: ${orphanedSp2d}`);

    // 3. Check for duplicates in bank_statement (Same date, amount, description)
    const duplicates = await prisma.$queryRaw`
      SELECT tanggal, debet, kredit, deskripsi, COUNT(*) 
      FROM bank_statement 
      GROUP BY tanggal, debet, kredit, deskripsi 
      HAVING COUNT(*) > 1
    `;
    console.log(`[BANK] Potential duplicate groups found: ${duplicates.length}`);

    // 4. Check for ref_bku_id pointing to non-existent BKU items
    // (This is more complex because ref_bku_id can be a comma-separated string)

    console.log('--- AUDIT COMPLETE ---');
  } catch (err) {
    console.error('Audit Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

auditGarbage();
