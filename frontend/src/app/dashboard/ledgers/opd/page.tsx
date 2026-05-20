'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { 
  Filter, 
  Printer, 
  FileSpreadsheet, 
  RefreshCw, 
  Building2,
  Calendar,
  Loader2,
  AlertCircle,
  X,
  TrendingUp,
  PieChart,
  LayoutGrid,
  ChevronDown
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
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

export default function OpdLedgerPage() {
  const [filters, setFilters] = useState({
    opd: '',
    tahun: new Date().getFullYear().toString()
  });
  const [showFilters, setShowFilters] = useState(true);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [queryParams, setQueryParams] = useState(filters);
  const [opdList, setOpdList] = useState<string[]>([]);

  const { data, error, isLoading, mutate } = useSWR(
    queryParams.opd ? ['/reports/opd-ledger', queryParams] : null,
    ([url, params]) => fetcher(url, params)
  );

  useEffect(() => {
    fetchOpdList();
  }, []);

  const fetchOpdList = async () => {
    try {
      const res = await api.get('/reference/opd-list');
      setOpdList(res.data);
      if (res.data.length > 0 && !filters.opd) {
        setFilters(prev => ({ ...prev, opd: res.data[0] }));
        setQueryParams(prev => ({ ...prev, opd: res.data[0] }));
      }
    } catch (err) {}
  };

  const handleDisplay = () => {
    if (!filters.opd) {
      toast.error('Silakan pilih OPD terlebih dahulu');
      return;
    }
    setQueryParams(filters);
    mutate();
  };

  const handleExportExcel = () => {
    const items = data?.data || [];
    if (items.length === 0) return;
    const exportData = items.map((item: any, index: number) => ({
      'No': index + 1,
      'Tanggal': new Date(item.tanggal).toLocaleDateString('id-ID'),
      'No. Bukti': item.bukti,
      'Uraian': item.uraian,
      'Jenis Belanja': item.jenis,
      'Nilai Bruto (Rp)': item.nilai_bruto,
      'Realisasi Kumulatif': item.realisasi_kumulatif,
      'Sisa Pagu': item.sisa_pagu,
      'Audit Rekon': item.keterangan_rekon || item.status_rekon || '-'
    }));
    exportToExcel(exportData, `Buku_Pembantu_OPD_${queryParams.opd}`);
  };

  const handlePreviewReport = async () => {
    const items = data?.data || [];
    if (items.length === 0) {
      toast.error('Tidak ada data untuk dicetak');
      return;
    }

    const headers = ['No.', 'Tanggal', 'No. Bukti', 'Uraian/Keterangan', 'Bruto (Rp)', 'Realisasi Kumulatif', 'Sisa Pagu (Rp)', 'Audit Rekon'];
    const body = items.map((item: any, index: number) => [
      index + 1,
      new Date(item.tanggal).toLocaleDateString('id-ID'),
      item.bukti,
      item.uraian,
      formatCurrency(item.nilai_bruto),
      formatCurrency(item.realisasi_kumulatif),
      formatCurrency(item.sisa_pagu),
      item.keterangan_rekon || item.status_rekon || '-'
    ]);

    const foot = [['', '', '', 'TOTAL REALISASI', formatCurrency(data.summary.totalRealisasi), 'SISA PAGU', formatCurrency(data.summary.sisaPagu), '']];
    const url = previewPDF(headers, body, `BUKU PEMBANTU OPD: ${queryParams.opd} (TA ${queryParams.tahun})`, foot);
    setPreviewPdf(url);
  };

  return (
    <div className="flex flex-col space-y-6 p-6 min-h-screen bg-fin-page">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-fin-text-primary tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-ds-primary rounded-xl flex items-center justify-center shadow-lg">
               <Building2 className="text-white" size={24} />
            </div>
            BUKU PEMBANTU OPD
          </h1>
          <p className="text-sm text-fin-text-muted mt-1 font-medium">Monitoring Realisasi Anggaran dan Sisa Pagu per Unit Kerja</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="h-10 border-fin-border">
            <Filter size={16} className="mr-2" />
            Filter
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="h-10 border-fin-border">
            <FileSpreadsheet size={16} className="mr-2" />
            Excel
          </Button>
          <Button variant="primary" onClick={handlePreviewReport} className="h-10">
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
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Pilih Unit Kerja (OPD)</label>
                    <select 
                      className="w-full h-10 px-3 rounded-lg border border-fin-border bg-fin-page text-fin-text-primary text-sm focus:ring-2 focus:ring-ds-focus-ring focus:outline-none"
                      value={filters.opd}
                      onChange={(e) => setFilters({ ...filters, opd: e.target.value })}
                    >
                      <option value="">-- Pilih OPD --</option>
                      {opdList.map((opd, i) => (
                        <option key={i} value={opd}>{opd}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tahun Anggaran</label>
                    <Input type="number" value={filters.tahun} onChange={(e) => setFilters({ ...filters, tahun: e.target.value })} className="h-10 border-fin-border" />
                  </div>
                  <Button onClick={handleDisplay} className="h-10 bg-fin-text-primary hover:opacity-90 text-fin-surface font-bold">
                    <RefreshCw size={16} className="mr-2" />
                    Tampilkan Rincian
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
           <CardContent className="p-6">
              <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Pagu Anggaran OPD</p>
              <h3 className="text-2xl font-black text-fin-text-primary tabular-nums">
                {isLoading ? '...' : formatCurrency(data?.summary?.totalPagu || 0)}
              </h3>
           </CardContent>
        </Card>
        <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden relative group">
           <CardContent className="p-6">
              <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Total Realisasi (Bruto)</p>
              <h3 className="text-2xl font-black text-fin-info tabular-nums">
                {isLoading ? '...' : formatCurrency(data?.summary?.totalRealisasi || 0)}
              </h3>
              <div className="mt-2 flex items-center gap-2">
                 <div className="flex-1 h-1 bg-fin-subtle rounded-full overflow-hidden">
                    <div className="h-full bg-fin-info" style={{ width: `${Math.min(100, data?.summary?.persentase || 0)}%` }} />
                 </div>
                 <span className="text-[10px] font-black text-fin-info">{data?.summary?.persentase?.toFixed(1)}%</span>
              </div>
           </CardContent>
        </Card>
        <Card className="border-fin-income/20 shadow-sm bg-fin-income-bg overflow-hidden relative group">
           <CardContent className="p-5">
              <p className="text-[10px] font-black text-fin-income uppercase tracking-widest mb-1">Sisa Pagu Anggaran</p>
              <h3 className="text-2xl font-black text-fin-income tabular-nums">
                {isLoading ? '...' : formatCurrency(data?.summary?.sisaPagu || 0)}
              </h3>
           </CardContent>
        </Card>
      </div>

      {/* DATA TABLE */}
      <Card className="border-fin-border shadow-xl shadow-black/5 bg-fin-surface overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-fin-page/50">
                <TableRow className="border-b border-fin-border">
                  <TableHead className="w-[60px] text-[10px] font-black text-fin-text-muted uppercase text-center py-4">No</TableHead>
                  <TableHead className="w-[120px] text-[10px] font-black text-fin-text-muted uppercase py-4 text-center">Tanggal</TableHead>
                  <TableHead className="w-[180px] text-[10px] font-black text-fin-text-muted uppercase py-4">No. Bukti</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4">Uraian / Keterangan Belanja</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-right">Nilai Bruto</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-right">Realisasi Kumulatif</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-right">Sisa Pagu</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-4 text-center pr-6">Audit Rekon</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center">
                      <Loader2 className="animate-spin text-fin-text-muted mx-auto" size={32} />
                    </TableCell>
                  </TableRow>
                ) : data?.data?.length > 0 ? (
                  data.data.map((item: any, i: number) => (
                    <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.01 }} className="group border-b border-fin-border hover:bg-fin-page">
                      <TableCell className="text-center font-bold text-fin-text-muted text-[11px] py-4">{i + 1}</TableCell>
                      <TableCell className="text-center text-[11px] font-bold text-fin-text-muted">
                        {new Date(item.tanggal).toLocaleDateString('id-ID')}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex px-2 py-1 bg-fin-page text-fin-text-primary text-[10px] font-black rounded-lg tracking-wider">
                          {item.bukti}
                        </span>
                      </TableCell>
                      <TableCell>
                         <div className="flex flex-col">
                            <span className="text-xs font-bold text-fin-text-primary uppercase leading-tight">{item.uraian}</span>
                            <Badge variant="outline" className="w-fit mt-1 text-[8px] font-bold border-slate-200 text-fin-text-muted uppercase tracking-tighter">{item.jenis}</Badge>
                         </div>
                      </TableCell>
                      <TableCell className="text-right font-black tabular-nums text-xs text-fin-text-primary">
                        {formatCurrency(item.nilai_bruto)}
                      </TableCell>
                      <TableCell className="text-right font-black text-fin-info tabular-nums text-xs">
                        {formatCurrency(item.realisasi_kumulatif)}
                      </TableCell>
                      <TableCell className="text-right font-black text-fin-income tabular-nums text-xs">
                        {formatCurrency(item.sisa_pagu)}
                      </TableCell>
                      <TableCell className="px-6 py-4 text-center pr-6">
                        <div className="flex flex-col items-center gap-1">
                          {item.status_rekon === 'SUDAH' ? (
                            <Badge variant="outline" className="bg-[#ECFDF3] text-[#027A48] border-[#A6F4C5] text-[9px] px-2 py-0.5 font-bold whitespace-nowrap">COCOK</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-[#F9FAFB] text-fin-text-muted border-[#EAECF0] text-[9px] px-2 py-0.5 font-medium whitespace-nowrap">BELUM REKON</Badge>
                          )}
                          {item.keterangan_rekon && (
                            <p className="text-[8px] text-fin-info-text font-bold max-w-[80px] truncate" title={item.keterangan_rekon}>
                              {item.keterangan_rekon}
                            </p>
                          )}
                        </div>
                      </TableCell>
                    </motion.tr>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-40 text-center text-fin-text-muted italic font-bold">
                       Belum ada realisasi untuk OPD ini.
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
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-fin-surface rounded-xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-fin-border flex items-center justify-between">
              <h3 className="font-black text-fin-text-primary text-sm uppercase">Pratinjau Buku Pembantu OPD</h3>
              <Button variant="ghost" onClick={() => setPreviewPdf(null)}><X size={18} /></Button>
            </div>
            <iframe src={previewPdf} className="flex-1 w-full" />
            <div className="p-4 bg-slate-50 border-t flex justify-end">
              <Button onClick={() => setPreviewPdf(null)} className="bg-ds-primary text-white">Tutup</Button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
