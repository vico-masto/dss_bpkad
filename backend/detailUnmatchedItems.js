const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- RINCIAN ITEM BELUM REKON (UNMATCHED) ---");

  // 1. Bank Debet (Expenses in Bank not in BKU)
  const bankDebet = await prisma.bank_statement.findMany({
    where: { is_matched: false, debet: { gt: 0 } }
  });
  
  // 2. Bank Kredit (Income in Bank not in BKU)
  const bankKredit = await prisma.bank_statement.findMany({
    where: { is_matched: false, kredit: { gt: 0 } }
  });

  // 3. SP2D Belum Cocok
  const sp2d = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'BELUM' }
  });

  // 4. Pendapatan Belum Cocok
  const inc = await prisma.$queryRaw`
    SELECT p.* FROM data_pendapatan p
    LEFT JOIN bank_statement b ON p.id = b.ref_bku_id
    WHERE b.id IS NULL
  `;

  console.log(`\n1. Transaksi Bank (Pengeluaran/Debet) Belum Cocok: ${bankDebet.length} item`);
  bankDebet.forEach(b => console.log(`   - ID: ${b.id} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | Nilai: ${b.debet} | Desc: ${b.deskripsi}`));

  console.log(`\n2. Transaksi Bank (Penerimaan/Kredit) Belum Cocok: ${bankKredit.length} item`);
  bankKredit.forEach(b => console.log(`   - ID: ${b.id} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | Nilai: ${b.kredit} | Desc: ${b.deskripsi}`));

  console.log(`\n3. SP2D Belum Cocok: ${sp2d.length} item`);
  sp2d.forEach(s => console.log(`   - No: ${s.nomor} | Nilai: ${s.nilai_neto} | Uraian: ${s.uraian}`));

  console.log(`\n4. Pendapatan Belum Cocok: ${inc.length} item`);
  inc.forEach(p => console.log(`   - Bukti: ${p.nomor_bukti} | Nilai: ${p.nilai} | Uraian: ${p.uraian}`));
}

run().finally(() => prisma.$disconnect());
