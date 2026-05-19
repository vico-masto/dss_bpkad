const prisma = require('./prismaClient');

async function auditPendapatan() {
  try {
    console.log("=== AUDIT PARSIAL PENDAPATAN ===");
    
    // 1. Find Bank Statements that are KREDIT (Penerimaan), NOT MATCHED
    const orphanBanks = await prisma.$queryRaw`
      SELECT id, tanggal, deskripsi, kredit 
      FROM bank_statement 
      WHERE is_matched = false AND kredit > 0 
      ORDER BY tanggal DESC 
      LIMIT 5
    `;

    if (orphanBanks.length === 0) {
      console.log("Semua mutasi penerimaan bank sudah cocok (Tidak ada orphan).");
      return;
    }

    console.log(`Menemukan ${orphanBanks.length} mutasi penerimaan bank yang belum cocok. Menganalisa penyebab...`);

    for (const bank of orphanBanks) {
      console.log(`\n------------------------------------------------`);
      console.log(`🏦 BANK #${bank.id} | Tgl: ${bank.tanggal.toISOString().split('T')[0]} | Kredit: Rp ${bank.kredit} | Desk: ${bank.deskripsi}`);
      
      const val = Number(bank.kredit);
      const bankDate = new Date(bank.tanggal);

      // Cari BKU Pendapatan dengan nilai yang sama persis (Zero Tolerance Nominal) tanpa filter waktu/status
      const bkuSameValue = await prisma.$queryRaw`
        SELECT id, tanggal, nomor_bukti, nilai, status_rekon 
        FROM data_pendapatan 
        WHERE ABS(CAST(nilai AS DECIMAL) - ${val}) < 1
      `;
      
      if (bkuSameValue.length === 0) {
        console.log(`   ❌ ALASAN: BKU Pendapatan senilai Rp ${val} memang BELUM DI-INPUT ke sistem oleh bendahara!`);
      } else {
        console.log(`   ✅ Ditemukan ${bkuSameValue.length} BKU Pendapatan dengan nilai sama. Mengecek status mereka...`);
        
        for (const bku of bkuSameValue) {
          console.log(`      -> BKU [${bku.nomor_bukti}] | Tgl: ${bku.tanggal.toISOString().split('T')[0]} | Status: ${bku.status_rekon || 'NULL'}`);
          
          // Check Date difference
          const bkuDate = new Date(bku.tanggal);
          const diffDays = Math.abs(bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24);
          if (diffDays > 1.05) {
             console.log(`         🚫 BLOKIR: Selisih tanggal > 1 hari (${diffDays.toFixed(1)} hari). Ini melanggar aturan Zero Tolerance H±1!`);
          }

          // Check if already matched
          const isMatched = String(bku.status_rekon).toUpperCase().includes('SUDAH');
          if (isMatched) {
             console.log(`         🚫 BLOKIR: Status BKU sudah 'SUDAH' (Sudah direkon dengan bank lain).`);
          }

          // Check if linked in bank_statement
          const linkedBank = await prisma.$queryRaw`
            SELECT id FROM bank_statement WHERE ref_bku_id = CAST(${bku.id} AS VARCHAR)
          `;
          if (linkedBank.length > 0) {
             console.log(`         🚫 BLOKIR: BKU ini masih terikat dengan Bank ID #${linkedBank[0].id} di database (Ghost Link)!`);
          }
        }
      }
    }
  } catch(e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

auditPendapatan();
