'use client';
// Rebuild trigger

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { AlertTriangle, BarChart3, Building2, Calendar, CheckCircle2, ChevronDown, ChevronRight, Download, RefreshCw, XCircle, FileText, ShieldCheck, Lock, Edit3, Sparkles, FileSignature } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

import { PageHeader } from '@/components/patterns/page-header';

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const toN = (v: any) => Number(v) || 0;

const terbilang = (n: number): string => {
  if (n < 0) return "Minus " + terbilang(-n);
  if (n < 12) {
    const names = ["Nol", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"];
    return names[n];
  }
  if (n < 20) return terbilang(n - 10) + " Belas";
  if (n < 100) return terbilang(Math.floor(n / 10)) + " Puluh " + (n % 10 !== 0 ? terbilang(n % 10) : "");
  if (n < 200) return "Seratus " + terbilang(n - 100);
  if (n < 1000) return terbilang(Math.floor(n / 100)) + " Ratus " + (n % 100 !== 0 ? terbilang(n % 100) : "");
  if (n < 2000) return "Seribu " + terbilang(n - 1000);
  if (n < 1000000) return terbilang(Math.floor(n / 1000)) + " Ribu " + (n % 1000 !== 0 ? terbilang(n % 1000) : "");
  return String(n);
};

const getAiSuggestion = (selisih: number, uraian: string) => {
  const absSelisih = Math.abs(selisih);
  const text = (uraian || '').toLowerCase();
  if (absSelisih === 0) return { category: 'SINKRON', note: 'Data sudah sesuai.', color: 'text-emerald-500' };
  if (absSelisih === 2500 || absSelisih === 5000 || absSelisih === 6500) {
    return { category: 'ADMIN BANK', note: 'Terdeteksi sebagai Biaya Administrasi atau Transfer Bank.', color: 'text-amber-500' };
  }
  if (text.includes('pajak') || text.includes('ppn') || text.includes('pph')) {
    return { category: 'POTONGAN PAJAK', note: 'Kemungkinan selisih perhitungan atau potongan pajak oleh bank.', color: 'text-blue-500' };
  }
  if (absSelisih > 1000000) {
    return { category: 'MAJOR ERROR', note: 'Selisih signifikan. Periksa potensi kesalahan input nominal atau transaksi ganda.', color: 'text-rose-600' };
  }
  return { category: 'UNIDENTIFIED', note: 'Anomali belum teridentifikasi. Diperlukan pengecekan manual.', color: 'text-slate-400' };
};

export default function DiscrepancyReportPage() {
  const [year, setYear] = useState('2026');
  const [activeSection, setActiveSection] = useState<string | null>('monthly');
  const [selectedAnomaly, setSelectedAnomaly] = useState<any>(null);
  const [showBarModal, setShowBarModal] = useState(false);
  const [barConfig, setBarConfig] = useState({
    noBar: '000/ /BAR/BPKAD/2026',
    dasarHukum: 'Peraturan Daerah tentang Pengelolaan Keuangan Daerah dan Standar Akuntansi Pemerintahan (SAP).',
    tanggalRekon: format(new Date(), 'yyyy-MM-dd'),
    bulanRekon: String(new Date().getMonth() + 1),
    pejabat1: 'Nama Pejabat BPKAD',
    jabatan1: 'Kepala Bidang Perbendaharaan',
    nip1: '19XXXXXXXXXXXXX',
    pejabat2: 'Nama Pimpinan Bank',
    jabatan2: 'Pimpinan Cabang Bank Maluku Malut',
    nip2: '-',
    pejabat3: 'NAMA KEPALA BADAN',
    jabatan3: 'Kepala BPKAD',
    nip3: '19XXXXXXXXXXXXX'
  });

  const [instansiConfig, setInstansiConfig] = useState<any>(null);

  useEffect(() => {
    const saved = localStorage.getItem('app_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      setInstansiConfig(parsed);
      setBarConfig(prev => ({
        ...prev,
        pejabat3: parsed.pimpinan_nama || prev.pejabat3,
        jabatan3: parsed.pimpinan_jabatan || prev.jabatan3,
        nip3: parsed.pimpinan_nip || prev.nip3
      }));
    }
  }, []);

  const [auditNote, setAuditNote] = useState('');
  const [auditStatus, setAuditStatus] = useState('OPEN');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, isLoading, error, mutate } = useSWR(
    ['/reports/reconciliation/discrepancy-report', year],
    ([url, y]: [string, string]) => api.get(url, { params: { year: y } }).then(r => r.data),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  const handleExport = () => {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const monthlyRows = (data.monthlyBalance || []).map((r: any) => ({
      'Bulan': MONTHS[r.bulan - 1],
      'Total Penerimaan BKU': toN(r.penerimaan),
      'Total Pengeluaran BKU': toN(r.pengeluaran),
      'Saldo Akhir Bank': toN(r.saldo_bank),
      'SP2D Belum Rekon': toN(r.pengeluaran_belum_rekon),
      'Bank Debet Belum Cocok': toN(r.bank_debet_belum_cocok),
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Perbandingan Bulanan');
    XLSX.writeFile(wb, `Laporan_Selisih_Rekon_${year}.xlsx`);
  };

  const handleGenerateBAR = () => {
    if (!data) return;
    const doc = new jsPDF();
    const margin = 14;
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // 1. KOP SURAT
    if (instansiConfig?.logo) {
      try { doc.addImage(instansiConfig.logo, 'PNG', margin, 10, 20, 25); } catch (e) {}
    }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('PEMERINTAH KABUPATEN KEPULAUAN ARU', pageWidth / 2 + 10, 15, { align: 'center' });
    doc.setFontSize(13);
    doc.text('BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH', pageWidth / 2 + 10, 22, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Jl. Pemda - Email : bpkad.kepulauanarukab@gmail.com', pageWidth / 2 + 10, 27, { align: 'center' });
    doc.setLineWidth(0.8);
    doc.line(margin, 30, pageWidth - margin, 30);
    
    // 2. JUDUL
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('BERITA ACARA REKONSILIASI KAS', pageWidth / 2, 42, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`NOMOR: ${barConfig.noBar}`, pageWidth / 2, 47, { align: 'center' });
    
    // 3. PEMBUKAAN (TERBILANG INDONESIA)
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const tglObj = new Date(barConfig.tanggalRekon);
    const hari = format(tglObj, 'EEEE', { locale: id });
    const tgl = tglObj.getDate();
    const bln = MONTHS[tglObj.getMonth()];
    const thn = tglObj.getFullYear();
    const selectedBlnName = MONTHS[parseInt(barConfig.bulanRekon) - 1];
    
    const openingText = `Pada hari ini, ${hari} tanggal ${terbilang(tgl)} bulan ${bln} tahun ${terbilang(thn)}, kami yang bertanda tangan di bawah ini:`;
    doc.text(openingText, margin, 58, { maxWidth: pageWidth - (margin * 2), align: 'justify' });
    
    // 4. PARA PIHAK
    const partyY = 65;
    doc.text(`1. Nama : ${barConfig.pejabat1}`, margin + 5, partyY);
    doc.text(`   Jabatan : ${barConfig.jabatan1}`, margin + 5, partyY + 5);
    doc.text(`   NIP : ${barConfig.nip1}`, margin + 5, partyY + 10);
    doc.text(`   selanjutnya disebut PIHAK KESATU`, margin + 5, partyY + 15);
    
    doc.text(`2. Nama : ${barConfig.pejabat2}`, margin + 5, partyY + 25);
    doc.text(`   Jabatan : ${barConfig.jabatan2}`, margin + 5, partyY + 30);
    doc.text(`   selanjutnya disebut PIHAK KEDUA`, margin + 5, partyY + 35);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`PIHAK KESATU dan PIHAK KEDUA secara bersama-sama telah melakukan rekonsiliasi atas data Kas pada Pemerintah Kabupaten Kepulauan Aru untuk periode bulan ${selectedBlnName} Tahun Anggaran ${year}.`, margin, partyY + 45, { maxWidth: pageWidth - (margin * 2), align: 'justify' });

    // 5. DASAR HUKUM
    const hukumY = partyY + 60;
    doc.setFont('helvetica', 'bold');
    doc.text('A. DASAR HUKUM', margin, hukumY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(barConfig.dasarHukum, margin, hukumY + 5, { maxWidth: pageWidth - (margin * 2), align: 'justify' });

    // 6. B. HASIL REKONSILIASI
    const hasilY = hukumY + 20;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('B. HASIL REKONSILIASI KAS', margin, hasilY);

    const totalPenerimaan = (data.monthlyBalance || []).reduce((acc: number, m: any) => acc + toN(m.penerimaan), 0);
    const totalPengeluaran = (data.monthlyBalance || []).reduce((acc: number, m: any) => acc + toN(m.pengeluaran), 0);
    const saldoAkhirBKU = totalPenerimaan - totalPengeluaran;
    const saldoBank = toN(data.monthlyBalance?.find((m: any) => String(m.bulan) === barConfig.bulanRekon)?.saldo_bank || data.monthlyBalance?.at(-1)?.saldo_bank);
    const selisihNilai = Math.abs(saldoBank - saldoAkhirBKU);

    autoTable(doc, {
      startY: hasilY + 5,
      head: [['NO', 'URAIAN', 'JUMLAH (RP)']],
      body: [
        ['1', 'SALDO AWAL KAS BKU (KAS DAERAH)', formatCurrency(0)],
        ['2', `TOTAL PENERIMAAN KAS S.D. BULAN ${selectedBlnName.toUpperCase()}`, formatCurrency(totalPenerimaan)],
        ['3', `TOTAL PENGELUARAN KAS S.D. BULAN ${selectedBlnName.toUpperCase()}`, formatCurrency(totalPengeluaran)],
        ['4', `SALDO AKHIR BKU RKUD PER TANGGAL ${tgl}/${tglObj.getMonth()+1}/${thn}`, formatCurrency(saldoAkhirBKU)],
        ['5', `SALDO REKENING KORAN BANK PER TANGGAL ${tgl}/${tglObj.getMonth()+1}/${thn}`, formatCurrency(saldoBank)],
        ['6', 'SELISIH (NO. 4 - NO. 5)', selisihNilai === 0 ? 'NOL' : formatCurrency(selisihNilai)]
      ],
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold' },
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: { 0: { width: 10, halign: 'center' }, 2: { halign: 'right', fontStyle: 'bold' } }
    });

    // 7. C. RINCIAN SELISIH
    const finalY1 = (doc as any).lastAutoTable.finalY;
    doc.setFont('helvetica', 'bold');
    doc.text('C. RINCIAN SELISIH (OUTSTANDING ITEMS)', margin, finalY1 + 10);
    
    const anomalyRows = (data.matchedWithDiscrepancy || [])
      .filter((r: any) => new Date(r.tanggal).getMonth() + 1 === parseInt(barConfig.bulanRekon))
      .map((r: any, i: number) => [
        i + 1,
        `${r.tipe}\n${r.bukti || '-'}`,
        r.keterangan_rekon || r.uraian || 'Belum ada penjelasan',
        formatCurrency(toN(r.selisih))
      ]);

    autoTable(doc, {
      startY: finalY1 + 15,
      head: [['NO', 'REFERENSI / TIPE', 'KETERANGAN TRANSAKSI', 'NILAI (RP)']],
      body: anomalyRows.length > 0 ? anomalyRows : [['-', 'Kas Terverifikasi Sinkron.', 'Tidak terdapat selisih pembukuan.', '0']],
      theme: 'grid',
      headStyles: { fillColor: [240, 240, 240], textColor: 0 },
      styles: { fontSize: 7 }
    });

    // 8. D. KESIMPULAN & PENUTUP
    const finalY2 = (doc as any).lastAutoTable.finalY;
    doc.setFont('helvetica', 'bold');
    doc.text('D. KESIMPULAN', margin, finalY2 + 10);
    doc.setFont('helvetica', 'normal');
    const conclusion = `Berdasarkan hasil rekonsiliasi tersebut di atas, saldo Kas Rekening Kas Umum Daerah (RKUD) Kabupaten Kepulauan Aru per tanggal ${tgl} ${bln} ${thn} dinyatakan ${selisihNilai === 0 ? 'SESUAI' : 'TERDAPAT SELISIH'} antara Buku Kas Umum (BKU) dengan Rekening Koran ${barConfig.jabatan2}.`;
    doc.text(conclusion, margin, finalY2 + 15, { maxWidth: pageWidth - (margin * 2), align: 'justify' });
    
    doc.text('Demikian Berita Acara Rekonsiliasi Kas ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.', margin, finalY2 + 25);

    // 8. TANDA TANGAN
    let signY = finalY2 + 40;
    if (signY > 230) { doc.addPage(); signY = 30; }
    
    doc.setFontSize(9);
    doc.text(`Dobo, ${tgl} ${bln} ${thn}`, pageWidth - margin - 40, signY);
    
    doc.text('PIHAK KESATU,', margin + 20, signY + 10);
    doc.text(barConfig.jabatan1, margin + 20, signY + 15);
    
    doc.text('PIHAK KEDUA,', pageWidth - margin - 60, signY + 10);
    doc.text(barConfig.jabatan2, pageWidth - margin - 60, signY + 15);
    
    doc.setFont('helvetica', 'bold');
    doc.text(barConfig.pejabat1, margin + 20, signY + 40);
    doc.text(barConfig.pejabat2, pageWidth - margin - 60, signY + 40);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${barConfig.nip1}`, margin + 20, signY + 45);
    doc.text(`NIP / ID. ${barConfig.nip2}`, pageWidth - margin - 60, signY + 45);

    const midY = signY + 65;
    doc.text('Mengetahui,', pageWidth / 2, midY, { align: 'center' });
    doc.text(barConfig.jabatan3, pageWidth / 2, midY + 5, { align: 'center' });
    doc.setFont('helvetica', 'bold');
    doc.text(barConfig.pejabat3, pageWidth / 2, midY + 30, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.text(`NIP. ${barConfig.nip3}`, pageWidth / 2, midY + 35, { align: 'center' });

    doc.save(`BAR_REKON_${year}_${selectedBlnName}_${barConfig.noBar.replace(/\//g, '-')}.pdf`);
  };

  const Section = ({ id, title, icon: Icon, color, children }: any) => {
    const isOpen = activeSection === id;
    return (
      <Card className="rounded-2xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
        <button onClick={() => setActiveSection(isOpen ? null : id)} className="w-full flex items-center justify-between px-6 py-4 bg-fin-surface hover:bg-fin-page transition-colors">
          <div className="flex items-center gap-3">
            <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center", color)}>
              <Icon size={16} className="text-white" />
            </div>
            <span className="text-sm font-bold text-fin-text-primary">{title}</span>
          </div>
          {isOpen ? <ChevronDown size={16} className="text-fin-text-muted" /> : <ChevronRight size={16} className="text-fin-text-muted" />}
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
              <div className="border-t border-fin-border">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    );
  };

  const totalSP2DBelum = (data?.opdSummary || []).reduce((s: number, r: any) => s + toN(r.neto_belum_rekon), 0);
  const totalBankDebetBelum = (data?.bankDebetUnmatched || []).reduce((s: number, r: any) => s + toN(r.total_debet), 0);
  const totalPotonganBelum = (data?.potonganUnmatched || []).reduce((s: number, r: any) => s + toN(r.total_nilai), 0);
  const totalPenerimaanBelum = (data?.penerimaanUnmatched || []).reduce((s: number, r: any) => s + toN(r.total_nilai), 0);
  const totalBankKreditBelum = (data?.bankKreditUnmatched || []).reduce((s: number, r: any) => s + toN(r.total_kredit), 0);
  const opdDenganSelisih = (data?.opdSummary || []).filter((r: any) => toN(r.belum_rekon) > 0).length;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      <PageHeader
        title="Discrepancy Audit Center"
        description="Investigasi selisih, anomali bank, dan rekonsiliasi yang belum tuntas"
        icon={<BarChart3 className="size-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-32 h-10 text-sm font-semibold border-fin-border bg-fin-surface text-fin-text-primary">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-fin-surface border-fin-border">
                {[2024, 2025, 2026].map(y => (
                  <SelectItem key={y} value={String(y)} className="text-fin-text-primary">{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => mutate()} className="h-10 gap-2 border-fin-border bg-fin-surface text-fin-text-primary">
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button onClick={handleExport} disabled={!data} className="h-10 bg-fin-surface text-fin-text-primary border-fin-border hover:bg-fin-page gap-2">
              <Download size={14} />
              Excel
            </Button>
            <Button onClick={() => setShowBarModal(true)} disabled={!data} className="h-10 bg-indigo-600 text-white gap-2 hover:bg-indigo-700 shadow-md shadow-indigo-900/20">
              <FileText size={14} />
              Generate BAR
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'SP2D Belum Rekon', value: formatCurrency(totalSP2DBelum), sub: 'BKU (Keluar)', color: 'border-b-fin-expense', icon: XCircle, iconColor: 'text-fin-expense' },
          { label: 'Bank Debet Blm Cocok', value: formatCurrency(totalBankDebetBelum), sub: 'Bank (Keluar)', color: 'border-b-fin-warning', icon: AlertTriangle, iconColor: 'text-fin-warning' },
          { label: 'Penerimaan Blm Rekon', value: formatCurrency(totalPenerimaanBelum), sub: 'BKU (Masuk)', color: 'border-b-fin-income', icon: CheckCircle2, iconColor: 'text-fin-income' },
          { label: 'Bank Kredit Blm Cocok', value: formatCurrency(totalBankKreditBelum), sub: 'Bank (Masuk)', color: 'border-b-fin-info', icon: BarChart3, iconColor: 'text-fin-info' },
          { label: 'Potongan Blm Match', value: formatCurrency(totalPotonganBelum), sub: 'Rincian Pajak', color: 'border-b-fin-surplus', icon: ShieldCheck, iconColor: 'text-fin-surplus' },
          { label: 'OPD Selisih', value: `${opdDenganSelisih} OPD`, sub: 'Audit Perlu', color: 'border-b-fin-text-muted', icon: Building2, iconColor: 'text-fin-text-muted' },
        ].map((c, i) => (
          <Card key={i} className={cn("p-5 rounded-2xl border border-fin-border bg-fin-surface shadow-sm border-b-2", c.color)}>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">{c.label}</p>
                <p className="text-lg font-black text-fin-text-primary mt-1">{(isLoading && !data) ? '...' : c.value}</p>
              </div>
              <c.icon size={20} className={cn("mt-1", c.iconColor)} />
            </div>
          </Card>
        ))}
      </div>

      {!isLoading && data && (
        <div className="space-y-4">
          <Section id="monthly" title="Perbandingan Bulanan BKU vs Bank" icon={Calendar} color="bg-[#2E90FA]">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-fin-page border-b border-fin-border">
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">Bulan</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted text-right">Penerimaan BKU</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted text-right">Pengeluaran BKU</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted text-right">Saldo Akhir Bank</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted text-right">Selisih</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-fin-border">
                  {(data.monthlyBalance || []).map((r: any) => {
                    const hasIssue = toN(r.pengeluaran_belum_rekon) > 0 || toN(r.bank_debet_belum_cocok) > 0;
                    if (toN(r.penerimaan) === 0 && toN(r.pengeluaran) === 0) return null;
                    return (
                      <TableRow key={r.bulan} className={cn("transition-colors border-b border-fin-border", hasIssue ? "bg-fin-warning-bg/10" : "hover:bg-fin-page")}>
                        <TableCell className="text-xs font-bold text-fin-text-primary py-3">{MONTHS[r.bulan - 1]} {year}</TableCell>
                        <TableCell className="text-xs text-right text-fin-income font-semibold py-3">{formatCurrency(toN(r.penerimaan))}</TableCell>
                        <TableCell className="text-xs text-right text-fin-text-primary font-semibold py-3">{formatCurrency(toN(r.pengeluaran))}</TableCell>
                        <TableCell className="text-xs text-right text-fin-info font-semibold py-3">{formatCurrency(toN(r.saldo_bank))}</TableCell>
                        <TableCell className={cn("text-xs text-right font-bold py-3", hasIssue ? "text-fin-expense" : "text-fin-income")}>
                          {hasIssue ? formatCurrency(toN(r.pengeluaran_belum_rekon)) : '✓ Sinkron'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section id="penerimaan" title="Rincian Penerimaan (STS) Belum Sinkron ke Bank" icon={CheckCircle2} color="bg-emerald-600">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-fin-page border-b border-fin-border">
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">Tanggal</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">Referensi STS</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">OPD</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">Uraian Pendapatan</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted text-right">Nilai STS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-fin-border">
                  {(data.penerimaanUnmatched || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-10 text-sm text-emerald-600 font-semibold">
                        ✓ Semua pendapatan di BKU sudah masuk ke Bank!
                      </TableCell>
                    </TableRow>
                  ) : (data.penerimaanUnmatched || []).map((r: any, i: number) => (
                    <TableRow key={i} className="hover:bg-fin-income-bg transition-colors border-b border-fin-border">
                      <TableCell className="text-xs py-3 text-fin-text-primary">{r.tanggal ? format(new Date(r.tanggal), 'dd/MM/yy') : '-'}</TableCell>
                      <TableCell className="text-xs font-bold py-3 text-fin-income">{r.bukti}</TableCell>
                      <TableCell className="text-xs py-3 text-fin-text-secondary">{r.opd}</TableCell>
                      <TableCell className="text-xs py-3 max-w-[250px] truncate text-fin-text-muted">{r.uraian}</TableCell>
                      <TableCell className="text-xs text-right font-black text-fin-income py-3">{formatCurrency(toN(r.total_nilai))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section id="bank-kredit" title="Mutasi Bank Masuk (Kredit) Tanpa Pasangan BKU" icon={Sparkles} color="bg-blue-600">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-fin-page border-b border-fin-border">
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">Tanggal Bank</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">Deskripsi Rekening Koran</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted text-right">Nilai Masuk</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted text-center">Analisis AI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-fin-border">
                  {(data.bankKreditUnmatched || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-10 text-sm text-blue-600 font-semibold">
                        ✓ Tidak ada setoran tak dikenal di Bank!
                      </TableCell>
                    </TableRow>
                  ) : (data.bankKreditUnmatched || []).map((r: any, i: number) => (
                    <TableRow key={i} className="hover:bg-fin-info-bg transition-colors border-b border-fin-border">
                      <TableCell className="text-xs py-3 text-fin-text-primary">{r.tanggal ? format(new Date(r.tanggal), 'dd/MM/yy') : '-'}</TableCell>
                      <TableCell className="text-xs font-bold py-3 text-fin-text-primary">{r.uraian || r.keterangan}</TableCell>
                      <TableCell className="text-xs text-right font-black text-fin-info py-3">{formatCurrency(toN(r.total_kredit))}</TableCell>
                      <TableCell className="py-3 text-center">
                         <Badge className="bg-fin-info-bg text-fin-info border-none text-[8px] font-black">PENDAPATAN YATIM</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <Section id="matched-discrepancy" title="Daftar Selisih (Outstanding Items)" icon={AlertTriangle} color="bg-indigo-600">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-fin-page border-b border-fin-border">
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">Tanggal</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">Bukti</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted">Keterangan</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted text-right">Selisih</TableHead>
                    <TableHead className="text-[10px] font-bold uppercase text-fin-text-muted text-center">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-fin-border">
                  {(data.matchedWithDiscrepancy || []).map((r: any, i: number) => (
                    <TableRow key={i} className="hover:bg-fin-page transition-colors border-b border-fin-border">
                      <TableCell className="text-xs font-medium text-fin-text-secondary py-3">{r.tanggal ? format(new Date(r.tanggal), 'dd/MM/yyyy') : '-'}</TableCell>
                      <TableCell className="text-xs font-bold text-fin-text-primary py-3">{r.bukti || '-'}</TableCell>
                      <TableCell className="text-xs text-fin-text-muted py-3">{r.keterangan_rekon || r.uraian}</TableCell>
                      <TableCell className="text-xs text-right font-black text-fin-expense py-3">{formatCurrency(toN(r.selisih))}</TableCell>
                      <TableCell className="text-center py-3">
                         <Button variant="ghost" size="sm" className="h-7 px-2 text-[9px] font-bold text-indigo-400 hover:bg-fin-info-bg" onClick={() => { setSelectedAnomaly(r); setAuditNote(r.keterangan_rekon || ''); setAuditStatus(r.status_rekon || 'OPEN'); }}>
                            <Edit3 size={10} className="mr-1" /> Resolusi
                         </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>
        </div>
      )}

      {/* RESOLUTION MODAL */}
      <Dialog open={!!selectedAnomaly} onOpenChange={(open) => !open && setSelectedAnomaly(null)}>
        <DialogContent className="max-w-md bg-fin-surface border-fin-border rounded-2xl p-0 overflow-hidden">
           <DialogHeader className="p-6 bg-[#101828] text-white relative">
              <DialogTitle className="text-xl font-black flex items-center gap-2"><ShieldCheck className="text-emerald-400" /> Resolusi Audit</DialogTitle>
              <DialogDescription className="text-slate-400 text-xs mt-1 uppercase tracking-widest font-black">Investigasi Selisih</DialogDescription>
           </DialogHeader>
           <div className="p-6 space-y-5">
              {selectedAnomaly && (
                 <div className="space-y-4">
                    <div className="p-4 bg-fin-page rounded-xl border border-fin-border">
                       <p className="text-[10px] font-black text-fin-text-muted uppercase">Nilai Selisih</p>
                       <p className="text-lg font-black text-fin-expense">{formatCurrency(toN(selectedAnomaly.selisih))}</p>
                       <p className="text-[10px] text-fin-text-muted mt-1">{selectedAnomaly.uraian}</p>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-black text-fin-text-muted uppercase">Penjelasan</label>
                       <Textarea value={auditNote} onChange={(e) => setAuditNote(e.target.value)} placeholder="Masukkan penjelasan audit..." className="min-h-[100px] text-xs font-bold rounded-xl bg-fin-page border-fin-border text-fin-text-primary placeholder:text-fin-text-muted/30" />
                    </div>
                 </div>
              )}
           </div>
           <DialogFooter className="p-6 bg-fin-page border-t border-fin-border flex gap-3">
              <Button variant="ghost" onClick={() => setSelectedAnomaly(null)} className="flex-1 font-black text-xs uppercase text-fin-text-muted">Batal</Button>
              <Button className="flex-1 bg-[#101828] hover:bg-slate-800 text-white font-black text-xs uppercase" onClick={async () => {
                 if (!selectedAnomaly) return;
                 if (!selectedAnomaly.id) {
                   toast.error('ID data tidak ditemukan — tidak dapat menyimpan resolusi.');
                   return;
                 }
                 if (!selectedAnomaly.tipe) {
                   toast.error('Tipe data tidak dikenali — tidak dapat menyimpan resolusi.');
                   return;
                 }
                 setIsSubmitting(true);
                 try {
                    await api.post('/reports/reconciliation/save-resolution', {
                      type: selectedAnomaly.tipe,
                      id: String(selectedAnomaly.id),
                      note: auditNote,
                      status: 'RESOLVED'
                    });
                    toast.success('Resolusi berhasil disimpan.');
                    mutate();
                    setSelectedAnomaly(null);
                    setAuditNote('');
                 } catch (err: any) {
                   const msg = err?.response?.data?.message || 'Gagal menyimpan resolusi.';
                   toast.error(msg);
                 } finally { setIsSubmitting(false); }
              }} disabled={isSubmitting || !auditNote}>
                 {isSubmitting ? 'Menyimpan...' : 'Simpan Resolusi'}
              </Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BAR MODAL */}
      <Dialog open={showBarModal} onOpenChange={setShowBarModal}>
        <DialogContent className="sm:max-w-[1000px] w-[95vw] max-h-[90vh] bg-white rounded-3xl p-0 overflow-hidden border-none shadow-2xl flex flex-col">
            <DialogHeader className="p-6 bg-gradient-to-r from-indigo-600 to-violet-700 text-white relative shrink-0">
               <div className="absolute right-8 top-6 opacity-20"><FileSignature size={60} /></div>
               <DialogTitle className="text-xl font-black tracking-tight">Konfigurasi Berita Acara (BAR)</DialogTitle>
               <DialogDescription className="text-indigo-100 text-xs opacity-90 text-left">Lengkapi parameter resmi sesuai format BPKAD Kab. Kepulauan Aru.</DialogDescription>
            </DialogHeader>

            <div className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
               <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 shadow-inner grid grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Nomor BAR</label>
                     <Input value={barConfig.noBar} onChange={e => setBarConfig({...barConfig, noBar: e.target.value})} className="text-xs font-bold h-10 bg-white border-slate-200 rounded-xl shadow-sm" />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Bulan Yang Direkon</label>
                     <Select value={barConfig.bulanRekon} onValueChange={val => setBarConfig({...barConfig, bulanRekon: val})}>
                        <SelectTrigger className="h-10 text-xs font-bold bg-white border-slate-200 rounded-xl shadow-sm">
                           <SelectValue placeholder="Pilih Bulan" />
                        </SelectTrigger>
                        <SelectContent>
                           {MONTHS.map((m, idx) => (
                              <SelectItem key={idx} value={String(idx + 1)} className="text-xs font-bold">{m}</SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Tanggal Rekon (Manual)</label>
                     <Input type="date" value={barConfig.tanggalRekon} onChange={e => setBarConfig({...barConfig, tanggalRekon: e.target.value})} className="text-xs font-bold h-10 bg-white border-slate-200 rounded-xl shadow-sm" />
                  </div>
               </div>

               <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1 flex items-center gap-2"><ShieldCheck size={14} className="text-indigo-500" /> Dasar Hukum BAR</label>
                  <Textarea value={barConfig.dasarHukum} onChange={e => setBarConfig({...barConfig, dasarHukum: e.target.value})} className="text-xs font-bold min-h-[80px] bg-white border-slate-200 rounded-2xl p-4 shadow-sm" />
               </div>

               <div className="grid grid-cols-3 gap-6">
                  <div className="space-y-4 p-5 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
                     <label className="text-[11px] font-black uppercase text-indigo-700 tracking-widest flex items-center gap-2">Pihak Pertama (BPKAD)</label>
                     <div className="space-y-2">
                        <Input value={barConfig.jabatan1} onChange={e => setBarConfig({...barConfig, jabatan1: e.target.value})} placeholder="Jabatan" className="text-[10px] h-8 bg-white" />
                        <Input value={barConfig.pejabat1} onChange={e => setBarConfig({...barConfig, pejabat1: e.target.value})} placeholder="Nama Lengkap" className="text-xs font-black h-9 bg-white" />
                        <Input value={barConfig.nip1} onChange={e => setBarConfig({...barConfig, nip1: e.target.value})} placeholder="NIP" className="text-[10px] h-8 bg-white" />
                     </div>
                  </div>
                  <div className="space-y-4 p-5 bg-emerald-50/30 rounded-2xl border border-emerald-100/50">
                     <label className="text-[11px] font-black uppercase text-emerald-700 tracking-widest flex items-center gap-2">Pihak Kedua (BANK)</label>
                     <div className="space-y-2">
                        <Input value={barConfig.jabatan2} onChange={e => setBarConfig({...barConfig, jabatan2: e.target.value})} placeholder="Jabatan" className="text-[10px] h-8 bg-white" />
                        <Input value={barConfig.pejabat2} onChange={e => setBarConfig({...barConfig, pejabat2: e.target.value})} placeholder="Nama Lengkap" className="text-xs font-black h-9 bg-white" />
                        <Input value={barConfig.nip2} onChange={e => setBarConfig({...barConfig, nip2: e.target.value})} placeholder="ID / NIP" className="text-[10px] h-8 bg-white" />
                     </div>
                  </div>
                  <div className="space-y-4 p-5 bg-amber-50/30 rounded-2xl border border-amber-100/50">
                     <label className="text-[11px] font-black uppercase text-amber-700 tracking-widest flex items-center gap-2">Mengetahui (BPKAD)</label>
                     <div className="space-y-2">
                        <Input value={barConfig.jabatan3} onChange={e => setBarConfig({...barConfig, jabatan3: e.target.value})} placeholder="Jabatan" className="text-[10px] h-8 bg-white" />
                        <Input value={barConfig.pejabat3} onChange={e => setBarConfig({...barConfig, pejabat3: e.target.value})} placeholder="Nama Lengkap" className="text-xs font-black h-9 bg-white" />
                        <Input value={barConfig.nip3} onChange={e => setBarConfig({...barConfig, nip3: e.target.value})} placeholder="NIP" className="text-[10px] h-8 bg-white" />
                     </div>
                  </div>
               </div>
            </div>

            <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 justify-end shrink-0">
               <Button variant="ghost" onClick={() => setShowBarModal(false)} className="h-11 px-8 rounded-2xl font-black text-xs uppercase">Batal</Button>
               <Button onClick={() => { handleGenerateBAR(); setShowBarModal(false); }} className="h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase px-10 shadow-lg">
                  <Download size={16} className="mr-2" /> Unduh BAR (PDF)
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
    </div>
  );
}
