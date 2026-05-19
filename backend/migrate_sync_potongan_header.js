/**
 * migrate_sync_potongan_header.js
 *
 * Sinkronisasi data_sp2d_potongan dari nilai_potongan header untuk SP2D existing.
 * Jalankan SEKALI setelah deploy fix di sp2dController.js.
 *
 * Cara jalan: node migrate_sync_potongan_header.js
 */

const prisma = require('./prismaClient');

async function main() {
  // Ambil semua SP2D yang punya nilai_potongan > 0 tapi BELUM punya record AUTO_HEADER
  const sp2dList = await prisma.$queryRaw`
    SELECT h.id, h.nomor, h.opd, h.nilai_potongan, h.jenis_potongan, h.tanggal_pencairan
    FROM data_sp2d h
    WHERE h.nilai_potongan > 0
      AND NOT EXISTS (
        SELECT 1 FROM data_sp2d_potongan p
        WHERE p.id_sp2d = h.id AND p.keterangan = 'AUTO_HEADER'
      )
  `;

  console.log(`Ditemukan ${sp2dList.length} SP2D yang perlu disinkronisasi.`);

  let berhasil = 0;
  let gagal = 0;

  for (const sp2d of sp2dList) {
    try {
      const nilaiPotongan = parseFloat(sp2d.nilai_potongan);
      if (nilaiPotongan <= 0) continue;

      // Cek lagi apakah sudah ada rincian manual (bukan AUTO_HEADER)
      // Jika sudah ada rincian manual, SUM mungkin sudah mencukupi — skip agar tidak dobel
      const sumRincian = await prisma.$queryRaw`
        SELECT COALESCE(SUM(nilai), 0) as total
        FROM data_sp2d_potongan
        WHERE id_sp2d = ${sp2d.id}
      `;
      const totalRincian = parseFloat(sumRincian[0]?.total || 0);

      // Jika total rincian sudah ≈ nilai_potongan header, skip
      if (Math.abs(totalRincian - nilaiPotongan) < 1) {
        console.log(`  SKIP ${sp2d.nomor} — rincian sudah sinkron (${totalRincian})`);
        continue;
      }

      await prisma.data_sp2d_potongan.create({
        data: {
          id_sp2d: sp2d.id,
          nomor_sp2d: sp2d.nomor,
          opd: sp2d.opd,
          jenis_potongan: sp2d.jenis_potongan || 'Potongan Pajak/Lainnya',
          nilai: nilaiPotongan,
          tanggal_pencairan: sp2d.tanggal_pencairan ? new Date(sp2d.tanggal_pencairan) : null,
          keterangan: 'AUTO_HEADER'
        }
      });

      console.log(`  OK  ${sp2d.nomor} — sinkron Rp ${nilaiPotongan.toLocaleString('id-ID')}`);
      berhasil++;
    } catch (err) {
      console.error(`  ERR ${sp2d.nomor}: ${err.message}`);
      gagal++;
    }
  }

  console.log(`\nSelesai. Berhasil: ${berhasil}, Gagal: ${gagal}, Dilewati: ${sp2dList.length - berhasil - gagal}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
