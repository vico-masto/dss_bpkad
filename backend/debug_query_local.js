const prisma = require('./prismaClient');

async function debug() {
  try {
    const bku = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT
          id::text,
          tanggal,
          nomor as bukti,
          uraian,
          nilai_neto as nilai,
          nilai_bruto,
          nilai_potongan,
          opd,
          'KELUAR' as tipe,
          status_rekon,
          'SP2D' as source,
          COALESCE(selisih_rekon, 0)::decimal AS selisih_rekon,
          keterangan_rekon
        FROM data_sp2d
        WHERE tanggal BETWEEN '2026-01-01'::date AND '2026-12-31'::date
        UNION ALL
        SELECT
          p.id::text as id,
          p.tanggal,
          p.nomor_bukti as bukti,
          p.uraian,
          p.nilai,
          p.nilai as nilai_bruto,
          0::decimal as nilai_potongan,
          NULL::text as opd,
          'MASUK' as tipe,
          p.status_rekon,
          'PENDAPATAN' as source,
          NULL::decimal AS selisih_rekon,
          NULL::text AS keterangan_rekon
        FROM data_pendapatan p
        WHERE tanggal BETWEEN '2026-01-01'::date AND '2026-12-31'::date
        UNION ALL
        SELECT
          s.id::text as id,
          s.tanggal,
          s.nomor_bukti as bukti,
          s.uraian,
          s.nilai,
          s.nilai as nilai_bruto,
          0::decimal as nilai_potongan,
          s.opd,
          'KELUAR' as tipe,
          s.status_rekon,
          'SETORAN' as source,
          NULL::decimal AS selisih_rekon,
          NULL::text AS keterangan_rekon
        FROM setoran_pajak s
        WHERE s.tanggal BETWEEN '2026-01-01'::date AND '2026-12-31'::date
        UNION ALL
        SELECT
          id::text,
          tanggal_pencairan as tanggal,
          nomor_sp2d as bukti,
          uraian,
          nilai,
          nilai as nilai_bruto,
          0::decimal as nilai_potongan,
          opd,
          'KELUAR' as tipe,
          status_rekon,
          'POTONGAN' as source,
          NULL::decimal AS selisih_rekon,
          keterangan::text AS keterangan_rekon
        FROM data_sp2d_potongan
        WHERE tanggal_pencairan BETWEEN '2026-01-01'::date AND '2026-12-31'::date
      ) combined
      ORDER BY tanggal ASC
      LIMIT 10
    `;
    console.log('Success!', bku.length);
  } catch (err) {
    console.error('FAILED:', err);
  } finally {
    await prisma.$disconnect();
  }
}

debug();
