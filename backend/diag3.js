const { PrismaClient } = require('./node_modules/@prisma/client');
const p = new PrismaClient();

async function run() {
  // Cek data_pendapatan dengan nilai ~425 di tanggal 26/01/26
  const pend = await p.$queryRaw`
    SELECT p.id, p.nomor_bukti, p.uraian, p.nilai, p.tanggal, p.status_rekon,
           b.id as bank_id, b.is_matched
    FROM data_pendapatan p
    LEFT JOIN bank_statement b ON b.ref_bku_id = p.id::text
    WHERE p.tanggal::date = '2026-01-26'
      AND ABS(CAST(p.nilai AS DECIMAL) - 425.01) < 1
    ORDER BY p.id
  `;

  console.log('\n=== DATA PENDAPATAN 26/01/26 nilai ~425.01 ===');
  console.log('TOTAL:', pend.length, 'records');
  console.log('ID    | Nomor Bukti        | Status       | BankRef');
  pend.forEach(r => {
    console.log(`${String(r.id).padEnd(5)} | ${String(r.nomor_bukti||'').padEnd(19)} | ${String(r.status_rekon||'BELUM').padEnd(12)} | ${r.bank_id || 'TIDAK ADA'}`);
  });

  // Cek semua bank BELUM di 26/01/26
  const bankBelum = await p.$queryRaw`
    SELECT id, COALESCE(debet,0) as debet, COALESCE(kredit,0) as kredit, 
           is_matched, ref_bku_id, deskripsi
    FROM bank_statement
    WHERE tanggal::date = '2026-01-26'
      AND is_matched = false
    ORDER BY id
  `;
  
  console.log('\n=== BANK 26/01/26 yang BELUM MATCHED ===');
  console.log('TOTAL:', bankBelum.length, 'bank records BELUM');
  bankBelum.forEach(r => {
    const val = r.debet > 0 ? `D:${r.debet}` : `K:${r.kredit}`;
    console.log(`BankID:${r.id} | ${val} | ${r.deskripsi?.substring(0,30)}`);
  });

  await p.$disconnect();
}

run().catch(e => { console.error('ERROR:', e.message); p.$disconnect(); });
