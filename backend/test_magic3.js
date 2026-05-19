// Deep analysis: WHY is Magic Match not working for most records?
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const toNum = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(v.toString());
  return isNaN(n) ? 0 : n;
};

async function analyze() {
  try {
    // === ANALYSIS 1: Pendapatan vs Bank Statement ===
    console.log('\n========= ANALISA PENERIMAAN =========');
    const totalPendapatan = await prisma.data_pendapatan.count();
    const bankKredit = await prisma.bank_statement.count({ where: { kredit: { gt: 0 } } });
    const bankKreditUnmatched = await prisma.bank_statement.count({ where: { kredit: { gt: 0 }, is_matched: false } });
    const pendapatanLinked = await prisma.bank_statement.count({ where: { ref_bku_id: { not: null }, kredit: { gt: 0 } } });
    
    console.log(`Total data_pendapatan: ${totalPendapatan}`);
    console.log(`Total bank KREDIT rows: ${bankKredit}`);
    console.log(`Bank KREDIT unmatched: ${bankKreditUnmatched}`);
    console.log(`Bank rows already linked to pendapatan: ${pendapatanLinked}`);

    // Sample unmatched kredit vs pendapatan value comparison
    const sampleKredit = await prisma.bank_statement.findMany({ where: { kredit: { gt: 0 }, is_matched: false }, take: 5 });
    console.log('\nSample unmatched bank KREDIT:');
    for (const b of sampleKredit) {
      const kredit = toNum(b.kredit);
      const tgl = new Date(b.tanggal);
      // Find matching pendapatan
      const match = await prisma.data_pendapatan.findFirst({
        where: { nilai: kredit }
      });
      console.log(`  Bank kredit=${kredit}, tgl=${tgl.toISOString().split('T')[0]} → pendapatan match by value: ${match ? `FOUND (id=${match.id}, tgl=${new Date(match.tanggal).toISOString().split('T')[0]})` : 'NOT FOUND'}`);
    }

    // === ANALYSIS 2: SP2D Netto vs Bank Debet ===
    console.log('\n========= ANALISA PENGELUARAN SP2D =========');
    const totalSP2D = await prisma.data_sp2d.count({ where: { status_rekon: 'BELUM' } });
    const bankDebet = await prisma.bank_statement.count({ where: { debet: { gt: 0 }, is_matched: false } });
    console.log(`SP2D belum rekon: ${totalSP2D}`);
    console.log(`Bank DEBET unmatched: ${bankDebet}`);

    // Sample: Try to match first 5 bank debet items purely by value
    const sampleDebet = await prisma.bank_statement.findMany({ where: { debet: { gt: 0 }, is_matched: false }, take: 5, orderBy: { tanggal: 'asc' } });
    console.log('\nSample unmatched bank DEBET (pure value matching):');
    for (const b of sampleDebet) {
      const debet = toNum(b.debet);
      const tglBank = new Date(b.tanggal);
      
      // Try exact match with SP2D netto
      const sp2dExact = await prisma.$queryRaw`
        SELECT id, nomor, nilai_neto, tanggal FROM data_sp2d 
        WHERE status_rekon = 'BELUM' AND ABS(CAST(nilai_neto AS DECIMAL) - ${debet}) < 1
        ORDER BY ABS(tanggal - ${tglBank.toISOString().split('T')[0]}::date) ASC
        LIMIT 1
      `;
      
      // Try exact match with potongan
      const potExact = await prisma.$queryRaw`
        SELECT CAST(p.id AS VARCHAR) as id, p.nomor_sp2d, p.nilai, p.tanggal_pencairan FROM data_sp2d_potongan p
        WHERE ABS(CAST(p.nilai AS DECIMAL) - ${debet}) < 1
        ORDER BY ABS(p.tanggal_pencairan - ${tglBank.toISOString().split('T')[0]}::date) ASC
        LIMIT 1
      `;

      const sp2dResult = sp2dExact[0];
      const potResult = potExact[0];
      
      if (sp2dResult) {
        const diffDays = Math.abs((new Date(sp2dResult.tanggal) - tglBank) / (1000*3600*24));
        console.log(`  Bank debet=${debet}, tgl=${tglBank.toISOString().split('T')[0]}`);
        console.log(`    → SP2D MATCH: neto=${toNum(sp2dResult.nilai_neto)}, tgl=${new Date(sp2dResult.tanggal).toISOString().split('T')[0]}, diffDays=${diffDays.toFixed(1)}`);
      } else if (potResult) {
        const diffDays = potResult.tanggal_pencairan ? Math.abs((new Date(potResult.tanggal_pencairan) - tglBank) / (1000*3600*24)) : 99;
        console.log(`  Bank debet=${debet}, tgl=${tglBank.toISOString().split('T')[0]}`);
        console.log(`    → POTONGAN MATCH: nilai=${toNum(potResult.nilai)}, diffDays=${diffDays.toFixed(1)}`);
      } else {
        console.log(`  Bank debet=${debet}, tgl=${tglBank.toISOString().split('T')[0]} → NO MATCH by value`);
      }
    }

    // === ANALYSIS 3: Why does keyword matching fail? ===
    console.log('\n========= ANALISA KEYWORD MATCHING FAILURE =========');
    const sampleBank = await prisma.bank_statement.findMany({ where: { debet: { gt: 0 }, is_matched: false }, take: 3, orderBy: { tanggal: 'asc' }});
    for (const b of sampleBank) {
      const debet = toNum(b.debet);
      const sp2dMatch = await prisma.$queryRaw`
        SELECT nomor, uraian, nilai_neto FROM data_sp2d 
        WHERE ABS(CAST(nilai_neto AS DECIMAL) - ${debet}) < 1 LIMIT 1
      `;
      if (sp2dMatch[0]) {
        console.log(`\nBank desc: "${b.deskripsi}"`);
        console.log(`SP2D uraian: "${sp2dMatch[0].uraian}"`);
        // Check if any word from uraian appears in bank desc
        const sp2dWords = (sp2dMatch[0].uraian || '').toUpperCase().split(/[^A-Z0-9]+/).filter(w => w.length >= 3);
        const bankDesc = b.deskripsi.toUpperCase();
        const matches = sp2dWords.filter(w => bankDesc.includes(w));
        console.log(`  Keywords from SP2D: [${sp2dWords.slice(0, 5).join(', ')}]`);
        console.log(`  Keywords found in bank: [${matches.join(', ')}]`);
        console.log(`  → Keyword match: ${matches.length > 0 ? 'YES' : 'NONE - this is why it fails!'}`);
      }
    }

    // === ANALYSIS 4: Date tolerance check ===
    console.log('\n========= DATE TOLERANCE CHECK =========');
    const dateCheck = await prisma.$queryRaw`
      SELECT 
        b.id, b.debet, b.tanggal as bank_tgl,
        s.nomor, s.nilai_neto, s.tanggal as sp2d_tgl,
        ABS(b.tanggal - s.tanggal) as diff_days
      FROM bank_statement b
      CROSS JOIN data_sp2d s
      WHERE b.is_matched = false 
      AND CAST(b.debet AS DECIMAL) > 0
      AND s.status_rekon = 'BELUM'
      AND ABS(CAST(b.debet AS DECIMAL) - CAST(s.nilai_neto AS DECIMAL)) < 1
      LIMIT 10
    `;
    console.log(`Value matches found (across all dates): ${dateCheck.length}`);
    for (const r of dateCheck) {
      console.log(`  Bank debet=${toNum(r.debet)}, SP2D neto=${toNum(r.nilai_neto)}, diffDays=${r.diff_days}`);
    }

  } catch (err) {
    console.error('\n!!! ERROR !!!', err.message);
    console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}
analyze();
