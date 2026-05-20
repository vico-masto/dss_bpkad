const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("=== Investigating Linked Bank Statements for the 5 SP2Ds ===");
  
  const targetNumbers = [
    '81.07/04.0/000026/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000023/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000025/LS/2.11.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000020/LS/1.03.0.00.0.00.01.0000/M/4/2026',
    '81.07/04.0/000024/LS/2.11.0.00.0.00.01.0000/M/4/2026'
  ];

  for (const nomor of targetNumbers) {
    console.log(`\nSP2D: ${nomor}`);
    
    const sp2d = await prisma.data_sp2d.findUnique({
      where: { nomor }
    });
    
    if (!sp2d) {
      console.log(`  -> Not found`);
      continue;
    }
    
    console.log(`  -> SP2D ID: ${sp2d.id} | Status Rekon: ${sp2d.status_rekon} | Bruto: ${Number(sp2d.nilai_bruto)} | Potongan Header: ${Number(sp2d.nilai_potongan)} | Neto: ${Number(sp2d.nilai_neto)}`);
    
    // Check linked bank statements by ref_bku_id
    const linkedBanks = await prisma.bank_statement.findMany({
      where: { ref_bku_id: sp2d.id }
    });
    
    console.log(`  -> Linked Bank Statements: ${linkedBanks.length}`);
    for (const b of linkedBanks) {
      console.log(`     - Bank ID: ${b.id} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | Debet: ${Number(b.debet)} | Kredit: ${Number(b.kredit)} | Is Matched: ${b.is_matched} | Match Type: ${b.match_type} | Selisih Nilai: ${Number(b.selisih_nilai)}`);
    }
  }

  await prisma.$disconnect();
}

run().catch(console.error);
