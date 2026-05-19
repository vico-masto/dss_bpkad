const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- RE-UPDATE PENERIMAAN (FULL VERSION) START ---');
  
  const allData = await prisma.data_pendapatan.findMany({
    orderBy: { tanggal: 'asc' }
  });
  
  console.log(`Ditemukan ${allData.length} data untuk diproses.`);
  
  const collisionMap = new Map();
  let updatedCount = 0;
  
  for (const item of allData) {
    if (!item.uraian) continue;
    
    // Pakai versi FULL (Limit 100 sesuai VarChar database)
    let newBukti = String(item.uraian).substring(0, 100).trim();
    const dateStr = item.tanggal.toISOString().split('T')[0];
    const key = `${dateStr}_${newBukti}`;
    
    if (collisionMap.has(key)) {
      const count = collisionMap.get(key) + 1;
      collisionMap.set(key, count);
      const suffix = `_${count}`;
      newBukti = newBukti.substring(0, 100 - suffix.length) + suffix;
    } else {
      collisionMap.set(key, 0);
    }
    
    await prisma.data_pendapatan.update({
      where: { id: item.id },
      data: { nomor_bukti: newBukti }
    });
    
    updatedCount++;
    if (updatedCount % 100 === 0) console.log(`Berhasil memproses ${updatedCount} data...`);
  }
  
  console.log(`--- SELESAI! Total ${updatedCount} data berhasil diperbarui ke versi lengkap. ---`);
}

main()
  .catch(e => {
    console.error('ERROR SAAT RE-UPDATE:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
