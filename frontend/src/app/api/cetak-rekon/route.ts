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
      baData, systemA, systemB,
      totalSystemB, totalI, totalII, totalIII,
      appConfig, startDateFmt, endDateFmt, tanggalBAFmt
    } = data;

    const namaBankShort = (baData.namaBank as string)
      .replace('PT. ', '').replace('Cabang Dobo', '').trim();

    const saldoDisesI   = (systemA.saldoBank ?? 0) + (totalSystemB ?? 0);
    const saldoDisesII  = systemA.saldoBKU ?? 0;
    const saldoMatch    = Math.abs(saldoDisesI - saldoDisesII) < 1;

    const groupI   = (systemB as any[]).filter(i => i.kelompok === 'I');
    const groupII  = (systemB as any[]).filter(i => i.kelompok === 'II');
    const groupIII = (systemB as any[]).filter(i => i.kelompok === 'III');

    const renderGroup = (items: any[], label: string, total: number, noOffset: number) => {
      if (items.length === 0) return '';
      const rows = items.map((o, i) => `
        <tr>
          <td class="text-center">${noOffset + i + 1}</td>
          <td>${o.bukti ?? '—'}<br><small style="color:#666">${o.tipe}</small></td>
          <td><b>${o.opd ?? '—'}</b><br><small style="font-style:italic">${o.uraian ?? ''}</small></td>
          <td class="text-right mono">${(o.signedValue ?? 0) >= 0 ? '+' : ''}${formatNum(o.signedValue)}</td>
        </tr>
      `).join('');
      return `
        <tr class="group-hdr"><td colspan="4">${label}</td></tr>
        ${rows}
        <tr class="subtotal">
          <td colspan="3" class="text-right">Sub Total ${label.split('—')[0].trim()}</td>
          <td class="text-right mono">${(total ?? 0) >= 0 ? '+' : ''}${formatNum(total)}</td>
        </tr>
      `;
    };

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
    line-height: 1.5;
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
  .kop-text .inst { font-size: 15pt; font-weight: bold; text-transform: uppercase; margin: 3px 0 0; line-height: 1.2; }
  .kop-text .addr { font-size: 9pt; font-style: italic; font-family: 'Arial', sans-serif; margin: 5px 0 0; line-height: 1.2; }

  .title { text-align: center; margin-bottom: 18px; }
  .title h3 { font-size: 13pt; font-weight: bold; text-transform: uppercase; margin: 0; }
  .title p  { font-size: 11pt; margin: 4px 0 0; }

  table {
    width: 100%; border-collapse: collapse;
    margin-bottom: 18px; font-size: 10.5pt;
    page-break-inside: auto;
  }
  thead { display: table-header-group; }
  tr    { page-break-inside: avoid; }
  th, td { border: 1px solid #000; padding: 7px 8px; }
  th { background-color: #f0f4f8; text-align: center; }
  .group-hdr {
    font-weight: bold; font-style: italic;
    background-color: #e8edf2;
  }
  .group-hdr td { padding: 7px 8px; }
  .total-row  { font-weight: bold; background-color: #f0f4f8; }
  .subtotal   { font-weight: bold; background-color: #f5f5f5; }
  .ok-row     { font-weight: bold; background-color: #e8f5e9; }
  .warn-row   { font-weight: bold; background-color: #fff3e0; }
  .match-ok   { font-weight: bold; background-color: #e8f5e9; }
  .match-warn { font-weight: bold; background-color: #ffebee; }

  .signature-row { display: flex; width: 100%; margin-top: 30px; }
  .sig-col { width: 50%; text-align: center; }
  .sig-space { height: 60px; }
</style>
</head>
<body>

  <!-- KOP SURAT -->
  <div class="kop">
    ${appConfig.logo ? `<img src="${appConfig.logo}" class="kop-logo" alt="logo">` : ''}
    <div class="kop-text ${appConfig.logo ? 'has-logo' : ''}">
      <p class="gov">${appConfig.pemerintah}</p>
      <p class="inst">${appConfig.instansi}</p>
      <p class="addr">${appConfig.alamat}</p>
    </div>
  </div>

  <!-- JUDUL -->
  <div class="title">
    <h3>Berita Acara Rekonsiliasi Kas</h3>
    <p>Nomor: ${baData.nomorBA}</p>
  </div>

  <!-- PARAGRAF PEMBUKA -->
  <div class="text-justify" style="margin-bottom: 20px;">
    <p>
      Berdasarkan ${baData.dasarHukum}, pada hari ini,
      <span class="font-bold italic">${tanggalBAFmt.hari}</span>,
      tanggal <span class="font-bold italic">${tanggalBAFmt.tgl}</span>
      bulan <span class="font-bold italic">${tanggalBAFmt.bulan}</span>
      tahun <span class="font-bold italic">${tanggalBAFmt.tahun}</span>,
      bertempat di ${baData.lokasi}, kami yang bertanda tangan di bawah ini:
    </p>
    <div style="margin-left: 28px; margin-top: 14px; margin-bottom: 14px;">
      <p style="margin: 0 0 10px;">
        1. Nama&nbsp;&nbsp; : <span class="font-bold uppercase">${baData.pihak1.nama}</span><br>
           &nbsp;&nbsp;&nbsp;&nbsp;NIP&nbsp;&nbsp;&nbsp;&nbsp; : ${baData.pihak1.nip}<br>
           &nbsp;&nbsp;&nbsp;&nbsp;Jabatan : <span class="italic">${baData.pihak1.jabatan}</span>
      </p>
      <p style="margin: 0;">
        2. Nama&nbsp;&nbsp; : <span class="font-bold uppercase">${baData.pihak2.nama}</span><br>
           &nbsp;&nbsp;&nbsp;&nbsp;Jabatan : <span class="italic">${baData.pihak2.jabatan}</span>
      </p>
    </div>
    <p>
      Telah melakukan rekonsiliasi kas pada Rekening Kas Umum Daerah (RKUD)
      Nomor Rekening <span class="font-bold">${baData.nomorRekening}</span>
      untuk periode <span class="font-bold italic underline">${startDateFmt} s/d ${endDateFmt}</span>,
      dengan hasil sebagai berikut:
    </p>
  </div>

  <!-- ── SECTION A ─────────────────────────────────────────────── -->
  <p class="font-bold uppercase" style="font-size: 11pt; margin: 0 0 8px;">
    A. Posisi Kas — Rekonsiliasi Saldo BKU dan Rekening Koran
  </p>
  <table>
    <thead>
      <tr>
        <th style="width: 36px;">No.</th>
        <th style="text-align: left;">Uraian</th>
        <th style="width: 190px; text-align: right;">Jumlah (Rp)</th>
      </tr>
    </thead>
    <tbody>
      <!-- BKU Side -->
      <tr class="group-hdr"><td colspan="3">I. Saldo Menurut Buku Kas Umum (KBUD)</td></tr>
      <tr>
        <td class="text-center">1</td>
        <td>Saldo Awal / SILPA per ${startDateFmt}</td>
        <td class="text-right mono">${formatNum(systemA.bkuSilpa)}</td>
      </tr>
      <tr>
        <td class="text-center">2</td>
        <td>( + ) Pendapatan s.d. ${endDateFmt}</td>
        <td class="text-right mono">${formatNum(systemA.bkuPendapatan)}</td>
      </tr>
      <tr>
        <td class="text-center">3</td>
        <td>( − ) Pengeluaran SP2D Neto s.d. ${endDateFmt}</td>
        <td class="text-right mono">(${formatNum(systemA.bkuSp2dNeto)})</td>
      </tr>
      <tr>
        <td class="text-center">4</td>
        <td>( − ) Potongan Pajak &amp; Iuran s.d. ${endDateFmt}</td>
        <td class="text-right mono">(${formatNum(systemA.bkuPotongan)})</td>
      </tr>
      ${(systemA.bkuSetoran ?? 0) > 0 ? `
      <tr>
        <td class="text-center">4a</td>
        <td>( − ) Setoran Pajak Mandiri s.d. ${endDateFmt}</td>
        <td class="text-right mono">(${formatNum(systemA.bkuSetoran)})</td>
      </tr>
      ` : ''}
      <tr class="total-row">
        <td class="text-center"></td>
        <td>= SALDO AKHIR BKU KBUD PER ${endDateFmt}</td>
        <td class="text-right mono">${formatNum(systemA.saldoBKU)}</td>
      </tr>

      <!-- Bank Side -->
      <tr class="group-hdr"><td colspan="3">II. Saldo Menurut Rekening Koran Bank (${baData.namaBank})</td></tr>
      <tr>
        <td class="text-center">5</td>
        <td>Saldo Rekening Koran per ${startDateFmt}</td>
        <td class="text-right mono">${formatNum(systemA.saldoBankAwal)}</td>
      </tr>
      <tr>
        <td class="text-center">6</td>
        <td>( + ) Kredit / Penerimaan s.d. ${endDateFmt}</td>
        <td class="text-right mono">${formatNum(systemA.bankKredit)}</td>
      </tr>
      <tr>
        <td class="text-center">7</td>
        <td>( − ) Debet / Pengeluaran s.d. ${endDateFmt}</td>
        <td class="text-right mono">(${formatNum(systemA.bankDebet)})</td>
      </tr>
      <tr class="total-row">
        <td class="text-center"></td>
        <td>= SALDO REKENING KORAN PER ${endDateFmt}</td>
        <td class="text-right mono">${formatNum(systemA.saldoBank)}</td>
      </tr>

      <!-- Selisih -->
      <tr class="${(systemA.selisih ?? 0) < 0.01 ? 'ok-row' : 'warn-row'}">
        <td colspan="2" class="text-right font-bold" style="padding-right: 16px;">SELISIH KAS (I − II)</td>
        <td class="text-right mono font-bold">${(systemA.selisih ?? 0) < 0.01 ? 'NIL' : formatNum(systemA.selisih)}</td>
      </tr>
    </tbody>
  </table>

  <!-- ── SECTION B ─────────────────────────────────────────────── -->
  <div style="page-break-before: always; padding-top: 1cm;">
    <p class="font-bold uppercase" style="font-size: 11pt; margin: 0 0 6px;">
      B. Rincian Selisih (Outstanding Items)
    </p>
    <p class="italic text-justify" style="font-size: 10pt; margin: 0 0 12px;">
      ${(systemA.selisih ?? 0) < 0.01
        ? 'Berdasarkan hasil rekonsiliasi, tidak terdapat selisih antara BKU KBUD dengan Rekening Koran Bank. Kas dinyatakan sinkron.'
        : 'Selisih terjadi karena adanya transaksi yang belum dicatat/diselesaikan, dengan rincian sebagai berikut:'}
    </p>
    <table style="font-size: 10pt;">
      <thead>
        <tr>
          <th style="width: 32px;">No.</th>
          <th style="text-align: left; width: 110px;">Ref / Bukti</th>
          <th style="text-align: left;">Uraian Transaksi</th>
          <th style="text-align: right; width: 150px;">Nilai (Rp)</th>
        </tr>
      </thead>
      <tbody>
        ${(systemB as any[]).length === 0
          ? `<tr><td colspan="4" class="text-center italic" style="color:#666;">Tidak ada outstanding item. Kas Terverifikasi Sinkron.</td></tr>`
          : `
            ${renderGroup(groupI,   'Kelompok I — Transaksi BKU belum tercatat di Bank (setoran/SP2D dalam perjalanan)', totalI,   0)}
            ${renderGroup(groupII,  'Kelompok II — Transaksi Bank belum tercatat di BKU (nota kredit/debet bank)',        totalII,  groupI.length)}
            ${renderGroup(groupIII, 'Kelompok III — Selisih Nilai (koreksi / pembulatan)',                                totalIII, groupI.length + groupII.length)}

            <tr class="total-row">
              <td colspan="3" class="text-right uppercase">Total Rincian Selisih (Poin B)</td>
              <td class="text-right mono">${(totalSystemB ?? 0) >= 0 ? '+' : ''}${formatNum(totalSystemB)}</td>
            </tr>

            <!-- Verifikasi Saldo Disesuaikan -->
            <tr class="group-hdr"><td colspan="4">Verifikasi: Saldo Disesuaikan (SAP — kedua sisi harus sama)</td></tr>
            <tr>
              <td colspan="2">Saldo Rekening Koran + Total Outstanding</td>
              <td class="text-right mono" style="font-size:9pt;">${formatNum(systemA.saldoBank)} + (${formatNum(totalSystemB)})</td>
              <td class="text-right mono font-bold">${formatNum(saldoDisesI)}</td>
            </tr>
            <tr class="${saldoMatch ? 'match-ok' : 'match-warn'}">
              <td colspan="2">= Saldo BKU Tersaji</td>
              <td colspan="2" class="text-right mono">${formatNum(saldoDisesII)} ${saldoMatch ? '✓ SESUAI' : '✗ TIDAK SESUAI'}</td>
            </tr>
          `
        }
      </tbody>
    </table>
  </div>

  <!-- ── SECTION C ─────────────────────────────────────────────── -->
  <div class="text-justify" style="margin-bottom: 24px; page-break-inside: avoid;">
    <p class="font-bold uppercase" style="margin: 0 0 8px;">C. Kesimpulan</p>
    <p>
      Berdasarkan hasil proses rekonsiliasi tersebut di atas, saldo Kas Rekening Kas Umum Daerah (RKUD)
      Kabupaten Kepulauan Aru pada <span class="font-bold">${baData.namaBank}</span>
      Nomor Rekening <span class="font-bold">${baData.nomorRekening}</span>
      per tanggal ${endDateFmt} dinyatakan
      <span class="font-bold italic underline uppercase">${(systemA.selisih ?? 0) < 0.01 ? 'SESUAI' : 'TIDAK SESUAI'}</span>
      antara Buku Kas Umum KBUD dengan Rekening Koran Bank.
    </p>
    <p style="margin-top: 12px;">
      Demikian Berita Acara Rekonsiliasi Kas ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.
    </p>
  </div>

  <!-- TANDA TANGAN -->
  <div style="page-break-inside: avoid;">
    <div class="text-right font-bold" style="margin-bottom: 36px;">${baData.lokasi}, ${tanggalBAFmt.full}</div>
    <div class="signature-row">
      <div class="sig-col">
        <p class="font-bold uppercase">Pihak I<br>${baData.pihak1.jabatan}</p>
        <div class="sig-space"></div>
        <p class="font-bold uppercase underline" style="margin-bottom: 0;">${baData.pihak1.nama}</p>
        <p style="margin-top: 0;">NIP. ${baData.pihak1.nip}</p>
      </div>
      <div class="sig-col">
        <p class="font-bold uppercase">Pihak II<br>${namaBankShort}</p>
        <div class="sig-space"></div>
        <p class="font-bold uppercase underline" style="margin-bottom: 0;">${baData.pihak2.nama}</p>
        <p class="uppercase" style="margin-top: 0;">${baData.pihak2.jabatan}</p>
      </div>
    </div>
    <div style="width: 100%; text-align: center; margin-top: 40px;">
      <p class="font-bold uppercase">Mengetahui,<br>${baData.mengetahui.jabatan}</p>
      <div class="sig-space"></div>
      <p class="font-bold uppercase underline" style="margin-bottom: 0;">${baData.mengetahui.nama}</p>
      <p style="margin-top: 0;">NIP. ${baData.mengetahui.nip}</p>
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
        'Content-Disposition': `attachment; filename="BA_REKON_${(baData.nomorBA as string).replace(/\//g, '_')}.pdf"`
      }
    });

  } catch (error: any) {
    console.error('PDF Generation Error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF', details: error.message }, { status: 500 });
  }
}
