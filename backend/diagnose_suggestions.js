/**
 * DIAGNOSTIK: Cek status BKU yang muncul di rekomendasi
 * Jalankan: node diagnose_suggestions.js
 */
const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function diagnose() {
  console.log('\n============================================');
  console.log(' DIAGNOSTIK REKOMENDASI - DSS BPKAD');
  console.log('============================================\n');

  try {
    // 1. Cek berapa SP2D POTONGAN yang masih BELUM dengan nilai sekitar 425
    const belumPotongan = await prisma.$queryRaw`
      SELECT 
        p.id, p.nomor_sp2d as bukti, p.nilai,
        p.status_rekon,
        COALESCE(p.tanggal_pencairan, s.tanggal) as tanggal,
        b.id as bank_ref_id,
        b.ref_bku_id
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      LEFT JOIN bank_statement b ON b.ref_bku_id = p.id::text
      WHERE ABS(CAST(p.nilai AS DECIMAL) - 425.94) < 1
         OR ABS(CAST(p.nilai AS DECIMAL) - 425.01) < 1
      ORDER BY p.id DESC
      LIMIT 20
    `;

    console.log('📋 SP2D POTONGAN dengan nilai ~425 (semua status):');
    console.log('ID       | Nilai     | Status       | Ada Link Bank?   | ref_bku_id');
    console.log('---------|-----------|--------------|------------------|----------');
    belumPotongan.forEach(r => {
      const hasBank = r.bank_ref_id ? `✅ Bank ID: ${r.bank_ref_id}` : '❌ TIDAK ADA';
      const status = String(r.status_rekon || 'NULL').padEnd(12);
      console.log(`${String(r.id).padEnd(8)} | ${String(r.nilai).padEnd(9)} | ${status} | ${hasBank.padEnd(16)} | ${r.ref_bku_id || '-'}`);
    });

    // 2. Cek berapa SP2D GELONDONGAN yang masih BELUM dengan nilai sekitar 425
    const belumSp2d = await prisma.$queryRaw`
      SELECT 
        h.id, h.nomor_sp2d as bukti, h.nilai_bruto,
        h.status_rekon,
        h.tanggal_pencairan,
        b.id as bank_ref_id,
        b.ref_bku_id
      FROM data_sp2d h
      LEFT JOIN bank_statement b ON b.ref_bku_id = h.id::text
      WHERE ABS(CAST(h.nilai_bruto AS DECIMAL) - 425.94) < 1
         OR ABS(CAST(h.nilai_bruto AS DECIMAL) - 425.01) < 1
      ORDER BY h.id DESC
      LIMIT 10
    `;

    console.log('\n📋 DATA SP2D GELONDONGAN dengan nilai ~425:');
    belumSp2d.forEach(r => {
      const hasBank = r.bank_ref_id ? `✅ Bank ID: ${r.bank_ref_id}` : '❌ TIDAK ADA';
      console.log(`ID:${r.id} | Nilai:${r.nilai_bruto} | Status:${r.status_rekon || 'NULL'} | ${hasBank}`);
    });

    // 3. Cek bank_statement yang sudah matched dengan nilai ~425
    const matchedBank = await prisma.$queryRaw`
      SELECT id, tanggal, debet, kredit, is_matched, ref_bku_id
      FROM bank_statement
      WHERE (ABS(debet - 425.94) < 1 OR ABS(kredit - 425.94) < 1
          OR ABS(debet - 425.01) < 1 OR ABS(kredit - 425.01) < 1)
        AND tanggal::date = '2026-01-26'
      ORDER BY id
    `;

    console.log('\n🏦 BANK STATEMENT tanggal 26/01/26 nilai ~425:');
    console.log('Bank ID  | Nilai     | is_matched | ref_bku_id');
    console.log('---------|-----------|------------|----------');
    matchedBank.forEach(r => {
      const val = r.debet || r.kredit;
      const matched = r.is_matched ? '✅ MATCHED' : '❌ BELUM';
      console.log(`${String(r.id).padEnd(8)} | ${String(val).padEnd(9)} | ${matched.padEnd(10)} | ${r.ref_bku_id || 'NULL'}`);
    });

    // 4. Cek inkonsistensi: BKU status SUDAH tapi bank tidak referensikan
    const inconsistent = await prisma.$queryRaw`
      SELECT 
        'POTONGAN' as tabel,
        p.id, p.nomor_sp2d, p.nilai, p.status_rekon
      FROM data_sp2d_potongan p
      WHERE p.status_rekon LIKE 'SUDAH%'
        AND NOT EXISTS (
          SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = p.id::text
        )
      LIMIT 10
    `;

    console.log('\n⚠️  INKONSISTENSI: BKU status SUDAH tapi tidak ada link bank:');
    if (inconsistent.length === 0) {
      console.log('  ✅ Tidak ada inkonsistensi');
    } else {
      inconsistent.forEach(r => {
        console.log(`  TABEL:${r.tabel} ID:${r.id} Nilai:${r.nilai} Status:${r.status_rekon}`);
      });
    }

    // 5. Summary total per status
    const summary = await prisma.$queryRaw`
      SELECT 
        'Potongan' as tabel,
        COUNT(*) FILTER (WHERE status_rekon = 'BELUM' OR status_rekon IS NULL) as belum,
        COUNT(*) FILTER (WHERE status_rekon LIKE 'SUDAH%') as sudah,
        COUNT(*) as total
      FROM data_sp2d_potongan
      UNION ALL
      SELECT 
        'SP2D' as tabel,
        COUNT(*) FILTER (WHERE status_rekon = 'BELUM' OR status_rekon IS NULL) as belum,
        COUNT(*) FILTER (WHERE status_rekon LIKE 'SUDAH%') as sudah,
        COUNT(*) as total
      FROM data_sp2d
      UNION ALL
      SELECT 
        'Bank (matched)' as tabel,
        COUNT(*) FILTER (WHERE is_matched = false) as belum,
        COUNT(*) FILTER (WHERE is_matched = true) as sudah,
        COUNT(*) as total
      FROM bank_statement
    `;

    console.log('\n📊 RINGKASAN STATUS DATABASE:');
    console.log('Tabel          | BELUM | SUDAH | TOTAL');
    console.log('---------------|-------|-------|------');
    summary.forEach(r => {
      console.log(`${String(r.tabel).padEnd(15)}| ${String(r.belum).padEnd(5)} | ${String(r.sudah).padEnd(5)} | ${r.total}`);
    });

  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

diagnose();
