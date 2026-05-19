const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Memulai proses reset total data rekonsiliasi...");

  // 1. Reset Bank Statement
  const resetBank = await prisma.bank_statement.updateMany({
    data: {
      is_matched: false,
      ref_bku_id: null
    }
  });
  console.log(`Berhasil mereset ${resetBank.count} data Rekening Koran.`);

  // 2. Reset status_rekon di data_sp2d
  const resetSp2d = await prisma.data_sp2d.updateMany({
    where: {
      status_rekon: 'SUDAH'
    },
    data: {
      status_rekon: 'BELUM'
    }
  });
  console.log(`Berhasil mereset ${resetSp2d.count} data SP2D menjadi 'BELUM'.`);

  console.log("Proses reset selesai. Semua data siap dicocokkan kembali.");
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
