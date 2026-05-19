const { PrismaClient } = require('./node_modules/@prisma/client');
const prisma = new PrismaClient();

async function resetAllStatus() {
  try {
    console.log('--- STARTING TOTAL RECONCILIATION RESET ---');
    
    // 1. Bank Statement
    const r1 = await prisma.bank_statement.updateMany({
      data: { is_matched: false, ref_bku_id: null }
    });
    console.log('Reset Bank Statement:', r1.count, 'rows');

    // 2. SP2D
    const r2 = await prisma.data_sp2d.updateMany({
      data: { status_rekon: 'BELUM', selisih_rekon: 0 }
    });
    console.log('Reset SP2D:', r2.count, 'rows');

    // 3. Pendapatan
    const r3 = await prisma.data_pendapatan.updateMany({
      data: { status_rekon: 'BELUM' }
    });
    console.log('Reset Pendapatan:', r3.count, 'rows');

    // 4. Potongan
    const r4 = await prisma.data_sp2d_potongan.updateMany({
      data: { status_rekon: 'BELUM' }
    });
    console.log('Reset Potongan:', r4.count, 'rows');

    // 5. Pajak
    const r5 = await prisma.setoran_pajak.updateMany({
      data: { status_rekon: 'BELUM' }
    });
    console.log('Reset Pajak:', r5.count, 'rows');

    console.log('--- RESET COMPLETED SUCCESSFULLY ---');
  } catch (error) {
    console.error('RESET FAILED:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetAllStatus();
