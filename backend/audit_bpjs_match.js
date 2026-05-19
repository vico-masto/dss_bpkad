/**
 * Cocokkan bank debet unmatched Maret (BPJS/JKK) ke potongan BELUM
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
const SEP = '═'.repeat(90);
const SEP2 = '─'.repeat(90);
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }
function tgl(d) { return d ? new Date(d).toISOString().split('T')[0] : '-'; }

async function main() {
  console.log('\n' + SEP);
  console.log(' AUDIT: Bank Debet Unmatched Maret vs Potongan BELUM');
  console.log(SEP + '\n');

  // Semua bank debet unmatched Maret
  const bankUnmatch = await prisma.$queryRaw`
    SELECT id, tanggal, CAST(debet AS DECIMAL) AS debet,
           deskripsi, nomor_bukti, ref_bku_id
    FROM bank_statement
    WHERE debet > 0 AND is_matched = false
      AND tanggal::DATE BETWEEN '2026-03-01' AND '2026-03-31'
    ORDER BY debet DESC
  `;
  console.log(`Bank debet unmatched Maret: ${bankUnmatch.length} entry`);
  console.log(SEP2);
  bankUnmatch.forEach((b, i) => {
    console.log(`  [${i+1}] id:${b.id} | ${tgl(b.tanggal)} | Rp ${fmtIDR(b.debet).padStart(22)} | nb:${String(b.nomor_bukti||'-').padEnd(25)} | ${String(b.deskripsi||'').substring(0,40)}`);
  });

  // Potongan BELUM Maret — per jenis
  console.log('\nPotongan BELUM Maret — distribusi jenis:');
  console.log(SEP2);
  const potDist = await prisma.$queryRaw`
    SELECT
      p.jenis_potongan,
      COUNT(*)::int AS jumlah,
      SUM(CAST(p.nilai AS DECIMAL))::DECIMAL AS total
    FROM data_sp2d_potongan p
    LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
    WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
      AND COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE BETWEEN '2026-03-01' AND '2026-03-31'
    GROUP BY p.jenis_potongan
    ORDER BY total DESC
  `;
  potDist.forEach(r => {
    console.log(`  ${String(r.jenis_potongan||'-').padEnd(30)} | ${String(r.jumlah).padStart(4)} item | Rp ${fmtIDR(r.total)}`);
  });

  // Cek apakah ada potongan yang nilai-nya cocok dengan bank unmatched
  console.log('\nCari pasangan: bank unmatched ↔ potongan BELUM (toleransi Rp 1000):');
  console.log(SEP2);
  for (const b of bankUnmatch) {
    const matches = await prisma.$queryRaw`
      SELECT
        p.id::text AS pot_id,
        p.jenis_potongan,
        CAST(p.nilai AS DECIMAL) AS nilai,
        COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE AS tgl_pot,
        p.status_rekon,
        sp.nomor AS sp2d_nomor,
        sp.opd
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
      WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
        AND ABS(CAST(p.nilai AS DECIMAL) - ${Number(b.debet)}) < 1000
        AND COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE
            BETWEEN ${b.tanggal}::DATE - 14 AND ${b.tanggal}::DATE + 14
      LIMIT 10
    `;
    if (matches.length > 0) {
      console.log(`\n✅ BANK id:${b.id} | ${tgl(b.tanggal)} | Rp ${fmtIDR(b.debet)} | nb:${b.nomor_bukti}`);
      matches.forEach(m => {
        console.log(`   → POTONGAN id:${m.pot_id} | ${tgl(m.tgl_pot)} | Rp ${fmtIDR(m.nilai)} | jenis:${m.jenis_potongan} | opd:${String(m.opd||'-').substring(0,30)}`);
      });
    } else {
      // Coba toleransi lebih lebar: cek total potongan satu OPD satu jenis
      const sumMatches = await prisma.$queryRaw`
        SELECT
          sp.opd,
          p.jenis_potongan,
          SUM(CAST(p.nilai AS DECIMAL))::DECIMAL AS total_nilai,
          COUNT(*)::int AS cnt,
          MIN(COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal))::DATE AS tgl_min
        FROM data_sp2d_potongan p
        LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
        WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
          AND COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE
              BETWEEN ${b.tanggal}::DATE - 14 AND ${b.tanggal}::DATE + 14
        GROUP BY sp.opd, p.jenis_potongan
        HAVING ABS(SUM(CAST(p.nilai AS DECIMAL)) - ${Number(b.debet)}) < 1000
        ORDER BY ABS(SUM(CAST(p.nilai AS DECIMAL)) - ${Number(b.debet)})
        LIMIT 5
      `;
      if (sumMatches.length > 0) {
        console.log(`\n✅ BANK id:${b.id} | ${tgl(b.tanggal)} | Rp ${fmtIDR(b.debet)} | nb:${b.nomor_bukti} [SUM MATCH]`);
        sumMatches.forEach(m => {
          console.log(`   → SUM POTONGAN: opd:${String(m.opd||'-').substring(0,30)} | ${m.jenis_potongan} | total:Rp ${fmtIDR(m.total_nilai)} | cnt:${m.cnt}`);
        });
      } else {
        console.log(`❌ BANK id:${b.id} | ${tgl(b.tanggal)} | Rp ${fmtIDR(b.debet)} | nb:${b.nomor_bukti} — tidak ada pasangan potongan`);
      }
    }
  }

  // Cek juga: potongan BELUM Feb-Mar yang bisa dicocokkan via nomor_bukti dengan bank
  console.log('\n\nCek potongan BELUM Feb-Mar yang punya nomor_bukti cocok di bank:');
  console.log(SEP2);
  const potWithBankNb = await prisma.$queryRaw`
    SELECT
      p.id::text AS pot_id,
      p.jenis_potongan,
      CAST(p.nilai AS DECIMAL) AS nilai,
      p.nomor_bukti AS pot_nb,
      COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE AS tgl_pot,
      bs.id AS bs_id,
      CAST(bs.debet AS DECIMAL) AS bs_debet,
      bs.is_matched,
      bs.nomor_bukti AS bs_nb,
      bs.tanggal AS bs_tgl
    FROM data_sp2d_potongan p
    LEFT JOIN data_sp2d sp ON p.id_sp2d = sp.id
    JOIN bank_statement bs ON bs.nomor_bukti = p.nomor_bukti
      AND bs.debet > 0
    WHERE (p.status_rekon IS NULL OR p.status_rekon = '' OR p.status_rekon = 'BELUM')
      AND COALESCE(p.tanggal_pencairan, sp.tanggal_pencairan, sp.tanggal)::DATE BETWEEN '2026-02-01' AND '2026-03-31'
      AND p.nomor_bukti IS NOT NULL AND p.nomor_bukti != ''
    LIMIT 20
  `;
  if (potWithBankNb.length > 0) {
    console.log(`Ditemukan ${potWithBankNb.length} potongan BELUM dengan nomor_bukti cocok di bank:`);
    potWithBankNb.forEach((r, i) => {
      const selisih = Math.abs(Number(r.nilai) - Number(r.bs_debet));
      console.log(`  [${i+1}] pot:Rp ${fmtIDR(r.nilai)} | bank:Rp ${fmtIDR(r.bs_debet)} | selisih:${fmtIDR(selisih)} | jenis:${r.jenis_potongan} | nb:${r.pot_nb} | bs.matched:${r.is_matched}`);
    });
  } else {
    console.log('  Tidak ada potongan BELUM dengan nomor_bukti cocok di bank');
  }

  console.log('\n' + SEP + '\n');
  await prisma.$disconnect();
}

main().catch(async e => {
  console.error('ERROR:', e.message);
  await prisma.$disconnect();
  process.exit(1);
});
