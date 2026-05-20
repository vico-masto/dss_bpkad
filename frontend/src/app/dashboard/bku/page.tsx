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
  Copy,
  Tag
} from 'lucide-react';
import { formatCurrency, cn, parseNumber, formatNumber } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcel, exportToPDF, printPDF, previewPDF } from '@/lib/exportUtils';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';
import { PageHeader } from '@/components/patterns/page-header';
import { Combobox } from "@/components/ui/combobox";


const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

const formatAuditStatus = (keterangan: string, status: string) => {
  if (!keterangan && !status) return '-';
  
  if (keterangan?.includes('Auto-Matched to Bank @')) {
     return `TEREKONSILIASI (Otomatis)`;
  }
  
  if (status === 'SUDAH') return 'TEREKONSILIASI';
  if (status?.includes('ANOMALI')) return `ANOMALI AUDIT`;
  if (status === 'BELUM' || !status) return 'OUTSTANDING';
  
  return keterangan || status || '-';
};

export default function BkuPage() {
  const [filters, setFilters] = useState({
    startDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    sumberDana: '',
    opd: '',
    jenisTransaksi: '',
    page: 1,
    limit: 50
  });
  const [showFilters, setShowFilters] = useState(true);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);

  const [queryParams, setQueryParams] = useState(filters);
  const [sumberDanaList, setSumberDanaList] = useState([]);

  const { data, error, isLoading, mutate } = useSWR(
    ['/reports/bku', queryParams],
    ([url, params]) => {
      // Cross-compatibility for old/new parameter names
      const mappedParams = {
        ...params,
        tgl_awal: params.startDate,
        tgl_akhir: params.endDate,
        id_sumber_dana: params.sumberDana,
        jenis_transaksi: params.jenisTransaksi
      };
      return fetcher(url, mappedParams);
    }
  );

  const handleDisplay = () => {
    setQueryParams({ ...filters, page: 1 });
    mutate();
  };

  useEffect(() => {
    fetchSumberDana();
  }, []);

  const fetchSumberDana = async () => {
    try {
      const res = await api.get('/dss/sumber-dana');
      setSumberDanaList(res.data);
    } catch (err) {}
  };

  const handleExportExcel = async () => {
    const loadToast = toast.loading('Menyiapkan data Excel...');
    try {
      const res = await api.get('/reports/bku', { 
        params: { ...queryParams, tgl_awal: queryParams.startDate, tgl_akhir: queryParams.endDate, id_sumber_dana: queryParams.sumberDana, jenis_transaksi: queryParams.jenisTransaksi, limit: 10000, page: 1 } 
      });
      const allData = res.data.data || [];
      toast.dismiss(loadToast);

      if (allData.length === 0) {
        toast.error('Tidak ada data untuk periode ini');
        return;
      }

      const exportData = allData.map((item: any, index: number) => ({
        'No': index + 1,
        'Tanggal': format(new Date(item.tanggal), 'dd/MM/yyyy'),
        'No. Bukti': item.bukti,
        'Uraian': item.uraian,
        'OPD': item.opd,
        'Sumber Dana': item.id_sumber_dana,
        'Penerimaan': item.penerimaan,
        'Pengeluaran': item.pengeluaran,
        'Saldo': item.saldo,
        'Audit Rekon': formatAuditStatus(item.keterangan_rekon, item.status_rekon)
      }));

      exportToExcel(exportData, `BKU_${queryParams.startDate}_ke_${queryParams.endDate}`);
      toast.success('File Excel berhasil diunduh');
    } catch (err) {
      toast.error('Gagal mengambil data lengkap untuk ekspor');
      toast.dismiss(loadToast);
    }
  };

  const handlePreviewReport = async () => {
    const loadToast = toast.loading('Menyiapkan pratinjau dokumen...');
    try {
      const res = await api.get('/reports/bku', { 
        params: { ...queryParams, tgl_awal: queryParams.startDate, tgl_akhir: queryParams.endDate, id_sumber_dana: queryParams.sumberDana, jenis_transaksi: queryParams.jenisTransaksi, limit: 10000, page: 1 } 
      });
      const allData = res.data.data || [];
      toast.dismiss(loadToast);

      if (allData.length === 0) {
        toast.error('Tidak ada data untuk periode ini');
        return;
      }

      const headers = ['No.', 'Tanggal', 'No. Bukti', 'Uraian', 'Unit Kerja (OPD)', 'Terima (Rp)', 'Keluar (Rp)', 'Saldo (Rp)', 'Audit Rekon'];
      const body = allData.map((item: any, index: number) => {
        let displayDate = '-';
        try {
          if (item.tanggal) displayDate = format(new Date(item.tanggal), 'dd/MM/yyyy');
        } catch (e) {}

        return [
          index + 1,
          displayDate,
          item.bukti || '-',
          item.uraian || '-',
          item.opd || '-',
          formatCurrency(item.penerimaan || 0),
          formatCurrency(item.pengeluaran || 0),
          formatCurrency(item.saldo || 0),
          formatAuditStatus(item.keterangan_rekon, item.status_rekon)
        ];
      });

      const lastItem = allData[allData.length - 1];
      const totalPenerimaan = allData.reduce((acc: number, curr: any) => acc + (parseFloat(curr.penerimaan) || 0), 0);
      const totalPengeluaran = allData.reduce((acc: number, curr: any) => acc + (parseFloat(curr.pengeluaran) || 0), 0);

      const foot = [
        ['', '', '', '', 'JUMLAH TOTAL', formatCurrency(totalPenerimaan), formatCurrency(totalPengeluaran), formatCurrency(lastItem.saldo), '']
      ];

      const url = previewPDF(headers, body, `BUKU KAS UMUM (${queryParams.startDate} - ${queryParams.endDate})`, foot);
      setPreviewPdf(url);
    } catch (err) {
      toast.error('Gagal memuat pratinjau');
      toast.dismiss(loadToast);
    }
  };

  const handleExportPDF = async () => {
    const loadToast = toast.loading('Menyiapkan dokumen PDF...');
    try {
      const res = await api.get('/reports/bku', { 
        params: { ...queryParams, tgl_awal: queryParams.startDate, tgl_akhir: queryParams.endDate, id_sumber_dana: queryParams.sumberDana, jenis_transaksi: queryParams.jenisTransaksi, limit: 10000, page: 1 } 
      });
      const allData = res.data.data || [];
      toast.dismiss(loadToast);

      if (allData.length === 0) return;
      const headers = ['No.', 'Tanggal', 'No. Bukti', 'Uraian', 'Unit Kerja (OPD)', 'Terima (Rp)', 'Keluar (Rp)', 'Saldo (Rp)', 'Audit Rekon'];
      const body = allData.map((item: any, i: number) => {
        let displayDate = '-';
        try {
          if (item.tanggal) displayDate = format(new Date(item.tanggal), 'dd/MM/yyyy');
        } catch (e) {}

        return [
          i + 1,
          displayDate,
          item.bukti || '-',
          item.uraian || '-',
          item.opd || '-',
          formatCurrency(item.penerimaan || 0),
          formatCurrency(item.pengeluaran || 0),
          formatCurrency(item.saldo || 0),
          formatAuditStatus(item.keterangan_rekon, item.status_rekon)
        ];
      });
      
      const lastItem = allData[allData.length - 1];
      const totalPenerimaan = allData.reduce((acc: number, curr: any) => acc + (parseFloat(curr.penerimaan) || 0), 0);
      const totalPengeluaran = allData.reduce((acc: number, curr: any) => acc + (parseFloat(curr.pengeluaran) || 0), 0);

      const foot = [
        ['', '', '', '', 'JUMLAH TOTAL', formatCurrency(totalPenerimaan), formatCurrency(totalPengeluaran), formatCurrency(lastItem.saldo), '']
      ];

      exportToPDF(headers, body, `BKU_${queryParams.startDate}_ke_${queryParams.endDate}`, `BUKU KAS UMUM (${queryParams.startDate} - ${queryParams.endDate})`, foot);
    } catch (err) {
      toast.error('Gagal memuat data lengkap');
      toast.dismiss(loadToast);
    }
  };

  const handlePrintPDF = async () => {
    const loadToast = toast.loading('Menyiapkan dokumen cetak...');
    try {
      const res = await api.get('/reports/bku', { 
        params: {
          ...queryParams,
          tgl_awal: queryParams.startDate,
          tgl_akhir: queryParams.endDate,
          id_sumber_dana: queryParams.sumberDana,
          jenis_transaksi: queryParams.jenisTransaksi,
          limit: 10000,
          page: 1
        } 
      });
      
      const allData = res.data?.data || [];
      toast.dismiss(loadToast);

      if (allData.length === 0) {
        toast.error('Tidak ada data untuk dicetak pada periode ini');
        return;
      }

      const headers = ['No.', 'Tanggal', 'No. Bukti', 'Uraian', 'Unit Kerja (OPD)', 'Terima (Rp)', 'Keluar (Rp)', 'Saldo (Rp)', 'Audit Rekon'];
      const body = allData.map((item: any, i: number) => {
        let displayDate = '-';
        try {
          if (item.tanggal) displayDate = format(new Date(item.tanggal), 'dd/MM/yyyy');
        } catch (e) {}

        return [
          i + 1,
          displayDate,
          item.bukti || '-',
          item.uraian || '-',
          item.opd || '-',
          formatCurrency(item.penerimaan || 0),
          formatCurrency(item.pengeluaran || 0),
          formatCurrency(item.saldo || 0),
          formatAuditStatus(item.keterangan_rekon, item.status_rekon)
        ];
      });

      const lastItem = allData[allData.length - 1];
      const totalPenerimaan = allData.reduce((acc: number, curr: any) => acc + (parseFloat(curr.penerimaan) || 0), 0);
      const totalPengeluaran = allData.reduce((acc: number, curr: any) => acc + (parseFloat(curr.pengeluaran) || 0), 0);

      const foot = [
        ['', '', '', '', 'JUMLAH TOTAL', formatCurrency(totalPenerimaan), formatCurrency(totalPengeluaran), formatCurrency(lastItem?.saldo || 0), '']
      ];

      // Gunakan printPDF utility
      printPDF(headers, body, `BUKU KAS UMUM (${queryParams.startDate} - ${queryParams.endDate})`, foot);
      toast.success('Perintah cetak berhasil dikirim');
    } catch (err: any) {
      console.error('PRINT PDF ERROR:', err);
      toast.error('Gagal memuat dokumen: ' + (err.message || 'Kesalahan sistem'));
      toast.dismiss(loadToast);
    }
  };

  // Compatibility logic for old (Array) and new (Object) API responses
  const bkuItems = Array.isArray(data) ? data : (data?.data || []);
  const summary = !Array.isArray(data) && data?.summary ? data.summary : {
    saldoAwal: bkuItems[0]?.tipe === 'SALDO_AWAL' ? bkuItems[0].saldo : 0,
    totalPenerimaan: bkuItems.reduce((acc: number, curr: any) => acc + (parseFloat(curr.penerimaan) || 0), 0),
    totalPengeluaran: bkuItems.reduce((acc: number, curr: any) => acc + (parseFloat(curr.pengeluaran) || 0), 0),
    saldoAkhir: bkuItems.length > 0 ? bkuItems[bkuItems.length - 1].saldo : 0
  };
  const pagination = !Array.isArray(data) && data?.pagination ? data.pagination : { totalData: bkuItems.length, page: 1, totalPages: 1 };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      {/* PAGE HEADER */}
      <PageHeader
        title="Buku Kas Umum (BKU)"
        description="Laporan arus kas dan saldo berjalan daerah"
        icon={<Wallet className="size-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={handlePreviewReport} className="h-10 px-4 text-fin-text-muted font-semibold hover:bg-fin-surface rounded-lg transition-all flex items-center gap-2">
              <Eye size={16} className="text-fin-info-text" /><span>Preview</span>
            </Button>
            <Button variant="outline" onClick={handleExportExcel} className="h-10 px-4 bg-fin-surface border-fin-border rounded-lg text-xs font-semibold text-fin-text-muted hover:bg-fin-page transition-all flex items-center gap-2">
              <Download size={16} /><span>Export Excel</span>
            </Button>
            <Button onClick={handlePrintPDF} className="h-10 px-6 bg-fin-text-primary text-fin-surface rounded-lg text-xs font-semibold hover:opacity-90 transition-all shadow-sm flex items-center gap-2">
              <Printer size={16} /><span>Cetak PDF</span>
            </Button>
          </div>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
         {/* KARTU TERGABUNG: TOTAL DANA TERKELOLA */}
         <motion.div 
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           className="group"
         >
           <Card className="p-5 rounded-xl border-fin-border shadow-sm relative overflow-hidden bg-fin-surface hover:shadow-md transition-all duration-300 flex flex-col justify-between min-h-[150px]">
              <div className="absolute -top-4 -right-4 p-8 opacity-[0.03] text-fin-info-text transition-transform duration-700 group-hover:scale-110 group-hover:rotate-12">
                 <Database size={100} />
              </div>
              
              <div className="flex justify-between items-start relative z-10">
                 <div className="space-y-1">
                    <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Total Dana Terkelola</p>
                    <h2 className="text-xl font-black tracking-tight text-fin-text-primary">
                       {formatCurrency((summary.saldoAwal || 0) + (summary.totalPenerimaan || 0))}
                    </h2>
                 </div>
                 <div className="w-9 h-9 bg-indigo-50 text-fin-info-text rounded-xl flex items-center justify-center border border-indigo-100">
                    <Database size={18} />
                 </div>
              </div>

              <div className="mt-4 relative z-10 space-y-3">
                  <div className="h-1.5 w-full bg-fin-subtle rounded-full overflow-hidden flex">
                    <div 
                       style={{ width: `${((summary.saldoAwal || 0) / ((summary.saldoAwal || 0) + (summary.totalPenerimaan || 1)) * 100)}%` }} 
                       className="h-full bg-indigo-500 border-r border-white/20" 
                    />
                    <div 
                       style={{ width: `${((summary.totalPenerimaan || 0) / ((summary.saldoAwal || 0) + (summary.totalPenerimaan || 1)) * 100)}%` }} 
                       className="h-full bg-fin-income" 
                    />
                 </div>
                 <div className="flex items-center justify-between text-[8px] font-bold uppercase tracking-tight">
                    <div className="flex items-center gap-1.5 text-fin-info-text">
                       <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                       S.Awal: {formatCurrency(summary.saldoAwal)}
                    </div>
                    <div className="flex items-center gap-1.5 text-fin-income">
                       <div className="w-1.5 h-1.5 rounded-full bg-fin-income" />
                       Penerimaan: {formatCurrency(summary.totalPenerimaan)}
                    </div>
                 </div>
              </div>
           </Card>
         </motion.div>

         {/* TOTAL PENGELUARAN */}
         <motion.div 
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.1 }}
           className="group"
         >
           <Card className="p-5 rounded-xl border-fin-border shadow-sm relative overflow-hidden bg-fin-surface hover:shadow-md transition-all duration-300 h-full flex flex-col justify-between min-h-[150px]">
              <div className="absolute -top-4 -right-4 p-8 opacity-[0.03] text-fin-expense transition-transform duration-700 group-hover:scale-110 group-hover:rotate-12">
                 <ArrowDownLeft size={100} />
              </div>
              <div className="flex justify-between items-start relative z-10">
                <div className="space-y-1">
                   <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Total Pengeluaran</p>
                   <h2 className="text-xl font-black tracking-tight text-fin-expense">
                     {formatCurrency(summary.totalPengeluaran)}
                   </h2>
                </div>
                <div className="w-9 h-9 bg-fin-expense/10 text-fin-expense rounded-xl flex items-center justify-center border border-fin-expense/20">
                   <ArrowDownLeft size={18} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[9px] font-bold text-fin-text-muted uppercase">
                 <div className="w-1.5 h-1.5 rounded-full bg-fin-expense" />
                 Mutasi Keluar Periode Ini
              </div>
           </Card>
         </motion.div>

         {/* SALDO AKHIR */}
         <motion.div 
           initial={{ opacity: 0, y: 10 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ delay: 0.2 }}
           className="group"
         >
           <Card className="p-5 rounded-xl border-fin-border shadow-sm relative overflow-hidden bg-fin-surface hover:shadow-md transition-all duration-300 h-full flex flex-col justify-between min-h-[150px] border-t-2 border-t-ds-accent">
              <div className="absolute -top-4 -right-4 p-8 opacity-[0.03] text-fin-info-text transition-transform duration-700 group-hover:scale-110 group-hover:rotate-12">
                 <Wallet size={100} />
              </div>
              <div className="flex justify-between items-start relative z-10">
                <div className="space-y-1">
                   <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Saldo Akhir Periode</p>
                   <h2 className="text-xl font-black tracking-tight text-fin-text-primary">
                     {formatCurrency(summary.saldoAkhir)}
                   </h2>
                </div>
                <div className="w-9 h-9 bg-fin-subtle text-fin-info-text rounded-xl flex items-center justify-center border border-indigo-100">
                   <Wallet size={18} />
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-[9px] font-bold text-fin-text-muted uppercase">
                 <div className="w-1.5 h-1.5 rounded-full bg-ds-primary" />
                 Saldo Kas Tersedia
              </div>
           </Card>
         </motion.div>
      </div>




      {/* Filter Panel */}
      <Card className="rounded-xl shadow-sm border border-fin-border bg-fin-surface overflow-hidden">
        <div className="px-6 py-3 border-b border-fin-subtle flex justify-between items-center bg-fin-surface">
           <div className="flex items-center gap-2">
              <Filter size={14} className="text-fin-info-text" />
              <h3 className="text-[11px] font-bold text-fin-text-muted uppercase tracking-wider">Panel Kontrol BKU</h3>
           </div>
           <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowFilters(!showFilters)}
                className="h-8 px-3 text-[10px] font-bold text-fin-info-text hover:bg-fin-subtle rounded-lg transition-all flex items-center gap-2"
              >
                {showFilters ? <><X size={14} /> Sembunyikan Filter</> : <><Filter size={14} /> Tampilkan Filter</>}
              </Button>
           </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <div className="p-6 border-b border-[#F8F9FA]">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                  {/* Baris 1: Periode */}
                  <div className="lg:col-span-6 space-y-2">
                    <label className="text-[10px] font-bold text-fin-text-muted uppercase tracking-tight ml-1 flex items-center gap-1.5">
                      <Calendar size={12} className="text-[#2E90FA]" />
                      Rentang Periode Laporan
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <Input type="date" className="h-11 px-4 bg-fin-page border-fin-border rounded-lg text-sm font-medium text-fin-text-primary focus-visible:ring-ds-focus-ring focus-visible:border-ds-focus-ring transition-all" value={filters.startDate} onChange={(e) => setFilters({...filters, startDate: e.target.value, page: 1})} />
                      </div>
                      <span className="text-[#D0D5DD] text-[10px] font-bold">S/D</span>
                      <div className="flex-1">
                        <Input type="date" className="h-11 px-4 bg-fin-page border-fin-border rounded-lg text-sm font-medium text-fin-text-primary focus-visible:ring-ds-focus-ring focus-visible:border-ds-focus-ring transition-all" value={filters.endDate} onChange={(e) => setFilters({...filters, endDate: e.target.value, page: 1})} />
                      </div>
                    </div>
                  </div>

                  {/* Baris 1: Sumber Dana */}
                  <div className="lg:col-span-6 space-y-2">
                    <label className="text-[10px] font-bold text-fin-text-muted uppercase tracking-tight ml-1 flex items-center gap-1.5">
                      <Database size={12} className="text-[#2E90FA]" />
                      Filter Sumber Dana
                    </label>
                    <select
                      value={filters.sumberDana || 'all'}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilters({...filters, sumberDana: v === 'all' ? '' : v, page: 1});
                      }}
                      className="w-full h-11 px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                    >
                      <option value="all">SEMUA SUMBER DANA</option>
                      {sumberDanaList.map((sd: any) => (
                        <option key={sd.id} value={sd.id} className="bg-fin-surface text-fin-text-primary">
                          {sd.nama}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Baris 2: OPD */}
                  <div className="lg:col-span-4 space-y-2">
                    <label className="text-[10px] font-bold text-fin-text-muted uppercase tracking-tight ml-1 flex items-center gap-1.5">
                      <Building2 size={12} className="text-[#2E90FA]" />
                      Cari Nama OPD
                    </label>
                    <Input
                      type="text"
                      placeholder="Contoh: Dinas Kesehatan..."
                      className="h-11 px-4 bg-fin-page border-fin-border rounded-lg text-sm font-medium text-fin-text-primary focus-visible:ring-ds-focus-ring focus-visible:border-ds-focus-ring transition-all"
                      value={filters.opd}
                      onChange={(e) => setFilters({...filters, opd: e.target.value, page: 1})}
                    />
                  </div>

                  {/* Baris 2: Jenis Transaksi */}
                  <div className="lg:col-span-4 space-y-2">
                    <label className="text-[10px] font-bold text-fin-text-muted uppercase tracking-tight ml-1 flex items-center gap-1.5">
                      <Tag size={12} className="text-[#2E90FA]" />
                      Jenis Transaksi
                    </label>
                    <select
                      value={filters.jenisTransaksi || 'all'}
                      onChange={(e) => {
                        const v = e.target.value;
                        setFilters({...filters, jenisTransaksi: v === 'all' ? '' : v, page: 1});
                      }}
                      className="w-full h-11 px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                    >
                      <option value="all">SEMUA JENIS</option>
                      <option value="PENDAPATAN" className="bg-fin-surface text-fin-text-primary">Pendapatan</option>
                      <option value="PENGELUARAN" className="bg-fin-surface text-fin-text-primary">Pengeluaran SP2D</option>
                      <option value="POTONGAN" className="bg-fin-surface text-fin-text-primary">Potongan Pajak</option>
                      <option value="SETORAN" className="bg-fin-surface text-fin-text-primary">Setoran Pajak</option>
                      <option value="PENYESUAIAN" className="bg-fin-surface text-fin-text-primary">Penyesuaian Kas</option>
                    </select>
                  </div>

                  {/* Baris 2: Actions */}
                  <div className="lg:col-span-4 flex items-center gap-2 pt-5">
                    <Button onClick={handleDisplay} className="flex-1 h-11 bg-ds-primary text-white rounded-lg font-bold text-[11px] hover:bg-ds-primary-hover transition-all shadow-lg shadow-[#101828]/10 gap-2 active:scale-95">
                      <RefreshCw size={14} className={cn(isLoading && "animate-spin")} />
                      Tampilkan Data
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        const resetFilters = {
                          startDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
                          endDate: format(new Date(), 'yyyy-MM-dd'),
                          sumberDana: '',
                          opd: '',
                          jenisTransaksi: '',
                          page: 1,
                          limit: 50
                        };
                        setFilters(resetFilters);
                        setQueryParams(resetFilters);
                      }}
                      className="h-11 px-6 bg-fin-page text-fin-text-primary rounded-lg font-bold text-[11px] hover:bg-[#E4E7EB] transition-all active:scale-95"
                    >
                      Reset
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Table Section (Modernized) */}
      <Card className="rounded-xl shadow-sm border border-fin-border overflow-hidden bg-fin-surface">
        <div className="overflow-x-auto min-h-[500px]">
          <Table>
            <TableHeader className="bg-fin-page">
              <TableRow className="border-b border-fin-border hover:bg-transparent">
                <TableHead className="px-4 py-4 text-center w-16 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">No</TableHead>
                <TableHead className="px-4 py-4 w-32 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Tanggal</TableHead>
                <TableHead className="px-4 py-4 w-44 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Referensi</TableHead>
                <TableHead className="px-4 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Uraian Transaksi</TableHead>
                <TableHead className="px-4 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Unit Kerja</TableHead>
                <TableHead className="px-4 py-4 text-right text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Penerimaan</TableHead>
                <TableHead className="px-4 py-4 text-right text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Pengeluaran</TableHead>
                <TableHead className="px-4 py-4 text-right text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Saldo</TableHead>
                <TableHead className="px-4 py-4 text-center text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Audit Rekon</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#E9ECEF]">
              {error ? (
                <tr>
                  <td colSpan={8} className="py-32 text-center">
                    <div className="flex flex-col items-center gap-4">
                      <AlertCircle className="text-fin-expense opacity-20" size={64} />
                      <div>
                        <p className="text-sm font-semibold text-fin-text-primary">Gagal memuat data laporan</p>
                        <p className="text-[10px] text-fin-expense mt-1 font-mono bg-red-50 p-2 rounded border border-red-100 whitespace-pre-wrap max-w-lg overflow-auto">
                          {error.response?.data?.error || error.message}
                          {error.response?.data?.detail && `\n\nDetail: ${error.response?.data?.detail}`}
                        </p>
                      </div>
                      <Button onClick={() => mutate()} className="bg-ds-primary text-white rounded-lg text-xs font-semibold px-8 h-10 hover:bg-slate-800">
                        Coba Lagi
                      </Button>
                    </div>
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={9} className="py-32 text-center text-xs font-medium text-fin-text-muted">
                    <Loader2 className="animate-spin mx-auto mb-4" size={40} />
                    Mengkalkulasi Laporan...
                  </td>
                </tr>
              ) : bkuItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-32 text-center text-xs font-medium text-fin-text-muted">
                    Tidak ada data transaksi pada periode ini.
                  </td>
                </tr>
              ) : (
                bkuItems.map((item: any, index: number) => (
                  <TableRow key={index} className="hover:bg-fin-page transition-colors group">
                    <TableCell className="px-4 py-4 text-center text-xs font-medium text-fin-text-muted">{index + 1}</TableCell>
                    <TableCell className="px-4 py-4 text-xs font-medium text-fin-text-muted">
                      {format(new Date(item.tanggal), 'dd MMM yyyy')}
                    </TableCell>
                    <TableCell className="px-4 py-4">
                        <div className="flex items-center gap-2 group/copy cursor-pointer" onClick={() => {
                          navigator.clipboard.writeText(item.bukti);
                          toast.success('Nomor Bukti Disalin', { description: item.bukti });
                        }}>
                           <Badge variant="outline" className="px-2.5 py-1 bg-fin-page text-fin-text-primary rounded-lg text-[10px] font-medium border-none group-hover/copy:bg-[#EFF8FF] group-hover/copy:text-[#175CD3] transition-colors">
                             {item.bukti}
                           </Badge>
                           <div className="opacity-0 group-hover/copy:opacity-100 transition-all">
                              <Copy size={12} className="text-[#175CD3]" />
                           </div>
                        </div>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                       <p className="text-xs font-semibold text-fin-text-primary leading-tight truncate max-w-[250px] group-hover:text-[#2E90FA] transition-colors">{item.uraian}</p>
                    </TableCell>
                    <TableCell className="px-4 py-4">
                       <p className="text-[10px] font-medium text-fin-text-muted truncate max-w-[150px]">{item.opd}</p>
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right font-semibold text-fin-income text-xs" style={{fontVariantNumeric:'tabular-nums'}}>
                      {item.penerimaan > 0 ? formatCurrency(item.penerimaan) : '-'}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right font-semibold text-fin-expense text-xs" style={{fontVariantNumeric:'tabular-nums'}}>
                      {item.pengeluaran > 0 ? formatCurrency(item.pengeluaran) : '-'}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-right font-bold text-fin-text-primary text-xs transition-colors" style={{fontVariantNumeric:'tabular-nums'}}>
                      {formatCurrency(item.saldo)}
                    </TableCell>
                    <TableCell className="px-4 py-4 text-center">
                        {item.tipe === 'SALDO_AWAL' || item.tipe === 'PENYESUAIAN' ? (
                          <span className="text-[10px] font-medium text-fin-text-muted">-</span>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            {item.status_rekon === 'SUDAH' ? (
                              <Badge variant="outline" className="bg-fin-income/10 text-fin-income border-fin-income/20 text-[9px] px-2 py-0.5 font-bold whitespace-nowrap">TEREKONSILIASI</Badge>
                            ) : item.status_rekon?.includes('!!! HIGH ANOMALI') ? (
                              <Badge variant="outline" className="bg-[#FEF3F2] text-[#B42318] border-[#F04438] text-[9px] px-2 py-0.5 font-black animate-pulse flex items-center gap-1 whitespace-nowrap">
                                <AlertCircle size={10} />
                                {item.status_rekon.replace('!!! ', '')}
                              </Badge>
                            ) : item.status_rekon?.includes('ANOMALI') ? (
                              <Badge variant="outline" className="bg-fin-warning/10 text-fin-warning border-fin-warning/20 text-[9px] px-2 py-0.5 font-bold whitespace-nowrap">
                                ANOMALI AUDIT
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-fin-page text-fin-text-muted border-fin-border text-[9px] px-2 py-0.5 font-medium whitespace-nowrap">OUTSTANDING</Badge>
                            )}
                            {item.keterangan_rekon && (
                              <p className="text-[8px] text-fin-info-text font-bold max-w-[100px] truncate" title={item.keterangan_rekon}>
                                {formatAuditStatus(item.keterangan_rekon, item.status_rekon)}
                              </p>
                            )}
                          </div>
                        )}
                      </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {!isLoading && bkuItems.length > 0 && (
              <TableFooter className="bg-fin-page border-t-2 border-fin-border">
                <TableRow className="hover:bg-transparent font-black">
                  <TableCell colSpan={5} className="px-3 py-5 text-right text-[10px] font-black text-fin-text-primary uppercase tracking-wider">
                    Jumlah Total (Periode Berjalan)
                  </TableCell>
                  <TableCell className="px-2 py-5 text-right text-fin-income text-[10px] font-bold bg-[#12B76A]/5 whitespace-nowrap" style={{fontVariantNumeric:'tabular-nums'}}>
                    {formatCurrency(summary.totalPenerimaan)}
                  </TableCell>
                  <TableCell className="px-2 py-5 text-right text-fin-expense text-[10px] font-bold bg-[#F04438]/5 whitespace-nowrap" style={{fontVariantNumeric:'tabular-nums'}}>
                    {formatCurrency(summary.totalPengeluaran)}
                  </TableCell>
                  <TableCell className="px-2 py-5 text-right text-fin-text-primary text-[11px] font-black bg-ds-primary/10 whitespace-nowrap" style={{fontVariantNumeric:'tabular-nums'}}>
                    {formatCurrency(summary.saldoAkhir)}
                  </TableCell>
                  <TableCell className="bg-fin-page w-10"></TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>

        {/* Pagination Footer (Standardized) */}
        <div className="p-6 bg-fin-page border-fin-subtle flex justify-between items-center">
           <p className="text-xs font-medium text-fin-text-muted">
             Showing {(filters.page - 1) * 5 + 1} - {Math.min(filters.page * 5, pagination.totalData)} of {pagination.totalData} Entries
           </p>
           
           <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                size="icon"
                onClick={() => {
                  const newPage = queryParams.page - 1;
                  setFilters({ ...filters, page: newPage });
                  setQueryParams({ ...queryParams, page: newPage });
                }}
                disabled={queryParams.page === 1}
                className="h-9 w-9 bg-fin-surface border-fin-border rounded-lg text-fin-text-muted disabled:opacity-30 hover:bg-fin-page transition-all"
              >
                <ChevronLeft size={16} />
              </Button>
              
              <div className="flex items-center gap-1.5">
                 {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => (
                   <Button 
                     key={i} 
                     variant={queryParams.page === i + 1 ? "default" : "outline"}
                     onClick={() => {
                       setFilters({ ...filters, page: i + 1 });
                       setQueryParams({ ...queryParams, page: i + 1 });
                     }}
                     className={cn(
                       "w-9 h-9 rounded-lg text-xs font-semibold transition-all",
                       queryParams.page === i + 1 ? "bg-ds-primary text-white shadow-sm" : "bg-fin-surface border-fin-border text-fin-text-muted hover:bg-fin-page"
                     )}
                   >
                     {i + 1}
                   </Button>
                 ))}
              </div>
 
              <Button 
                variant="outline"
                size="icon"
                onClick={() => {
                  const newPage = queryParams.page + 1;
                  setFilters({ ...filters, page: newPage });
                  setQueryParams({ ...queryParams, page: newPage });
                }}
                disabled={queryParams.page === pagination.totalPages}
                className="h-9 w-9 bg-fin-surface border-fin-border rounded-lg text-fin-text-muted disabled:opacity-30 hover:bg-fin-page transition-all"
              >
                <ChevronRight size={16} />
              </Button>
           </div>
        </div>
      </Card>
      <AnimatePresence>
        {previewPdf && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#000000]/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-fin-surface w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col border border-white/20"
            >
               <div className="p-4 bg-fin-surface border-b border-fin-border flex justify-between items-center px-8">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-[#F5F8FF] text-[#2E90FA] rounded-xl flex items-center justify-center border border-[#B2DDFF]">
                       <Eye size={20} />
                    </div>
                    <div>
                       <h3 className="text-sm font-bold text-fin-text-primary">Document Viewer</h3>
                       <p className="text-[11px] text-fin-text-muted">Pratinjau Arsip Digital BKU</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => window.open(previewPdf, '_blank')}
                      className="text-[10px] font-bold h-8 px-4 rounded-lg border-fin-border-strong hover:bg-fin-surface"
                    >
                      Buka di Tab Baru
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setPreviewPdf(null)} className="h-8 w-8 text-fin-text-muted hover:text-fin-expense rounded-lg"><X size={20} /></Button>
                  </div>
               </div>
               <div className="flex-1 w-full bg-slate-100 flex items-center justify-center relative">
                 <iframe 
                    src={`${previewPdf}#toolbar=1&navpanes=0`} 
                    className="w-full h-full border-none"
                    title="PDF Preview"
                 />
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
