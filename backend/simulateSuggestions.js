const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const bankId = 6943;
  const bankItem = await prisma.bank_statement.findUnique({ where: { id: bankId } });
  
  const totalVal = Number(bankItem.debet) || Number(bankItem.kredit);
  const isOut = Number(bankItem.debet) > 0;

  console.log(`Investigating Suggestions for Bank ID ${bankId} (${bankItem.deskripsi}, Val: ${totalVal})`);

  // Simulating getSuggestions query but WITHOUT the status_rekon = 'BELUM' filter 
  // so we can see if it WOULD match if it were unmatched.
  const sp2dCandidates = await prisma.$queryRaw`
    SELECT 
      CAST(id AS VARCHAR) as id,
      nomor as bukti,
      uraian,
      CAST(nilai_neto AS DECIMAL) as nilai_neto,
      CAST(nilai_bruto AS DECIMAL) as nilai_bruto,
      tanggal,
      'KELUAR' as tipe,
      status_rekon
    FROM data_sp2d
    WHERE (
      ABS(CAST(nilai_neto AS DECIMAL) - ${totalVal}) < 10000 OR
      ABS(CAST(nilai_bruto AS DECIMAL) - ${totalVal}) < 10000
    )
    ORDER BY ABS(CAST(nilai_neto AS DECIMAL) - ${totalVal}) ASC
    LIMIT 15
  `;

  const toNumber = (v) => { const n = Number(v?.toString()); return isNaN(n) ? 0 : n; };

  const results = sp2dCandidates.map(c => {
    const neto = toNumber(c.nilai_neto);
    const bruto = toNumber(c.nilai_bruto);
    const selisihNeto = Math.abs(neto - totalVal);
    const selisihBruto = Math.abs(bruto - totalVal);
    const bestSelisih = Math.min(selisihNeto, selisihBruto);
    const matchMode = selisihNeto <= selisihBruto ? 'neto' : 'bruto';
    
    return {
      bukti: c.bukti,
      nilai_neto: neto,
      selisih: bestSelisih,
      match_mode: matchMode,
      is_exact: bestSelisih < 1,
      suggestion_type: bestSelisih < 1 ? 'EXACT' : 'CLOSE',
      status_rekon: c.status_rekon
    };
  });

  console.log("\nSuggestion Results:");
  console.log(results);
}

run().finally(() => prisma.$disconnect());
