/**
 * test_penyesuaian_crud.js
 * Simulasi siklus hidup CRUD penyesuaian: Create → Read → Update → Delete
 * Jalankan: node backend/scratch/test_penyesuaian_crud.js
 */
const prisma = require('../prismaClient');

async function main() {
  console.log('=== Test CRUD Penyesuaian ===\n');

  // 1. CREATE
  const testId = `ADJ-TEST-${Date.now()}`;
  const created = await prisma.data_penyesuaian.create({
    data: {
      id: testId,
      tanggal: new Date('2026-05-20'),
      jenis: 'KELUAR',
      sisi_pengaruh: 'BUKU',
      uraian: '[TEST] Koreksi otomatis uji CRUD',
      nilai: 999999,
      user_pelaksana: 'test-script',
    }
  });
  console.log('1. CREATE ✓ id:', created.id);

  // 2. READ BY ID
  const found = await prisma.data_penyesuaian.findUnique({
    where: { id: testId },
    include: { master_sumber_dana: { select: { id: true, nama: true } } }
  });
  console.log('2. READ ✓ uraian:', found?.uraian, '| nilai:', Number(found?.nilai));

  // 3. UPDATE
  const updated = await prisma.data_penyesuaian.update({
    where: { id: testId },
    data: {
      uraian: '[TEST] Koreksi diperbarui',
      nilai: 1234567,
      jenis: 'MASUK',
    }
  });
  console.log('3. UPDATE ✓ uraian baru:', updated.uraian, '| nilai baru:', Number(updated.nilai));

  // 4. DELETE
  await prisma.data_penyesuaian.delete({ where: { id: testId } });
  const afterDelete = await prisma.data_penyesuaian.findUnique({ where: { id: testId } });
  console.log('4. DELETE ✓ data setelah hapus:', afterDelete === null ? 'null (terhapus)' : 'MASIH ADA (BUG)');

  // 5. Cek log_aktivitas (opsional — hanya jika tabel ada)
  try {
    const logs = await prisma.$queryRaw`
      SELECT aksi, entitas, detail, created_at
      FROM log_aktivitas
      WHERE entitas = 'PENYESUAIAN'
      ORDER BY created_at DESC
      LIMIT 5
    `;
    console.log('\n5. LOG AKTIVITAS (5 terbaru):');
    logs.forEach((l) => console.log(`   [${l.aksi}] ${l.entitas} — ${l.detail}`));
  } catch {
    console.log('5. Log aktivitas: tabel tidak tersedia di tes ini (logActivity butuh req object)');
  }

  console.log('\n=== Semua test PASSED ===');
}

main()
  .catch(e => { console.error('ERROR:', e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
