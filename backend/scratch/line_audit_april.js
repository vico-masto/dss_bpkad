const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function lineAudit() {
  const start = new Date('2026-04-01');
  const end = new Date('2026-04-30T23:59:59.999Z');

  const bankMatched = await prisma.bank_statement.findMany({
    where: {
      tanggal: { gte: start, lte: end },
      is_matched: true,
      debet: { gt: 0 }
    }
  });

  console.log(`Auditing ${bankMatched.length} matched bank records in April...`);
  
  let bkuSum = 0;
  for (const b of bankMatched) {
    // Find the BKU item
    const sp2d = await prisma.data_sp2d.findFirst({ where: { id: b.ref_bku_id } });
    if (sp2d) {
      const tgl = sp2d.tanggal_pencairan || sp2d.tanggal;
      if (tgl < start || tgl > end) {
        console.log(`[SHIFT!] Bank ID ${b.id} (${b.tanggal.toISOString().split('T')[0]}) matched to BKU ${sp2d.nomor} dated ${tgl.toISOString().split('T')[0]} | Value: ${b.debet}`);
      }
    }
  }
}

lineAudit().finally(() => prisma.$disconnect());
