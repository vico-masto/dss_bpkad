'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { 
  FileText, 
  Search, 
  Filter, 
  Download, 
  Eye, 
  Loader2, 
  RefreshCw,
  Calendar,
  Banknote,
  Building2,
  FileSignature,
  ArrowRight,
  Edit,
  Trash2,
  X,
  ArrowDownLeft,
  ChevronLeft,
  ChevronRight,
  Printer,
  Copy,
  LayoutTemplate
} from 'lucide-react';
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell 
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF, printPDF, previewPDF } from '@/lib/exportUtils';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

export default function Sp2dArchivePage() {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(15);
  const [filters, setFilters] = useState({
    opd: '',
    tahun: new Date().getFullYear(),
    search: ''
  });
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);

  // Re-fetch when filters or page changes
  const { data: response, isLoading, mutate } = useSWR(
    ['/sp2d', { ...filters, page: currentPage, limit }],
    ([url, params]) => fetcher(url, params)
  );

  const data = response?.data || [];
  const pagination = response?.pagination || { totalPages: 1, totalData: 0 };
  const summary = {
    totalBruto: response?.totalBruto || 0,
    totalNeto: data.reduce((acc: number, curr: any) => acc + (curr.nilai_neto || 0), 0), // Ideally from backend if available for full dataset
    totalCount: response?.total || 0
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  const handleEdit = (id: string) => {
    router.push(`/dashboard/sp2d/create?edit=${id}`);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus data ini?')) return;
    try {
      await api.delete(`/sp2d/${id}`);
      toast.success('Data berhasil dihapus');
      mutate();
    } catch (err) {
      toast.error('Gagal menghapus data');
    }
  };

  const handleExportExcel = async () => {
    const loadToast = toast.loading('Menyiapkan data excel...');
    try {
      // Fetch all if needed or just current view
      const res = await api.get('/sp2d', { params: { ...filters, limit: 1000 } });
      const allData = res.data.data || [];
      const exportData = allData.map((item: any) => ({
        'Tanggal': format(new Date(item.tanggal), 'yyyy-MM-dd'),
        'Nomor': item.nomor,
        'OPD': item.opd,
        'Penerima': item.penerima,
        'Uraian': item.uraian,
        'Bruto': item.nilai_bruto,
        'Neto': item.nilai_neto,
        'Sumber Dana': item.sumber_dana
      }));
      exportToExcel(exportData, `Arsip_SP2D_${format(new Date(), 'yyyyMMdd_HHmm')}`);
      toast.dismiss(loadToast);
    } catch (err) {
      toast.error('Gagal mengekspor data');
      toast.dismiss(loadToast);
    }
  };

  const handleExportPDF = () => {
    const headers = ['No.', 'Tgl', 'Nomor', 'OPD', 'Bruto', 'Neto'];
    const body = data.map((item: any, i: number) => [
      (currentPage - 1) * limit + i + 1,
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.nomor,
      item.opd,
      formatCurrency(item.nilai_bruto),
      formatCurrency(item.nilai_neto)
    ]);
    exportToPDF(headers, body, `Arsip_SP2D_${format(new Date(), 'yyyyMMdd_HHmm')}`, 'LAPORAN ARSIP PENGELUARAN');
  };

  return (
    <div className="max-w-[1450px] mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-ds-primary rounded-xl flex items-center justify-center text-white shadow-2xl shadow-gray-200 ring-4 ring-gray-50">
            <FileText size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-black text-fin-text-primary tracking-tight leading-none uppercase">Arsip Pengeluaran</h1>
            <p className="text-fin-text-secondary font-bold mt-1.5 text-[11px] uppercase tracking-widest">SP2D Transaction Registry & Document Archive</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl shadow-sm border border-[#EAECF0]">
          <div className="flex items-center px-4 py-2 bg-[#F9FAFB] rounded-xl border border-[#EAECF0] group focus-within:bg-white focus-within:ring-4 focus-within:ring-indigo-600/5 focus-within:border-ds-focus-ring transition-all shadow-inner">
            <Search size={18} className="text-fin-text-muted mr-3" />
            <input 
              type="text" 
              placeholder="Cari No SP2D / Uraian..." 
              className="bg-transparent outline-none text-[11px] font-bold text-fin-text-primary w-48 placeholder:text-fin-text-muted" 
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
          </div>
          
          <select 
            className="bg-[#F9FAFB] px-6 py-2.5 rounded-xl border border-[#EAECF0] text-[11px] font-black text-fin-text-primary outline-none focus:ring-4 focus:ring-ds-focus-ring/5 focus:border-ds-focus-ring transition-all appearance-none cursor-pointer uppercase tracking-widest shadow-inner"
            value={filters.tahun}
            onChange={(e) => setFilters({...filters, tahun: Number(e.target.value)})}
          >
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>TA {y}</option>)}
          </select>

          <Button variant="ghost" size="icon" onClick={() => mutate()} className="h-10 w-10 text-fin-text-muted hover:text-fin-text-primary transition-colors rounded-xl">
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
          </Button>

          <button onClick={handleExportExcel} className="flex items-center space-x-2 px-6 py-2.5 bg-ds-primary text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-[#1d2939] transition-all shadow-xl shadow-gray-200 active:scale-95 group">
            <Download size={16} className="group-hover:-translate-y-0.5 transition-transform" />
            <span>Export Excel</span>
          </button>
        </div>
      </div>

      {/* Stats Summary (Standardized) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryItem 
          label="Total Bruto (Filter)" 
          value={summary.totalBruto} 
          color="text-fin-text-primary" 
          bg="bg-white"
          icon={<Banknote size={18} className="text-fin-info-text" />} 
        />
        <SummaryItem 
          label="Jumlah Dokumen" 
          value={summary.totalCount} 
          color="text-fin-text-primary" 
          bg="bg-white"
          icon={<FileText size={18} className="text-[#2E90FA]" />} 
          isCurrency={false}
        />
        <SummaryItem 
          label="Tahun Anggaran" 
          value={filters.tahun} 
          color="text-fin-text-primary" 
          bg="bg-white"
          icon={<Calendar size={18} className="text-[#12B76A]" />} 
          isCurrency={false}
        />
      </div>

      <Card className="rounded-xl border border-[#EAECF0] overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#F9FAFB]">
              <TableRow className="border-b border-[#EAECF0] hover:bg-transparent">
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-secondary uppercase tracking-[0.15em]">Dokumen SP2D</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-secondary uppercase tracking-[0.15em]">Organisasi (OPD)</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-secondary uppercase tracking-[0.15em]">Penerima & Uraian</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-secondary uppercase tracking-[0.15em] text-right">Nilai Bruto</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-secondary uppercase tracking-[0.15em] text-center">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#EAECF0]">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={5} className="px-6 py-4"><div className="h-10 bg-gray-50 animate-pulse rounded-lg" /></TableCell>
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="px-10 py-40 text-center">
                      <div className="flex flex-col items-center">
                        <div className="w-20 h-20 bg-[#F9FAFB] rounded-full flex items-center justify-center mb-6">
                           <FileSignature size={40} className="text-[#EAECF0]" />
                        </div>
                        <p className="text-fin-text-muted font-black text-xs uppercase tracking-widest">Belum ada dokumen yang ditemukan</p>
                      </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item: any, idx: number) => (
                  <TableRow key={item.id || idx} className="hover:bg-[#F9FAFB] transition-colors group">
                    <TableCell className="px-6 py-5">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1.5">
                           <p className="text-sm font-black text-fin-text-primary tracking-tight">{item.nomor}</p>
                           <Badge variant="outline" className="text-[9px] h-4 px-1.5 font-black uppercase border-[#EAECF0] text-[#667085] bg-white">
                              {item.jenis || 'SP2D'}
                           </Badge>
                        </div>
                        <p className="text-[10px] font-bold text-[#667085] flex items-center">
                           <Calendar size={12} className="mr-1.5 text-fin-text-muted" />
                           {format(new Date(item.tanggal), 'dd MMM yyyy')}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-5">
                        <div className="flex items-center gap-3">
                           <div className="w-9 h-9 rounded-xl bg-white border border-[#EAECF0] flex items-center justify-center text-fin-text-muted group-hover:border-indigo-200 group-hover:text-fin-info-text transition-all shadow-sm">
                              <Building2 size={16} />
                           </div>
                           <p className="text-[11px] font-black text-fin-text-primary tracking-tight max-w-[180px] truncate uppercase">{item.opd}</p>
                        </div>
                    </TableCell>
                    <TableCell className="px-6 py-5">
                      <p className="text-[11px] font-black text-fin-text-primary tracking-tight mb-1 uppercase">{item.penerima}</p>
                      <p className="text-[11px] font-medium text-fin-text-secondary leading-relaxed max-w-[350px] truncate">{item.uraian}</p>
                    </TableCell>
                    <TableCell className="px-6 py-5 text-right">
                       <div className="flex flex-col items-end">
                          <p className="text-sm font-black text-fin-text-primary tabular-nums">{formatCurrency(item.nilai_bruto)}</p>
                          <p className="text-[10px] font-bold text-[#667085] tabular-nums">Netto: {formatCurrency(item.nilai_neto)}</p>
                       </div>
                    </TableCell>
                    <TableCell className="px-6 py-5 text-center">
                       <div className="flex items-center justify-center gap-2">
                         <TooltipProvider>
                           <Tooltip>
                             <TooltipTrigger asChild>
                               <button onClick={() => handleEdit(item.id)} className="w-9 h-9 rounded-xl bg-white border border-[#EAECF0] text-fin-text-secondary hover:text-fin-info-text hover:border-indigo-200 transition-all flex items-center justify-center shadow-sm">
                                  <Edit size={16} />
                               </button>
                             </TooltipTrigger>
                             <TooltipContent className="text-[10px] font-black uppercase tracking-widest">Koreksi Data</TooltipContent>
                           </Tooltip>
                         </TooltipProvider>

                         {item.file_url && (
                           <button onClick={() => setPreviewPdf(item.file_url)} className="w-9 h-9 rounded-xl bg-indigo-50 text-fin-info-text hover:bg-ds-primary hover:text-white transition-all flex items-center justify-center shadow-sm">
                              <Eye size={16} />
                           </button>
                         )}
                         
                         <button onClick={() => handleDelete(item.id)} className="w-9 h-9 rounded-xl bg-white border border-[#EAECF0] text-fin-text-muted hover:text-[#F04438] hover:border-[#F04438] transition-all flex items-center justify-center shadow-sm opacity-50 hover:opacity-100">
                            <Trash2 size={16} />
                         </button>
                       </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* PAGINATION UI */}
        <div className="px-6 py-5 bg-[#F9FAFB] border-t border-[#EAECF0] flex items-center justify-between">
           <div className="text-[10px] font-black text-[#667085] uppercase tracking-[0.2em]">
              Halaman {currentPage} dari {pagination.totalPages} <span className="mx-2 text-[#D0D5DD]">|</span> Total {pagination.totalData} Dokumen
           </div>
           <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === 1 || isLoading}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="h-9 px-4 text-[10px] font-black uppercase tracking-widest border-[#EAECF0] text-fin-text-secondary bg-white rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
              >
                 <ChevronLeft size={14} /> Prev
              </Button>
              <div className="flex items-center gap-1">
                 {/* Quick page jumper logic could go here */}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === pagination.totalPages || isLoading}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="h-9 px-4 text-[10px] font-black uppercase tracking-widest border-[#EAECF0] text-fin-text-secondary bg-white rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
              >
                 Next <ChevronRight size={14} />
              </Button>
           </div>
        </div>
      </Card>

      <AnimatePresence>
        {previewPdf && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white w-full max-w-6xl h-[90vh] rounded-[40px] shadow-2xl overflow-hidden flex flex-col">
               <div className="h-16 border-b border-slate-100 flex items-center justify-between px-10">
                   <div className="flex items-center gap-3">
                    <FileText size={18} className="text-fin-info-text" />
                    <h3 className="text-sm font-bold text-slate-900">Pratinjau Laporan (PDF)</h3>
                  </div>
                  <button onClick={() => setPreviewPdf(null)} className="p-2 hover:bg-slate-100 rounded-xl transition-all"><X size={20} /></button>
               </div>
               <iframe src={previewPdf} className="flex-1 w-full" />
               <div className="p-6 border-t border-slate-100 flex justify-end gap-3">
                  <Button onClick={() => window.open(previewPdf)} className="h-11 px-8 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-ds-primary/10">Buka di Tab Baru</Button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SummaryItem({ label, value, color, icon, bg, isCurrency = true }: any) {
  return (
    <Card className="p-6 rounded-xl border border-[#EAECF0] shadow-sm bg-white transition-all hover:border-indigo-500 overflow-hidden group">
      <div className="flex items-center gap-5">
        <div className={cn("w-14 h-14 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", bg, "border border-[#EAECF0]")}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-[0.2em] mb-1 truncate">{label}</p>
          <p className={cn("text-2xl font-black tracking-tight tabular-nums truncate", color)} title={isCurrency ? formatCurrency(value) : value}>
            {isCurrency ? formatCurrency(value) : value}
          </p>
        </div>
      </div>
    </Card>
  );
}

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
function Tooltip({ children }: { children: React.ReactNode }) {
  return <div className="relative group/tooltip">{children}</div>;
}
function TooltipTrigger({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) {
  return <>{children}</>;
}
function TooltipContent({ children, className, side = 'top' }: { children: React.ReactNode, className?: string, side?: string }) {
  return (
    <div className={cn(
      "absolute invisible group-hover/tooltip:visible opacity-0 group-hover/tooltip:opacity-100 z-50 bg-ds-primary text-white px-3 py-1.5 rounded-lg text-xs transition-all",
      side === 'top' && "bottom-full left-1/2 -translate-x-1/2 mb-2",
      className
    )}>
      {children}
      <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-[#101828]" />
    </div>
  );
}
