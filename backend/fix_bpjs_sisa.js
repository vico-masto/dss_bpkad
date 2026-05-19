/**
 * Fix 3 bank entry sisa: label "JKM" tapi nilai cocok ke potongan JKK
 * Bank: 19442 (DPP&KB), 19558 (BAPENDA), 19586 (DISPORA) — masing2 Rp 15.620
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }
function tgl(d) { return d ? new Date(d).toISOString().split('T')[0] : '-'; }

const OPD_MAP = {
  'DPP&KB':    'PENGENDALIAN PENDUDUK',
  'DISPAREKR': 'PARIWISATA',
  'DISPORA':   'PEMUDA',
  'BAPENDA':   'PENDAPATAN DAERAH',
};

async function main() {
  // Ambil 3 bank entry sisa unmatched Maret (plus SETORAN untuk dicek ulang)
  const sisa = await prisma.$queryRaw`
    SELECT id, tanggal, CAST(debet AS DECIMAL) AS debet, deskripsi, nomor_bukti
    FROM bank_statement
    WHERE debet > 0 AND is_matched = false
      AND tanggal::DATE BETWEEN '2026-03-01' AND '2026-03-31'
    ORDER BY id
  `;
  console.log(`Bank debet unmatched Maret sisa: ${sisa.length}\n`);

  let linked = 0;

  for (const b of sisa) {
    const desc = String(b.deskripsi || '').toUpperCase();

    // Skip SETORAN PEMINDAHBUKUAN
    if (desc.includes('SETORAN PEMINDAHBUKUAN')) {
      console.log(`⏭ SKIP id:${b.id} | ${b.deskripsi} (ambiguous, perlu review manual)`);
      continue;
    }

    // Cari OPD keyword
    let opdKeyword = null;
    for (const [abbr, full] of Object.entries(OPD_MAP)) {
      if (desc.includes(abbr)) { opdKeyword = full; break; }
    }

    if (!opdKeyword) {
      console.log(`⏭ SKIP id:${b.id} | ${b.deskripsi} (tidak kenal OPD)`);
      continue;
    }

    // Cari tanpa filter jenis (karena bank label JKM tapi DB punya JKK)
    const candidates = await prisma.$queryRaw`
      SELECT p.id::text AS pot_id, p.jenis_potongan, CAST(p.nilai AS DECIMAL) AS nilai,
             COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE AS tgl_pot,
             sp.opd
      FROM data_sp2d_potongan p
      JOIN data_sp2d sp ON sp.id = p.id_sp2d
      WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
        AND ABS(CAST(p.nilai AS DECIMAL) - ${Number(b.debet)}) < 1000
        AND sp.opd ILIKE ${'%' + opdKeyword + '%'}
        AND COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE
            BETWEEN ${b.tanggal}::DATE - 14 AND ${b.tanggal}::DATE + 14
      ORDER BY ABS(CAST(p.nilai AS DECIMAL) - ${Number(b.debet)}),
               ABS(COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE - ${b.tanggal}::DATE)
      LIMIT 3
    `;

    if (candidates.length === 0) {
      console.log(`❌ SKIP id:${b.id} Rp ${fmtIDR(b.debet)} | ${b.deskripsi} — kandidat 0`);
      continue;
    }

    if (candidates.length > 1) {
      console.log(`⚠  id:${b.id} — ${candidates.length} kandidat, pakai terdekat`);
      candidates.slice(1).forEach(c => console.log(`   (alt: ${c.pot_id} | ${c.jenis_potongan} | ${c.opd})`));
    }

    const pot = candidates[0];
    const selisih = Math.abs(Number(b.debet) - Number(pot.nilai));

    console.log(`🔗 LINK bank id:${b.id} → pot ${pot.pot_id}`);
    console.log(`   bank: ${tgl(b.tanggal)} Rp ${fmtIDR(b.debet)} | ${b.deskripsi}`);
    console.log(`   pot : ${tgl(pot.tgl_pot)} Rp ${fmtIDR(pot.nilai)} | jenis:${pot.jenis_potongan} | ${pot.opd}`);

    await prisma.$transaction([
      prisma.bank_statement.update({
        where: { id: parseInt(String(b.id), 10) },
        data: {
          is_matched: true,
          ref_bku_id: pot.pot_id,
          match_type: 'POTONGAN_' + (pot.jenis_potongan || 'BPJS'),
          selisih_nilai: selisih,
          catatan_selisih: selisih < 1 ? null : `Selisih Rp ${fmtIDR(selisih)}`,
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
    console.log(`   ✅ OK\n`);
  }

  console.log(`HASIL: ${linked} tambahan di-link`);
  const sisaAkhir = await prisma.bank_statement.count({
    where: { debet: { gt: 0 }, is_matched: false, tanggal: { gte: new Date('2026-03-01'), lte: new Date('2026-03-31') } }
  });
  console.log(`Sisa bank unmatched Maret: ${sisaAkhir}`);

  await prisma.$disconnect();
}

main().catch(async e => { console.error(e.message); await prisma.$disconnect(); process.exit(1); });
