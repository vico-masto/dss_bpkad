'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { 
  Search, 
  RefreshCw, 
  Trash2, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  Printer,
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Calendar,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { formatCurrency, cn, parseNumber } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
  DialogBody 
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import * as XLSX from 'xlsx';
import Link from 'next/link';

const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

export default function BankManagementPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(15);
  const [filters, setFilters] = useState({
    search: '',
    startDate: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    type: 'ALL'
  });

  const { data, isLoading, mutate } = useSWR(
    ['/reports/reconciliation/bank-list', { ...filters, page: currentPage, limit }],
    ([url, params]) => fetcher(url, params)
  );

  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resetModal, setResetModal] = useState({ isOpen: false, value: '' });
  const [resetPreview, setResetPreview] = useState<{ total_bank: number; sudah_match: number } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Handle File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(10);
    
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);
        
        setUploadProgress(40);
        
        // Map data to backend format
        const mappedData = rawData.map((row: any) => ({
          TANGGAL: row['Tanggal'] || row['TANGGAL'] || row['Date'] || row['DATE'],
          NOMOR_BUKTI: row['Nomor Bukti'] || row['NOMOR BUKTI'] || row['NOMOR_BUKTI'] || row['No Bukti'] || row['Ref'],
          URAIAN: row['Keterangan'] || row['URAIAN'] || row['Description'] || row['DESKRIPSI'] || row['Uraian'],
          PENERIMAAN: parseNumber(row['Penerimaan'] || row['Kredit'] || row['MASUK'] || row['PENERIMAAN'] || 0),
          PENGELUARAN: parseNumber(row['Pengeluaran'] || row['Debet'] || row['KELUAR'] || row['PENGELUARAN'] || 0),
          SALDO: parseNumber(row['Saldo'] || row['SALDO AKHIR'] || row['SALDO'] || 0)
        })).filter((item: any) => item.TANGGAL && (item.PENERIMAAN > 0 || item.PENGELUARAN > 0));

        if (mappedData.length === 0) {
          toast.error('Tidak ada data valid ditemukan. Periksa header kolom (Tanggal, Uraian, Penerimaan, Pengeluaran, Saldo)');
          setIsUploading(false);
          return;
        }

        setUploadProgress(100);
        setPreviewData(mappedData);
        toast.success('Data siap di-preview!');
      } catch (err: any) {
        toast.error('Gagal memproses file', { description: err.message });
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleConfirmUpload = async () => {
    setIsUploading(true);
    try {
      const res = await api.post('/reports/reconciliation/import', { data: previewData });
      toast.success(`Berhasil mengimpor ${res.data.importedCount} mutasi bank baru.`);
      setShowUploadModal(false);
      setPreviewData([]);
      mutate();
    } catch (err: any) {
      toast.error('Gagal mengimpor ke database', { description: err.message });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{
      Tanggal: '2026-05-17',
      'Nomor Bukti': 'STS-001',
      Uraian: 'Contoh Setoran Pendapatan',
      Penerimaan: 1000000,
      Pengeluaran: 0,
      Saldo: 1000000
    }, {
      Tanggal: '2026-05-18',
      'Nomor Bukti': 'SP2D-002',
      Uraian: 'Contoh Pencairan SP2D',
      Penerimaan: 0,
      Pengeluaran: 500000,
      Saldo: 500000
    }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template_Bank");
    XLSX.writeFile(wb, "Template_Mutasi_Bank.xlsx");
  };

  const handleDeleteItem = async (id: number) => {
    if (!confirm('Hapus mutasi ini? Tindakan ini akan membatalkan rekonsiliasi jika sudah cocok.')) return;
    
    try {
      await api.delete(`/reports/reconciliation/bank/${id}`);
      toast.success('Mutasi berhasil dihapus');
      mutate();
    } catch (err: any) {
      toast.error('Gagal menghapus data', { description: err.response?.data?.message });
    }
  };

  const openResetModal = async () => {
    setResetPreview(null);
    setResetModal({ isOpen: true, value: '' });
    setLoadingPreview(true);
    try {
      const res = await api.get(`/reports/reconciliation/reset-preview?year=${new Date().getFullYear()}&scope=BANK_ONLY`);
      setResetPreview(res.data);
    } catch {
      // preview opsional — dialog tetap terbuka meski gagal
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleResetAll = async () => {
    if (resetModal.value.trim() !== `RESET BANK ${new Date().getFullYear()}`) {
        toast.error('Konfirmasi teks tidak sesuai');
        return;
    }

    setIsDeleting(true);
    try {
      await api.post('/reports/reconciliation/reset-all', { 
          code: resetModal.value.trim(),
          year: new Date().getFullYear(),
          scope: 'BANK_ONLY'
      });
      toast.success('Semua data mutasi bank telah dibersihkan.');
      setResetModal({ isOpen: false, value: '' });
      mutate();
    } catch (err: any) {
      const errorData = err.response?.data;
      if (errorData?.received) {
        toast.error('Kode Salah', { 
            description: `Diterima: "${errorData.received}", Seharusnya: "${errorData.expected}"` 
        });
      } else {
        toast.error('Gagal membersihkan data', { description: errorData?.message || err.message });
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700 p-6">
      
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/rekon">
            <Button variant="outline" size="icon" className="size-10 rounded-lg shadow-sm">
              <ArrowLeft size={16} className="text-fin-text-secondary" />
            </Button>
          </Link>
          <div className="w-10 h-10 bg-ds-primary rounded-lg flex items-center justify-center text-white shadow-md shadow-ds-primary/20">
            <Database size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-fin-text-primary">Manajemen Rekening Koran</h1>
            <p className="text-xs text-fin-text-secondary mt-0.5 font-medium">Upload, audit, dan kelola data mutasi bank RKUD</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <Button 
            onClick={openResetModal}
            variant="ghost"
            size="md"
            className="text-fin-text-muted hover:text-fin-expense-text hover:bg-fin-expense-bg font-bold text-xs uppercase rounded-lg"
          >
            <Trash2 size={14} className="mr-1.5" /> Wipe All Data
          </Button>

          <Button 
            onClick={handleDownloadTemplate}
            variant="outline"
            size="md"
            className="rounded-lg text-xs font-bold font-sans flex items-center gap-1.5"
          >
            <Download size={14} />
            <span>Template</span>
          </Button>

          <Button 
            onClick={() => window.print()}
            variant="outline"
            size="md"
            className="rounded-lg text-xs font-bold font-sans flex items-center gap-1.5"
          >
            <Printer size={14} />
            <span>Cetak</span>
          </Button>

          <Button 
            onClick={() => { setShowUploadModal(true); setPreviewData([]); }}
            variant="primary"
            size="md"
            className="rounded-lg text-xs font-bold font-sans flex items-center gap-1.5 group shadow-sm"
          >
            <Upload size={14} className="group-hover:-translate-y-0.5 transition-transform" />
            <span>Upload Rekening Koran</span>
          </Button>
        </div>
      </div>

      {/* SUMMARY STATS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="lux-stat lux-stat-emerald p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-emerald-200/70 uppercase tracking-widest">Total Mutasi Masuk</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-200" />
            </div>
          </div>
          <h3 className="text-lg xl:text-xl font-bold tracking-tight text-white tabular-nums truncate">
            {isLoading ? '...' : formatCurrency(data?.summary?.totalKredit || 0)}
          </h3>
          <span className="text-[9px] font-bold text-emerald-200/60 uppercase mt-2">Penerimaan Rekening</span>
        </div>

        <div className="lux-stat lux-stat-rose p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-red-200/70 uppercase tracking-widest">Total Mutasi Keluar</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <TrendingDown className="w-3.5 h-3.5 text-red-200" />
            </div>
          </div>
          <h3 className="text-lg xl:text-xl font-bold tracking-tight text-white tabular-nums truncate">
            {isLoading ? '...' : formatCurrency(data?.summary?.totalDebet || 0)}
          </h3>
          <span className="text-[9px] font-bold text-red-200/60 uppercase mt-2">Pengeluaran Rekening</span>
        </div>

        <div className="lux-stat lux-stat-violet p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-violet-200/70 uppercase tracking-widest">Total Records</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <Database className="w-3.5 h-3.5 text-violet-200" />
            </div>
          </div>
          <h3 className="text-lg xl:text-xl font-bold tracking-tight text-white tabular-nums truncate">
            {isLoading ? '...' : data?.summary?.totalItems || 0}
          </h3>
          <span className="text-[9px] font-bold text-violet-200/60 uppercase mt-2">Baris Data Terdaftar</span>
        </div>

        <div className="lux-stat lux-stat-navy p-4 rounded-xl flex flex-col group">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-black text-blue-200/70 uppercase tracking-widest">Saldo Akhir Terdeteksi</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-200" />
            </div>
          </div>
          <h3 className="text-lg xl:text-xl font-bold tracking-tight text-white tabular-nums truncate">
            {isLoading ? '...' : formatCurrency(data?.summary?.lastBalance || 0)}
          </h3>
          <span className="text-[9px] font-bold text-blue-200/60 uppercase mt-2">Validated Bank Position</span>
        </div>
      </div>

      {/* FILTER BAR */}
      <Card className="rounded-xl border border-fin-border shadow-sm bg-fin-surface p-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-end">
          <div className="lg:col-span-4 space-y-1.5">
            <label className="text-micro font-bold uppercase tracking-wide text-fin-text-muted flex items-center gap-1.5 ml-1">
              <Search size={12} /> Cari Mutasi
            </label>
            <Input 
              placeholder="Cari deskripsi atau nominal..." 
              className="font-semibold text-xs animate-none"
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
          </div>

          <div className="lg:col-span-4 space-y-1.5">
            <label className="text-micro font-bold uppercase tracking-wide text-fin-text-muted flex items-center gap-1.5 ml-1">
              <Calendar size={12} /> Rentang Tanggal
            </label>
            <div className="flex items-center gap-2">
              <Input 
                type="date" 
                className="font-semibold text-xs animate-none"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              />
              <span className="text-xs font-bold text-fin-text-muted">s/d</span>
              <Input 
                type="date" 
                className="font-semibold text-xs animate-none"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
             <Button 
                onClick={() => mutate()}
                variant="outline"
                size="md"
                className="w-full text-xs font-bold rounded-lg"
             >
                <RefreshCw size={14} className="mr-1.5 animate-none" /> Tampilkan
             </Button>
          </div>
          
          <div className="lg:col-span-2">
             <Link href="/dashboard/rekon" className="w-full block">
                <Button 
                    variant="primary"
                    size="md"
                    className="w-full text-xs font-bold rounded-lg shadow-sm"
                >
                    Mulai Rekon <ArrowRight size={14} className="ml-1.5" />
                </Button>
             </Link>
          </div>
        </div>
      </Card>

      {/* DATA TABLE */}
      <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
        <Table>
          <TableHeader className="bg-fin-page/50">
            <TableRow className="hover:bg-transparent border-b border-fin-border">
              <TableHead className="w-12 text-[10px] font-black uppercase text-fin-text-muted py-5 text-center">No</TableHead>
              <TableHead className="w-28 text-[10px] font-black uppercase text-fin-text-muted">Tanggal</TableHead>
              <TableHead className="w-32 text-[10px] font-black uppercase text-fin-text-muted">No Bukti</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-fin-text-muted">Deskripsi / Uraian Transaksi</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-fin-text-muted text-right">Debet (Keluar)</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-fin-text-muted text-right">Kredit (Masuk)</TableHead>
              <TableHead className="text-[10px] font-black uppercase text-fin-text-muted text-right">Saldo Akhir</TableHead>
              <TableHead className="w-20 text-[10px] font-black uppercase text-fin-text-muted text-center pr-6">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1, 2, 3, 4, 5].map(i => (
                <TableRow key={i}>
                  <TableCell colSpan={8} className="py-6"><div className="h-6 w-full animate-pulse bg-fin-page rounded-lg" /></TableCell>
                </TableRow>
              ))
            ) : data?.data?.length > 0 ? (
              data.data.map((item: any, idx: number) => (
                <TableRow key={item.id} className="hover:bg-fin-page/50 transition-colors border-b border-fin-border">
                  <TableCell className="text-center text-[10px] font-bold text-fin-text-muted">{(currentPage - 1) * limit + idx + 1}</TableCell>
                  <TableCell className="text-[10px] font-black text-fin-text-primary tabular-nums">
                    {format(new Date(item.tanggal), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell className="text-[10px] font-bold text-fin-text-primary">
                    {item.nomor_bukti || '-'}
                  </TableCell>
                  <TableCell>
                    <p className="text-[10px] font-bold text-fin-text-primary uppercase leading-relaxed line-clamp-1">{item.deskripsi}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {item.is_matched ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-none text-[8px] font-black px-1.5 h-4">MATCHED</Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-400 border-none text-[8px] font-black px-1.5 h-4">OPEN</Badge>
                      )}
                      <span className="text-[8px] font-bold text-fin-text-muted uppercase">ID: {item.id}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-black text-fin-expense tabular-nums text-[11px]">
                    {Number(item.debet) > 0 ? formatCurrency(item.debet) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-black text-fin-income tabular-nums text-[11px]">
                    {Number(item.kredit) > 0 ? formatCurrency(item.kredit) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-black text-fin-text-primary tabular-nums text-[11px]">
                    {formatCurrency(item.saldo_akhir)}
                  </TableCell>
                  <TableCell className="text-center pr-6">
                    <Button 
                      onClick={() => handleDeleteItem(item.id)}
                      variant="ghost" 
                      size="icon-sm" 
                      className="text-fin-text-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-lg"
                    >
                      <Trash2 size={13} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="py-20 text-center">
                  <div className="flex flex-col items-center gap-3 opacity-30">
                    <FileSpreadsheet size={48} />
                    <p className="text-xs font-black uppercase tracking-widest">Belum ada data mutasi bank.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* PAGINATION */}
        <div className="p-4 bg-fin-page/30 flex justify-between items-center border-t border-fin-border">
          <p className="text-[10px] font-bold text-fin-text-muted uppercase">Menampilkan {data?.data?.length || 0} dari {data?.summary?.totalItems || 0} entri</p>
          <div className="flex items-center gap-2">
            <Button 
              disabled={currentPage === 1 || isLoading}
              onClick={() => setCurrentPage(p => p - 1)}
              variant="outline" 
              className="h-8 px-3 text-[10px] font-black uppercase border-fin-border rounded-lg"
            >
              Previous
            </Button>
            <div className="px-4 text-[10px] font-black text-fin-info-text bg-white border border-fin-border rounded-lg h-8 flex items-center">
              {currentPage}
            </div>
            <Button 
              disabled={data?.data?.length < limit || isLoading}
              onClick={() => setCurrentPage(p => p + 1)}
              variant="outline" 
              className="h-8 px-3 text-[10px] font-black uppercase border-fin-border rounded-lg"
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* UPLOAD MODAL */}
      <Dialog open={showUploadModal} onOpenChange={setShowUploadModal}>
        <DialogContent size={previewData.length > 0 ? "xl" : "md"}>
          <DialogHeader>
            <DialogTitle>{previewData.length > 0 ? "Preview Data Import" : "Import Rekening Koran"}</DialogTitle>
            <DialogDescription>
              {previewData.length > 0 
                ? `${previewData.length} baris data mutasi bank siap disimpan ke database` 
                : "Unggah berkas mutasi bank RKUD dalam format Excel (.xlsx / .xls)"}
            </DialogDescription>
          </DialogHeader>
          
          <DialogBody className="space-y-5">
            {previewData.length === 0 ? (
              <>
                <div className="space-y-4">
                  <div className="p-8 border-2 border-dashed border-fin-border rounded-lg bg-fin-page hover:bg-fin-subtle/50 transition-all flex flex-col items-center justify-center text-center cursor-pointer relative group">
                      <input 
                        type="file" 
                        accept=".xlsx, .xls"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                      <FileSpreadsheet className="size-10 text-indigo-500 mb-3 group-hover:scale-105 transition-transform animate-none" />
                      <p className="text-sm font-semibold text-fin-text-primary">Klik atau seret file Excel ke sini</p>
                      <p className="text-xs text-fin-text-muted mt-1 leading-relaxed">Kolom minimal: Tanggal, Uraian, Penerimaan, Pengeluaran, Saldo</p>
                  </div>
                  
                  {isUploading && (
                      <div className="space-y-2 animate-in fade-in zoom-in duration-200">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-xs font-semibold text-indigo-500 animate-pulse">Memproses Data...</span>
                          <span className="text-xs font-bold text-fin-text-primary">{uploadProgress}%</span>
                        </div>
                        <div className="h-2 w-full bg-fin-page rounded-full overflow-hidden border border-fin-border">
                          <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${uploadProgress}%` }}
                              className="h-full bg-emerald-500"
                          />
                        </div>
                      </div>
                  )}
                </div>

                <div className="bg-fin-warning-bg border border-fin-warning/20 rounded-lg p-4 flex gap-3">
                  <AlertTriangle className="size-5 text-fin-warning-text shrink-0 animate-none" />
                  <p className="text-xs text-fin-warning-text leading-relaxed font-medium">
                      Pastikan format tanggal valid dan nominal tidak mengandung karakter selain angka. Baris yang sudah ada (duplikat) akan dilewati secara otomatis oleh sistem.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="max-h-[300px] overflow-auto border border-fin-border rounded-lg">
                  <Table>
                    <TableHeader className="bg-fin-page sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="text-micro font-bold uppercase py-2">Tanggal</TableHead>
                        <TableHead className="text-micro font-bold uppercase py-2">No Bukti</TableHead>
                        <TableHead className="text-micro font-bold uppercase py-2">Uraian</TableHead>
                        <TableHead className="text-micro font-bold uppercase text-right py-2">Kredit (Masuk)</TableHead>
                        <TableHead className="text-micro font-bold uppercase text-right py-2">Debet (Keluar)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-medium tabular-nums">{row.TANGGAL}</TableCell>
                          <TableCell className="text-xs font-medium">{row.NOMOR_BUKTI || '-'}</TableCell>
                          <TableCell className="text-xs font-medium truncate max-w-[200px]">{row.URAIAN}</TableCell>
                          <TableCell className="text-xs font-bold text-fin-income text-right tabular-nums">{formatCurrency(row.PENERIMAAN)}</TableCell>
                          <TableCell className="text-xs font-bold text-fin-expense text-right tabular-nums">{formatCurrency(row.PENGELUARAN)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {previewData.length > 10 && (
                  <p className="text-xs font-semibold text-center text-fin-text-muted">... dan {previewData.length - 10} baris lainnya</p>
                )}
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            {previewData.length > 0 ? (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setPreviewData([])}
                  className="rounded-lg text-xs font-bold font-sans"
                >
                  Batal
                </Button>
                <Button 
                  onClick={handleConfirmUpload}
                  disabled={isUploading}
                  variant="primary"
                  className="rounded-lg text-xs font-bold font-sans flex items-center gap-1.5"
                  loading={isUploading}
                >
                  <CheckCircle2 size={14} />
                  Simpan ke Database
                </Button>
              </>
            ) : (
              <Button 
                variant="outline" 
                onClick={() => setShowUploadModal(false)}
                className="rounded-lg text-xs font-bold font-sans"
              >
                Tutup
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RESET ALL DIALOG */}
      <Dialog open={resetModal.isOpen} onOpenChange={(open) => setResetModal(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="text-fin-expense-text">Reset Data Rekening Koran</DialogTitle>
            <DialogDescription>
              Tindakan ini bersifat permanen dan akan menghapus seluruh data transaksi mutasi bank.
            </DialogDescription>
          </DialogHeader>
          
          <DialogBody className="space-y-5">
            {/* Preview dampak */}
            {loadingPreview ? (
              <div className="flex items-center justify-center gap-2 py-3 text-fin-text-muted text-xs font-bold uppercase">
                <Loader2 size={14} className="animate-spin" /> Memuat data dampak...
              </div>
            ) : resetPreview && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-fin-expense-bg border border-fin-expense/10 rounded-lg p-3 text-center">
                  <p className="text-xl font-extrabold text-fin-expense-text">{resetPreview.total_bank.toLocaleString('id-ID')}</p>
                  <p className="text-[9px] text-fin-expense-text/70 uppercase font-black tracking-wider mt-1">Total Mutasi Bank</p>
                </div>
                <div className="bg-fin-expense-bg border border-fin-expense/10 rounded-lg p-3 text-center">
                  <p className="text-xl font-extrabold text-fin-expense-text">{resetPreview.sudah_match.toLocaleString('id-ID')}</p>
                  <p className="text-[9px] text-rose-500/70 uppercase font-black tracking-wider mt-1">Sudah Dicocokkan</p>
                </div>
              </div>
            )}
            <div className="bg-fin-expense-bg border border-fin-expense/10 rounded-lg p-4 text-center">
              <p className="text-xs font-bold text-fin-expense-text leading-relaxed">
                Anda akan menghapus seluruh data rekening koran. <br/>
                Ketik <span className="font-extrabold underline">RESET BANK {new Date().getFullYear()}</span> untuk konfirmasi.
              </p>
            </div>

            <div className="space-y-2">
              <Input 
                placeholder={`RESET BANK ${new Date().getFullYear()}`}
                className="h-11 text-center font-bold text-xs uppercase animate-none"
                value={resetModal.value}
                onChange={(e) => setResetModal(prev => ({ ...prev, value: e.target.value }))}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setResetModal({ isOpen: false, value: '' })}
              className="rounded-lg text-xs font-bold font-sans"
            >
              Batal
            </Button>
            <Button 
              onClick={handleResetAll}
              disabled={resetModal.value.trim() !== `RESET BANK ${new Date().getFullYear()}` || isDeleting}
              variant="destructive"
              className="rounded-lg text-xs font-bold font-sans flex items-center gap-1.5 shadow-sm"
              loading={isDeleting}
            >
              <Trash2 size={14} />
              Bersihkan Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
