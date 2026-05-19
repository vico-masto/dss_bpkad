const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function runPendapatanAudit() {
  console.log("=== DIAGNOSTIC AUDIT: ANOMALI DATA PENDAPATAN ===");

  const targetTahun = 2026;

  // 1. Cek Total Data Pendapatan berdasarkan status_rekon
  const statusCounts = await prisma.$queryRaw`
    SELECT COALESCE(status_rekon, 'NULL/EMPTY') as status, COUNT(*)::int as jumlah
    FROM data_pendapatan
    GROUP BY status_rekon
  `;
  console.log("\n1. Distribusi status_rekon pada data_pendapatan:");
  console.log(statusCounts);

  // 2. Cek Pendapatan Belum Rekon (Benar-benar belum rekon dan tidak ada bank_statement yang link ke sana)
  const unmatchedPendapatan = await prisma.$queryRaw`
    SELECT p.id, p.nomor_bukti, p.tanggal, p.nilai, p.status_rekon
    FROM data_pendapatan p
    LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
    WHERE p.tahun = ${targetTahun} 
      AND b.id IS NULL 
      AND (p.status_rekon = 'BELUM' OR p.status_rekon IS NULL OR p.status_rekon = '')
    ORDER BY p.tanggal DESC
  `;
  console.log(`\n2. Pendapatan Belum Rekon (Status BELUM, tanpa link Bank): ${unmatchedPendapatan.length}`);
  if (unmatchedPendapatan.length > 0) {
    console.log("Contoh 3 teratas:");
    console.log(unmatchedPendapatan.slice(0, 3));
  }

  // 3. Cek Ghost Matches Pendapatan (Status SUDAH tapi tidak ada link bank)
  const ghostMatches = await prisma.$queryRaw`
    SELECT p.id, p.nomor_bukti, p.tanggal, p.nilai, p.status_rekon
    FROM data_pendapatan p
    LEFT JOIN bank_statement b ON p.id::text = b.ref_bku_id
    WHERE p.tahun = ${targetTahun}
      AND COALESCE(p.status_rekon, 'BELUM') NOT IN ('BELUM')
      AND b.id IS NULL
    ORDER BY p.tanggal DESC
  `;
  console.log(`\n3. Ghost Matches Pendapatan (Status SUDAH, tanpa link Bank): ${ghostMatches.length}`);
  if (ghostMatches.length > 0) {
    console.log("Contoh 3 teratas:");
    console.log(ghostMatches.slice(0, 3));
  }

  // 4. Cek Pendapatan dengan status BELUM tapi ADA link bank (Inkonsistensi)
  const inconsistentPendapatan = await prisma.$queryRaw`
    SELECT p.id, p.nomor_bukti, p.tanggal, p.nilai, p.status_rekon, b.id as bank_id, b.debet, b.kredit
    FROM data_pendapatan p
    JOIN bank_statement b ON p.id::text = b.ref_bku_id
    WHERE p.tahun = ${targetTahun}
      AND p.status_rekon = 'BELUM'
  `;
  console.log(`\n4. Inkonsistensi Status (Status BELUM, tapi ADA link Bank): ${inconsistentPendapatan.length}`);
  if (inconsistentPendapatan.length > 0) {
    console.log("Contoh:");
    console.log(inconsistentPendapatan.slice(0, 3));
  }

  // 5. Cek Double Matching Pendapatan (Satu data_pendapatan di-link oleh lebih dari 1 bank_statement)
  const doubleMatches = await prisma.$queryRaw`
    SELECT b.ref_bku_id, p.nomor_bukti, COUNT(*)::int as jumlah_link_bank
    FROM bank_statement b
    JOIN data_pendapatan p ON p.id::text = b.ref_bku_id
    WHERE b.is_matched = true
    GROUP BY b.ref_bku_id, p.nomor_bukti
    HAVING COUNT(*) > 1
  `;
  console.log(`\n5. Double Matches Pendapatan (1 Pendapatan di-link banyak Bank Statement): ${doubleMatches.length}`);
  if (doubleMatches.length > 0) {
    console.log(doubleMatches.slice(0, 3));
  }

  // 6. Mari cari tahu apakah ada unmatched pendapatan yang memiliki pasangan nilai kredit persis di bank_statement (tapi belum di-match)
  let potentialMatchesCount = 0;
  console.log(`\n6. Mencari pasangan nilai eksak di bank_statement untuk Pendapatan Belum Rekon...`);
  for (const p of unmatchedPendapatan) {
    // Jendela waktu untuk penerimaan/pendapatan adalah H-1 s.d. H+1 atau H-2 s.d. H+2
    const tgl = new Date(p.tanggal);
    const startWindow = new Date(tgl.getTime() - 2 * 24 * 60 * 60 * 1000);
    const endWindow = new Date(tgl.getTime() + 2 * 24 * 60 * 60 * 1000);

    const matches = await prisma.bank_statement.findMany({
      where: {
        kredit: { gt: 0 },
        tanggal: { gte: startWindow, lte: endWindow }
      }
    });

    const exactVal = Number(p.nilai);
    const exactMatches = matches.filter(b => Math.abs(Number(b.kredit) - exactVal) < 1);
    
    if (exactMatches.length > 0) {
      potentialMatchesCount++;
      // console.log(`  -> Pendapatan ${p.nomor_bukti} (Rp ${exactVal.toLocaleString('id-ID')}) memiliki ${exactMatches.length} kandidat di bank (is_matched: ${exactMatches.map(m=>m.is_matched).join(', ')})`);
    }
  }
  console.log(`Jumlah Pendapatan Belum Rekon yang SEBENARNYA memiliki nilai sama persis di bank (dalam ±2 hari): ${potentialMatchesCount}`);

  await prisma.$disconnect();
}

runPendapatanAudit();
