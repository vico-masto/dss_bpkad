'use client';

import { useState, useEffect, useMemo } from 'react';
import useSWR from 'swr';
import { 
  Search, 
  Filter, 
  RefreshCw, 
  Trash2, 
  Upload, 
  FileSpreadsheet, 
  Download, 
  Printer,
  Activity, 
  Database, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Calendar,
  X,
  Plus,
  ArrowLeft,
  Loader2
} from 'lucide-react';
import { formatCurrency, cn, parseNumber, formatNumber } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
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
  const [limit, setLimit] = useState(15);
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
      // Backend should have a specific reset for bank statements, 
      // but if not, we use the general reset or create a new one.
      // For now, let's assume we use reset-all which reset rekon too.
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
            <Button variant="ghost" size="icon" className="w-12 h-12 rounded-xl bg-fin-surface border border-fin-border shadow-sm hover:bg-fin-page transition-all">
              <ArrowLeft size={20} className="text-fin-text-secondary" />
            </Button>
          </Link>
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
            <Database size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-fin-text-primary">Manajemen Rekening Koran</h1>
            <p className="text-sm text-fin-text-secondary mt-1 font-medium">Upload, audit, dan kelola data mutasi bank RKUD</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            onClick={openResetModal}
            variant="ghost"
            className="h-11 px-4 text-rose-400 hover:text-rose-600 hover:bg-rose-500/10 rounded-xl font-black text-[10px] uppercase transition-all"
          >
            <Trash2 size={16} className="mr-2" /> Wipe All Data
          </Button>

          <Button 
            onClick={handleDownloadTemplate}
            className="h-11 px-4 bg-white text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-xl font-black text-xs uppercase tracking-widest shadow-sm transition-all flex items-center gap-2"
          >
            <Download size={16} />
            <span className="hidden sm:inline">Template</span>
          </Button>

          <Button 
            onClick={() => window.print()}
            className="h-11 px-4 bg-white text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-xl font-black text-xs uppercase tracking-widest shadow-sm transition-all flex items-center gap-2"
          >
            <Printer size={16} />
            <span className="hidden sm:inline">Cetak</span>
          </Button>

          <Button 
            onClick={() => { setShowUploadModal(true); setPreviewData([]); }}
            className="h-11 px-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2 group"
          >
            <Upload size={16} className="group-hover:-translate-y-1 transition-transform" />
            <span>Upload Rekening Koran</span>
          </Button>
        </div>
      </div>

      {/* SUMMARY STATS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-fin-surface p-6 rounded-2xl border border-fin-border shadow-sm">
           <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Total Mutasi Masuk</p>
           <h3 className="text-2xl font-black text-fin-income tabular-nums">
             {isLoading ? '...' : formatCurrency(data?.summary?.totalKredit || 0)}
           </h3>
           <div className="flex items-center gap-2 mt-2">
              <TrendingUp size={12} className="text-fin-income" />
              <span className="text-[9px] font-bold text-fin-text-muted uppercase">Penerimaan Rekening</span>
           </div>
        </Card>

        <Card className="bg-fin-surface p-6 rounded-2xl border border-fin-border shadow-sm">
           <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Total Mutasi Keluar</p>
           <h3 className="text-2xl font-black text-fin-expense tabular-nums">
             {isLoading ? '...' : formatCurrency(data?.summary?.totalDebet || 0)}
           </h3>
           <div className="flex items-center gap-2 mt-2">
              <TrendingDown size={12} className="text-fin-expense" />
              <span className="text-[9px] font-bold text-fin-text-muted uppercase">Pengeluaran Rekening</span>
           </div>
        </Card>

        <Card className="bg-fin-surface p-6 rounded-2xl border border-fin-border shadow-sm">
           <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Total Records</p>
           <h3 className="text-2xl font-black text-fin-text-primary tabular-nums">
             {isLoading ? '...' : data?.summary?.totalItems || 0}
           </h3>
           <div className="flex items-center gap-2 mt-2">
              <Database size={12} className="text-indigo-400" />
              <span className="text-[9px] font-bold text-fin-text-muted uppercase">Baris Data Terdaftar</span>
           </div>
        </Card>

        <Card className="bg-[#101828] p-6 rounded-2xl border-none shadow-xl">
           <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Saldo Akhir Terdeteksi</p>
           <h3 className="text-2xl font-black text-white tabular-nums">
             {isLoading ? '...' : formatCurrency(data?.summary?.lastBalance || 0)}
           </h3>
           <div className="flex items-center gap-2 mt-2">
              <ShieldCheck size={12} className="text-emerald-400" />
              <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Validated Bank Position</span>
           </div>
        </Card>
      </div>

      {/* FILTER BAR */}
      <Card className="rounded-2xl border border-fin-border shadow-sm bg-fin-surface p-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-4 space-y-2">
            <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest flex items-center gap-2 ml-1">
              <Search size={12} /> Cari Mutasi
            </label>
            <Input 
              placeholder="Cari deskripsi atau nominal..." 
              className="h-11 bg-fin-page border-fin-border rounded-xl text-xs font-bold"
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
          </div>

          <div className="lg:col-span-4 space-y-2">
            <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest flex items-center gap-2 ml-1">
              <Calendar size={12} /> Rentang Tanggal
            </label>
            <div className="flex items-center gap-2">
              <Input 
                type="date" 
                className="h-11 bg-fin-page border-fin-border rounded-xl text-xs font-bold"
                value={filters.startDate}
                onChange={(e) => setFilters({...filters, startDate: e.target.value})}
              />
              <span className="text-[10px] font-bold text-fin-text-muted">s/d</span>
              <Input 
                type="date" 
                className="h-11 bg-fin-page border-fin-border rounded-xl text-xs font-bold"
                value={filters.endDate}
                onChange={(e) => setFilters({...filters, endDate: e.target.value})}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
             <Button 
                onClick={() => mutate()}
                className="w-full h-11 bg-fin-page text-fin-text-primary hover:bg-fin-border border border-fin-border rounded-xl text-xs font-black uppercase transition-all"
             >
                <RefreshCw size={14} className="mr-2" /> Tampilkan
             </Button>
          </div>
          
          <div className="lg:col-span-2">
             <Link href="/dashboard/rekon">
                <Button 
                    className="w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase transition-all"
                >
                    Mulai Rekon <ArrowRight size={14} className="ml-2" />
                </Button>
             </Link>
          </div>
        </div>
      </Card>

      {/* DATA TABLE */}
      <Card className="rounded-2xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
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
              <TableHead className="w-24 text-[10px] font-black uppercase text-fin-text-muted text-center pr-6">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1, 2, 3, 4, 5].map(i => (
                <TableRow key={i}>
                  <TableCell colSpan={7} className="py-6"><div className="h-6 w-full animate-pulse bg-fin-page rounded-lg" /></TableCell>
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
                      size="icon" 
                      className="h-8 w-8 text-fin-text-muted hover:text-rose-500 hover:bg-rose-500/10 rounded-lg"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="py-20 text-center">
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
            <div className="px-4 text-[10px] font-black text-indigo-600 bg-white border border-fin-border rounded-lg h-8 flex items-center">
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
        <DialogContent className={cn("bg-fin-surface rounded-3xl p-0 overflow-hidden border border-fin-border shadow-2xl transition-all duration-300", previewData.length > 0 ? "max-w-4xl" : "max-w-lg")}>
          <div className="bg-[#101828] p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md border border-white/10">
                <Upload size={32} className="text-emerald-400" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest">{previewData.length > 0 ? "Preview Data Import" : "Import Rekening Koran"}</h2>
              <p className="text-fin-text-muted text-[10px] font-bold mt-2 uppercase tracking-tight">
                {previewData.length > 0 ? `${previewData.length} Baris Data Siap Diimpor` : "Gunakan Format Excel (.xlsx / .xls)"}
              </p>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            {previewData.length === 0 ? (
              <>
                <div className="space-y-4">
                  <div className="p-8 border-2 border-dashed border-fin-border rounded-2xl bg-fin-page hover:bg-fin-border/20 transition-all flex flex-col items-center justify-center text-center cursor-pointer relative group">
                      <input 
                        type="file" 
                        accept=".xlsx, .xls"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleFileUpload}
                        disabled={isUploading}
                      />
                      <FileSpreadsheet size={40} className="text-indigo-400 mb-3 group-hover:scale-110 transition-transform" />
                      <p className="text-[11px] font-black text-fin-text-primary uppercase">Klik atau Taruh File Excel Di Sini</p>
                      <p className="text-[9px] font-bold text-fin-text-muted mt-2 uppercase tracking-tighter">Kolom Minimal: Tanggal, Uraian, Penerimaan, Pengeluaran, Saldo</p>
                  </div>
                  
                  {isUploading && (
                      <div className="space-y-2 animate-in fade-in zoom-in">
                        <div className="flex justify-between items-center px-1">
                          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest animate-pulse">Memproses Data...</span>
                          <span className="text-[10px] font-black text-fin-text-primary">{uploadProgress}%</span>
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

                <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                  <p className="text-[9px] font-bold text-amber-600 leading-relaxed">
                      Pastikan format tanggal valid dan nominal tidak mengandung karakter selain angka. Baris yang sudah ada (duplikat) akan dilewati secara otomatis oleh sistem.
                  </p>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="max-h-[300px] overflow-auto border border-fin-border rounded-xl">
                  <Table>
                    <TableHeader className="bg-fin-page sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="text-[10px] font-black uppercase py-2">Tanggal</TableHead>
                        <TableHead className="text-[10px] font-black uppercase py-2">No Bukti</TableHead>
                        <TableHead className="text-[10px] font-black uppercase py-2">Uraian</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-right py-2">Masuk (Kredit)</TableHead>
                        <TableHead className="text-[10px] font-black uppercase text-right py-2">Keluar (Debet)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.slice(0, 10).map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-[10px] font-bold">{row.TANGGAL}</TableCell>
                          <TableCell className="text-[10px] font-bold">{row.NOMOR_BUKTI || '-'}</TableCell>
                          <TableCell className="text-[10px] font-bold truncate max-w-[200px]">{row.URAIAN}</TableCell>
                          <TableCell className="text-[10px] font-black text-fin-income text-right tabular-nums">{formatCurrency(row.PENERIMAAN)}</TableCell>
                          <TableCell className="text-[10px] font-black text-fin-expense text-right tabular-nums">{formatCurrency(row.PENGELUARAN)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {previewData.length > 10 && (
                  <p className="text-[10px] font-bold text-center text-fin-text-muted">... dan {previewData.length - 10} baris lainnya</p>
                )}
                <div className="flex gap-3 pt-2">
                  <Button 
                    onClick={handleConfirmUpload}
                    disabled={isUploading}
                    className="flex-1 h-12 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-900/20"
                  >
                    {isUploading ? <Loader2 className="animate-spin mr-2" size={16} /> : <CheckCircle2 className="mr-2" size={16} />}
                    Simpan ke Database
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setPreviewData([])}
                    className="h-12 px-6 rounded-xl font-black text-[10px] uppercase border-fin-border"
                  >
                    Batal
                  </Button>
                </div>
              </div>
            )}

            {previewData.length === 0 && (
              <Button 
                variant="ghost" 
                onClick={() => setShowUploadModal(false)}
                className="w-full h-12 rounded-xl font-black text-[10px] uppercase text-fin-text-muted hover:bg-fin-page"
              >
                Tutup
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* RESET ALL DIALOG */}
      <Dialog open={resetModal.isOpen} onOpenChange={(open) => setResetModal(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-md bg-fin-surface rounded-3xl p-0 overflow-hidden border border-fin-border shadow-2xl">
          <div className="bg-rose-600 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md border border-white/30">
                <AlertTriangle size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest text-white">Reset Data Bank</h2>
              <p className="text-rose-100 text-[10px] font-bold mt-2 uppercase tracking-tight">Semua data mutasi akan dihapus permanen</p>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            {/* Preview dampak */}
            {loadingPreview ? (
              <div className="flex items-center justify-center gap-2 py-3 text-rose-400/60 text-[10px] font-bold uppercase">
                <Loader2 size={14} className="animate-spin" /> Memuat data dampak...
              </div>
            ) : resetPreview && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-rose-400">{resetPreview.total_bank.toLocaleString('id-ID')}</p>
                  <p className="text-[9px] text-rose-400/70 uppercase font-bold mt-1">Total Mutasi Bank</p>
                </div>
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-3 text-center">
                  <p className="text-2xl font-black text-rose-400">{resetPreview.sudah_match.toLocaleString('id-ID')}</p>
                  <p className="text-[9px] text-rose-400/70 uppercase font-bold mt-1">Sudah Dicocokkan</p>
                </div>
              </div>
            )}
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-bold text-rose-400 uppercase leading-relaxed">
                Anda akan menghapus seluruh data rekening koran yang telah diupload. <br/>
                Ketik <span className="font-black underline">RESET BANK {new Date().getFullYear()}</span> untuk konfirmasi.
              </p>
            </div>

            <div className="space-y-2">
              <Input 
                placeholder={`RESET BANK ${new Date().getFullYear()}`}
                className="h-14 text-center bg-fin-page border-fin-border rounded-2xl font-black text-fin-text-primary placeholder:text-fin-text-muted/30 focus:ring-rose-500/20 focus:border-rose-500/50 transition-all"
                value={resetModal.value}
                onChange={(e) => setResetModal(prev => ({ ...prev, value: e.target.value }))}
              />
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handleResetAll}
                disabled={resetModal.value.trim() !== `RESET BANK ${new Date().getFullYear()}` || isDeleting}
                className="flex-1 h-14 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-900/20 transition-all active:scale-95"
              >
                {isDeleting ? <Loader2 className="animate-spin mr-2" /> : <Trash2 className="mr-2" size={14} />}
                Bersihkan Data
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setResetModal({ isOpen: false, value: '' })}
                className="h-14 px-6 rounded-2xl font-black text-[10px] uppercase text-fin-text-muted hover:bg-fin-page"
              >
                Batal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
