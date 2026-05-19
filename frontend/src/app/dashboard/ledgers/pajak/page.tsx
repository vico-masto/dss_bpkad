'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { 
  Filter, 
  Printer, 
  FileSpreadsheet, 
  RefreshCw, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Calendar,
  Loader2,
  AlertCircle,
  ChevronDown,
  X,
  Scale,
  ShieldAlert,
  Download
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcel, exportToPDF, printPDF, previewPDF } from '@/lib/exportUtils';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from 'sonner';

const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

export default function TaxLedgerPage() {
  const [filters, setFilters] = useState({
    startDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd')
  });
  const [showFilters, setShowFilters] = useState(true);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [queryParams, setQueryParams] = useState(filters);

  const { data, error, isLoading, mutate } = useSWR(
    ['/reports/tax-monitoring', queryParams],
    ([url, params]) => fetcher(url, params)
  );

  const handleDisplay = () => {
    setQueryParams(filters);
    mutate();
  };

  const handleExportExcel = () => {
    const items = data?.data || [];
    if (items.length === 0) return;
    const exportData = items.map((item: any, index: number) => ({
      'No': index + 1,
      'Tanggal': format(new Date(item.tanggal), 'dd/MM/yyyy'),
      'No. Bukti': item.bukti,
      'Uraian/Keterangan': item.keterangan,
      'Tipe': item.tipe === 'COLLECTED' ? 'Pungut' : 'Setor',
      'Nilai (Rp)': item.nilai,
      'Saldo Kewajiban (Rp)': item.saldo
    }));
    exportToExcel(exportData, `Buku_Pembantu_Pajak_${queryParams.startDate}`);
  };

  const handlePreviewReport = async () => {
    const items = data?.data || [];
    if (items.length === 0) {
      toast.error('Tidak ada data untuk dicetak');
      return;
    }

    const headers = ['No.', 'Tanggal', 'No. Bukti', 'Keterangan', 'Tipe', 'Nilai (Rp)', 'Saldo (Rp)'];
    const body = items.map((item: any, index: number) => [
      index + 1,
      format(new Date(item.tanggal), 'dd/MM/yyyy'),
      item.bukti,
      item.keterangan,
      item.tipe === 'COLLECTED' ? 'PUNGUT' : 'SETOR',
      formatCurrency(item.nilai),
      formatCurrency(item.saldo)
    ]);

    const foot = [['', '', '', '', '', 'OUTSTANDING', formatCurrency(data.summary.outstandingTax)]];
    const url = previewPDF(headers, body, `BUKU PEMBANTU PAJAK (${queryParams.startDate} - ${queryParams.endDate})`, foot);
    setPreviewPdf(url);
  };

  return (
    <div className="flex flex-col space-y-6 p-6 min-h-screen bg-fin-page">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-fin-text-primary tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-fin-expense rounded-xl flex items-center justify-center shadow-lg shadow-fin-expense/20">
               <Scale className="text-white" size={24} />
            </div>
            BUKU PEMBANTU PAJAK
          </h1>
          <p className="text-sm text-fin-text-muted mt-1 font-medium">Monitoring Pemungutan dan Penyetoran Pajak Negara</p>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowFilters(!showFilters)}
            className={cn("h-10 border-fin-border", showFilters && "bg-fin-page")}
          >
            <Filter size={16} className="mr-2" />
            Filter
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="h-10 border-fin-border">
            <FileSpreadsheet size={16} className="mr-2" />
            Excel
          </Button>
          <Button onClick={handlePreviewReport} className="h-10 bg-fin-text-primary text-fin-surface font-bold">
            <Printer size={16} className="mr-2" />
            Cetak Laporan
          </Button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <Card className="border-fin-border shadow-sm bg-fin-surface mb-6">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tanggal Mulai</label>
                    <Input type="date" value={filters.startDate} onChange={(e) => setFilters({ ...filters, startDate: e.target.value })} className="h-10 border-fin-border" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tanggal Akhir</label>
                    <Input type="date" value={filters.endDate} onChange={(e) => setFilters({ ...filters, endDate: e.target.value })} className="h-10 border-fin-border" />
                  </div>
                  <Button onClick={handleDisplay} className="h-10 bg-fin-expense hover:opacity-90 text-fin-surface font-bold">
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
        <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden relative group">
           <div className="absolute top-0 right-0 p-6 opacity-5 -mr-4 -mt-4 rotate-12 group-hover:scale-110 transition-transform">
              <ArrowUpRight size={80} />
           </div>
           <CardContent className="p-6">
              <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Total Pajak Dipungut</p>
              <h3 className="text-2xl font-black text-fin-text-primary tabular-nums">
                {isLoading ? '...' : formatCurrency(data?.summary?.totalCollected || 0)}
              </h3>
           </CardContent>
        </Card>
        <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden relative group">
           <div className="absolute top-0 right-0 p-6 opacity-5 -mr-4 -mt-4 -rotate-12 group-hover:scale-110 transition-transform">
              <ArrowDownLeft size={80} />
           </div>
           <CardContent className="p-6">
              <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Total Pajak Disetor</p>
              <h3 className="text-2xl font-black text-fin-income tabular-nums">
                {isLoading ? '...' : formatCurrency(data?.summary?.totalRemitted || 0)}
              </h3>
           </CardContent>
        </Card>
        <Card className="border-fin-expense/20 shadow-sm bg-fin-expense/10 overflow-hidden relative group">
           <div className="absolute top-0 right-0 p-6 opacity-10 -mr-4 -mt-4 group-hover:scale-110 transition-transform">
              <ShieldAlert size={80} className="text-fin-expense" />
           </div>
           <CardContent className="p-6">
              <p className="text-[10px] font-black text-fin-expense uppercase tracking-widest mb-1">Hutang Pajak (Outstanding)</p>
              <h3 className="text-2xl font-black text-fin-expense tabular-nums">
                {isLoading ? '...' : formatCurrency(data?.summary?.outstandingTax || 0)}
              </h3>
           </CardContent>
        </Card>
      </div>

      {/* DATA TABLE */}
      <Card className="border-fin-border shadow-xl shadow-sm bg-fin-surface overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-fin-page/50">
                <TableRow className="border-b border-fin-border">
                  <TableHead className="w-[60px] text-[10px] font-black text-fin-text-muted uppercase text-center py-4">No</TableHead>
                  <TableHead className="w-[120px] text-[10px] font-black text-fin-text-muted uppercase py-4 text-center">Tanggal</TableHead>
                  <TableHead className="w-[180px] text-[10px] font-black text-fin-text-muted uppercase py-4">No. Bukti</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4">Keterangan Transaksi</TableHead>
                  <TableHead className="w-[100px] text-[10px] font-black text-fin-text-muted uppercase py-4 text-center">Tipe</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-right">Nilai (Rp)</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-right pr-6">Saldo Kewajiban</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="animate-spin text-fin-expense" size={32} />
                        <p className="text-sm font-bold text-fin-text-muted">Memproses Data Pajak...</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : data?.data?.length > 0 ? (
                  data.data.map((item: any, i: number) => (
                    <motion.tr 
                      key={i} 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      transition={{ delay: i * 0.01 }} 
                      className={cn(
                        "group border-b border-fin-border hover:bg-fin-page",
                        item.tipe === 'SALDO_AWAL' && "bg-slate-50/80 font-bold"
                      )}
                    >
                      <TableCell className="text-center font-bold text-fin-text-muted text-[11px] py-4">{i + 1}</TableCell>
                      <TableCell className="text-center text-[11px] font-bold text-fin-text-muted">
                        {format(new Date(item.tanggal), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-1 bg-fin-page text-fin-text-primary text-[10px] font-black rounded-md tracking-wider">
                          {item.bukti}
                        </span>
                      </TableCell>
                      <TableCell>
                         <span className="text-xs font-bold text-fin-text-primary leading-tight uppercase">{item.keterangan}</span>
                      </TableCell>
                      <TableCell className="text-center">
                         {item.tipe === 'SALDO_AWAL' ? (
                           <Badge className="text-[8px] font-black border-none bg-fin-page text-fin-text-primary">AWAL</Badge>
                         ) : (
                           <Badge className={cn(
                             "text-[8px] font-black border-none",
                             item.tipe === 'COLLECTED' ? "bg-fin-warning/10 text-fin-warning" : "bg-fin-income/10 text-fin-income"
                           )}>
                              {item.tipe === 'COLLECTED' ? 'PUNGUT' : 'SETOR'}
                           </Badge>
                         )}
                      </TableCell>
                      <TableCell className={cn(
                        "text-right font-black tabular-nums text-xs",
                        item.tipe === 'SALDO_AWAL' ? "text-fin-text-primary" :
                        item.tipe === 'COLLECTED' ? "text-fin-warning" : "text-fin-income"
                      )}>
                        {item.nilai > 0 ? formatCurrency(item.nilai) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-black text-fin-expense tabular-nums text-xs pr-6">
                        {formatCurrency(item.saldo)}
                      </TableCell>
                    </motion.tr>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                       <div className="flex flex-col items-center gap-2">
                          <AlertCircle className="text-slate-200" size={48} />
                          <p className="text-sm font-bold text-fin-text-muted italic">Tidak ada transaksi pajak pada periode ini.</p>
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-fin-surface rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-fin-border flex items-center justify-between">
              <h3 className="font-black text-fin-text-primary text-sm uppercase">Pratinjau Buku Pembantu Pajak</h3>
              <Button variant="ghost" onClick={() => setPreviewPdf(null)}><X size={18} /></Button>
            </div>
            <iframe src={previewPdf} className="flex-1 w-full" />
            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <Button onClick={() => setPreviewPdf(null)} className="bg-fin-text-primary text-fin-surface font-bold">Tutup</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
