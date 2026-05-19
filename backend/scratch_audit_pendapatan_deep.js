const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runDeepPendapatanAudit() {
  console.log("=== DEEP AUDIT: ANOMALI DATA PENDAPATAN ===");

  const targetTahun = 2026;

  // Ambil 159 data pendapatan yang belum rekon
  const unmatchedPendapatan = await prisma.$queryRaw`
    SELECT p.id, p.nomor_bukti, p.tanggal, p.nilai, p.status_rekon, p.uraian
    FROM data_pendapatan p
    LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
    WHERE p.tahun = ${targetTahun} 
      AND b.id IS NULL 
      AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL OR p.status_rekon = '')
  `;
  console.log(`Menganalisis ${unmatchedPendapatan.length} data pendapatan anomali...\n`);

  let foundWiderDateMatch = 0;
  let foundDifferentValueMatch = 0;
  let absolutelyNoMatch = 0;

  for (const p of unmatchedPendapatan) {
    const tgl = new Date(p.tanggal);
    const exactVal = Number(p.nilai);
    
    // 1. Cek Jendela Waktu Lebar (±14 hari) dengan nilai sama persis
    const startWider = new Date(tgl.getTime() - 14 * 24 * 60 * 60 * 1000);
    const endWider = new Date(tgl.getTime() + 14 * 24 * 60 * 60 * 1000);
    
    const widerMatches = await prisma.bank_statement.findMany({
      where: {
        kredit: { gt: 0 },
        tanggal: { gte: startWider, lte: endWider }
      }
    });
    
    const exactValMatches = widerMatches.filter(b => Math.abs(Number(b.kredit) - exactVal) < 1);

    if (exactValMatches.length > 0) {
      foundWiderDateMatch++;
      continue;
    }

    // 2. Cek Selisih Nilai (beda < 5%) dalam jendela normal (±3 hari)
    const startNormal = new Date(tgl.getTime() - 3 * 24 * 60 * 60 * 1000);
    const endNormal = new Date(tgl.getTime() + 3 * 24 * 60 * 60 * 1000);

    const normalMatches = await prisma.bank_statement.findMany({
      where: {
        kredit: { gt: 0 },
        tanggal: { gte: startNormal, lte: endNormal }
      }
    });

    const closeValMatches = normalMatches.filter(b => {
      const diff = Math.abs(Number(b.kredit) - exactVal);
      const diffPercentage = diff / exactVal;
      return diffPercentage > 0 && diffPercentage < 0.05; // Ada selisih, tapi di bawah 5%
    });

    if (closeValMatches.length > 0) {
      foundDifferentValueMatch++;
      continue;
    }

    // 3. Jika tidak ketemu di atas
    absolutelyNoMatch++;
  }

  console.log("--- HASIL ANALISIS PENYEBAB ANOMALI ---");
  console.log(`1. Terlambat Setor ke Bank (Nilai cocok, tapi beda hari > 2 hari hingga 14 hari): ${foundWiderDateMatch} transaksi`);
  console.log(`2. Terdapat Selisih Nominal Setor (Beda nilai < 5% pada hari yang berdekatan): ${foundDifferentValueMatch} transaksi`);
  console.log(`3. BENAR-BENAR TIDAK ADA DI BANK (Fiktif/Belum disetor sama sekali): ${absolutelyNoMatch} transaksi`);

  await prisma.$disconnect();
}

runDeepPendapatanAudit();
