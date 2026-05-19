const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const currentYear = 2026;
  
  // 1. Saldo Awal
  const saRaw = await prisma.saldo_awal.aggregate({ _sum: { nilai: true }, where: { tahun: currentYear } });
  const sa = Number(saRaw._sum.nilai || 0);

  // 2. Total Pendapatan
  const incRaw = await prisma.data_pendapatan.aggregate({ _sum: { nilai: true }, where: { tahun: currentYear } });
  const inc = Number(incRaw._sum.nilai || 0);

  // 3. Total SP2D (Neto)
  const expRaw = await prisma.data_sp2d.aggregate({ _sum: { nilai_neto: true }, where: { tahun: currentYear } });
  const exp = Number(expRaw._sum.nilai_neto || 0);

  // 4. Pajak & Potongan (Sudah setor)
  const taxSetorRaw = await prisma.setoran_pajak.aggregate({ _sum: { nilai: true } });
  const taxSetor = Number(taxSetorRaw._sum.nilai || 0);
  
  const taxPotRaw = await prisma.data_sp2d_potongan.aggregate({ _sum: { nilai: true } });
  const taxPot = Number(taxPotRaw._sum.nilai || 0);

  // 5. Penyesuaian
  const adjInRaw = await prisma.data_penyesuaian.aggregate({ _sum: { nilai: true }, where: { jenis: 'MASUK' } });
  const adjOutRaw = await prisma.data_penyesuaian.aggregate({ _sum: { nilai: true }, where: { jenis: 'KELUAR' } });
  const adj = Number(adjInRaw._sum.nilai || 0) - Number(adjOutRaw._sum.nilai || 0);

  const saldoBKU = sa + inc - exp - taxSetor - taxPot + adj;

  // 6. Saldo Bank (Latest)
  const latestBank = await prisma.bank_statement.findFirst({
    orderBy: [{ tanggal: 'desc' }, { id: 'desc' }]
  });
  const saldoBank = Number(latestBank ? latestBank.saldo_akhir : 0);

  console.log(`Saldo BKU: ${saldoBKU}`);
  console.log(`Saldo Bank: ${saldoBank}`);
  console.log(`Selisih: ${saldoBKU - saldoBank}`);
}

run().finally(() => prisma.$disconnect());
