const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runRecovery() {
  console.log("=== MEMULAI SCRIPT PEMULIHAN DATA: DUPLICATE SP2D RECON ===");

  // 1. Cari semua ref_bku_id yang dirujuk oleh lebih dari 1 bank_statement
  const duplicates = await prisma.$queryRaw`
    SELECT ref_bku_id, COUNT(*)::int as jumlah
    FROM bank_statement
    WHERE ref_bku_id IS NOT NULL AND is_matched = true AND debet > 0
    GROUP BY ref_bku_id
    HAVING COUNT(*) > 1
  `;

  console.log(`Menemukan ${duplicates.length} BKU ID yang memiliki pencocokan ganda di bank_statement.\n`);

  let recoveredCount = 0;

  for (const dup of duplicates) {
    const bkuId = dup.ref_bku_id;
    console.log(`\n------------------------------------------------------------`);
    console.log(`Memproses BKU ID: ${bkuId} (Dicocokkan ganda sebanyak ${dup.jumlah} kali)`);

    // Ambil detail SP2D utama yang saat ini di-link ganda
    const mainSp2d = await prisma.data_sp2d.findUnique({ where: { id: bkuId } });
    if (!mainSp2d) {
      console.log(`  -> BKU ID ${bkuId} bukan data_sp2d (mungkin potongan/pendapatan/pajak). Melewati.`);
      continue;
    }

    console.log(`  SP2D Utama: ${mainSp2d.nomor} | Bruto: Rp ${Number(mainSp2d.nilai_bruto).toLocaleString('id-ID')} | status_rekon: ${mainSp2d.status_rekon}`);

    // Hitung neto SP2D utama
    const potRes = await prisma.data_sp2d_potongan.aggregate({
      where: { id_sp2d: bkuId },
      _sum: { nilai: true }
    });
    const pot = Number(potRes._sum.nilai || 0);
    const netoVal = Number(mainSp2d.nilai_bruto) - pot;
    console.log(`  Nilai Neto SP2D: Rp ${netoVal.toLocaleString('id-ID')}`);

    // Ambil semua bank_statement yang merujuk ke BKU ID ini
    const bankItems = await prisma.bank_statement.findMany({
      where: { ref_bku_id: bkuId, is_matched: true }
    });

    console.log(`  Bank Statements yang ter-link:`);
    bankItems.forEach(b => {
      console.log(`    - ID ${b.id} | Debet: Rp ${Number(b.debet).toLocaleString('id-ID')} | Tgl: ${b.tanggal.toISOString().split('T')[0]}`);
    });

    // Kita akan mempertahankan bank_statement pertama tetap ter-link ke mainSp2d.
    // Bank statements sisanya akan kita cari pasangannya yang masih BELUM cocok.
    const excessBanks = bankItems.slice(1);

    for (const b of excessBanks) {
      console.log(`  Mencari pasangan kosong untuk Bank Statement ID ${b.id} (Debet: Rp ${Number(b.debet).toLocaleString('id-ID')})...`);

      const tgl = b.tanggal;
      const startWindow = new Date(tgl.getTime() - 7 * 24 * 60 * 60 * 1000);
      const endWindow = new Date(tgl.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Cari kandidat SP2D yang masih BELUM cocok, memiliki nilai bruto/neto yang sama, dan berada di jendela ±7 hari
      const candidates = await prisma.data_sp2d.findMany({
        where: {
          status_rekon: 'BELUM',
          tanggal: { gte: startWindow, lte: endWindow }
        }
      });

      let matchedCandidate = null;

      for (const cand of candidates) {
        // Hitung neto kandidat
        const candPotRes = await prisma.data_sp2d_potongan.aggregate({
          where: { id_sp2d: cand.id },
          _sum: { nilai: true }
        });
        const candPot = Number(candPotRes._sum.nilai || 0);
        const candNeto = Number(cand.nilai_bruto) - candPot;

        if (Math.abs(candNeto - Number(b.debet)) < 1) {
          matchedCandidate = cand;
          matchedCandidate._neto = candNeto;
          break;
        }
      }

      if (matchedCandidate) {
        console.log(`    🎉 DITEMUKAN Kandidat Cocok: SP2D ID ${matchedCandidate.id} | Nomor: ${matchedCandidate.nomor} | Neto: Rp ${matchedCandidate._neto.toLocaleString('id-ID')}`);
        
        // Lakukan pemindahan link secara atomik dalam transaksi Prisma
        await prisma.$transaction([
          // Update Bank Statement: arahkan ref_bku_id ke kandidat baru
          prisma.bank_statement.update({
            where: { id: b.id },
            data: { ref_bku_id: String(matchedCandidate.id), match_type: 'SMART_AUTO' }
          }),
          // Update SP2D baru: ubah status rekon menjadi SUDAH
          prisma.data_sp2d.update({
            where: { id: matchedCandidate.id },
            data: {
              status_rekon: 'SUDAH',
              selisih_rekon: 0,
              keterangan_rekon: `Auto-Recovered: Matched to Bank ID ${b.id} @ ${b.tanggal.toISOString().split('T')[0]}`,
              tanggal_pencairan: b.tanggal
            }
          })
        ]);

        console.log(`    ✅ Sukses memperbarui database! Bank ID ${b.id} terhubung ke SP2D ${matchedCandidate.nomor}.`);
        recoveredCount++;
      } else {
        console.log(`    ❌ Tidak ditemukan kandidat SP2D yang cocok untuk Bank Statement ID ${b.id}.`);
      }
    }
  }

  console.log(`\n============================================================`);
  console.log(`PEMULIHAN SELESAI. Berhasil memulihkan ${recoveredCount} transaksi data rekonsiliasi.`);
  console.log(`============================================================`);

  await prisma.$disconnect();
}

runRecovery();
