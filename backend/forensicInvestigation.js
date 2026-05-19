const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Memulai investigasi log aktivitas...");

  // 1. Cek Log Aktivitas terbaru
  const logs = await prisma.log_aktivitas.findMany({
    orderBy: { created_at: 'desc' },
    take: 10
  });
  console.log("\nLog Aktivitas Terbaru:");
  logs.forEach(l => {
    console.log(`[${l.created_at.toISOString()}] ${l.user_pelaksana}: ${l.aksi} - ${l.detail}`);
  });

  // 2. Cek status SP2D dan kapan tepatnya diupdate
  const sp2d = await prisma.data_sp2d.findUnique({
    where: { nomor: '81.07/04.0/000002/LS/2.15.0.00.0.00.01.0000/M/3/2026' }
  });
  console.log("\nStatus SP2D Target:");
  console.log(`- ID: ${sp2d.id}`);
  console.log(`- Status: ${sp2d.status_rekon}`);
  console.log(`- Updated At: ${sp2d.updated_at.toISOString()}`);

  // 3. Cari Bank Statement yang merujuk ke SP2D ini
  const bank = await prisma.bank_statement.findFirst({
    where: { ref_bku_id: sp2d.id }
  });
  
  if (bank) {
    console.log("\nBank Statement yang Terhubung:");
    console.log(`- ID: ${bank.id}`);
    console.log(`- Deskripsi: ${bank.deskripsi}`);
    console.log(`- Debet: ${bank.debet}`);
    console.log(`- Is Matched: ${bank.is_matched}`);
    console.log(`- Created At: ${bank.created_at.toISOString()}`);
  } else {
    console.log("\nTidak ada Bank Statement yang terhubung langsung di kolom ref_bku_id.");
  }
}

run().finally(() => prisma.$disconnect());
