const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const sDate = "2026-05-01";
  const eDate = "2026-05-22";
  
  try {
    const summaryAgg = await prisma.$queryRawUnsafe(`
      SELECT
        SUM(CASE WHEN tipe = 'KELUAR' THEN nilai ELSE 0 END) as total_keluar,
        SUM(CASE WHEN tipe = 'MASUK' THEN nilai ELSE 0 END) as total_masuk,
        SUM(CASE WHEN tipe = 'KELUAR' AND (status_rekon = 'BELUM' OR status_rekon IS NULL OR status_rekon = '') THEN nilai ELSE 0 END) as unmatched_keluar,
        SUM(CASE WHEN tipe = 'MASUK' AND (status_rekon = 'BELUM' OR status_rekon IS NULL OR status_rekon = '') THEN nilai ELSE 0 END) as unmatched_masuk,
        COUNT(*) as total_count
      FROM (
        SELECT CASE WHEN s.status_rekon = 'SUDAH_BRUTO' THEN s.nilai_bruto
                    ELSE s.nilai_bruto - COALESCE(
                      (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
                       WHERE p.id_sp2d = s.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
                      CAST(s.nilai_potongan AS DECIMAL)
                    ) END as nilai, 'KELUAR' as tipe, COALESCE(s.status_rekon, 'BELUM') as status_rekon
        FROM data_sp2d s
        WHERE ((s.tanggal_pencairan::DATE >= '${sDate}' AND s.tanggal_pencairan::DATE <= '${eDate}')
           OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE >= '${sDate}' AND s.tanggal::DATE <= '${eDate}'))

        UNION ALL
        SELECT p.nilai, 'KELUAR' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}'

        UNION ALL
        SELECT p.nilai, 'MASUK' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon
        FROM data_pendapatan p
        WHERE p.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'

        UNION ALL
        SELECT s.nilai, 'KELUAR' as tipe, COALESCE(s.status_rekon, 'BELUM') as status_rekon
        FROM setoran_pajak s
        WHERE s.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'
        AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
      ) as global_bku
    `);
    console.log("Success! Summary:", summaryAgg[0]);
  } catch (e) {
    console.error("SQL Error:", e.message);
  }
}

main().finally(() => process.exit(0));
