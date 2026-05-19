const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function debugBKU() {
  const startDate = '2026-01-01';
  const endDate = '2026-12-31';

  try {
    console.log('--- RUNNING SALDO AWAL DEBUG ---');
    const prevDate = '2026-01-01';
    
    const qInc = await prisma.$queryRawUnsafe(`SELECT SUM(nilai) as total FROM data_pendapatan WHERE tanggal < '${prevDate}'`);
    console.log('qInc:', qInc);
    
    const qExp = await prisma.$queryRawUnsafe(`
        SELECT SUM(d.nilai_bruto - (h.nilai_potongan * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))) as total 
        FROM detail_sp2d d 
        JOIN data_sp2d h ON d.id_sp2d = h.id 
        WHERE h.tanggal < '${prevDate}'
    `);
    console.log('qExp:', qExp);
    
    const qTax = await prisma.$queryRawUnsafe(`
        SELECT SUM(nilai) as total FROM data_sp2d_potongan
        WHERE tanggal_pencairan < '${prevDate}'
    `);
    console.log('qTax:', qTax);
    
    const qSa = await prisma.$queryRawUnsafe(`SELECT SUM(nilai) as total FROM saldo_awal`);
    console.log('qSa:', qSa);
    
    console.log('--- RUNNING BKU MAIN QUERY ---');
    const result = await prisma.$queryRawUnsafe(`
      SELECT * FROM (
        SELECT 
          p.tanggal, ('PND-' || p.id::VARCHAR) as bukti, p.uraian, 'PENERIMAAN DAERAH' as opd, 
          p.id_sumber_dana::VARCHAR as id_sumber_dana, CAST(COALESCE(p.nilai, 0) AS DECIMAL) as penerimaan, 0::DECIMAL as pengeluaran, 
          'PENDAPATAN' as tipe, p.created_at, CAST(p.status_rekon AS VARCHAR) as status_rekon
        FROM data_pendapatan p 
        WHERE p.tanggal BETWEEN '${startDate}' AND '${endDate}'
        
        UNION ALL
        
        SELECT 
          h.tanggal, h.nomor as bukti, h.uraian, h.opd, d.id_sumber_dana::VARCHAR as id_sumber_dana, 0::DECIMAL as penerimaan, 
          CAST(COALESCE((d.nilai_bruto - (h.nilai_potongan * (d.nilai_bruto / NULLIF(h.nilai_bruto, 0)))), 0) AS DECIMAL) as pengeluaran, 
          'PENGELUARAN' as tipe, h.created_at, 
          CAST(CASE 
            WHEN ABS(COALESCE(h.selisih_rekon, 0)) > 100000 THEN '!!! HIGH ANOMALI (' || CAST(h.selisih_rekon AS VARCHAR) || ')'
            WHEN COALESCE(h.selisih_rekon, 0) != 0 THEN 'ANOMALI (' || CAST(h.selisih_rekon AS VARCHAR) || ')'
            ELSE h.status_rekon 
          END AS VARCHAR) as status_rekon
        FROM detail_sp2d d 
        JOIN data_sp2d h ON d.id_sp2d = h.id 
        WHERE h.tanggal BETWEEN '${startDate}' AND '${endDate}'
        
        UNION ALL
        
        SELECT 
          tanggal_pencairan as tanggal, COALESCE(nomor_sp2d, 'BANK') as bukti, uraian, opd, id_sumber_dana::VARCHAR as id_sumber_dana, 0::DECIMAL as penerimaan, CAST(COALESCE(nilai, 0) AS DECIMAL) as pengeluaran, 
          'POTONGAN' as tipe, created_at, CAST(status_rekon AS VARCHAR) as status_rekon
        FROM data_sp2d_potongan
        WHERE tanggal_pencairan BETWEEN '${startDate}' AND '${endDate}'

        UNION ALL

        SELECT 
          tanggal, ('ADJ-' || id::VARCHAR) as bukti, uraian, 'PENYESUAIAN KAS' as opd, id_sumber_dana::VARCHAR as id_sumber_dana, 
          CASE WHEN jenis = 'MASUK' THEN CAST(COALESCE(nilai, 0) AS DECIMAL) ELSE 0::DECIMAL END as penerimaan, 
          CASE WHEN jenis = 'KELUAR' THEN CAST(COALESCE(nilai, 0) AS DECIMAL) ELSE 0::DECIMAL END as pengeluaran, 
          'PENYESUAIAN' as tipe, created_at, 'N/A'::VARCHAR as status_rekon
        FROM data_penyesuaian 
        WHERE tanggal BETWEEN '${startDate}' AND '${endDate}'
      ) combined
      WHERE 1=1
      ORDER BY tanggal ASC, created_at ASC
    `);
    console.log('SUCCESS: Query returned', result.length, 'rows');
  } catch (error) {
    console.error('FAILED: Query error details:');
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

debugBKU();
