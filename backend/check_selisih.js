const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const sp2ds = await prisma.data_sp2d.findMany({
    where: { selisih_rekon: { not: null, not: '0', not: '0.00' }, status_rekon: { startsWith: 'SUDAH' } },
    select: { selisih_rekon: true, keterangan_rekon: true }
  });
  console.log('SP2D With Discrepancy:', sp2ds.length);
  if(sp2ds.length > 0) console.log(sp2ds[0]);

  const bankMatches = await prisma.bank_statement.findMany({
    where: { 
       is_matched: true,
       keterangan: { contains: 'LEBIH' }
    }
  });
  console.log('Bank with LEBIH:', bankMatches.length);
}
main().catch(console.error).finally(() => prisma.$disconnect());
