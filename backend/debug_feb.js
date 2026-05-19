const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  const sDate = '2026-02-01';
  const eDate = '2026-02-28';

  // Test 1: distribusi status SP2D
  const sp2dStatus = await prisma.data_sp2d.groupBy({
    by: ['status_rekon'],
    where: { tanggal: { gte: new Date(sDate), lte: new Date(eDate + 'T23:59:59Z') } },
    _count: true
  });
  console.log('=== DISTRIBUSI STATUS SP2D FEB ===');
  console.log(JSON.stringify(sp2dStatus, null, 2));

  // Test 2: cek bank statement status
  const bankStatus = await prisma.bank_statement.groupBy({
    by: ['is_matched'],
    where: { tanggal: { gte: new Date(sDate), lte: new Date(eDate + 'T23:59:59Z') } },
    _count: true
  });
  console.log('\n=== DISTRIBUSI STATUS BANK FEB ===');
  console.log(JSON.stringify(bankStatus, null, 2));

  // Test 3: raw SQL test query
  const rawResult = await prisma.$queryRaw`
    SELECT COUNT(*)::int as total_belum_sp2d
    FROM data_sp2d s
    WHERE (
           (s.tanggal_pencairan::DATE BETWEEN '2026-02-01' AND '2026-02-28')
        OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE BETWEEN '2026-02-01' AND '2026-02-28')
      ) AND (s.status_rekon = 'BELUM' OR s.status_rekon IS NULL OR s.status_rekon = '')
  `;
  console.log('\n=== SP2D BELUM (RAW SQL) ===');
  console.log(JSON.stringify(rawResult, null, 2));

  // Test 4: cek 3 baris pertama yang akan dikembalikan
  const sampleBku = await prisma.$queryRaw`
    SELECT s.id::text, COALESCE(s.tanggal_pencairan, s.tanggal) as tanggal,
           s.status_rekon, s.nomor, s.opd
    FROM data_sp2d s
    WHERE (
           (s.tanggal_pencairan::DATE BETWEEN '2026-02-01' AND '2026-02-28')
        OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE BETWEEN '2026-02-01' AND '2026-02-28')
      ) AND (s.status_rekon = 'BELUM' OR s.status_rekon IS NULL OR s.status_rekon = '')
    LIMIT 3
  `;
  console.log('\n=== SAMPLE 3 BKU YANG AKAN MUNCUL ===');
  console.log(JSON.stringify(sampleBku, null, 2));

  process.exit(0);
}
debug().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
