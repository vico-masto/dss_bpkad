/**
 * Cek: SP2D yang diklaim bank (ref_bku_id) sama atau beda nomor dengan SP2D BELUM?
 * Fokus: Feb 27 dan Mar awal yang bank-nya 🔒
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }

async function main() {
  // Ambil pasangan: BELUM SP2D + bank entry yang claim nilai sama
  const pairs = await prisma.$queryRaw`
    SELECT
      s_belum.id::text           AS belum_id,
      s_belum.nomor              AS belum_nomor,
      (CAST(s_belum.nilai_bruto AS DECIMAL) - COALESCE(pot.total,0)) AS belum_neto,
      COALESCE(s_belum.tanggal_pencairan, s_belum.tanggal)::DATE AS belum_tgl,
      bs.id                      AS bs_id,
      CAST(bs.debet AS DECIMAL)  AS bs_debet,
      bs.tanggal::DATE           AS bs_tgl,
      bs.ref_bku_id              AS bs_ref,
      bs.deskripsi               AS bs_desc,
      s_claim.id::text           AS claim_id,
      s_claim.nomor              AS claim_nomor,
      CAST(s_claim.nilai_bruto AS DECIMAL) AS claim_bruto,
      COALESCE(pot2.total,0)::DECIMAL AS claim_pot,
      (CAST(s_claim.nilai_bruto AS DECIMAL) - COALESCE(pot2.total,0)) AS claim_neto,
      s_claim.status_rekon       AS claim_status
    FROM data_sp2d s_belum
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s_belum.id = pot.id_sp2d
    -- bank dengan nilai cocok ±7 hari
    JOIN bank_statement bs ON bs.debet > 0
      AND ABS(CAST(bs.debet AS DECIMAL) - (CAST(s_belum.nilai_bruto AS DECIMAL) - COALESCE(pot.total,0))) < 1000
      AND bs.tanggal::DATE BETWEEN COALESCE(s_belum.tanggal_pencairan,s_belum.tanggal)::DATE - 7
                                AND COALESCE(s_belum.tanggal_pencairan,s_belum.tanggal)::DATE + 7
      AND bs.is_matched = true
    -- SP2D yang diklaim bank
    JOIN data_sp2d s_claim ON s_claim.id = TRIM(bs.ref_bku_id)
    LEFT JOIN (SELECT id_sp2d, SUM(nilai) AS total FROM data_sp2d_potongan GROUP BY id_sp2d) pot2 ON s_claim.id = pot2.id_sp2d
    WHERE (s_belum.status_rekon IS NULL OR s_belum.status_rekon = '' OR s_belum.status_rekon = 'BELUM')
      AND COALESCE(s_belum.tanggal_pencairan, s_belum.tanggal)::DATE BETWEEN '2026-02-01' AND '2026-03-31'
    ORDER BY belum_tgl, belum_nomor
    LIMIT 30
  `;

  console.log(`Pasangan BELUM SP2D vs SP2D yang diklaim bank: ${pairs.length}\n`);
  pairs.forEach((p, i) => {
    const nomorSama = p.belum_nomor === p.claim_nomor;
    const mark = nomorSama ? '🔴 NOMOR SAMA (duplikat!)' : '🟡 nomor BEDA (coincidence nilai)';
    console.log(`[${i+1}] ${mark}`);
    console.log(`  BELUM : ${p.belum_nomor}`);
    console.log(`  CLAIM : ${p.claim_nomor} | status:${p.claim_status}`);
    console.log(`  Nilai : bank Rp ${fmtIDR(p.bs_debet)} | belum_neto Rp ${fmtIDR(p.belum_neto)} | claim_neto Rp ${fmtIDR(p.claim_neto)}`);
    console.log('');
  });

  // Hitung berapa BELUM yang nomor-nya sama persis dengan SP2D yang bank-linked
  const duplikat = pairs.filter(p => p.belum_nomor === p.claim_nomor);
  const kebetulan = pairs.filter(p => p.belum_nomor !== p.claim_nomor);
  console.log(`RINGKASAN:`);
  console.log(`  Nomor SAMA (duplikat sejati)  : ${duplikat.length}`);
  console.log(`  Nomor BEDA (nilai kebetulan sama): ${kebetulan.length}`);

  if (duplikat.length > 0) {
    console.log('\n  ✅ Duplikat dapat difix: mark BELUM sebagai SUDAH (sudah diklaim oleh record lain)');
  }
  if (kebetulan.length > 0) {
    console.log('\n  ⚠️  Bank statement TIDAK LENGKAP untuk SP2D ini — butuh import mutasi bank tambahan');
  }

  await prisma.$disconnect();
}
main().catch(async e => { console.error(e.message); await prisma.$disconnect(); });
