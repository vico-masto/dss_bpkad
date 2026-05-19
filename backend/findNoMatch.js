const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const bankItems = await prisma.bank_statement.findMany({
    where: { is_matched: false }
  });

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

  let noMatchValue = 0;
  
  for (const bank of bankItems) {
    const debet = Number(bank.debet) || 0;
    const kredit = Number(bank.kredit) || 0;
    const val = debet > 0 ? debet : kredit;
    const isOut = debet > 0;

    const hasValueMatch = bkuItems.some(bku => {
      const bkuNeto = Number(bku.nilai) || 0;
      const bkuBruto = Number(bku.nilai_bruto) || 0;
      if (isOut && bku.tipe === 'MASUK') return false;
      if (!isOut && bku.tipe !== 'MASUK') return false;
      return Math.abs(bkuNeto - val) <= 1 || Math.abs(bkuBruto - val) <= 1;
    });

    if (!hasValueMatch) {
      console.log(`[NO VALUE MATCH IN BKU] Bank: ${bank.deskripsi} (Val: ${val}, Date: ${bank.tanggal})`);
      noMatchValue++;
      if (noMatchValue >= 10) break;
    }
  }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
