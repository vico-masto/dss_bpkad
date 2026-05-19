const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runCheckLinks() {
  console.log("=== CHECKING MATCHED LINKS FOR UNMATCHED SP2Ds ===");

  const allUnmatched = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'BELUM' },
    select: { id: true, nomor: true, tanggal: true, tanggal_pencairan: true, nilai_bruto: true }
  });

  console.log(`Total unmatched SP2Ds (status_rekon = 'BELUM'): ${allUnmatched.length}\n`);

  for (const sp of allUnmatched) {
    const tgl = sp.tanggal_pencairan || sp.tanggal;
    const tglDate = new Date(tgl);
    const startWindow = new Date(tglDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const endWindow = new Date(tglDate.getTime() + 7 * 24 * 60 * 60 * 1000);

    const potRes = await prisma.data_sp2d_potongan.aggregate({
      where: { id_sp2d: sp.id },
      _sum: { nilai: true }
    });
    const pot = Number(potRes._sum.nilai || 0);
    const neto = Number(sp.nilai_bruto) - pot;

    // Find any bank statement in the window matching the neto value (regardless of is_matched)
    const matchingBanks = await prisma.bank_statement.findMany({
      where: {
        debet: { gt: 0 },
        tanggal: { gte: startWindow, lte: endWindow }
      }
    });

    const matches = matchingBanks.filter(b => Math.abs(Number(b.debet) - neto) < 1);

    if (matches.length > 0) {
      console.log(`SP2D ${sp.nomor} | Neto: Rp ${neto.toLocaleString('id-ID')} | Bruto: Rp ${Number(sp.nilai_bruto).toLocaleString('id-ID')} | Tgl: ${tgl.toISOString().split('T')[0]}`);
      for (const b of matches) {
        console.log(`  -> Bank Statement ID ${b.id} | Debet: Rp ${Number(b.debet).toLocaleString('id-ID')} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | is_matched: ${b.is_matched} | ref_bku_id: ${b.ref_bku_id} | match_type: ${b.match_type}`);
        
        // Find what the bank statement is linked to
        if (b.ref_bku_id) {
          const linkedSp2d = await prisma.data_sp2d.findUnique({ where: { id: b.ref_bku_id } });
          if (linkedSp2d) {
            console.log(`     Linked SP2D: ID=${linkedSp2d.id} | Nomor=${linkedSp2d.nomor} | status_rekon=${linkedSp2d.status_rekon} | nilai_bruto=${Number(linkedSp2d.nilai_bruto).toLocaleString('id-ID')}`);
          } else {
            const linkedPotongan = await prisma.data_sp2d_potongan.findUnique({ where: { id: b.ref_bku_id } });
            if (linkedPotongan) {
              console.log(`     Linked Potongan: ID=${linkedPotongan.id} | Nomor SP2D=${linkedPotongan.nomor_sp2d} | status_rekon=${linkedPotongan.status_rekon} | nilai=${Number(linkedPotongan.nilai).toLocaleString('id-ID')}`);
            } else {
              console.log(`     Linked to BKU in other tables (Pendapatan/Pajak)`);
            }
          }
        }
      }
      console.log();
    }
  }

  await prisma.$disconnect();
}

runCheckLinks();
