const fs = require('fs');

function standardizeHeader(file, title, subtitle) {
    let content = fs.readFileSync(file, 'utf8');

    let startTags = ['{/* PAGE HEADER */}', '{/* Header */}', '{/* HEADER SECTION */}'];
    let startIndex = -1;
    for (let tag of startTags) {
        startIndex = content.indexOf(tag);
        if (startIndex !== -1) break;
    }
    
    if (startIndex === -1) {
        console.log(file + ' skipped: no start tag');
        return;
    }

    const h1Idx = content.indexOf('</h1>', startIndex);
    if (h1Idx === -1) return;
    
    const btnWrapperIdx = content.indexOf('className="flex items-center gap-3"', h1Idx);
    if (btnWrapperIdx === -1) return;
    
    const btnStartIdx = content.lastIndexOf('<div', btnWrapperIdx);
    
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
    
    if (extractedButtons.includes('<Tabs')) {
        const tabStart = extractedButtons.indexOf('<Tabs');
        if (tabStart !== -1) {
            let tDepth = 0;
            let tabEnd = -1;
            for(let i = tabStart; i < extractedButtons.length; i++){
                if (extractedButtons.substr(i, 5) === '<Tabs') tDepth++;
                if (extractedButtons.substr(i, 7) === '</Tabs>') tDepth--;
                if (tDepth === 0) {
                    tabEnd = i + 7;
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

standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/pajak/page.tsx', 'Buku Pembantu Potongan (Pajak)', 'Manajemen perekaman rincian potongan dan sinkronisasi fakta bank');
standardizeHeader('d:/Antigravity/DSS_BPKAD/frontend/src/app/dashboard/simulator/page.tsx', 'Simulator Rekonsiliasi & Stress Test', 'Pengujian mesin pencocokan transaksi dan algoritma rekonsiliasi');
