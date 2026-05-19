const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  // Get unmatched bank items
  const bankItems = await prisma.bank_statement.findMany({
    where: { is_matched: false },
    take: 10
  });

  if (bankItems.length === 0) {
    console.log("No unmatched bank items found.");
    return;
  }

  // Get unmatched BKU items (Pengeluaran only for now)
  const bkuItems = await prisma.$queryRaw`
    SELECT CAST(id AS VARCHAR) as id, CAST(nomor AS VARCHAR) as bukti, CAST(uraian AS VARCHAR) as uraian, CAST(nilai_neto AS DECIMAL) as nilai, CAST(nilai_bruto AS DECIMAL) as nilai_bruto, tanggal, 'KELUAR' as tipe FROM data_sp2d
    WHERE status_rekon = 'BELUM'
    UNION ALL
    SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_sp2d AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto, p.tanggal_pencairan as tanggal, 'POTONGAN' as tipe FROM data_sp2d_potongan p
    LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
    WHERE b.id IS NULL
    UNION ALL
    SELECT CAST(s.id AS VARCHAR) as id, CAST(s.nomor_bukti AS VARCHAR) as bukti, CAST(s.uraian AS VARCHAR) as uraian, CAST(s.nilai AS DECIMAL) as nilai, CAST(s.nilai AS DECIMAL) as nilai_bruto, s.tanggal, 'PAJAK' as tipe FROM setoran_pajak s
    LEFT JOIN bank_statement b ON CAST(s.id AS VARCHAR) = b.ref_bku_id
    WHERE b.id IS NULL
    UNION ALL
    SELECT CAST(p.id AS VARCHAR) as id, CAST(p.nomor_bukti AS VARCHAR) as bukti, CAST(p.uraian AS VARCHAR) as uraian, CAST(p.nilai AS DECIMAL) as nilai, CAST(p.nilai AS DECIMAL) as nilai_bruto, p.tanggal, 'MASUK' as tipe FROM data_pendapatan p
    LEFT JOIN bank_statement b ON CAST(p.id AS VARCHAR) = b.ref_bku_id
    WHERE b.id IS NULL
  `;

  for (const bank of bankItems) {
    const debet = Number(bank.debet) || 0;
    const kredit = Number(bank.kredit) || 0;
    const val = debet > 0 ? debet : kredit;
    const isOut = debet > 0;
    const bankDate = new Date(bank.tanggal);

    console.log(`\n--- BANK ITEM: ${bank.deskripsi} | Val: ${val} | Date: ${bankDate.toISOString()} | isOut: ${isOut} ---`);

    const matches = bkuItems.filter(bku => {
      const bkuNeto = Number(bku.nilai) || 0;
      const bkuBruto = Number(bku.nilai_bruto) || 0;
      const bkuDate = new Date(bku.tanggal);

      if (isOut && bku.tipe === 'MASUK') return false;
      if (!isOut && bku.tipe !== 'MASUK') return false;

      const diffDays = isOut 
        ? (bankDate.getTime() - bkuDate.getTime()) / (1000 * 3600 * 24)
        : Math.abs(bkuDate.getTime() - bankDate.getTime()) / (1000 * 3600 * 24);

      if (Math.abs(bkuNeto - val) <= 1 || Math.abs(bkuBruto - val) <= 1) {
        console.log(` > FOUND VALUE MATCH: ${bku.bukti} | Tipe: ${bku.tipe} | Neto: ${bkuNeto} | Bruto: ${bkuBruto} | Date: ${bkuDate.toISOString()} | DiffDays: ${diffDays}`);
      }
      return false; // Just scanning
    });
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
