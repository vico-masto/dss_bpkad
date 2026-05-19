/**
 * fix_potongan_date_sync.js
 * Sinkronisasi data_sp2d_potongan.tanggal_pencairan dengan SP2D induk.
 *
 * Penyebab masalah: Saat SP2D dikoreksi tanggal_pencairan-nya, cascade
 * di updateSp2d hanya memperbarui potongan dengan tanggal NULL — tidak
 * memperbarui potongan yang memiliki tanggal lama (hasil sinkronisasi
 * dari SP2D saat input). Akibatnya, potongan rincian (IU1%, PPh21, JKK, dll)
 * masih memakai tanggal lama sehingga jendela H+7 di magic-match gagal.
 *
 * Jalankan: node fix_potongan_date_sync.js
 */
const prisma = require('./prismaClient');

async function main() {
  console.log('=== Fix: Sinkronisasi tanggal_pencairan data_sp2d_potongan ===\n');

  // 1. Tampilkan record yang akan diubah terlebih dahulu (dry-run)
  const preview = await prisma.$queryRaw`
    SELECT
      p.id,
      p.nomor_sp2d,
      p.jenis_potongan,
      p.nilai,
      p.tanggal_pencairan AS tgl_potongan,
      s.tanggal_pencairan AS tgl_sp2d_seharusnya
    FROM data_sp2d_potongan p
    JOIN data_sp2d s ON p.id_sp2d = s.id
    WHERE s.tanggal_pencairan IS NOT NULL
      AND p.tanggal_pencairan IS NOT NULL
      AND p.tanggal_pencairan::date != s.tanggal_pencairan::date
      AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
    ORDER BY p.tanggal_pencairan
  `;

  if (preview.length === 0) {
    console.log('[OK] Tidak ada data_sp2d_potongan yang perlu dikoreksi.');
  } else {
    console.log(`[!] Ditemukan ${preview.length} record yang tanggal_pencairan-nya tidak sinkron:\n`);
    preview.forEach(r => {
      console.log(
        `  Nomor SP2D : ${r.nomor_sp2d}\n` +
        `  Jenis      : ${r.jenis_potongan}\n` +
        `  Nilai      : Rp ${Number(r.nilai).toLocaleString('id-ID')}\n` +
        `  Tanggal Skrg: ${r.tgl_potongan ? String(r.tgl_potongan).split('T')[0] : '-'}\n` +
        `  Seharusnya : ${r.tgl_sp2d_seharusnya ? String(r.tgl_sp2d_seharusnya).split('T')[0] : '-'}\n`
      );
    });

    // 2. Jalankan update
    const count = await prisma.$executeRaw`
      UPDATE data_sp2d_potongan p
      SET tanggal_pencairan = s.tanggal_pencairan
      FROM data_sp2d s
      WHERE p.id_sp2d = s.id
        AND s.tanggal_pencairan IS NOT NULL
        AND p.tanggal_pencairan IS NOT NULL
        AND p.tanggal_pencairan::date != s.tanggal_pencairan::date
        AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
    `;
    console.log(`\n[OK] ${count} record berhasil diperbarui.`);
  }

  // 3. Periksa setoran_pajak yang mungkin perlu perhatian
  console.log('\n--- Cek setoran_pajak ---');
  const sjkMismatch = await prisma.$queryRaw`
    SELECT id, nomor_bukti, uraian, nilai, tanggal, tanggal_pencairan
    FROM setoran_pajak
    WHERE tanggal_pencairan IS NOT NULL
      AND tanggal_pencairan::date != tanggal::date
      AND (status_rekon IS NULL OR status_rekon NOT LIKE '%SUDAH%')
    ORDER BY tanggal DESC
  `;

  if (sjkMismatch.length === 0) {
    console.log('[OK] Tidak ada setoran_pajak dengan tanggal vs tanggal_pencairan berbeda.\n');
  } else {
    console.log(`[!] ${sjkMismatch.length} setoran_pajak memiliki tanggal_pencairan berbeda dari tanggal billing:`);
    console.log('    (Matching sudah menggunakan COALESCE(tanggal_pencairan, tanggal) — data ini akan dicocokkan dengan benar.)\n');
    sjkMismatch.forEach(r => {
      console.log(
        `  NTPN: ${r.nomor_bukti} | Rp ${Number(r.nilai).toLocaleString('id-ID')}\n` +
        `  Tanggal Billing: ${String(r.tanggal).split('T')[0]}  |  Tanggal Cair: ${String(r.tanggal_pencairan).split('T')[0]}\n`
      );
    });
  }

  await prisma.$disconnect();
  console.log('=== Selesai. Jalankan ulang Magic Match untuk mencocokkan transaksi. ===');
}

main().catch(e => {
  console.error('[ERROR]', e.message);
  prisma.$disconnect();
  process.exit(1);
});
