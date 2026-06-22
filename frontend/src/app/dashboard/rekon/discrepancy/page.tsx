'use client';
// Rebuild trigger

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { AlertTriangle, BarChart3, Building2, Calendar, CheckCircle2, ChevronDown, ChevronRight, Download, RefreshCw, XCircle, FileText, ShieldCheck, Lock, Edit3, Sparkles, FileSignature, Save, User, Printer } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox } from "@/components/ui/combobox";
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

function getBarKey(year: string, bulan: string) {
  return `bar_config_discrepancy_${year}_${String(bulan).padStart(2, '0')}`;
}

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
    noBar: '',
    dasarHukum: 'Peraturan Daerah tentang Pengelolaan Keuangan Daerah dan Standar Akuntansi Pemerintahan (SAP).',
    tanggalRekon: format(new Date(), 'yyyy-MM-dd'),
    bulanRekon: String(new Date().getMonth() + 1),
    pejabat1: 'Nama Pejabat BPKAD',
    jabatan1: 'Kepala Bidang Perbendaharaan',
    nip1: '19XXXXXXXXXXXXX',
    pangkat1: '',
    pejabat2: 'Nama Pimpinan Bank',
    jabatan2: 'Pimpinan Cabang Bank Maluku Malut',
    nip2: '-',
    pejabat3: 'NAMA KEPALA BADAN',
    jabatan3: 'Kepala BPKAD',
    nip3: '19XXXXXXXXXXXXX',
    pangkat3: '',
    showPangkat: true
  });

  const [instansiConfig, setInstansiConfig] = useState<any>(null);
  // skipFirstSave = true → [barConfig] effect abaikan run pertama (state default),
  // baru simpan setelah state berubah dari hasil load atau input user.
  const skipFirstSave = useRef(true);

  // ── Muat konfigurasi BAR dari localStorage saat pertama kali mount ──
  useEffect(() => {
    const currentMonth = String(new Date().getMonth() + 1);
    // Per-bulan key (baru), fallback ke key lama untuk backward compat
    const savedBar = localStorage.getItem(getBarKey(year, currentMonth))
                  ?? localStorage.getItem('bar_config_discrepancy');
    if (savedBar) {
      try { setBarConfig(prev => ({ ...prev, ...JSON.parse(savedBar) })); } catch {}
    }
    // LOCKED: app_config override pejabat3/jabatan3/nip3 HANYA jika !savedBar
    // Jika bar_config_discrepancy sudah ada, data Mengetahui yang disimpan user dipertahankan.
    // JANGAN hapus guard !savedBar ini — tanpanya data Mengetahui reset setiap ganti bulan.
    const savedApp = localStorage.getItem('app_config');
    if (savedApp) {
      try {
        const parsed = JSON.parse(savedApp);
        setInstansiConfig(parsed);
        if (!savedBar) {
          setBarConfig(prev => ({
            ...prev,
            pejabat3: parsed.pimpinan_nama || prev.pejabat3,
            jabatan3: parsed.pimpinan_jabatan || prev.jabatan3,
            nip3: parsed.pimpinan_nip || prev.nip3
          }));
        }
      } catch {}
    }
  }, []);

  // ── Auto-save: simpan ke localStorage setiap barConfig berubah ──
  // Run pertama (state default) dilewati agar tidak menimpa data tersimpan.
  // Disimpan per-bulan: getBarKey(year, bulanRekon).
  useEffect(() => {
    if (skipFirstSave.current) {
      skipFirstSave.current = false;
      return;
    }
    localStorage.setItem(getBarKey(year, barConfig.bulanRekon), JSON.stringify(barConfig));
  }, [barConfig]);

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

  const handleGenerateBAR = async () => {
    if (!data) return;
    // Buka window SEBELUM await pertama agar tidak diblokir popup blocker
    const pdfWindow = window.open('about:blank', '_blank');
    try {
      const targetBulanInt = parseInt(barConfig.bulanRekon) || 1;
      const selectedBlnName = MONTHS[targetBulanInt - 1] || 'Januari';
      const saldoAwalSilpa = toN(data.saldoAwalSilpa);

      // ── Saldo awal: Jan = SILPA, Feb–Des = saldo akhir bulan sebelumnya ──
      let saldoAwalKas: number;
      if (targetBulanInt === 1) {
        saldoAwalKas = saldoAwalSilpa;
      } else {
        const mPrev    = (data.monthlyBalance || []).filter((m: any) => m.bulan <= targetBulanInt - 1);
        const penPrev  = mPrev.reduce((acc: number, m: any) => acc + toN(m.penerimaan), 0);
        const pengPrev = mPrev.reduce((acc: number, m: any) => acc + toN(m.pengeluaran), 0);
        const potPrev  = (data.potonganUnmatched || [])
          .filter((p: any) => p.bulan <= targetBulanInt - 1)
          .reduce((acc: number, p: any) => acc + toN(p.total_nilai), 0);
        saldoAwalKas = penPrev - pengPrev + potPrev;
      }

      // ── Penerimaan & pengeluaran: hanya bulan terpilih ──
      const currentMonthData = (data.monthlyBalance || []).find((m: any) => m.bulan === targetBulanInt);
      const displayPenerimaan = targetBulanInt === 1
        ? toN(currentMonthData?.penerimaan) - saldoAwalSilpa
        : toN(currentMonthData?.penerimaan);
      const totalPengeluaran = toN(currentMonthData?.pengeluaran);

      // Potongan mengendap hanya bulan terpilih
      const totalPotonganMengendap = (data.potonganUnmatched || [])
        .filter((p: any) => p.bulan === targetBulanInt)
        .reduce((acc: number, p: any) => acc + toN(p.total_nilai), 0);

      const saldoAkhirBKU = saldoAwalKas + displayPenerimaan - totalPengeluaran + totalPotonganMengendap;
      const saldoBank = toN(data.monthlyBalance?.find((m: any) => m.bulan === targetBulanInt)?.saldo_bank || 0);
      const selisihNilai = Math.abs(saldoAkhirBKU - saldoBank);
      const isSesuai = selisihNilai < 1.0;

      const tglObj = new Date(barConfig.tanggalRekon);
      const formattedLastDay = `${new Date(tglObj.getFullYear(), targetBulanInt, 0).getDate()}/${targetBulanInt}/${tglObj.getFullYear()}`;

      const previewHari = format(tglObj, 'EEEE', { locale: id });
      const previewTgl = tglObj.getDate();
      const previewBln = MONTHS[tglObj.getMonth()];
      const previewThn = tglObj.getFullYear();
      const terbilangTgl = terbilang(previewTgl);
      const terbilangThn = terbilang(previewThn);

      const allAnomalies = [...(data.matchedWithDiscrepancy || []), ...(data.unmatchedDetails || [])];
      const anomalyRows = allAnomalies
        .filter((r: any) => {
          const rDate = new Date(r.tanggal);
          return rDate.getMonth() + 1 <= targetBulanInt && rDate.getFullYear() === (new Date(barConfig.tanggalRekon || new Date()).getFullYear());
        })
        .filter((r: any) => {
          const isPotongan = r.tipe === 'POTONGAN SP2D' || r.tipe === 'POTONGAN' || r.tipe === 'POTONGAN_BANK';
          const isLainnya = (r.uraian || '').toLowerCase().includes('lainnya') || (r.keterangan_rekon || '').toLowerCase().includes('lainnya');
          return !(isPotongan && isLainnya);
        })
        .map((r: any) => ({
          tipe: r.tipe,
          bukti: r.bukti,
          tanggal: r.tanggal ? format(new Date(r.tanggal), 'dd/MM/yyyy') : '-',
          keterangan: r.keterangan_rekon || r.uraian || 'Belum ada penjelasan',
          opd: r.opd || '',
          nilai: toN(r.selisih || r.nilai)
        }));

      const res = await fetch('/api/cetak-discrepancy-rekon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          barConfig, instansiConfig, year, saldoAwalKas, displayPenerimaan,
          totalPengeluaran, saldoAkhirBKU, saldoBank, selisihNilai, isSesuai,
          formattedLastDay, previewBlnRekonName: selectedBlnName,
          previewHari, previewTgl, previewBln, previewThn,
          terbilangTgl, terbilangThn, anomalyRows
        })
      });

      if (!res.ok) throw new Error('Gagal mencetak dokumen BAR');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      if (pdfWindow) {
        pdfWindow.location.href = url;
      } else {
        // Fallback jika popup tetap diblokir: download langsung
        const link = document.createElement('a');
        link.href = url;
        link.download = `BAR_REKON_${year}_${selectedBlnName}.pdf`;
        link.click();
      }
      setTimeout(() => window.URL.revokeObjectURL(url), 15000);
      toast.success('Dokumen BAR siap — klik ikon cetak di PDF viewer!');
    } catch (err: any) {
      pdfWindow?.close();
      toast.error(err.message || 'Terjadi kesalahan saat mencetak BAR');
    }
  };

  const Section = ({ id, title, icon: Icon, color, children }: any) => {
    const isOpen = activeSection === id;
    return (
      <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
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
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-32 h-10 px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
            >
              {[2024, 2025, 2026].map(y => (
                <option key={y} value={String(y)} className="bg-fin-surface text-fin-text-primary">
                  {y}
                </option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={() => mutate()} className="h-10 gap-2 border-fin-border bg-fin-surface text-fin-text-primary">
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button onClick={handleExport} disabled={!data} className="h-10 bg-fin-surface text-fin-text-primary border-fin-border hover:bg-fin-page gap-2">
              <Download size={14} />
              Excel
            </Button>
            <Button onClick={() => setShowBarModal(true)} disabled={!data} className="h-10 bg-ds-primary text-white gap-2 hover:bg-ds-primary-hover shadow-md shadow-ds-primary/20">
              <FileText size={14} />
              Generate BAR
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'SP2D Belum Rekon',    value: formatCurrency(totalSP2DBelum),       sub: 'BKU · Kas Keluar',  lux: 'lux-stat-rose',    icon: XCircle },
          { label: 'Bank Debet Blm Cocok', value: formatCurrency(totalBankDebetBelum),  sub: 'Bank · Keluar',     lux: 'lux-stat-amber',   icon: AlertTriangle },
          { label: 'Penerimaan Blm Rekon', value: formatCurrency(totalPenerimaanBelum), sub: 'BKU · Kas Masuk',   lux: 'lux-stat-emerald', icon: CheckCircle2 },
          { label: 'Bank Kredit Blm Cocok',value: formatCurrency(totalBankKreditBelum), sub: 'Bank · Masuk',      lux: 'lux-stat-cyan',    icon: BarChart3 },
          { label: 'Potongan Blm Match',   value: formatCurrency(totalPotonganBelum),   sub: 'Rincian Pajak',     lux: 'lux-stat-teal',    icon: ShieldCheck },
          { label: 'OPD Selisih',          value: `${opdDenganSelisih} OPD`,            sub: 'Perlu Audit',       lux: 'lux-stat-slate',   icon: Building2 },
        ].map((c, i) => (
          <div key={i} className={cn('lux-stat p-4 rounded-xl flex flex-col group', c.lux)}>
            <div className="flex items-start justify-between mb-2">
              <p className="text-[9px] font-bold text-white/60 uppercase tracking-widest leading-tight">{c.label}</p>
              <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <c.icon className="w-3.5 h-3.5 text-white/80" />
              </div>
            </div>
            <p className="text-xl font-black tracking-tight text-white tabular-nums truncate">
              {(isLoading && !data) ? '—' : c.value}
            </p>
            <span className="text-[9px] font-bold text-white/40 uppercase mt-2 block">{c.sub}</span>
          </div>
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

          <Section id="matched-discrepancy" title="Daftar Selisih (Outstanding Items)" icon={AlertTriangle} color="bg-ds-primary">
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
        <DialogContent className="max-w-md bg-fin-surface border-fin-border rounded-xl p-0 overflow-hidden">
           <DialogHeader className="p-6 bg-ds-primary text-white relative">
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
              <Button className="flex-1 bg-ds-primary hover:bg-slate-800 text-white font-black text-xs uppercase" onClick={async () => {
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
        <DialogContent className="sm:max-w-[1400px] w-[96vw] max-h-[92vh] bg-fin-surface rounded-2xl p-0 overflow-hidden border-none shadow-2xl flex flex-col">
          <DialogHeader className="p-6 bg-gradient-to-r from-indigo-600 to-violet-700 text-white relative shrink-0">
            <div className="absolute right-8 top-6 opacity-20"><FileSignature size={60} /></div>
            <DialogTitle className="text-xl font-black tracking-tight">Konfigurasi Berita Acara (BAR)</DialogTitle>
            <DialogDescription className="text-indigo-100 text-xs opacity-90 text-left">Lengkapi parameter resmi sesuai format BPKAD Kab. Kepulauan Aru.</DialogDescription>
          </DialogHeader>

          {/* Split Screen Grid */}
          <div className="grid grid-cols-1 xl:grid-cols-12 overflow-hidden flex-1 min-h-0 bg-fin-page">

            {/* LEFT SIDE: CONFIGURATION INPUTS */}
            <div className="xl:col-span-5 bg-fin-surface p-6 space-y-5 overflow-y-auto custom-scrollbar flex flex-col justify-start border-r border-fin-border">
              <div className="bg-fin-page p-4 rounded-xl border border-fin-border shadow-inner grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-fin-text-secondary tracking-wider ml-1">Nomor BAR</label>
                  <Input value={barConfig.noBar} onChange={e => setBarConfig({ ...barConfig, noBar: e.target.value })} className="text-xs font-bold h-10 bg-fin-surface border-fin-border text-fin-text-primary rounded-lg shadow-sm focus:border-indigo-500" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-fin-text-secondary tracking-wider ml-1">Bulan Rekon</label>
                  <select
                    value={barConfig.bulanRekon}
                    onChange={e => {
                      const newMonth = e.target.value;
                      const saved = localStorage.getItem(getBarKey(year, newMonth));
                      if (saved) {
                        try {
                          setBarConfig(prev => ({ ...prev, ...JSON.parse(saved), bulanRekon: newMonth }));
                          return;
                        } catch {}
                      }
                      setBarConfig(prev => ({ ...prev, bulanRekon: newMonth }));
                    }}
                    className="h-10 text-xs bg-fin-surface border border-fin-border text-fin-text-primary rounded-lg shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 px-3 w-full outline-none"
                  >
                    <option value="" disabled>Pilih Bulan</option>
                    {MONTHS.map((m, idx) => (
                      <option key={idx} value={String(idx + 1)}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-fin-text-secondary tracking-wider ml-1">Tgl Rekon</label>
                  <Input type="date" value={barConfig.tanggalRekon} onChange={e => setBarConfig({ ...barConfig, tanggalRekon: e.target.value })} className="text-xs font-bold h-10 bg-fin-surface border-fin-border text-fin-text-primary rounded-lg shadow-sm focus:border-indigo-500" />
                </div>
              </div>

              <div className="space-y-1.5 shrink-0">
                <label className="text-[10px] font-black uppercase text-fin-text-secondary tracking-wider ml-1 flex items-center gap-1.5"><ShieldCheck size={14} className="text-indigo-500" /> Dasar Hukum BAR</label>
                <Textarea value={barConfig.dasarHukum} onChange={e => setBarConfig({ ...barConfig, dasarHukum: e.target.value })} className="text-xs font-bold min-h-[70px] bg-fin-surface border-fin-border text-fin-text-primary rounded-lg p-3 shadow-sm resize-none focus:border-indigo-500" />
              </div>

              <div className="space-y-4 pr-2 pb-6">

                {/* Toggle Pangkat */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-fin-page rounded-lg border border-fin-border">
                  <span className="text-[10px] font-black uppercase text-fin-text-secondary tracking-wider">Tampilkan Pangkat pada BAR</span>
                  <button
                    type="button"
                    onClick={() => setBarConfig(prev => ({ ...prev, showPangkat: !prev.showPangkat }))}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
                      barConfig.showPangkat ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
                    )}
                  >
                    <span className={cn('inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform', barConfig.showPangkat ? 'translate-x-4' : 'translate-x-0.5')} />
                  </button>
                </div>

                <div className="space-y-3 p-5 bg-indigo-500/[0.03] dark:bg-indigo-500/[0.05] rounded-xl border border-indigo-500/20 hover:border-indigo-500/40 transition-colors">
                  <label className="text-[11px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider flex items-center gap-1.5 border-b border-indigo-500/10 pb-2 mb-1">Pihak Pertama (BPKAD)</label>
                  <div className="space-y-3 mt-2">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">Jabatan Resmi</span>
                      <Input value={barConfig.jabatan1} onChange={e => setBarConfig({ ...barConfig, jabatan1: e.target.value })} placeholder="Jabatan" className="text-xs h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">Nama Lengkap</span>
                      <Input value={barConfig.pejabat1} onChange={e => setBarConfig({ ...barConfig, pejabat1: e.target.value })} placeholder="Nama Lengkap" className="text-sm font-black h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">Pangkat / Gol</span>
                      <Input value={barConfig.pangkat1} onChange={e => setBarConfig({ ...barConfig, pangkat1: e.target.value })} placeholder="Pangkat / Golongan (opsional)" className="text-xs h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-indigo-500" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">NIP</span>
                      <Input value={barConfig.nip1} onChange={e => setBarConfig({ ...barConfig, nip1: e.target.value })} placeholder="NIP" className="text-xs h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-indigo-500" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-5 bg-emerald-500/[0.03] dark:bg-emerald-500/[0.05] rounded-xl border border-emerald-500/20 hover:border-emerald-500/40 transition-colors">
                  <label className="text-[11px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider flex items-center gap-1.5 border-b border-emerald-500/10 pb-2 mb-1">Pihak Kedua (BANK)</label>
                  <div className="space-y-3 mt-2">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">Jabatan Resmi</span>
                      <Input value={barConfig.jabatan2} onChange={e => setBarConfig({ ...barConfig, jabatan2: e.target.value })} placeholder="Jabatan" className="text-xs h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-emerald-500" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">Nama Lengkap</span>
                      <Input value={barConfig.pejabat2} onChange={e => setBarConfig({ ...barConfig, pejabat2: e.target.value })} placeholder="Nama Lengkap" className="text-sm font-black h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-emerald-500" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">ID / NIP</span>
                      <Input value={barConfig.nip2} onChange={e => setBarConfig({ ...barConfig, nip2: e.target.value })} placeholder="ID / NIP" className="text-xs h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-emerald-500" />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-5 bg-amber-500/[0.03] dark:bg-amber-500/[0.05] rounded-xl border border-amber-500/20 hover:border-amber-500/40 transition-colors">
                  <label className="text-[11px] font-black uppercase text-amber-600 dark:text-amber-400 tracking-wider flex items-center gap-1.5 border-b border-amber-500/10 pb-2 mb-1">Mengetahui (BPKAD)</label>
                  <div className="space-y-3 mt-2">
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">Jabatan Resmi</span>
                      <Input value={barConfig.jabatan3} onChange={e => setBarConfig({ ...barConfig, jabatan3: e.target.value })} placeholder="Jabatan" className="text-xs h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-amber-500" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">Nama Lengkap</span>
                      <Input value={barConfig.pejabat3} onChange={e => setBarConfig({ ...barConfig, pejabat3: e.target.value })} placeholder="Nama Lengkap" className="text-sm font-black h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-amber-500" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">Pangkat / Gol</span>
                      <Input value={barConfig.pangkat3} onChange={e => setBarConfig({ ...barConfig, pangkat3: e.target.value })} placeholder="Pangkat / Golongan (opsional)" className="text-xs h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-amber-500" />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-wider ml-0.5">NIP</span>
                      <Input value={barConfig.nip3} onChange={e => setBarConfig({ ...barConfig, nip3: e.target.value })} placeholder="NIP" className="text-xs h-10 bg-fin-surface border-fin-border text-fin-text-primary focus:border-amber-500" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT SIDE: LIVE PREVIEW OF THE DOCUMENT */}
            <div className="xl:col-span-7 bg-fin-subtle p-6 overflow-y-auto custom-scrollbar flex justify-center items-start">
              {/* Scaled paper preview */}
              <div className="bg-white p-10 shadow-2xl rounded-sm w-[210mm] min-h-[297mm] text-black text-[9.5pt] leading-relaxed flex flex-col print:shadow-none" style={{ fontFamily: '"Times New Roman", Times, serif' }}>

                {/* Kop Surat Preview */}
                <div className="flex items-center relative pb-3 mb-4 border-b-[3px] border-black shrink-0">
                  <div className="absolute left-0 bottom-[-1px] w-full border-b-[1px] border-black"></div>
                  <div className="absolute left-8 top-1 bottom-3 flex items-center justify-center z-10">
                    <img src="/logo-aru.png" alt="Logo Aru" className="w-[62px] object-contain" />
                  </div>
                  <div className="flex-1 text-center font-serif text-black z-10 px-20">
                    <p className="font-bold text-[11.5pt] tracking-wide uppercase leading-tight">Pemerintah Kabupaten Kepulauan Aru</p>
                    <p className="font-bold text-[13.5pt] tracking-wide uppercase leading-tight mt-0.5 whitespace-nowrap">Badan Pengelolaan Keuangan dan Aset Daerah</p>
                    <p className="text-[8.5pt] mt-1 font-serif italic text-black leading-tight">Jl. Pemda - Email : bpkad.kepulauanarukab@gmail.com</p>
                  </div>
                </div>

                {/* Judul BAR */}
                <div className="text-center mb-4 shrink-0">
                  <p className="font-black text-[12pt] underline uppercase tracking-widest leading-tight">Berita Acara Rekonsiliasi Kas</p>
                  <p className="font-semibold text-[9.5pt] mt-0.5">Nomor : {barConfig.noBar}</p>
                </div>

                {/* Content Generation */}
                {(() => {
                  const targetB = parseInt(barConfig.bulanRekon) || 1;
                  const selectedBlnName = MONTHS[targetB - 1] || '';
                  const tglObj = barConfig.tanggalRekon ? new Date(barConfig.tanggalRekon) : new Date();
                  const previewHari = format(tglObj, 'EEEE', { locale: id });
                  const previewTgl = tglObj.getDate();
                  const previewBln = MONTHS[tglObj.getMonth()];
                  const previewThn = tglObj.getFullYear();

                  const previewLastDay = new Date(parseInt(year), parseInt(barConfig.bulanRekon), 0);
                  const previewFmtLastDay = `${previewLastDay.getDate()}/${previewLastDay.getMonth() + 1}/${previewLastDay.getFullYear()}`;

                  // Calculate preview values (rekonsiliasi bulanan)
                  const pSaldoAwalSilpa = toN(data?.saldoAwalSilpa);

                  // ── Saldo awal: Jan = SILPA, Feb–Des = saldo akhir bulan sebelumnya ──
                  let pSaldoAwalKas: number;
                  if (targetB === 1) {
                    pSaldoAwalKas = pSaldoAwalSilpa;
                  } else {
                    const mPrev    = (data?.monthlyBalance || []).filter((m: any) => m.bulan <= targetB - 1);
                    const penPrev  = mPrev.reduce((acc: number, m: any) => acc + toN(m.penerimaan), 0);
                    const pengPrev = mPrev.reduce((acc: number, m: any) => acc + toN(m.pengeluaran), 0);
                    const potPrev  = (data?.potonganUnmatched || [])
                      .filter((p: any) => p.bulan <= targetB - 1)
                      .reduce((acc: number, p: any) => acc + toN(p.total_nilai), 0);
                    pSaldoAwalKas = penPrev - pengPrev + potPrev;
                  }

                  // ── Penerimaan & pengeluaran: hanya bulan terpilih ──
                  const pCurMonthData = (data?.monthlyBalance || []).find((m: any) => m.bulan === targetB);
                  const pDisplayPenerimaan = targetB === 1
                    ? toN(pCurMonthData?.penerimaan) - pSaldoAwalSilpa
                    : toN(pCurMonthData?.penerimaan);
                  const pTotalPeng = toN(pCurMonthData?.pengeluaran);

                  // Potongan mengendap hanya bulan terpilih
                  const pTotalPotonganMengendap = (data?.potonganUnmatched || [])
                    .filter((p: any) => p.bulan === targetB)
                    .reduce((acc: number, p: any) => acc + toN(p.total_nilai), 0);

                  const pSaldoAkhirBKU = pSaldoAwalKas + pDisplayPenerimaan - pTotalPeng + pTotalPotonganMengendap;
                  const pSaldoBank = toN(data?.monthlyBalance?.find((m: any) => m.bulan === targetB)?.saldo_bank || 0);
                  const pSelisih = Math.abs(pSaldoBank - pSaldoAkhirBKU);
                  const pIsSesuai = pSelisih < 1;

                  const pAllAnomalies = [...(data?.matchedWithDiscrepancy || []), ...(data?.unmatchedDetails || [])];
                  const pAnomalyRows = pAllAnomalies
                    .filter((r: any) => {
                      const rDate = new Date(r.tanggal);
                      return rDate.getMonth() + 1 <= targetB && rDate.getFullYear() === (new Date(barConfig.tanggalRekon || new Date()).getFullYear());
                    })
                    .filter((r: any) => {
                      const isPotongan = r.tipe === 'POTONGAN SP2D' || r.tipe === 'POTONGAN' || r.tipe === 'POTONGAN_BANK';
                      const isLainnya = (r.uraian || '').toLowerCase().includes('lainnya') || (r.keterangan_rekon || '').toLowerCase().includes('lainnya');
                      return !(isPotongan && isLainnya);
                    });

                  return (
                    <div className="flex-1 flex flex-col text-justify font-serif text-[10pt]">
                      <p className="leading-snug">
                        Pada hari ini, <span className="font-bold italic">{previewHari}</span> tanggal <span className="font-bold italic">{terbilang(previewTgl)}</span> bulan <span className="font-bold italic">{previewBln}</span> tahun <span className="font-bold italic">{terbilang(previewThn)}</span>, kami yang bertanda tangan di bawah ini:
                      </p>

                      <div className="my-2 ml-6 space-y-1.5 text-[9.5pt] font-sans">
                        <div className="leading-snug">
                          <span className="font-black text-slate-700 block mb-1">1.</span>
                          <table style={{ borderCollapse: 'collapse', marginTop: 2, width: 'auto' }}>
                            <tbody>
                              <tr>
                                <td style={{ whiteSpace: 'nowrap', paddingRight: 4, verticalAlign: 'top', minWidth: 56 }}>Nama</td>
                                <td style={{ padding: '0 3px 0 0', verticalAlign: 'top' }}>:</td>
                                <td style={{ verticalAlign: 'top', fontWeight: 'bold' }}>{barConfig.pejabat1 || '—'}</td>
                              </tr>
                              {barConfig.showPangkat && barConfig.pangkat1 && (
                                <tr>
                                  <td style={{ whiteSpace: 'nowrap', paddingRight: 4, verticalAlign: 'top' }}>Pangkat</td>
                                  <td style={{ padding: '0 3px 0 0', verticalAlign: 'top' }}>:</td>
                                  <td style={{ verticalAlign: 'top' }}>{barConfig.pangkat1}</td>
                                </tr>
                              )}
                              <tr>
                                <td style={{ whiteSpace: 'nowrap', paddingRight: 4, verticalAlign: 'top' }}>Jabatan</td>
                                <td style={{ padding: '0 3px 0 0', verticalAlign: 'top' }}>:</td>
                                <td style={{ verticalAlign: 'top', fontStyle: 'italic' }}>{barConfig.jabatan1 || '—'}</td>
                              </tr>
                              <tr>
                                <td style={{ whiteSpace: 'nowrap', paddingRight: 4, verticalAlign: 'top' }}>NIP</td>
                                <td style={{ padding: '0 3px 0 0', verticalAlign: 'top' }}>:</td>
                                <td style={{ verticalAlign: 'top' }}>{barConfig.nip1 || '—'}</td>
                              </tr>
                              <tr>
                                <td colSpan={3} style={{ paddingTop: 2, fontStyle: 'italic' }}>Selanjutnya disebut sebagai <strong>PIHAK KESATU</strong></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="leading-snug">
                          <span className="font-black text-slate-700 block mb-1">2.</span>
                          <table style={{ borderCollapse: 'collapse', marginTop: 2, width: 'auto' }}>
                            <tbody>
                              <tr>
                                <td style={{ whiteSpace: 'nowrap', paddingRight: 4, verticalAlign: 'top', minWidth: 56 }}>Nama</td>
                                <td style={{ padding: '0 3px 0 0', verticalAlign: 'top' }}>:</td>
                                <td style={{ verticalAlign: 'top', fontWeight: 'bold' }}>{barConfig.pejabat2 || '—'}</td>
                              </tr>
                              <tr>
                                <td style={{ whiteSpace: 'nowrap', paddingRight: 4, verticalAlign: 'top' }}>Jabatan</td>
                                <td style={{ padding: '0 3px 0 0', verticalAlign: 'top' }}>:</td>
                                <td style={{ verticalAlign: 'top', fontStyle: 'italic' }}>{barConfig.jabatan2 || '—'}</td>
                              </tr>
                              <tr>
                                <td style={{ whiteSpace: 'nowrap', paddingRight: 4, verticalAlign: 'top' }}>ID/NIP</td>
                                <td style={{ padding: '0 3px 0 0', verticalAlign: 'top' }}>:</td>
                                <td style={{ verticalAlign: 'top' }}>{barConfig.nip2 || '—'}</td>
                              </tr>
                              <tr>
                                <td colSpan={3} style={{ paddingTop: 2, fontStyle: 'italic' }}>Selanjutnya disebut sebagai <strong>PIHAK KEDUA</strong></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <p className="leading-snug mt-1.5">
                        Telah melakukan rekonsiliasi kas pada RKUD Nomor 080 103 6465 antara <span className="font-bold">Pihak Kesatu</span> Kuasa Bendahara Umum Daerah (KBUD) Kabupaten Kepulauan Aru dengan <span className="font-bold">Pihak Kedua</span> PT. Bank Maluku-Maluku Utara Cabang Dobo untuk Periode <span className="font-bold italic underline">{selectedBlnName}</span> Tahun Anggaran <span className="font-bold">{year}</span>, dengan hasil sebagai berikut:
                      </p>

                      {/* A. DASAR HUKUM */}
                      <div className="mt-3 shrink-0">
                        <p className="font-bold uppercase text-[9.5pt] tracking-wide mb-1.5">A. DASAR HUKUM</p>
                        <p className="text-[8.5pt] font-sans italic text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/60 leading-snug">{barConfig.dasarHukum || '—'}</p>
                      </div>

                      {/* B. HASIL REKONSILIASI KAS */}
                      <div className="mt-3">
                        <p className="font-bold uppercase text-[9.5pt] tracking-wide mb-1.5">B. HASIL REKONSILIASI KAS</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8.5pt', fontFamily: 'sans-serif' }}>
                          <thead>
                            <tr>
                              <th style={{ border: '1px solid #000', padding: '4px 6px', backgroundColor: '#f1f5f9', textAlign: 'center', width: 32 }}>NO</th>
                              <th style={{ border: '1px solid #000', padding: '4px 6px', backgroundColor: '#f1f5f9', textAlign: 'left' }}>URAIAN</th>
                              <th style={{ border: '1px solid #000', padding: '4px 6px', backgroundColor: '#f1f5f9', textAlign: 'right', width: 176 }}>JUMLAH (RP)</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>1</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>Saldo Awal Kas BKU (Kas Daerah)</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(pSaldoAwalKas)}</td>
                            </tr>
                            <tr>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>2</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>Total Penerimaan Kas Bulan {selectedBlnName}</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(pDisplayPenerimaan)}</td>
                            </tr>
                            <tr>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>3</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>Total Pengeluaran Kas Bulan {selectedBlnName}</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(pTotalPeng)}</td>
                            </tr>
                            <tr style={{ fontWeight: 'bold', backgroundColor: '#eef2ff' }}>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>4</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>Saldo Akhir BKU RKUD per Tanggal {previewFmtLastDay}</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(pSaldoAkhirBKU)}</td>
                            </tr>
                            <tr style={{ fontWeight: 'bold', backgroundColor: '#f0fdf4' }}>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>5</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>Saldo Rekening Koran Bank per Tanggal {previewFmtLastDay}</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(pSaldoBank)}</td>
                            </tr>
                            <tr style={{ fontWeight: 'bold', backgroundColor: pIsSesuai ? '#f8fafc' : '#fff1f2' }}>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>6</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px' }}>Selisih (No. 4 - No. 5)</td>
                              <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace' }}>{pIsSesuai ? 'NOL' : formatCurrency(pSelisih)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* C. RINCIAN SELISIH */}
                      <div className="mt-3">
                        <p className="font-bold uppercase text-[9.5pt] tracking-wide mb-1.5">C. RINCIAN SELISIH (OUTSTANDING ITEMS)</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt', fontFamily: 'sans-serif' }}>
                          <thead>
                            <tr>
                              <th style={{ border: '1px solid #000', padding: '4px 6px', backgroundColor: '#f1f5f9', textAlign: 'center', width: 32 }}>NO</th>
                              <th style={{ border: '1px solid #000', padding: '4px 6px', backgroundColor: '#f1f5f9', textAlign: 'left', width: 128 }}>REFERENSI / TIPE</th>
                              <th style={{ border: '1px solid #000', padding: '4px 6px', backgroundColor: '#f1f5f9', textAlign: 'left' }}>KETERANGAN TRANSAKSI</th>
                              <th style={{ border: '1px solid #000', padding: '4px 6px', backgroundColor: '#f1f5f9', textAlign: 'right', width: 144 }}>NILAI (RP)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pAnomalyRows.length > 0 ? (
                              pAnomalyRows.map((r: any, i: number) => (
                                <tr key={r.id}>
                                  <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'center' }}>{i + 1}</td>
                                  <td style={{ border: '1px solid #000', padding: '4px 6px', textTransform: 'uppercase', verticalAlign: 'top' }}>
                                    <span style={{ fontWeight: 'bold' }}>{r.tipe}</span>
                                    <div style={{ marginTop: 2 }}>
                                      <span style={{ fontSize: '7.5pt', fontFamily: 'monospace', color: '#555' }}>{r.bukti || '-'}</span>
                                    </div>
                                    <div style={{ fontSize: '7pt', color: '#666', fontStyle: 'italic' }}>Tgl: {r.tanggal ? format(new Date(r.tanggal), 'dd/MM/yyyy') : '-'}</div>
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '4px 6px', verticalAlign: 'top' }}>
                                    {r.keterangan_rekon || r.uraian || 'Belum ada penjelasan'}
                                    {r.opd && <div style={{ fontSize: '7pt', color: '#888', fontStyle: 'italic' }}>{r.opd}</div>}
                                  </td>
                                  <td style={{ border: '1px solid #000', padding: '4px 6px', textAlign: 'right', fontFamily: 'monospace', verticalAlign: 'top' }}>{formatCurrency(toN(r.selisih || r.nilai))}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={4} style={{ border: '1px solid #000', padding: '8px 6px', textAlign: 'center', fontStyle: 'italic', color: '#64748b' }}>Kas Terverifikasi Sinkron. Tidak terdapat selisih pembukuan.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      {/* D. KESIMPULAN */}
                      <div className="mt-3 shrink-0">
                        <p className="font-bold uppercase text-[9.5pt] tracking-wide mb-1">D. KESIMPULAN</p>
                        {/* LOCKED: Redaksi kalimat kesimpulan sudah dikunci — jangan ubah frasa "Rekening Koran RKUD pada PT. Bank Maluku-Maluku Utara Cabang Dobo" */}
                        <p className="leading-snug">
                          Berdasarkan hasil rekonsiliasi tersebut di atas, saldo Kas Rekening Kas Umum Daerah (RKUD) Kabupaten Kepulauan Aru per tanggal {previewLastDay.getDate()} {selectedBlnName} {year} dinyatakan <span className="font-bold italic underline">{pIsSesuai ? 'SESUAI' : 'TERDAPAT SELISIH'}</span> antara Buku Kas Umum (BKU) dengan Rekening Koran RKUD pada PT. Bank Maluku-Maluku Utara Cabang Dobo.
                        </p>
                        <p className="leading-snug mt-1.5">
                          Demikian Berita Acara Rekonsiliasi Kas ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.
                        </p>
                      </div>

                      {/* Tanda Tangan */}
                      <div className="mt-5 shrink-0 font-sans text-[8.5pt]">
                        <p className="text-right font-bold mb-3">Dobo, {previewTgl} {previewBln} {previewThn}</p>
                        <div className="grid grid-cols-2 gap-8 text-center items-stretch">
                          <div className="flex flex-col">
                            <p className="font-bold uppercase mb-0 leading-tight">PIHAK KESATU,</p>
                            <p className="font-bold mt-0 leading-tight">{barConfig.jabatan1 || '—'}</p>
                            <div className="flex-1 min-h-[4rem]"></div>
                            <p className="font-bold underline leading-tight">{barConfig.pejabat1 || '—'}</p>
                            {barConfig.showPangkat && barConfig.pangkat1 && (
                              <p className="leading-tight">{barConfig.pangkat1}</p>
                            )}
                            <p className="leading-tight">NIP. {barConfig.nip1 || '—'}</p>
                          </div>
                          <div className="flex flex-col">
                            <p className="font-bold uppercase mb-0 leading-tight">PIHAK KEDUA,</p>
                            <p className="font-bold mt-0 leading-tight">{barConfig.jabatan2 || '—'}</p>
                            <div className="flex-1 min-h-[4rem]"></div>
                            <p className="font-bold underline leading-tight">{barConfig.pejabat2 || '—'}</p>
                            {barConfig.showPangkat && barConfig.pangkat1 && (
                              <p className="leading-tight invisible">_</p>
                            )}
                            <p className="leading-tight">NIP / ID. {barConfig.nip2 || '—'}</p>
                          </div>
                        </div>
                        <div className="text-center mt-3">
                          <p className="font-bold uppercase mb-0 leading-tight">MENGETAHUI,</p>
                          <p className="font-bold mt-0 leading-tight">{barConfig.jabatan3 || '—'}</p>
                          <div className="h-16"></div>
                          <p className="font-bold underline leading-tight mb-0">{barConfig.pejabat3 || '—'}</p>
                          {barConfig.showPangkat && barConfig.pangkat3 && (
                            <p className="leading-tight mb-0">{barConfig.pangkat3}</p>
                          )}
                          <p className="leading-tight mt-0">NIP. {barConfig.nip3 || '—'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 justify-end shrink-0">
            <Button variant="ghost" onClick={() => setShowBarModal(false)} className="h-11 px-8 rounded-xl font-black text-xs uppercase">Batal</Button>
            <Button onClick={() => {
              localStorage.setItem(getBarKey(year, barConfig.bulanRekon), JSON.stringify(barConfig));
              toast.success(`Konfigurasi BAR ${MONTHS[parseInt(barConfig.bulanRekon) - 1]} berhasil disimpan`);
            }} variant="outline" className="h-11 border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl font-black text-xs uppercase px-8 shadow-sm flex items-center gap-2">
              <Save size={16} /> Simpan
            </Button>
            <Button onClick={() => { handleGenerateBAR(); setShowBarModal(false); }} className="h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-xs uppercase px-8 shadow-lg shadow-indigo-200 flex items-center gap-2 transition-all">
              <Printer size={16} /> Cetak Berita Acara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}