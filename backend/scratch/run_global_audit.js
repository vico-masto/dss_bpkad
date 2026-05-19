const prisma = require('../prismaClient');

async function run() {
  console.log("=== COMPREHENSIVE FINANCIAL AUDIT REPORT 2026 ===");

  // 1. Saldo Awal
  const saldoAwalRaw = await prisma.saldo_awal.aggregate({
    _sum: { nilai: true },
    where: { tahun: 2026 }
  });
  const saldoAwal = Number(saldoAwalRaw._sum.nilai || 0);
  console.log(`\n1. Saldo Awal 2026: Rp ${saldoAwal.toLocaleString('id-ID')}`);

  // 2. Data Pendapatan (Penerimaan BKU)
  const incTotal = await prisma.data_pendapatan.aggregate({
    _sum: { nilai: true },
    _count: { id: true }
  });
  
  const incRekon = await prisma.data_pendapatan.aggregate({
    _sum: { nilai: true },
    _count: { id: true },
    where: { status_rekon: 'SUDAH' }
  });
  
  const incBelumRekon = await prisma.data_pendapatan.aggregate({
    _sum: { nilai: true },
    _count: { id: true },
    where: { NOT: { status_rekon: 'SUDAH' } }
  });

  console.log(`\n2. Penerimaan BKU (Data Pendapatan):`);
  console.log(`   - Total Transaksi : ${incTotal._count.id} items`);
  console.log(`   - Total Nilai     : Rp ${Number(incTotal._sum.nilai || 0).toLocaleString('id-ID')}`);
  console.log(`   - Sudah Rekon     : ${incRekon._count.id} items (Rp ${Number(incRekon._sum.nilai || 0).toLocaleString('id-ID')})`);
  console.log(`   - Belum Rekon     : ${incBelumRekon._count.id} items (Rp ${Number(incBelumRekon._sum.nilai || 0).toLocaleString('id-ID')})`);

  // 3. Data SP2D & Potongan (Pengeluaran BKU)
  const expTotal = await prisma.data_sp2d.aggregate({
    _sum: { nilai_bruto: true, nilai_neto: true, nilai_potongan: true },
    _count: { id: true }
  });

  const expRekon = await prisma.data_sp2d.aggregate({
    _sum: { nilai_bruto: true, nilai_neto: true, nilai_potongan: true },
    _count: { id: true },
    where: { status_rekon: 'SUDAH' }
  });

  const expBelumRekon = await prisma.data_sp2d.aggregate({
    _sum: { nilai_bruto: true, nilai_neto: true, nilai_potongan: true },
    _count: { id: true },
    where: { NOT: { status_rekon: 'SUDAH' } }
  });

  const potonganTotal = await prisma.data_sp2d_potongan.aggregate({
    _sum: { nilai: true },
    _count: { id: true }
  });

  const potonganRekon = await prisma.data_sp2d_potongan.aggregate({
    _sum: { nilai: true },
    _count: { id: true },
    where: { status_rekon: 'SUDAH' }
  });

  const potonganBelum = await prisma.data_sp2d_potongan.aggregate({
    _sum: { nilai: true },
    _count: { id: true },
    where: { NOT: { status_rekon: 'SUDAH' } }
  });

  console.log(`\n3. Pengeluaran BKU (Data SP2D & Potongan):`);
  console.log(`   - Total SP2D Transaksi : ${expTotal._count.id} items`);
  console.log(`   - Total Bruto          : Rp ${Number(expTotal._sum.nilai_bruto || 0).toLocaleString('id-ID')}`);
  console.log(`   - Total Neto           : Rp ${Number(expTotal._sum.nilai_neto || 0).toLocaleString('id-ID')}`);
  console.log(`   - Total Potongan (SP2D): Rp ${Number(expTotal._sum.nilai_potongan || 0).toLocaleString('id-ID')}`);
  console.log(`   - Sudah Rekon SP2D     : ${expRekon._count.id} items (Neto: Rp ${Number(expRekon._sum.nilai_neto || 0).toLocaleString('id-ID')}, Bruto: Rp ${Number(expRekon._sum.nilai_bruto || 0).toLocaleString('id-ID')})`);
  console.log(`   - Belum Rekon SP2D     : ${expBelumRekon._count.id} items (Neto: Rp ${Number(expBelumRekon._sum.nilai_neto || 0).toLocaleString('id-ID')}, Bruto: Rp ${Number(expBelumRekon._sum.nilai_bruto || 0).toLocaleString('id-ID')})`);
  
  console.log(`\n   Potongan SP2D Rincian (data_sp2d_potongan):`);
  console.log(`   - Total Potongan Rincian: ${potonganTotal._count.id} items (Rp ${Number(potonganTotal._sum.nilai || 0).toLocaleString('id-ID')})`);
  console.log(`   - Sudah Rekon Potongan  : ${potonganRekon._count.id} items (Rp ${Number(potonganRekon._sum.nilai || 0).toLocaleString('id-ID')})`);
  console.log(`   - Belum Rekon Potongan  : ${potonganBelum._count.id} items (Rp ${Number(potonganBelum._sum.nilai || 0).toLocaleString('id-ID')})`);

  // 4. Penyesuaian
  const adjMasuk = await prisma.data_penyesuaian.aggregate({
    _sum: { nilai: true },
    where: { jenis: 'MASUK' }
  });
  const adjKeluar = await prisma.data_penyesuaian.aggregate({
    _sum: { nilai: true },
    where: { jenis: 'KELUAR' }
  });
  const valAdjMasuk = Number(adjMasuk._sum.nilai || 0);
  const valAdjKeluar = Number(adjKeluar._sum.nilai || 0);
  console.log(`\n4. Penyesuaian (Adjustment):`);
  console.log(`   - Penyesuaian Masuk  : Rp ${valAdjMasuk.toLocaleString('id-ID')}`);
  console.log(`   - Penyesuaian Keluar : Rp ${valAdjKeluar.toLocaleString('id-ID')}`);
  console.log(`   - Net Penyesuaian    : Rp ${(valAdjMasuk - valAdjKeluar).toLocaleString('id-ID')}`);

  // 5. Rekening Koran Bank (bank_statement)
  const bankTotal = await prisma.bank_statement.aggregate({
    _sum: { debet: true, kredit: true },
    _count: { id: true }
  });

  const bankRekon = await prisma.bank_statement.aggregate({
    _sum: { debet: true, kredit: true },
    _count: { id: true },
    where: { is_matched: true }
  });

  const bankBelumRekon = await prisma.bank_statement.aggregate({
    _sum: { debet: true, kredit: true },
    _count: { id: true },
    where: { is_matched: false }
  });

  console.log(`\n5. Rekening Koran (bank_statement):`);
  console.log(`   - Total Transaksi : ${bankTotal._count.id} items`);
  console.log(`   - Total Kredit (Masuk) : Rp ${Number(bankTotal._sum.kredit || 0).toLocaleString('id-ID')}`);
  console.log(`   - Total Debet (Keluar) : Rp ${Number(bankTotal._sum.debet || 0).toLocaleString('id-ID')}`);
  console.log(`   - Sudah Rekon (Matched): ${bankRekon._count.id} items (Kredit/Masuk: Rp ${Number(bankRekon._sum.kredit || 0).toLocaleString('id-ID')}, Debet/Keluar: Rp ${Number(bankRekon._sum.debet || 0).toLocaleString('id-ID')})`);
  console.log(`   - Belum Rekon (Unmatched): ${bankBelumRekon._count.id} items (Kredit/Masuk: Rp ${Number(bankBelumRekon._sum.kredit || 0).toLocaleString('id-ID')}, Debet/Keluar: Rp ${Number(bankBelumRekon._sum.debet || 0).toLocaleString('id-ID')})`);

  // Latest Balance from Bank
  const latestBank = await prisma.bank_statement.findFirst({
    orderBy: [{ tanggal: 'desc' }, { id: 'desc' }]
  });
  const saldoAkhirBank = Number(latestBank ? latestBank.saldo_akhir : 0);
  console.log(`   - Saldo Akhir Rekening Koran: Rp ${saldoAkhirBank.toLocaleString('id-ID')}`);

  // 6. Global BKU vs Bank Reconciliation Calculations
  // BKU Total Masuk = data_pendapatan + adjMasuk
  const bkuTotalMasuk = Number(incTotal._sum.nilai || 0) + valAdjMasuk;
  
  // BKU Total Keluar = SP2D Neto + Potongan SP2D + adjKeluar (and check if we need to include setoran_pajak, which is 0 anyway)
  // Let's compute both: BKU Bruto vs BKU Neto
  // BKU Bruto Keluar = SP2D Bruto + adjKeluar
  // BKU Neto Keluar = SP2D Neto + Potongan SP2D Rincian + adjKeluar (wait! In audit_integritas_saldo: SP2D Neto + Potongan SP2D is equal to SP2D Bruto, as long as potongan rincian matches sp2d.nilai_potongan. If they are the same, let's see. Let's compute actual BKU Keluar as defined in standard BKU logic)
  
  const totalSp2dBruto = Number(expTotal._sum.nilai_bruto || 0);
  const totalSp2dNeto = Number(expTotal._sum.nilai_neto || 0);
  const totalSp2dPotongan = Number(expTotal._sum.nilai_potongan || 0);
  
  // Total BKU Keluar (Standard logic): SP2D Neto + Potongan Rincian + adjKeluar
  const totalPotonganRincian = Number(potonganTotal._sum.nilai || 0);
  const bkuTotalKeluarStandard = totalSp2dNeto + totalPotonganRincian + valAdjKeluar;
  const bkuTotalKeluarBruto = totalSp2dBruto + valAdjKeluar;

  const saldoBKUStandard = saldoAwal + bkuTotalMasuk - bkuTotalKeluarStandard;
  const saldoBKUBruto = saldoAwal + bkuTotalMasuk - bkuTotalKeluarBruto;

  console.log(`\n6. Perbandingan Saldo Akhir Global (BKU vs Rekening Koran):`);
  console.log(`   A. Menggunakan Pengeluaran Standar (Neto SP2D + Rincian Potongan):`);
  console.log(`      - Saldo Awal            : Rp ${saldoAwal.toLocaleString('id-ID')}`);
  console.log(`      - Total Penerimaan BKU  : Rp ${bkuTotalMasuk.toLocaleString('id-ID')}`);
  console.log(`      - Total Pengeluaran BKU : Rp ${bkuTotalKeluarStandard.toLocaleString('id-ID')}`);
  console.log(`      - Saldo Akhir BKU       : Rp ${saldoBKUStandard.toLocaleString('id-ID')}`);
  console.log(`      - Saldo Akhir Bank      : Rp ${saldoAkhirBank.toLocaleString('id-ID')}`);
  console.log(`      - SELISIH SALDO AKHIR   : Rp ${(saldoBKUStandard - saldoAkhirBank).toLocaleString('id-ID')}`);
  
  console.log(`\n   B. Menggunakan Pengeluaran Bruto SP2D:`);
  console.log(`      - Saldo Awal            : Rp ${saldoAwal.toLocaleString('id-ID')}`);
  console.log(`      - Total Penerimaan BKU  : Rp ${bkuTotalMasuk.toLocaleString('id-ID')}`);
  console.log(`      - Total Pengeluaran BKU : Rp ${bkuTotalKeluarBruto.toLocaleString('id-ID')}`);
  console.log(`      - Saldo Akhir BKU       : Rp ${saldoBKUBruto.toLocaleString('id-ID')}`);
  console.log(`      - Saldo Akhir Bank      : Rp ${saldoAkhirBank.toLocaleString('id-ID')}`);
  console.log(`      - SELISIH SALDO AKHIR   : Rp ${(saldoBKUBruto - saldoAkhirBank).toLocaleString('id-ID')}`);

  console.log(`\n   C. Komparasi Arus Kas Berjalan (Penerimaan vs Pengeluaran tanpa Saldo Awal):`);
  const bankNetFlow = Number(bankTotal._sum.kredit || 0) - Number(bankTotal._sum.debet || 0);
  const bkuNetFlowStandard = bkuTotalMasuk - bkuTotalKeluarStandard;
  const bkuNetFlowBruto = bkuTotalMasuk - bkuTotalKeluarBruto;
  
  console.log(`      - Net Flow Bank        : Rp ${bankNetFlow.toLocaleString('id-ID')}`);
  console.log(`      - Net Flow BKU (Std)   : Rp ${bkuNetFlowStandard.toLocaleString('id-ID')}`);
  console.log(`      - Net Flow BKU (Bruto) : Rp ${bkuNetFlowBruto.toLocaleString('id-ID')}`);
}

run()
  .catch(err => console.error("Error running script:", err))
  .finally(() => prisma.$disconnect());
