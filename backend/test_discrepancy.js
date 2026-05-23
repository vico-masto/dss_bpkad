const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const currentYear = 2026;
  try {
    const matchedWithDiscrepancy = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT CAST(id AS VARCHAR) as id, 'SP2D' as tipe, tanggal_pencairan as tanggal, nomor as bukti, opd, uraian, CAST(nilai_neto AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM data_sp2d WHERE tahun = ${currentYear} AND (ABS(COALESCE(selisih_rekon, 0)) > 0 OR keterangan_rekon LIKE '%Catatan Admin:%')
        UNION ALL
        SELECT CAST(id AS VARCHAR) as id, 'PENDAPATAN' as tipe, tanggal, nomor_bukti as bukti, 'BENDAHARA' as opd, uraian, CAST(nilai AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM data_pendapatan WHERE tahun = ${currentYear} AND (ABS(COALESCE(selisih_rekon, 0)) > 0 OR keterangan_rekon LIKE '%Catatan Admin:%')
        UNION ALL
        SELECT CAST(p.id AS VARCHAR) as id, 'POTONGAN' as tipe, COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, p.nomor_sp2d as bukti, p.opd, p.uraian, CAST(p.nilai AS DECIMAL) as nilai, CAST(COALESCE(p.selisih_rekon, 0) AS DECIMAL) as selisih, p.keterangan_rekon, p.status_rekon FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${currentYear} AND (ABS(COALESCE(p.selisih_rekon, 0)) > 0 OR p.keterangan_rekon LIKE '%Catatan Admin:%')
        UNION ALL
        SELECT CAST(id AS VARCHAR) as id, 'PAJAK' as tipe, COALESCE(tanggal_pencairan, tanggal) as tanggal, nomor_bukti as bukti, opd, uraian, CAST(nilai AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM setoran_pajak WHERE EXTRACT(YEAR FROM COALESCE(tanggal_pencairan, tanggal)) = ${currentYear} AND (ABS(COALESCE(selisih_rekon, 0)) > 0 OR keterangan_rekon LIKE '%Catatan Admin:%')
      ) combined WHERE ABS(selisih) > 0.01 OR keterangan_rekon LIKE '%Catatan Admin:%' ORDER BY tanggal DESC LIMIT 100
    `;
    console.log("Success! Items:", matchedWithDiscrepancy.length);
  } catch (e) {
    console.error("SQL Error:", e.message);
  }
}

main().finally(() => process.exit(0));
