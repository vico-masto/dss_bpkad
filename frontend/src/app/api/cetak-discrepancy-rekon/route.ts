import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer';

const formatNum = (val: any) => {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const {
      barConfig,
      instansiConfig,
      year,
      saldoAwalKas,
      displayPenerimaan,
      totalPengeluaran,
      saldoAkhirBKU,
      saldoBank,
      selisihNilai,
      isSesuai,
      formattedLastDay,
      previewBlnRekonName,
      previewHari,
      previewTgl,
      previewBln,
      previewThn,
      terbilangTgl,
      terbilangThn,
      anomalyRows
    } = data;

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    font-family: 'Times New Roman', Times, serif;
    padding: 0;
    margin: 0;
    line-height: 1;
    color: #000;
    font-size: 11pt;
  }
  .text-center  { text-align: center; }
  .text-right   { text-align: right; }
  .text-justify { text-align: justify; }
  .font-bold    { font-weight: bold; }
  .uppercase    { text-transform: uppercase; }
  .italic       { font-style: italic; }
  .underline    { text-decoration: underline; }
  .mono         { font-family: 'Courier New', monospace; }

  .kop {
    display: flex; align-items: center; justify-content: center; position: relative;
    border-bottom: 4px double #000;
    padding-bottom: 12px; margin-bottom: 22px;
  }
  .kop-logo { position: absolute; left: 0; top: 0; width: 75px; height: 75px; object-fit: contain; }
  .kop-text { text-align: center; width: 100%; }
  .kop-text.has-logo { padding-left: 85px; padding-right: 85px; }
  .kop-text .gov  { font-size: 13pt; font-weight: bold; text-transform: uppercase; margin: 0; line-height: 1.2; }
  .kop-text .inst { font-size: 13pt; font-weight: bold; text-transform: uppercase; margin: 3px 0 0; line-height: 1.2; }
  .kop-text .addr { font-size: 9pt; font-style: italic; font-family: 'Arial', sans-serif; margin: 5px 0 0; line-height: 1.2; }

  .title { text-align: center; margin-bottom: 18px; }
  .title h3 { font-size: 13pt; font-weight: bold; text-transform: uppercase; margin: 0; }
  .title p  { font-size: 11pt; margin: 4px 0 0; }

  .section-title { font-weight: bold; text-transform: uppercase; font-size: 11pt; margin: 20px 0 8px; }

  table {
    width: 100%; border-collapse: collapse;
    margin-bottom: 18px; font-size: 10.5pt;
    page-break-inside: auto;
  }
  thead { display: table-header-group; }
  tr    { page-break-inside: avoid; }
  th, td { border: 1px solid #000; padding: 7px 8px; }
  th { background-color: #f0f4f8; text-align: center; }
  
  .total-row  { font-weight: bold; background-color: #f0f4f8; }
  .ok-row     { font-weight: bold; background-color: #e8f5e9; }
  .warn-row   { font-weight: bold; background-color: #fff3e0; }

  .signature-row { display: flex; width: 100%; margin-top: 30px; }
  .sig-col { width: 50%; text-align: center; }
  .sig-space { height: 45px; }
</style>
</head>
<body>

  <!-- KOP SURAT -->
  <div class="kop">
    ${instansiConfig?.logo ? `<img src="${instansiConfig.logo}" class="kop-logo" alt="logo">` : ''}
    <div class="kop-text ${instansiConfig?.logo ? 'has-logo' : ''}">
      <p class="gov">${instansiConfig?.pemerintah || 'PEMERINTAH KABUPATEN KEPULAUAN ARU'}</p>
      <p class="inst">${instansiConfig?.instansi || 'BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH'}</p>
      <p class="addr">${instansiConfig?.alamat || 'Jl. Pemda - Email : bpkad.kepulauanarukab@gmail.com'}</p>
    </div>
  </div>

  <!-- JUDUL -->
  <div class="title">
    <h3>BERITA ACARA REKONSILIASI KAS</h3>
    <p>NOMOR: ${barConfig.noBar || '—'}</p>
  </div>

  <!-- PARAGRAF PEMBUKA -->
  <div class="text-justify" style="margin-bottom: 20px;">
    <p>
      Pada hari ini, <span class="font-bold italic">${previewHari}</span> 
      tanggal <span class="font-bold italic">${terbilangTgl}</span> 
      bulan <span class="font-bold italic">${previewBln}</span> 
      tahun <span class="font-bold italic">${terbilangThn}</span>, kami yang bertanda tangan di bawah ini:
    </p>
    <div style="margin-left: 28px; margin-top: 14px; margin-bottom: 14px;">
      <table style="border:none; border-collapse:collapse; font-size:inherit; margin:0 0 10px 0;">
        <tr><td style="border:none;padding:0;white-space:nowrap;vertical-align:top;width:14px;">1.</td>
            <td style="border:none;padding:0 0 0 4px;white-space:nowrap;vertical-align:top;width:52px;">Nama</td>
            <td style="border:none;padding:0 3px;vertical-align:top;">:</td>
            <td style="border:none;padding:0;vertical-align:top;"><span class="font-bold uppercase">${barConfig.pejabat1 || '—'}</span></td></tr>
        <tr><td style="border:none;padding:0;"></td>
            <td style="border:none;padding:0 0 0 4px;white-space:nowrap;vertical-align:top;">Jabatan</td>
            <td style="border:none;padding:0 3px;vertical-align:top;">:</td>
            <td style="border:none;padding:0;vertical-align:top;">${barConfig.jabatan1 || '—'}</td></tr>
        <tr><td style="border:none;padding:0;"></td>
            <td style="border:none;padding:0 0 0 4px;white-space:nowrap;vertical-align:top;">NIP</td>
            <td style="border:none;padding:0 3px;vertical-align:top;">:</td>
            <td style="border:none;padding:0;vertical-align:top;">${barConfig.nip1 || '—'}</td></tr>
      </table>
      <table style="border:none; border-collapse:collapse; font-size:inherit; margin:0;">
        <tr><td style="border:none;padding:0;white-space:nowrap;vertical-align:top;width:14px;">2.</td>
            <td style="border:none;padding:0 0 0 4px;white-space:nowrap;vertical-align:top;width:52px;">Nama</td>
            <td style="border:none;padding:0 3px;vertical-align:top;">:</td>
            <td style="border:none;padding:0;vertical-align:top;"><span class="font-bold uppercase">${barConfig.pejabat2 || '—'}</span></td></tr>
        <tr><td style="border:none;padding:0;"></td>
            <td style="border:none;padding:0 0 0 4px;white-space:nowrap;vertical-align:top;">Jabatan</td>
            <td style="border:none;padding:0 3px;vertical-align:top;">:</td>
            <td style="border:none;padding:0;vertical-align:top;">${barConfig.jabatan2 || '—'}</td></tr>
        <tr><td style="border:none;padding:0;"></td>
            <td style="border:none;padding:0 0 0 4px;white-space:nowrap;vertical-align:top;">ID/NIP</td>
            <td style="border:none;padding:0 3px;vertical-align:top;">:</td>
            <td style="border:none;padding:0;vertical-align:top;">${barConfig.nip2 || '—'}</td></tr>
      </table>
    </div>
    <p>
      PIHAK KESATU dan PIHAK KEDUA secara bersama-sama telah melakukan rekonsiliasi atas data Kas pada Pemerintah Kabupaten Kepulauan Aru untuk periode bulan <span class="font-bold italic underline">${previewBlnRekonName}</span> Tahun Anggaran <span class="font-bold">${year}</span>.
    </p>
  </div>

  <!-- A. DASAR HUKUM -->
  <div class="section-title">A. DASAR HUKUM</div>
  <div class="text-justify" style="margin-bottom: 20px; font-style: italic; background-color: #f9f9f9; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
    ${barConfig.dasarHukum || '—'}
  </div>

  <!-- B. HASIL REKONSILIASI KAS -->
  <div class="section-title">B. HASIL REKONSILIASI KAS</div>
  <table>
    <thead>
      <tr>
        <th style="width: 36px;">NO</th>
        <th style="text-align: left;">URAIAN</th>
        <th style="width: 190px; text-align: right;">JUMLAH (RP)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="text-center">1</td>
        <td>SALDO AWAL KAS BKU (KAS DAERAH)</td>
        <td class="text-right mono">${formatNum(saldoAwalKas)}</td>
      </tr>
      <tr>
        <td class="text-center">2</td>
        <td>TOTAL PENERIMAAN KAS S.D. BULAN ${previewBlnRekonName.toUpperCase()}</td>
        <td class="text-right mono">${formatNum(displayPenerimaan)}</td>
      </tr>
      <tr>
        <td class="text-center">3</td>
        <td>TOTAL PENGELUARAN KAS S.D. BULAN ${previewBlnRekonName.toUpperCase()}</td>
        <td class="text-right mono">${formatNum(totalPengeluaran)}</td>
      </tr>
      <tr class="total-row">
        <td class="text-center">4</td>
        <td>SALDO AKHIR BKU RKUD PER TANGGAL ${formattedLastDay}</td>
        <td class="text-right mono">${formatNum(saldoAkhirBKU)}</td>
      </tr>
      <tr class="total-row">
        <td class="text-center">5</td>
        <td>SALDO REKENING KORAN BANK PER TANGGAL ${formattedLastDay}</td>
        <td class="text-right mono">${formatNum(saldoBank)}</td>
      </tr>
      <tr class="${isSesuai ? 'ok-row' : 'warn-row'}">
        <td class="text-center">6</td>
        <td>SELISIH (NO. 4 - NO. 5)</td>
        <td class="text-right mono">${isSesuai ? 'NOL' : formatNum(selisihNilai)}</td>
      </tr>
    </tbody>
  </table>

  <!-- C. RINCIAN SELISIH -->
  <div class="section-title">C. RINCIAN SELISIH (OUTSTANDING ITEMS)</div>
  <table>
    <thead>
      <tr>
        <th style="width: 36px;">NO</th>
        <th style="text-align: left; width: 140px;">REFERENSI / TIPE</th>
        <th style="text-align: left;">KETERANGAN TRANSAKSI</th>
        <th style="width: 160px; text-align: right;">NILAI (RP)</th>
      </tr>
    </thead>
    <tbody>
      ${anomalyRows && anomalyRows.length > 0 
        ? anomalyRows.map((r: any, idx: number) => `
            <tr>
              <td class="text-center">${idx + 1}</td>
              <td class="uppercase">${r.tipe}<br><small style="color: #666; font-family: monospace;">${r.bukti || ''}</small><br><small style="color: #666; font-family: monospace;">${r.tanggal || '-'}</small></td>
              <td>${r.keterangan || ''}<br><small style="color: #888; font-style: italic;">${r.opd || ''}</small></td>
              <td class="text-right mono">${formatNum(r.nilai)}</td>
            </tr>
          `).join('')
        : `<tr>
            <td colspan="4" class="text-center italic" style="color: #555; padding: 15px;">
              Kas Terverifikasi Sinkron. Tidak terdapat selisih pembukuan.
            </td>
          </tr>`
      }
    </tbody>
  </table>

  <!-- D. KESIMPULAN -->
  <div class="text-justify" style="margin-bottom: 24px; page-break-inside: avoid;">
    <div class="section-title">D. KESIMPULAN</div>
    <p>
      Berdasarkan hasil rekonsiliasi tersebut di atas, saldo Kas Rekening Kas Umum Daerah (RKUD) Kabupaten Kepulauan Aru per tanggal ${formattedLastDay} dinyatakan <span class="font-bold italic underline">${isSesuai ? 'SESUAI' : 'TERDAPAT SELISIH'}</span> antara Buku Kas Umum (BKU) dengan Rekening Koran ${barConfig.jabatan2 || '—'}.
    </p>
    <p style="margin-top: 12px;">
      Demikian Berita Acara Rekonsiliasi Kas ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.
    </p>
  </div>

  <!-- TANDA TANGAN -->
  <div style="page-break-inside: avoid;">
    <div class="text-right font-bold" style="margin-bottom: 36px;">Dobo, ${previewTgl} ${previewBln} ${previewThn}</div>
    <div class="signature-row">
      <div class="sig-col">
        <p class="font-bold uppercase">PIHAK KESATU,<br>${barConfig.jabatan1 || '—'}</p>
        <div class="sig-space"></div>
        <p class="font-bold uppercase underline" style="margin-bottom: 0;">${barConfig.pejabat1 || '—'}</p>
        <p style="margin-top: 0;">NIP. ${barConfig.nip1 || '—'}</p>
      </div>
      <div class="sig-col">
        <p class="font-bold uppercase">PIHAK KEDUA,<br>${barConfig.jabatan2 || '—'}</p>
        <div class="sig-space"></div>
        <p class="font-bold uppercase underline" style="margin-bottom: 0;">${barConfig.pejabat2 || '—'}</p>
        <p style="margin-top: 0;">NIP / ID. ${barConfig.nip2 || '—'}</p>
      </div>
    </div>
    <div style="width: 100%; text-align: center; margin-top: 40px;">
      <p class="font-bold uppercase">Mengetahui,<br>${barConfig.jabatan3 || '—'}</p>
      <div class="sig-space"></div>
      <p class="font-bold uppercase underline" style="margin-bottom: 0;">${barConfig.pejabat3 || '—'}</p>
      <p style="margin-top: 0;">NIP. ${barConfig.nip3 || '—'}</p>
    </div>
  </div>

</body>
</html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'load' });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: false,
      margin: { top: '1.5cm', bottom: '1.5cm', left: '2cm', right: '1.5cm' }
    });

    await browser.close();

    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="BAR_REKON_${year}_${previewBlnRekonName}_${(barConfig.noBar as string).replace(/\//g, '_')}.pdf"`
      }
    });

  } catch (error: any) {
    console.error('PDF Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF', details: error.message }, { status: 500 });
  }
}
