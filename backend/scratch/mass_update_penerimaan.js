const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- MASS UPDATE PENERIMAAN START ---');
  
  // 1. Ambil semua data pendapatan
  const allData = await prisma.data_pendapatan.findMany({
    orderBy: { tanggal: 'asc' }
  });
  
  console.log(`Ditemukan ${allData.length} data untuk diproses.`);
  
  const collisionMap = new Map();
  let updatedCount = 0;
  
  // 2. Loop dan siapkan update
  for (const item of allData) {
    if (!item.uraian) continue;
    
    // Potong 30 karakter
    let newBukti = String(item.uraian).substring(0, 30).trim();
    const dateStr = item.tanggal.toISOString().split('T')[0];
    const key = `${dateStr}_${newBukti}`;
    
    // Handle Collision (Tanggal + Bukti harus unik)
    if (collisionMap.has(key)) {
      const count = collisionMap.get(key) + 1;
      collisionMap.set(key, count);
      // Tambahkan suffix (max 30 char total)
      const suffix = `_${count}`;
      newBukti = newBukti.substring(0, 30 - suffix.length) + suffix;
    } else {
      collisionMap.set(key, 0);
    }
    
    // Update ke database
    await prisma.data_pendapatan.update({
      where: { id: item.id },
      data: { nomor_bukti: newBukti }
    });
    
    updatedCount++;
    if (updatedCount % 100 === 0) console.log(`Berhasil memproses ${updatedCount} data...`);
  }
  
  console.log(`--- SELESAI! Total ${updatedCount} data berhasil diperbarui. ---`);
}

main()
  .catch(e => {
    console.error('ERROR SAAT MASS UPDATE:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
