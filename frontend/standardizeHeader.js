const fs = require('fs');

function standardizeHeader(file, title, subtitle, iconTag) {
    let content = fs.readFileSync(file, 'utf8');

    // Kita akan menggunakan regex untuk mengekstrak header secara otomatis,
    // karena konten button dan tab bisa beda-beda di tiap halaman.
    // Asumsi: Struktur lama selalu memiliki pattern:
    // <div className="flex items-center gap-4( atau 5)"> ... <div className="w-12 h-12 bg-[#101828] ...> <Icon ... /> </div> ...
    // lalu <div className="flex items-center gap-3"> ... buttons ... </div>
    // </div>
    
    const startTag = '{/* PAGE HEADER */}';
    let altStartTag = '{/* Header */}';
    
    let startIndex = content.indexOf(startTag);
    let usedTag = startTag;
    if (startIndex === -1) {
        startIndex = content.indexOf(altStartTag);
        usedTag = altStartTag;
    }
    
    if (startIndex === -1) return;

    // Cari letak </h1>
    const h1Idx = content.indexOf('</h1>', startIndex);
    if (h1Idx === -1) return;
    
    // Cari letak tombol-tombol
    // Biasanya diawali dengan: <div className="flex items-center gap-3">
    const btnWrapperIdx = content.indexOf('className="flex items-center gap-3"', h1Idx);
    if (btnWrapperIdx === -1) return;
    
    const btnStartIdx = content.lastIndexOf('<div', btnWrapperIdx);
    
    // Kita perlu ngekstrak konten di dalam btnStartIdx sampai div penutupnya.
    let depth = 0;
    let btnEndIdx = -1;
    for (let i = btnStartIdx; i < content.length; i++) {
        if (content.substr(i, 4) === '<div') depth++;
        if (content.substr(i, 5) === '</div') depth--;
        if (depth === 0) {
            btnEndIdx = i + 6;
            break;
        }
    }

    if (btnEndIdx === -1) return;

    // Header block keseluruhan selesai di div yang sama (level atas)
    let mainDepth = 0;
    let mainEndIdx = -1;
    let mainStartIdx = content.indexOf('<div', startIndex);
    for (let i = mainStartIdx; i < content.length; i++) {
        if (content.substr(i, 4) === '<div') mainDepth++;
        if (content.substr(i, 5) === '</div') mainDepth--;
        if (mainDepth === 0) {
            mainEndIdx = i + 6;
            break;
        }
    }

    if (mainEndIdx === -1) return;

    let extractedButtons = content.substring(content.indexOf('>', btnStartIdx) + 1, btnEndIdx - 6).trim();

    // Sekarang, rakit header baru
    const newHeader = `      {/* PAGE HEADER */}
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#101828]">${title}</h1>
          <p className="text-sm text-[#475467] mt-1">${subtitle}</p>
        </div>
        
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full xl:justify-end">
${extractedButtons.split('\n').map(l => '            ' + l).join('\n')}
          </div>
        </div>
      </div>`;

    content = content.substring(0, startIndex) + newHeader + content.substring(mainEndIdx);
    
    // Khusus SP2D dan Pajak, ada Tabs! Tabs-nya harus diletakkan di sebelah kiri flex-row
    // extractedButtons mungkin mengandung div bg-[#F1F3F5] berisi Tabs.
    if (extractedButtons.includes('<Tabs')) {
        // Kita akan memisahkan Tabs dan Action buttons jika ada
        const tabStart = extractedButtons.indexOf('<div className="bg-[#F1F3F5]');
        if (tabStart !== -1) {
            let tDepth = 0;
            let tabEnd = -1;
            for(let i = tabStart; i < extractedButtons.length; i++){
                if (extractedButtons.substr(i, 4) === '<div') tDepth++;
                if (extractedButtons.substr(i, 5) === '</div') tDepth--;
                if (tDepth === 0) {
                    tabEnd = i + 6;
                    break;
                }
            }
            if (tabEnd !== -1) {
                const tabsStr = extractedButtons.substring(tabStart, tabEnd);
                const buttonsStr = extractedButtons.substring(0, tabStart) + extractedButtons.substring(tabEnd);
                
                const newHeaderWithTabs = `      {/* PAGE HEADER */}
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#101828]">${title}</h1>
          <p className="text-sm text-[#475467] mt-1">${subtitle}</p>
        </div>
        
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
${tabsStr.split('\n').map(l => '          ' + l).join('\n')}
          <div className="flex flex-wrap items-center gap-3">
${buttonsStr.split('\n').map(l => '            ' + l).join('\n')}
          </div>
        </div>
      </div>`;
                content = content.replace(newHeader, newHeaderWithTabs);
            }
        }
    }

    fs.writeFileSync(file, content);
    console.log(file + ' updated!');
}

standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/bku/page.tsx', 'Buku Kas Umum (BKU)', 'Laporan arus kas dan saldo berjalan daerah');
standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/sp2d/page.tsx', 'Perekaman & Arsip SP2D', 'Sistem administrasi pengeluaran digital daerah');
standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/pajak/page.tsx', 'Monitoring Setoran Pajak', 'Sistem pemantauan kewajiban perpajakan OPD');
standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/jurnal/page.tsx', 'Jurnal Umum', 'Pencatatan akuntansi dan jurnal penyesuaian');
standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/talangan/page.tsx', 'Monitoring Dana Talangan', 'Sistem pemantauan silang antar sumber dana');
standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/penyesuaian/page.tsx', 'Data Penyesuaian Saldo', 'Manajemen penyesuaian kas dan koreksi rekonsiliasi');
standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/saldo-awal/page.tsx', 'Saldo Awal Tahun', 'Konfigurasi saldo awal kas per sumber dana');
standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/rekon/discrepancy/page.tsx', 'Laporan Selisih & Ketidakcocokan', 'Audit investigatif dan pelacakan anomali bank');
