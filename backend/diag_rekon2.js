const prisma = require('./prismaClient');
async function check() {
  // 1. Data_sp2d_potongan BELUM — parent SP2D status?
  const belumWithParent = await prisma.$queryRaw`
    SELECT h.status_rekon as sp2d_status, p.jenis_potongan, COUNT(*)::int as jumlah, SUM(CAST(p.nilai AS DECIMAL)) as total
    FROM data_sp2d_potongan p
    JOIN data_sp2d h ON p.id_sp2d = h.id
    WHERE p.status_rekon = 'BELUM'
    GROUP BY h.status_rekon, p.jenis_potongan
    ORDER BY jumlah DESC
  `;
  console.log('BELUM potongan — status SP2D induk:');
  belumWithParent.forEach(r => console.log(` SP2D=${r.sp2d_status} | jenis=${r.jenis_potongan} | ${r.jumlah} records | Rp ${Number(r.total||0).toLocaleString('id-ID')}`));

  // 2. Setoran pajak status
  const sjkStatus = await prisma.$queryRaw`SELECT status_rekon, COUNT(*)::int as jumlah, SUM(CAST(nilai AS DECIMAL)) as total FROM setoran_pajak GROUP BY status_rekon ORDER BY jumlah DESC`;
  console.log('\nSetoran pajak status:');
  sjkStatus.forEach(r => console.log(` ${r.status_rekon ?? 'NULL'}: ${r.jumlah} records, Rp ${Number(r.total||0).toLocaleString('id-ID')}`));

  // 3. Bank statement unmatched summary
  const bankUnmatched = await prisma.$queryRaw`
    SELECT COUNT(*)::int as jumlah, SUM(CAST(debet AS DECIMAL)) as total_debet, SUM(CAST(kredit AS DECIMAL)) as total_kredit
    FROM bank_statement WHERE is_matched = false
  `;
  console.log('\nBank unmatched:');
  bankUnmatched.forEach(r => console.log(` ${r.jumlah} records | debet Rp ${Number(r.total_debet||0).toLocaleString('id-ID')} | kredit Rp ${Number(r.total_kredit||0).toLocaleString('id-ID')}`));

  // 4. BELUM potongan dengan id_billing ada vs tidak
  const billingCheck = await prisma.$queryRaw`
    SELECT CASE WHEN id_billing IS NOT NULL THEN 'Ada billing' ELSE 'Tanpa billing' END as billing, COUNT(*)::int as jumlah
    FROM data_sp2d_potongan WHERE status_rekon = 'BELUM'
    GROUP BY billing
  `;
  console.log('\nBELUM potongan — id_billing:');
  billingCheck.forEach(r => console.log(` ${r.billing}: ${r.jumlah}`));

  // 5. Sample BELUM potongan
  const samples = await prisma.$queryRaw`
    SELECT p.id, p.jenis_potongan, CAST(p.nilai AS DECIMAL) as nilai, p.nomor_sp2d, p.tanggal_pencairan, h.status_rekon as sp2d_status, h.status_rekon as sp2d_rekon
    FROM data_sp2d_potongan p
    JOIN data_sp2d h ON p.id_sp2d = h.id
    WHERE p.status_rekon = 'BELUM'
    LIMIT 10
  `;
  console.log('\nSample BELUM potongan:');
  samples.forEach(r => console.log(` ${r.jenis_potongan} | Rp ${Number(r.nilai||0).toLocaleString('id-ID')} | SP2D=${r.nomor_sp2d} | tgl=${r.tanggal_pencairan} | SP2D status=${r.sp2d_status}`));

  await prisma.$disconnect();
}
check().catch(e => { console.error(e); process.exit(1); });
