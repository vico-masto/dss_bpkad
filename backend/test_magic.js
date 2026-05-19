const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function test() {
  try {
    // 1. Test SP2D Netto
    console.log('\n=== SP2D BELUM REKON ===');
    const sp2dResult = await prisma.$queryRaw`
      SELECT CAST(id AS VARCHAR) as id, CAST(nomor AS VARCHAR) as bukti, CAST(nilai_neto AS DECIMAL) as nilai, tanggal, 'KELUAR' as tipe 
      FROM data_sp2d WHERE status_rekon = 'BELUM' LIMIT 3
    `;
    console.log('Count type check:', sp2dResult.length, 'rows');
    if (sp2dResult.length > 0) {
      const row = sp2dResult[0];
      console.log('Sample row:', JSON.stringify({ id: row.id, bukti: row.bukti, nilai: row.nilai, tipOfNilai: typeof Number(row.nilai) }));
    }

    // 2. Test Potongan
    console.log('\n=== RINCIAN POTONGAN ===');
    const potonganResult = await prisma.$queryRaw`
      SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti, CAST(p.nilai AS DECIMAL) as nilai, p.tanggal_pencairan as tanggal, 'POTONGAN' as tipe 
      FROM data_sp2d_potongan p
      LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
      WHERE b.id IS NULL LIMIT 3
    `;
    console.log('Potongan rows:', potonganResult.length);
    if (potonganResult.length > 0) {
      console.log('Sample:', JSON.stringify(potonganResult[0]));
    }

    // 3. Test full UNION
    console.log('\n=== FULL UNION TEST ===');
    const fullUnion = await prisma.$queryRaw`
      SELECT CAST(id AS VARCHAR) as id, CAST(nomor AS VARCHAR) as bukti, CAST(uraian AS VARCHAR) as uraian, CAST(nilai_neto AS DECIMAL) as nilai, tanggal, 'KELUAR' as tipe FROM data_sp2d WHERE status_rekon = 'BELUM'
      UNION ALL
      SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, CAST(p.nilai AS DECIMAL) as nilai, p.tanggal_pencairan as tanggal, 'POTONGAN' as tipe FROM data_sp2d_potongan p LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id WHERE b.id IS NULL
      LIMIT 5
    `;
    console.log('Full UNION rows:', fullUnion.length);
    if (fullUnion.length > 0) console.log('First row:', JSON.stringify(fullUnion[0]));

    // 4. Test bank statements (DEBET)
    console.log('\n=== BANK DEBET (unmatched) ===');
    const bankDebet = await prisma.bank_statement.findMany({
      where: { is_matched: false, debet: { gt: 0 } },
      take: 3
    });
    console.log('Unmatched debet rows:', bankDebet.length);
    if (bankDebet.length > 0) {
      console.log('Sample:', JSON.stringify({ 
        debet: bankDebet[0].debet, 
        tanggal: bankDebet[0].tanggal, 
        deskripsi: bankDebet[0].deskripsi 
      }));
    }

    // 5. Check nilai_neto data type issue
    const sp2dRaw = await prisma.data_sp2d.findFirst({ where: { status_rekon: 'BELUM' }});
    if (sp2dRaw) {
      console.log('\n=== SP2D RAW DATA TYPE CHECK ===');
      console.log('nilai_neto type:', typeof sp2dRaw.nilai_neto, sp2dRaw.nilai_neto?.constructor?.name);
      console.log('nilai_neto value:', sp2dRaw.nilai_neto);
      console.log('Number(nilai_neto):', Number(sp2dRaw.nilai_neto));
    }

  } catch (err) {
    console.error('\n!!! ERROR !!!', err.message);
    console.error(err.stack);
  } finally {
    await prisma.$disconnect();
  }
}
test();
