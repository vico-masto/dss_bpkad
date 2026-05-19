/**
 * Audit: cari bulan mana yang unmatched_keluar = Rp 2.000.867.364
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

function fmtIDR(n) {
  return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 });
}

async function main() {
  const TARGET = 2000867364;
  const TOL = 5000;

  // Hitung unmatched_keluar per bulan (formula sama dengan summaryAgg di dashboard)
  const rows = await prisma.$queryRaw`
    SELECT
      TO_CHAR(tgl, 'YYYY-MM') AS bulan,
      SUM(nilai)::DECIMAL AS total_keluar,
      SUM(CASE WHEN (status_rekon = 'BELUM' OR status_rekon IS NULL OR status_rekon = '') THEN nilai ELSE 0 END)::DECIMAL AS unmatched_keluar,
      COUNT(*)::int AS jumlah
    FROM (
      -- SP2D neto
      SELECT
        COALESCE(s.tanggal_pencairan, s.tanggal)::DATE AS tgl,
        (s.nilai_bruto - COALESCE(pot.total, 0)) AS nilai,
        COALESCE(s.status_rekon, 'BELUM') AS status_rekon
      FROM data_sp2d s
      LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot
        ON s.id = pot.id_sp2d

      UNION ALL
      -- Potongan
      SELECT
        COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE AS tgl,
        p.nilai,
        COALESCE(p.status_rekon, 'BELUM') AS status_rekon
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id

      UNION ALL
      -- Setoran pajak (tidak double dengan potongan)
      SELECT
        s.tanggal::DATE AS tgl,
        s.nilai,
        COALESCE(s.status_rekon, 'BELUM') AS status_rekon
      FROM setoran_pajak s
      WHERE NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
    ) x
    GROUP BY TO_CHAR(tgl, 'YYYY-MM')
    ORDER BY bulan
  `;

  console.log('\n══════════════════════════════════════════════════════════════════════════');
  console.log(' AUDIT: unmatched_keluar PER BULAN vs TARGET Rp ' + fmtIDR(TARGET));
  console.log('══════════════════════════════════════════════════════════════════════════\n');

  let found = false;
  rows.forEach(r => {
    const um = Number(r.unmatched_keluar || 0);
    const diff = Math.abs(um - TARGET);
    const mark = diff < TOL ? ' ✅ MATCH!' : '';
    if (diff < TOL) found = true;
    console.log(`  ${r.bulan}  unmatched: Rp ${fmtIDR(um).padStart(28)}  total: Rp ${fmtIDR(r.total_keluar).padStart(28)}${mark}`);
  });

  if (!found) {
    console.log('\n  ⚠️  Tidak ada bulan tunggal yang cocok — coba range kumulatif\n');

    // Coba semua kombinasi range bulan (kumulatif dari bulan X sampai Y)
    const months = rows.map(r => ({ bulan: r.bulan, um: Number(r.unmatched_keluar || 0) }));
    for (let i = 0; i < months.length; i++) {
      let cum = 0;
      for (let j = i; j < months.length; j++) {
        cum += months[j].um;
        if (Math.abs(cum - TARGET) < TOL) {
          console.log(`  ✅ RANGE MATCH: ${months[i].bulan} s/d ${months[j].bulan} = Rp ${fmtIDR(cum)}`);
        }
      }
    }
  }

  // Juga cek apakah nilai target muncul di SP2D neto BELUM per bulan saja
  console.log('\n──────────────────────────────────────────────────────────────────────────');
  console.log(' SP2D NETO BELUM saja, per bulan:');
  const sp2dBulan = await prisma.$queryRaw`
    SELECT
      TO_CHAR(COALESCE(tanggal_pencairan, tanggal), 'YYYY-MM') AS bulan,
      SUM(nilai_bruto - COALESCE(pot.total, 0))::DECIMAL AS neto_belum,
      COUNT(*)::int AS jumlah
    FROM data_sp2d s
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot
      ON s.id = pot.id_sp2d
    WHERE (status_rekon = 'BELUM' OR status_rekon IS NULL OR status_rekon = '')
    GROUP BY TO_CHAR(COALESCE(tanggal_pencairan, tanggal), 'YYYY-MM')
    ORDER BY bulan
  `;
  sp2dBulan.forEach(r => {
    const v = Number(r.neto_belum || 0);
    const mark = Math.abs(v - TARGET) < TOL ? ' ✅ MATCH!' : '';
    console.log(`  ${r.bulan}  SP2D neto BELUM: Rp ${fmtIDR(v).padStart(28)}${mark}`);
  });

  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
