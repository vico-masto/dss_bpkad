'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { 
  Book, 
  Printer, 
  FileSpreadsheet, 
  RefreshCw, 
  Database,
  ArrowRight,
  Loader2,
  AlertCircle,
  Download,
  Info,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  X,
  ChevronLeft,
  ChevronRight,
  Search
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { PageHeader } from '@/components/patterns/page-header';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcel, exportToPDF, printPDF } from '@/lib/exportUtils';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

export default function GeneralLedgerPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(20);
  
  const { data: response, error, isLoading, mutate } = useSWR(
    ['/dss/general-ledger', { page: currentPage, limit }],
    ([url, params]) => fetcher(url, params)
  );

  const items = response?.data || [];
  const pagination = response?.pagination || { totalPages: 1, total: 0 };

  const handleExportExcel = async () => {
    const loadToast = toast.loading('Menyiapkan data lengkap untuk ekspor...');
    try {
      // For export, we might want to fetch more or use a dedicated export endpoint
      const res = await api.get('/dss/general-ledger', { params: { limit: 5000, page: 1 } });
      const allItems = res.data.data || [];
      
      const exportData = allItems.map((item: any, index: number) => ({
        'No': index + 1,
        'Tanggal': format(new Date(item.tanggal), 'dd/MM/yyyy'),
        'Kode Akun': item.kode_akun,
        'Nama Akun': item.nama_akun,
        'Debet': item.debet,
        'Kredit': item.kredit,
        'Keterangan': item.keterangan,
        'Ref ID': item.ref_id
      }));
      exportToExcel(exportData, `Buku_Besar_${format(new Date(), 'yyyyMMdd')}`);
      toast.dismiss(loadToast);
    } catch (err) {
      toast.error('Gagal mengekspor data');
      toast.dismiss(loadToast);
    }
  };

  const handlePrintPDF = () => {
    if (items.length === 0) return;
    const headers = ['No.', 'Tgl', 'Akun', 'Nama Akun', 'Debet', 'Kredit', 'Keterangan'];
    const body = items.map((item: any, i: number) => [
      (currentPage - 1) * limit + i + 1,
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.kode_akun,
      item.nama_akun,
      formatCurrency(item.debet),
      formatCurrency(item.kredit),
      item.keterangan.substring(0, 30)
    ]);

    const totalDebet = items.reduce((acc: number, curr: any) => acc + (parseFloat(curr.debet) || 0), 0);
    const totalKredit = items.reduce((acc: number, curr: any) => acc + (parseFloat(curr.kredit) || 0), 0);
    const foot = [['', '', '', 'TOTAL HALAMAN', formatCurrency(totalDebet), formatCurrency(totalKredit), '']];

    printPDF(headers, body, 'BUKU BESAR / JURNAL UMUM', foot);
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700 pb-20">
      {/* PAGE HEADER */}
      <PageHeader
        title="Jurnal Umum & Buku Besar"
        description="Sistem Pencatatan Akuntansi Terpadu (Double-Entry)"
        icon={<Book className="size-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => mutate()} className="h-10 px-4 bg-fin-surface border-fin-border rounded-xl flex items-center gap-2">
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /><span>Refresh</span>
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-10 px-4 bg-fin-surface border-fin-border rounded-xl flex items-center gap-2">
              <Download size={14} /><span>Export Excel</span>
            </Button>
            <Button onClick={handlePrintPDF} className="h-10 px-6 bg-fin-text-primary text-fin-surface rounded-xl text-xs font-semibold hover:opacity-90 flex items-center gap-2">
              <Printer size={14} /><span>Cetak Halaman</span>
            </Button>
          </div>
        }
      />

      {/* TABLE SECTION */}
      <Card className="rounded-xl border border-fin-border overflow-hidden bg-fin-surface shadow-sm">
        <div className="overflow-x-auto min-h-[500px]">
          <Table>
            <TableHeader className="bg-fin-page">
              <TableRow className="border-b border-fin-border hover:bg-transparent">
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-muted uppercase tracking-widest w-16 text-center">No</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-muted uppercase tracking-widest w-32">Tanggal</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-muted uppercase tracking-widest w-40">Kode Akun</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Nama Akun</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right w-40">Debet (Rp)</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-muted uppercase tracking-widest text-right w-40">Kredit (Rp)</TableHead>
                <TableHead className="px-6 py-5 text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Keterangan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-fin-border">
              {error ? (
                <TableRow><TableCell colSpan={7} className="py-40 text-center text-fin-expense text-sm font-medium">Gagal memuat buku besar sistem</TableCell></TableRow>
              ) : isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7} className="px-6 py-4"><div className="h-12 bg-fin-page animate-pulse rounded-xl" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-40 text-center text-fin-text-muted text-[10px] font-black uppercase tracking-[0.2em]">Belum ada jurnal transaksi tercatat</TableCell></TableRow>
              ) : (
                items.map((item: any, index: number) => (
                  <TableRow key={index} className="hover:bg-fin-page transition-colors group">
                    <TableCell className="px-6 py-4 text-center text-[10px] font-bold text-fin-text-muted">{(currentPage - 1) * limit + index + 1}</TableCell>
                    <TableCell className="px-6 py-4 text-[11px] font-bold text-fin-text-muted">{format(new Date(item.tanggal), 'dd/MM/yy')}</TableCell>
                    <TableCell className="px-6 py-4">
                       <span className="font-mono text-[9px] text-fin-info-text font-black bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-lg">
                         {item.kode_akun}
                       </span>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                       <p className="text-[11px] font-black text-fin-text-primary uppercase">{item.nama_akun}</p>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right text-[11px] font-black text-fin-income tabular-nums">
                      {item.debet > 0 ? formatCurrency(item.debet) : '-'}
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right text-[11px] font-black text-fin-expense tabular-nums">
                      {item.kredit > 0 ? formatCurrency(item.kredit) : '-'}
                    </TableCell>
                    <TableCell className="px-6 py-4">
                       <div className="space-y-1">
                          <p className="text-[11px] font-medium text-fin-text-muted leading-tight">{item.keterangan}</p>
                          <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">{item.ref_id}</p>
                       </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* PAGINATION FOOTER */}
        <div className="px-8 py-5 bg-fin-page border-fin-border flex items-center justify-between">
            <div className="text-[10px] font-black text-fin-text-muted uppercase tracking-[0.2em]">
               Halaman {currentPage} dari {pagination.totalPages} <span className="mx-2 opacity-30">|</span> Total {pagination.total} Entri Jurnal
            </div>
            <div className="flex items-center gap-3">
               <Button 
                 variant="outline" 
                 size="sm" 
                 disabled={currentPage === 1 || isLoading}
                 onClick={() => setCurrentPage(prev => prev - 1)}
                 className="h-10 px-5 text-[10px] font-black uppercase tracking-widest border-fin-border text-fin-text-muted bg-fin-surface rounded-xl hover:bg-fin-page disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
               >
                  <ChevronLeft size={16} /> Previous
               </Button>
               <Button 
                 variant="outline" 
                 size="sm" 
                 disabled={currentPage === pagination.totalPages || isLoading}
                 onClick={() => setCurrentPage(prev => prev + 1)}
                 className="h-10 px-5 text-[10px] font-black uppercase tracking-widest border-fin-border text-fin-text-muted bg-fin-surface rounded-xl hover:bg-fin-page disabled:opacity-50 transition-all shadow-sm flex items-center gap-2"
               >
                  Next <ChevronRight size={16} />
               </Button>
            </div>
        </div>
      </Card>
      
      {/* DISCLAIMER / INFO */}
      <Card className="bg-fin-page border border-fin-border p-6 rounded-xl flex gap-6 shadow-sm">
         <div className="w-12 h-12 bg-fin-surface rounded-xl border border-fin-border flex items-center justify-center text-fin-info-text shadow-sm flex-shrink-0">
            <Info size={22} />
         </div>
         <div className="space-y-1">
            <h4 className="text-sm font-black text-fin-text-primary uppercase tracking-tight">Catatan Sistem Akuntansi Terpadu</h4>
            <p className="text-[11px] font-medium text-fin-text-muted leading-relaxed">
              Jurnal ini dihasilkan secara otomatis oleh <strong className="text-fin-text-primary">DSS Accounting Engine</strong> berdasarkan transaksi SP2D dan Penerimaan Kas. 
              Sistem menggunakan prinsip Double-Entry Bookkeeping untuk memastikan keseimbangan antara Debet dan Kredit sesuai dengan Bagan Akun Standar Nasional.
              Data ditampilkan secara terpaginasi untuk memastikan performa sistem tetap optimal.
            </p>
         </div>
      </Card>
    </div>
  );
}
