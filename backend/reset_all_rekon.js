const prisma = require('./prismaClient');

async function resetAllRekon() {
  console.log("=== MEMULAI PROSES HARD RESET SELURUH REKONSILIASI (FACTORY RESET) ===");
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Reset Mutasi Bank
      const bankResult = await tx.bank_statement.updateMany({
        where: { is_matched: true },
        data: {
          is_matched: false,
          ref_bku_id: null,
          match_type: null,
          selisih_nilai: 0,
          catatan_selisih: null
        }
      });
      console.log(`✅ Berhasil me-reset (Unlink) ${bankResult.count} data Mutasi Bank.`);

      // 2. Reset SP2D Induk
      const sp2dResult = await tx.data_sp2d.updateMany({
        where: { 
          status_rekon: { not: 'BELUM' }
        },
        data: { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null, tanggal_pencairan: null }
      });
      console.log(`✅ Berhasil me-reset status ${sp2dResult.count} data SP2D Induk.`);

      // 3. Reset Rincian Potongan
      const potonganResult = await tx.data_sp2d_potongan.updateMany({
        where: { 
          status_rekon: { not: 'BELUM' }
        },
        data: { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null, tanggal_pencairan: null }
      });
      console.log(`✅ Berhasil me-reset status ${potonganResult.count} data Rincian Potongan.`);

      // 4. Reset STS Pendapatan
      const pendapatanResult = await tx.data_pendapatan.updateMany({
        where: { 
          status_rekon: { not: 'BELUM' }
        },
        data: { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null, tanggal_pencairan: null }
      });
      console.log(`✅ Berhasil me-reset status ${pendapatanResult.count} data STS Pendapatan.`);

      // 5. Reset Setoran Pajak
      const pajakResult = await tx.setoran_pajak.updateMany({
        where: { 
          status_rekon: { not: 'BELUM' }
        },
        data: { status_rekon: 'BELUM', selisih_rekon: 0, keterangan_rekon: null, tanggal_pencairan: null }
      });
      console.log(`✅ Berhasil me-reset status ${pajakResult.count} data Setoran Pajak.`);
    }, {
      timeout: 30000 // Berikan waktu ekstra 30 detik untuk query massal
    });
    
    console.log("\n=== 🚀 HARD RESET SELESAI DENGAN SUKSES! SISTEM KEMBALI SEPERTI BARU ===");
  } catch(e) {
    console.error("❌ Gagal melakukan reset:", e);
  } finally {
    await prisma.$disconnect();
  }
}

resetAllRekon();
