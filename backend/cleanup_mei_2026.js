/**
 * cleanup_mei_2026.js
 *
 * Menghapus data BKU bulan Mei 2026 agar bisa di-upload ulang.
 *
 * Yang DIHAPUS  : data_sp2d, detail_sp2d (cascade), data_sp2d_potongan,
 *                 setoran_pajak — semua bulan Mei 2026.
 * Yang TIDAK dihapus : data_pendapatan (sengaja dikecualikan).
 * Yang TIDAK diubah : bank_statement (hanya di-unmatch kalau sudah matched ke data Mei).
 *
 * Jalankan:
 *   node cleanup_mei_2026.js           → preview saja (aman, tidak mengubah data)
 *   node cleanup_mei_2026.js --execute → hapus sungguhan
 */

const prisma = require('./prismaClient');

const START = new Date('2026-05-01T00:00:00.000Z');
const END   = new Date('2026-05-31T23:59:59.999Z');
const BULAN = 5;
const TAHUN = 2026;

const EXECUTE = process.argv.includes('--execute');

// ─────────────────────────────────────────────────────────────
async function preview() {
  console.log('\n========================================');
  console.log(' PREVIEW — DATA BULAN MEI 2026');
  console.log('========================================');

  const sp2dCount = await prisma.data_sp2d.count({
    where: { tanggal: { gte: START, lte: END } }
  });

  const detailCount = await prisma.detail_sp2d.count({
    where: { sp2d: { tanggal: { gte: START, lte: END } } }
  });

  const potonganLinkedCount = await prisma.data_sp2d_potongan.count({
    where: { sp2d: { tanggal: { gte: START, lte: END } } }
  });

  const potonganOrphanCount = await prisma.data_sp2d_potongan.count({
    where: {
      id_sp2d: null,
      tanggal_pencairan: { gte: START, lte: END }
    }
  });

  const pendapatanCount = await prisma.data_pendapatan.count({
    where: { tanggal: { gte: START, lte: END } }
  });

  const pajakCount = await prisma.setoran_pajak.count({
    where: { tanggal: { gte: START, lte: END } }
  });

  // Bank statement yang akan di-unmatch (tidak dihapus)
  const bankMatchedCount = await prisma.bank_statement.count({
    where: {
      tanggal: { gte: START, lte: END },
      is_matched: true
    }
  });
  const bankTotalCount = await prisma.bank_statement.count({
    where: { tanggal: { gte: START, lte: END } }
  });

  console.log('\n[AKAN DIHAPUS]');
  console.log(`  data_sp2d             : ${sp2dCount} record`);
  console.log(`  detail_sp2d (cascade) : ${detailCount} record`);
  console.log(`  data_sp2d_potongan (cascade dari SP2D): ${potonganLinkedCount} record`);
  console.log(`  data_sp2d_potongan (standalone, id_sp2d null): ${potonganOrphanCount} record`);
  console.log(`  setoran_pajak         : ${pajakCount} record`);
  console.log('\n[TIDAK DIHAPUS]');
  console.log(`  data_pendapatan       : ${pendapatanCount} record (DIKECUALIKAN)`);
  console.log(`  bank_statement Mei 2026 total : ${bankTotalCount} record`);
  console.log(`  bank_statement yang matched   : ${bankMatchedCount} record (akan di-reset ke BELUM)`);
  console.log('\n========================================');

  if (!EXECUTE) {
    console.log(' Mode: PREVIEW SAJA (gunakan --execute untuk hapus sungguhan)');
    console.log('========================================\n');
  }

  return {
    sp2dCount, pendapatanCount, pajakCount,
    potonganOrphanCount, bankMatchedCount
  };
}

// ─────────────────────────────────────────────────────────────
async function execute() {
  console.log('\n[MULAI HAPUS DATA MEI 2026...]\n');

  await prisma.$transaction(async (tx) => {

    // 1. Kumpulkan semua ID BKU Mei 2026 yang perlu di-unmatch di bank_statement
    const sp2dIds = (await tx.data_sp2d.findMany({
      where: { tanggal: { gte: START, lte: END } },
      select: { id: true }
    })).map(r => r.id);

    const pajakIds = (await tx.setoran_pajak.findMany({
      where: { tanggal: { gte: START, lte: END } },
      select: { id: true }
    })).map(r => r.id);

    const potonganOrphanIds = (await tx.data_sp2d_potongan.findMany({
      where: { id_sp2d: null, tanggal_pencairan: { gte: START, lte: END } },
      select: { id: true }
    })).map(r => r.id);

    // data_pendapatan DIKECUALIKAN dari penghapusan, tapi ikut di-unmatch kalau sudah matched ke bank
    const pendapatanIds = (await tx.data_pendapatan.findMany({
      where: { tanggal: { gte: START, lte: END } },
      select: { id: true }
    })).map(r => r.id);

    const allBkuIds = [...sp2dIds, ...pendapatanIds, ...pajakIds, ...potonganOrphanIds];

    // 2. Unmatch bank_statement yang ref_bku_id-nya mengarah ke data Mei
    if (allBkuIds.length > 0) {
      const unmatchResult = await tx.bank_statement.updateMany({
        where: { ref_bku_id: { in: allBkuIds } },
        data: {
          is_matched: false,
          ref_bku_id: null,
          selisih_nilai: 0,
          catatan_selisih: null,
          match_type: null
        }
      });
      console.log(`  ✓ bank_statement di-unmatch : ${unmatchResult.count} record`);
    } else {
      console.log(`  ✓ bank_statement di-unmatch : 0 record (tidak ada yang matched)`);
    }

    // 3. Hapus data_sp2d Mei 2026 → cascade ke detail_sp2d + data_sp2d_potongan linked
    const delSp2d = await tx.data_sp2d.deleteMany({
      where: { tanggal: { gte: START, lte: END } }
    });
    console.log(`  ✓ data_sp2d dihapus         : ${delSp2d.count} record (detail & potongan cascade)`);

    // 4. Hapus sisa potongan standalone (id_sp2d=null) di Mei 2026
    const delPotonganOrphan = await tx.data_sp2d_potongan.deleteMany({
      where: { id_sp2d: null, tanggal_pencairan: { gte: START, lte: END } }
    });
    console.log(`  ✓ potongan standalone dihapus: ${delPotonganOrphan.count} record`);

    console.log(`  ✓ data_pendapatan            : DIKECUALIKAN (tidak dihapus)`);

    // 5. Hapus setoran_pajak Mei 2026
    const delPajak = await tx.setoran_pajak.deleteMany({
      where: { tanggal: { gte: START, lte: END } }
    });
    console.log(`  ✓ setoran_pajak dihapus      : ${delPajak.count} record`);

    // 7. Tulis log aktivitas
    await tx.log_aktivitas.create({
      data: {
        user_pelaksana: 'ADMIN_CLEANUP',
        aksi: 'CLEANUP_BULAN',
        detail: `Cleanup data Mei 2026 (${START.toISOString().slice(0,10)} s/d ${END.toISOString().slice(0,10)}): `
          + `${delSp2d.count} SP2D, ${delPajak.count} setoran pajak, `
          + `${delPotonganOrphan.count} potongan standalone dihapus. data_pendapatan DIKECUALIKAN.`
      }
    }).catch(() => {});

  }, { timeout: 30000 });

  console.log('\n========================================');
  console.log(' SELESAI — Data Mei 2026 berhasil dihapus.');
  console.log(' Bank statement tetap ada, siap dipakai ulang untuk rekon.');
  console.log('========================================\n');
}

// ─────────────────────────────────────────────────────────────
async function main() {
  try {
    await preview();
    if (EXECUTE) {
      await execute();
    }
  } catch (err) {
    console.error('\n[ERROR]', err.message);
    if (err.code) console.error('Prisma code:', err.code);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
