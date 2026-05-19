const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFinal() {
  const dates = ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30'];
  
  for (const d of dates) {
    const endOfPeriodDate = new Date(d);
    endOfPeriodDate.setHours(23, 59, 59, 999);
    
    // BKU
    const [sa, inc, exp, taxPot, adjIn, adjOut] = await Promise.all([
      prisma.saldo_awal.aggregate({ _sum: { nilai: true } }),
      prisma.data_pendapatan.aggregate({ where: { tanggal: { lte: endOfPeriodDate } }, _sum: { nilai: true } }),
      prisma.$queryRaw`
        SELECT SUM(d.nilai_bruto - (h.nilai_potongan * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) as total 
        FROM detail_sp2d d JOIN data_sp2d h ON d.id_sp2d = h.id 
        WHERE COALESCE(h.tanggal_pencairan, h.tanggal) <= ${endOfPeriodDate}
      `,
      prisma.data_sp2d_potongan.aggregate({ where: { tanggal_pencairan: { lte: endOfPeriodDate } }, _sum: { nilai: true } }),
      prisma.data_penyesuaian.aggregate({ where: { jenis: 'MASUK', tanggal: { lte: endOfPeriodDate } }, _sum: { nilai: true } }),
      prisma.data_penyesuaian.aggregate({ where: { jenis: 'KELUAR', tanggal: { lte: endOfPeriodDate } }, _sum: { nilai: true } })
    ]);

    const bku = Number(sa._sum.nilai || 0) + Number(inc._sum.nilai || 0) - Number(exp[0].total || 0) - Number(taxPot._sum.nilai || 0) + Number(adjIn._sum.nilai || 0) - Number(adjOut._sum.nilai || 0);

    // Bank
    const bankMetrics = await prisma.bank_statement.aggregate({
      where: { tanggal: { lte: endOfPeriodDate } },
      _sum: { debet: true, kredit: true }
    });
    const bank = Number(bankMetrics._sum.kredit || 0) - Number(bankMetrics._sum.debet || 0);

    console.log(`${d} | BKU: ${bku.toLocaleString()} | Bank: ${bank.toLocaleString()} | Selisih: ${(bku-bank).toLocaleString()}`);
  }
}

checkFinal().finally(() => prisma.$disconnect());
