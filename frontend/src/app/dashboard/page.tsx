'use client';
// DSS Dashboard Refresh

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  Banknote, 
  Activity,
  Loader2,
  ShieldAlert,
  Settings,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Building2,
  ArrowUpRight,
  PieChart,
  BarChart3,
  ListFilter,
  X,
  Save,
  CalendarDays,
  Calendar,
  Eye,
  EyeOff,
  LayoutGrid,
  Wallet,
  Search,
  FileText,
  Printer,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertCircle,
  Clock,
  TrendingDown,
  Scale,
  ArrowRightLeft,
  Sparkles,
  CheckCircle2,
  Info,
  LayoutTemplate,
  ShieldCheck
} from 'lucide-react';
import { toast } from 'sonner';

import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement, 
  BarElement,
  Title, 
  Tooltip as ChartTooltip, 
  Legend, 
  ArcElement,
  Filler
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { formatCurrency, formatCurrencyCompact, formatNumber, parseNumber, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { generateExecutiveReport } from '@/lib/exportUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { NumericInput } from '@/components/NumericInput';
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { PageHeader } from '@/components/patterns/page-header';


ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, 
  Title, ChartTooltip, Legend, Filler
);

export default function DashboardPage() {
  const [data, setData] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [intelligence, setIntelligence] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [showPaguModal, setShowPaguModal] = useState(false);
  const [expandedOpd, setExpandedOpd] = useState<string | null>(null);
  const [showExpenditureDetails, setShowExpenditureDetails] = useState(false);
  const [showSourceFundDetails, setShowSourceFundDetails] = useState(false);
  const [searchOpd, setSearchOpd] = useState('');
  const [showAnomalyModal, setShowAnomalyModal] = useState(false);
  const [selectedOpd, setSelectedOpd] = useState<string | null>(null);
  
  // Pagu Modal States
  const [formPagu, setFormPagu] = useState({ opd: '', nilai: 0, jenis: 'MURNI' });
  const [savingPagu, setSavingPagu] = useState(false);


  useEffect(() => {
    fetchAllData();
    
    // Auto-refresh data every 5 minutes to prevent stale display
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchAllData();
      }
    }, 300000); // 5 minutes

    return () => clearInterval(interval);
  }, [tahun]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [statsRes, analyticsRes, intelRes] = await Promise.all([
        api.get('/reports/dashboard-stats', { params: { tahun } }),
        api.get('/reports/sp2d-analytics', { params: { tahun } }),
        api.get('/dss/intelligence/report')
      ]);
      setData(statsRes.data);
      setAnalytics(analyticsRes.data);
      setIntelligence(intelRes.data);
    } catch (err: any) {
      console.error('Gagal mengambil data dashboard', err);
      toast.error('Gagal Memuat Data Dashboard', { 
        description: err.message === 'Network Error' 
          ? 'Tidak dapat terhubung ke server. Pastikan Backend sudah menyala di port 5000.' 
          : err.response?.data?.message || err.message 
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    if (!data || !analytics || !intelligence) return;
    const doc = generateExecutiveReport(data.summary, analytics, tahun, intelligence);
    doc.autoPrint();
    const blob = doc.output('blob');
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handlePaguSubmit = async (e: any) => {
    e.preventDefault();
    setSavingPagu(true);
    try {
      await api.post('/dss/pagu', { 
        tahun, 
        opd: (formPagu.opd || 'APBD KESELURUHAN').trim(), 
        nilai: formPagu.nilai,
        jenis: formPagu.jenis
      });
      toast.success('Pagu Diperbarui', { description: `${formPagu.jenis} anggaran tahunan telah berhasil disimpan.` });
      setShowPaguModal(false);
      fetchAllData();
    } catch (err) { 
      toast.error('Gagal memperbarui pagu anggaran'); 
    } finally { 
      setSavingPagu(false); 
    }
  };


  if (loading || !data || !analytics || !intelligence) return (
    <div className="max-w-[1440px] mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Skeleton className="h-10 w-40 rounded-lg" />
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
      </section>

      <section className="space-y-6">
        <div className="flex justify-between">
           <Skeleton className="h-6 w-48" />
           <Skeleton className="h-6 w-32" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
           {[1,2,3,4,5,6,7,8].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </section>
    </div>
  );

  const { summary, stats: rawStats = [] } = data;
  
  // PHASE 2: SMART SORTING (Tampilkan yang kritis/defisit di atas)
  const stats = [...rawStats].sort((a, b) => (a.kas_efektif || 0) - (b.kas_efektif || 0));

  const isDeficit = summary.kasEfektif < 0;
  const kasBebas = stats.filter((s: any) => s.kategori === 'BEBAS').reduce((acc: number, s: any) => acc + (s.kas_efektif || 0), 0);
  const kasEarmark = stats.filter((s: any) => s.kategori === 'EARMARK').reduce((acc: number, s: any) => acc + (s.kas_efektif || 0), 0);
  const totalTalangan = summary?.totalTalangan || 0;

  const categoryData = analytics.trends.reduce((acc: any, t: any) => {
    const idx = acc.findIndex((x: any) => x.jenis === t.jenis);
    if (idx > -1) acc[idx].total += parseFloat(t.total);
    else acc.push({ jenis: t.jenis, total: parseFloat(t.total) });
    return acc;
  }, []);

  const filteredOpd = analytics.opdStats.filter((o: any) => o.opd.toLowerCase().includes(searchOpd.toLowerCase()));

  // Intelligence Mapping
  const { score: healthScore, status, kas, paguSisa } = intelligence.health;
  const auditAnomalies = intelligence.audit;
  const trendData = [...intelligence.trends].reverse();


  return (
    <TooltipProvider>
      <AnimatePresence mode="wait">
        {!loading && (
          <motion.div 
            key={`${tahun}-${loading}`} // Trigger animation on year change or refresh
            initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="max-w-[1440px] mx-auto space-y-6 pb-20 animate-soft-entry"
          >
        
        {/* PAGE HEADER */}
        <PageHeader
          title={<span className="font-black uppercase">Control <span className="text-fin-info-text">Center</span></span>}
          description="Monitoring Executive Financial Intelligence"
          icon={<LayoutGrid className="size-5" />}
          actions={
            <div className="flex flex-wrap items-center gap-3 bg-fin-surface p-2 rounded-xl border border-fin-border shadow-sm">
              {/* SYNC STATUS BADGES */}
              <div className="flex flex-col items-start px-1 border-r border-fin-border pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-tighter w-28">TERAKHIR PENERIMAAN</span>
                  <div className="flex items-center gap-1.5 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    <div className={cn("w-1 h-1 rounded-full", data?.summary?.lastUpdatePendapatan ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                    <span className="text-[9px] font-bold text-emerald-700 tabular-nums">
                      {data?.summary?.lastUpdatePendapatan ? format(new Date(data.summary.lastUpdatePendapatan), 'dd MMM yyyy') : 'N/A'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[9px] font-black text-rose-600 uppercase tracking-tighter w-28">TERAKHIR PENGELUARAN</span>
                  <div className="flex items-center gap-1.5 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                    <div className={cn("w-1 h-1 rounded-full", data?.summary?.lastUpdateSp2d ? "bg-rose-500 animate-pulse" : "bg-slate-300")} />
                    <span className="text-[9px] font-bold text-rose-700 tabular-nums">
                      {data?.summary?.lastUpdateSp2d ? format(new Date(data.summary.lastUpdateSp2d), 'dd MMM yyyy') : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
              {/* YEAR DROPDOWN */}
              <div className="relative group w-32">
                <select
                  value={tahun.toString()}
                  onChange={(e) => setTahun(Number(e.target.value))}
                  className="h-9 w-32 px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                >
                  {[2024, 2025, 2026].map(y => (
                    <option key={y} value={y.toString()} className="bg-fin-surface text-fin-text-primary">
                      TA {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" onClick={fetchAllData} className="h-9 w-9 bg-fin-surface border-fin-border rounded-xl text-fin-text-muted hover:text-fin-info-text hover:border-indigo-100 transition-all shadow-sm">
                  <RefreshCw size={16} className={cn(loading && "animate-spin")} />
                </Button>
                <Button variant="primary" size="sm" onClick={handlePrint} leftIcon={<FileText size={14} />} className="h-9 px-5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg">
                  CETAK
                </Button>
              </div>
            </div>
          }
        />

      {/* PRIMARY KPI METRIC CARDS */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        {/* Pagu APBD & Ketersediaan */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div 
              whileHover={{ y: -2 }}
              onClick={() => setShowPaguModal(true)}
              className="bg-fin-surface rounded-xl border border-fin-border p-4 cursor-pointer hover:shadow-sm transition-all group flex flex-col justify-between min-h-[140px]"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-fin-text-muted uppercase tracking-widest">Pagu & Ketersediaan</span>
                  <div className="w-7 h-7 bg-fin-info-bg rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                    <Building2 className="w-3.5 h-3.5 text-fin-info-text" />
                  </div>
                </div>
                <p className="text-lg font-bold text-fin-text-primary truncate tabular-nums" title={formatCurrency(summary.totalPagu)}>
                   {formatCurrency(summary.totalPagu)}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between items-end gap-2">
                   <div className="flex flex-col min-w-0">
                      <span className="text-[8px] font-bold text-fin-text-muted uppercase tracking-wider">Tersedia</span>
                      <span className="text-xs font-black text-fin-text-primary truncate">{formatCurrency(summary.totalKetersediaan || 0)}</span>
                   </div>
                   <span className="text-[9px] font-black text-[#12B76A] bg-[#ECFDF3] px-1.5 py-0.5 rounded-lg shrink-0">
                     {(summary.ketersediaanPersen || 0).toFixed(1)}%
                   </span>
                </div>
                
                <div className="h-1.5 w-full bg-fin-page rounded-full overflow-hidden flex">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${Math.min(summary.silpaPersen || 0, 100)}%` }} 
                    className="h-full bg-indigo-500 border-r border-white/20" 
                  />
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${Math.min(summary.realisasiPersen || 0, 100)}%` }} 
                    className="h-full bg-[#12B76A]" 
                  />
                </div>

                {/* LEGEND BREAKDOWN (RESTORED FOR READABILITY) */}
                <div className="flex items-center justify-between gap-1 mt-1 text-[7.5px] font-black uppercase tracking-tighter">
                   <div className="flex items-center gap-1 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                      <span className="text-fin-text-muted truncate">SiLPA: {(summary.silpaPersen || 0).toFixed(1)}%</span>
                   </div>
                   <div className="flex items-center gap-1 min-w-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#12B76A] shrink-0" />
                      <span className="text-fin-text-muted truncate">Masuk: {(summary.realisasiPersen || 0).toFixed(1)}%</span>
                   </div>
                </div>
              </div>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-ds-primary text-white border-none text-[11px] p-3 max-w-[250px]">
            <p className="font-bold mb-1">Ketersediaan Anggaran</p>
            <p className="text-fin-text-muted">Proporsi dana tersedia (SiLPA + Pendapatan) terhadap total Pagu APBD.</p>
          </TooltipContent>
        </Tooltip>

        {/* Realisasi Belanja (Pengeluaran) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div 
              whileHover={{ y: -2 }}
              className="bg-fin-surface rounded-xl border border-fin-border p-4 hover:shadow-sm transition-all group flex flex-col justify-between min-h-[140px] cursor-help"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-fin-text-muted uppercase tracking-widest">Realisasi Belanja (Bruto)</span>
                  <div className="w-7 h-7 bg-[#FEF3F2] rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                    <ArrowDownCircle className="w-3.5 h-3.5 text-[#F04438]" />
                  </div>
                </div>
                <p className="text-lg font-bold text-[#F04438] truncate tabular-nums" title={formatCurrency(summary.totalPengeluaran || 0)}>
                   {formatCurrency(summary.totalPengeluaran || 0)}
                </p>
              </div>
              <div className="mt-3 space-y-2">
                <div className="flex justify-between items-center">
                   <span className="text-[8px] font-bold text-fin-text-muted uppercase tracking-wider">Penyerapan</span>
                   <span className="text-[9px] font-black text-[#F04438] bg-[#FEF3F2] px-1.5 py-0.5 rounded-lg">
                     {(summary.belanjaPersen || 0).toFixed(1)}%
                   </span>
                </div>
                <div className="h-1.5 w-full bg-fin-page rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }} 
                    animate={{ width: `${Math.min(summary.belanjaPersen || 0, 100)}%` }} 
                    className="h-full bg-[#F04438]" 
                  />
                </div>
              </div>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-ds-primary text-white border-none text-[11px] p-3 max-w-[250px]">
            <p className="font-bold mb-1">Realisasi Belanja</p>
            <p className="text-fin-text-muted">Total pengeluaran daerah (SP2D) dan persentase penyerapannya terhadap total Pagu.</p>
          </TooltipContent>
        </Tooltip>

        {/* Total Kas Efektif */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div 
              whileHover={{ y: -2 }}
              className="bg-fin-surface p-4 rounded-xl border border-fin-border flex flex-col justify-between group hover:border-fin-text-primary transition-all min-h-[140px] cursor-help"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-fin-text-muted uppercase tracking-widest">Total Kas Efektif</span>
                  <div className="w-7 h-7 bg-fin-page text-fin-text-primary rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 border border-fin-border">
                      <Wallet size={14} />
                  </div>
                </div>
                <p className={cn("text-lg font-bold tabular-nums truncate", summary.kasEfektif < 0 ? "text-[#F04438]" : "text-fin-text-primary")} title={formatCurrency(summary.kasEfektif)}>
                  {formatCurrency(summary.kasEfektif)}
                </p>
              </div>
              <div className="mt-3">
                <p className="text-[9px] text-fin-text-muted font-bold uppercase tracking-tight">Saldo Riil Netto</p>
                <div className="flex items-center gap-1.5 mt-1">
                   <div className="w-1.5 h-1.5 rounded-full bg-[#12B76A]" />
                   <span className="text-[8px] font-bold text-[#12B76A]">Dana Siap Digunakan</span>
                </div>
              </div>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-ds-primary text-white border-none text-[11px] p-3 max-w-[250px]">
            <p className="font-bold mb-1">Total Kas Efektif</p>
            <p className="text-fin-text-muted">Saldo kas yang benar-benar tersedia setelah dikurangi blokir atau kewajiban talangan.</p>
          </TooltipContent>
        </Tooltip>

        {/* Likuiditas Bank (Fisik) */}
        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div 
              whileHover={{ y: -2 }}
              className="bg-fin-surface rounded-xl border border-fin-border p-4 flex flex-col justify-between min-h-[140px] group cursor-help"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-black text-fin-text-muted uppercase tracking-widest">Likuiditas Bank</span>
                  <div className="w-7 h-7 bg-[#F5F8FF] rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0 border border-[#D1E9FF]">
                    <Building2 className="w-3.5 h-3.5 text-fin-info-text" />
                  </div>
                </div>
                <p className="text-lg font-bold text-fin-text-primary truncate tabular-nums" title={formatCurrency(summary.totalKasFisik)}>
                   {formatCurrency(summary.totalKasFisik)}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-[#12B76A] animate-pulse"></div>
                 <span className="text-[8px] font-black text-fin-text-muted uppercase tracking-widest">Sync Otomatis Aktif</span>
              </div>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="bg-ds-primary text-white border-none text-[11px] p-3 max-w-[250px]">
            <p className="font-bold mb-1">Likuiditas Bank (Fisik)</p>
            <p className="text-fin-text-muted">Total saldo fisik pada rekening koran Bank Persepsi.</p>
          </TooltipContent>
        </Tooltip>
      </section>

      {/* EXECUTIVE FINANCIAL INTELLIGENCE REPORT (HIDDEN PER USER REQUEST)
      <motion.section 
        initial={{ opacity: 0, y: 20 }}
...
        </Card>
      </motion.section>
      */}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 no-print">
         {/* LEFT COLUMN: TREND & IN/OUT METRICS */}
         <div className="lg:col-span-8 flex flex-col space-y-4">
            <div className="bg-fin-surface rounded-xl p-4 border border-fin-border shadow-sm relative overflow-hidden flex flex-col flex-1">
               <div className="flex justify-between items-center mb-3">
                  <Tooltip>
                     <TooltipTrigger asChild>
                        <div className="cursor-help">
                           <h3 className="text-sm font-bold text-fin-text-primary flex items-center gap-2">
                              <TrendingUp size={16} className="text-fin-info-text" /> 
                              Analisis Tren Arus Kas
                           </h3>
                           <p className="text-[10px] text-fin-text-muted mt-0.5">Membandingkan Inflow vs Outflow 6 bulan terakhir</p>
                        </div>
                     </TooltipTrigger>
                     <TooltipContent side="right" className="bg-ds-primary text-white border-none text-[11px] p-3 max-w-[250px]">
                        <p className="font-bold mb-1">Analisis Tren Arus Kas</p>
                        <p className="text-fin-text-muted">Melihat perbandingan dana masuk (Pendapatan) dan dana keluar (Belanja) secara historis untuk memantau stabilitas fiskal daerah.</p>
                     </TooltipContent>
                  </Tooltip>
                  <div className="flex gap-4">
                     <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-[#12B76A]" />
                        <span className="text-[10px] font-bold text-fin-text-muted uppercase">Pendapatan</span>
                     </div>
                     <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-[#F04438]" />
                        <span className="text-[10px] font-bold text-fin-text-muted uppercase">Belanja</span>
                     </div>
                  </div>
               </div>

               <div className="h-[250px] w-full">
                  <Bar 
                     data={{
                        labels: trendData.map(t => {
                           const names = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
                           return `${names[t.bulan - 1]} ${t.tahun}`;
                        }),
                        datasets: [
                           {
                              label: 'Pendapatan',
                              data: trendData.map(t => t.pendapatan),
                              backgroundColor: '#12B76A',
                              borderRadius: 4,
                              barThickness: 14,
                           },
                           {
                              label: 'Belanja',
                              data: trendData.map(t => t.pengeluaran),
                              backgroundColor: '#F04438',
                              borderRadius: 4,
                              barThickness: 14,
                           }
                        ]
                     }}
                     options={{
                        maintainAspectRatio: false,
                        plugins: { 
                           legend: { display: false }, 
                           tooltip: { 
                              backgroundColor: '#101828',
                              padding: 10, 
                              cornerRadius: 8, 
                              titleFont: { size: 10, weight: 'bold' }, 
                              bodyFont: { size: 11 },
                              callbacks: {
                                 label: (item: any) => ` ${item.dataset.label}: ${formatCurrency(item.raw)}`
                              }
                           } 
                        },
                        scales: { 
                           y: { 
                              grid: { color: '#F1F3F5', drawTicks: false }, 
                              border: { display: false }, 
                              ticks: { font: { size: 9 }, color: '#98A2B3', callback: (v: any) => formatNumber(v.toString()) } 
                           },
                           x: { grid: { display: false }, ticks: { font: { size: 9, weight: 'bold' }, color: '#475467' } }
                        }
                     }}
                  />
               </div>

               {/* SMART EXECUTIVE INTELLIGENCE FOOTER */}
               <div className="mt-4 pt-4 border-t border-fin-border grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                     <div className="flex items-center gap-1.5 text-fin-text-muted">
                        <Activity size={12} />
                        <span className="text-[10px] font-bold tracking-wider">Net Cash Flow</span>
                     </div>
                     <p className={cn(
                        "text-xs font-black tabular-nums",
                        (trendData[trendData.length-1]?.pendapatan - trendData[trendData.length-1]?.pengeluaran) >= 0 ? "text-[#12B76A]" : "text-[#F04438]"
                     )}>
                        {formatCurrency(trendData[trendData.length-1]?.pendapatan - trendData[trendData.length-1]?.pengeluaran)}
                     </p>
                  </div>
                  
                  <div className="space-y-1">
                     <div className="flex items-center gap-1.5 text-fin-text-muted">
                        <TrendingUp size={12} />
                        <span className="text-[10px] font-bold tracking-wider">Inflow Growth</span>
                     </div>
                     <div className="flex items-center gap-1">
                        <p className="text-xs font-black text-fin-text-primary">
                           {trendData.length > 1 
                              ? (((trendData[trendData.length-1]?.pendapatan - trendData[trendData.length-2]?.pendapatan) / (trendData[trendData.length-2]?.pendapatan || 1)) * 100).toFixed(1)
                              : '0.0'}%
                        </p>
                        {trendData.length > 1 && (trendData[trendData.length-1]?.pendapatan > trendData[trendData.length-2]?.pendapatan) 
                           ? <ChevronUp size={12} className="text-[#12B76A]" /> 
                           : <ChevronDown size={12} className="text-[#F04438]" />}
                     </div>
                  </div>

                  <div className="space-y-1">
                     <div className="flex items-center gap-1.5 text-fin-text-muted">
                        <ShieldAlert size={12} />
                        <span className="text-[10px] font-bold tracking-wider">Budget Efficiency</span>
                     </div>
                     <p className="text-xs font-black text-fin-text-primary">
                        {((trendData[trendData.length-1]?.pengeluaran / (trendData[trendData.length-1]?.pendapatan || 1)) * 100).toFixed(1)}%
                     </p>
                  </div>
               </div>
            </div>

            {/* NESTED INFLOW/OUTFLOW METRICS */}
            <div className="grid grid-cols-2 gap-4">
               <motion.div whileHover={{ y: -2 }} className="bg-fin-surface p-4 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group hover:border-[#12B76A] transition-all">
                  <div className="w-10 h-10 bg-[#ECFDF3] text-[#12B76A] rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                     <ArrowUpCircle size={20} />
                  </div>
                  <div className="min-w-0">
                     <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest truncate">Avg. Inflow</p>
                     <p className="text-base font-black text-fin-text-primary tabular-nums truncate">
                        {formatCurrency(trendData[trendData.length-1]?.pendapatan || 0)}
                     </p>
                  </div>
               </motion.div>
               <motion.div whileHover={{ y: -2 }} className="bg-fin-surface p-4 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group hover:border-[#F04438] transition-all">
                  <div className="w-10 h-10 bg-[#FEF3F2] text-[#F04438] rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                     <ArrowDownCircle size={20} />
                  </div>
                  <div className="min-w-0">
                     <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest truncate">Avg. Outflow</p>
                     <p className="text-base font-black text-fin-text-primary tabular-nums truncate">
                        {formatCurrency(trendData[trendData.length-1]?.pengeluaran || 0)}
                     </p>
                  </div>
               </motion.div>
            </div>
         </div>

         {/* RIGHT COLUMN: LIKUIDITAS & TALANGAN */}
         <div className="lg:col-span-4 flex flex-col space-y-4">
             <Card className="rounded-xl border border-fin-border p-4 shadow-sm bg-fin-surface flex flex-col flex-1">
                <div>
             <Tooltip>
                <TooltipTrigger asChild>
                  <div className="cursor-help">
                    <h3 className="text-sm font-bold text-fin-text-primary mb-3 flex items-center gap-2">
                       <PieChart size={16} className="text-fin-info-text" />
                       Komposisi Likuiditas
                    </h3>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="left" className="bg-ds-primary text-white border-none text-[11px] p-3 max-w-[250px]">
                  <p className="font-bold mb-1">Komposisi Likuiditas</p>
                  <p className="text-fin-text-muted">Menunjukkan porsi dana berdasarkan tingkat kebebasan penggunaannya, termasuk dana yang terikat (Earmark) dan dana talangan.</p>
                </TooltipContent>
             </Tooltip>
                  <div className="h-[250px] w-full flex items-center justify-center relative">
                     <Doughnut 
                        data={{
                           labels: ['Kas Bebas', 'Kas Earmark', 'Talangan'],
                           datasets: [{
                              data: [kasBebas, kasEarmark, totalTalangan],
                              backgroundColor: ['#12B76A', '#F79009', '#F04438'],
                              borderWidth: 0
                           }]
                        }}
                        options={{
                           maintainAspectRatio: false,
                           cutout: '85%',
                           plugins: { legend: { display: false } }
                        }}
                     />
                     <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
                        <div className="max-w-[85%] flex flex-col items-center justify-center">
                           <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-tighter mb-0.5">Kas Bersih</p>
                           <p className="text-[10px] font-black text-fin-text-primary tabular-nums leading-tight break-all">
                              {formatCurrency(kasBebas + kasEarmark)}
                           </p>
                        </div>
                     </div>
                  </div>
 
                  <div className="mt-4 space-y-2">
                     <AiSmallRow icon={<div className="w-2 h-2 rounded bg-[#12B76A]" />} label="Kas Bebas" value={formatCurrency(kasBebas)} color="text-[#12B76A]" />
                     <AiSmallRow icon={<div className="w-2 h-2 rounded bg-[#F79009]" />} label="Kas Earmark" value={formatCurrency(kasEarmark)} color="text-[#F79009]" />
                     <AiSmallRow icon={<div className="w-2 h-2 rounded bg-[#F04438]" />} label="Talangan" value={formatCurrency(totalTalangan)} color="text-[#F04438]" />
                  </div>
                </div>
             </Card>

             {/* INDEPENDENT TALANGAN CARD */}
             <motion.div 
               whileHover={{ y: -2 }}
               whileTap={{ scale: 0.98 }}
               className="bg-fin-surface p-4 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group hover:border-[#F04438] transition-all"
             >
               <div className="w-10 h-10 bg-[#FEF3F2] text-[#F04438] rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
                  <ArrowRightLeft size={20} />
               </div>
               <div className="min-w-0">
                  <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest truncate">Talangan Aktif</p>
                  <p className="text-base font-black text-fin-text-primary tabular-nums truncate">
                     {formatCurrency(totalTalangan)}
                  </p>
               </div>
             </motion.div>
         </div>
      </div>

      {/* FULL SOURCE FUND MONITOR (GROUPED) */}
      <section className="bg-fin-surface rounded-xl border border-fin-border overflow-hidden shadow-sm">
        <div 
          onClick={() => setShowSourceFundDetails(!showSourceFundDetails)}
          className="px-6 py-5 cursor-pointer flex items-center justify-between bg-fin-page hover:bg-fin-page transition-all"
        >
          <Tooltip>
             <TooltipTrigger asChild>
                <div className="flex items-center gap-3">
                   <Activity size={18} className="text-fin-text-primary" />
                   <div>
                     <h2 className="text-sm font-black text-fin-text-primary tracking-widest">Live Source Fund Monitor</h2>
                     <p className="text-[10px] text-fin-text-muted mt-1 font-medium">Pemantauan real-time ketersediaan dana per rekening kas daerah</p>
                   </div>
                </div>
             </TooltipTrigger>
             <TooltipContent side="top" className="bg-ds-primary text-white border-none text-[11px] p-3">
                <p>Klik untuk melihat rincian saldo real-time pada setiap rekening kas daerah.</p>
             </TooltipContent>
          </Tooltip>
          <div className="text-fin-text-muted">
             {showSourceFundDetails ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>

        <AnimatePresence>
           {showSourceFundDetails && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                 <div className="p-6 space-y-8">
                    {/* KELOMPOK AMAN / BEBAS */}
                    <div className="space-y-4">
                       <div className="flex items-center gap-2 px-2">
                          <div className="h-4 w-1 bg-ds-primary rounded-full"></div>
                          <h3 className="text-[11px] font-black text-fin-text-primary tracking-widest">Kelompok Kas Bebas (Aman)</h3>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {stats.filter((s: any) => s.kategori === 'BEBAS' && s.id !== 'SD-ALL').map((item: any) => (
                             <motion.div key={item.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                                <Card className="p-4 border-fin-border hover:border-ds-focus-ring/30 transition-all group relative overflow-hidden bg-fin-surface shadow-sm h-full flex flex-col">
                                   <div className="mb-2">
                                      <div className="min-w-0">
                                         
                                        <h4 className="text-[11px] font-bold text-fin-text-primary leading-tight line-clamp-2 pr-2 mb-2" title={item.nama}>{item.nama}</h4>
                                      </div>
                                      <div className="pt-3 border-t border-dashed border-fin-border">
                                         <p className="text-[9px] font-bold text-fin-text-muted tracking-wider mb-1">Kas Efektif</p>
                                         <p className={cn(
                                            "text-base font-black tabular-nums leading-none",
                                            item.kas_efektif > 0 ? "text-[#12B76A]" : "text-[#F04438]"
                                         )}>
                                            {formatCurrency(item.kas_efektif)}
                                         </p>
                                      </div>
                                   </div>

                                   <div className="grid grid-cols-2 gap-3 pt-3 border-t border-fin-border mt-auto">
                                      <div className="space-y-0.5">
                                         <p className="text-[8px] font-bold text-fin-text-muted tracking-widest">Total Inflow</p>
                                         <p className="text-[10px] font-bold text-fin-text-primary tabular-nums">{formatCurrency(item.total_masuk)}</p>
                                      </div>
                                      <div className="space-y-0.5">
                                         <p className="text-[8px] font-bold text-fin-text-muted tracking-widest">Total Outflow</p>
                                         <p className="text-[10px] font-bold text-[#D92D20] tabular-nums">{formatCurrency(item.total_keluar)}</p>
                                      </div>
                                   </div>
                                   
                                   {item.talangan_diberikan > 0 && (
                                      <div className="mt-3 flex items-center gap-1.5 text-[#B42318] bg-[#FEF3F2] px-2 py-1 rounded-lg">
                                         <AlertCircle size={10} />
                                         <span className="text-[9px] font-black">Terikat Talangan: {formatCurrency(item.talangan_diberikan)}</span>
                                      </div>
                                   )}
                                </Card>
                             </motion.div>
                          ))}
                       </div>
                    </div>

                    {/* KELOMPOK EARMARK */}
                    <div className="space-y-4">
                       <div className="flex items-center gap-2 px-2">
                          <div className="h-4 w-1 bg-amber-500 rounded-full"></div>
                          <h3 className="text-[11px] font-black text-fin-text-primary tracking-widest">Kelompok Kas Earmark (Restricted)</h3>
                       </div>
                       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {stats.filter((s: any) => s.kategori === 'EARMARK').map((item: any) => (
                             <motion.div key={item.id} whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
                                <Card className="p-4 border-fin-border hover:border-amber-500/30 transition-all group relative overflow-hidden bg-fin-surface shadow-sm h-full flex flex-col">
                                   <div className="mb-2">
                                      <div className="min-w-0">
                                         
                                        <h4 className="text-[11px] font-bold text-fin-text-primary leading-tight line-clamp-2 pr-2 mb-2" title={item.nama}>{item.nama}</h4>
                                      </div>
                                      <div className="pt-3 border-t border-dashed border-fin-border">
                                         <p className="text-[9px] font-bold text-fin-text-muted tracking-wider mb-1">Kas Efektif</p>
                                         <p className={cn(
                                            "text-base font-black tabular-nums leading-none",
                                            item.kas_efektif > 0 ? "text-[#12B76A]" : "text-[#F04438]"
                                         )}>
                                            {formatCurrency(item.kas_efektif)}
                                         </p>
                                      </div>
                                   </div>

                                   <div className="grid grid-cols-2 gap-3 pt-3 border-t border-fin-border mt-auto">
                                      <div className="space-y-0.5">
                                         <p className="text-[8px] font-bold text-fin-text-muted tracking-widest">Total Inflow</p>
                                         <p className="text-[10px] font-bold text-fin-text-primary tabular-nums">{formatCurrency(item.total_masuk)}</p>
                                      </div>
                                      <div className="space-y-0.5">
                                         <p className="text-[8px] font-bold text-fin-text-muted tracking-widest">Total Outflow</p>
                                         <p className="text-[10px] font-bold text-[#D92D20] tabular-nums">{formatCurrency(item.total_keluar)}</p>
                                      </div>
                                   </div>
                                </Card>
                             </motion.div>
                          ))}
                       </div>
                    </div>
                 </div>
              </motion.div>
           )}
        </AnimatePresence>
      </section>

      {/* EXPENDITURE ANALYSIS SECTION (MOVED DOWN) */}
      <section className="bg-fin-surface rounded-xl border border-fin-border overflow-hidden shadow-sm">
         <div 
            onClick={() => setShowExpenditureDetails(!showExpenditureDetails)}
            className="px-6 py-5 cursor-pointer flex flex-col md:flex-row justify-between items-center gap-4 bg-fin-page hover:bg-fin-page transition-all"
         >
            <div className="flex items-center gap-3">
               <Scale size={18} className="text-fin-text-primary" />
               <div>
                  <h3 className="text-sm font-bold text-fin-text-primary">Monitoring Pengeluaran Perangkat Daerah (OPD)</h3>
                  <p className="text-[10px] text-fin-text-muted">Kontrol realisasi belanja SP2D terhadap pagu anggaran</p>
               </div>
            </div>
            
            <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
               <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fin-text-muted" />
                  <input 
                     type="text" 
                     placeholder="Cari OPD..." 
                     className="pl-9 pr-4 py-2 bg-fin-surface border border-fin-border rounded-lg text-xs font-medium w-[240px] focus:outline-none focus:ring-2 focus:ring-ds-focus-ring transition-all"
                     value={searchOpd}
                     onChange={(e) => setSearchOpd(e.target.value)}
                  />
               </div>
               <div className="text-fin-text-muted">
                  {showExpenditureDetails ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
               </div>
            </div>
         </div>

          <AnimatePresence>
             {showExpenditureDetails && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                   <div className="p-6 bg-fin-surface min-h-[500px]">
                      {/* SECTION STATS HEADER */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                         <Card className="p-4 bg-fin-page border-none shadow-none flex flex-col justify-between">
                            <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Total Dokumen</p>
                            <div className="flex items-end justify-between mt-1">
                               <h4 className="text-xl font-black text-fin-text-primary">{analytics.summary.total_dokumen} <span className="text-[10px] text-fin-text-muted font-bold">SP2D</span></h4>
                               <div className="p-1.5 bg-indigo-50 text-fin-info-text rounded-lg"><FileText size={14} /></div>
                            </div>
                         </Card>
                         <Card className="p-4 bg-fin-page border-none shadow-none flex flex-col justify-between">
                            <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Realisasi Bruto</p>
                            <div className="flex items-end justify-between mt-1">
                               <h4 className="text-xl font-black text-rose-600 truncate">{formatCurrency(analytics.summary.total_bruto)}</h4>
                               <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg"><ArrowDownCircle size={14} /></div>
                            </div>
                         </Card>
                         <Card className="p-4 bg-fin-page border-none shadow-none flex flex-col justify-between">
                            <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Beban Bulan Ini</p>
                            <div className="flex items-end justify-between mt-1">
                               <h4 className="text-xl font-black text-fin-text-primary">{analytics.summary.dokumen_bulan_ini} <span className="text-[10px] text-fin-text-muted font-bold">DOK</span></h4>
                               <div className="p-1.5 bg-amber-50 text-amber-600 rounded-lg"><Activity size={14} /></div>
                            </div>
                         </Card>
                         <Card className="p-4 bg-ds-primary border-none shadow-lg flex flex-col justify-between text-white relative overflow-hidden group">
                            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform"><Scale size={80} /></div>
                            <p className="text-[10px] font-bold text-indigo-100 uppercase tracking-widest">OPD Terdaftar</p>
                            <div className="flex items-end justify-between mt-1 relative z-10">
                               <h4 className="text-xl font-black">{analytics.opdStats.length} <span className="text-[10px] text-indigo-200 font-bold">INSTANSI</span></h4>
                               <div className="p-1.5 bg-fin-surface/20 rounded-lg"><LayoutTemplate size={14} /></div>
                            </div>
                         </Card>
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                         {/* LEFT: OPD LIST (SCROLLABLE) */}
                         <div className="lg:col-span-5 border rounded-xl overflow-hidden bg-fin-page/50 flex flex-col h-[500px]">
                            <div className="px-4 py-3 bg-fin-surface border-b flex items-center justify-between">
                               <span className="text-[10px] font-black text-fin-text-muted uppercase tracking-[0.2em]">Daftar Peringkat Realisasi</span>
                               <Badge variant="outline" className="text-[9px] font-bold">{filteredOpd.length} OPD</Badge>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                               {filteredOpd.map((opd: any, idx: number) => (
                                  <div 
                                     key={opd.opd} 
                                     onClick={() => setSelectedOpd(opd.opd)}
                                     className={cn(
                                        "p-3 rounded-xl cursor-pointer transition-all border flex items-center gap-4 group",
                                        selectedOpd === opd.opd 
                                           ? "bg-fin-surface border-indigo-200 shadow-md ring-1 ring-indigo-500/10" 
                                           : "bg-transparent border-transparent hover:bg-fin-surface hover:border-fin-border"
                                     )}
                                  >
                                     <div className={cn(
                                        "w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-black transition-colors shrink-0",
                                        selectedOpd === opd.opd ? "bg-ds-primary text-white" : "bg-fin-surface text-fin-text-muted border border-fin-border"
                                     )}>
                                        {idx + 1}
                                     </div>
                                     <div className="flex-1 min-w-0">
                                        <p className={cn("text-xs font-bold truncate group-hover:text-fin-info-text transition-colors", selectedOpd === opd.opd ? "text-fin-info-text" : "text-fin-text-primary")}>{opd.opd}</p>
                                        <p className="text-[10px] font-medium text-fin-text-muted tabular-nums">{formatCurrency(opd.total_nilai)}</p>
                                     </div>
                                     <div className="text-right">
                                        <p className="text-[10px] font-black text-fin-text-primary">{((opd.total_nilai / (summary.totalPengeluaran || 1)) * 100).toFixed(1)}%</p>
                                        <div className="w-12 h-1 bg-fin-page rounded-full mt-1 overflow-hidden">
                                           <div className="h-full bg-indigo-500" style={{ width: `${(opd.total_nilai / (summary.totalPengeluaran || 1)) * 100}%` }} />
                                        </div>
                                     </div>
                                  </div>
                               ))}
                            </div>
                         </div>

                         {/* RIGHT: DEEP DIVE ANALYTICS */}
                         <div className="lg:col-span-7 flex flex-col h-[500px]">
                            {selectedOpd ? (
                               <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4 duration-500">
                                  <div className="mb-6 p-6 bg-ds-primary rounded-xl text-white relative overflow-hidden">
                                     <div className="absolute top-0 right-0 p-8 opacity-10 rotate-12"><Building2 size={120} /></div>
                                     <Badge className="bg-indigo-500 border-none mb-2 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5">Analisis Mendalam OPD</Badge>
                                     <h3 className="text-lg font-black leading-tight max-w-[80%] uppercase tracking-tight">{selectedOpd}</h3>
                                     
                                     <div className="grid grid-cols-2 gap-8 mt-6">
                                        <div className="space-y-1">
                                           <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-[0.2em]">Total Realisasi</p>
                                            <p className="text-2xl font-black tabular-nums">{formatCurrency(analytics.opdStats.find((o: any) => o.opd === selectedOpd)?.total_nilai || 0)}</p>
                                        </div>
                                        <div className="space-y-1">
                                           <p className="text-[9px] font-bold text-indigo-300 uppercase tracking-[0.2em]">Volume Transaksi</p>
                                            <p className="text-2xl font-black tabular-nums">{analytics.opdStats.find((o: any) => o.opd === selectedOpd)?.jml_dokumen || 0} <span className="text-xs text-indigo-400 font-bold">DOKUMEN</span></p>
                                        </div>
                                     </div>
                                  </div>

                                  <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6 overflow-y-auto custom-scrollbar pr-2 pb-2">
                                     {/* CHART JENIS BELANJA */}
                                     <Card className="p-5 border-none bg-fin-page/50 rounded-xl flex flex-col">
                                        <h4 className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                                           <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Komposisi Belanja
                                        </h4>
                                        <div className="space-y-4 flex-1 flex flex-col justify-center">
                                           {(() => {
                                              // Fallback: Jika masterJenis tidak ada, ambil unik dari data yang ada
                                              const masterList = (analytics.masterJenis && analytics.masterJenis.length > 0) 
                                                 ? analytics.masterJenis 
                                                 : Array.from(new Set(analytics.opdDetails.map((d: any) => d.jenis))).filter(Boolean);

                                              return masterList.map((jenisName: string) => {
                                                 const totalOpd = analytics.opdStats.find((o: any) => 
                                                    (o.opd || '').trim().toLowerCase() === (selectedOpd || '').trim().toLowerCase()
                                                 )?.total_nilai || 1;
                                                 
                                                 const detail = analytics.opdDetails.find((d: any) => 
                                                    (d.opd || '').trim().toLowerCase() === (selectedOpd || '').trim().toLowerCase() && 
                                                    (d.jenis === jenisName || (jenisName === 'LS GAJI' && d.jenis === 'LS-GAJI'))
                                                 ) || { total_nilai: 0 };

                                                 const percent = (detail.total_nilai / totalOpd) * 100;
                                                 
                                                 return (
                                                    <div key={jenisName} className="space-y-1.5">
                                                       <div className="flex justify-between items-center text-[10px] font-bold">
                                                          <span className="text-fin-text-muted uppercase tracking-tight">{jenisName}</span>
                                                          <span className="text-fin-text-primary">{formatCurrency(detail.total_nilai)}</span>
                                                       </div>
                                                       <div className="h-2 w-full bg-fin-page rounded-full overflow-hidden">
                                                          <motion.div 
                                                             initial={{ width: 0 }} 
                                                             animate={{ width: `${percent}%` }} 
                                                             className="h-full bg-ds-primary" 
                                                          />
                                                       </div>
                                                    </div>
                                                 );
                                              });
                                           })()}
                                        </div>
                                     </Card>

                                     {/* RECENT TRANSACTIONS FOR THIS OPD */}
                                     <Card className="p-5 border-none bg-fin-page/50 rounded-xl flex flex-col">
                                        <h4 className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-4 flex items-center gap-2">
                                           <div className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Transaksi Terakhir
                                        </h4>
                                        <div className="space-y-3">
                                           {analytics.recentTransactions.filter((t: any) => 
                                              (t.opd || '').trim().toLowerCase() === (selectedOpd || '').trim().toLowerCase()
                                           ).map((tx: any, i: number) => (
                                              <div key={i} className="bg-fin-surface p-3 rounded-xl border border-fin-border shadow-sm flex flex-col gap-1">
                                                 <div className="flex justify-between items-center">
                                                    <span className="text-[10px] font-black text-fin-info-text tracking-tighter">{tx.nomor}</span>
                                                    <span className="text-[9px] font-bold text-fin-text-muted">{format(new Date(tx.tanggal), 'dd/MM/yy')}</span>
                                                 </div>
                                                 <p className="text-[10px] font-medium text-fin-text-primary line-clamp-2 leading-relaxed italic">"{tx.uraian}"</p>
                                                 <p className="text-xs font-black text-fin-text-primary mt-1 text-right">{formatCurrency(tx.nilai_bruto)}</p>
                                              </div>
                                           ))}
                                           {analytics.recentTransactions.filter((t: any) => 
                                              (t.opd || '').trim().toLowerCase() === (selectedOpd || '').trim().toLowerCase()
                                           ).length === 0 && (
                                              <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40 py-8">
                                                 <Info size={24} className="mb-2" />
                                                 <p className="text-[10px] font-bold uppercase">Data transaksi rincian tidak tersedia</p>
                                              </div>
                                           )}
                                        </div>
                                     </Card>
                                  </div>
                               </div>
                            ) : (
                               <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-fin-page/50 rounded-xl border border-dashed border-fin-border">
                                  <div className="w-16 h-16 bg-fin-surface rounded-xl shadow-sm flex items-center justify-center text-fin-text-muted/40 mb-4 animate-bounce">
                                     <TrendingUp size={32} />
                                  </div>
                                  <h4 className="text-sm font-bold text-fin-text-primary uppercase tracking-widest">Pilih OPD untuk Analisis</h4>
                                  <p className="text-xs text-fin-text-muted mt-2 max-w-xs">Silakan pilih salah satu Organisasi Perangkat Daerah pada daftar di samping untuk melihat rincian belanja dan performa anggarannya.</p>
                               </div>
                            )}
                         </div>
                      </div>
                   </div>
                </motion.div>
             )}
          </AnimatePresence>
      </section>

      {/* PAGU MODAL */}
      {showPaguModal && (
        <Dialog open={showPaguModal} onOpenChange={setShowPaguModal}>
          <DialogContent className="max-w-md rounded-xl p-8 bg-fin-surface shadow-xl border-fin-border">
             <DialogHeader>
                <DialogTitle className="text-lg font-bold text-fin-text-primary">Manajemen Pagu Anggaran</DialogTitle>
                <DialogDescription className="text-sm text-fin-text-muted mt-1">Konfigurasi Target Pendapatan Tahun Anggaran {tahun}</DialogDescription>
             </DialogHeader>
             
              <div className="space-y-6 mt-6">

                <div className="space-y-4">
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-fin-text-primary uppercase tracking-wider">Jenis Pagu</label>
                      <Combobox
                        value={formPagu.jenis}
                        onValueChange={(v) => setFormPagu({...formPagu, jenis: v || ''})}
                        placeholder="Pilih Jenis"
                        className="h-11"
                        options={[
                          { value: 'MURNI', label: 'PAGU MURNI (AWAL)' },
                          { value: 'PERUBAHAN', label: 'PAGU PERUBAHAN (APBD-P)' },
                        ]}
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-fin-text-primary uppercase tracking-wider">Entitas / OPD</label>
                      <Input 
                        placeholder="APBD KESELURUHAN" 
                        className="h-11 bg-fin-page border-fin-border rounded-lg text-sm font-bold focus:ring-ds-focus-ring transition-all" 
                        value={formPagu.opd} 
                        onChange={(e) => setFormPagu({ ...formPagu, opd: e.target.value.toUpperCase() })} 
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-xs font-bold text-fin-text-primary uppercase tracking-wider">Nilai Pagu (IDR)</label>
                      <NumericInput 
                        className="h-14 bg-fin-page border-fin-border rounded-lg text-2xl font-bold text-fin-text-primary focus:ring-ds-focus-ring transition-all" 
                        value={formPagu.nilai} 
                        onValueChange={(val) => setFormPagu({ ...formPagu, nilai: val })} 
                      />
                   </div>
                </div>
                
                <DialogFooter>
                   <Button
                     variant="primary"
                     loading={savingPagu}
                     onClick={handlePaguSubmit}
                     leftIcon={<Save size={16} />}
                     className="w-full h-12 rounded-lg font-bold"
                   >
                     UPDATE KONFIGURASI ANGGARAN
                   </Button>
                </DialogFooter>
             </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ANOMALY MODAL */}
      {showAnomalyModal && (
        <Dialog open={showAnomalyModal} onOpenChange={setShowAnomalyModal}>
          <DialogContent className="max-w-2xl rounded-xl p-0 bg-fin-surface overflow-hidden border-none shadow-2xl">
             <div className="bg-ds-primary p-6 text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <ShieldAlert size={24} className="text-[#F04438]" />
                   <div>
                      <DialogTitle className="text-lg font-bold">Smart Audit Findings</DialogTitle>
                      <p className="text-xs text-fin-text-muted">Daftar anomali dan ketidaksesuaian data yang terdeteksi</p>
                   </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowAnomalyModal(false)} className="text-white/50 hover:text-white">
                   <X size={20} />
                </Button>
             </div>
             
             <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4 custom-scrollbar">
                {auditAnomalies.length === 0 ? (
                   <div className="py-12 text-center">
                      <ShieldCheck size={48} className="mx-auto text-[#12B76A] opacity-20 mb-4" />
                      <p className="text-sm font-bold text-fin-text-primary">Tidak Ada Anomali Terdeteksi</p>
                      <p className="text-xs text-fin-text-muted mt-1">Sistem Anda saat ini dalam kondisi patuh sepenuhnya.</p>
                   </div>
                ) : (
                   auditAnomalies.map((anomaly: any, i: number) => (
                      <div key={i} className="flex items-start gap-4 p-4 bg-fin-page rounded-xl border border-fin-border hover:border-[#F04438]/50 transition-all">
                         <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                            anomaly.level === 'CRITICAL' ? "bg-[#FEF3F2] text-[#F04438]" : "bg-[#FFFAEB] text-[#F79009]"
                         )}>
                            {anomaly.type === 'DATA_INTEGRITY' ? <FileText size={20} /> : <AlertCircle size={20} />}
                         </div>
                         <div>
                            <div className="flex items-center gap-2 mb-1">
                               <span className={cn(
                                  "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                                  anomaly.level === 'CRITICAL' ? "bg-[#F04438] text-white" : "bg-[#F79009] text-white"
                               )}>
                                  {anomaly.level}
                               </span>
                               <span className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">{anomaly.type}</span>
                            </div>
                            <p className="text-sm font-bold text-fin-text-primary">{anomaly.message}</p>
                            <p className="text-[11px] text-fin-text-muted mt-1">Audit AI menyarankan pengecekan manual pada modul terkait atau segera lakukan penyesuaian anggaran.</p>
                         </div>
                      </div>
                   ))
                )}
             </div>
             
             <div className="p-6 bg-fin-page border-t border-fin-border flex justify-end">
                <Button onClick={() => setShowAnomalyModal(false)} className="bg-ds-primary text-white font-bold h-10 px-8 rounded-lg">
                   MENGERTI
                </Button>
             </div>
          </DialogContent>
        </Dialog>
      )}
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
}

// --- HELPER COMPONENTS ---

function AiSmallRow({ icon, label, value, color }: any) {
   return (
      <div className="flex justify-between items-center py-1">
         <div className="flex items-center gap-2.5">
            {icon}
            <span className="text-xs font-medium text-fin-text-muted">{label}</span>
         </div>
         <span className={cn("text-xs font-bold", color)} style={{fontVariantNumeric:'tabular-nums'}}>{value}</span>
      </div>
   );
}

// --- PRINT STYLES (TATA NASKAH DINAS STANDARDS) ---
const printStyles = `
@media print {
  body { 
    background: white !important; 
    padding: 0 !important;
    margin: 0 !important;
    -webkit-print-color-adjust: exact;
  }
  .no-print, button, .lucide, header, .no-print-section { 
    display: none !important; 
  }
  .max-w-[1440px] { 
    max-width: 100% !important; 
    padding: 0 !important;
    margin: 0 !important;
  }
  .grid { 
    display: block !important; 
  }
  .card, .rounded-xl {
    border: none !important;
    box-shadow: none !important;
    margin-bottom: 2rem !important;
    page-break-inside: avoid;
  }
  h1 { 
    font-size: 18pt !important; 
    margin-bottom: 20pt !important;
    text-align: center !important;
    text-transform: uppercase !important;
  }
  h2, h3 { 
    font-size: 14pt !important; 
    margin-top: 20pt !important;
    border-bottom: 1pt solid #000 !important;
    padding-bottom: 5pt !important;
  }
  table { 
    width: 100% !important; 
    border-collapse: collapse !important;
  }
  th, td { 
    border: 0.5pt solid #ccc !important;
    padding: 8pt !important;
    font-size: 10pt !important;
  }
  .text-fin-info-text, .text-blue-600 { 
    color: black !important; 
  }
  @page {
    size: A4;
    margin: 2cm;
  }
}
`;

if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.innerHTML = printStyles;
  document.head.appendChild(style);
}







