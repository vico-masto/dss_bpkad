const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const sisa = await prisma.bank_statement.findMany({
    where: { is_matched: false, kredit: { gt: 0 } },
    select: { id: true, tanggal: true, deskripsi: true, kredit: true, nomor_bukti: true },
    orderBy: { tanggal: 'asc' }
  });
  console.log('Sisa bank kredit belum cocok:', sisa.length);
  sisa.forEach((b, i) => {
    const tgl = b.tanggal ? new Date(b.tanggal).toISOString().split('T')[0] : '-';
    const nb = String(b.nomor_bukti || '-');
    const desc = String(b.deskripsi || '-').substring(0, 50);
    const val = Number(b.kredit).toLocaleString('id-ID', { minimumFractionDigits: 2 });
    console.log(String(i + 1).padStart(3) + ' | ' + tgl + ' | Rp ' + val.padStart(22) + ' | nb:' + nb.padEnd(20) + ' | ' + desc);
  });
  const pBelum = await prisma.data_pendapatan.count({
    where: { OR: [{ status_rekon: 'BELUM' }, { status_rekon: null }, { status_rekon: '' }] }
  });
  console.log('\nSisa data_pendapatan BELUM:', pBelum);
}
main().catch(e => console.error(e)).finally(() => prisma.$disconnect());
