const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- RINCIAN SELISIH 64.349.500,8 ---");
  const target = 64349500.8;

  // 1. Get all relevant data
  const [unmatchedSP2D, unmatchedBank, unmatchedPot, unmatchedTax, unmatchedPnd] = await Promise.all([
    prisma.data_sp2d.findMany({ where: { status_rekon: 'BELUM' } }),
    prisma.bank_statement.findMany({ where: { is_matched: false } }),
    prisma.data_sp2d_potongan.findMany({ where: { status_rekon: 'BELUM' } }),
    prisma.setoran_pajak.findMany({ where: { status_rekon: 'BELUM' } }),
    prisma.$queryRaw`SELECT * FROM data_pendapatan WHERE status_rekon = 'BELUM'`
  ]);

  console.log(`Unmatched items counts:`);
  console.log(`- SP2D: ${unmatchedSP2D.length}`);
  console.log(`- Bank: ${unmatchedBank.length}`);
  console.log(`- Potongan: ${unmatchedPot.length}`);
  console.log(`- Pajak: ${unmatchedTax.length}`);
  console.log(`- Pendapatan: ${unmatchedPnd.length}`);

  // Calculate totals
  const totalSP2D = unmatchedSP2D.reduce((acc, x) => acc + Number(x.nilai_neto), 0);
  const totalPot = unmatchedPot.reduce((acc, x) => acc + Number(x.nilai), 0);
  const totalTax = unmatchedTax.reduce((acc, x) => acc + Number(x.nilai), 0);
  const totalPnd = unmatchedPnd.reduce((acc, x) => acc + Number(x.nilai), 0);
  
  const totalBKU = totalSP2D + totalPot + totalTax + totalPnd;
  const totalBankDebet = unmatchedBank.reduce((acc, x) => acc + Number(x.debet), 0);
  const totalBankKredit = unmatchedBank.reduce((acc, x) => acc + Number(x.kredit), 0);

  console.log(`\nTotals:`);
  console.log(`- Total BKU (Belum Rekon): ${totalBKU}`);
  console.log(`- Total Bank Debet (Unmatched): ${totalBankDebet}`);
  console.log(`- Total Bank Kredit (Unmatched): ${totalBankKredit}`);
  console.log(`- Net (BKU - Bank): ${totalBKU - totalBankDebet + totalBankKredit}`);

  // Check if target matches total BKU or total Bank Debet or their diff
  if (Math.abs(totalBKU - target) < 1) console.log("!!! Target matches total unmatched BKU");
  if (Math.abs(totalBankDebet - target) < 1) console.log("!!! Target matches total unmatched Bank Debet");
  if (Math.abs((totalBKU - totalBankDebet) - target) < 1) console.log("!!! Target matches (BKU - Bank Debet)");

  // List all items to see if target is one of them
  const allItems = [
    ...unmatchedSP2D.map(x => ({ type: 'SP2D', ref: x.nomor, val: Number(x.nilai_neto) })),
    ...unmatchedPot.map(x => ({ type: 'POTONGAN', ref: x.nomor_sp2d, val: Number(x.nilai) })),
    ...unmatchedTax.map(x => ({ type: 'PAJAK', ref: x.nomor_bukti, val: Number(x.nilai) })),
    ...unmatchedPnd.map(x => ({ type: 'PENDAPATAN', ref: x.nomor_bukti, val: Number(x.nilai) })),
    ...unmatchedBank.map(x => ({ type: 'BANK DEBET', ref: x.deskripsi, val: Number(x.debet) })),
    ...unmatchedBank.map(x => ({ type: 'BANK KREDIT', ref: x.deskripsi, val: Number(x.kredit) }))
  ].filter(x => x.val > 0);

  allItems.forEach(item => {
    if (Math.abs(item.val - target) < 1) {
      console.log(`!!! MATCH FOUND: ${item.type} | ${item.ref} | ${item.val}`);
    }
  });

  // If no match, check pairs
  if (allItems.length < 50) {
      for (let i = 0; i < allItems.length; i++) {
          for (let j = i + 1; j < allItems.length; j++) {
              const sum = allItems[i].val + allItems[j].val;
              if (Math.abs(sum - target) < 1) {
                  console.log(`!!! PAIR MATCH FOUND: ${allItems[i].type} (${allItems[i].val}) + ${allItems[j].type} (${allItems[j].val}) = ${sum}`);
              }
          }
      }
  }
}

run().finally(() => prisma.$disconnect());
