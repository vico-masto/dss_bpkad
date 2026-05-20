import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { formatCurrency } from './utils';
import { toast } from 'sonner';


export const exportToExcel = (data: any[], fileName: string, sheetName: string = 'Data') => {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

export const exportToExcelMultiSheet = (sheets: { data: any[], sheetName: string }[], fileName: string) => {
  const wb = XLSX.utils.book_new();
  sheets.forEach(sheet => {
    const ws = XLSX.utils.json_to_sheet(sheet.data);
    XLSX.utils.book_append_sheet(wb, ws, sheet.sheetName);
  });
  XLSX.writeFile(wb, `${fileName}.xlsx`);
};

const getAppConfig = () => {
  let config = {
    pemerintah: 'PEMERINTAH KABUPATEN KEPULAUAN ARU',
    instansi: 'BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH',
    alamat: 'Jl. Pemda - Email : bpkad.kepulauanarukab@gmail.com',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Lambang_Kabupaten_Kepulauan_Aru.png',
    pimpinan_jabatan: 'KEPALA BADAN',
    pimpinan_nama: 'NAMA PIMPINAN, S.Sos',
    pimpinan_nip: '19XXXXXXXXXXXXXXX'
  };

  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('app_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      config = { ...config, ...parsed };
    }
  }
  return config;
};

const drawKopSurat = (doc: jsPDF, orientation: 'p' | 'l' = 'p') => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const config = getAppConfig();
  
  try {
    // Menambahkan Logo (Ukuran disesuaikan agar proporsional dengan tinggi tulisan)
    if (config.logo) {
      doc.addImage(config.logo, 'PNG', 16, 10, 18, 20); // Lebar 18, Tinggi 20
    }
  } catch (e) {
    // Fallback jika logo gagal dimuat
    doc.setDrawColor(200);
    doc.rect(16, 10, 18, 20);
    doc.setFontSize(8);
    doc.text('LOGO', 25, 20, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(config.pemerintah, pageWidth / 2 + 5, 16, { align: 'center' });
  doc.setFontSize(14);
  doc.text(config.instansi, pageWidth / 2 + 5, 23, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(config.alamat, pageWidth / 2 + 5, 29, { align: 'center' });
  
  // Garis Pembatas Kop
  doc.setLineWidth(0.8);
  doc.line(14, 35, pageWidth - 14, 35);
  doc.setLineWidth(0.2);
  doc.line(14, 36, pageWidth - 14, 36);
};

export const generatePDF = (headers: string[], data: any[][], title: string, foot?: any[][]) => {
  const doc = new jsPDF('l', 'mm', 'a4');
  const config = getAppConfig();
  
  // 1. Kop Surat
  drawKopSurat(doc, 'l');

  // 2. Title Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(16, 24, 40);
  doc.text(title, 14, 48);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(102, 112, 133);
  doc.text(`Laporan dihasilkan secara otomatis pada: ${new Date().toLocaleString('id-ID')}`, 14, 53);

  // Intelligent Column Width & Alignment Mapping
  const columnStyles: any = {};
  headers.forEach((header, index) => {
    const h = header.toLowerCase();
    if (h === 'no' || h === 'no.') {
      columnStyles[index] = { halign: 'center', cellWidth: 10 }; 
    } else if (h.includes('tgl') || h.includes('tanggal')) {
      columnStyles[index] = { halign: 'center', cellWidth: 22 };
    } else if (h.includes('bukti')) {
      columnStyles[index] = { halign: 'center', cellWidth: 28 }; 
    } else if (h.includes('opd') || h.includes('unit kerja')) {
      columnStyles[index] = { cellWidth: 32 }; 
    } else if (h.includes('audit')) {
      columnStyles[index] = { halign: 'center', cellWidth: 22 };
    } else if (h.includes('terima') || h.includes('keluar') || h.includes('saldo') || h.includes('bruto') || h.includes('neto') || h.includes('penerimaan') || h.includes('pengeluaran')) {
      columnStyles[index] = { halign: 'right', fontStyle: 'bold', cellWidth: 35 }; 
    } else if (h.includes('uraian') || h.includes('keterangan')) {
      columnStyles[index] = { cellWidth: 'auto' }; 
    }
  });

  // 3. Table
  autoTable(doc, {
    head: [headers],
    body: data,
    foot: foot,
    showFoot: 'lastPage',
    startY: 58, // Halaman 1 mulai di bawah Kop
    theme: 'grid',
    styles: { 
      fontSize: 7.5, // Sedikit lebih kecil agar angka muat
      font: 'helvetica', 
      cellPadding: 2, // Padding lebih ketat
      valign: 'middle',
      lineColor: [208, 213, 221],
      lineWidth: 0.1,
      overflow: 'linebreak'
    },
    headStyles: { 
      fillColor: [242, 244, 247],
      textColor: [52, 64, 84],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center'
    },
    footStyles: {
      fillColor: [249, 250, 251],
      textColor: [16, 24, 40],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'right'
    },
    alternateRowStyles: { 
      fillColor: [252, 252, 253] 
    },
    columnStyles: columnStyles,
    margin: { top: 20, left: 14, right: 14 }, // Margin global diperkecil untuk Hal 2+
    didDrawPage: (data) => {
      const str = 'Halaman ' + (doc.internal as any).getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150);
      const pageSize = doc.internal.pageSize;
      const pageHeight = pageSize.height ? pageSize.height : pageSize.getHeight();
      const pageWidth = pageSize.width ? pageSize.width : pageSize.getWidth();
      
      doc.text(str, data.settings.margin.left, pageHeight - 8);
      doc.text('DSS BPKAD Financial System', pageWidth - data.settings.margin.right, pageHeight - 8, { align: 'right' });
    }
  });

  // 4. Footer (Signature Section)
  const pageCount = (doc.internal as any).getNumberOfPages();
  doc.setPage(pageCount);

  const finalY = (doc as any).lastAutoTable.finalY + 12;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  if (finalY > pageHeight - 45) {
    doc.addPage();
    const newSignY = 25;
    doc.setFontSize(10);
    doc.setTextColor(16, 24, 40);
    doc.text('Mengetahui,', pageWidth - 70, newSignY);
    doc.setFont('helvetica', 'bold');
    doc.text(config.pimpinan_jabatan, pageWidth - 70, newSignY + 7);
    doc.text(config.pimpinan_nama, pageWidth - 70, newSignY + 30);
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${config.pimpinan_nip}`, pageWidth - 70, newSignY + 35);
    doc.line(pageWidth - 70, newSignY + 31, pageWidth - 20, newSignY + 31);
  } else {
    doc.setFontSize(10);
    doc.setTextColor(16, 24, 40);
    doc.text('Mengetahui,', pageWidth - 70, finalY);
    doc.setFont('helvetica', 'bold');
    doc.text(config.pimpinan_jabatan, pageWidth - 70, finalY + 7);
    doc.text(config.pimpinan_nama, pageWidth - 70, finalY + 30);
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${config.pimpinan_nip}`, pageWidth - 70, finalY + 35);
    doc.line(pageWidth - 70, finalY + 31, pageWidth - 20, finalY + 31);
  }

  return doc;
};

export const exportToPDF = (headers: string[], data: any[][], fileName: string, title: string, foot?: any[][]) => {
  const doc = generatePDF(headers, data, title, foot);
  doc.save(`${fileName}.pdf`);
};

export const printPDF = (headers: string[], data: any[][], title: string, foot?: any[][]) => {
  try {
    const doc = generatePDF(headers, data, title, foot);
    doc.autoPrint(); 
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    
    const printWindow = window.open(url, '_blank');
    
    // Jika diblokir oleh browser
    if (!printWindow || printWindow.closed || typeof printWindow.closed === 'undefined') {
      console.warn('Pop-up blocked, falling back to direct download');
      // Gunakan nama file yang rapi
      const fileName = title.toLowerCase().replace(/[^a-z0-9]/g, '_') + '.pdf';
      doc.save(fileName);
      
      toast.info('Pop-up diblokir: Dokumen telah diunduh secara otomatis ke folder Download Anda.', {
        duration: 5000,
        description: 'Buka file tersebut untuk mencetak.'
      });
    }
  } catch (err) {
    console.error('CRITICAL PRINT ERROR:', err);
    throw new Error('Gagal menyusun dokumen PDF untuk dicetak');
  }
};

export const previewPDF = (headers: string[], data: any[][], title: string, foot?: any[][]) => {
  const doc = generatePDF(headers, data, title, foot);
  const blob = doc.output('blob');
  return URL.createObjectURL(blob);
};

export const downloadTemplate = (headers: string[], fileName: string, data?: any[][]) => {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...(data || [])]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  XLSX.writeFile(wb, `${fileName}_template.xlsx`);
};

export const generateExecutiveReport = (summary: any, analytics: any, tahun: number, intelligence?: any) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const config = getAppConfig();
  
  // 1. KOP SURAT (Formal Header)
  drawKopSurat(doc, 'p');

  // 2. JUDUL LAPORAN
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('LAPORAN INTELIJEN FINANSIAL EKSEKUTIF', pageWidth / 2, 50, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`TAHUN ANGGARAN ${tahun}`, pageWidth / 2, 56, { align: 'center' });

  // 3. RINGKASAN EKSEKUTIF (Table)
  doc.setFontSize(12);
  doc.text('I. RINGKASAN POSISI KEUANGAN', 14, 70);
  
  const summaryData = [
    ['Total Pagu Anggaran', formatCurrency(summary.totalPagu)],
    ['Realisasi Pendapatan', `${formatCurrency(summary.totalPendapatan)} (${summary.realisasiPersen.toFixed(2)}%)`],
    ['Total Saldo Kas Bank', formatCurrency(summary.totalKasFisik)],
    ['Saldo Kas Efektif Neto', formatCurrency(summary.kasEfektif)]
  ];

  autoTable(doc, {
    startY: 75,
    body: summaryData,
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 5 },
    columnStyles: { 0: { fontStyle: 'bold', fillColor: [245, 247, 250] } }
  });

  let currentY = (doc as any).lastAutoTable.finalY + 15;

  // 4. HASIL ANALISIS INTELIJEN (NEW SECTION)
  if (intelligence) {
    doc.setFontSize(12);
    doc.text('II. HASIL ANALISIS INTELIJEN & KEPATUHAN', 14, currentY);
    
    const intelData = [
       ['Skor Kesehatan Likuiditas', `${intelligence.health.score} / 100`],
       ['Status Sistem', intelligence.health.status],
       ['Jumlah Anomali Terdeteksi', `${intelligence.audit.length} Temuan`],
       ['Rasio Cakupan Kas (LCR)', `${Math.round((intelligence.health.kas / (intelligence.health.paguSisa || 1)) * 100)}%`]
    ];

    autoTable(doc, {
       startY: currentY + 5,
       body: intelData,
       theme: 'grid',
       styles: { fontSize: 10, cellPadding: 5 },
       columnStyles: { 
         0: { fontStyle: 'bold', fillColor: [245, 247, 250], cellWidth: 60 },
         1: { fontStyle: 'bold', textColor: [15, 23, 42] } 
       }
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
    
    // Audit Findings if any
    if (intelligence.audit.length > 0) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Daftar Temuan Audit Smart System:', 14, currentY);
      
      const auditRows = intelligence.audit.map((a: any) => [a.level, a.type, a.message]);
      autoTable(doc, {
        startY: currentY + 4,
        head: [['Level', 'Tipe Anomali', 'Deskripsi Temuan']],
        body: auditRows,
        theme: 'striped',
        headStyles: { fillColor: [244, 63, 94] },
        styles: { fontSize: 8.5 }
      });
      currentY = (doc as any).lastAutoTable.finalY + 15;
    } else {
      currentY += 5;
    }
  }

  // 5. RINCIAN PENGELUARAN OPD (Top 10)
  if (currentY > 230) { doc.addPage(); currentY = 40; }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('III. PERINGKAT REALISASI BELANJA OPD (TOP 10)', 14, currentY);

  const opdData = analytics.opdStats.slice(0, 10).map((o: any, i: number) => [
    i + 1,
    o.opd,
    o.jml_dokumen,
    formatCurrency(o.total_nilai)
  ]);

  autoTable(doc, {
    startY: currentY + 5,
    head: [['No', 'Nama OPD', 'Jml Dokumen', 'Total Realisasi']],
    body: opdData,
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42] },
    styles: { fontSize: 9 }
  });

  // 6. RECOMMENDATIONS (FIXED ORDER)
  let footerY = (doc as any).lastAutoTable.finalY + 15;
  
  if (intelligence) {
    if (footerY > 230) { doc.addPage(); footerY = 40; }
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('IV. REKOMENDASI MANAJERIAL', 14, footerY);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const recText = intelligence.health.status === 'EXCELLENT' 
      ? 'Berdasarkan analisis sistem, kondisi likuiditas daerah berada pada level SANGAT AMAN. Pimpinan disarankan untuk mengakselerasi penyerapan anggaran pada sektor infrastruktur dan layanan publik guna memacu pertumbuhan ekonomi daerah.'
      : 'Berdasarkan analisis sistem, diperlukan pemantauan arus kas harian secara ketat. Pimpinan disarankan untuk melakukan evaluasi prioritas pengeluaran pada OPD dengan penyerapan rendah dan menjaga ketersediaan dana talangan untuk kebutuhan mendesak.';
      
    const splitText = doc.splitTextToSize(recText, pageWidth - 28);
    doc.text(splitText, 14, footerY + 8);
    
    // Update footerY based on recommendation text height
    const textHeight = (splitText.length * 5);
    footerY = footerY + 8 + textHeight + 15;
  }

  // 7. SIGNATURE (DYNAMIC POSITION)
  if (footerY > pageHeight - 60) {
    doc.addPage();
    footerY = 40;
  }

  doc.setFontSize(10);
  doc.setTextColor(16, 24, 40);
  doc.setFont('helvetica', 'normal');
  doc.text('Mengetahui,', pageWidth - 70, footerY);
  doc.setFont('helvetica', 'bold');
  doc.text(config.pimpinan_jabatan, pageWidth - 70, footerY + 7);
  doc.text(config.pimpinan_nama, pageWidth - 70, footerY + 30);
  doc.setFont('helvetica', 'normal');
  doc.text(`NIP. ${config.pimpinan_nip}`, pageWidth - 70, footerY + 35);
  doc.line(pageWidth - 70, footerY + 31, pageWidth - 20, footerY + 31);

  // 8. ABSOLUTE TIMESTAMP & ATTRIBUTION (Paling Bawah)
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.setFont('helvetica', 'italic');
  doc.text(`Dicetak secara sistem pada: ${format(new Date(), 'dd MMMM yyyy HH:mm')}`, 14, pageHeight - 15);
  
  doc.setFontSize(7);
  doc.setTextColor(180);
  doc.setFont('helvetica', 'normal');
  doc.text('DSS BPKAD Executive Insight System - Architected & Built by Vico Masbaitubun', pageWidth / 2, pageHeight - 10, { align: 'center' });

  return doc;
}
