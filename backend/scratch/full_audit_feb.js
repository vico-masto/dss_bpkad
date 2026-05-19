const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fullAuditFeb() {
  const start = new Date('2026-02-01');
  const end = new Date('2026-02-28T23:59:59.999Z');
  
  const [sp2d, pot, tax, adj] = await Promise.all([
    prisma.$queryRaw`SELECT SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id), 0) AS NUMERIC)) as v FROM data_sp2d WHERE tanggal BETWEEN ${start} AND ${end}`,
    prisma.data_sp2d_potongan.aggregate({ where: { tanggal_pencairan: { gte: start, lte: end } }, _sum: { nilai: true } }),
    prisma.$queryRaw`SELECT SUM(nilai) as v FROM setoran_pajak WHERE tanggal BETWEEN ${start} AND ${end} AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = setoran_pajak.nomor_bukti)`,
    prisma.data_penyesuaian.aggregate({ where: { tanggal: { gte: start, lte: end }, jenis: 'KELUAR' }, _sum: { nilai: true } })
  ]);

  const total = Number(sp2d[0].v || 0) + Number(pot._sum.nilai || 0) + Number(tax[0].v || 0) + Number(adj._sum.nilai || 0);
  
  console.log(`SP2D: ${Number(sp2d[0].v || 0).toLocaleString()}`);
  console.log(`Pot : ${Number(pot._sum.nilai || 0).toLocaleString()}`);
  console.log(`Tax : ${Number(tax[0].v || 0).toLocaleString()}`);
  console.log(`Adj : ${Number(adj._sum.nilai || 0).toLocaleString()}`);
  console.log(`TOTAL BKU FEB: Rp ${total.toLocaleString('id-ID')}`);
}

fullAuditFeb().finally(() => prisma.$disconnect());
