'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, 
  SearchX, 
  HelpCircle, 
  ArrowLeft, 
  FileText, 
  TrendingUp, 
  TrendingDown, 
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronRight,
  ShieldAlert
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Combobox } from "@/components/ui/combobox";
import Link from 'next/link';
import { exportToExcelMultiSheet } from '@/lib/exportUtils';
import { FileDown } from 'lucide-react';
import { PageHeader } from '@/components/patterns/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";

export default function AnomalyPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState('sp2d');
  const [selectedMonth, setSelectedMonth] = useState<string>('0'); // 0 = Semua Bulan
  const [searchQuery, setSearchQuery] = useState('');

  const months = [
    { value: '0', label: 'SEMUA BULAN' },
    { value: '1', label: 'JANUARI' },
    { value: '2', label: 'FEBRUARI' },
    { value: '3', label: 'MARET' },
    { value: '4', label: 'APRIL' },
    { value: '5', label: 'MEI' },
    { value: '6', label: 'JUNI' },
    { value: '7', label: 'JULI' },
    { value: '8', label: 'AGUSTUS' },
    { value: '9', label: 'SEPTEMBER' },
    { value: '10', label: 'OKTOBER' },
    { value: '11', label: 'NOVEMBER' },
    { value: '12', label: 'DESEMBER' },
  ];

  const fetchAnomalies = async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (selectedMonth !== '0') params.bulan = selectedMonth;
      
      const res = await api.get('/reports/reconciliation/anomalies', { params });
      console.log(`[DEBUG FRONTEND] Anomalies API Response:`, res.data);
      setData(res.data);
    } catch (err: any) {
      console.error('FETCH ANOMALIES ERROR:', err);
      const errorMsg = err.response?.data?.message || 'Gagal memuat data anomali';
      const requestUrl = err.config?.url || '/reports/reconciliation/anomalies';
      const fullUrl = `${api.defaults.baseURL}${requestUrl}`;
      
      toast.error(errorMsg, { 
        description: `URL: ${fullUrl} (${err.response?.status || 'Network Error'})`
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params: any = { all: 'true' };
      if (selectedMonth !== '0') params.bulan = selectedMonth;
      
      const res = await api.get('/reports/reconciliation/anomalies', { params });
      const fullData = res.data;

      const sp2dData = (fullData.unmatchedSP2D || []).map((s: any) => ({
        'NOMOR SP2D': s.nomor,
        'TANGGAL': format(new Date(s.tanggal), 'dd/MM/yyyy'),
        'TGL CAIR': s.tanggal_pencairan ? format(new Date(s.tanggal_pencairan), 'dd/MM/yyyy') : '-',
        'OPD': s.opd,
        'URAIAN': s.uraian,
        'NILAI NETO': s.nilai_neto
      }));

      const pData = (fullData.unmatchedPendapatan || []).map((p: any) => ({
        'NO. BUKTI': p.nomor_bukti,
        'TANGGAL': format(new Date(p.tanggal), 'dd/MM/yyyy'),
        'SUMBER DANA': p.id_sumber_dana,
        'URAIAN': p.uraian,
        'NILAI': p.nilai
      }));

      const potonganData = (fullData.unmatchedPotongan || []).map((p: any) => ({
        'NO. SP2D / BUKTI': p.nomor_bukti,
        'TANGGAL': format(new Date(p.tanggal), 'dd/MM/yyyy'),
        'TIPE': p.tipe,
        'URAIAN': p.uraian,
        'NILAI': p.nilai
      }));

      const bankData = (fullData.unidentifiedBank || []).map((b: any) => ({
        'TANGGAL': format(new Date(b.tanggal), 'dd/MM/yyyy'),
        'DESKRIPSI': b.deskripsi,
        'MASUK (KREDIT)': b.kredit,
        'KELUAR (DEBET)': b.debet,
        'SALDO AKHIR': b.saldo_akhir
      }));

      exportToExcelMultiSheet([
        { data: sp2dData, sheetName: 'Anomali SP2D' },
        { data: pData, sheetName: 'Anomali Penerimaan' },
        { data: potonganData, sheetName: 'Selisih Potongan & Pajak' },
        { data: bankData, sheetName: 'Mutasi Bank Unidentified' }
      ], 'Laporan_Integritas_Data_BPKAD');

    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
  }, [selectedMonth]);

  if (loading && !data) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center space-y-4">
        <Loader2 className="animate-spin text-fin-info-text" size={48} />
        <p className="text-slate-500 font-medium animate-pulse">Menganalisis Integritas Data Keuangan...</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700">
      {/* PAGE HEADER */}
      <div className="flex items-start gap-3">
        <Link href="/dashboard/rekon">
          <Button variant="ghost" size="icon" className="mt-0.5 w-9 h-9 shrink-0 rounded-xl bg-fin-surface border border-fin-border shadow-sm hover:bg-fin-page transition-all">
            <ArrowLeft size={16} className="text-fin-text-secondary" />
          </Button>
        </Link>
        <PageHeader
          title="Integritas Data Keuangan"
          description="Daftar anomali transaksi — SP2D Belum Rekon & Mutasi Unidentified"
          icon={<ShieldAlert className="size-5" />}
          className="flex-1"
          actions={
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 bg-fin-surface px-3 h-10 rounded-xl border border-fin-border shadow-sm">
                <span className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Filter:</span>
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="h-8 w-32 px-2 border-none bg-transparent text-fin-text-primary text-xs font-semibold focus:outline-none cursor-pointer"
                >
                  {months.map((m) => (
                    <option key={m.value} value={m.value} className="bg-fin-surface text-fin-text-primary">
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={handleExport} disabled={exporting || loading} variant="outline" className="h-10 px-4 border-fin-border rounded-xl font-semibold text-xs flex items-center gap-2 hover:bg-fin-page transition-all">
                {exporting ? <Loader2 className="animate-spin" size={14} /> : <FileDown size={14} />}
                <span>Export</span>
              </Button>
              <Button onClick={fetchAnomalies} disabled={loading} className="h-10 px-4 bg-fin-text-primary text-white rounded-xl font-semibold text-xs flex items-center gap-2 hover:opacity-90 transition-all">
                {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                <span>Rescan</span>
              </Button>
              <Link href="/dashboard/rekon?tab=selisih">
                <Button variant="outline" className="h-10 px-4 border-fin-border text-fin-info-text bg-fin-surface rounded-xl font-semibold text-xs flex items-center gap-2 hover:bg-fin-info-bg transition-all shadow-sm">
                  <ChevronRight size={14} /><span>Analisa Selisih</span>
                </Button>
              </Link>
            </div>
          }
        />
      </div>

      {/* QUICK STATS SUMMARY */}
      <TooltipProvider>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { 
              label: 'Unmatched SP2D', 
              count: data?.summary?.totalUnmatchedSP2D || 0, 
              colorClass: 'text-fin-expense',
              bgClass: 'bg-fin-expense-bg',
              borderHoverClass: 'hover:border-fin-expense',
              icon: TrendingDown,
              tooltip: 'Daftar SP2D yang sudah terbit namun belum ditemukan kecocokannya pada mutasi debet di rekening koran bank.'
            },
            { 
              label: 'Unmatched Inflow', 
              count: data?.summary?.totalUnmatchedPendapatan || 0, 
              colorClass: 'text-fin-income',
              bgClass: 'bg-fin-income-bg',
              borderHoverClass: 'hover:border-fin-income',
              icon: TrendingUp,
              tooltip: 'Data pendapatan/STS yang sudah direkam namun belum ditemukan pada mutasi kredit di rekening koran bank.'
            },
            { 
              label: 'Selisih Potongan', 
              count: data?.summary?.totalUnmatchedPotongan || 0, 
              colorClass: 'text-fin-info',
              bgClass: 'bg-fin-info-bg',
              borderHoverClass: 'hover:border-fin-info',
              icon: ShieldAlert,
              tooltip: 'Daftar rincian potongan/pajak yang belum ditemukan pasangannya di mutasi bank (NTPN belum klop).'
            },
            { 
              label: 'Unidentified Bank', 
              count: data?.summary?.totalUnidentifiedBank || 0, 
              colorClass: 'text-fin-warning',
              bgClass: 'bg-fin-warning-bg',
              borderHoverClass: 'hover:border-fin-warning',
              icon: HelpCircle,
              tooltip: 'Transaksi pada rekening koran bank yang sama sekali belum terhubung dengan data SP2D maupun Pendapatan di aplikasi.'
            }
          ].map((stat, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <Card className={cn(
                  "bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group transition-all cursor-help",
                  stat.borderHoverClass
                )}>
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform", stat.bgClass, stat.colorClass)}>
                    <stat.icon size={24} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">{stat.label}</p>
                    <p className="text-xl font-bold text-fin-text-primary mt-0.5">{stat.count}</p>
                  </div>
                </Card>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-ds-primary text-white border-none rounded-lg p-3 text-xs max-w-[250px] font-medium leading-relaxed">
                {stat.tooltip}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* MAIN CONTENT AREA */}
      <Card className="bg-fin-surface rounded-xl border border-fin-border shadow-sm overflow-hidden">
        <Tabs defaultValue="sp2d" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="bg-fin-page px-6 pt-4 border-b border-fin-border flex flex-col md:flex-row justify-between md:items-center gap-4">
            <TabsList className="bg-transparent h-auto p-0 gap-2 flex-wrap">
              <TabsTrigger value="sp2d" className="px-4 py-2 rounded-t-lg rounded-b-none border-b-2 border-transparent text-xs font-semibold data-[state=active]:border-ds-focus-ring data-[state=active]:text-fin-info-text data-[state=active]:bg-fin-surface transition-all">
                Anomali Pengeluaran (SP2D)
              </TabsTrigger>
              <TabsTrigger value="penerimaan" className="px-4 py-2 rounded-t-lg rounded-b-none border-b-2 border-transparent text-xs font-semibold data-[state=active]:border-ds-focus-ring data-[state=active]:text-fin-info-text data-[state=active]:bg-fin-surface transition-all">
                Anomali Penerimaan
              </TabsTrigger>
              <TabsTrigger value="selisih" className="px-4 py-2 rounded-t-lg rounded-b-none border-b-2 border-transparent text-xs font-semibold data-[state=active]:border-ds-focus-ring data-[state=active]:text-fin-info-text data-[state=active]:bg-fin-surface transition-all">
                Selisih Potongan & Pajak
              </TabsTrigger>
              <TabsTrigger value="bank" className="px-4 py-2 rounded-t-lg rounded-b-none border-b-2 border-transparent text-xs font-semibold data-[state=active]:border-ds-focus-ring data-[state=active]:text-fin-info-text data-[state=active]:bg-fin-surface transition-all">
                Bank Unidentified
              </TabsTrigger>
            </TabsList>
            
            {/* Quick Search */}
            <div className="relative mb-2 md:mb-0 w-full md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <SearchX className="h-4 w-4 text-fin-text-muted" />
              </div>
              <input
                type="text"
                placeholder="Cari transaksi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-fin-border rounded-lg leading-5 bg-fin-surface text-fin-text-primary placeholder-fin-text-muted focus:outline-none focus:ring-1 focus:ring-ds-focus-ring focus:border-ds-focus-ring sm:text-xs transition-all"
              />
            </div>
          </div>

          <div className="p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {/* SP2D TABLE */}
                <TabsContent value="sp2d" className="m-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Daftar SP2D Belum Rekon / Selisih</h4>
                      <p className="text-[10px] font-bold text-slate-400">Menampilkan 100 data terbaru yang memerlukan verifikasi pencairan bank</p>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-fin-border">
                      <Table>
                        <TableHeader className="bg-fin-page">
                          <TableRow>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Nomor SP2D</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">OPD</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Uraian</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right">Nilai Neto</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tgl SP2D</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-fin-border">
                          {(data?.unmatchedSP2D ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="p-12 text-center">
                                <div className="flex flex-col items-center opacity-40">
                                  <CheckCircle2 size={40} className="text-[#12B76A] mb-2" />
                                  <p className="text-xs font-semibold text-fin-text-secondary">Semua SP2D telah sesuai dengan bank!</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (data?.unmatchedSP2D ?? []).filter((item: any) =>
                              item.nomor.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.uraian.toLowerCase().includes(searchQuery.toLowerCase())
                            ).map((item: any) => (
                              <TableRow key={item.id} className="hover:bg-fin-page transition-colors group">
                                <TableCell className="p-4">
                                  <div className="font-black text-xs text-fin-text-primary truncate max-w-[200px]">{item.nomor}</div>
                                  <div className="text-[9px] font-bold text-fin-text-muted uppercase mt-0.5">{format(new Date(item.tanggal), 'dd MMM yyyy')}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-secondary truncate max-w-[200px]">{item.opd}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-muted truncate max-w-[200px] italic">{item.uraian}</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-expense tabular-nums">{formatCurrency(item.nilai_neto)}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-black text-fin-text-muted">
                                    {format(new Date(item.tanggal), 'dd/MM/yy')}
                                  </div>
                                </TableCell>
                                <TableCell className="p-4 text-center">
                                  <Link href={`/dashboard/rekon?search=${item.nomor}`}>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg text-fin-text-muted hover:text-fin-info-text p-0">
                                      <ExternalLink size={14} />
                                    </Button>
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                {/* PENERIMAAN TABLE */}
                <TabsContent value="penerimaan" className="m-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Pendapatan Buku Belum Masuk Rekening</h4>
                      <p className="text-[10px] font-bold text-slate-400">Mencari potensi kesalahan input No. Bukti atau tanggal penerimaan</p>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-fin-border">
                      <Table>
                        <TableHeader className="bg-fin-page">
                          <TableRow>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">No. Bukti / STS</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Uraian</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right">Nilai</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tgl Buku</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-center">Aksi</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-fin-border">
                          {(data?.unmatchedPendapatan ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="p-12 text-center">
                                <div className="flex flex-col items-center opacity-40">
                                  <CheckCircle2 size={40} className="text-[#12B76A] mb-2" />
                                  <p className="text-xs font-semibold text-fin-text-secondary">Seluruh pendapatan telah klop!</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (data?.unmatchedPendapatan ?? []).filter((item: any) =>
                              item.nomor_bukti.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.uraian.toLowerCase().includes(searchQuery.toLowerCase())
                            ).map((item: any) => (
                              <TableRow key={item.id} className="hover:bg-fin-page transition-colors group">
                                <TableCell className="p-4">
                                  <div className="font-black text-xs text-fin-text-primary">{item.nomor_bukti}</div>
                                  <div className="text-[9px] font-bold text-fin-info mt-0.5">{item.id_sumber_dana}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-muted line-clamp-1 max-w-[300px]">{item.uraian}</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-income tabular-nums">{formatCurrency(item.nilai)}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-black text-fin-text-muted">{format(new Date(item.tanggal), 'dd/MM/yy')}</div>
                                </TableCell>
                                <TableCell className="p-4 text-center">
                                  <Link href={`/pendapatan?search=${item.nomor_bukti}`}>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 rounded-lg text-fin-text-muted hover:text-fin-info-text p-0">
                                      <SearchX size={14} />
                                    </Button>
                                  </Link>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                {/* SELISIH POTONGAN TABLE */}
                <TabsContent value="selisih" className="m-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Selisih Potongan & Pajak (Belum Setor)</h4>
                      <p className="text-[10px] font-bold text-slate-400">Rincian potongan yang sudah diinput namun belum ditemukan di mutasi bank</p>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-fin-border">
                      <Table>
                        <TableHeader className="bg-fin-page">
                          <TableRow>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">No. SP2D</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Uraian</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right">Nilai</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tgl Cair</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-center">Tipe</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-fin-border">
                          {(data?.unmatchedPotongan ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="p-12 text-center">
                                <div className="flex flex-col items-center opacity-40">
                                  <CheckCircle2 size={40} className="text-[#12B76A] mb-2" />
                                  <p className="text-xs font-semibold text-fin-text-secondary">Seluruh potongan telah disetorkan!</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (data?.unmatchedPotongan ?? []).filter((item: any) =>
                              item.nomor_bukti.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.uraian.toLowerCase().includes(searchQuery.toLowerCase())
                            ).map((item: any) => (
                              <TableRow key={item.id} className="hover:bg-fin-page transition-colors group">
                                <TableCell className="p-4">
                                  <div className="font-black text-xs text-fin-text-primary">{item.nomor_bukti}</div>
                                  <div className="text-[9px] font-bold text-fin-info mt-0.5">{item.id_sumber_dana}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-muted line-clamp-1 max-w-[300px]">{item.uraian}</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-info tabular-nums">{formatCurrency(item.nilai)}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-black text-fin-text-muted">{format(new Date(item.tanggal), 'dd/MM/yy')}</div>
                                </TableCell>
                                <TableCell className="p-4 text-center">
                                   <span className={cn(
                                     "px-2 py-0.5 rounded-lg text-[8px] font-black uppercase",
                                     item.tipe === 'SELISIH_POTONGAN' ? "bg-fin-warning-bg text-fin-warning-text" : "bg-fin-surplus-bg text-fin-surplus-text"
                                   )}>
                                     {item.tipe.replace('SELISIH_', '')}
                                   </span>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>

                {/* BANK UNIDENTIFIED TABLE */}
                <TabsContent value="bank" className="m-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Mutasi Bank Tanpa Pasangan Buku</h4>
                      <p className="text-[10px] font-bold text-slate-400">Mutasi yang sudah ada di rekening koran tapi belum Anda input di aplikasi</p>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-fin-border">
                      <Table>
                        <TableHeader className="bg-fin-page">
                          <TableRow>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tgl Bank</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Deskripsi Rekening Koran</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right">Penerimaan</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right">Pengeluaran</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-center">Tipe</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-fin-border">
                          {(data?.unidentifiedBank ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={5} className="p-12 text-center">
                                <div className="flex flex-col items-center opacity-40">
                                  <CheckCircle2 size={40} className="text-[#12B76A] mb-2" />
                                  <p className="text-xs font-semibold text-fin-text-secondary">Mutasi bank telah terpetakan sempurna!</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (data?.unidentifiedBank ?? []).filter((item: any) =>
                              item.deskripsi.toLowerCase().includes(searchQuery.toLowerCase())
                            ).map((item: any) => (
                              <TableRow key={item.id} className="hover:bg-fin-page transition-colors">
                                <TableCell className="p-4">
                                  <div className="text-xs font-black text-fin-text-primary">{format(new Date(item.tanggal), 'dd/MM/yy')}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-muted line-clamp-1 max-w-[400px] uppercase">{item.deskripsi}</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-income tabular-nums">{Number(item.kredit) > 0 ? formatCurrency(item.kredit) : '-'}</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-expense tabular-nums">{Number(item.debet) > 0 ? formatCurrency(item.debet) : '-'}</div>
                                </TableCell>
                                <TableCell className="p-4 text-center">
                                  <span className={cn(
                                    "px-2 py-0.5 rounded-full text-[8px] font-black uppercase",
                                    Number(item.kredit) > 0 ? "bg-fin-income-bg text-fin-income-text" : "bg-fin-expense-bg text-fin-expense-text"
                                  )}>
                                    {Number(item.kredit) > 0 ? 'Inflow' : 'Outflow'}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </div>
        </Tabs>
      </Card>
    </div>
  );
}
