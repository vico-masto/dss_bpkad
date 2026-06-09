const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeMay() {
  console.log("Analyzing data integrity for May 2026...");
  
  // Define May boundaries
  const startDate = new Date('2026-05-01T00:00:00.000Z');
  const endDate = new Date('2026-05-31T23:59:59.999Z');

  // 1. Check Bank Statements for May
  const bankStatements = await prisma.bank_statement.findMany({
    where: {
      tanggal: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const totalBankDebit = bankStatements.reduce((sum, b) => sum + Number(b.debet || 0), 0);
  const totalBankCredit = bankStatements.reduce((sum, b) => sum + Number(b.kredit || 0), 0);

  console.log(`Bank Statements in May: ${bankStatements.length}`);
  console.log(`Total Bank Debit (Penerimaan Bank): ${totalBankDebit}`);
  console.log(`Total Bank Credit (Pengeluaran Bank): ${totalBankCredit}`);

  // 2. Check BKU records (SP2D, Pendapatan, Potongan, Setoran Pajak) for May
  const sp2ds = await prisma.data_sp2d.findMany({
    where: {
      tanggal_pencairan: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const potongan = await prisma.data_sp2d_potongan.findMany({
    where: {
      tanggal_pencairan: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const pendapatan = await prisma.data_pendapatan.findMany({
    where: {
      tanggal_pencairan: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const setoranPajak = await prisma.setoran_pajak.findMany({
    where: {
      tanggal_pencairan: {
        gte: startDate,
        lte: endDate
      }
    }
  });

  const totalSp2dNeto = sp2ds.reduce((sum, s) => sum + Number(s.nilai_neto || 0), 0);
  const totalPotongan = potongan.reduce((sum, p) => sum + Number(p.nilai || 0), 0);
  const totalPendapatan = pendapatan.reduce((sum, p) => sum + Number(p.nilai || 0), 0);
  const totalSetoranPajak = setoranPajak.reduce((sum, s) => sum + Number(s.nilai || 0), 0);
  
  // Total BKU Pengeluaran = SP2D Neto + Rincian Potongan (as per KI)
  const totalBkuPengeluaran = totalSp2dNeto + totalPotongan;
  // Total BKU Penerimaan = Pendapatan
  const totalBkuPenerimaan = totalPendapatan;

  console.log(`\nSP2D (Neto) in May: ${totalSp2dNeto}`);
  console.log(`Potongan in May: ${totalPotongan}`);
  console.log(`Setoran Pajak in May (Ignored in BKU totals): ${totalSetoranPajak}`);
  console.log(`Total BKU Pengeluaran: ${totalBkuPengeluaran}`);
  console.log(`Total BKU Penerimaan: ${totalBkuPenerimaan}`);

  console.log(`\nSelisih Pengeluaran (Bank Credit - BKU Pengeluaran): ${totalBankCredit - totalBkuPengeluaran}`);
  console.log(`Selisih Penerimaan (Bank Debit - BKU Penerimaan): ${totalBankDebit - totalBkuPenerimaan}`);
  
  // Check Anomaly Statuses in BKU
  const anomaliSp2d = sp2ds.filter(s => Number(s.selisih_rekon) !== 0);
  console.log(`\nSP2D with Selisih (Anomali): ${anomaliSp2d.length}`);
  anomaliSp2d.forEach(s => console.log(`  - SP2D ${s.nomor}: Selisih ${s.selisih_rekon}, Keterangan: ${s.keterangan_rekon}`));

  const anomaliPotongan = potongan.filter(p => Number(p.selisih_rekon) !== 0);
  console.log(`Potongan with Selisih (Anomali): ${anomaliPotongan.length}`);
  anomaliPotongan.forEach(p => console.log(`  - Potongan ${p.id_billing}: Selisih ${p.selisih_rekon}, Keterangan: ${p.keterangan_rekon}`));

  const anomaliPendapatan = pendapatan.filter(p => Number(p.selisih_rekon) !== 0);
  console.log(`Pendapatan with Selisih (Anomali): ${anomaliPendapatan.length}`);

}

analyzeMay().catch(console.error).finally(() => prisma.$disconnect());
