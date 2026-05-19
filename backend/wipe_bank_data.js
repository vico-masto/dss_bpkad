const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function wipeBankData() {
  console.log('⚠️  MEMULAI PENGHAPUSAN TOTAL DATA BANK & RESET REKONSILIASI... ⚠️');

  try {
    // 1. Hapus semua data di bank_statement
    const deleteBank = await prisma.bank_statement.deleteMany({});
    console.log(`✅ Berhasil menghapus ${deleteBank.count} data dari bank_statement.`);

    // 2. Reset status di data_sp2d
    const resetSp2d = await prisma.data_sp2d.updateMany({
      data: {
        status_rekon: 'BELUM',
        selisih_rekon: 0,
        keterangan_rekon: null
      }
    });
    console.log(`✅ Berhasil reset ${resetSp2d.count} data di data_sp2d.`);

    // 3. Reset status di data_sp2d_potongan
    const resetPotongan = await prisma.data_sp2d_potongan.updateMany({
      data: {
        status_rekon: 'BELUM'
      }
    });
    console.log(`✅ Berhasil reset ${resetPotongan.count} data di data_sp2d_potongan.`);

    // 4. Reset status di setoran_pajak
    const resetPajak = await prisma.setoran_pajak.updateMany({
      data: {
        status_rekon: 'BELUM'
      }
    });
    console.log(`✅ Berhasil reset ${resetPajak.count} data di setoran_pajak.`);

    // 5. Reset status di data_pendapatan
    const resetPendapatan = await prisma.data_pendapatan.updateMany({
      data: {
        status_rekon: 'BELUM'
      }
    });
    console.log(`✅ Berhasil reset ${resetPendapatan.count} data di data_pendapatan.`);

    console.log('\n✨ DATABASE BERSIH. Silakan upload ulang data bank Anda.');
  } catch (error) {
    console.error('❌ Terjadi kesalahan saat menghapus data:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

wipeBankData();
