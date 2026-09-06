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
  ShieldAlert,
  Banknote,
  Ghost,
  Trash2,
  Eye
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
  const [selectedMonth, setSelectedMonth] = useState<string>('0');
  const [searchQuery, setSearchQuery] = useState('');

  // SP2D Bruto state
  const [brutoData, setBrutoData] = useState<any>(null);
  const [brutoLoading, setBrutoLoading] = useState(false);
  const [brutoPagination, setBrutoPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  // Ghost AUTO_HEADER state
  const [ghostData, setGhostData] = useState<any>(null);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [ghostFixing, setGhostFixing] = useState(false);

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
        'NAMA OPD': p.opd || '-',
        'URAIAN PEMBAYARAN': p.uraian_sp2d || '-',
        'URAIAN POTONGAN': p.uraian,
        'NILAI': p.nilai
      }));

      const bankData = (fullData.unidentifiedBank || []).map((b: any) => ({
        'TANGGAL': format(new Date(b.tanggal), 'dd/MM/yyyy'),
        'DESKRIPSI': b.deskripsi,
        'MASUK (KREDIT)': b.kredit,
        'KELUAR (DEBET)': b.debet,
        'SALDO AKHIR': b.saldo_akhir
      }));

      const brutoRes = await api.get('/reports/sp2d-bruto', {
        params: { limit: 9999, ...(selectedMonth !== '0' ? { bulan: selectedMonth } : {}) }
      });
      const brutoExportData = (brutoRes.data?.data || []).map((b: any) => ({
        'NOMOR SP2D': b.nomor,
        'TANGGAL': format(new Date(b.tanggal), 'dd/MM/yyyy'),
        'TGL CAIR': b.tanggal_pencairan ? format(new Date(b.tanggal_pencairan), 'dd/MM/yyyy') : '-',
        'OPD': b.opd,
        'URAIAN': b.uraian || '-',
        'JENIS': b.jenis,
        'NILAI BRUTO': b.nilai_bruto,
        'POTONGAN PIHAK KETIGA': b.nilai_potongan,
        'NILAI NETO': b.nilai_neto
      }));

      exportToExcelMultiSheet([
        { data: sp2dData, sheetName: 'Anomali SP2D' },
        { data: pData, sheetName: 'Anomali Penerimaan' },
        { data: potonganData, sheetName: 'Selisih Potongan & Pajak' },
        { data: bankData, sheetName: 'Mutasi Bank Unidentified' },
        { data: brutoExportData, sheetName: 'SP2D Pencairan Bruto' }
      ], 'Laporan_Integritas_Data_BPKAD');

    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const fetchBruto = async (page = 1) => {
    setBrutoLoading(true);
    try {
      const params: any = { page, limit: 50 };
      if (selectedMonth !== '0') params.bulan = selectedMonth;
      if (searchQuery) params.search = searchQuery;
      const res = await api.get('/reports/sp2d-bruto', { params });
      setBrutoData(res.data);
      setBrutoPagination({
        page: res.data.pagination?.page || 1,
        totalPages: res.data.pagination?.totalPages || 1,
        total: res.data.pagination?.total || 0
      });
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal memuat data SP2D Bruto');
    } finally {
      setBrutoLoading(false);
    }
  };

  const fetchGhost = async () => {
    setGhostLoading(true);
    try {
      const res = await api.post('/sp2d/fix-autoheader-potongan', { dry_run: true });
      setGhostData(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal memuat data ghost AUTO_HEADER');
    } finally {
      setGhostLoading(false);
    }
  };

  const handleFixGhost = async () => {
    if (!confirm(`Hapus ${ghostData?.deleted ?? 0} record ghost AUTO_HEADER? Tindakan ini tidak dapat dibatalkan.`)) return;
    setGhostFixing(true);
    try {
      const res = await api.post('/sp2d/fix-autoheader-potongan', { dry_run: false });
      toast.success(res.data.message);
      await fetchGhost();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menghapus ghost records');
    } finally {
      setGhostFixing(false);
    }
  };

  useEffect(() => {
    fetchAnomalies();
  }, [selectedMonth]);

  useEffect(() => {
    if (activeTab === 'bruto') fetchBruto(1);
    if (activeTab === 'ghost') fetchGhost();
  }, [activeTab, selectedMonth]);

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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          {[
            {
              label: 'Unmatched SP2D',
              count: data?.summary?.totalUnmatchedSP2D || 0,
              luxClass: 'lux-stat-rose',
              textColor: 'text-red-200/70',
              iconColor: 'text-red-200',
              icon: TrendingDown,
              tooltip: 'Daftar SP2D yang sudah terbit namun belum ditemukan kecocokannya pada mutasi debet di rekening koran bank.'
            },
            {
              label: 'Unmatched Inflow',
              count: data?.summary?.totalUnmatchedPendapatan || 0,
              luxClass: 'lux-stat-emerald',
              textColor: 'text-emerald-200/70',
              iconColor: 'text-emerald-200',
              icon: TrendingUp,
              tooltip: 'Data pendapatan/STS yang sudah direkam namun belum ditemukan pada mutasi kredit di rekening koran bank.'
            },
            {
              label: 'Selisih Potongan',
              count: data?.summary?.totalUnmatchedPotongan || 0,
              luxClass: 'lux-stat-cyan',
              textColor: 'text-cyan-200/70',
              iconColor: 'text-cyan-200',
              icon: ShieldAlert,
              tooltip: 'Daftar rincian potongan/pajak yang belum ditemukan pasangannya di mutasi bank (NTPN belum klop).'
            },
            {
              label: 'Unidentified Bank',
              count: data?.summary?.totalUnidentifiedBank || 0,
              luxClass: 'lux-stat-amber',
              textColor: 'text-amber-200/70',
              iconColor: 'text-amber-200',
              icon: HelpCircle,
              tooltip: 'Transaksi pada rekening koran bank yang sama sekali belum terhubung dengan data SP2D maupun Pendapatan di aplikasi.'
            },
            {
              label: 'SP2D Bruto',
              count: brutoData?.summary?.count || 0,
              luxClass: 'lux-stat-navy',
              textColor: 'text-blue-200/70',
              iconColor: 'text-blue-200',
              icon: Banknote,
              tooltip: 'SP2D yang dicairkan dengan nilai bruto — pajak/potongannya dibayar langsung oleh pihak ketiga, tidak muncul di rekening koran pemerintah.'
            }
          ].map((stat, i) => (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div className={cn("lux-stat p-4 rounded-xl flex flex-col group cursor-help", stat.luxClass)}>
                  <div className="flex items-center justify-between mb-2">
                    <p className={cn("text-[9px] font-bold uppercase tracking-wider", stat.textColor)}>{stat.label}</p>
                    <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                      <stat.icon className={cn("w-3.5 h-3.5", stat.iconColor)} />
                    </div>
                  </div>
                  <p className="text-xl font-bold text-white">{stat.count}</p>
                </div>
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
              <TabsTrigger value="bruto" className="px-4 py-2 rounded-t-lg rounded-b-none border-b-2 border-transparent text-xs font-semibold data-[state=active]:border-ds-focus-ring data-[state=active]:text-fin-info-text data-[state=active]:bg-fin-surface transition-all flex items-center gap-1.5">
                <Banknote size={12} /> SP2D Pencairan Bruto
              </TabsTrigger>
              <TabsTrigger value="ghost" className="px-4 py-2 rounded-t-lg rounded-b-none border-b-2 border-transparent text-xs font-semibold data-[state=active]:border-ds-focus-ring data-[state=active]:text-fin-info-text data-[state=active]:bg-fin-surface transition-all flex items-center gap-1.5">
                <Ghost size={12} /> Ghost AUTO_HEADER
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
                                  <div className="text-[9px] font-bold text-fin-text-muted uppercase mt-0.5">{item.tanggal ? format(new Date(item.tanggal), 'dd MMM yyyy') : '-'}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-secondary truncate max-w-[200px]">{item.opd || '-'}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-muted truncate max-w-[200px] italic">{item.uraian}</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-expense tabular-nums">{formatCurrency(item.nilai_neto)}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-black text-fin-text-muted">
                                    {item.tanggal ? format(new Date(item.tanggal), 'dd/MM/yy') : '-'}
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
                                  <div className="text-[10px] font-black text-fin-text-muted">{item.tanggal ? format(new Date(item.tanggal), 'dd/MM/yy') : '-'}</div>
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
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Nama OPD</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Uraian Pembayaran</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Uraian Potongan</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right">Nilai</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tgl Cair</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-center">Tipe</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-fin-border">
                          {(data?.unmatchedPotongan ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="p-12 text-center">
                                <div className="flex flex-col items-center opacity-40">
                                  <CheckCircle2 size={40} className="text-[#12B76A] mb-2" />
                                  <p className="text-xs font-semibold text-fin-text-secondary">Seluruh potongan telah disetorkan!</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (data?.unmatchedPotongan ?? []).filter((item: any) =>
                              item.nomor_bukti.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              item.uraian.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (item.opd || '').toLowerCase().includes(searchQuery.toLowerCase())
                            ).map((item: any) => (
                              <TableRow key={item.id} className="hover:bg-fin-page transition-colors group">
                                <TableCell className="p-4">
                                  <div className="font-black text-xs text-fin-text-primary">{item.nomor_bukti}</div>
                                  <div className="text-[9px] font-bold text-fin-info mt-0.5">{item.id_sumber_dana}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-secondary truncate max-w-[180px]">{item.opd || '-'}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-muted line-clamp-2 max-w-[220px] italic">{item.uraian_sp2d || '-'}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-muted line-clamp-1 max-w-[160px]">{item.uraian}</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-info tabular-nums">{formatCurrency(item.nilai)}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-black text-fin-text-muted">{item.tanggal ? format(new Date(item.tanggal), 'dd/MM/yy') : '-'}</div>
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
                                  <div className="text-xs font-black text-fin-text-primary">{item.tanggal ? format(new Date(item.tanggal), 'dd/MM/yy') : '-'}</div>
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

                {/* SP2D BRUTO TABLE */}
                <TabsContent value="bruto" className="m-0">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Daftar Belanja SP2D Pencairan Nilai Bruto</h4>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">Pajak/potongan dibayar pihak ketiga — tidak tercatat di rekening koran pemerintah</p>
                      </div>
                      {brutoData?.summary && (
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-[9px] font-bold text-fin-text-muted uppercase">Total Nilai Bruto</p>
                            <p className="text-sm font-black text-fin-expense tabular-nums">{formatCurrency(brutoData.summary.totalNilaiBruto)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] font-bold text-fin-text-muted uppercase">Total Potongan Pihak Ketiga</p>
                            <p className="text-sm font-black text-fin-warning-text tabular-nums">{formatCurrency(brutoData.summary.totalNilaiPotongan)}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-fin-border">
                      <Table>
                        <TableHeader className="bg-fin-page">
                          <TableRow>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Nomor SP2D</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">OPD</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Uraian Belanja</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right">Nilai Bruto</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right">Potongan Pihak Ketiga</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right">Nilai Neto</TableHead>
                            <TableHead className="p-4 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tgl Cair</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody className="divide-y divide-fin-border">
                          {brutoLoading ? (
                            <TableRow>
                              <TableCell colSpan={7} className="p-12 text-center">
                                <Loader2 className="animate-spin mx-auto text-fin-info" size={28} />
                              </TableCell>
                            </TableRow>
                          ) : (brutoData?.data ?? []).length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="p-12 text-center">
                                <div className="flex flex-col items-center opacity-40">
                                  <CheckCircle2 size={40} className="text-[#12B76A] mb-2" />
                                  <p className="text-xs font-semibold text-fin-text-secondary">Tidak ada SP2D pencairan bruto pada periode ini.</p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            (brutoData?.data ?? []).filter((item: any) =>
                              (item.nomor || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (item.opd || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                              (item.uraian || '').toLowerCase().includes(searchQuery.toLowerCase())
                            ).map((item: any) => (
                              <TableRow key={item.id} className="hover:bg-fin-page transition-colors group">
                                <TableCell className="p-4">
                                  <div className="font-black text-xs text-fin-text-primary truncate max-w-[200px]">{item.nomor}</div>
                                  <div className="text-[9px] font-bold text-fin-text-muted mt-0.5">{item.jenis}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-secondary truncate max-w-[180px]">{item.opd}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-bold text-fin-text-muted line-clamp-2 max-w-[220px] italic">{item.uraian || '-'}</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-expense tabular-nums">{formatCurrency(item.nilai_bruto)}</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-warning-text tabular-nums">{formatCurrency(item.nilai_potongan)}</div>
                                  <div className="text-[9px] text-fin-text-muted mt-0.5 text-right">via pihak ketiga</div>
                                </TableCell>
                                <TableCell className="p-4 text-right">
                                  <div className="font-black text-xs text-fin-text-primary tabular-nums">{formatCurrency(item.nilai_neto)}</div>
                                </TableCell>
                                <TableCell className="p-4">
                                  <div className="text-[10px] font-black text-fin-text-muted">
                                    {item.tanggal_pencairan ? format(new Date(item.tanggal_pencairan), 'dd/MM/yy') : format(new Date(item.tanggal), 'dd/MM/yy')}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>

                    {/* Pagination */}
                    {brutoPagination.totalPages > 1 && (
                      <div className="flex items-center justify-between pt-2">
                        <p className="text-[10px] text-fin-text-muted font-medium">
                          Total {brutoPagination.total} record — Halaman {brutoPagination.page} dari {brutoPagination.totalPages}
                        </p>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" disabled={brutoPagination.page <= 1} onClick={() => fetchBruto(brutoPagination.page - 1)} className="h-8 px-3 text-xs rounded-lg">
                            &larr; Prev
                          </Button>
                          <Button size="sm" variant="outline" disabled={brutoPagination.page >= brutoPagination.totalPages} onClick={() => fetchBruto(brutoPagination.page + 1)} className="h-8 px-3 text-xs rounded-lg">
                            Next &rarr;
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
                {/* GHOST AUTO_HEADER TAB */}
                <TabsContent value="ghost" className="m-0">
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Ghost AUTO_HEADER Orphan</h4>
                        <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                          Record placeholder yang tidak terhapus meskipun rincian pajak sudah diimport — menyebabkan BKU Belum Rekon menggelembung
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          onClick={fetchGhost}
                          disabled={ghostLoading}
                          variant="outline"
                          className="h-9 px-3 border-fin-border rounded-xl font-semibold text-xs flex items-center gap-1.5"
                        >
                          {ghostLoading ? <Loader2 className="animate-spin" size={13} /> : <Eye size={13} />}
                          Cek Ulang
                        </Button>
                        {(ghostData?.deleted ?? 0) > 0 && (
                          <Button
                            onClick={handleFixGhost}
                            disabled={ghostFixing}
                            className="h-9 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-semibold text-xs flex items-center gap-1.5"
                          >
                            {ghostFixing ? <Loader2 className="animate-spin" size={13} /> : <Trash2 size={13} />}
                            Hapus {ghostData?.deleted} Ghost Record
                          </Button>
                        )}
                      </div>
                    </div>

                    {ghostLoading ? (
                      <div className="p-12 text-center">
                        <Loader2 className="animate-spin mx-auto text-fin-info" size={28} />
                      </div>
                    ) : (ghostData?.deleted ?? 0) === 0 ? (
                      <div className="p-12 text-center rounded-xl border border-fin-border bg-fin-page">
                        <div className="flex flex-col items-center opacity-40">
                          <CheckCircle2 size={40} className="text-[#12B76A] mb-2" />
                          <p className="text-xs font-semibold text-fin-text-secondary">Tidak ada ghost record — data potongan bersih.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl">
                          <AlertTriangle size={16} className="text-rose-500 shrink-0" />
                          <div>
                            <p className="text-xs font-black text-rose-700">
                              Ditemukan <span className="tabular-nums">{ghostData.deleted}</span> ghost record AUTO_HEADER dari <span className="tabular-nums">{ghostData.sp2d_affected}</span> SP2D
                            </p>
                            <p className="text-[10px] text-rose-500 mt-0.5">
                              Record ini adalah placeholder usang yang menggembungkan angka BKU Belum Rekon. Aman untuk dihapus.
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] text-fin-text-muted px-1">
                          Klik <strong>Hapus Ghost Record</strong> di atas untuk membersihkan. Tindakan ini dicatat di log aktivitas.
                        </p>
                      </div>
                    )}
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
