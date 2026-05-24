'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { 
  Search, 
  Filter, 
  Printer, 
  FileSpreadsheet, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Wallet, 
  Calendar,
  Building2,
  ChevronLeft,
  ChevronRight,
  Download,
  Database,
  ArrowRight,
  Loader2,
  AlertCircle,
  ChevronDown,
  X,
  Eye,
  Banknote,
  ShieldCheck
} from 'lucide-react';
import { formatCurrency, cn, formatNumber } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcel, exportToPDF, printPDF, previewPDF } from '@/lib/exportUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';

const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

export default function BankLedgerPage() {
  const [filters, setFilters] = useState({
    startDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    sumberDana: '',
    page: 1,
    limit: 50
  });
  const [showFilters, setShowFilters] = useState(true);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [queryParams, setQueryParams] = useState(filters);
  const [sumberDanaList, setSumberDanaList] = useState<any[]>([]);

  const { data, error, isLoading, mutate } = useSWR(
    filters.sumberDana ? ['/reports/bank-ledger', queryParams] : null,
    ([url, params]) => fetcher(url, params)
  );

  useEffect(() => {
    fetchSumberDana();
  }, []);

  const fetchSumberDana = async () => {
    try {
      const res = await api.get('/dss/sumber-dana');
      setSumberDanaList(res.data);
      if (res.data.length > 0 && !filters.sumberDana) {
        setFilters(prev => ({ ...prev, sumberDana: res.data[0].id.toString() }));
        setQueryParams(prev => ({ ...prev, sumberDana: res.data[0].id.toString() }));
      }
    } catch (err) {}
  };

  const handleDisplay = () => {
    if (!filters.sumberDana) {
      toast.error('Silakan pilih Rekening Bank / Sumber Dana terlebih dahulu');
      return;
    }
    setQueryParams({ ...filters, page: 1 });
    mutate();
  };

  const selectedBankName = sumberDanaList.find(s => s.id.toString() === queryParams.sumberDana)?.nama || 'Bank';

  const handleExportExcel = () => {
    const items = data?.data || [];
    if (items.length === 0) return;
    const exportData = items.map((item: any, index: number) => ({
      'No': index + 1,
      'Tanggal': format(new Date(item.tanggal), 'dd/MM/yyyy'),
      'No. Bukti': item.bukti,
      'Uraian': item.uraian,
      'Keterangan': item.opd,
      'Penerimaan (M)': item.penerimaan,
      'Pengeluaran (K)': item.pengeluaran,
      'Saldo': item.saldo,
      'Audit Rekon': item.keterangan_rekon || item.status_rekon || '-'
    }));
    exportToExcel(exportData, `Buku_Pembantu_Bank_${selectedBankName}_${queryParams.startDate}`);
  };

  const handlePreviewReport = async () => {
    const loadToast = toast.loading('Menyiapkan pratinjau dokumen...');
    try {
      const res = await api.get('/reports/bank-ledger', { 
        params: { ...queryParams, limit: 10000, page: 1 } 
      });
      const allData = res.data.data || [];
      toast.dismiss(loadToast);

      if (allData.length === 0) {
        toast.error('Tidak ada data untuk periode ini');
        return;
      }

      const headers = ['No.', 'Tanggal', 'No. Bukti', 'Uraian', 'Keterangan', 'M (Terima)', 'K (Keluar)', 'Saldo (Rp)', 'Audit Rekon'];
      const body = allData.map((item: any, index: number) => [
        index + 1,
        format(new Date(item.tanggal), 'dd/MM/yyyy'),
        item.bukti,
        item.uraian,
        item.opd,
        formatCurrency(item.penerimaan),
        formatCurrency(item.pengeluaran),
        formatCurrency(item.saldo),
        item.keterangan_rekon || item.status_rekon || '-'
      ]);

      const lastItem = allData[allData.length - 1];
      const foot = [['', '', '', '', '', '', '', 'SALDO AKHIR', formatCurrency(lastItem.saldo)]];

      const url = previewPDF(headers, body, `BUKU PEMBANTU BANK: ${selectedBankName} (${queryParams.startDate} - ${queryParams.endDate})`, foot);
      setPreviewPdf(url);
    } catch (err) {
      toast.error('Gagal memuat pratinjau');
      toast.dismiss(loadToast);
    }
  };

  return (
    <div className="flex flex-col space-y-6 p-6 min-h-screen bg-fin-page">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-fin-text-primary tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-fin-info rounded-xl flex items-center justify-center shadow-lg shadow-fin-info/20">
               <Banknote className="text-white" size={24} />
            </div>
            BUKU PEMBANTU BANK
          </h1>
          <p className="text-sm text-fin-text-muted mt-1 font-medium">Monitoring Mutasi dan Saldo Real-time per Rekening Bank</p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowFilters(!showFilters)}
            className={cn("h-10 border-fin-border transition-all bg-fin-surface text-fin-text-primary", showFilters && "bg-fin-page")}
          >
            <Filter size={16} className="mr-2" />
            {showFilters ? 'Sembunyikan Filter' : 'Tampilkan Filter'}
          </Button>
          <Button 
            variant="outline" 
            onClick={handleExportExcel}
            className="h-10 border-fin-border bg-fin-surface text-fin-text-primary hover:bg-fin-income-bg hover:text-fin-income transition-all"
          >
            <FileSpreadsheet size={16} className="mr-2" />
            Excel
          </Button>
          <Button
            variant="primary"
            onClick={handlePreviewReport}
            className="h-10 shadow-lg"
          >
            <Printer size={16} className="mr-2" />
            Cetak Laporan
          </Button>
        </div>
      </div>

      {/* FILTER PANEL (GOLD STANDARD) */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <Card className="border-fin-border shadow-sm bg-fin-surface overflow-visible">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest flex items-center gap-2">
                       <Calendar size={12} className="text-fin-info" /> Tanggal Mulai
                    </label>
                    <Input 
                      type="date" 
                      value={filters.startDate}
                      onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                      className="h-10 border-fin-border bg-fin-page text-fin-text-primary focus:ring-ds-focus-ring"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest flex items-center gap-2">
                       <Calendar size={12} className="text-fin-info" /> Tanggal Akhir
                    </label>
                    <Input 
                      type="date" 
                      value={filters.endDate}
                      onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                      className="h-10 border-fin-border bg-fin-page text-fin-text-primary focus:ring-ds-focus-ring"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest flex items-center gap-2">
                       <Wallet size={12} className="text-fin-info" /> Rekening Bank / Sumber Dana
                    </label>
                    <select 
                      className="w-full h-10 px-3 rounded-lg border border-fin-border bg-fin-surface text-sm focus:outline-none focus:ring-2 focus:ring-ds-focus-ring"
                      value={filters.sumberDana}
                      onChange={(e) => setFilters({ ...filters, sumberDana: e.target.value })}
                    >
                      <option value="">-- Pilih Rekening --</option>
                      {sumberDanaList.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.nama}</option>
                      ))}
                    </select>
                  </div>
                  <Button 
                    onClick={handleDisplay}
                    className="h-10 bg-fin-info hover:opacity-90 text-fin-surface font-bold"
                  >
                    <RefreshCw size={16} className="mr-2" />
                    Tampilkan Data
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="lux-stat lux-stat-emerald p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-emerald-200/70 uppercase tracking-widest">Total Mutasi Masuk</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-200" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-white tabular-nums truncate">
            {isLoading ? '...' : formatCurrency(data?.summary?.totalPenerimaan || 0)}
          </h3>
        </div>
        <div className="lux-stat lux-stat-rose p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-red-200/70 uppercase tracking-widest">Total Mutasi Keluar</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <ArrowDownLeft className="w-3.5 h-3.5 text-red-200" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-white tabular-nums truncate">
            {isLoading ? '...' : formatCurrency(data?.summary?.totalPengeluaran || 0)}
          </h3>
        </div>
        <div className="lux-stat lux-stat-navy p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-blue-200/70 uppercase tracking-widest">Saldo Akhir Rekening</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-200" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-white tabular-nums truncate">
            {isLoading ? '...' : formatCurrency(data?.summary?.saldoAkhir || 0)}
          </h3>
        </div>
      </div>

      {/* DATA TABLE (BKU STANDARD) */}
      <Card className="border-fin-border shadow-xl shadow-sm bg-fin-surface overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-fin-page/50">
                <TableRow className="border-b border-fin-border hover:bg-transparent">
                  <TableHead className="w-[60px] text-[10px] font-black text-fin-text-muted uppercase text-center py-4">No</TableHead>
                  <TableHead className="w-[120px] text-[10px] font-black text-fin-text-muted uppercase py-4 text-center">Tanggal</TableHead>
                  <TableHead className="w-[180px] text-[10px] font-black text-fin-text-muted uppercase py-4">No. Bukti</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4">Uraian Transaksi</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-right min-w-[160px]">M (Penerimaan)</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-right min-w-[160px]">K (Pengeluaran)</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-right min-w-[160px]">Saldo (Rp)</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-center pr-6">Audit Rekon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="animate-spin text-fin-info" size={32} />
                        <p className="text-sm font-bold text-fin-text-muted">Memproses Data Transaksi...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : data?.data?.length > 0 ? (
                  data.data.map((item: any, i: number) => (
                    <motion.tr 
                      key={i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className={cn(
                        "group border-b border-fin-border hover:bg-fin-page transition-colors",
                        item.tipe === 'SALDO_AWAL' && "bg-fin-page font-bold"
                      )}
                    >
                      <TableCell className="text-center font-bold text-fin-text-muted text-[11px] py-4">{i + 1}</TableCell>
                      <TableCell className="text-center text-[11px] font-bold text-fin-text-muted">
                        {item.tanggal ? format(new Date(item.tanggal), 'dd/MM/yyyy') : '-'}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-1 bg-fin-page text-fin-text-primary text-[10px] font-black rounded-lg tracking-wider">
                          {item.bukti}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                           <span className="text-xs font-bold text-fin-text-primary leading-tight uppercase">{item.uraian}</span>
                           <span className="text-[10px] text-fin-text-muted mt-0.5">{item.opd}</span>
                        </div>
                      </TableCell>
                       <TableCell className="text-right font-black text-fin-income tabular-nums text-xs min-w-[160px]">
                        {item.penerimaan > 0 ? formatCurrency(item.penerimaan) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-black text-fin-expense tabular-nums text-xs min-w-[160px]">
                        {item.pengeluaran > 0 ? formatCurrency(item.pengeluaran) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-black text-fin-text-primary tabular-nums text-xs min-w-[160px]">
                        {formatCurrency(item.saldo)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-center pr-6">
                        {item.tipe === 'SALDO_AWAL' ? (
                          <span className="text-[10px] font-medium text-fin-text-muted">-</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                             {item.status_rekon === 'SUDAH' ? (
                              <Badge variant="outline" className="bg-fin-income-bg text-fin-income border-fin-income/20 text-[9px] px-2 py-0.5 font-bold whitespace-nowrap">COCOK</Badge>
                            ) : (
                              <Badge variant="outline" className="bg-fin-page text-fin-text-muted border-fin-border text-[9px] px-2 py-0.5 font-medium whitespace-nowrap">BELUM REKON</Badge>
                            )}
                            {item.keterangan_rekon && (
                              <p className="text-[8px] text-fin-info font-bold max-w-[80px] truncate" title={item.keterangan_rekon}>
                                {item.keterangan_rekon}
                              </p>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </motion.tr>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                       <div className="flex flex-col items-center gap-2">
                          <AlertCircle className="text-slate-200" size={48} />
                          <p className="text-sm font-bold text-fin-text-muted italic">Belum ada data transaksi ditemukan untuk filter ini.</p>
                       </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* PDF PREVIEW MODAL */}
      {previewPdf && (
        <div className="fixed inset-0 z-50 bg-ds-primary/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-fin-surface rounded-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl"
          >
            <div className="p-4 border-b border-fin-border flex items-center justify-between bg-fin-surface">
              <div className="flex items-center gap-3">
                 <div className="w-8 h-8 bg-fin-info rounded-lg flex items-center justify-center">
                    <Printer className="text-white" size={16} />
                 </div>
                 <h3 className="font-black text-fin-text-primary text-sm uppercase">Pratinjau Buku Pembantu Bank</h3>
              </div>
              <Button variant="ghost" onClick={() => setPreviewPdf(null)} className="h-8 w-8 p-0 rounded-full">
                <X size={18} />
              </Button>
            </div>
            <iframe src={previewPdf} className="flex-1 w-full" />
            <div className="p-4 bg-slate-50 border-t border-fin-border flex justify-end">
              <Button onClick={() => setPreviewPdf(null)} className="bg-fin-text-primary text-fin-surface">
                Tutup Pratinjau
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
