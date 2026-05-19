// Test: Simulate exactly what Magic Match does, step by step
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const toNum = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(v.toString());
  return isNaN(n) ? 0 : n;
};

async function test() {
  try {
    // 1. Get unmatched bank DEBET items
    const bankItems = await prisma.bank_statement.findMany({ 
      where: { is_matched: false },
      take: 10,
      orderBy: { tanggal: 'asc' }
    });
    console.log(`\nUnmatched bank items: ${bankItems.length}`);
    const debetItems = bankItems.filter(b => toNum(b.debet) > 0);
    const kreditItems = bankItems.filter(b => toNum(b.kredit) > 0);
    console.log(`  - Debet (pengeluaran): ${debetItems.length}`);
    console.log(`  - Kredit (penerimaan): ${kreditItems.length}`);

    if (debetItems.length > 0) {
      const sample = debetItems[0];
      console.log(`\nSample DEBET: nilai=${toNum(sample.debet)}, tgl=${sample.tanggal}, deskripsi="${sample.deskripsi}"`);
    }

    // 2. Get BKU items
    const bkuItems = await prisma.$queryRaw`
       SELECT CAST(id AS VARCHAR) as id, CAST(nomor AS VARCHAR) as bukti, CAST(uraian AS VARCHAR) as uraian, CAST(nilai_neto AS DECIMAL) as nilai, tanggal, 'KELUAR' as tipe FROM data_sp2d
       WHERE status_rekon = 'BELUM'
       UNION ALL
       SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, CAST(p.nilai AS DECIMAL) as nilai, p.tanggal_pencairan as tanggal, 'POTONGAN' as tipe FROM data_sp2d_potongan p
       LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
       WHERE b.id IS NULL
       UNION ALL
       SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_bukti AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, CAST(p.nilai AS DECIMAL) as nilai, p.tanggal, 'MASUK' as tipe FROM data_pendapatan p
       LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
       WHERE b.id IS NULL
    `;
    console.log(`\nBKU Items loaded: ${bkuItems.length}`);
    
    const keluarItems = bkuItems.filter(b => b.tipe === 'KELUAR');
    const potonganItems = bkuItems.filter(b => b.tipe === 'POTONGAN');
    console.log(`  - KELUAR (SP2D): ${keluarItems.length}`);
    console.log(`  - POTONGAN: ${potonganItems.length}`);
    
    if (keluarItems.length > 0) {
      const s = keluarItems[0];
      console.log(`\nSample SP2D: nilai=${toNum(s.nilai)}, tgl=${s.tanggal}, tipe_nilai=${typeof s.nilai}`);
    }

    // 3. Try to simulate matching
    if (debetItems.length > 0 && bkuItems.length > 0) {
      const bankItem = debetItems[0];
      const val = toNum(bankItem.debet);
      const bankDate = new Date(bankItem.tanggal);
      console.log(`\n--- Trying to match bank debet=${val}, tgl=${bankDate.toISOString().split('T')[0]} ---`);
      
      let found = false;
      for (const bku of bkuItems) {
        if (bku.tipe === 'MASUK') continue;
        const bkuNilai = toNum(bku.nilai);
        const diff = Math.abs(bkuNilai - val);
        if (diff < 1) {
          const bkuDate = new Date(bku.tanggal);
          const diffDays = (bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24);
          console.log(`  ✅ NILAI MATCH! bku_nilai=${bkuNilai}, diff=${diff}, diffDays=${diffDays.toFixed(1)}, tipe=${bku.tipe}`);
          found = true;
        }
      }
      if (!found) {
        console.log(`  ❌ No value match found for ${val}`);
        // Show closest matches
        const sorted = bkuItems
          .filter(b => b.tipe !== 'MASUK')
          .map(b => ({ ...b, diff: Math.abs(toNum(b.nilai) - val) }))
          .sort((a,b) => a.diff - b.diff)
          .slice(0, 3);
        console.log('  Closest SP2D values:', sorted.map(s => `${toNum(s.nilai)} (diff=${s.diff.toFixed(2)})`));
      }
    }

    // 4. Test the transaction that causes 500
    console.log('\n--- Testing update transaction ---');
    const testBankItem = await prisma.bank_statement.findFirst({ where: { is_matched: false } });
    const testSp2d = await prisma.data_sp2d.findFirst({ where: { status_rekon: 'BELUM' } });
    if (testBankItem && testSp2d) {
      console.log(`Bank ID type: ${typeof testBankItem.id} = ${testBankItem.id}`);
      console.log(`SP2D ID type: ${typeof testSp2d.id} = ${testSp2d.id}`);
      // Do NOT actually run the update - just validate the types
      console.log('Types look OK for update');
    }

  } catch (err) {
    console.error('\n!!! ERROR !!!', err.message);
    console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}
test();
