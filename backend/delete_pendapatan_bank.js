const prisma = require('./prismaClient');

async function deleteData() {
  console.log("=== ⚠️ MEMULAI PENGHAPUSAN TOTAL DATA PENDAPATAN & REKENING KORAN ===");
  try {
    await prisma.$transaction(async (tx) => {
      // 1. Hapus semua isi tabel Rekening Koran (Mutasi Bank)
      const delBank = await tx.bank_statement.deleteMany({});
      console.log(`✅ Berhasil menghapus seluruh ${delBank.count} baris Mutasi Rekening Koran (bank_statement).`);

      // 2. Hapus semua isi tabel Pendapatan
      const delPendapatan = await tx.data_pendapatan.deleteMany({});
      console.log(`✅ Berhasil menghapus seluruh ${delPendapatan.count} baris Data Pendapatan (data_pendapatan).`);
    }, {
      timeout: 30000
    });
    
    console.log("\n=== 🧹 PEMBERSIHAN DATABASE SELESAI! TABEL KINI KOSONG. ===");
  } catch(e) {
    console.error("❌ Gagal melakukan penghapusan:", e);
  } finally {
    await prisma.$disconnect();
  }
}

deleteData();
