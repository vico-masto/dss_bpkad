const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- RE-UPDATE PENERIMAAN (STRATEGI DUA TAHAP) START ---');
  
  const allData = await prisma.data_pendapatan.findMany({
    orderBy: { tanggal: 'asc' }
  });
  
  console.log(`Ditemukan ${allData.length} data. Memulai Tahap 1: Reset Ke ID Unik...`);
  
  // TAHAP 1: Reset biar gak tabrakan
  for (let i = 0; i < allData.length; i++) {
    const item = allData[i];
    await prisma.data_pendapatan.update({
      where: { id: item.id },
      data: { nomor_bukti: `TEMP_${item.id.substring(0, 20)}` }
    });
    if ((i + 1) % 200 === 0) console.log(`Reset ${i + 1} data...`);
  }

  console.log('Tahap 1 Selesai. Memulai Tahap 2: Isi Versi Lengkap...');

  const collisionMap = new Map();
  let updatedCount = 0;
  
  for (const item of allData) {
    if (!item.uraian) continue;
    
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
    if (updatedCount % 200 === 0) console.log(`Update ${updatedCount} data ke versi lengkap...`);
  }
  
  console.log(`--- SELESAI TOTAL! ${updatedCount} data sudah versi LENGKAP. ---`);
}

main()
  .catch(e => {
    console.error('ERROR KRITIS:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
