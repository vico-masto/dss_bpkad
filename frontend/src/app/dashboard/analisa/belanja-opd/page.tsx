'use client';

import { useState, useMemo, Fragment } from 'react';
import useSWR from 'swr';
import {
  Search, Building2, Wallet, Download, Printer,
  ChevronRight, CheckCircle2, TrendingDown, BarChart3
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/patterns/page-header';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement,
  Title, Tooltip, Legend, ArcElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const BULAN = [
  'Januari','Februari','Maret','April','Mei','Juni',
  'Juli','Agustus','September','Oktober','November','Desember'
];
const PALETTE = ['#3B82F6','#10B981','#F59E0B','#8B5CF6','#EF4444','#EC4899','#06B6D4','#84CC16'];

interface RawRow {
  opd: string;
  jenis_belanja: string;
  sumber_dana: string;
  total_bruto: number;
  total_potongan: number;
  total_neto: number;
  persentase: number;
}

interface JenisGroup {
  jenis: string;
  total_bruto: number;
  total_neto: number;
  total_potongan: number;
  items: RawRow[];
}

interface OpdGroup {
  opd: string;
  total_bruto: number;
  total_neto: number;
  total_potongan: number;
  jenisList: JenisGroup[];
}

export default function BelanjaOpdPage() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [month, setMonth] = useState('');
  const [searchOpd, setSearchOpd] = useState('');
  const [expandedOpds, setExpandedOpds] = useState<Set<string>>(new Set());
  const [expandedJenis, setExpandedJenis] = useState<Set<string>>(new Set());

  const { data, isLoading } = useSWR(
    ['/reports/belanja-opd-detail', year, month],
    ([url, y, m]: [string, string, string]) =>
      api.get(url, { params: { year: y, month: m || undefined } }).then(res => res.data)
  );

  const rawData = useMemo<RawRow[]>(() => data || [], [data]);

  const filteredData = useMemo(
    () => rawData.filter(r =>
      !searchOpd ||
      r.opd.toLowerCase().includes(searchOpd.toLowerCase()) ||
      r.sumber_dana.toLowerCase().includes(searchOpd.toLowerCase()) ||
      r.jenis_belanja.toLowerCase().includes(searchOpd.toLowerCase())
    ),
    [rawData, searchOpd]
  );

  const totalBruto = useMemo(() => filteredData.reduce((s, r) => s + r.total_bruto, 0), [filteredData]);
  const totalNeto = useMemo(() => filteredData.reduce((s, r) => s + r.total_neto, 0), [filteredData]);
  const totalPotongan = useMemo(() => filteredData.reduce((s, r) => s + r.total_potongan, 0), [filteredData]);

  const treeData = useMemo((): OpdGroup[] => {
    const map: Record<string, OpdGroup> = {};
    filteredData.forEach(row => {
      if (!map[row.opd]) {
        map[row.opd] = { opd: row.opd, total_bruto: 0, total_neto: 0, total_potongan: 0, jenisList: [] };
      }
      const opd = map[row.opd];
      opd.total_bruto += row.total_bruto;
      opd.total_neto += row.total_neto;
      opd.total_potongan += row.total_potongan;

      let jg = opd.jenisList.find(j => j.jenis === row.jenis_belanja);
      if (!jg) {
        jg = { jenis: row.jenis_belanja, total_bruto: 0, total_neto: 0, total_potongan: 0, items: [] };
        opd.jenisList.push(jg);
      }
      jg.total_bruto += row.total_bruto;
      jg.total_neto += row.total_neto;
      jg.total_potongan += row.total_potongan;
      jg.items.push(row);
    });
    return Object.values(map)
      .map(o => ({ ...o, jenisList: o.jenisList.sort((a, b) => b.total_bruto - a.total_bruto) }))
      .sort((a, b) => b.total_bruto - a.total_bruto);
  }, [filteredData]);

  const allJenis = useMemo(() => [...new Set(filteredData.map(r => r.jenis_belanja))], [filteredData]);

  const jenisColorMap = useMemo(() => {
    const m: Record<string, string> = {};
    allJenis.forEach((j, i) => { m[j] = PALETTE[i % PALETTE.length]; });
    return m;
  }, [allJenis]);

  const sumberDanaAgg = useMemo(() => {
    const m: Record<string, { bruto: number; neto: number; potongan: number }> = {};
    filteredData.forEach(r => {
      if (!m[r.sumber_dana]) m[r.sumber_dana] = { bruto: 0, neto: 0, potongan: 0 };
      m[r.sumber_dana].bruto += r.total_bruto;
      m[r.sumber_dana].neto += r.total_neto;
      m[r.sumber_dana].potongan += r.total_potongan;
    });
    return Object.entries(m)
      .map(([name, vals]) => ({ name, ...vals }))
      .sort((a, b) => b.bruto - a.bruto);
  }, [filteredData]);

  const top10 = useMemo(() => treeData.slice(0, 10), [treeData]);

  const stackedBarData = useMemo(() => ({
    labels: top10.map(d => d.opd.length > 28 ? d.opd.substring(0, 28) + '…' : d.opd),
    datasets: allJenis.map((jenis, i) => ({
      label: jenis,
      data: top10.map(opd => opd.jenisList.find(x => x.jenis === jenis)?.total_bruto || 0),
      backgroundColor: PALETTE[i % PALETTE.length],
      borderRadius: 2,
      stack: 'belanja',
    }))
  }), [top10, allJenis]);

  const donutData = useMemo(() => ({
    labels: sumberDanaAgg.map(d => d.name),
    datasets: [{
      data: sumberDanaAgg.map(d => d.bruto),
      backgroundColor: PALETTE,
      borderWidth: 2,
      borderColor: '#fff',
    }]
  }), [sumberDanaAgg]);

  const toggleOpd = (opd: string) => setExpandedOpds(prev => {
    const s = new Set(prev);
    if (s.has(opd)) { s.delete(opd); } else { s.add(opd); }
    return s;
  });

  const toggleJenis = (key: string) => setExpandedJenis(prev => {
    const s = new Set(prev);
    if (s.has(key)) { s.delete(key); } else { s.add(key); }
    return s;
  });

  const expandAll = () => {
    setExpandedOpds(new Set(treeData.map(d => d.opd)));
    setExpandedJenis(new Set(treeData.flatMap(o => o.jenisList.map(j => `${o.opd}||${j.jenis}`))));
  };

  const collapseAll = () => {
    setExpandedOpds(new Set());
    setExpandedJenis(new Set());
  };

  const handleExportExcel = () => {
    try {
      const ws = XLSX.utils.json_to_sheet(filteredData.map(d => ({
        'OPD': d.opd,
        'Jenis Belanja': d.jenis_belanja,
        'Sumber Dana': d.sumber_dana,
        'Total Bruto (Rp)': d.total_bruto,
        'Total Potongan (Rp)': d.total_potongan,
        'Total Neto (Rp)': d.total_neto,
        'Porsi OPD (%)': d.persentase + '%'
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Belanja_OPD');
      XLSX.writeFile(wb, `Analisis_Belanja_OPD_${year}.xlsx`);
      toast.success('Excel berhasil diunduh');
    } catch {
      toast.error('Gagal mengunduh Excel');
    }
  };

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF('landscape');
      doc.setFontSize(16);
      doc.text(`Analisis Belanja OPD — Tahun ${year}`, 14, 15);
      autoTable(doc, {
        startY: 25,
        head: [['OPD', 'Jenis Belanja', 'Sumber Dana', 'Bruto (Rp)', 'Potongan (Rp)', 'Neto (Rp)', '%']],
        body: filteredData.map(d => [
          d.opd, d.jenis_belanja, d.sumber_dana,
          formatCurrency(d.total_bruto), formatCurrency(d.total_potongan),
          formatCurrency(d.total_neto), d.persentase + '%'
        ]),
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [59, 130, 246] }
      });
      doc.save(`Analisis_Belanja_OPD_${year}.pdf`);
      toast.success('PDF berhasil diunduh');
    } catch {
      toast.error('Gagal mengunduh PDF');
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-500 pb-20">

      {/* ── Header ── */}
      <PageHeader
        title="Analisis Belanja OPD"
        description="Rincian penyerapan anggaran per OPD · Jenis Belanja · Sumber Dana"
        icon={<BarChart3 size={18} />}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={year}
              onChange={e => setYear(e.target.value)}
              className="h-10 px-3 rounded-lg border border-fin-border bg-fin-surface text-sm font-semibold text-fin-text-primary focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select
              value={month}
              onChange={e => setMonth(e.target.value)}
              className="h-10 px-3 rounded-lg border border-fin-border bg-fin-surface text-sm font-semibold text-fin-text-primary focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">Semua Bulan</option>
              {BULAN.map((b, i) => <option key={i + 1} value={i + 1}>{b}</option>)}
            </select>
            <Button variant="outline" className="h-10 gap-2 border-fin-border hover:bg-fin-page" onClick={handleExportExcel}>
              <Download size={16} className="text-emerald-600" />
              <span className="font-semibold text-fin-text-primary">Excel</span>
            </Button>
            <Button variant="accent" size="md" className="h-10 gap-2" onClick={handleExportPDF}>
              <Printer size={16} /> PDF
            </Button>
          </div>
        }
      />

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

        <div className="lux-stat lux-stat-navy p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-blue-200/70 uppercase tracking-widest">Total Bruto</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Wallet className="w-3.5 h-3.5 text-blue-200" />
            </div>
          </div>
          <p className="text-xl font-black text-white truncate tabular-nums">{formatCurrency(totalBruto)}</p>
          <span className="text-[9px] text-blue-200/50 mt-1">Nilai SP2D diterbitkan</span>
        </div>

        <div className="lux-stat lux-stat-emerald p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-emerald-200/70 uppercase tracking-widest">Total Neto</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
            </div>
          </div>
          <p className="text-xl font-black text-white truncate tabular-nums">{formatCurrency(totalNeto)}</p>
          <span className="text-[9px] text-emerald-200/50 mt-1">Setelah potongan pajak</span>
        </div>

        <div className="lux-stat lux-stat-rose p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-red-200/70 uppercase tracking-widest">Total Potongan</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <TrendingDown className="w-3.5 h-3.5 text-red-200" />
            </div>
          </div>
          <p className="text-xl font-black text-white truncate tabular-nums">{formatCurrency(totalPotongan)}</p>
          <span className="text-[9px] text-red-200/50 mt-1">
            {totalBruto > 0 ? ((totalPotongan / totalBruto) * 100).toFixed(1) : 0}% dari bruto
          </span>
        </div>

        <div className="lux-stat lux-stat-violet p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-violet-200/70 uppercase tracking-widest">OPD Aktif</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Building2 className="w-3.5 h-3.5 text-violet-200" />
            </div>
          </div>
          <p className="text-xl font-black text-white">{treeData.length} Instansi</p>
          <span className="text-[9px] text-violet-200/50 mt-1">
            {allJenis.length} jenis · {sumberDanaAgg.length} sumber
          </span>
        </div>
      </div>

      {/* ── Ringkasan Per Jenis Belanja ── */}
      {allJenis.length > 0 && (() => {
        const jenisAgg = allJenis.map((jenis, idx) => {
          const total_bruto = filteredData.filter(r => r.jenis_belanja === jenis).reduce((s, r) => s + r.total_bruto, 0);
          const total_neto  = filteredData.filter(r => r.jenis_belanja === jenis).reduce((s, r) => s + r.total_neto, 0);
          const pct = totalBruto > 0 ? (total_bruto / totalBruto) * 100 : 0;
          return { jenis, total_bruto, total_neto, pct, color: PALETTE[idx % PALETTE.length] };
        }).sort((a, b) => b.total_bruto - a.total_bruto);

        return (
          <Card className="p-5 border-none shadow-lg ring-1 ring-fin-border bg-fin-surface">
            <div className="flex items-center gap-2 mb-4">
              <div className="p-1.5 bg-fin-subtle rounded-md"><BarChart3 size={14} className="text-fin-text-secondary" /></div>
              <h3 className="text-xs font-black text-fin-text-primary uppercase tracking-widest">Realisasi per Jenis Belanja</h3>
              <span className="ml-auto text-[10px] font-semibold text-fin-text-muted">{allJenis.length} jenis · {treeData.length} OPD</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {jenisAgg.map(({ jenis, total_bruto, total_neto, pct, color }) => (
                <div key={jenis} className="flex flex-col gap-2 p-3.5 rounded-xl border overflow-hidden"
                  style={{ background: `linear-gradient(135deg, ${color}0d 0%, ${color}22 100%)`, borderColor: `${color}38` }}>
                  {/* Color dot + label */}
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-[11px] font-black text-fin-text-primary truncate" title={jenis}>{jenis}</span>
                    <span className="ml-auto text-[11px] font-black shrink-0" style={{ color }}>{pct.toFixed(1)}%</span>
                  </div>
                  {/* Amounts */}
                  <div>
                    <p className="text-sm font-black text-fin-text-primary tabular-nums">{formatCurrency(total_bruto)}</p>
                    <p className="text-[10px] font-semibold text-fin-text-muted">Neto {formatCurrency(total_neto)}</p>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${color}22` }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })()}

      {/* ── Realisasi per Sumber Dana ── */}

      {sumberDanaAgg.length > 0 && (
        <Card className="p-5 border-none shadow-lg ring-1 ring-fin-border bg-fin-surface">
          <div className="flex items-center gap-2 mb-5">
            <div className="p-1.5 bg-fin-subtle rounded-md"><BarChart3 size={14} className="text-fin-text-secondary" /></div>
            <h3 className="text-xs font-black text-fin-text-primary uppercase tracking-widest">Realisasi per Sumber Dana</h3>
          </div>
          <div className={cn(
            'grid gap-3',
            sumberDanaAgg.length === 1 ? 'grid-cols-1' :
            sumberDanaAgg.length === 2 ? 'grid-cols-2' :
            sumberDanaAgg.length <= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' :
            'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
          )}>
            {sumberDanaAgg.map((sd, i) => {
              const color = PALETTE[i % PALETTE.length];
              const pct = totalBruto > 0 ? (sd.bruto / totalBruto) * 100 : 0;
              return (
                <div
                  key={sd.name}
                  className="relative flex flex-col gap-2.5 p-4 rounded-xl border overflow-hidden hover:shadow-lg transition-all duration-300"
                  style={{
                    background: `linear-gradient(135deg, ${color}0d 0%, ${color}22 100%)`,
                    borderColor: `${color}38`
                  }}
                >
                  <div className="absolute -top-5 -right-5 w-20 h-20 rounded-full blur-2xl pointer-events-none opacity-25" style={{ backgroundColor: color }} />
                  <div className="relative flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ring-white/60 shadow-sm" style={{ backgroundColor: color }} />
                    <span className="text-xs font-black text-fin-text-primary truncate" title={sd.name}>{sd.name}</span>
                  </div>
                  <div className="relative space-y-0.5">
                    <p className="text-sm font-black text-fin-text-primary">{formatCurrency(sd.bruto)}</p>
                    <p className="text-[11px] font-bold" style={{ color }}>Neto {formatCurrency(sd.neto)}</p>
                    {sd.potongan > 0 && (
                      <p className="text-[10px] font-semibold text-rose-500">Potong {formatCurrency(sd.potongan)}</p>
                    )}
                  </div>
                  <div className="relative space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-fin-text-muted">
                      <span>Porsi bruto</span>
                      <span className="font-black" style={{ color }}>{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${color}22` }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: color }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stacked Bar */}
        <Card className="p-5 border-none shadow-lg ring-1 ring-fin-border bg-fin-surface lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-fin-text-primary tracking-tight">Top 10 OPD — Serapan per Jenis Belanja</h3>
              <p className="text-xs text-fin-text-muted font-medium mt-0.5">Nilai bruto kumulatif, dikelompokkan per jenis belanja</p>
            </div>
          </div>
          <div className="h-[300px]">
            {top10.length > 0 ? (
              <Bar
                data={stackedBarData}
                options={{
                  indexAxis: 'y' as const,
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: 'bottom' as const, labels: { font: { size: 10 }, boxWidth: 10, padding: 8 } },
                    tooltip: {
                      callbacks: {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        label: (ctx: any) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
                      }
                    }
                  },
                  scales: {
                    x: {
                      stacked: true,
                      grid: { color: '#f1f5f9' },
                      ticks: {
                        font: { size: 10 },
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        callback: (v: any) => {
                          const n = Number(v);
                          return n >= 1e9 ? `${(n / 1e9).toFixed(1)}M` : `${(n / 1e6).toFixed(0)}Jt`;
                        }
                      }
                    },
                    y: { stacked: true, ticks: { font: { size: 10 }, padding: 4 } }
                  }
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-fin-text-muted text-sm font-medium">
                Tidak ada data untuk ditampilkan
              </div>
            )}
          </div>
        </Card>

        {/* Donut + Legend */}
        <Card className="p-5 border-none shadow-lg ring-1 ring-fin-border bg-fin-surface">
          <h3 className="text-sm font-black text-fin-text-primary tracking-tight mb-0.5">Komposisi Sumber Dana</h3>
          <p className="text-xs text-fin-text-muted font-medium mb-4">Distribusi bruto per sumber dana</p>
          {sumberDanaAgg.length > 0 ? (
            <>
              <div className="h-[180px]">
                <Doughnut
                  data={donutData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '68%',
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        callbacks: {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          label: (ctx: any) => `${ctx.label}: ${formatCurrency(ctx.raw)}`
                        }
                      }
                    }
                  }}
                />
              </div>
              <div className="mt-5 space-y-2.5">
                {sumberDanaAgg.slice(0, 6).map((sd, i) => {
                  const pct = totalBruto > 0 ? (sd.bruto / totalBruto) * 100 : 0;
                  return (
                    <div key={sd.name} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                      <span className="text-xs font-semibold text-fin-text-secondary flex-1 truncate min-w-0" title={sd.name}>{sd.name}</span>
                      <span className="text-xs font-black text-fin-text-primary shrink-0">{pct.toFixed(1)}%</span>
                    </div>
                  );
                })}
                {sumberDanaAgg.length > 6 && (
                  <p className="text-[10px] text-fin-text-muted font-medium pl-4 pt-1">
                    +{sumberDanaAgg.length - 6} sumber dana lainnya
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="h-[260px] flex items-center justify-center text-fin-text-muted text-sm font-medium">
              Tidak ada data
            </div>
          )}
        </Card>
      </div>

      {/* ── Grouped Tree Table ── */}
      <Card className="border-none shadow-lg ring-1 ring-fin-border bg-fin-surface overflow-hidden">
        <div className="p-5 border-b border-fin-border bg-fin-page flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-fin-text-primary tracking-tight">
              Rincian OPD · Jenis Belanja · Sumber Dana
            </h3>
            <p className="text-xs text-fin-text-muted font-medium mt-0.5">
              Klik baris OPD atau Jenis Belanja untuk buka/tutup rincian
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fin-text-muted" />
              <Input
                placeholder="Cari OPD, Jenis, Sumber Dana..."
                className="pl-9 h-9 text-sm font-medium border-fin-border w-60 focus-visible:ring-blue-500"
                value={searchOpd}
                onChange={e => setSearchOpd(e.target.value)}
              />
            </div>
            <Button variant="outline" size="sm" className="h-9 px-3 text-xs font-bold border-fin-border text-fin-text-secondary" onClick={expandAll}>
              Buka Semua
            </Button>
            <Button variant="outline" size="sm" className="h-9 px-3 text-xs font-bold border-fin-border text-fin-text-secondary" onClick={collapseAll}>
              Tutup Semua
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-fin-border bg-fin-page">
                <TableHead className="font-black text-fin-text-muted uppercase text-[10px] tracking-wider py-3">
                  Instansi / Jenis Belanja / Sumber Dana
                </TableHead>
                <TableHead className="font-black text-fin-text-muted uppercase text-[10px] tracking-wider py-3 text-right">Bruto</TableHead>
                <TableHead className="font-black text-fin-text-muted uppercase text-[10px] tracking-wider py-3 text-right">Potongan</TableHead>
                <TableHead className="font-black text-fin-text-muted uppercase text-[10px] tracking-wider py-3 text-right">Neto</TableHead>
                <TableHead className="font-black text-fin-text-muted uppercase text-[10px] tracking-wider py-3 text-center w-24">% Porsi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-fin-text-muted">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      <p className="font-medium text-sm">Memuat data analisis...</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : treeData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-40 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-fin-text-muted">
                      <Search size={28} className="text-fin-text-muted" />
                      <p className="font-medium text-sm">Tidak ada data ditemukan</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                treeData.map(opdRow => {
                  const opdPct = totalBruto > 0 ? (opdRow.total_bruto / totalBruto) * 100 : 0;
                  const isOpdOpen = expandedOpds.has(opdRow.opd);
                  return (
                    <Fragment key={opdRow.opd}>

                      {/* ─ Level 1: OPD ─ */}
                      <TableRow
                        className="cursor-pointer bg-gradient-to-r from-blue-950 via-slate-900 to-slate-800 hover:from-blue-900 hover:via-slate-800 hover:to-slate-700 border-b border-white/10 transition-all select-none"
                        onClick={() => toggleOpd(opdRow.opd)}
                      >
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              size={15}
                              className={cn('text-blue-300/70 transition-transform duration-200 flex-shrink-0', isOpdOpen && 'rotate-90')}
                            />
                            <Building2 size={13} className="text-blue-300/50 flex-shrink-0" />
                            <span className="font-black text-white text-sm tracking-wide">{opdRow.opd}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-black text-blue-100 text-sm py-3">{formatCurrency(opdRow.total_bruto)}</TableCell>
                        <TableCell className="text-right font-semibold text-rose-300 text-sm py-3">{formatCurrency(opdRow.total_potongan)}</TableCell>
                        <TableCell className="text-right font-black text-emerald-300 text-sm py-3">{formatCurrency(opdRow.total_neto)}</TableCell>
                        <TableCell className="py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[11px] font-black text-blue-200">{opdPct.toFixed(1)}%</span>
                            <div className="w-14 h-1.5 bg-blue-900/60 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(opdPct, 100)}%` }} />
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>

                      {/* ─ Level 2: Jenis Belanja ─ */}
                      {isOpdOpen && opdRow.jenisList.map(jenisRow => {
                        const jenisPct = opdRow.total_bruto > 0 ? (jenisRow.total_bruto / opdRow.total_bruto) * 100 : 0;
                        const jenisKey = `${opdRow.opd}||${jenisRow.jenis}`;
                        const isJenisOpen = expandedJenis.has(jenisKey);
                        const color = jenisColorMap[jenisRow.jenis] || '#64748b';
                        return (
                          <Fragment key={jenisKey}>
                            <TableRow
                              className="cursor-pointer hover:bg-fin-page bg-fin-surface border-b border-fin-border transition-colors select-none"
                              style={{ borderLeft: `3px solid ${color}` }}
                              onClick={() => toggleJenis(jenisKey)}
                            >
                              <TableCell className="py-2.5">
                                <div className="flex items-center gap-2 pl-7">
                                  <ChevronRight
                                    size={13}
                                    className={cn('text-fin-text-muted transition-transform duration-200 flex-shrink-0', isJenisOpen && 'rotate-90')}
                                  />
                                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                                  <span className="font-bold text-fin-text-primary text-sm">{jenisRow.jenis}</span>
                                  <span
                                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md ml-1 shrink-0"
                                    style={{ backgroundColor: color + '22', color }}
                                  >
                                    {jenisRow.items.length} sumber
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-bold text-fin-text-primary text-sm py-2.5">{formatCurrency(jenisRow.total_bruto)}</TableCell>
                              <TableCell className="text-right font-semibold text-rose-500 text-sm py-2.5">{formatCurrency(jenisRow.total_potongan)}</TableCell>
                              <TableCell className="text-right font-bold text-emerald-600 text-sm py-2.5">{formatCurrency(jenisRow.total_neto)}</TableCell>
                              <TableCell className="py-2.5 text-center">
                                <div className="flex flex-col items-center gap-1">
                                  <span className="text-[11px] font-bold text-fin-text-secondary">{jenisPct.toFixed(1)}%</span>
                                  <div className="w-14 h-1.5 bg-fin-subtle rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${Math.min(jenisPct, 100)}%`, backgroundColor: color }} />
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>

                            {/* ─ Level 3: Sumber Dana ─ */}
                            {isJenisOpen && jenisRow.items.map((item, idx) => {
                              const sdPct = jenisRow.total_bruto > 0 ? (item.total_bruto / jenisRow.total_bruto) * 100 : 0;
                              return (
                                <TableRow
                                  key={`${jenisKey}-${idx}`}
                                  className="bg-fin-surface hover:bg-fin-page/70 border-b border-fin-subtle transition-colors"
                                style={{ borderLeft: `3px solid ${color}30` }}
                                >
                                  <TableCell className="py-2">
                                    <div className="flex items-center gap-2 pl-14">
                                      <div className="w-px h-4 bg-fin-border flex-shrink-0" />
                                      <span className="text-[11px] font-bold px-2 py-0.5 bg-fin-subtle text-fin-text-secondary rounded-md whitespace-nowrap">
                                        {item.sumber_dana}
                                      </span>
                                    </div>
                                  </TableCell>
                                  <TableCell className="text-right text-xs font-semibold text-fin-text-primary py-2">{formatCurrency(item.total_bruto)}</TableCell>
                                  <TableCell className="text-right text-xs font-medium text-rose-400 py-2">{formatCurrency(item.total_potongan)}</TableCell>
                                  <TableCell className="text-right text-xs font-semibold text-emerald-600 py-2">{formatCurrency(item.total_neto)}</TableCell>
                                  <TableCell className="py-2 text-center">
                                    <div className="flex items-center gap-1.5 justify-center">
                                      <span className="text-[10px] font-bold text-fin-text-muted">{sdPct.toFixed(1)}%</span>
                                      <div className="w-10 h-1.5 bg-fin-subtle rounded-full overflow-hidden">
                                        <div className="h-full rounded-full" style={{ width: `${Math.min(sdPct, 100)}%`, backgroundColor: color }} />
                                      </div>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
