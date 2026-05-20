const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const currentYear = 2026;
  const startDateObj = new Date('2026-01-01T00:00:00.000Z');
  const endDateObj = new Date('2026-12-31T23:59:59.999Z');
  const sDate = '2026-01-01';
  const eDate = '2026-12-31';

  console.log('=== Deep Comparative Audit: BKU Report vs Bank Reconciliation BKU ===\n');

  // 1. Get BKU Report Pengeluaran items
  console.log('Fetching BKU Report Pengeluaran items...');
  const bkuItems = await prisma.$queryRaw`
    SELECT * FROM (
      SELECT 
        COALESCE(h.tanggal_pencairan, h.tanggal) as tanggal, 
        CAST(h.nomor AS VARCHAR) as bukti, 
        CAST(h.uraian AS VARCHAR) as uraian, 
        CAST(h.opd AS VARCHAR) as opd, 
        CAST(d.id_sumber_dana AS VARCHAR) as id_sumber_dana, 
        0::DECIMAL as penerimaan, 
        CAST(COALESCE((CASE WHEN h.status_rekon = 'SUDAH_BRUTO' THEN d.nilai_bruto ELSE (d.nilai_bruto - (COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), CAST(h.nilai_potongan AS DECIMAL)) * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) END), 0) AS DECIMAL) as pengeluaran,
        CAST('PENGELUARAN' AS VARCHAR) as tipe, 
        h.created_at, 
        CAST(h.status_rekon AS VARCHAR) as status_rekon
      FROM detail_sp2d d 
      JOIN data_sp2d h ON d.id_sp2d = h.id 
      WHERE COALESCE(h.tanggal_pencairan, h.tanggal) BETWEEN ${startDateObj} AND ${endDateObj}
      
      UNION ALL
      
      SELECT 
        COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, 
        CAST(COALESCE(p.nomor_sp2d, 'BANK') AS VARCHAR) as bukti, 
        CAST(p.uraian AS VARCHAR) as uraian, 
        CAST(p.opd AS VARCHAR) as opd, 
        CAST(p.id_sumber_dana AS VARCHAR) as id_sumber_dana, 
        0::DECIMAL as penerimaan, 
        CAST(COALESCE(p.nilai, 0) AS DECIMAL) as pengeluaran, 
        CAST('POTONGAN' AS VARCHAR) as tipe, 
        p.created_at, 
        CAST(p.status_rekon AS VARCHAR) as status_rekon
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      WHERE COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) BETWEEN ${startDateObj} AND ${endDateObj}
      AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')
      AND (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO')

      UNION ALL

      SELECT 
        tanggal, 
        CAST(('STP-' || id::VARCHAR) AS VARCHAR) as bukti, 
        CAST(uraian AS VARCHAR) as uraian, 
        CAST('SETORAN PAJAK' AS VARCHAR) as opd, 
        CAST(id_sumber_dana AS VARCHAR) as id_sumber_dana, 
        0::DECIMAL as penerimaan, 
        CAST(COALESCE(nilai, 0) AS DECIMAL) as pengeluaran, 
        CAST('SETORAN' AS VARCHAR) as tipe, 
        created_at, 
        CAST(status_rekon AS VARCHAR) as status_rekon
      FROM setoran_pajak
      WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
      AND NOT EXISTS (
        SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = nomor_bukti
      )

      UNION ALL

      SELECT 
        tanggal, 
        CAST(('ADJ-' || id::VARCHAR) AS VARCHAR) as bukti, 
        CAST(uraian AS VARCHAR) as uraian, 
        CAST('PENYESUAIAN KAS' AS VARCHAR) as opd, 
        CAST(id_sumber_dana AS VARCHAR) as id_sumber_dana, 
        CASE WHEN jenis = 'MASUK' THEN CAST(COALESCE(nilai, 0) AS DECIMAL) ELSE 0::DECIMAL END as penerimaan, 
        CASE WHEN jenis = 'KELUAR' THEN CAST(COALESCE(nilai, 0) AS DECIMAL) ELSE 0::DECIMAL END as pengeluaran, 
        CAST('PENYESUAIAN' AS VARCHAR) as tipe, 
        created_at, 
        CAST('N/A' AS VARCHAR) as status_rekon
      FROM data_penyesuaian 
      WHERE tanggal BETWEEN ${startDateObj} AND ${endDateObj}
    ) combined
    ORDER BY tanggal ASC, created_at ASC
  `;

  // 2. Get Reconciliation BKU list items
  console.log('Fetching Reconciliation BKU list items...');
  const reconItems = await prisma.$queryRawUnsafe(`
    SELECT
      id, tanggal, bukti, uraian, nilai, tipe, status_rekon, source, opd, selisih_rekon
    FROM (
      SELECT s.id::text, COALESCE(s.tanggal_pencairan, s.tanggal) as tanggal, s.nomor as bukti, s.uraian,
             CAST(CASE WHEN s.status_rekon = 'SUDAH_BRUTO' THEN s.nilai_bruto ELSE (s.nilai_bruto - COALESCE(pot.total_nilai, 0)) END AS DECIMAL) as nilai,
             'KELUAR' as tipe, COALESCE(s.status_rekon, 'BELUM') as status_rekon, 'SP2D' as source, s.opd,
             COALESCE(s.selisih_rekon, 0)::numeric as selisih_rekon
      FROM data_sp2d s
      LEFT JOIN (SELECT id_sp2d, SUM(nilai) as total_nilai FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
      WHERE (
             (s.tanggal_pencairan::DATE BETWEEN '${sDate}' AND '${eDate}')
          OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}')
        )

      UNION ALL
      SELECT p.id::text, p.tanggal, p.nomor_bukti as bukti, p.uraian, p.nilai, 'MASUK' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon, 'PENDAPATAN' as source, 'BENDAHARA' as opd,
             COALESCE(p.selisih_rekon, 0)::numeric as selisih_rekon
      FROM data_pendapatan p
      WHERE p.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'

      UNION ALL
      SELECT tx.id::text, tx.tanggal, tx.nomor_bukti as bukti, tx.uraian, tx.nilai, 'KELUAR' as tipe, COALESCE(tx.status_rekon, 'BELUM') as status_rekon, 'SETORAN' as source, tx.opd,
             COALESCE(tx.selisih_rekon, 0)::numeric as selisih_rekon
      FROM setoran_pajak tx
      WHERE tx.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'
      AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = tx.nomor_bukti)

      UNION ALL
      SELECT p.id::text, COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, p.nomor_sp2d as bukti, p.uraian, p.nilai, 'KELUAR' as tipe, COALESCE(p.status_rekon, 'BELUM') as status_rekon, 'POTONGAN' as source, p.opd,
             COALESCE(p.selisih_rekon, 0)::numeric as selisih_rekon
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      WHERE (
             (p.tanggal_pencairan::DATE BETWEEN '${sDate}' AND '${eDate}')
          OR (p.tanggal_pencairan IS NULL AND COALESCE(s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}')
        )
    ) combined
    ORDER BY tanggal ASC
  `);

  // 3. Get global reconciliation BKU summary
  console.log('Fetching Reconciliation BKU SummaryAgg...');
  const summaryAgg = await prisma.$queryRawUnsafe(`
    SELECT
      SUM(CASE WHEN tipe = 'KELUAR' THEN nilai ELSE 0 END) as total_keluar,
      SUM(CASE WHEN tipe = 'MASUK' THEN nilai ELSE 0 END) as total_masuk
    FROM (
      SELECT (nilai_bruto - COALESCE(pot.total, 0)) as nilai, 'KELUAR' as tipe
      FROM data_sp2d s
      LEFT JOIN (SELECT id_sp2d, SUM(nilai) as total FROM data_sp2d_potongan GROUP BY id_sp2d) pot ON s.id = pot.id_sp2d
      WHERE ((s.tanggal_pencairan::DATE >= '${sDate}' AND s.tanggal_pencairan::DATE <= '${eDate}')
         OR (s.tanggal_pencairan IS NULL AND s.tanggal::DATE >= '${sDate}' AND s.tanggal::DATE <= '${eDate}'))

      UNION ALL
      SELECT p.nilai, 'KELUAR' as tipe
      FROM data_sp2d_potongan p
      LEFT JOIN data_sp2d s ON p.id_sp2d = s.id
      WHERE COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)::DATE BETWEEN '${sDate}' AND '${eDate}'

      UNION ALL
      SELECT p.nilai, 'MASUK' as tipe
      FROM data_pendapatan p
      WHERE p.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'

      UNION ALL
      SELECT s.nilai, 'KELUAR' as tipe
      FROM setoran_pajak s
      WHERE s.tanggal::DATE BETWEEN '${sDate}' AND '${eDate}'
      AND NOT EXISTS (SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = s.nomor_bukti)
    ) as global_bku
  `);

  console.log('\n--- OVERALL TOTAL COMPARISON ---');
  
  const bkuTotalKeluar = bkuItems.reduce((acc, row) => acc + Number(row.pengeluaran || 0), 0);
  const reconTotalKeluar = reconItems.filter(r => r.tipe === 'KELUAR').reduce((acc, row) => acc + Number(row.nilai || 0), 0);
  const summaryAggTotalKeluar = Number(summaryAgg[0]?.total_keluar || 0);

  console.log(`BKU Report Total Pengeluaran    : Rp ${bkuTotalKeluar.toLocaleString('id-ID')}`);
  console.log(`Recon BKU List Total Pengeluaran: Rp ${reconTotalKeluar.toLocaleString('id-ID')}`);
  console.log(`Recon SummaryAgg Total Pengeluar: Rp ${summaryAggTotalKeluar.toLocaleString('id-ID')}`);
  console.log(`BKU Report - Recon BKU List      : Rp ${(bkuTotalKeluar - reconTotalKeluar).toLocaleString('id-ID')}`);
  console.log(`BKU Report - Recon SummaryAgg    : Rp ${(bkuTotalKeluar - summaryAggTotalKeluar).toLocaleString('id-ID')}`);
  console.log(`Recon BKU List - Recon SummaryAgg: Rp ${(reconTotalKeluar - summaryAggTotalKeluar).toLocaleString('id-ID')}`);

  // 4. Mismatch details between BKU Report and Recon BKU List
  console.log('\n--- DETAILED COMPONENT ANALYSES ---');

  // Let's breakdown BKU Report by Tipe
  const bkuByTipe = {};
  bkuItems.forEach(row => {
    bkuByTipe[row.tipe] = (bkuByTipe[row.tipe] || 0) + Number(row.pengeluaran || 0);
  });
  console.log('\nBKU Report Breakdown:', bkuByTipe);

  // Let's breakdown Recon BKU List by Source
  const reconBySource = {};
  reconItems.filter(r => r.tipe === 'KELUAR').forEach(row => {
    reconBySource[row.source] = (reconBySource[row.source] || 0) + Number(row.nilai || 0);
  });
  console.log('Recon BKU List Breakdown:', reconBySource);

  // Let's analyze Penyesuaian KELUAR in BKU Report
  const penyesuaianKeluar = bkuItems.filter(r => r.tipe === 'PENYESUAIAN' && Number(r.pengeluaran) > 0);
  const penyesuaianKeluarTotal = penyesuaianKeluar.reduce((acc, r) => acc + Number(r.pengeluaran), 0);
  console.log(`\nPenyesuaian KELUAR in BKU Report: Rp ${penyesuaianKeluarTotal.toLocaleString('id-ID')} (${penyesuaianKeluar.length} items)`);

  // Let's analyze POTONGAN differences
  // In BKU Report, POTONGAN is:
  // p.nilai FROM data_sp2d_potongan WHERE (s.id IS NULL OR s.status_rekon != 'SUDAH_BRUTO')
  // In Recon BKU List, POTONGAN is:
  // p.nilai FROM data_sp2d_potongan (no SUDAH_BRUTO filter!)
  const BkuPotonganTotal = bkuItems.filter(r => r.tipe === 'POTONGAN').reduce((acc, r) => acc + Number(r.pengeluaran), 0);
  const ReconPotonganTotal = reconItems.filter(r => r.source === 'POTONGAN').reduce((acc, r) => acc + Number(r.nilai), 0);
  console.log(`\nPotongan BKU Report Total      : Rp ${BkuPotonganTotal.toLocaleString('id-ID')}`);
  console.log(`Potongan Recon BKU List Total  : Rp ${ReconPotonganTotal.toLocaleString('id-ID')}`);
  console.log(`Difference in Potongan         : Rp ${(BkuPotonganTotal - ReconPotonganTotal).toLocaleString('id-ID')}`);

  // Find which SP2D are SUDAH_BRUTO
  const sp2dSudahBruto = await prisma.data_sp2d.findMany({
    where: { status_rekon: 'SUDAH_BRUTO' }
  });
  console.log(`\nFound ${sp2dSudahBruto.length} SP2D with status_rekon = 'SUDAH_BRUTO'`);
  for (const s of sp2dSudahBruto) {
    const potSum = await prisma.data_sp2d_potongan.aggregate({
      where: { id_sp2d: s.id },
      _sum: { nilai: true }
    });
    console.log(`- SP2D ${s.nomor} | Bruto: Rp ${Number(s.nilai_bruto).toLocaleString('id-ID')} | Potongan: Rp ${Number(potSum._sum.nilai || 0).toLocaleString('id-ID')} | Neto: Rp ${Number(s.nilai_neto).toLocaleString('id-ID')}`);
  }

  // Let's check why Recon BKU List - Recon SummaryAgg difference exists
  console.log(`\nRecon BKU List - Recon SummaryAgg: Rp ${(reconTotalKeluar - summaryAggTotalKeluar).toLocaleString('id-ID')}`);
  // In Recon BKU List, SP2D is Case When SUDAH_BRUTO then Bruto else Neto
  // In Recon SummaryAgg, SP2D is always Neto (nilai_bruto - COALESCE(pot.total, 0))
  const sp2dBrutoMatchedInReconList = reconItems.filter(r => r.source === 'SP2D' && r.status_rekon === 'SUDAH_BRUTO');
  console.log(`\nSP2D items with SUDAH_BRUTO in Recon BKU List: ${sp2dBrutoMatchedInReconList.length} items`);
  sp2dBrutoMatchedInReconList.forEach(r => {
    console.log(`- ${r.bukti} | Value: Rp ${Number(r.nilai).toLocaleString('id-ID')}`);
  });

  await prisma.$disconnect();
}

main().catch(console.error);
