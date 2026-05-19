import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

const formatCurrency = (val: any) => {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num).replace('Rp', 'Rp ');
};

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { baData, systemA, systemB, totalSystemB, appConfig, startDateFmt, endDateFmt, tanggalBAFmt } = data;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Times New Roman', Times, serif; padding: 2cm 2cm 2cm 3cm; line-height: 1.5; color: #000; }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .text-justify { text-align: justify; }
          .font-bold { font-weight: bold; }
          .uppercase { text-transform: uppercase; }
          .italic { font-style: italic; }
          .underline { text-decoration: underline; }
          
          .kop-section { border-bottom: 3.5px solid #000; margin-bottom: 20px; padding-bottom: 10px; display: flex; align-items: center; }
          .kop-logo { width: 80px; height: 80px; margin-right: 20px; }
          .kop-text { flex: 1; text-align: center; }
          .kop-text h1 { font-size: 14pt; margin: 0; }
          .kop-text h2 { font-size: 16pt; margin: 5px 0 0 0; }
          .kop-text p { font-size: 10pt; margin: 10px 0 0 0; font-family: sans-serif; font-style: italic; }
          
          .title-section { margin-bottom: 30px; }
          .title-section h3 { font-size: 14pt; margin: 0; }
          .title-section p { font-size: 12pt; margin: 5px 0 0 0; font-weight: 500; }
          
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11pt; page-break-inside: auto; }
          thead { display: table-header-group; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th, td { border: 1px solid #000; padding: 8px; }
          th { background-color: #f8fafc; }
          
          .signature-row { display: flex; width: 100%; margin-top: 30px; }
          .signature-col { width: 50%; text-align: center; }
          .signature-space { height: 100px; }
          
          @page { margin: 1cm; }
        </style>
      </head>
      <body>
        <div class="kop-section">
          <div class="kop-text">
            <h1>${appConfig.pemerintah}</h1>
            <h2>${appConfig.instansi}</h2>
            <p>${appConfig.alamat}</p>
          </div>
        </div>

        <div class="title-section text-center">
          <h3 class="font-bold uppercase">Berita Acara Rekonsiliasi Kas</h3>
          <p>Nomor: ${baData.nomorBA}</p>
        </div>

        <div class="text-justify" style="font-size: 12pt; margin-bottom: 20px;">
          <p>
            Berdasarkan ${baData.dasarHukum}, pada hari ini, <span class="font-bold italic">${tanggalBAFmt.hari}</span>, 
            tanggal <span class="font-bold italic">${tanggalBAFmt.tgl}</span> bulan <span class="font-bold italic">${tanggalBAFmt.bulan}</span> tahun <span class="font-bold italic">${tanggalBAFmt.tahun}</span>, bertempat di ${baData.lokasi}, kami yang bertanda tangan di bawah ini:
          </p>
          <div style="margin-left: 30px; margin-top: 15px;">
            <p>1. Nama : <span class="font-bold uppercase">${baData.pihak1.nama}</span><br>
               NIP : ${baData.pihak1.nip}<br>
               Jabatan : <span class="italic">${baData.pihak1.jabatan}</span></p>
            <p>2. Nama : <span class="font-bold uppercase">${baData.pihak2.nama}</span><br>
               Jabatan : <span class="italic">${baData.pihak2.jabatan}</span></p>
          </div>
          <p style="margin-top: 20px;">
            Telah melakukan rekonsiliasi kas pada Rekening Kas Umum Daerah (RKUD) Nomor Rekening <span class="font-bold">080 103 6465</span> untuk periode <span class="font-bold italic underline">${startDateFmt} s/d ${endDateFmt}</span>, dengan hasil sebagai berikut:
          </p>
        </div>

        <div class="section-poin">
          <h4 class="font-bold uppercase" style="font-size: 12pt; margin-bottom: 10px;">A. SALDO MENURUT BUKU KAS UMUM KBUD DAN REKENING KORAN BANK</h4>
          <table>
            <thead>
              <tr>
                <th style="width: 40px;">No.</th>
                <th style="text-align: left;">Uraian Transaksi</th>
                <th style="width: 180px; text-align: right;">Jumlah (Rp)</th>
              </tr>
            </thead>
            <tbody>
              <tr><td class="text-center">1</td><td>Saldo Awal BKU BUD per ${startDateFmt}</td><td class="text-right">${formatCurrency(systemA.saldoAwal).replace('Rp ', '')}</td></tr>
              <tr><td class="text-center">2</td><td>Total Penerimaan Kas s.d. Tanggal ${endDateFmt}</td><td class="text-right">${formatCurrency(systemA.penerimaan).replace('Rp ', '')}</td></tr>
              <tr><td class="text-center">3</td><td>Total Pengeluaran Kas s.d. Tanggal ${endDateFmt}</td><td class="text-right">(${formatCurrency(systemA.pengeluaran).replace('Rp ', '')})</td></tr>
              <tr class="font-bold" style="background-color: #f8fafc;"><td class="text-center">4</td><td>SALDO AKHIR BKU RKUD PER TANGGAL ${endDateFmt}</td><td class="text-right">${formatCurrency(systemA.saldoBKU).replace('Rp ', '')}</td></tr>
              <tr class="font-bold" style="background-color: #f8fafc;"><td class="text-center">5</td><td>SALDO REKENING KORAN BANK PER TANGGAL ${endDateFmt}</td><td class="text-right">${formatCurrency(systemA.saldoBank).replace('Rp ', '')}</td></tr>
              <tr class="font-bold"><td class="text-center">6</td><td>SELISIH KAS (NO. 4 - NO. 5)</td><td class="text-right">${systemA.selisih < 0.01 ? 'NIL' : formatCurrency(systemA.selisih).replace('Rp ', '')}</td></tr>
            </tbody>
          </table>
        </div>

        <div class="section-poin" style="page-break-before: always;">
          <h4 class="font-bold uppercase" style="font-size: 12pt; margin-bottom: 10px;">B. RINCIAN SELISIH (OUTSTANDING ITEMS)</h4>
          <p class="italic text-justify" style="font-size: 11pt; margin-bottom: 15px;">
            ${systemA.selisih < 0.01 
              ? "Berdasarkan hasil audit, tidak terdapat selisih antara pembukuan Buku Kas Umum dengan Rekening Koran Bank (Kas Terverifikasi Sinkron) dengan rincian sebagai berikut:"
              : "Selisih terjadi dikarenakan adanya transaksi yang belum tercatat oleh bank atau pembukuan dengan rincian sebagai berikut:"}
          </p>
          <table style="font-size: 10pt;">
            <thead>
              <tr>
                <th style="width: 40px;">No.</th>
                <th style="text-align: left; width: 120px;">Ref / Tipe</th>
                <th style="text-align: left;">Uraian Transaksi</th>
                <th style="text-align: right; width: 150px;">Nilai (Rp)</th>
              </tr>
            </thead>
            <tbody>
              ${systemB.length > 0 ? systemB.map((o: any, idx: number) => `
                <tr>
                  <td class="text-center">${idx + 1}</td>
                  <td>${o.bukti}<br><small style="color: #666;">${o.tipe}</small></td>
                  <td><b>${o.opd || '-'}</b><br><small><i>${o.uraian}</i></small></td>
                  <td class="text-right">${o.signedValue > 0 ? '+' : ''}${formatCurrency(o.signedValue).replace('Rp ', '')}</td>
                </tr>
              `).join('') : '<tr><td colspan="4" class="text-center italic">Kas Terverifikasi Sinkron.</td></tr>'}
              ${systemB.length > 0 ? `
                <tr class="font-bold" style="background-color: #f8fafc;">
                  <td colspan="3" class="text-right">TOTAL RINCIAN SELISIH (POIN B)</td>
                  <td class="text-right">${formatCurrency(totalSystemB).replace('Rp ', '')}</td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>

        <div class="section-poin">
          <h4 class="font-bold uppercase" style="font-size: 12pt; margin-bottom: 10px;">C. KESIMPULAN</h4>
          <p class="text-justify" style="font-size: 12pt;">
            Berdasarkan hasil proses rekonsiliasi tersebut di atas, saldo Kas Rekening Kas Umum Daerah (RKUD) Kepulauan Aru per tanggal ${endDateFmt} dinyatakan <span class="font-bold italic underline uppercase">${systemA.selisih < 0.01 ? 'SESUAI' : 'TIDAK SESUAI'}</span> antara Buku Kas Umum KBUD dengan Rekening Koran PT. Bank Maluku-Maluku Utara Cabang Dobo.
          </p>
          <p style="margin-top: 15px; font-size: 12pt;">Demikian Berita Acara Rekonsiliasi Kas ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>
        </div>

        <div class="text-right font-bold" style="margin-top: 40px; font-size: 12pt;">
          ${baData.lokasi}, ${tanggalBAFmt.full}
        </div>

        <div class="signature-row">
          <div class="signature-col">
            <p class="font-bold uppercase">Pihak I<br>${baData.pihak1.jabatan}</p>
            <div class="signature-space"></div>
            <p class="font-bold uppercase underline">${baData.pihak1.nama}</p>
            <p>NIP. ${baData.pihak1.nip}</p>
          </div>
          <div class="signature-col">
            <p class="font-bold uppercase">Pihak II<br>Bank Maluku-Maluku Utara</p>
            <div class="signature-space"></div>
            <p class="font-bold uppercase underline">${baData.pihak2.nama}</p>
            <p class="uppercase">${baData.pihak2.jabatan}</p>
          </div>
        </div>

        <div class="text-center" style="margin-top: 50px;">
          <p class="font-bold uppercase">Mengetahui,<br>${baData.mengetahui.jabatan}</p>
          <div class="signature-space"></div>
          <p class="font-bold uppercase underline">${baData.mengetahui.nama}</p>
          <p>NIP. ${baData.mengetahui.nip}</p>
        </div>
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
    
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-size: 8px; color: #999; margin: 0 1cm; width: 100%; display: flex; justify-content: space-between;">
          <span>AUDITED BY DSS BPKAD | OFFICIAL RECORD</span>
          <span>Halaman <span class="pageNumber"></span> dari <span class="totalPages"></span></span>
        </div>
      `,
      margin: {
        top: '1.5cm',
        bottom: '1.5cm',
        left: '1cm',
        right: '1cm'
      }
    });

    await browser.close();

    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="BA_REKON_${baData.nomorBA.replace(/\//g, '_')}.pdf"`
      }
    });

  } catch (error: any) {
    console.error('PDF Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF', details: error.message }, { status: 500 });
  }
}
