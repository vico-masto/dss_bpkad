const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }

async function main() {
  // SiLPA di bank_statement
  const silpa = await prisma.$queryRaw`
    SELECT id, tanggal, nomor_bukti, deskripsi,
           CAST(kredit AS DECIMAL) AS kredit,
           is_matched, ref_bku_id, match_type
    FROM bank_statement
    WHERE nomor_bukti = 'SiLPA'
  `;
  console.log('=== SiLPA di bank_statement ===');
  silpa.forEach(r => {
    const tgl = r.tanggal ? new Date(r.tanggal).toISOString().split('T')[0] : '-';
    console.log(`  id:${r.id} | ${tgl} | kredit: Rp ${fmtIDR(r.kredit)} | matched:${r.is_matched} | ref:${r.ref_bku_id||'NULL'} | desc:${r.deskripsi}`);
  });

  // saldo_awal
  const sa = await prisma.$queryRaw`
    SELECT sa.id, sa.tahun, sa.nilai::DECIMAL AS nilai, sa.keterangan, msd.nama_sumber_dana
    FROM saldo_awal sa
    LEFT JOIN master_sumber_dana msd ON sa.id_sumber_dana = msd.id
    ORDER BY sa.tahun, msd.nama_sumber_dana
  `;
  console.log('\n=== saldo_awal ===');
  sa.forEach(r => {
    console.log(`  id:${r.id} | tahun:${r.tahun} | Rp ${fmtIDR(r.nilai)} | sumber:${r.nama_sumber_dana||'-'} | ket:${r.keterangan||'-'}`);
  });

  const totalSA = sa.reduce((s, r) => s + Number(r.nilai || 0), 0);
  console.log(`\n  TOTAL saldo_awal: Rp ${fmtIDR(totalSA)}`);
  if (silpa.length > 0) {
    const silpaVal = Number(silpa[0].kredit);
    console.log(`  SiLPA bank     : Rp ${fmtIDR(silpaVal)}`);
    console.log(`  Selisih        : Rp ${fmtIDR(Math.abs(totalSA - silpaVal))}`);
    if (Math.abs(totalSA - silpaVal) < 1000) console.log('  ✅ COCOK!');
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); prisma.$disconnect(); });
