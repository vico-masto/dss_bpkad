const prisma = require('../prismaClient');

async function debugDiscrepancy() {
  const currentYear = 2026;
  console.log(`=== DEBUG DISCREPANCY REPORT FOR YEAR ${currentYear} ===`);
  
  try {
    // Check if there is any data at all in the key tables
    const sp2dCount = await prisma.data_sp2d.count();
    const bankCount = await prisma.bank_statement.count();
    const pendapatanCount = await prisma.data_pendapatan.count();
    const potonganCount = await prisma.data_sp2d_potongan.count();
    const pajakCount = await prisma.setoran_pajak.count();
    const saldoAwalCount = await prisma.saldo_awal.count();
    
    console.log('--- TABLE ROW COUNTS (ALL YEARS) ---');
    console.log('data_sp2d count:', sp2dCount);
    console.log('bank_statement count:', bankCount);
    console.log('data_pendapatan count:', pendapatanCount);
    console.log('data_sp2d_potongan count:', potonganCount);
    console.log('setoran_pajak count:', pajakCount);
    console.log('saldo_awal count:', saldoAwalCount);

    console.log('\n--- SAMPLE DATA & RANGE ---');
    if (sp2dCount > 0) {
      const sp2dYearMinMax = await prisma.$queryRaw`SELECT MIN(tahun) as min_yr, MAX(tahun) as max_yr FROM data_sp2d`;
      console.log('data_sp2d years:', sp2dYearMinMax);
    }
    if (bankCount > 0) {
      const bankDateMinMax = await prisma.$queryRaw`SELECT MIN(tanggal) as min_tgl, MAX(tanggal) as max_tgl FROM bank_statement`;
      console.log('bank_statement dates:', bankDateMinMax);
    }

    console.log('\n--- RUNNING DISCREPANCY QURIES ---');

    // 1. Q1: sp2dUnmatched
    const q1 = await prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bulan,
        opd,
        COUNT(*)::int as jumlah,
        SUM(CAST(nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = h.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), h.nilai_potongan) AS DECIMAL)) as total_neto
      FROM data_sp2d h
      WHERE h.tahun = ${currentYear} AND (h.status_rekon = 'BELUM' OR h.status_rekon IS NULL)
      GROUP BY EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal)), opd
      ORDER BY bulan ASC
    `.catch(e => { console.error('Error Q1:', e.message); return []; });
    console.log('Q1 (sp2dUnmatched) results count:', q1.length);

    // 2. Q2: sp2dMatched
    const q2 = await prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM tanggal_pencairan)::int as bulan,
        COUNT(*)::int as jumlah,
        SUM(CAST(nilai_neto AS DECIMAL)) as total_neto
      FROM data_sp2d
      WHERE tahun = ${currentYear} AND (status_rekon LIKE 'SUDAH%' OR status_rekon LIKE 'ANOMALI%') AND tanggal_pencairan IS NOT NULL
      GROUP BY EXTRACT(MONTH FROM tanggal_pencairan)
      ORDER BY bulan ASC
    `.catch(e => { console.error('Error Q2:', e.message); return []; });
    console.log('Q2 (sp2dMatched) results count:', q2.length);

    // 3. Q3: bankDebetUnmatched
    const q3 = await prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM tanggal)::int as bulan,
        COUNT(*)::int as jumlah,
        SUM(CAST(debet AS DECIMAL)) as total_debet
      FROM bank_statement
      WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
      GROUP BY EXTRACT(MONTH FROM tanggal)
    `.catch(e => { console.error('Error Q3:', e.message); return []; });
    console.log('Q3 (bankDebetUnmatched) results count:', q3.length);

    // 4. Q4: monthlyBalance
    const q4 = await prisma.$queryRaw`
      SELECT 
        m.bulan,
        COALESCE(inc.total_penerimaan, 0) as penerimaan,
        COALESCE(exp.total_pengeluaran, 0) as pengeluaran,
        COALESCE(bank.saldo_akhir_bank, 0) as saldo_bank,
        COALESCE(exp_unmatched.total, 0) as pengeluaran_belum_rekon,
        COALESCE(debet_unmatched.total, 0) as bank_debet_belum_cocok
      FROM (SELECT generate_series(1,12) as bulan) m
      LEFT JOIN (
        SELECT bln, SUM(total) as total_penerimaan FROM (
          SELECT 1 as bln, SUM(CAST(nilai AS DECIMAL)) as total FROM saldo_awal WHERE tahun = ${currentYear}
          UNION ALL
          SELECT EXTRACT(MONTH FROM tanggal)::int as bln, SUM(CAST(nilai AS DECIMAL)) as total
          FROM data_pendapatan WHERE tahun = ${currentYear}
          GROUP BY EXTRACT(MONTH FROM tanggal)
        ) sub GROUP BY bln
      ) inc ON inc.bln = m.bulan
      LEFT JOIN (
        SELECT bln, SUM(nilai) as total_pengeluaran FROM (
          SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bln,
                 nilai_bruto as nilai
          FROM data_sp2d WHERE tahun = ${currentYear}
          UNION ALL
          SELECT EXTRACT(MONTH FROM tanggal)::int as bln, CAST(nilai AS DECIMAL) as nilai
          FROM setoran_pajak
          WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear}
          AND NOT EXISTS (
            SELECT 1 FROM data_sp2d_potongan p WHERE p.nomor_sp2d = setoran_pajak.nomor_bukti
          )
        ) combined_exp
        GROUP BY bln
      ) exp ON exp.bln = m.bulan
      LEFT JOIN (
        SELECT bln,
          SUM(monthly_delta) OVER (ORDER BY bln ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as saldo_akhir_bank
        FROM (
          SELECT EXTRACT(MONTH FROM tanggal)::int as bln,
            SUM(CAST(kredit AS DECIMAL)) - SUM(CAST(debet AS DECIMAL)) as monthly_delta
          FROM bank_statement
          WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear}
          GROUP BY EXTRACT(MONTH FROM tanggal)
        ) monthly_bank
      ) bank ON bank.bln = m.bulan
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))::int as bln, SUM(CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE (nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), nilai_potongan)) END) as total
        FROM data_sp2d WHERE tahun = ${currentYear} AND (status_rekon = 'BELUM' OR status_rekon IS NULL)
        GROUP BY EXTRACT(MONTH FROM COALESCE(tanggal_pencairan, tanggal))
      ) exp_unmatched ON exp_unmatched.bln = m.bulan
      LEFT JOIN (
        SELECT EXTRACT(MONTH FROM tanggal)::int as bln, SUM(CAST(debet AS DECIMAL)) as total
        FROM bank_statement 
        WHERE EXTRACT(YEAR FROM tanggal) = ${currentYear} AND is_matched = false AND CAST(debet AS DECIMAL) > 0
        GROUP BY EXTRACT(MONTH FROM tanggal)
      ) debet_unmatched ON debet_unmatched.bln = m.bulan
      ORDER BY m.bulan ASC
    `.catch(e => { console.error('Error Q4:', e.message); return []; });
    console.log('Q4 (monthlyBalance) results count:', q4.length);
    if (q4.length > 0) {
      console.log('Q4 monthlyBalance details (Jan-Mar):', q4.slice(0, 3));
    }

    // 5. Q5: opdSummary
    const q5 = await prisma.$queryRaw`
      SELECT 
        opd,
        COUNT(*)::int as total_sp2d,
        COUNT(CASE WHEN status_rekon LIKE 'SUDAH%' OR status_rekon LIKE 'ANOMALI%' THEN 1 END)::int as sudah_rekon,
        COUNT(CASE WHEN status_rekon = 'BELUM' OR status_rekon IS NULL THEN 1 END)::int as belum_rekon,
        SUM(CAST(CASE WHEN status_rekon = 'SUDAH_BRUTO' THEN nilai_bruto ELSE nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), nilai_potongan) END AS DECIMAL)) as total_neto,
        SUM(CASE WHEN status_rekon = 'BELUM' OR status_rekon IS NULL THEN CAST(nilai_bruto - COALESCE((SELECT SUM(p.nilai) FROM data_sp2d_potongan p WHERE p.id_sp2d = data_sp2d.id AND (p.keterangan IS NULL OR p.keterangan != 'AUTO_HEADER')), nilai_potongan) AS DECIMAL) ELSE 0 END) as neto_belum_rekon
      FROM data_sp2d
      WHERE tahun = ${currentYear}
      GROUP BY opd
    `.catch(e => { console.error('Error Q5:', e.message); return []; });
    console.log('Q5 (opdSummary) results count:', q5.length);

    // 6. Q6: matchedWithDiscrepancy
    const q6 = await prisma.$queryRaw`
      SELECT * FROM (
        SELECT CAST(id AS VARCHAR) as id, 'SP2D' as tipe, tanggal_pencairan as tanggal, nomor as bukti, opd, uraian, CAST(nilai_neto AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM data_sp2d WHERE tahun = ${currentYear} AND (ABS(COALESCE(selisih_rekon, 0)) > 0 OR (keterangan_rekon LIKE '%Catatan Admin:%' AND keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%'))
        UNION ALL
        SELECT CAST(id AS VARCHAR) as id, 'PENDAPATAN' as tipe, tanggal, nomor_bukti as bukti, 'BENDAHARA' as opd, uraian, CAST(nilai AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM data_pendapatan WHERE tahun = ${currentYear} AND (ABS(COALESCE(selisih_rekon, 0)) > 0 OR (keterangan_rekon LIKE '%Catatan Admin:%' AND keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%'))
        UNION ALL
        SELECT CAST(p.id AS VARCHAR) as id, 'POTONGAN' as tipe, COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal) as tanggal, p.nomor_sp2d as bukti, p.opd, p.uraian, CAST(p.nilai AS DECIMAL) as nilai, CAST(COALESCE(p.selisih_rekon, 0) AS DECIMAL) as selisih, p.keterangan_rekon, p.status_rekon FROM data_sp2d_potongan p LEFT JOIN data_sp2d s ON p.id_sp2d = s.id WHERE EXTRACT(YEAR FROM COALESCE(p.tanggal_pencairan, s.tanggal_pencairan, s.tanggal)) = ${currentYear} AND (ABS(COALESCE(p.selisih_rekon, 0)) > 0 OR (p.keterangan_rekon LIKE '%Catatan Admin:%' AND p.keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%')) AND p.status_rekon <> 'SUDAH_BRUTO' AND COALESCE(s.status_rekon, '') <> 'SUDAH_BRUTO'
        UNION ALL
        SELECT CAST(id AS VARCHAR) as id, 'PAJAK' as tipe, COALESCE(tanggal_pencairan, tanggal) as tanggal, nomor_bukti as bukti, opd, uraian, CAST(nilai AS DECIMAL) as nilai, CAST(COALESCE(selisih_rekon, 0) AS DECIMAL) as selisih, keterangan_rekon, status_rekon FROM setoran_pajak WHERE EXTRACT(YEAR FROM COALESCE(tanggal_pencairan, tanggal)) = ${currentYear} AND (ABS(COALESCE(selisih_rekon, 0)) > 0 OR (keterangan_rekon LIKE '%Catatan Admin:%' AND keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%'))
      ) combined WHERE (ABS(selisih) > 0.01 OR (keterangan_rekon LIKE '%Catatan Admin:%' AND keterangan_rekon NOT LIKE '%Rekon Massal (Manual Labeling)%')) ORDER BY tanggal DESC LIMIT 100
    `.catch(e => { console.error('Error Q6:', e.message); return []; });
    console.log('Q6 (matchedWithDiscrepancy) results count:', q6.length);

  } catch (err) {
    console.error('Execution failed:', err);
  } finally {
    await prisma.$disconnect();
  }
}

debugDiscrepancy();
