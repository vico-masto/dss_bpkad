/**
 * fix_april_bruto_sp2ds.js
 * Perbaikan sekali-jalan: 5 SP2D April 2026 yang salah status 'SUDAH' (neto)
 * padahal bank membayar nilai BRUTO penuh → ubah ke 'SUDAH_BRUTO'.
 *
 * Jalankan: node backend/scratch/fix_april_bruto_sp2ds.js
 */
const prisma = require('../prismaClient');

const TARGET_NOMOR = [
  '81.07/04.0/000020/LS/1.03.0.00.0.00.01.0000/M/4/2026',
  '81.07/04.0/000023/LS/2.11.0.00.0.00.01.0000/M/4/2026',
  '81.07/04.0/000024/LS/2.11.0.00.0.00.01.0000/M/4/2026',
  '81.07/04.0/000025/LS/2.11.0.00.0.00.01.0000/M/4/2026',
  '81.07/04.0/000026/LS/2.11.0.00.0.00.01.0000/M/4/2026',
];

// Jenis potongan yang TIDAK dicakup oleh bruto match bank
// (dibayar terpisah oleh pegawai/vendor, bukan oleh BPKAD via bank)
const NON_BANK_POTONGAN = ['Taperum', 'BULOG', 'Zakat', 'LAINNYA'];

async function main() {
  console.log('=== Fix April 2026 SUDAH→SUDAH_BRUTO ===\n');

  // 1. Ambil data SP2D target
  const sp2dList = await prisma.data_sp2d.findMany({
    where: { nomor: { in: TARGET_NOMOR } },
    include: {
      potongan: {
        select: { id: true, jenis_potongan: true, nilai: true, status_rekon: true },
      },
    },
    orderBy: { nomor: 'asc' },
  });

  if (sp2dList.length === 0) {
    console.log('Tidak ada SP2D yang ditemukan. Periksa nomor SP2D di array TARGET_NOMOR.');
    return;
  }

  console.log(`Ditemukan ${sp2dList.length} SP2D target:\n`);
  for (const s of sp2dList) {
    console.log(`  [${s.status_rekon || 'null'}] ${s.nomor} — Bruto: Rp ${Number(s.nilai_bruto).toLocaleString('id-ID')} | Potongan header: Rp ${Number(s.nilai_potongan || 0).toLocaleString('id-ID')}`);
    console.log(`         Rincian potongan: ${s.potongan.length} baris`);
  }

  const alreadyFixed = sp2dList.filter(s => s.status_rekon === 'SUDAH_BRUTO');
  if (alreadyFixed.length > 0) {
    console.log(`\nPeringatan: ${alreadyFixed.length} SP2D sudah SUDAH_BRUTO — akan di-skip.`);
  }

  const toFix = sp2dList.filter(s => s.status_rekon !== 'SUDAH_BRUTO');
  if (toFix.length === 0) {
    console.log('\nSemua SP2D sudah SUDAH_BRUTO. Tidak ada yang perlu diperbaiki.');
    return;
  }

  console.log(`\nAkan memperbaiki ${toFix.length} SP2D...\n`);

  let totalBruto = 0n;
  let potonganCascadeCount = 0;

  for (const sp2d of toFix) {
    console.log(`→ ${sp2d.nomor}`);

    // 1a. Update header SP2D
    await prisma.data_sp2d.update({
      where: { id: sp2d.id },
      data: {
        status_rekon: 'SUDAH_BRUTO',
        keterangan_rekon: '[PENYESUAIAN BRUTO] SUDAH_BRUTO: Pencairan dibayar bank senilai bruto penuh — potongan bukan tanggungan BPKAD (vendor bayar sendiri). (bulk fix 2026-05-20)',
      },
    });

    totalBruto += BigInt(Math.round(Number(sp2d.nilai_bruto)));

    // 1b. Cascade ke child potongan (kecuali non-bank)
    const bankPotongan = sp2d.potongan.filter(
      p => !NON_BANK_POTONGAN.includes(p.jenis_potongan) && p.status_rekon !== 'SUDAH'
    );

    if (bankPotongan.length > 0) {
      const ids = bankPotongan.map(p => p.id);
      const updated = await prisma.data_sp2d_potongan.updateMany({
        where: {
          id: { in: ids },
          OR: [{ status_rekon: 'BELUM' }, { status_rekon: null }],
        },
        data: {
          status_rekon: 'SUDAH_BRUTO',
          keterangan_rekon: 'Tercakup dalam bruto match SP2D induk (bulk fix)',
        },
      });
      console.log(`   └ cascade potongan: ${updated.count} baris → SUDAH_BRUTO`);
      potonganCascadeCount += updated.count;
    } else {
      console.log(`   └ tidak ada rincian potongan bank untuk di-cascade`);
    }
  }

  console.log('\n=== SELESAI ===');
  console.log(`SP2D diupdate: ${toFix.length}`);
  console.log(`Rincian potongan di-cascade: ${potonganCascadeCount}`);
  console.log(`\nEfek pada BKU: selisih neto→bruto seharusnya hilang.`);
  console.log(`Jalankan node backend/diagnose_selisih_bku.js untuk verifikasi.\n`);
}

main()
  .catch(e => { console.error('ERROR:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
