'use client';

import { useState, useEffect } from 'react';
import { 
  FileText, 
  Banknote, 
  Calendar, 
  TrendingUp, 
  PieChart, 
  Activity, 
  Search, 
  Building2, 
  ChevronDown, 
  Loader2, 
  Download, 
  RefreshCw,
  LayoutDashboard,
  ArrowUpRight,
  TrendingDown,
  Layers,
  Sparkles
} from 'lucide-react';
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
import { Line, Doughnut } from 'react-chartjs-2';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from 'framer-motion';
import { PageHeader } from '@/components/patterns/page-header';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, 
  Title, ChartTooltip, Legend, Filler
);

export default function Sp2dAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tahun, setTahun] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, [tahun]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get('/reports/sp2d-analytics', { params: { tahun } });
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch analytics', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !data) return (
    <div className="flex flex-col items-center justify-center h-[80vh] text-fin-text-muted animate-in fade-in duration-500">
      <motion.div 
        animate={{ scale: [1, 1.1, 1], rotate: [0, 10, -10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        <Loader2 className="animate-spin mb-4 text-fin-info-text" size={48} />
      </motion.div>
      <p className="text-xs font-black uppercase tracking-[0.2em]">Menganalisis Realisasi Belanja...</p>
    </div>
  );

  const { summary = {}, trends = [], opdStats = [] } = data;

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];
  const types = data.masterJenis || [];
  const colors = [
    'hsl(243, 75%, 59%)', // Indigo
    'hsl(162, 72%, 48%)', // Emerald
    'hsl(35, 92%, 50%)',  // Amber
    'hsl(350, 89%, 60%)', // Rose
    'hsl(262, 70%, 50%)', // Purple
    'hsl(187, 85%, 45%)', // Cyan
    'hsl(330, 81%, 60%)', // Pink
    'hsl(24, 95%, 53%)',  // Orange
    'hsl(201, 96%, 40%)'  // Blue
  ];

  const lineData = {
    labels: months,
    datasets: types.map((type: string, idx: number) => ({
      label: type as string,
      data: months.map((_, mIdx) => {
        const matches = trends.filter((t: any) => 
          parseInt(t.bulan) === mIdx + 1 && 
          (t.jenis === type || (type === 'LS GAJI' && t.jenis === 'LS-GAJI'))
        );
        return matches.reduce((acc: number, m: any) => acc + parseFloat(m.total), 0);
      }),
      borderColor: colors[idx % colors.length],
      backgroundColor: colors[idx % colors.length] + '10',
      fill: true,
      tension: 0.45,
      pointRadius: 4,
      pointBackgroundColor: '#fff',
      pointBorderWidth: 2,
      pointHoverRadius: 6,
      borderWidth: 3
    }))
  };

  const doughnutData = {
    labels: types,
    datasets: [{
      data: types.map((type: string) => trends.filter((t: any) => 
        t.jenis === type || (type === 'LS GAJI' && t.jenis === 'LS-GAJI')
      ).reduce((acc: number, t: any) => acc + parseFloat(t.total), 0)),
      backgroundColor: colors,
      borderWidth: 0,
      hoverOffset: 15,
      cutout: '82%'
    }]
  };

  const filteredOpd = opdStats.filter((o: any) => o.opd.toLowerCase().includes(searchTerm.toLowerCase()));

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { y: 0, opacity: 1, transition: { duration: 0.6 } }
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-12 pb-24 bg-fin-page min-h-screen px-4 lg:px-10">
      
      <PageHeader
        title={<span className="font-black uppercase">Analisis <span className="text-fin-info-text">Realisasi</span> Belanja</span>}
        description="Monitoring Transparansi & Efisiensi Pengeluaran Daerah"
        icon={<Activity className="size-5" />}
        actions={
          <div className="flex items-center gap-3 bg-fin-surface/60 backdrop-blur-md p-1.5 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 rounded-xl border border-slate-100">
              <Calendar size={14} className="text-slate-400" />
              <select
                className="bg-transparent outline-none font-black text-slate-700 text-[11px] cursor-pointer uppercase tracking-wider"
                value={tahun}
                onChange={(e) => setTahun(Number(e.target.value))}
              >
                {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <Button size="icon" onClick={fetchData} className="h-10 w-10 bg-ds-primary text-white rounded-xl hover:bg-slate-800 transition-all shadow-lg shadow-slate-100">
              <RefreshCw size={18} className={cn(loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* SUMMARY CARDS */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        <StatCard title="Total Arsip SP2D" value={summary.total_dokumen} icon={<FileText size={20} />} label="Dokumen Terintegrasi" color="bg-indigo-50 text-fin-info-text" delay={0} />
        <StatCard title="Total Nilai Bruto" value={formatCurrency(summary.total_bruto)} icon={<Banknote size={20} />} label="Realisasi Kas Daerah" color="bg-emerald-50 text-emerald-600" delay={0.1} isCurrency />
        <StatCard title="Aktivitas Bulan Ini" value={summary.dokumen_bulan_ini} icon={<Sparkles size={20} />} label="Dokumen Berjalan" color="bg-amber-50 text-amber-600" delay={0.2} />
      </motion.div>

      {/* CHARTS SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <motion.div variants={itemVariants} initial="hidden" animate="visible" className="lg:col-span-8">
          <Card className="h-full rounded-xl border-fin-border shadow-sm shadow-slate-200 overflow-hidden bg-fin-surface">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-50 text-fin-info-text rounded-xl flex items-center justify-center">
                  <TrendingUp size={20} />
                </div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Tren Realisasi Bulanan</h3>
              </div>
              <Badge className="bg-indigo-50 text-fin-info-text border-none font-bold text-[10px]">TA {tahun}</Badge>
            </div>
            <div className="p-8">
              <div className="h-[400px]">
                <Line 
                  data={lineData} 
                  options={{ 
                    maintainAspectRatio: false, 
                    plugins: { 
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 12,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        cornerRadius: 8,
                        displayColors: true
                      }
                    },
                    scales: { 
                      y: { 
                        beginAtZero: true, 
                        grid: { color: '#f1f5f9' }, 
                        ticks: { font: { size: 10, weight: 'bold' }, color: '#94a3b8', callback: (value) => formatCurrency(value as number).slice(0, 10) + '...' } 
                      },
                      x: { grid: { display: false }, ticks: { font: { size: 10, weight: 'bold' }, color: '#94a3b8' } }
                    }
                  }} 
                />
              </div>
              <div className="mt-8 flex flex-wrap gap-6 justify-center">
                 {types.map((type: string, i: number) => (
                   <div key={type as string} className="flex items-center gap-3 group cursor-default">
                     <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: colors[i % colors.length] }}></div>
                     <span className="text-[11px] text-fin-text-muted font-black uppercase tracking-tight group-hover:text-fin-text-primary transition-colors">{type as string}</span>
                   </div>
                 ))}
              </div>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} initial="hidden" animate="visible" className="lg:col-span-4">
          <Card className="h-full rounded-xl border-fin-border shadow-sm shadow-slate-200 overflow-hidden bg-fin-surface">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                  <PieChart size={20} />
                </div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Komposisi Belanja</h3>
              </div>
            </div>
            <div className="p-8">
              <div className="relative flex items-center justify-center py-6">
                <div className="w-full aspect-square max-w-[220px]">
                   <Doughnut data={doughnutData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } } }} />
                </div>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Total Realisasi</p>
                   <h4 className="text-xl font-black text-fin-text-primary leading-none">{formatCurrency(summary.total_bruto).slice(0, 7)}...</h4>
                </div>
              </div>
              <div className="mt-10 space-y-4">
                {(() => {
                  const masterList = (data.masterJenis && data.masterJenis.length > 0)
                    ? data.masterJenis
                    : Array.from(new Set(trends.map((t: any) => t.jenis))).filter(Boolean);

                  return masterList.map((jenisName: string, i: number) => {
                    const val = trends.filter((t: any) => 
                      t.jenis === jenisName || (jenisName === 'LS GAJI' && t.jenis === 'LS-GAJI')
                    ).reduce((acc: number, t: any) => acc + parseFloat(t.total), 0);
                    
                    const percentage = (val / (summary.total_bruto || 1)) * 100;
                    return (
                      <div key={jenisName} className="group flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-all border border-transparent hover:border-slate-100">
                         <div className="flex items-center gap-3">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: colors[i % colors.length] }}></div>
                            <div className="flex flex-col">
                              <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{jenisName}</span>
                              <span className="text-[10px] font-bold text-slate-400 mt-0.5">{Math.round(percentage)}% dari total</span>
                            </div>
                         </div>
                         <span className="text-xs font-black text-fin-text-primary tabular-nums">
                           {formatCurrency(val)}
                         </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* OPD DETAILS TABLE */}
      <motion.div variants={itemVariants} initial="hidden" animate="visible">
        <Card className="rounded-xl border-fin-border shadow-sm shadow-slate-200 overflow-hidden bg-fin-surface">
          <div className="px-8 py-6 border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-ds-primary text-white rounded-xl flex items-center justify-center shadow-lg shadow-slate-200">
                <Building2 size={20} />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Peringkat Realisasi Per OPD</h3>
                <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase tracking-tighter">Detail Akumulasi Berdasarkan Unit Kerja</p>
              </div>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="CARI UNIT KERJA / OPD..." 
                className="w-full pl-12 pr-6 h-11 bg-slate-50 border border-slate-100 rounded-xl focus:bg-fin-surface focus:border-ds-focus-ring focus:ring-4 focus:ring-ds-focus-ring/5 outline-none text-xs font-black text-slate-700 tracking-wider transition-all" 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/80 text-fin-text-muted text-[10px] uppercase font-bold tracking-[0.2em] border-b border-slate-100">
                  <th className="px-8 py-4 font-black">Unit Kerja / OPD</th>
                  <th className="px-8 py-4 text-center font-black">Volume Arsip</th>
                  <th className="px-8 py-4 text-right font-black">Total Realisasi</th>
                  <th className="px-8 py-4 text-center font-black">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filteredOpd.length > 0 ? filteredOpd.map((opd: any, i: number) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-5">
                       <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 group-hover:bg-indigo-50 group-hover:text-fin-info-text transition-colors">
                             <Layers size={14} />
                          </div>
                          <p className="font-black text-slate-700 text-[11px] uppercase tracking-tight">{opd.opd}</p>
                       </div>
                    </td>
                    <td className="px-8 py-5 text-center">
                       <Badge className="bg-slate-100 text-slate-600 border-none font-black text-[10px] px-2.5 py-1 uppercase">{opd.jml_dokumen} Dokumen</Badge>
                    </td>
                    <td className="px-8 py-5 text-right font-black text-fin-text-primary text-sm tracking-tighter tabular-nums">
                       {formatCurrency(opd.total_nilai)}
                    </td>
                    <td className="px-8 py-5 text-center">
                       <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-slate-300 hover:text-fin-info-text hover:bg-indigo-50 transition-all">
                          <ArrowUpRight size={18} />
                       </Button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={4} className="px-8 py-20 text-center">
                       <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Data Tidak Ditemukan</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>
    </div>
  );
}

function StatCard({ title, value, icon, label, color, delay, isCurrency }: any) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay, duration: 0.6 }}
      className="h-full"
    >
      <Card className="h-full p-6 rounded-xl border-fin-border shadow-sm shadow-slate-200 bg-fin-surface group hover:border-ds-focus-ring transition-all cursor-default overflow-hidden">
        <div className="flex justify-between items-start mb-6">
          <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-transform group-hover:scale-110", color)}>
            {icon}
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{title}</p>
            <p className="text-[10px] font-bold text-fin-text-muted uppercase mt-1">{label}</p>
          </div>
        </div>
        <h4 className={cn(
          "text-2xl font-black text-fin-text-primary tracking-tighter truncate",
          isCurrency && "text-fin-info-text"
        )}>
          {typeof value === 'number' && !isCurrency ? value.toLocaleString() : value}
        </h4>
      </Card>
    </motion.div>
  );
}
