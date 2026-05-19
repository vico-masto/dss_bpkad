const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

async function run() {
  // Cek potongan dengan nilai ~425.94 dan ~425.01
  const potongan = await p.$queryRaw`
    SELECT p.id, p.uraian, p.nilai, p.status_rekon, 
           b.id as bank_id, b.ref_bku_id,
           b.is_matched
    FROM data_sp2d_potongan p
    LEFT JOIN bank_statement b ON b.ref_bku_id = p.id::text
    WHERE ABS(CAST(p.nilai AS DECIMAL) - 425.94) < 1 
       OR ABS(CAST(p.nilai AS DECIMAL) - 425.01) < 1
    ORDER BY p.id DESC
    LIMIT 20
  `;
  
  console.log('=== SP2D POTONGAN dengan nilai ~425 ===');
  console.log('ID       | Nilai   | Status       | Bank ID | Bank Matched?');
  potongan.forEach(r => {
    console.log(`${String(r.id).padEnd(8)} | ${String(r.nilai).padEnd(7)} | ${String(r.status_rekon||'NULL').padEnd(12)} | ${String(r.bank_id||'-').padEnd(7)} | ${r.is_matched ?? '-'}`);
  });

  // Bank di tanggal 26/01/2026 dengan nilai ~425
  const bank = await p.$queryRaw`
    SELECT id, tanggal, COALESCE(debet,0) as debet, COALESCE(kredit,0) as kredit, 
           is_matched, ref_bku_id
    FROM bank_statement
    WHERE (ABS(COALESCE(debet,0) - 425.94) < 1 OR ABS(COALESCE(kredit,0) - 425.94) < 1
        OR ABS(COALESCE(debet,0) - 425.01) < 1 OR ABS(COALESCE(kredit,0) - 425.01) < 1)
      AND tanggal::date = '2026-01-26'
    ORDER BY id
  `;
  
  console.log('\n=== BANK 26/01/2026 nilai ~425 ===');
  console.log('Bank ID  | Nilai   | is_matched | ref_bku_id');
  bank.forEach(r => {
    const val = r.debet > 0 ? r.debet : r.kredit;
    console.log(`${String(r.id).padEnd(8)} | ${String(val).padEnd(7)} | ${String(r.is_matched).padEnd(10)} | ${r.ref_bku_id || 'NULL'}`);
  });

  // Inkonsistensi: BKU SUDAH tapi tidak ada bank yang referensikan
  const inconsistent = await p.$queryRaw`
    SELECT 'POTONGAN' as tbl, p.id, p.nilai, p.status_rekon
    FROM data_sp2d_potongan p
    WHERE p.status_rekon LIKE 'SUDAH%'
      AND NOT EXISTS (SELECT 1 FROM bank_statement b WHERE b.ref_bku_id = p.id::text)
    LIMIT 10
  `;
  
  console.log('\n=== INKONSISTENSI (BKU SUDAH tapi tanpa link bank) ===');
  if (inconsistent.length === 0) {
    console.log('✅ Tidak ada inkonsistensi');
  } else {
    inconsistent.forEach(r => console.log(`${r.tbl} ID:${r.id} Nilai:${r.nilai} Status:${r.status_rekon}`));
  }

  await p.$disconnect();
}

run().catch(e => { console.error('ERROR:', e.message); p.$disconnect(); });
