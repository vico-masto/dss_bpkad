const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reverseAudit() {
  console.log('--- REVERSE AUDIT: SEARCHING BANK FOR 15 SP2DS ---');
  
  const sp2ds = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'BELUM' }
  });

  for (const sp2d of sp2ds) {
    const bruto = Number(sp2d.nilai_bruto);
    
    // Calculate current neto (Bruto - Sum of current deductions)
    const potSum = await prisma.data_sp2d_potongan.aggregate({
      where: { id_sp2d: sp2d.id },
      _sum: { nilai: true }
    });
    const neto = bruto - Number(potSum._sum.nilai || 0);

    console.log(`\nSP2D ${sp2d.nomor}: Bruto=${bruto}, Neto=${neto}, Tgl=${sp2d.tanggal.toISOString().split('T')[0]}`);

    // Search in Bank for either Bruto or Neto
    const matches = await prisma.bank_statement.findMany({
      where: {
        OR: [
          { debet: bruto },
          { kredit: bruto },
          { debet: neto },
          { kredit: neto }
        ]
      }
    });

    if (matches.length > 0) {
      console.log(`  MATCH FOUND in Bank:`);
      matches.forEach(m => {
        console.log(`    - Bank ID ${m.id} [${m.tanggal.toISOString().split('T')[0]}] Val=${Number(m.debet)||Number(m.kredit)} Matched=${m.is_matched} Ref=${m.ref_bku_id}`);
      });
    } else {
      console.log(`  NO MATCH found in Bank for this value.`);
    }
  }

  process.exit(0);
}

reverseAudit();
