const fs = require('fs');
const file = 'd:/Antigravity/DSS_BPKAD/backend/controllers/reconciliationController.js';
let content = fs.readFileSync(file, 'utf8');

// First remove the old buggy query block if it exists
const startBuggy = '    // 8. Matched Transactions with Discrepancy (Selisih)';
const endBuggy = '      ORDER BY tanggal DESC\n    `;';
const startIdx = content.indexOf(startBuggy);
if (startIdx !== -1) {
    const endIdx = content.indexOf(endBuggy, startIdx);
    if (endIdx !== -1) {
        content = content.substring(0, startIdx) + content.substring(endIdx + endBuggy.length);
    }
}

const queryStr = `
    // 8. Matched Transactions with Discrepancy (Selisih)
    const matchedWithDiscrepancy = await prisma.$queryRaw\`
      SELECT 
        'SP2D' as tipe,
        tanggal_pencairan as tanggal,
        nomor_sp2d as bukti,
        opd,
        uraian,
        CAST(nilai_neto AS DECIMAL) as nilai,
        CAST(selisih_rekon AS DECIMAL) as selisih,
        keterangan_rekon
      FROM data_sp2d
      WHERE tahun = \${currentYear} 
        AND status_rekon LIKE 'SUDAH%' 
        AND selisih_rekon IS NOT NULL 
        AND ABS(CAST(selisih_rekon AS DECIMAL)) > 0.005
      ORDER BY tanggal DESC
    \`;
`;

const target1 = '    const serialize = (arr) => arr.map(row => {';
if (!content.includes('matchedWithDiscrepancy')) {
    content = content.replace(target1, queryStr + '\n\n' + target1);
} else {
    // Already has matchedWithDiscrepancy, replace it safely
    // Wait, since I removed the block above, I just need to re-insert it
    content = content.replace(target1, queryStr + '\n\n' + target1);
}

fs.writeFileSync(file, content);
console.log('Success backend update!');
