const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deepAudit() {
  console.log('--- DEEP INTEGRITY AUDIT ---');
  
  try {
    // 1. Check all BKU sources for "SUDAH" status without a corresponding bank reference
    const sources = [
      { table: 'data_sp2d', name: 'SP2D' },
      { table: 'data_pendapatan', name: 'Pendapatan' },
      { table: 'data_sp2d_potongan', name: 'Potongan' },
      { table: 'setoran_pajak', name: 'Setoran Pajak' }
    ];

    for (const source of sources) {
      const matchedItems = await prisma[source.table].findMany({
        where: { status_rekon: { startsWith: 'SUDAH' } },
        select: { id: true }
      });

      let orphans = 0;
      for (const item of matchedItems) {
        const isReferenced = await prisma.bank_statement.count({
          where: { ref_bku_id: { contains: String(item.id) } }
        });
        if (isReferenced === 0) orphans++;
      }
      console.log(`[${source.name}] Matched items without bank ref: ${orphans}`);
    }

    // 2. Check for bank items pointing to non-existent BKU IDs
    const bankMatched = await prisma.bank_statement.findMany({
      where: { is_matched: true, NOT: { ref_bku_id: null } },
      select: { id: true, ref_bku_id: true, deskripsi: true }
    });

    let brokenLinks = 0;
    for (const bank of bankMatched) {
      const ids = bank.ref_bku_id.split(',').map(id => id.trim());
      let found = false;
      for (const id of ids) {
        // Search across all possible tables
        const checkSp2d = await prisma.data_sp2d.count({ where: { id: parseInt(id) || -1 } });
        const checkInc = await prisma.data_pendapatan.count({ where: { id: parseInt(id) || -1 } });
        const checkPot = await prisma.data_sp2d_potongan.count({ where: { id: parseInt(id) || -1 } });
        const checkTax = await prisma.setoran_pajak.count({ where: { id: parseInt(id) || -1 } });
        
        if (checkSp2d || checkInc || checkPot || checkTax) {
          found = true;
          break;
        }
      }
      if (!found) {
        brokenLinks++;
        console.log(`   - Broken Link: Bank ID ${bank.id} (${bank.deskripsi}) points to non-existent BKU: ${bank.ref_bku_id}`);
      }
    }
    console.log(`[BANK] Items with broken BKU links: ${brokenLinks}`);

    console.log('--- DEEP AUDIT COMPLETE ---');
  } catch (err) {
    console.error('Audit Error:', err);
  } finally {
    await prisma.$disconnect();
  }
}

deepAudit();
