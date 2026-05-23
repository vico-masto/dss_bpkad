const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`UPDATE data_sp2d SET keterangan_rekon = 'Catatan Admin: ' || keterangan_rekon WHERE keterangan_rekon IS NOT NULL AND keterangan_rekon NOT LIKE 'Catatan Admin:%' AND keterangan_rekon NOT LIKE 'Auto-Matched%' AND keterangan_rekon NOT LIKE 'Matched by Ref%' AND keterangan_rekon != 'Bulk Match' AND keterangan_rekon NOT LIKE 'Smart Match%'`);
  await prisma.$executeRawUnsafe(`UPDATE data_sp2d_potongan SET keterangan_rekon = 'Catatan Admin: ' || keterangan_rekon WHERE keterangan_rekon IS NOT NULL AND keterangan_rekon NOT LIKE 'Catatan Admin:%' AND keterangan_rekon NOT LIKE 'Auto-Matched%' AND keterangan_rekon NOT LIKE 'Matched by Ref%' AND keterangan_rekon != 'Bulk Match' AND keterangan_rekon NOT LIKE 'Smart Match%'`);
  await prisma.$executeRawUnsafe(`UPDATE data_pendapatan SET keterangan_rekon = 'Catatan Admin: ' || keterangan_rekon WHERE keterangan_rekon IS NOT NULL AND keterangan_rekon NOT LIKE 'Catatan Admin:%' AND keterangan_rekon NOT LIKE 'Auto-Matched%' AND keterangan_rekon NOT LIKE 'Matched by Ref%' AND keterangan_rekon != 'Bulk Match' AND keterangan_rekon NOT LIKE 'Smart Match%'`);
  console.log("Fixed DB");
}

main().finally(() => process.exit(0));
