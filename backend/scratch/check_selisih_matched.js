const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("=== Auditing Minor Discrepancies and Bank Selisih ===");
  
  const targetYear = 2026;
  
  // 1. Unmatched Bank Debets
  const unmatchedBankDebet = await prisma.bank_statement.aggregate({
    where: {
      tanggal: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-12-31T23:59:59.999Z')
      },
      is_matched: false,
      debet: { gt: 0 }
    },
    _sum: { debet: true }
  });
  console.log(`Unmatched Bank Debet: Rp ${Number(unmatchedBankDebet._sum.debet || 0).toLocaleString('id-ID')}`);
  
  // 2. Unmatched BKU KELUAR (using Reconciliation's formula)
  const sDate = '2026-01-01';
  const eDate = '2026-12-31';
  const unmatchedBkuKeluar = await prisma.$queryRawUnsafe(`
    SELECT SUM(nilai) as total FROM (
      SELECT (nilai_bruto - COALESCE(pot.total, 0)) as nilai
      FROM data_sp2d s
      LEFT JOIN (SELECT id_sp2d, SUM(nilai) as total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
      WHERE ((s.tanggal_pencairan::DATE >= '${sDate}' AND s.tanggal_pencairan::DATE <= '${eDate}')
         OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE >= '${sDate}' AND s.tanggal::DATE <= '${eDate}'))
        AND (s.status_rekon = 'BELUM' OR s.status_rekon IS NULL OR s.status_rekon = '')

      UNION ALL
      SELECT p.nilai
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      WHERE COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}'
        AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL OR p.status_rekon = '')

      UNION ALL
      SELECT s.nilai
      FROM setoran_pajak s
      WHERE s.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'
        AND (s.status_rekon = 'BELUM' OR s.status_rekon IS NULL OR s.status_rekon = '')
        AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
    ) as unmatched
  `);
  console.log(`Unmatched BKU Keluar (Recon style): Rp ${Number(unmatchedBkuKeluar[0]?.total || 0).toLocaleString('id-ID')}`);
  
  // 3. Matched items with a difference (selisih_nilai) in bank_statement
  const matchedWithSelisih = await prisma.bank_statement.findMany({
    where: {
      tanggal: {
        gte: new Date('2026-01-01T00:00:00.000Z'),
        lte: new Date('2026-12-31T23:59:59.999Z')
      },
      is_matched: true,
      selisih_nilai: { not: 0 },
      debet: { gt: 0 }
    }
  });
  console.log(`\nMatched Bank Debets with Selisih: ${matchedWithSelisih.length}`);
  let totalSelisihDebet = 0;
  for (const b of matchedWithSelisih) {
    totalSelisihDebet += Number(b.selisih_nilai);
    console.log(`- Bank ID: ${b.id} | Tgl: ${b.tanggal.toISOString().split('T')[0]} | Debet: ${Number(b.debet)} | Selisih Nilai: ${Number(b.selisih_nilai)} | Ref BKU ID: ${b.ref_bku_id} | Desc: ${b.deskripsi}`);
  }
  console.log(`Total Selisih Debet: Rp ${totalSelisihDebet.toLocaleString('id-ID')}`);
  
  await prisma.$disconnect();
}

run().catch(console.error);
