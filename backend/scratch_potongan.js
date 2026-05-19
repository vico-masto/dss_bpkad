const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function auditPotongan() {
  console.log('--- AUDIT: SEARCHING BANK FOR UNMATCHED POTONGAN ---');
  
  const pots = await prisma.data_sp2d_potongan.findMany({
    where: { status_rekon: 'BELUM' },
    take: 20
  });

  for (const p of pots) {
    const val = Number(p.nilai);
    console.log(`\nPotongan ${p.uraian} [${p.nomor_sp2d}]: Val=${val}, Tgl=${p.tanggal_pencairan?.toISOString().split('T')[0] || 'N/A'}`);

    const matches = await prisma.bank_statement.findMany({
      where: {
        OR: [
          { debet: val },
          { kredit: val }
        ]
      }
    });

    if (matches.length > 0) {
      console.log(`  MATCH FOUND in Bank:`);
      matches.forEach(m => {
        console.log(`    - Bank ID ${m.id} [${m.tanggal.toISOString().split('T')[0]}] Val=${Number(m.debet)||Number(m.kredit)} Matched=${m.is_matched}`);
      });
    } else {
      console.log(`  NO MATCH found in Bank.`);
    }
  }

  process.exit(0);
}

auditPotongan();
