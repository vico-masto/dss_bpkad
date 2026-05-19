const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function audit() {
  console.log('--- START DEEP AUDIT ---');

  const sp2dUnmatched = await prisma.data_sp2d.count({
    where: { NOT: { status_rekon: { startsWith: 'SUDAH' } } }
  });

  const bankUnmatched = await prisma.bank_statement.count({
    where: { is_matched: false }
  });

  const sp2dUnmatchedValue = await prisma.data_sp2d.aggregate({
    where: { NOT: { status_rekon: { startsWith: 'SUDAH' } } },
    _sum: { nilai_bruto: true }
  });

  const bankUnmatchedValue = await prisma.bank_statement.aggregate({
    where: { is_matched: false },
    _sum: { debet: true, kredit: true }
  });

  console.log('SP2D Belum Rekon (Count):', sp2dUnmatched);
  console.log('SP2D Belum Rekon (Total Value):', sp2dUnmatchedValue._sum.nilai_bruto);
  console.log('Mutasi Bank Belum Rekon (Count):', bankUnmatched);
  console.log('Mutasi Bank Belum Rekon (Total Value):', Number(bankUnmatchedValue._sum.debet || 0) + Number(bankUnmatchedValue._sum.kredit || 0));

  // Check date range
  const firstSp2d = await prisma.data_sp2d.findFirst({
    where: { NOT: { status_rekon: { startsWith: 'SUDAH' } } },
    orderBy: { tanggal: 'asc' }
  });
  const lastSp2d = await prisma.data_sp2d.findFirst({
    where: { NOT: { status_rekon: { startsWith: 'SUDAH' } } },
    orderBy: { tanggal: 'desc' }
  });

  const firstBank = await prisma.bank_statement.findFirst({
    orderBy: { tanggal: 'asc' }
  });
  const lastBank = await prisma.bank_statement.findFirst({
    orderBy: { tanggal: 'desc' }
  });

  console.log('\n--- DATE RANGE ANALYSIS ---');
  console.log('Range SP2D Belum Rekon:', firstSp2d?.tanggal, 's/d', lastSp2d?.tanggal);
  console.log('Range Mutasi Bank (Tersedia):', firstBank?.tanggal, 's/d', lastBank?.tanggal);

  // Check if there are SP2Ds outside Bank Range
  if (firstSp2d && firstBank && firstSp2d.tanggal < firstBank.tanggal) {
    console.log('WARNING: Ada SP2D yang lebih tua dari data mutasi bank tertua!');
  }
  if (lastSp2d && lastBank && lastSp2d.tanggal > lastBank.tanggal) {
    console.log('WARNING: Ada SP2D yang lebih baru dari data mutasi bank terbaru!');
  }

  process.exit(0);
}

audit();
