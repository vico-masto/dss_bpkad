const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- RE-UPDATE PENERIMAAN (STRATEGI NUKLIR) START ---');
  
  const allData = await prisma.data_pendapatan.findMany({
    orderBy: { tanggal: 'asc' }
  });
  
  console.log(`Ditemukan ${allData.length} data. Tahap 1: Reset Total...`);
  
  // TAHAP 1: Reset dengan nomor urut (i) untuk jaminan unik
  for (let i = 0; i < allData.length; i++) {
    const item = allData[i];
    try {
      await prisma.data_pendapatan.update({
        where: { id: item.id },
        data: { nomor_bukti: `RESET_${i}_${item.id.substring(0, 10)}` }
      });
    } catch (e) {
      // Jika masih gagal (sangat jarang), pakai ID full
      await prisma.data_pendapatan.update({
        where: { id: item.id },
        data: { nomor_bukti: `R_${item.id}` }
      });
    }
    if ((i + 1) % 200 === 0) console.log(`Reset ${i + 1} data...`);
  }

  console.log('Tahap 1 Selesai (Slate Clean). Tahap 2: Isi Versi LENGKAP...');

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
    if (updatedCount % 200 === 0) console.log(`Update ${updatedCount} data ke versi LENGKAP...`);
  }
  
  console.log(`--- SELESAI TOTAL! ${updatedCount} data sudah versi LENGKAP tanpa error. ---`);
}

main()
  .catch(e => {
    console.error('ERROR KRITIS:', e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
