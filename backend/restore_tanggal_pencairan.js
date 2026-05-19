/**
 * restore_tanggal_pencairan.js
 *
 * Memulihkan data_sp2d.tanggal_pencairan yang terhapus akibat "Reset Rekon".
 *
 * Strategi (bertingkat, dari sumber paling andal ke yang lebih kasar):
 *   1. Dari data_sp2d_potongan (tidak ikut direset, menyimpan tanggal bank asli)
 *   2. Dari bank_statement (cocokkan ulang via deskripsi / nilai / tanggal)
 *
 * Cara jalan: node restore_tanggal_pencairan.js [--dry-run] [--tahun=2026]
 */

const prisma = require('./prismaClient');

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const tahunArg = args.find(a => a.startsWith('--tahun='));
const tahun = tahunArg ? parseInt(tahunArg.split('=')[1]) : new Date().getFullYear();

console.log(`\n=== RESTORE tanggal_pencairan SP2D | Tahun: ${tahun} | Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'} ===\n`);

async function main() {
  // -- LANGKAH 1: Ambil semua SP2D yang tanggal_pencairan-nya null --
  const sp2dNull = await prisma.$queryRaw`
    SELECT id, nomor, tanggal, nilai_neto, nilai_bruto
    FROM data_sp2d
    WHERE tahun = ${tahun}
      AND tanggal_pencairan IS NULL
    ORDER BY tanggal
  `;

  console.log(`SP2D dengan tanggal_pencairan NULL: ${sp2dNull.length}\n`);
  if (sp2dNull.length === 0) {
    console.log('Tidak ada yang perlu dipulihkan.');
    return;
  }

  let restoredFromPotongan = 0;
  let restoredFromBank = 0;
  let tidakDitemukan = 0;

  for (const sp2d of sp2dNull) {
    let restoredDate = null;
    let sumber = null;

    // ----------------------------------------------------------------
    // SUMBER 1: data_sp2d_potongan yang masih punya tanggal_pencairan
    // (Reset Rekon tidak menghapus tanggal_pencairan pada tabel ini)
    // ----------------------------------------------------------------
    const potRows = await prisma.$queryRaw`
      SELECT tanggal_pencairan
      FROM data_sp2d_potongan
      WHERE id_sp2d = ${sp2d.id}
        AND tanggal_pencairan IS NOT NULL
      ORDER BY tanggal_pencairan
      LIMIT 1
    `;

    if (potRows.length > 0 && potRows[0].tanggal_pencairan) {
      restoredDate = new Date(potRows[0].tanggal_pencairan);
      sumber = 'POTONGAN';
    }

    // ----------------------------------------------------------------
    // SUMBER 2: bank_statement — cocokkan via nilai dan tanggal (fuzzy)
    // Hanya jika potongan tidak memberikan tanggal
    // ----------------------------------------------------------------
    if (!restoredDate) {
      const neto = parseFloat(sp2d.nilai_neto || sp2d.nilai_bruto || 0);
      const tglSipd = new Date(sp2d.tanggal);
      const tglMin = new Date(tglSipd); tglMin.setDate(tglMin.getDate() - 1);
      const tglMax = new Date(tglSipd); tglMax.setDate(tglMax.getDate() + 14);

      if (neto > 0) {
        const bankRows = await prisma.$queryRaw`
          SELECT tanggal
          FROM bank_statement
          WHERE ABS(CAST(debet AS DECIMAL) - ${neto}::DECIMAL) < GREATEST(${neto} * 0.01, 1000)
            AND tanggal::DATE BETWEEN ${tglMin}::DATE AND ${tglMax}::DATE
          ORDER BY ABS(tanggal::DATE - ${tglSipd}::DATE) ASC
          LIMIT 1
        `;

        if (bankRows.length > 0 && bankRows[0].tanggal) {
          restoredDate = new Date(bankRows[0].tanggal);
          sumber = 'BANK_FUZZY';
        }
      }
    }

    // ----------------------------------------------------------------
    // Apply atau log
    // ----------------------------------------------------------------
    if (restoredDate) {
      const tglStr = restoredDate.toISOString().split('T')[0];
      if (!isDryRun) {
        await prisma.data_sp2d.update({
          where: { id: sp2d.id },
          data: { tanggal_pencairan: restoredDate }
        });
      }
      const label = sumber === 'POTONGAN' ? restoredFromPotongan++ && 'ok' : restoredFromBank++ && 'ok';
      console.log(`  OK [${sumber}] ${sp2d.nomor} → ${tglStr}`);
      if (sumber === 'POTONGAN') restoredFromPotongan++;
      else restoredFromBank++;
    } else {
      console.log(`  -- [TIDAK DITEMUKAN] ${sp2d.nomor} (${new Date(sp2d.tanggal).toLocaleDateString('id-ID')})`);
      tidakDitemukan++;
    }
  }

  console.log(`
=== RINGKASAN ===
Dipulihkan dari potongan : ${restoredFromPotongan}
Dipulihkan dari bank (fuzzy): ${restoredFromBank}
Tidak ditemukan sumber   : ${tidakDitemukan}
Mode                     : ${isDryRun ? 'DRY RUN — tidak ada perubahan di database' : 'LIVE — database telah diupdate'}

${tidakDitemukan > 0 ? `SP2D yang tidak ditemukan perlu diisi manual via halaman Kelengkapan Pencairan.` : ''}
`);
}

main()
  .catch(err => {
    console.error('ERROR:', err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
