/**
 * Link SiLPA bank_statement → saldo_awal SA-2026-SD-SILPA
 * SiLPA = Sisa Saldo Tahun Sebelumnya = Saldo Awal tahun berjalan
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }

async function main() {
  const silpa = await prisma.bank_statement.findFirst({
    where: { nomor_bukti: 'SiLPA', is_matched: false }
  });

  if (!silpa) {
    console.log('SiLPA sudah matched atau tidak ditemukan.');
    await prisma.$disconnect();
    return;
  }

  const saId = 'SA-2026-SD-SILPA';
  const sa = await prisma.saldo_awal.findUnique({ where: { id: saId } });
  if (!sa) {
    console.log('saldo_awal ' + saId + ' tidak ditemukan.');
    await prisma.$disconnect();
    return;
  }

  const diff = Math.abs(Number(silpa.kredit) - Number(sa.nilai));
  console.log('SiLPA bank : Rp ' + fmtIDR(silpa.kredit));
  console.log('Saldo Awal : Rp ' + fmtIDR(sa.nilai));
  console.log('Selisih    : Rp ' + fmtIDR(diff));

  if (diff > 1) {
    console.log('❌ ABORT — selisih terlalu besar, tidak aman untuk di-link otomatis.');
    await prisma.$disconnect();
    return;
  }

  await prisma.bank_statement.update({
    where: { id: silpa.id },
    data: {
      is_matched: true,
      ref_bku_id: saId,
      match_type: 'SALDO_AWAL',
      selisih_nilai: 0,
      catatan_selisih: null
    }
  });

  console.log('\n✅ SiLPA (bank id:' + silpa.id + ') → linked ke saldo_awal ' + saId);
  console.log('   match_type = SALDO_AWAL | selisih = 0\n');

  // Verifikasi
  const sisaUnmatch = await prisma.bank_statement.count({ where: { is_matched: false, kredit: { gt: 0 } } });
  console.log('Sisa bank kredit unmatched (termasuk SiLPA): ' + sisaUnmatch);

  await prisma.$disconnect();
}

main().catch(async e => { console.error('FATAL:', e.message); await prisma.$disconnect(); process.exit(1); });
