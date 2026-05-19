/**
 * Cocokkan 9 bank debet unmatched Maret (BPJS/Pajak) ke potongan BELUM
 * Strategi: nilai ±1000 + OPD keyword dari deskripsi bank + jenis_potongan + tanggal ±14hr
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const SEP = '═'.repeat(90);
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }
function tgl(d) { return d ? new Date(d).toISOString().split('T')[0] : '-'; }

// Pemetaan OPD keyword dari deskripsi bank ke pola nama OPD di DB
const OPD_MAP = {
  'DPP&KB':    'PENGENDALIAN PENDUDUK',
  'DISPAREKR': 'PARIWISATA',
  'DISPORA':   'PEMUDA',
  'BAPENDA':   'PENDAPATAN DAERAH',
  'SETDA':     'SEKRETARIAT DAERAH',
};

// Pemetaan jenis dari deskripsi bank
function extractJenis(desc) {
  if (!desc) return null;
  const d = String(desc).toUpperCase();
  if (d.startsWith('JKK') || d.includes('JKK ')) return 'JKK';
  if (d.startsWith('JKM') || d.includes('JKM ')) return 'JKM';
  if (d.includes('PAJAK')) return 'PAJAK';
  return null;
}

function extractOpdKeyword(desc) {
  if (!desc) return null;
  const d = String(desc).toUpperCase();
  for (const [abbr, full] of Object.entries(OPD_MAP)) {
    if (d.includes(abbr)) return full;
  }
  // Fallback: cek kata terakhir setelah '/'
  const parts = d.split('/');
  return parts[parts.length - 1]?.trim() || null;
}

async function main() {
  console.log('\n' + SEP);
  console.log(' FIX: Bank Debet Unmatched Maret → Potongan BELUM (BPJS+Pajak)');
  console.log(SEP + '\n');

  const bankUnmatch = await prisma.$queryRaw`
    SELECT id, tanggal, CAST(debet AS DECIMAL) AS debet, deskripsi, nomor_bukti
    FROM bank_statement
    WHERE debet > 0 AND is_matched = false
      AND tanggal::DATE BETWEEN '2026-03-01' AND '2026-03-31'
    ORDER BY debet DESC
  `;

  let linked = 0, skipped = 0;

  for (const b of bankUnmatch) {
    const jenis = extractJenis(b.deskripsi);
    const opdKeyword = extractOpdKeyword(b.deskripsi);

    // Skip SETORAN PEMINDAHBUKUAN — ambiguous
    if (String(b.deskripsi||'').toUpperCase().includes('SETORAN PEMINDAHBUKUAN')) {
      console.log(`⏭  SKIP id:${b.id} Rp ${fmtIDR(b.debet)} | ${b.deskripsi} (ambiguous)`);
      skipped++;
      continue;
    }

    // Cari potongan BELUM yang cocok
    let candidates;
    if (jenis && opdKeyword) {
      candidates = await prisma.$queryRaw`
        SELECT p.id::text AS pot_id, p.jenis_potongan, CAST(p.nilai AS DECIMAL) AS nilai,
               COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE AS tgl_pot,
               sp.opd, sp.nomor AS sp2d_nomor
        FROM data_sp2d_potongan p
        JOIN data_sp2d sp ON sp.id = p.id_sp2d
        WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
          AND ABS(CAST(p.nilai AS DECIMAL) - ${Number(b.debet)}) < 1000
          AND p.jenis_potongan = ${jenis}
          AND sp.opd ILIKE ${'%' + opdKeyword + '%'}
          AND COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE
              BETWEEN ${b.tanggal}::DATE - 14 AND ${b.tanggal}::DATE + 14
        ORDER BY ABS(CAST(p.nilai AS DECIMAL) - ${Number(b.debet)}),
                 ABS(COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE - ${b.tanggal}::DATE)
        LIMIT 3
      `;
    } else if (opdKeyword) {
      // Jenis tidak diketahui, coba tanpa filter jenis
      candidates = await prisma.$queryRaw`
        SELECT p.id::text AS pot_id, p.jenis_potongan, CAST(p.nilai AS DECIMAL) AS nilai,
               COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE AS tgl_pot,
               sp.opd, sp.nomor AS sp2d_nomor
        FROM data_sp2d_potongan p
        JOIN data_sp2d sp ON sp.id = p.id_sp2d
        WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
          AND ABS(CAST(p.nilai AS DECIMAL) - ${Number(b.debet)}) < 1000
          AND sp.opd ILIKE ${'%' + opdKeyword + '%'}
          AND COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE
              BETWEEN ${b.tanggal}::DATE - 14 AND ${b.tanggal}::DATE + 14
        ORDER BY ABS(CAST(p.nilai AS DECIMAL) - ${Number(b.debet)})
        LIMIT 3
      `;
    } else {
      candidates = [];
    }

    if (candidates.length === 0) {
      console.log(`❌ SKIP id:${b.id} Rp ${fmtIDR(b.debet)} | ${b.deskripsi} — tidak ada kandidat`);
      skipped++;
      continue;
    }

    if (candidates.length > 1) {
      console.log(`⚠  id:${b.id} Rp ${fmtIDR(b.debet)} | ${b.deskripsi} — ${candidates.length} kandidat, pakai yang terdekat`);
      candidates.slice(1).forEach(c => console.log(`   (alternatif: ${c.pot_id} | ${c.jenis_potongan} | ${c.opd})`));
    }

    const pot = candidates[0];
    const selisih = Math.abs(Number(b.debet) - Number(pot.nilai));

    console.log(`🔗 LINK bank id:${b.id} → pot ${pot.pot_id}`);
    console.log(`   bank: ${tgl(b.tanggal)} Rp ${fmtIDR(b.debet)} | nb:${b.nomor_bukti} | ${b.deskripsi}`);
    console.log(`   pot : ${tgl(pot.tgl_pot)} Rp ${fmtIDR(pot.nilai)} | jenis:${pot.jenis_potongan} | opd:${pot.opd} | selisih:${fmtIDR(selisih)}`);

    try {
      await prisma.$transaction([
        prisma.bank_statement.update({
          where: { id: parseInt(String(b.id), 10) },
          data: {
            is_matched: true,
            ref_bku_id: pot.pot_id,
            match_type: 'POTONGAN_' + (pot.jenis_potongan || 'BPJS'),
            selisih_nilai: selisih,
            catatan_selisih: selisih < 1 ? null : `Auto-matched selisih Rp ${fmtIDR(selisih)}`,
          }
        }),
        prisma.data_sp2d_potongan.update({
          where: { id: pot.pot_id },
          data: {
            status_rekon: 'SUDAH',
            keterangan_rekon: `Auto-Matched Bank Statement via OPD+Nilai (${pot.jenis_potongan})`,
            tanggal_pencairan: b.tanggal,
          }
        }),
      ]);
      linked++;
      console.log(`   ✅ Berhasil`);
    } catch (err) {
      console.error(`   ❌ GAGAL: ${err.message}`);
      skipped++;
    }
    console.log('');
  }

  console.log(SEP);
  console.log(`HASIL: ${linked} pasangan di-link, ${skipped} diskip`);

  // Cek sisa bank unmatched Maret
  const sisaUnmatch = await prisma.bank_statement.count({
    where: { debet: { gt: 0 }, is_matched: false, tanggal: { gte: new Date('2026-03-01'), lte: new Date('2026-03-31') } }
  });
  console.log(`Sisa bank debet unmatched Maret: ${sisaUnmatch}`);

  // Cek perubahan unmatched_keluar
  const belumStats = await prisma.$queryRaw`
    SELECT
      TO_CHAR(tgl,'YYYY-MM') AS bulan,
      SUM(nilai)::DECIMAL AS unmatched_keluar
    FROM (
      SELECT COALESCE(tanggal_pencairan, tanggal) AS tgl, (CAST(nilai_bruto AS DECIMAL) - COALESCE(pot.total,0)) AS nilai
      FROM data_sp2d s
      LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
      WHERE (status_rekon IS NULL OR status_rekon = '' OR status_rekon = 'BELUM')
        AND COALESCE(tanggal_pencairan, tanggal)::DATE BETWEEN '2026-02-01' AND '2026-04-30'
      UNION ALL
      SELECT COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal) AS tgl, CAST(p.nilai AS DECIMAL)
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
      WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
        AND COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE BETWEEN '2026-02-01' AND '2026-04-30'
    ) x
    GROUP BY TO_CHAR(tgl,'YYYY-MM')
    ORDER BY bulan
  `;
  console.log('\nUnmatched BKU KELUAR saat ini:');
  let grandTotal = 0;
  belumStats.forEach(r => {
    grandTotal += Number(r.unmatched_keluar || 0);
    console.log(`  ${r.bulan}: Rp ${fmtIDR(r.unmatched_keluar)}`);
  });
  console.log(`  TOTAL: Rp ${fmtIDR(grandTotal)}`);

  console.log('\n' + SEP + '\n');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
