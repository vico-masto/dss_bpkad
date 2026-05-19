const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("--- DAFTAR TRANSAKSI BANK DENGAN NILAI DESIMAL (BELUM COCOK) ---");

  // Cari transaksi yang belum match dan memiliki nilai desimal
  // Kita cek debet dan kredit
  const unmatchedDecimals = await prisma.$queryRaw`
    SELECT id, tanggal, deskripsi, debet, kredit 
    FROM bank_statement 
    WHERE is_matched = false 
      AND (
        (debet - FLOOR(debet)) > 0 OR 
        (kredit - FLOOR(kredit)) > 0
      )
    ORDER BY tanggal ASC
  `;

  if (unmatchedDecimals.length === 0) {
    console.log("Tidak ditemukan transaksi desimal yang belum cocok.");
  } else {
    unmatchedDecimals.forEach(item => {
      const val = Number(item.debet) > 0 ? Number(item.debet) : Number(item.kredit);
      const type = Number(item.debet) > 0 ? "DEBET (KLR)" : "KREDIT (MSK)";
      console.log(`[ID: ${item.id}] Tgl: ${item.tanggal.toISOString().split('T')[0]} | ${type} | Nilai: ${val.toLocaleString('id-ID', { minimumFractionDigits: 1 })} | Desc: ${item.deskripsi}`);
    });
  }

  console.log("\n--- RINGKASAN ---");
  console.log(`Total item desimal belum cocok: ${unmatchedDecimals.length}`);
}

run().finally(() => prisma.$disconnect());
