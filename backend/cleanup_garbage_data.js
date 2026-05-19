/**
 * CLEANUP GARBAGE DATA - DSS BPKAD
 * ===================================
 * Skrip ini membersihkan data sampah yang tertinggal akibat:
 * 1. Status ANOMALI lama yang sekarang tidak digunakan
 * 2. Ghost Match: data status SUDAH tapi tidak ada ref_bku_id di bank
 * 3. Keterangan tag teknis yang mencemari kolom uraian ([BELUM COCOK], [Rekon], dll)
 * 4. selisih_nilai yang tidak ter-reset di bank_statement
 *
 * Jalankan: node cleanup_garbage_data.js
 */

const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runCleanup() {
  console.log('\n========================================');
  console.log(' DSS BPKAD — GARBAGE DATA CLEANUP');
  console.log('========================================\n');

  try {

    // =========================================================
    // FASE 1: Perbaiki status ANOMALI lama → menjadi SUDAH
    // (Karena fitur anomali dihapus per 2026-05-16)
    // =========================================================
    console.log('⚡ FASE 1: Normalisasi status ANOMALI lama...');

    const fixSp2dAnomali = await prisma.$executeRaw`
      UPDATE data_sp2d
      SET status_rekon = 'SUDAH'
      WHERE status_rekon LIKE '%ANOMALI%'
    `;
    console.log(`  ✅ SP2D: ${fixSp2dAnomali} baris dinormalisasi (ANOMALI → SUDAH)`);

    const fixPotonganAnomali = await prisma.$executeRaw`
      UPDATE data_sp2d_potongan
      SET status_rekon = 'SUDAH'
      WHERE status_rekon LIKE '%ANOMALI%'
    `;
    console.log(`  ✅ Potongan: ${fixPotonganAnomali} baris dinormalisasi`);

    const fixPajakAnomali = await prisma.$executeRaw`
      UPDATE setoran_pajak
      SET status_rekon = 'SUDAH'
      WHERE status_rekon LIKE '%ANOMALI%'
    `;
    console.log(`  ✅ Pajak: ${fixPajakAnomali} baris dinormalisasi`);

    const fixPendapatanAnomali = await prisma.$executeRaw`
      UPDATE data_pendapatan
      SET status_rekon = 'SUDAH'
      WHERE status_rekon LIKE '%ANOMALI%'
    `;
    console.log(`  ✅ Pendapatan: ${fixPendapatanAnomali} baris dinormalisasi`);


    // =========================================================
    // FASE 2: Bersihkan tag teknis dari kolom keterangan_rekon
    // ([LOG], [BELUM COCOK], [Rekon], [PENYESUAIAN BRUTO] dll)
    // =========================================================
    console.log('\n⚡ FASE 2: Bersihkan tag teknis dari keterangan_rekon...');

    const cleanSp2dKet = await prisma.$executeRaw`
      UPDATE data_sp2d
      SET keterangan_rekon = TRIM(
        REGEXP_REPLACE(keterangan_rekon, '\[LOG\].*?\n?|\[BELUM COCOK\]|\[Rekon\]|\[PENYESUAIAN BRUTO\]|!!! HIGH ANOMALI[^\n]*|!!! ANOMALI[^\n]*|ANOMALI[^\n]*', '', 'g')
      )
      WHERE keterangan_rekon IS NOT NULL
        AND (keterangan_rekon LIKE '%[LOG]%'
          OR keterangan_rekon LIKE '%ANOMALI%'
          OR keterangan_rekon LIKE '%[Rekon]%'
          OR keterangan_rekon LIKE '%[PENYESUAIAN BRUTO]%')
    `;
    console.log(`  ✅ keterangan_rekon SP2D dibersihkan: ${cleanSp2dKet} baris`);


    // =========================================================
    // FASE 3: Perbaiki Ghost Match di bank_statement
    // (is_matched = true TAPI ref_bku_id NULL)
    // =========================================================
    console.log('\n⚡ FASE 3: Perbaiki Ghost Match di bank_statement...');

    const fixGhostBank = await prisma.$executeRaw`
      UPDATE bank_statement
      SET is_matched = false,
          selisih_nilai = 0,
          catatan_selisih = null,
          match_type = null
      WHERE is_matched = true AND ref_bku_id IS NULL
    `;
    console.log(`  ✅ Bank Ghost Match diperbaiki: ${fixGhostBank} baris`);


    // =========================================================
    // FASE 4: Perbaiki Orphan Match di BKU
    // (status_rekon = SUDAH tapi tidak ada bank yang mereferensikannya)
    // KHUSUS: Hanya SP2D & Pendapatan (bukan Potongan — independen)
    // =========================================================
    console.log('\n⚡ FASE 4: Perbaiki Orphan Match di BKU (status SUDAH tanpa link bank)...');

    const fixOrphanSp2d = await prisma.$executeRaw`
      UPDATE data_sp2d
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = NULL
      WHERE status_rekon LIKE 'SUDAH%'
        AND NOT EXISTS (
          SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = CAST(data_sp2d.id AS VARCHAR)
        )
    `;
    console.log(`  ✅ SP2D Orphan Match diperbaiki: ${fixOrphanSp2d} baris`);

    const fixOrphanPendapatan = await prisma.$executeRaw`
      UPDATE data_pendapatan
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = NULL
      WHERE status_rekon LIKE 'SUDAH%'
        AND NOT EXISTS (
          SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = CAST(data_pendapatan.id AS VARCHAR)
        )
    `;
    console.log(`  ✅ Pendapatan Orphan Match diperbaiki: ${fixOrphanPendapatan} baris`);

    const fixOrphanPajak = await prisma.$executeRaw`
      UPDATE setoran_pajak
      SET status_rekon = 'BELUM',
          selisih_rekon = 0,
          keterangan_rekon = NULL
      WHERE status_rekon LIKE 'SUDAH%'
        AND NOT EXISTS (
          SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = CAST(setoran_pajak.id AS VARCHAR)
        )
    `;
    console.log(`  ✅ Pajak Orphan Match diperbaiki: ${fixOrphanPajak} baris`);


    // =========================================================
    // FASE 5: Reset selisih_nilai sisa di bank_statement
    // (yang sudah tidak matched tapi masih ada nilai selisih)
    // =========================================================
    console.log('\n⚡ FASE 5: Reset selisih_nilai sisa di bank_statement...');

    const fixBankSelisih = await prisma.$executeRaw`
      UPDATE bank_statement
      SET selisih_nilai = 0,
          catatan_selisih = NULL
      WHERE is_matched = false
        AND (selisih_nilai != 0 OR catatan_selisih IS NOT NULL)
    `;
    console.log(`  ✅ Bank selisih_nilai sisa direset: ${fixBankSelisih} baris`);


    // =========================================================
    // LAPORAN AKHIR
    // =========================================================
    console.log('\n========================================');
    console.log(' CLEANUP SELESAI — Laporan Status DB');
    console.log('========================================');

    const report = await prisma.$queryRaw`
      SELECT 
        'SP2D' as tabel,
        COUNT(*) FILTER (WHERE status_rekon = 'BELUM' OR status_rekon IS NULL) as belum,
        COUNT(*) FILTER (WHERE status_rekon LIKE 'SUDAH%') as sudah,
        COUNT(*) FILTER (WHERE status_rekon LIKE '%ANOMALI%') as anomali_sisa
      FROM data_sp2d
      UNION ALL
      SELECT 
        'Potongan',
        COUNT(*) FILTER (WHERE status_rekon = 'BELUM' OR status_rekon IS NULL),
        COUNT(*) FILTER (WHERE status_rekon LIKE 'SUDAH%'),
        COUNT(*) FILTER (WHERE status_rekon LIKE '%ANOMALI%')
      FROM data_sp2d_potongan
      UNION ALL
      SELECT 
        'Pajak',
        COUNT(*) FILTER (WHERE status_rekon = 'BELUM' OR status_rekon IS NULL),
        COUNT(*) FILTER (WHERE status_rekon LIKE 'SUDAH%'),
        COUNT(*) FILTER (WHERE status_rekon LIKE '%ANOMALI%')
      FROM setoran_pajak
      UNION ALL
      SELECT 
        'Pendapatan',
        COUNT(*) FILTER (WHERE status_rekon = 'BELUM' OR status_rekon IS NULL),
        COUNT(*) FILTER (WHERE status_rekon LIKE 'SUDAH%'),
        COUNT(*) FILTER (WHERE status_rekon LIKE '%ANOMALI%')
      FROM data_pendapatan
      UNION ALL
      SELECT 
        'Bank Statement',
        COUNT(*) FILTER (WHERE is_matched = false) as belum,
        COUNT(*) FILTER (WHERE is_matched = true) as sudah,
        COUNT(*) FILTER (WHERE is_matched = true AND ref_bku_id IS NULL) as anomali_sisa
      FROM bank_statement
    `;

    console.log('\n Tabel          | BELUM  | SUDAH  | Anomali Sisa');
    console.log(' ---------------+--------+--------+-------------');
    report.forEach(r => {
      const tabel = String(r.tabel).padEnd(16);
      const belum = String(r.belum).padEnd(8);
      const sudah = String(r.sudah).padEnd(8);
      const sisa = r.anomali_sisa > 0 ? `⚠️  ${r.anomali_sisa}` : '✅ 0';
      console.log(` ${tabel}| ${belum}| ${sudah}| ${sisa}`);
    });

    console.log('\n✅ Database bersih dan siap digunakan.\n');

  } catch (error) {
    console.error('\n❌ CLEANUP GAGAL:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

runCleanup();
