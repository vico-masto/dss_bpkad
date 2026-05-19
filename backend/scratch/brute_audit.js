const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function bruteAudit() {
  const targetDate = new Date('2026-04-30T23:59:59.999Z');

  const [sa, pnd, sp2d, pot, tax, adjIn, adjOut] = await Promise.all([
    prisma.saldo_awal.aggregate({ _sum: { nilai: true } }),
    prisma.data_pendapatan.aggregate({ where: { tanggal: { lte: targetDate } }, _sum: { nilai: true } }),
    prisma.$queryRaw`SELECT SUM(nilai_neto) as v FROM data_sp2d WHERE COALESCE(tanggal_pencairan, tanggal) <= ${targetDate}`,
    prisma.data_sp2d_potongan.aggregate({ where: { tanggal_pencairan: { lte: targetDate } }, _sum: { nilai: true } }),
    prisma.$queryRaw`SELECT SUM(nilai) as v FROM setoran_pajak WHERE tanggal <= ${targetDate} AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p2 WHERE p2.nomor_sp2d = setoran_pajak.nomor_bukti)`,
    prisma.data_penyesuaian.aggregate({ where: { tanggal: { lte: targetDate }, jenis: 'MASUK' }, _sum: { nilai: true } }),
    prisma.data_penyesuaian.aggregate({ where: { tanggal: { lte: targetDate }, jenis: 'KELUAR' }, _sum: { nilai: true } })
  ]);

  const bku = Number(sa._sum.nilai || 0) + Number(pnd._sum.nilai || 0) - Number(sp2d[0].v || 0) - Number(pot._sum.nilai || 0) - Number(tax[0].v || 0) + Number(adjIn._sum.nilai || 0) - Number(adjOut._sum.nilai || 0);

  const bankRes = await prisma.bank_statement.aggregate({
    where: { tanggal: { lte: targetDate } },
    _sum: { debet: true, kredit: true }
  });
  const bank = Number(bankRes._sum.kredit || 0) - Number(bankRes._sum.debet || 0);

  console.log('--- BKU COMPONENTS ---');
  console.log('Saldo Awal  :', Number(sa._sum.nilai || 0).toLocaleString());
  console.log('Pendapatan  :', Number(pnd._sum.nilai || 0).toLocaleString());
  console.log('SP2D (Neto) :', Number(sp2d[0].v || 0).toLocaleString());
  console.log('Potongan    :', Number(pot._sum.nilai || 0).toLocaleString());
  console.log('Pajak Murni :', Number(tax[0].v || 0).toLocaleString());
  console.log('Adj Masuk   :', Number(adjIn._sum.nilai || 0).toLocaleString());
  console.log('Adj Keluar  :', Number(adjOut._sum.nilai || 0).toLocaleString());
  console.log('TOTAL BKU   :', bku.toLocaleString());
  console.log('TOTAL BANK  :', bank.toLocaleString());
  console.log('SELISIH     :', (bku - bank).toLocaleString());
}

bruteAudit().finally(() => prisma.$disconnect());
