const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function recoverPendapatan() {
  console.log("=== MEMULAI SCRIPT RECOVERY PENDAPATAN (KATEGORI A: SELISIH NOMINAL) ===");

  const targetTahun = 2026;

  // Ambil data pendapatan yang belum rekon (murni anomali)
  const unmatchedPendapatan = await prisma.$queryRaw`
    SELECT p.id, p.nomor_bukti, p.tanggal, p.nilai, p.status_rekon, p.uraian
    FROM data_pendapatan p
    LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
    WHERE p.tahun = ${targetTahun} 
      AND b.id IS NULL 
      AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL OR p.status_rekon = '')
  `;

  console.log(`Mengevaluasi ${unmatchedPendapatan.length} transaksi anomali penerimaan...\n`);

  let recoveredCount = 0;

  for (const p of unmatchedPendapatan) {
    const tgl = new Date(p.tanggal);
    const bkuVal = Number(p.nilai);
    
    // Jendela waktu normal ±3 hari
    const startNormal = new Date(tgl.getTime() - 3 * 24 * 60 * 60 * 1000);
    const endNormal = new Date(tgl.getTime() + 3 * 24 * 60 * 60 * 1000);

    // Cari bank statement KREDIT yang belum di-match di rentang waktu tersebut
    const normalMatches = await prisma.bank_statement.findMany({
      where: {
        kredit: { gt: 0 },
        is_matched: false, // Hanya ambil yang masih menganggur (Unidentified Bank)
        tanggal: { gte: startNormal, lte: endNormal }
      }
    });

    // Saring kandidat dengan selisih di bawah 5%
    const validCandidates = normalMatches.filter(b => {
      const diff = Math.abs(Number(b.kredit) - bkuVal);
      const diffPercentage = diff / bkuVal;
      return diffPercentage > 0 && diffPercentage < 0.05; 
    });

    if (validCandidates.length > 0) {
      // Jika ada lebih dari 1 kandidat, pilih yang selisihnya paling kecil
      validCandidates.sort((a, b) => Math.abs(Number(a.kredit) - bkuVal) - Math.abs(Number(b.kredit) - bkuVal));
      
      const bestMatch = validCandidates[0];
      const bankVal = Number(bestMatch.kredit);
      const selisih = bankVal - bkuVal; // Positif berarti bank lebih besar, negatif berarti BKU lebih besar (bank admin fee)

      console.log(`------------------------------------------------------------`);
      console.log(`📝 PENCOCOKAN DITEMUKAN:`);
      console.log(`  BKU Pendapatan: ${p.nomor_bukti} | Rp ${bkuVal.toLocaleString('id-ID')} | Tgl: ${tgl.toISOString().split('T')[0]}`);
      console.log(`  Bank Statement: ID ${bestMatch.id} | Rp ${bankVal.toLocaleString('id-ID')} | Tgl: ${bestMatch.tanggal.toISOString().split('T')[0]}`);
      console.log(`  Selisih Nominal: Rp ${Math.abs(selisih).toLocaleString('id-ID')} (${((Math.abs(selisih)/bkuVal)*100).toFixed(2)}%) -> Dicatat sebagai penyesuaian`);

      // Eksekusi Update ke Database secara Atomik
      await prisma.$transaction([
        // Update Bank Statement
        prisma.bank_statement.update({
          where: { id: bestMatch.id },
          data: {
            is_matched: true,
            ref_bku_id: String(p.id),
            match_type: 'AUTO_RECOVERY_SEMI',
            selisih_nilai: selisih,
            catatan_selisih: `[AUTO-RECOVERY] Selisih Rp ${Math.abs(selisih).toLocaleString('id-ID')} (Pembulatan / Biaya Admin)`
          }
        }),
        // Update Data Pendapatan
        prisma.data_pendapatan.update({
          where: { id: p.id },
          data: {
            status_rekon: 'SUDAH',
            selisih_rekon: selisih,
            keterangan_rekon: `Auto-Recovered: Sinkronisasi dengan Bank ID ${bestMatch.id}. Selisih nilai diakui sebagai biaya admin/pembulatan.`
          }
        })
      ]);

      console.log(`  ✅ Sukses tersinkronisasi ke database.`);
      recoveredCount++;
    }
  }

  console.log(`\n============================================================`);
  console.log(`RECOVERY SELESAI. Berhasil memulihkan ${recoveredCount} transaksi anomali pendapatan.`);
  console.log(`============================================================`);

  await prisma.$disconnect();
}

recoverPendapatan();
