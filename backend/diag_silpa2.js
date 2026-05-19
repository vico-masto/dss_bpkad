const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
function fmtIDR(n) { return Number(n || 0).toLocaleString('id-ID', { minimumFractionDigits: 2 }); }

async function main() {
  const silpa = await prisma.bank_statement.findFirst({
    where: { nomor_bukti: 'SiLPA' }
  });
  console.log('SiLPA bank: id=' + silpa.id + ' | tanggal=' + new Date(silpa.tanggal).toISOString().split('T')[0] + ' | kredit=Rp ' + fmtIDR(silpa.kredit) + ' | matched=' + silpa.is_matched);

  const sa = await prisma.$queryRaw`
    SELECT sa.id, sa.tahun, CAST(sa.nilai AS DECIMAL) AS nilai, sa.keterangan, msd.nama
    FROM saldo_awal sa
    LEFT JOIN master_sumber_dana msd ON sa.id_sumber_dana = msd.id
    ORDER BY sa.tahun
  `;
  console.log('\nsaldo_awal:');
  sa.forEach(r => console.log('  id:' + r.id + ' | tahun:' + r.tahun + ' | Rp ' + fmtIDR(r.nilai) + ' | sumber:' + (r.nama || '-') + ' | ket:' + (r.keterangan || '-')));

  const total = sa.reduce((s, r) => s + Number(r.nilai || 0), 0);
  const silpaVal = Number(silpa.kredit);
  console.log('\nTOTAL saldo_awal : Rp ' + fmtIDR(total));
  console.log('SiLPA bank kredit: Rp ' + fmtIDR(silpaVal));
  console.log('Selisih          : Rp ' + fmtIDR(Math.abs(total - silpaVal)));
  if (Math.abs(total - silpaVal) < 1000) console.log('✅ COCOK — SiLPA = total saldo_awal');
  else console.log('⚠️  Tidak cocok persis');

  await prisma.$disconnect();
}
main().catch(async e => { console.error(e.message); await prisma.$disconnect(); });
