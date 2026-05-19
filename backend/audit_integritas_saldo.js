const prisma = require('./prismaClient');

async function checkIntegrity() {
  try {
    console.log("=== MEMULAI AUDIT INTEGRITAS & SALDO AKTUAL ===");

    // 1. Cek Integritas Potongan (getPotonganIntegrity logic)
    const mismatches = await prisma.$queryRaw`
      SELECT 
        s.nomor, 
        s.nilai_potongan, 
        COALESCE(p.total_rincian, 0) as total_rincian,
        ABS(s.nilai_potongan - COALESCE(p.total_rincian, 0)) as selisih
      FROM data_sp2d s
      LEFT JOIN (
        SELECT id_sp2d, SUM(nilai) as total_rincian 
        FROM data_sp2d_potongan 
        GROUP BY id_sp2d
      ) p ON s.id = p.id_sp2d
      WHERE ABS(s.nilai_potongan - COALESCE(p.total_rincian, 0)) > 1
      AND s.nilai_potongan > 0
    `;
    console.log(`\n[1] Modul Integritas Potongan (Mismatch > Rp 1): ${mismatches.length} kasus`);

    // 2. Cek Laporan Selisih (getDiscrepancyReport logic - Anomali Nominal Rekon)
    // Mencari data yang sudah direkon (SUDAH) tapi selisih_rekon != 0 atau ada di bank_statement
    const anomalyBank = await prisma.$queryRaw`
      SELECT id, selisih_nilai, catatan_selisih 
      FROM bank_statement 
      WHERE is_matched = true AND ABS(selisih_nilai) > 1
    `;
    console.log(`\n[2] Modul Laporan Selisih (Mutasi Bank matched dgn selisih > Rp 1): ${anomalyBank.length} kasus`);

    // 3. Cek BKU Ganda (The 107 cases we found earlier - are they still there?)
    const dupBank = await prisma.$queryRaw`
      SELECT ref_bku_id, COUNT(*) as count 
      FROM bank_statement 
      WHERE is_matched = true AND ref_bku_id IS NOT NULL AND TRIM(ref_bku_id) != ''
      GROUP BY ref_bku_id 
      HAVING COUNT(*) > 1
    `;
    console.log(`\n[3] BKU ID Ganda (Poligami Data): ${dupBank.length} kasus`);

    // 4. Saldo Kas BKU vs Bank (Tahun 2026 berjalan)
    const saldoBku = await prisma.$queryRaw`
      SELECT 
        SUM(CASE WHEN tipe = 'KELUAR' THEN nilai ELSE 0 END) as total_keluar,
        SUM(CASE WHEN tipe = 'MASUK' THEN nilai ELSE 0 END) as total_masuk
      FROM (
        SELECT (nilai_bruto - COALESCE(pot.total, 0)) as nilai, 'KELUAR' as tipe
        FROM data_sp2d s
        LEFT JOIN (SELECT id_sp2d, SUM(nilai) as total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
        WHERE EXTRACT(YEAR FROM COALESCE(s.tanggal_pencairan, s.tanggal)) = 2026
        UNION ALL
        SELECT nilai, 'KELUAR' as tipe FROM data_sp2d_potongan p 
        LEFT JOIN data_sp2d s ON p.id_sp2d = s.id 
        WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = 2026
        UNION ALL
        SELECT nilai, 'MASUK' as tipe FROM data_pendapatan WHERE EXTRACT(YEAR FROM tanggal) = 2026
        UNION ALL
        SELECT s.nilai, 'KELUAR' as tipe FROM setoran_pajak s 
        WHERE EXTRACT(YEAR FROM tanggal) = 2026 AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
      ) as global_bku
    `;

    const saldoBank = await prisma.bank_statement.aggregate({
      where: {
        tanggal: {
          gte: new Date('2026-01-01T00:00:00.000Z'),
          lte: new Date('2026-12-31T23:59:59.999Z')
        }
      },
      _sum: { debet: true, kredit: true }
    });

    const bkuIn = Number(saldoBku[0].total_masuk || 0);
    const bkuOut = Number(saldoBku[0].total_keluar || 0);
    const bkuNet = bkuIn - bkuOut;
    
    const bankIn = Number(saldoBank._sum.kredit || 0);
    const bankOut = Number(saldoBank._sum.debet || 0);
    const bankNet = bankIn - bankOut;
    const diffNet = Math.abs(bkuNet - bankNet);

    console.log(`\n[4] Komparasi Saldo Kas (Tahun 2026):`);
    console.log(` - BKU  Netto : Rp ${bkuNet}`);
    console.log(` - Bank Netto : Rp ${bankNet}`);
    console.log(` - SELISIH    : Rp ${diffNet}`);

    console.log("\n=== SELESAI ===");
  } catch (e) {
    console.error("Error:", e);
  } finally {
    await prisma.$disconnect();
  }
}

checkIntegrity();
