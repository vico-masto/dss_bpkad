const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findDiscrepancy() {
  const targetDate = new Date('2026-03-31T23:59:59.999Z');
  
  console.log(`--- ANALYZING 86M DISCREPANCY AS OF ${targetDate.toISOString()} ---`);

  // Calculate BKU Balance using the NEW logic (COALESCE(tanggal_pencairan, tanggal))
  const [sa, inc, expRaw, taxPot, adjIn, adjOut] = await Promise.all([
    prisma.saldo_awal.aggregate({ _sum: { nilai: true } }),
    prisma.data_pendapatan.aggregate({ where: { tanggal: { lte: targetDate } }, _sum: { nilai: true } }),
    prisma.$queryRaw`
      SELECT SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS NUMERIC)) as total 
      FROM data_sp2d 
      WHERE COALESCE(tanggal_pencairan, tanggal) <= ${targetDate}`,
    prisma.data_sp2d_potongan.aggregate({ where: { tanggal_pencairan: { lte: targetDate } }, _sum: { nilai: true } }),
    prisma.data_penyesuaian.aggregate({ where: { jenis: 'MASUK', tanggal: { lte: targetDate } }, _sum: { nilai: true } }),
    prisma.data_penyesuaian.aggregate({ where: { jenis: 'KELUAR', tanggal: { lte: targetDate } }, _sum: { nilai: true } })
  ]);

  const bkuBalance = Number(sa._sum.nilai || 0) + 
                     Number(inc._sum.nilai || 0) - 
                     Number(expRaw[0].total || 0) - 
                     Number(taxPot._sum.nilai || 0) + 
                     Number(adjIn._sum.nilai || 0) - 
                     Number(adjOut._sum.nilai || 0);

  // Bank Balance (Dynamic)
  const bankMutations = await prisma.bank_statement.aggregate({
    where: { tanggal: { lte: targetDate } },
    _sum: { debet: true, kredit: true }
  });
  const bankBalance = Number(bankMutations._sum.kredit || 0) - Number(bankMutations._sum.debet || 0);

  console.log(`Saldo BKU (Logic: Pencairan): Rp ${bkuBalance.toLocaleString('id-ID')}`);
  console.log(`Saldo Bank (Dynamic):        Rp ${bankBalance.toLocaleString('id-ID')}`);
  console.log(`SELISIH CALCULATED:           Rp ${(bkuBalance - bankBalance).toLocaleString('id-ID')}`);

  // Now let's try the OLD logic (tanggal creation)
  const [expOld] = await prisma.$queryRaw`
      SELECT SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS NUMERIC)) as total 
      FROM data_sp2d 
      WHERE tanggal <= ${targetDate}`;
  
  const bkuBalanceOld = Number(sa._sum.nilai || 0) + 
                     Number(inc._sum.nilai || 0) - 
                     Number(expOld[0].total || 0) - 
                     Number(taxPot._sum.nilai || 0) + 
                     Number(adjIn._sum.nilai || 0) - 
                     Number(adjOut._sum.nilai || 0);

  console.log(`\nSaldo BKU (Logic: Tanggal SP2D): Rp ${bkuBalanceOld.toLocaleString('id-ID')}`);
  console.log(`SELISIH (Old Logic):             Rp ${(bkuBalanceOld - bankBalance).toLocaleString('id-ID')}`);

  // The Dashboard says: BKU 100.878.378.380,3 vs Bank 100.792.159.918,5
  // Let's see what matches 100.878.378.380,3
  console.log(`\nTarget BKU Balance: Rp 100.878.378.380,3`);
}

findDiscrepancy().finally(() => prisma.$disconnect());
