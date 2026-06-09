/**
 * Script: merge_taspen_mei2026.js
 * Tujuan: Gabungkan nilai Taspen ke Iuran Wajib Pegawai 8% (SP2D yang sama),
 *         lalu hapus semua record Taspen bulan Mei 2026.
 *
 * Filter berdasarkan kolom `uraian` (bukan jenis_potongan).
 *
 * Jalankan preview : node backend/merge_taspen_mei2026.js
 * Jalankan eksekusi: node backend/merge_taspen_mei2026.js --execute
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DRY_RUN = !process.argv.includes('--execute');

async function main() {
  console.log(DRY_RUN ? '=== DRY RUN (tidak ada perubahan) ===' : '=== EXECUTE MODE ===');
  console.log('');

  // 1. Ambil semua Taspen Mei 2026
  const taspenList = await prisma.$queryRaw`
    SELECT id, nomor_sp2d, nilai::numeric as nilai, tanggal_pencairan, uraian
    FROM data_sp2d_potongan
    WHERE uraian = 'Taspen'
      AND EXTRACT(MONTH FROM tanggal_pencairan) = 5
      AND EXTRACT(YEAR FROM tanggal_pencairan) = 2026
    ORDER BY nomor_sp2d
  `;

  console.log(`Ditemukan ${taspenList.length} record Taspen (uraian='Taspen') Mei 2026:`);
  console.log('');

  let totalMerged = 0, totalNoMatch = 0;
  const details = [];

  for (const taspen of taspenList) {
    const nilaiTaspen = Number(taspen.nilai);

    // Cari Iuran Wajib Pegawai 8% dengan nomor_sp2d yang sama
    const iuranWajib = await prisma.data_sp2d_potongan.findFirst({
      where: {
        nomor_sp2d: taspen.nomor_sp2d,
        uraian: 'Iuran Wajib Pegawai 8%',
      },
      orderBy: { created_at: 'asc' },
    });

    if (iuranWajib) {
      const nilaiLama = Number(iuranWajib.nilai);
      const nilaiBaru = nilaiLama + nilaiTaspen;
      details.push({
        nomor_sp2d: taspen.nomor_sp2d,
        action: 'MERGE',
        iuran_id: iuranWajib.id,
        nilai_iuran_lama: nilaiLama,
        nilai_taspen: nilaiTaspen,
        nilai_iuran_baru: nilaiBaru,
      });
      totalMerged++;
    } else {
      details.push({
        nomor_sp2d: taspen.nomor_sp2d,
        action: 'DELETE_ONLY',
        nilai_taspen: nilaiTaspen,
      });
      totalNoMatch++;
    }
  }

  // Tampilkan preview per baris
  for (const d of details) {
    if (d.action === 'MERGE') {
      console.log(`[MERGE]  ${d.nomor_sp2d}`);
      console.log(`         Iuran Wajib: Rp ${d.nilai_iuran_lama.toLocaleString('id')} + Taspen: Rp ${d.nilai_taspen.toLocaleString('id')} => Rp ${d.nilai_iuran_baru.toLocaleString('id')}`);
    } else {
      console.log(`[HAPUS]  ${d.nomor_sp2d} — Taspen: Rp ${d.nilai_taspen.toLocaleString('id')} (tidak ada Iuran Wajib 8%, langsung hapus)`);
    }
  }

  console.log('');
  console.log(`─────────────────────────────────────────────`);
  console.log(`Akan digabung  : ${totalMerged} record`);
  console.log(`Langsung hapus : ${totalNoMatch} record (tanpa pasangan)`);
  console.log(`Total dihapus  : ${taspenList.length} record Taspen`);

  if (DRY_RUN) {
    console.log('');
    console.log('Jalankan dengan --execute untuk benar-benar eksekusi.');
    return;
  }

  // 2. Eksekusi dalam satu transaksi
  console.log('');
  console.log('Memulai transaksi...');

  await prisma.$transaction(async (tx) => {
    for (const d of details) {
      if (d.action === 'MERGE') {
        await tx.data_sp2d_potongan.update({
          where: { id: d.iuran_id },
          data: { nilai: d.nilai_iuran_baru },
        });
      }
    }

    // Hapus semua Taspen Mei 2026
    const deleted = await tx.$executeRaw`
      DELETE FROM data_sp2d_potongan
      WHERE uraian = 'Taspen'
        AND EXTRACT(MONTH FROM tanggal_pencairan) = 5
        AND EXTRACT(YEAR FROM tanggal_pencairan) = 2026
    `;

    console.log(`Dihapus: ${deleted} record Taspen`);
  });

  console.log('Selesai. Semua perubahan berhasil disimpan.');
}

main()
  .catch((e) => { console.error('ERROR:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
