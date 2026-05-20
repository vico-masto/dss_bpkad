const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const currentYear = 2026;

  console.log('=== Checking for Header vs Detail Discrepancies in SP2D ===\n');

  // 1. Find SP2D with no detail_sp2d records
  const orphans = await prisma.$queryRaw`
    SELECT id, nomor, opd, tanggal, tanggal_pencairan, status_rekon,
           CAST(nilai_bruto AS DECIMAL) as bruto, CAST(nilai_neto AS DECIMAL) as neto
    FROM data_sp2d s
    WHERE NOT EXISTS (
      SELECT 1 FROM detail_sp2d d WHERE d.id_sp2d = s.id
    ) AND s.tahun = ${currentYear}
  `;

  console.log(`1. SP2D headers with NO detail_sp2d records: ${orphans.length} items`);
  let orphanBrutoSum = 0;
  let orphanNetoSum = 0;
  orphans.forEach(o => {
    orphanBrutoSum += Number(o.bruto);
    orphanNetoSum += Number(o.neto);
    console.log(`- ${o.nomor} | OPD: ${o.opd} | Bruto: Rp ${Number(o.bruto).toLocaleString('id-ID')} | Neto: Rp ${Number(o.neto).toLocaleString('id-ID')} | Status: ${o.status_rekon}`);
  });
  console.log(`Total Bruto of Orphans: Rp ${orphanBrutoSum.toLocaleString('id-ID')}`);
  console.log(`Total Neto of Orphans : Rp ${orphanNetoSum.toLocaleString('id-ID')}`);

  // 2. Find SP2D where sum of detail_sp2d.nilai_bruto does not equal data_sp2d.nilai_bruto
  const mismatches = await prisma.$queryRaw`
    SELECT s.nomor, s.opd,
           CAST(s.nilai_bruto AS DECIMAL) as header_bruto,
           CAST(s.nilai_neto AS DECIMAL) as header_neto,
           CAST(d_sum.bruto AS DECIMAL) as detail_bruto,
           CAST(d_sum.neto AS DECIMAL) as detail_neto
    FROM data_sp2d s
    JOIN (
      SELECT id_sp2d, SUM(nilai_bruto) as bruto, SUM(nilai_neto) as neto
      FROM detail_sp2d
      GROUP BY id_sp2d
    ) d_sum ON s.id = d_sum.id_sp2d
    WHERE ABS(CAST(s.nilai_bruto AS DECIMAL) - CAST(d_sum.bruto AS DECIMAL)) > 1
       OR ABS(CAST(s.nilai_neto AS DECIMAL) - CAST(d_sum.neto AS DECIMAL)) > 1
  `;

  console.log(`\n2. SP2D headers where details sum does not match header: ${mismatches.length} items`);
  mismatches.forEach(m => {
    console.log(`- ${m.nomor} | Header Bruto: Rp ${Number(m.header_bruto).toLocaleString('id-ID')} vs Detail Bruto: Rp ${Number(m.detail_bruto).toLocaleString('id-ID')} | Header Neto: Rp ${Number(m.header_neto).toLocaleString('id-ID')} vs Detail Neto: Rp ${Number(m.detail_neto).toLocaleString('id-ID')}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
