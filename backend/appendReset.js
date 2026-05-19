const fs = require('fs');
const file = 'd:/Antigravity/DSS_BPKAD/backend/controllers/reconciliationController.js';
let content = fs.readFileSync(file, 'utf8');

const controllerMethod = `
/**
 * Hard Reset All Reconciliations
 * CAUTION: Destructive Action
 */
exports.resetAllReconciliation = async (req, res) => {
  const { year, code } = req.body;
  const currentYear = parseInt(year) || new Date().getFullYear();

  if (code !== 'RESET REKON ' + currentYear) {
    return res.status(400).json({ message: 'Kode konfirmasi tidak valid. Harap ketik "RESET REKON ' + currentYear + '".' });
  }

  try {
    await prisma.$transaction([
      // 1. Reset Bank Statements
      prisma.$executeRaw\`
        UPDATE bank_statement
        SET is_matched = false, ref_bku_id = null
        WHERE EXTRACT(YEAR FROM tanggal) = \${currentYear}
      \`,
      // 2. Reset SP2D
      prisma.$executeRaw\`
        UPDATE data_sp2d
        SET status_rekon = 'BELUM', selisih_rekon = 0, keterangan_rekon = null
        WHERE tahun = \${currentYear}
      \`,
      // 3. Reset SP2D Potongan
      prisma.$executeRaw\`
        UPDATE data_sp2d_potongan
        SET status_rekon = 'BELUM'
        WHERE EXTRACT(YEAR FROM tanggal_pencairan) = \${currentYear}
      \`,
      // 4. Reset Pendapatan
      prisma.$executeRaw\`
        UPDATE data_pendapatan
        SET status_rekon = 'BELUM'
        WHERE tahun = \${currentYear}
      \`,
      // 5. Reset Setoran Pajak
      prisma.$executeRaw\`
        UPDATE setoran_pajak
        SET status_rekon = 'BELUM'
        WHERE EXTRACT(YEAR FROM tanggal) = \${currentYear}
      \`
    ]);

    res.json({ message: 'Semua data rekonsiliasi tahun ' + currentYear + ' telah di-reset ke kondisi awal (BELUM).' });
  } catch (err) {
    console.error('RESET RECONCILIATION ERROR:', err);
    res.status(500).json({ message: 'Terjadi kesalahan sistem saat mereset data', error: err.message });
  }
};
`;

if (!content.includes('exports.resetAllReconciliation')) {
  content += '\n' + controllerMethod;
  fs.writeFileSync(file, content);
  console.log('Success appended controller');
} else {
  console.log('Already exists');
}
