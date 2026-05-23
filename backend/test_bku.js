const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const sDate = "2026-05-01";
  const eDate = "2026-05-22";
  
  try {
    const bku = await prisma.$queryRawUnsafe(`
      SELECT
        id, tanggal, bukti, uraian, nilai, tipe, status_rekon, source, opd, selisih_rekon,
        COUNT(*) OVER()::int                                               AS _total_bku,
        COUNT(*) FILTER (WHERE source = 'SP2D') OVER()::int               AS _count_sp2d,
        COUNT(*) FILTER (WHERE source = 'PENDAPATAN') OVER()::int         AS _count_pendapatan,
        COUNT(*) FILTER (WHERE source IN ('POTONGAN','SETORAN')) OVER()::int AS _count_potongan
      FROM (
        SELECT s.id::text, COALESCE(s.tanggal_pencairan, s.tanggal) as tanggal, s.nomor as bukti, s.uraian,
               CAST(CASE WHEN s.status_rekon = 'SUDAH_BRUTO' THEN s.nilai_bruto
                         ELSE s.nilai_bruto - COALESCE(
                           (SELECT SUM(p.nilai) FROM data_sp2d_potongan p
                            WHERE p.id_sp2d = s.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')),
                           CAST(s.nilai_potongan AS DECIMAL)
                         ) END AS DECIMAL) as nilai,
               'KELUAR' as tipe, COALESCE(s.status_rekon, 'BELUM') as status_rekon, 'SP2D' as source, s.opd,
               COALESCE(s.selisih_rekon, 0)::numeric as selisih_rekon
        FROM data_sp2d s
        WHERE (
               (s.tanggal_pencairan::DATE BETWEEN '${sDate}' AND '${eDate}')
            OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}')
          ) AND (s.status_rekon = 'BELUM' OR s.status_rekon IS NULL OR s.status_rekon = '')

        UNION ALL
        SELECT p.id::text, p.tanggal, p.nomor_bukti as bukti, p.uraian, p.nilai, 'MASUK' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon, 'PENDAPATAN' as source, 'BENDAHARA' as opd,
               COALESCE(p.selisih_rekon, 0)::numeric as selisih_rekon
        FROM data_pendapatan p
        WHERE p.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}' AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL OR p.status_rekon = '')

        UNION ALL
        SELECT tx.id::text, tx.tanggal, tx.nomor_bukti as bukti, tx.uraian, tx.nilai, 'KELUAR' as tipe, COALESCE(tx.status_rekon, 'BELUM') as status_rekon, 'SETORAN' as source, tx.opd,
               COALESCE(tx.selisih_rekon, 0)::numeric as selisih_rekon
        FROM setoran_pajak tx
        WHERE tx.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}' AND (tx.status_rekon = 'BELUM' OR tx.status_rekon IS NULL OR tx.status_rekon = '')
        AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = tx.nomor_bukti)

        UNION ALL
        SELECT p.id::text, COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, p.nomor_sp2d as bukti, p.uraian, p.nilai, 'KELUAR' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon, 'POTONGAN' as source, p.opd,
               COALESCE(p.selisih_rekon, 0)::numeric as selisih_rekon
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
        WHERE (
               (p.tanggal_pencairan::DATE BETWEEN '${sDate}' AND '${eDate}')
            OR (p.tanggal_pencairan IS NULL AND COALESCE(s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}')
          ) AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL OR p.status_rekon = '') 
      ) combined
      ORDER BY tanggal ASC
      LIMIT 1000 OFFSET 0
    `);
    console.log("Success! Fetched:", bku.length);
  } catch (e) {
    console.error("SQL Error:", e.message);
  }
}

main().finally(() => process.exit(0));
