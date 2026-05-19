/**
 * fix_cascade_bruto.js — One-time migration
 *
 * Mengupdate data_sp2d_potongan yang statusnya masih BELUM padahal SP2D induknya
 * sudah SUDAH_BRUTO. Ini akibat bug cascade yang sudah diperbaiki di bulkMatchSmart.
 *
 * Jalankan sekali: node fix_cascade_bruto.js
 */
const prisma = require('./prismaClient');

const NON_BANK_TYPES = ['Taperum', 'BULOG', 'Zakat', 'LAINNYA'];

async function main() {
  console.log('=== fix_cascade_bruto.js ===');
  console.log('Mencari data_sp2d_potongan yang perlu di-cascade...\n');

  // Verifikasi dulu: berapa yang akan diupdate
  const preview = await prisma.$queryRaw`
    SELECT COUNT(*)::int as jumlah, SUM(CAST(p.nilai AS DECIMAL)) as total_nilai
    FROM data_sp2d_potongan p
    JOIN data_sp2d h ON p.id_sp2d = h.id
    WHERE h.status_rekon = 'SUDAH_BRUTO'
      AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL)
      AND (p.jenis_potongan IS NULL OR p.jenis_potongan NOT IN ('Taperum', 'BULOG', 'Zakat', 'LAINNYA'))
  `;

  const { jumlah, total_nilai } = preview[0];
  console.log(`Akan diupdate: ${jumlah} records, total nilai Rp ${Number(total_nilai || 0).toLocaleString('id-ID')}`);

  if (jumlah === 0) {
    console.log('Tidak ada yang perlu diupdate. Script selesai.');
    await prisma.$disconnect();
    return;
  }

  const confirm = process.argv[2];
  if (confirm !== '--run') {
    console.log('\nJalankan dengan flag --run untuk mengeksekusi:');
    console.log('  node fix_cascade_bruto.js --run');
    await prisma.$disconnect();
    return;
  }

  console.log('\nMengeksekusi bulk update...');

  // Ambil semua id_sp2d yang SUDAH_BRUTO
  const sudahBrutoSp2d = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'SUDAH_BRUTO' },
    select: { id: true, nomor: true }
  });

  console.log(`Ditemukan ${sudahBrutoSp2d.length} SP2D dengan status SUDAH_BRUTO`);

  let updated = 0;
  for (const sp2d of sudahBrutoSp2d) {
    const result = await prisma.data_sp2d_potongan.updateMany({
      where: {
        id_sp2d: sp2d.id,
        status_rekon: { in: ['BELUM', null] },
        NOT: { jenis_potongan: { in: NON_BANK_TYPES } }
      },
      data: {
        status_rekon: 'SUDAH_BRUTO',
        keterangan_rekon: 'Tercakup dalam bruto match SP2D induk (bulk fix)'
      }
    });
    if (result.count > 0) {
      updated += result.count;
      console.log(`  SP2D ${sp2d.nomor}: +${result.count} potongan di-cascade`);
    }
  }

  console.log(`\nSelesai. Total ${updated} records diupdate ke SUDAH_BRUTO.`);
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
