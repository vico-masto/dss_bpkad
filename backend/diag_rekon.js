const prisma = require('./prismaClient');
async function check() {
  const bruto = await prisma.data_sp2d.count({ where: { status_rekon: 'SUDAH_BRUTO' } });
  console.log('SP2D SUDAH_BRUTO:', bruto);

  const statuses = await prisma.$queryRaw`SELECT status_rekon, COUNT(*)::int as jumlah FROM data_sp2d_potongan GROUP BY status_rekon ORDER BY jumlah DESC`;
  console.log('\nStatus data_sp2d_potongan:');
  statuses.forEach(r => console.log(' ', String(r.status_rekon ?? 'NULL'), ':', r.jumlah));

  const jenis = await prisma.$queryRaw`SELECT jenis_potongan, COUNT(*)::int as jumlah FROM data_sp2d_potongan GROUP BY jenis_potongan ORDER BY jumlah DESC LIMIT 15`;
  console.log('\nJenis potongan:');
  jenis.forEach(r => console.log(' ', String(r.jenis_potongan ?? 'NULL'), ':', r.jumlah));

  await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
