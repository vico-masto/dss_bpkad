'use client';

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { RefreshCw } from 'lucide-react';
import {
  PlusSquare,
  Save,
  Loader2,
  Banknote,
  Calendar,
  TrendingUp,
  TrendingDown,
  Activity,
  Database,
  Download,
  X,
  FileText,
  FileSignature,
  ShieldCheck,
  FileUp,
  Printer,
  FileSpreadsheet,
  LayoutTemplate,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  FileSearch,
  Filter,
  Paperclip,
} from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { exportToExcel, exportToPDF, printPDF, previewPDF, downloadTemplate } from '@/lib/exportUtils';
import * as XLSX from 'xlsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Combobox } from "@/components/ui/combobox";
import { ConfirmDialog } from '@/components/ConfirmDialog';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NumericInput } from '@/components/NumericInput';
import { SearchInput } from '@/components/ui/search-input';
import { FilterBar } from '@/components/patterns/filter-bar';
import { PageHeader } from '@/components/patterns/page-header';
import { FormField } from '@/components/patterns/form-field';

const fetcher = (url: string, params: any) =>
  api.get(url, { params }).then((res) => res.data);

export default function PendapatanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<'rekam' | 'arsip'>(
    tabParam === 'arsip' ? 'arsip' : 'rekam'
  );

  const importRef = useRef<HTMLInputElement>(null);

  // Sync tab with query param
  useEffect(() => {
    if (tabParam === 'rekam' || tabParam === 'arsip') {
      setActiveTab(tabParam as 'rekam' | 'arsip');
    } else if (!tabParam) {
      setActiveTab('rekam');
    }
  }, [tabParam]);

  const [loading, setLoading] = useState(false);
  const [sumberDanaList, setSumberDanaList] = useState([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [filters, setFilters] = useState({
    search: '',
    id_sumber_dana: '',
    tgl_awal: '',
    tgl_akhir: '',
    min_nilai: '',
  });

  const [showFilters, setShowFilters] = useState(false);
  const [rekonModal, setRekonModal] = useState<{
    id: string;
    nilai: number;
    selisih: any;
    keterangan: string;
    status: string;
  } | null>(null);
  const [savingRekon, setSavingRekon] = useState(false);

  // useSWR for Archive Data
  const {
    data: archiveResponse,
    isLoading: fetching,
    mutate: mutateArchive,
  } = useSWR(
    activeTab === 'arsip'
      ? ['/pendapatan', { page: currentPage, limit, ...filters }]
      : null,
    ([url, params]) => fetcher(url, params)
  );

  const archiveData = archiveResponse?.data || [];
  const totalData = archiveResponse?.total || 0;
  const totalNilai = archiveResponse?.totalNilai || 0;
  const totalPengeluaran = archiveResponse?.totalPengeluaran || 0;
  const totalPages = archiveResponse?.totalPages || 1;
  const monthlyTotals = archiveResponse?.monthlyTotals || [];

  // Reset page to 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    filters.search,
    filters.id_sumber_dana,
    filters.tgl_awal,
    filters.tgl_akhir,
    filters.min_nilai,
  ]);

  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    nomor_bukti: '',
    uraian: '',
    id_sumber_dana: '',
    nilai: 0,
  });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);

  // Cash Monitor States
  const [isCashMonitorOpen, setIsCashMonitorOpen] = useState(false);
  const [cashStats, setCashStats] = useState<any[]>([]);
  const [loadingCashStats, setLoadingCashStats] = useState(false);

  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'danger' | 'warning' | 'success' | 'info' | 'question';
    onConfirm: () => void;
    isLoading?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    onConfirm: () => {},
    isLoading: false,
  });

  // ── Handlers (logic unchanged) ─────────────────────────────────────────────

  const handleExportExcel = async () => {
    let dataToExport = [];
    if (selectedIds.length > 0) {
      dataToExport = archiveData.filter((i: any) => selectedIds.includes(i.id));
    } else {
      const loadToast = toast.loading('Menyiapkan file excel seluruh halaman...');
      try {
        const res = await api.get('/pendapatan', {
          params: { ...filters, limit: 10000, page: 1 },
        });
        dataToExport = res.data.data || [];
        toast.dismiss(loadToast);
      } catch (err) {
        toast.error('Gagal mengambil data lengkap');
        toast.dismiss(loadToast);
        return;
      }
    }
    const exportData = dataToExport.map((item: any, index: number) => ({
      'No.': index + 1,
      Tanggal: format(new Date(item.tanggal), 'yyyy-MM-dd'),
      'Nomor Bukti': item.nomor_bukti,
      'Sumber Dana': item.id_sumber_dana,
      Uraian: item.uraian,
      'Nilai (Rp)': item.nilai,
    }));
    exportToExcel(
      exportData,
      `Arsip_Pendapatan_${format(new Date(), 'yyyyMMdd_HHmm')}`
    );
  };

  const handleSaveRekon = async () => {
    if (!rekonModal) return;
    setSavingRekon(true);
    try {
      await api.patch(`/pendapatan/rekon/${rekonModal.id}`, {
        status_rekon: rekonModal.status,
        selisih_rekon: parseNumber(rekonModal.selisih),
        keterangan_rekon: rekonModal.keterangan,
      });
      toast.success('Rekonsiliasi Berhasil', {
        description: 'Status rekonsiliasi kas masuk telah diperbarui.',
      });
      setRekonModal(null);
      mutateArchive();
    } catch (err) {
      toast.error('Gagal menyimpan data rekonsiliasi');
    } finally {
      setSavingRekon(false);
    }
  };

  const handleExportPDF = async () => {
    let dataToExport = [];
    if (selectedIds.length > 0) {
      dataToExport = archiveData.filter((i: any) => selectedIds.includes(i.id));
    } else {
      const loadToast = toast.loading('Menyiapkan data laporan seluruh halaman...');
      try {
        const res = await api.get('/pendapatan', {
          params: { ...filters, limit: 10000, page: 1 },
        });
        dataToExport = res.data.data || [];
        toast.dismiss(loadToast);
      } catch (err) {
        toast.error('Gagal mengambil data lengkap');
        toast.dismiss(loadToast);
        return;
      }
    }
    const headers = ['No.', 'Tgl', 'No. Bukti', 'Sumber', 'Uraian', 'Nilai (Rp)'];
    const body = dataToExport.map((item: any, i: number) => [
      i + 1,
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.nomor_bukti,
      item.id_sumber_dana,
      item.uraian,
      formatCurrency(item.nilai),
    ]);
    const totalVal = dataToExport.reduce(
      (acc: number, curr: any) => acc + parseFloat(curr.nilai || 0),
      0
    );
    const foot = [['', '', '', '', 'TOTAL NILAI', formatCurrency(totalVal)]];
    exportToPDF(
      headers,
      body,
      `Arsip_Pendapatan_${format(new Date(), 'yyyyMMdd_HHmm')}`,
      'LAPORAN ARSIP KAS MASUK',
      foot
    );
  };

  const handlePrintPDF = async () => {
    let dataToPrint = [];
    if (selectedIds.length > 0) {
      dataToPrint = archiveData.filter((i: any) => selectedIds.includes(i.id));
    } else {
      const loadToast = toast.loading('Menyiapkan dokumen cetak...');
      try {
        const res = await api.get('/pendapatan', {
          params: { ...filters, limit: 10000, page: 1 },
        });
        dataToPrint = res.data.data || [];
        toast.dismiss(loadToast);
      } catch (err) {
        toast.error('Gagal memuat dokumen');
        toast.dismiss(loadToast);
        return;
      }
    }
    const headers = ['No.', 'Tgl', 'No. Bukti', 'Sumber', 'Uraian', 'Nilai (Rp)'];
    const body = dataToPrint.map((item: any, i: number) => [
      i + 1,
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.nomor_bukti,
      item.id_sumber_dana,
      item.uraian,
      formatCurrency(item.nilai),
    ]);
    const totalVal = dataToPrint.reduce(
      (acc: number, curr: any) => acc + parseFloat(curr.nilai || 0),
      0
    );
    const foot = [['', '', '', '', 'TOTAL NILAI', formatCurrency(totalVal)]];
    printPDF(headers, body, 'LAPORAN ARSIP KAS MASUK', foot);
  };

  const handlePreviewReport = async () => {
    let dataToPreview = [];
    if (selectedIds.length > 0) {
      dataToPreview = archiveData.filter((i: any) => selectedIds.includes(i.id));
    } else {
      const loadToast = toast.loading('Menyiapkan pratinjau seluruh halaman...');
      try {
        const res = await api.get('/pendapatan', {
          params: { ...filters, limit: 10000, page: 1 },
        });
        dataToPreview = res.data.data || [];
        toast.dismiss(loadToast);
      } catch (err) {
        toast.error('Gagal memuat pratinjau');
        toast.dismiss(loadToast);
        return;
      }
    }
    const headers = ['No.', 'Tgl', 'No. Bukti', 'Sumber', 'Uraian', 'Nilai (Rp)'];
    const body = dataToPreview.map((item: any, i: number) => [
      i + 1,
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.nomor_bukti,
      item.id_sumber_dana,
      item.uraian,
      formatCurrency(item.nilai),
    ]);
    const totalVal = dataToPreview.reduce(
      (acc: number, curr: any) => acc + parseFloat(curr.nilai || 0),
      0
    );
    const foot = [['', '', '', '', 'TOTAL NILAI', formatCurrency(totalVal)]];
    const url = previewPDF(headers, body, 'PRATINJAU LAPORAN ARSIP KAS MASUK', foot);
    setPreviewPdf(url);
  };

  const handleDownloadTemplate = () => {
    const headers = ['Tanggal', 'Nomor Bukti', 'ID Sumber Dana', 'Nilai', 'Uraian'];
    const sample = [
      format(new Date(), 'yyyy-MM-dd'),
      'STS/001/2026',
      'SD-PAD',
      '500000000',
      'Penerimaan PAD dari Pajak Hotel',
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_Import_Pendapatan.xlsx');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);
        const data = (rawData as any[]).filter(
          (row) =>
            Object.keys(row).length > 0 &&
            (row.Tanggal || row['No. Bukti'] || row.Nilai)
        );
        if (data.length === 0) {
          toast.error('File Excel kosong atau tidak terbaca');
          return;
        }
        setConfirmState({
          isOpen: true,
          title: 'Konfirmasi Impor',
          message: `Impor ${data.length} data pendapatan baru ke dalam sistem?`,
          type: 'question',
          onConfirm: async () => {
            setConfirmState((prev) => ({ ...prev, isLoading: true }));
            setLoading(true);
            try {
              const formData = new FormData();
              if (file) formData.append('file', file);
              formData.append('mode', 'add');
              formData.append('tahun', new Date().getFullYear().toString());
              const firstRow = data[0];
              const dateKey = Object.keys(firstRow).find(
                (k) =>
                  k.toLowerCase().includes('tanggal') ||
                  k.toLowerCase().includes('tgl')
              );
              const firstDate = dateKey ? firstRow[dateKey] : null;
              if (firstDate) {
                let d: Date;
                if (typeof firstDate === 'number') {
                  d = new Date(Math.round((firstDate - 25569) * 86400 * 1000));
                } else {
                  d = new Date(firstDate);
                }
                if (!isNaN(d.getTime())) {
                  formData.append('bulan', (d.getMonth() + 1).toString());
                  formData.append('tahun', d.getFullYear().toString());
                } else {
                  formData.append('tahun', new Date().getFullYear().toString());
                }
              } else {
                formData.append('tahun', new Date().getFullYear().toString());
              }
              const res = await api.post('/pendapatan/import-bulk', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
              });
              const { successCount, skippedCount, errorCount, errors } = res.data;
              if (errorCount > 0) {
                toast.warning(`Impor selesai dengan ${errorCount} data dilewati.`, {
                  description: (
                    <div className="mt-2 space-y-1">
                      <p className="font-semibold text-xs text-orange-800">Detail Masalah:</p>
                      <ul className="list-disc pl-4 text-micro text-orange-700 max-h-32 overflow-y-auto">
                        {errors?.map((err: string, i: number) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                      <p className="mt-2 text-micro italic">
                        {successCount} data lainnya berhasil diimpor.
                      </p>
                    </div>
                  ),
                  duration: 8000,
                });
              } else {
                toast.success(`Berhasil mengimpor ${successCount} data pendapatan.`, {
                  description:
                    skippedCount > 0
                      ? `${skippedCount} data duplikat diabaikan.`
                      : undefined,
                });
              }
            } catch (err: any) {
              console.error('Bulk Import Error:', err);
              const errMsg =
                err.response?.data?.error ||
                err.response?.data?.message ||
                'Gagal melakukan import massal';
              toast.error('Gagal Impor', { description: errMsg, duration: 5000 });
            } finally {
              mutateArchive();
              setLoading(false);
              setConfirmState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
            }
          },
        });
      } catch (err) {
        toast.error('Gagal memproses file. Pastikan format sesuai template.');
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const fetchCashStats = async () => {
    setLoadingCashStats(true);
    try {
      const res = await api.get('/reports/dashboard-stats', {
        params: { tahun: new Date().getFullYear() },
      });
      setCashStats(res.data.stats || []);
    } catch (err) {
      toast.error('Gagal memuat rincian saldo kas');
    } finally {
      setLoadingCashStats(false);
    }
  };

  useEffect(() => {
    if (isCashMonitorOpen) fetchCashStats();
  }, [isCashMonitorOpen]);

  const fetchSumberDana = async () => {
    try {
      const res = await api.get('/dss/sumber-dana');
      setSumberDanaList(res.data);
    } catch (err) {
      toast.error('Gagal memuat daftar sumber dana');
    }
  };

  useEffect(() => {
    fetchSumberDana();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getFileUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    let baseUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || '';
    if (!baseUrl && typeof window !== 'undefined') {
      baseUrl = `${window.location.protocol}//${window.location.hostname}:5000`;
    }
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.id_sumber_dana || formData.nilai <= 0) {
      toast.error('Lengkapi data dengan benar');
      return;
    }
    setLoading(true);
    const dataToSend = new FormData();
    Object.entries(formData).forEach(([key, value]) => {
      dataToSend.append(key, value.toString());
    });
    if (selectedFile) dataToSend.append('file', selectedFile);
    try {
      if (editId) {
        await api.put(`/pendapatan/${editId}`, dataToSend);
        toast.success('Berhasil Diperbarui', {
          description: 'Data transaksi pendapatan telah diperbarui dalam database.',
        });
      } else {
        const res = await api.post('/pendapatan', dataToSend);
        toast.success('Berhasil Disimpan', {
          description:
            res.data.message +
            (res.data.settledCount > 0
              ? ` (${res.data.settledCount} talangan dilunasi secara otomatis)`
              : ''),
        });
      }
      setFormData({
        tanggal: new Date().toISOString().split('T')[0],
        nomor_bukti: '',
        uraian: '',
        id_sumber_dana: '',
        nilai: 0,
      });
      setSelectedFile(null);
      setEditId(null);
      setActiveTab('arsip');
      fetchSumberDana();
      mutateArchive();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan pendapatan');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBulk = async () => {
    if (!selectedIds.length) return;
    setConfirmState({
      isOpen: true,
      title: 'Hapus Data Terpilih?',
      message: `Apakah Anda yakin ingin menghapus ${selectedIds.length} data pendapatan secara permanen? Tindakan ini tidak dapat dibatalkan.`,
      type: 'danger',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isLoading: true }));
        try {
          await api.delete('/pendapatan/bulk', { data: { ids: selectedIds } });
          toast.success('Berhasil Menghapus', {
            description: `${selectedIds.length} data telah dihapus secara permanen.`,
          });
          setSelectedIds([]);
          mutateArchive();
          setConfirmState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          toast.error('Gagal menghapus data masal');
          setConfirmState((prev) => ({ ...prev, isLoading: false }));
        }
      },
    });
  };

  const handleEdit = (item: any) => {
    setFormData({
      tanggal: format(new Date(item.tanggal), 'yyyy-MM-dd'),
      nomor_bukti: item.nomor_bukti,
      uraian: item.uraian,
      id_sumber_dana: item.id_sumber_dana,
      nilai: item.nilai,
    });
    setEditId(item.id);
    setActiveTab('rekam');
  };

  const handleDelete = async (id: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Hapus Transaksi?',
      message:
        'Apakah Anda yakin ingin menghapus data pendapatan ini? Data yang dihapus akan hilang dari buku kas.',
      type: 'danger',
      onConfirm: async () => {
        setConfirmState((prev) => ({ ...prev, isLoading: true }));
        try {
          await api.delete(`/pendapatan/${id}`);
          toast.success('Data berhasil dihapus');
          mutateArchive();
          setConfirmState((prev) => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          toast.error('Gagal menghapus data');
          setConfirmState((prev) => ({ ...prev, isLoading: false }));
        }
      },
    });
  };

  const handleClone = (item: any) => {
    setFormData({
      tanggal: new Date().toISOString().split('T')[0],
      nomor_bukti: `${item.nomor_bukti}_COPY`,
      uraian: item.uraian,
      id_sumber_dana: item.id_sumber_dana,
      nilai: item.nilai,
    });
    setEditId(null);
    setActiveTab('rekam');
    toast.info('Data telah diduplikasi', {
      description:
        'Silakan sesuaikan nomor bukti dan tanggal sebelum menyimpan.',
    });
  };

  const handleQuickFilter = (type: string) => {
    const now = new Date();
    if (type === 'bulan_ini') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .split('T')[0];
      setFilters({ ...filters, tgl_awal: firstDay, tgl_akhir: lastDay });
    } else if (type === 'bulan_lalu') {
      const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        .toISOString()
        .split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
        .toISOString()
        .split('T')[0];
      setFilters({ ...filters, tgl_awal: firstDay, tgl_akhir: lastDay });
    } else if (type === 'besar') {
      setFilters({ ...filters, min_nilai: '100000000' });
    } else if (type === 'reset') {
      setFilters({
        search: '',
        id_sumber_dana: '',
        tgl_awal: '',
        tgl_akhir: '',
        min_nilai: '',
      });
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const isFiltered = !!(
    filters.search ||
    filters.id_sumber_dana ||
    filters.tgl_awal ||
    filters.tgl_akhir ||
    filters.min_nilai
  );

  return (
    <div className="max-w-[1450px] mx-auto space-y-6 pb-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">

      {/* PAGE HEADER */}
      <PageHeader
        title={activeTab === 'rekam' ? 'Input Kas Masuk' : 'Arsip Kas Masuk'}
        description="Pendapatan Transaction Registry & Document Archive"
        icon={<LayoutTemplate className="size-6 text-fin-income" />}
        actions={
          <div className="flex items-center gap-3">
            <div className="bg-fin-subtle p-1 rounded-lg border border-fin-border">
              <Tabs
                value={activeTab}
                onValueChange={(v) => setActiveTab(v as any)}
                className="w-auto"
              >
                <TabsList className="bg-transparent h-auto p-0">
                  <TabsTrigger
                    value="rekam"
                    className="px-5 py-2 rounded-lg text-xs font-medium data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2"
                  >
                    <PlusSquare size={14} /> Perekaman Baru
                  </TabsTrigger>
                  <TabsTrigger
                    value="arsip"
                    className="px-5 py-2 rounded-lg text-xs font-medium data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2"
                  >
                    <Database size={14} /> Arsip Data
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <Button
              variant="outline"
              size="md"
              leftIcon={<Banknote size={16} />}
              onClick={() => setIsCashMonitorOpen(true)}
            >
              Monitor Kas
            </Button>
          </div>
        }
      />

      <AnimatePresence mode="wait">
        {activeTab === 'rekam' ? (
          <motion.div
            key="rekam"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* ── FORM ──────────────────────────────────────────────────── */}
            <div className="lg:col-span-8">
              <div className="bg-fin-surface rounded-xl shadow-sm border border-fin-border overflow-hidden relative group">
                <div className="absolute top-0 left-0 w-1.5 h-full bg-fin-subtle group-focus-within:bg-ds-accent transition-colors duration-300" />
                <div className="p-8">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-ds-primary rounded-xl flex items-center justify-center text-ds-primary-fg shadow-sm">
                        <PlusSquare size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-fin-text-primary">
                          Input Data Pendapatan
                        </h3>
                        <p className="text-mini text-fin-text-muted mt-0.5">
                          Pencatatan STS / SP2B Tahun Anggaran {new Date().getFullYear()}
                        </p>
                      </div>
                    </div>
                    {editId && (
                      <span className="px-3 py-1 bg-fin-warning-bg rounded-full text-micro font-bold text-fin-warning-text border border-fin-warning/20 uppercase tracking-widest">
                        Mode Edit Aktif
                      </span>
                    )}
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField label="Tanggal Penerimaan" htmlFor="tanggal" required>
                        <Input
                          id="tanggal"
                          type="date"
                          value={formData.tanggal}
                          onChange={(e) =>
                            setFormData({ ...formData, tanggal: e.target.value })
                          }
                          required
                        />
                      </FormField>

                      <FormField label="Nomor Bukti / STS" htmlFor="nomor_bukti" required>
                        <Input
                          id="nomor_bukti"
                          type="text"
                          placeholder="Contoh: STS/001/2026"
                          value={formData.nomor_bukti}
                          onChange={(e) =>
                            setFormData({ ...formData, nomor_bukti: e.target.value })
                          }
                          required
                        />
                      </FormField>
                    </div>

                    <FormField label="Sumber Dana Tujuan" required>
                      <Combobox
                        value={formData.id_sumber_dana}
                        onValueChange={(v) => setFormData({ ...formData, id_sumber_dana: v })}
                        placeholder="Pilih Sumber Dana..."
                        className="w-full h-input"
                        options={sumberDanaList.map((sd: any) => ({ value: sd.id, label: sd.nama }))}
                      />
                    </FormField>

                    <FormField label="Nilai Penerimaan (Rp)" required>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-micro font-bold text-fin-text-muted/60 z-10 pointer-events-none">
                          IDR
                        </div>
                        <NumericInput
                          className="w-full pl-12 pr-4 py-5 bg-fin-page border border-fin-border rounded-lg focus-visible:ring-2 focus-visible:ring-ds-focus-ring/15 focus-visible:border-ds-focus-ring/60 outline-none transition-all font-black text-ds-accent text-3xl tracking-tighter h-auto shadow-none"
                          value={formData.nilai}
                          onValueChange={(v) => setFormData({ ...formData, nilai: v })}
                          required
                        />
                      </div>
                    </FormField>

                    <FormField label="Uraian / Deskripsi" required>
                      <Textarea
                        className="bg-fin-page border-fin-border min-h-[100px] text-sm text-fin-text-primary"
                        placeholder="Deskripsikan penerimaan kas secara lengkap..."
                        value={formData.uraian}
                        onChange={(e) =>
                          setFormData({ ...formData, uraian: e.target.value })
                        }
                        required
                      />
                    </FormField>

                    <FormField label="Bukti Lampiran (Opsional)">
                      <div
                        className={cn(
                          'relative border-2 border-dashed rounded-xl p-6 transition-all flex flex-col items-center justify-center gap-2 cursor-pointer',
                          selectedFile
                            ? 'border-fin-income bg-fin-income-bg'
                            : 'border-fin-border hover:border-ds-accent bg-fin-page'
                        )}
                      >
                        <input
                          type="file"
                          className="absolute inset-0 opacity-0 cursor-pointer"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                        />
                        {selectedFile ? (
                          <>
                            <ShieldCheck className="text-fin-income" size={28} />
                            <span className="text-xs font-semibold text-fin-income-text">
                              {selectedFile.name}
                            </span>
                            <span className="text-micro text-fin-income-text/70 font-medium uppercase tracking-wide">
                              {(selectedFile.size / 1024).toFixed(1)} KB — READY TO UPLOAD
                            </span>
                          </>
                        ) : (
                          <>
                            <FileUp className="text-fin-text-muted/30" size={28} />
                            <span className="text-xs font-medium text-fin-text-muted">
                              Klik atau seret file ke sini
                            </span>
                            <span className="text-micro text-fin-text-muted/50 font-medium uppercase tracking-wider">
                              PDF, JPG, ATAU PNG (MAKS. 5MB)
                            </span>
                          </>
                        )}
                      </div>
                    </FormField>

                    <div className="pt-2 flex flex-col gap-3">
                      <Button
                        type="submit"
                        variant="primary"
                        size="lg"
                        loading={loading}
                        leftIcon={
                          editId ? <RefreshCw size={18} /> : <Save size={18} />
                        }
                        className="w-full uppercase tracking-widest"
                      >
                        {editId ? 'Perbarui Transaksi' : 'Simpan Transaksi Kas Masuk'}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="md"
                        className="w-full text-fin-expense hover:text-fin-expense-text hover:bg-fin-expense-bg uppercase tracking-widest text-xs"
                        onClick={() => {
                          setEditId(null);
                          setFormData({
                            tanggal: new Date().toISOString().split('T')[0],
                            nomor_bukti: '',
                            uraian: '',
                            id_sumber_dana: '',
                            nilai: 0,
                          });
                          setActiveTab('arsip');
                        }}
                      >
                        {editId ? 'Batalkan Edit' : 'Batalkan & Kembali'}
                      </Button>
                    </div>
                  </form>
                </div>
              </div>
            </div>

            {/* ── HINT CARDS ──────────────────────────────────────────────── */}
            <div className="lg:col-span-4 space-y-4">
              <Card className="bg-ds-primary p-6 rounded-xl text-ds-primary-fg shadow-lg relative overflow-hidden group border-none">
                <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform duration-1000">
                  <Activity size={160} />
                </div>
                <h4 className="text-xs font-semibold text-fin-info mb-4">
                  Informasi Sistem
                </h4>
                <p className="text-xs leading-relaxed opacity-80">
                  Pencatatan kas masuk akan secara otomatis melunasi antrean Dana
                  Talangan aktif secara kronologis (FIFO).
                </p>
              </Card>

              <Card className="bg-fin-income-bg p-6 rounded-xl border border-fin-income/20 flex items-start gap-4">
                <div className="w-10 h-10 bg-fin-surface rounded-lg flex items-center justify-center text-fin-income shrink-0 shadow-sm">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-fin-income-text">
                    Validasi Rekon
                  </p>
                  <p className="text-xs text-fin-income-text opacity-80 mt-1.5 leading-relaxed">
                    Pastikan No. Bukti sesuai dengan STS Bank untuk memudahkan proses
                    rekonsiliasi otomatis.
                  </p>
                </div>
              </Card>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="arsip"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {/* ── STATS ───────────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="lux-stat lux-stat-navy p-4 rounded-xl flex flex-col group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-bold text-blue-200/70 uppercase tracking-wider">Total Pendapatan (Periode)</span>
                  <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                    <Banknote className="w-3.5 h-3.5 text-blue-200" />
                  </div>
                </div>
                <p className="text-xl font-bold text-white truncate tabular-nums">
                  {formatCurrency(totalNilai || 0)}
                </p>
              </div>

              <div className="lux-stat lux-stat-emerald p-4 rounded-xl flex flex-col group">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px] font-bold text-emerald-200/70 uppercase tracking-wider">Total Transaksi Penerimaan</span>
                  <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                    <Activity className="w-3.5 h-3.5 text-emerald-200" />
                  </div>
                </div>
                <p className="text-xl font-bold text-white tabular-nums">
                  {totalData || 0} Records
                </p>
              </div>

              {(() => {
                const sortedMonths = [...monthlyTotals].sort(
                  (a, b) => b.bulan - a.bulan
                );
                const latest = sortedMonths[0];
                const previous = sortedMonths[1];
                const growth =
                  latest && previous && previous.total > 0
                    ? ((latest.total - previous.total) / previous.total) * 100
                    : null;
                const monthName = latest
                  ? new Date(0, latest.bulan - 1).toLocaleString('id-ID', {
                      month: 'long',
                    })
                  : '-';
                const prevMonthName = previous
                  ? new Date(0, previous.bulan - 1).toLocaleString('id-ID', {
                      month: 'short',
                    })
                  : 'Lalu';
                return (
                  <div className="lux-stat lux-stat-violet p-4 rounded-xl flex flex-col group">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[9px] font-bold text-violet-200/70 uppercase tracking-wider">
                        Tren Pertumbuhan ({monthName})
                      </span>
                      <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                        {growth !== null && growth < 0 ? (
                          <TrendingDown className="w-3.5 h-3.5 text-red-200" />
                        ) : (
                          <TrendingUp className="w-3.5 h-3.5 text-violet-200" />
                        )}
                      </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className={cn(
                          'text-xl font-bold',
                          growth === null ? 'text-white' : growth >= 0 ? 'text-emerald-200' : 'text-red-200'
                        )}
                      >
                        {growth !== null
                          ? `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`
                          : 'Flat / N/A'}
                      </p>
                      <p className="text-[10px] text-violet-200/60 font-medium">
                        Vs {prevMonthName}
                      </p>
                    </div>
                    <p className="text-[10px] text-violet-200/50 mt-1 font-medium truncate">
                      {growth !== null
                        ? `Penerimaan ${growth >= 0 ? 'meningkat' : 'menurun'} ${formatCurrency(Math.abs(latest.total - previous.total))}`
                        : 'Data pembanding belum tersedia'}
                    </p>
                  </div>
                );
              })()}
            </div>

            {/* ── FILTER BAR ─────────────────────────────────────────────── */}
            <Card className="rounded-xl border border-fin-border bg-fin-surface shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-fin-border">
                <FilterBar
                  isFiltered={isFiltered}
                  onReset={() => handleQuickFilter('reset')}
                  actions={
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                        className={cn(
                          showFilters
                            ? 'border-fin-text-primary text-fin-text-primary bg-fin-page'
                            : 'text-fin-text-muted'
                        )}
                        leftIcon={<Filter size={13} />}
                      >
                        Filter
                      </Button>

                      <div className="h-4 w-px bg-fin-border mx-0.5" />

                      <div className="flex items-center gap-1 p-1 bg-fin-page border border-fin-border rounded-lg">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleDownloadTemplate}
                          leftIcon={<FileSpreadsheet size={13} />}
                          className="h-7 px-3 text-micro font-bold text-fin-text-muted hover:text-fin-info-text"
                        >
                          Template
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => importRef.current?.click()}
                          leftIcon={<FileUp size={13} />}
                          className="h-7 px-3 text-micro font-bold text-fin-text-muted hover:text-fin-info-text"
                        >
                          Import
                        </Button>
                        <input
                          type="file"
                          ref={importRef}
                          className="hidden"
                          onChange={handleImport}
                          accept=".xlsx, .xls"
                        />
                      </div>

                      <div className="h-4 w-px bg-fin-border mx-0.5" />

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrintPDF}
                        leftIcon={<Printer size={13} className="text-fin-info-text" />}
                      >
                        Cetak
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportExcel}
                        leftIcon={<Download size={13} className="text-fin-income-text" />}
                      >
                        Export
                      </Button>
                    </div>
                  }
                >
                  <SearchInput
                    value={filters.search}
                    onValueChange={(v) => setFilters({ ...filters, search: v })}
                    placeholder="Cari bukti / uraian..."
                    className="w-60"
                  />
                </FilterBar>
              </div>

              {/* Advanced filters (collapsible) */}
              <AnimatePresence>
                {showFilters && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="bg-fin-page border-b border-fin-border overflow-hidden"
                  >
                    <div className="p-5 grid grid-cols-1 md:grid-cols-4 gap-5">
                      <FormField label="Sumber Dana">
                        <Combobox
                          value={filters.id_sumber_dana || 'all'}
                          onValueChange={(v) => setFilters({ ...filters, id_sumber_dana: v === 'all' ? '' : v })}
                          placeholder="Semua Sumber Dana"
                          className="w-full"
                          size="sm"
                          options={[
                            { value: 'all', label: 'Semua Sumber Dana' },
                            ...sumberDanaList.map((sd: any) => ({ value: sd.id, label: sd.nama })),
                          ]}
                        />
                      </FormField>

                      <FormField label="Mulai Tanggal">
                        <div className="relative">
                          <Calendar
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-fin-text-muted pointer-events-none"
                            size={14}
                          />
                          <Input
                            type="date"
                            className="pl-9"
                            value={filters.tgl_awal}
                            onChange={(e) =>
                              setFilters({ ...filters, tgl_awal: e.target.value })
                            }
                          />
                        </div>
                      </FormField>

                      <FormField label="Sampai Tanggal">
                        <div className="relative">
                          <Calendar
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-fin-text-muted pointer-events-none"
                            size={14}
                          />
                          <Input
                            type="date"
                            className="pl-9"
                            value={filters.tgl_akhir}
                            onChange={(e) =>
                              setFilters({ ...filters, tgl_akhir: e.target.value })
                            }
                          />
                        </div>
                      </FormField>

                      <FormField label="Aksi Cepat">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => handleQuickFilter('bulan_ini')}
                          >
                            Bulan Ini
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleQuickFilter('reset')}
                            title="Reset Filter"
                          >
                            <RefreshCw size={14} />
                          </Button>
                        </div>
                      </FormField>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>

            {/* ── TABLE ───────────────────────────────────────────────────── */}
            <Card className="rounded-xl border border-fin-border overflow-hidden bg-fin-surface shadow-sm">
              <div className="overflow-x-auto min-h-[400px]">
                {fetching ? (
                  <div className="flex flex-col items-center justify-center py-40 text-fin-text-muted gap-4">
                    <Loader2 className="animate-spin" size={40} />
                    <p className="font-semibold text-mini uppercase tracking-widest">
                      Sinkronisasi Database Pendapatan...
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-fin-page border-b border-fin-border hover:bg-fin-page">
                        <TableHead className="w-12 px-4 py-3 text-center">
                          <button
                            onClick={() => {
                              if (
                                selectedIds.length === archiveData.length &&
                                archiveData.length > 0
                              )
                                setSelectedIds([]);
                              else
                                setSelectedIds(
                                  archiveData.map((i: any) => i.id)
                                );
                            }}
                            className="text-fin-text-muted hover:text-fin-info transition-colors"
                          >
                            {selectedIds.length === archiveData.length &&
                            archiveData.length > 0 ? (
                              <CheckSquare size={16} />
                            ) : (
                              <Square size={16} />
                            )}
                          </button>
                        </TableHead>
                        <TableHead className="px-4 py-3 text-micro font-bold text-fin-text-muted uppercase tracking-wide">
                          Tanggal
                        </TableHead>
                        <TableHead className="px-4 py-3 text-micro font-bold text-fin-text-muted uppercase tracking-wide">
                          Nomor Bukti
                        </TableHead>
                        <TableHead className="px-4 py-3 text-micro font-bold text-fin-text-muted uppercase tracking-wide">
                          Sumber Dana / Rekening
                        </TableHead>
                        <TableHead className="px-4 py-3 text-micro font-bold text-fin-text-muted uppercase tracking-wide">
                          Keterangan &amp; Lampiran
                        </TableHead>
                        <TableHead className="px-4 py-3 text-micro font-bold text-fin-text-muted uppercase tracking-wide text-right">
                          Nilai (Rp)
                        </TableHead>
                        <TableHead className="px-4 py-3 text-micro font-bold text-fin-text-muted uppercase tracking-wide text-center">
                          Status
                        </TableHead>
                        <TableHead className="px-4 py-3 text-micro font-bold text-fin-text-muted uppercase tracking-wide text-center">
                          Audit
                        </TableHead>
                        <TableHead className="px-4 py-3 text-micro font-bold text-fin-text-muted uppercase tracking-wide text-center">
                          Bukti
                        </TableHead>
                        <TableHead className="px-4 py-3 text-micro font-bold text-fin-text-muted uppercase tracking-wide text-center">
                          Aksi
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-fin-border/50">
                      {archiveData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="py-32 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <FileSignature size={40} className="text-fin-subtle" />
                              <p className="text-fin-text-muted font-medium text-sm">
                                Belum ada data pendapatan yang tercatat.
                              </p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        archiveData.map((item: any, idx: number) => (
                          <TableRow
                            key={idx}
                            className={cn(
                              'transition-all',
                              selectedIds.includes(item.id)
                                ? 'bg-fin-subtle'
                                : 'hover:bg-fin-page'
                            )}
                          >
                            <TableCell className="px-4 py-3 text-center">
                              <button
                                onClick={() =>
                                  setSelectedIds((prev) =>
                                    prev.includes(item.id)
                                      ? prev.filter((i) => i !== item.id)
                                      : [...prev, item.id]
                                  )
                                }
                                className={cn(
                                  'transition-colors',
                                  selectedIds.includes(item.id)
                                    ? 'text-fin-info'
                                    : 'text-fin-border hover:text-fin-text-muted'
                                )}
                              >
                                {selectedIds.includes(item.id) ? (
                                  <CheckSquare size={16} />
                                ) : (
                                  <Square size={16} />
                                )}
                              </button>
                            </TableCell>

                            <TableCell className="px-4 py-3">
                              <p className="text-sm font-semibold text-fin-text-primary flex items-center gap-1.5">
                                <Calendar
                                  size={13}
                                  className="text-fin-text-muted shrink-0"
                                />
                                {(() => {
                                  if (!item.tanggal) return '-';
                                  const datePart = item.tanggal.split('T')[0];
                                  const [year, month, day] = datePart.split('-');
                                  const months = [
                                    'Jan','Feb','Mar','Apr','Mei','Jun',
                                    'Jul','Agu','Sep','Okt','Nov','Des',
                                  ];
                                  return `${day} ${months[parseInt(month) - 1]} ${year}`;
                                })()}
                              </p>
                            </TableCell>

                            <TableCell className="px-4 py-3">
                              <p className="text-sm font-bold text-fin-text-primary tracking-tight">
                                {item.nomor_bukti || '-'}
                              </p>
                            </TableCell>

                            <TableCell className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-fin-page border border-fin-border flex items-center justify-center text-fin-text-muted">
                                  <Database size={14} />
                                </div>
                                <div className="flex flex-col">
                                  <p className="text-mini font-semibold text-fin-text-primary tracking-tight uppercase">
                                    {item.id_sumber_dana}
                                  </p>
                                  <p className="text-[9px] font-medium text-fin-text-muted uppercase">
                                    Rekening Kas Daerah
                                  </p>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="px-4 py-3">
                              <div className="flex flex-col gap-1">
                                <p className="text-xs font-medium text-fin-text-muted leading-relaxed max-w-[250px] truncate">
                                  {item.uraian}
                                </p>
                                {item.file_url && (
                                  <Badge
                                    variant="outline"
                                    className="w-fit text-[9px] font-bold text-fin-income-text bg-fin-income-bg border-fin-income/30 px-2 py-0.5 rounded-lg"
                                  >
                                    <ShieldCheck size={10} className="mr-1" />
                                    VERIFIED DOCUMENT
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="px-4 py-3 text-right">
                              <span className="text-sm font-bold text-fin-text-primary tabular-nums">
                                {formatCurrency(item.nilai)}
                              </span>
                            </TableCell>

                            <TableCell className="px-4 py-3 text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'px-2.5 py-0.5 rounded-full text-micro font-bold border uppercase',
                                    item.status_rekon === 'SUDAH'
                                      ? 'bg-fin-income-bg text-fin-income-text border-fin-income/20'
                                      : 'bg-fin-page text-fin-text-muted border-fin-border'
                                  )}
                                >
                                  {item.status_rekon || 'BELUM'}
                                </Badge>
                                {item.selisih_rekon != 0 && (
                                  <Badge className="bg-fin-warning text-white border-none text-[9px] font-black px-1.5 py-0 shadow-sm animate-pulse">
                                    DIFF
                                  </Badge>
                                )}
                              </div>
                            </TableCell>

                            <TableCell className="px-4 py-3 text-center">
                              <button
                                onClick={() =>
                                  setRekonModal({
                                    id: item.id,
                                    nilai: item.nilai,
                                    selisih: item.selisih_rekon || 0,
                                    keterangan: item.keterangan_rekon || '',
                                    status: item.status_rekon || 'BELUM',
                                  })
                                }
                                className={cn(
                                  'inline-flex items-center px-2.5 py-1 rounded-lg text-micro font-bold border mx-auto transition-all',
                                  item.selisih_rekon != 0
                                    ? 'bg-fin-warning text-white border-fin-warning hover:opacity-90'
                                    : 'bg-fin-surface text-fin-text-muted border-fin-border hover:border-fin-info hover:text-fin-info'
                                )}
                              >
                                {item.selisih_rekon != 0 ? 'FIX DIFF' : 'CEK'}
                              </button>
                            </TableCell>

                            <TableCell className="px-4 py-3 text-center">
                              {item.file_url ? (
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() =>
                                    setPreviewPdf(getFileUrl(item.file_url))
                                  }
                                  className="mx-auto bg-fin-income-bg text-fin-income-text border border-fin-income/20 hover:bg-fin-income/10 rounded-xl"
                                  title="Pratinjau Bukti Fisik"
                                >
                                  <FileSearch size={16} />
                                </Button>
                              ) : (
                                <div className="w-7 h-7 mx-auto flex items-center justify-center bg-fin-page text-fin-border rounded-lg border border-fin-border">
                                  <Paperclip size={15} />
                                </div>
                              )}
                            </TableCell>

                            <TableCell className="px-4 py-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleClone(item)}
                                  title="Duplikasi"
                                  className="hover:text-ds-accent"
                                >
                                  <RefreshCw size={14} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleEdit(item)}
                                  title="Edit"
                                  className="hover:text-ds-accent"
                                >
                                  <Edit size={14} />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  onClick={() => handleDelete(item.id)}
                                  title="Hapus"
                                  className="hover:text-fin-expense"
                                >
                                  <Trash2 size={14} />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>

              {/* Pagination (server-side) */}
              <div className="px-5 py-4 bg-fin-page border-t border-fin-border flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                  <p className="text-xs font-medium text-fin-text-muted">
                    {totalData === 0
                      ? 'Tidak ada data'
                      : `Menampilkan ${(currentPage - 1) * limit + 1}–${Math.min(
                          currentPage * limit,
                          totalData
                        )} dari ${totalData} entri`}
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setLimit(totalData)}
                    className="text-micro font-bold uppercase tracking-widest"
                  >
                    Tampilkan Semua
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((prev) => prev - 1)}
                    className="h-9 w-9 p-0"
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <div className="h-9 px-5 bg-fin-surface border border-fin-border rounded-lg flex items-center justify-center text-xs font-semibold text-fin-text-primary min-w-[90px]">
                    Hal {currentPage} / {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((prev) => prev + 1)}
                    className="h-9 w-9 p-0"
                  >
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FLOATING BULK ACTION BAR ──────────────────────────────────────── */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100]"
          >
            <div className="bg-ds-primary text-ds-primary-fg px-6 py-4 rounded-xl shadow-2xl flex items-center gap-8 border border-white/10">
              <div className="flex items-center gap-4 border-r border-white/10 pr-8">
                <div className="w-10 h-10 bg-ds-accent rounded-xl flex items-center justify-center shadow-inner">
                  <Database size={20} />
                </div>
                <div>
                  <p className="text-sm font-bold leading-tight">
                    {selectedIds.length} Data Terpilih
                  </p>
                  <p className="text-micro text-white/60">
                    Arsip Kas Masuk (Pendapatan)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="destructive"
                  size="md"
                  onClick={handleDeleteBulk}
                  leftIcon={<Trash2 size={16} />}
                >
                  Hapus Permanen
                </Button>
                <Button
                  variant="ghost"
                  size="md"
                  onClick={() => setSelectedIds([])}
                  className="text-white/70 hover:text-white hover:bg-white/10"
                >
                  Batalkan
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── PDF PREVIEW MODAL ─────────────────────────────────────────────── */}
      <Dialog open={!!previewPdf} onOpenChange={() => setPreviewPdf(null)}>
        <DialogContent
          size="xl"
          showCloseButton={false}
          className="max-w-6xl h-[90vh] flex flex-col overflow-hidden p-0 gap-0"
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-fin-border bg-fin-page shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-ds-primary rounded-lg flex items-center justify-center text-ds-primary-fg">
                <FileText size={15} />
              </div>
              <div>
                <p className="text-sm font-semibold text-fin-text-primary">
                  Bukti Penerimaan
                </p>
                <p className="text-mini text-fin-text-muted">
                  Pratinjau Digital STS / Bukti Setor
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(previewPdf!, '_blank')}
              >
                Buka di Tab Baru
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPreviewPdf(null)}
                className="text-fin-text-muted hover:text-fin-expense"
              >
                <X size={18} />
              </Button>
            </div>
          </div>
          <div className="flex-1 w-full bg-slate-100">
            <iframe
              src={`${previewPdf}#toolbar=1&navpanes=0`}
              className="w-full h-full border-none"
              title="PDF Preview"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* ── CASH MONITOR DRAWER ───────────────────────────────────────────── */}
      <AnimatePresence>
        {isCashMonitorOpen && (
          <div className="fixed inset-0 z-[300] flex justify-end bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-5xl bg-fin-page h-full shadow-2xl flex flex-col"
            >
              <div className="p-8 bg-ds-primary text-ds-primary-fg shrink-0">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/10">
                    <Activity size={24} className="text-fin-info" />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsCashMonitorOpen(false)}
                    className="text-white/60 hover:text-white hover:bg-white/10"
                  >
                    <X size={24} />
                  </Button>
                </div>
                <h3 className="text-xl font-bold tracking-tight">Monitor Saldo Kas</h3>
                <p className="text-sm text-white/60 mt-1">
                  Informasi ketersediaan dana per rincian sumber dana
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {loadingCashStats ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <Loader2 className="animate-spin text-fin-info" size={32} />
                    <p className="text-xs font-bold text-fin-text-muted uppercase tracking-widest">
                      Sinkronisasi Data...
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {cashStats.map((item) => (
                      <Card
                        key={item.id}
                        className="p-5 border-fin-border hover:border-fin-info transition-all group shadow-sm hover:shadow-md bg-fin-surface"
                      >
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <Badge className="bg-fin-subtle text-ds-accent border-none text-micro font-bold px-2 mb-1">
                              {item.id}
                            </Badge>
                            <h4 className="text-sm font-bold text-fin-text-primary leading-tight">
                              {item.nama}
                            </h4>
                          </div>
                          <div className="text-right">
                            <p className="text-micro font-bold text-fin-text-muted uppercase tracking-wider">
                              Kas Efektif
                            </p>
                            <p
                              className={cn(
                                'text-lg font-extrabold tabular-nums',
                                item.kas_efektif > 0
                                  ? 'text-fin-income'
                                  : 'text-fin-expense'
                              )}
                            >
                              {formatCurrency(item.kas_efektif)}
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-fin-subtle">
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">
                              Total Masuk
                            </p>
                            <p className="text-xs font-bold text-fin-text-primary">
                              {formatCurrency(item.total_masuk)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">
                              Total Keluar
                            </p>
                            <p className="text-xs font-bold text-fin-expense">
                              {formatCurrency(item.total_keluar)}
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 bg-fin-subtle rounded-lg p-3 flex justify-between items-center">
                          <span className="text-micro font-bold text-fin-text-muted">
                            Saldo Buku:
                          </span>
                          <span className="text-micro font-extrabold text-fin-text-primary">
                            {formatCurrency(item.saldo_buku)}
                          </span>
                        </div>

                        {item.talangan_diberikan > 0 && (
                          <div className="mt-2 flex items-center gap-2 text-fin-expense-text px-1">
                            <Banknote size={12} />
                            <span className="text-[9px] font-bold uppercase">
                              Terikat Talangan: {formatCurrency(item.talangan_diberikan)}
                            </span>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-6 bg-fin-page border-t border-fin-border shrink-0">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={fetchCashStats}
                  loading={loadingCashStats}
                  leftIcon={<RefreshCw size={16} />}
                  className="w-full"
                >
                  Refresh Saldo
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        type={confirmState.type}
        isLoading={confirmState.isLoading}
      />

      {/* ── RECONCILIATION MODAL ──────────────────────────────────────────── */}
      <Dialog open={!!rekonModal} onOpenChange={() => setRekonModal(null)}>
        <DialogContent size="md">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-ds-primary rounded-xl flex items-center justify-center text-ds-primary-fg shrink-0">
                <RefreshCw size={18} />
              </div>
              <div>
                <DialogTitle>Audit Pendapatan</DialogTitle>
                <DialogDescription>
                  Verifikasi kecocokan dengan Bank Statement
                </DialogDescription>
              </div>
            </div>
            <div className="bg-fin-page rounded-xl p-4 border border-fin-border">
              <div className="flex justify-between items-center">
                <span className="text-micro font-bold text-fin-text-muted uppercase tracking-widest">
                  Nilai Buku
                </span>
                <span className="text-lg font-black text-fin-text-primary">
                  {formatCurrency(rekonModal?.nilai || 0)}
                </span>
              </div>
            </div>
          </DialogHeader>

          <DialogBody className="space-y-5">
            <FormField label="Status Rekon">
              <Combobox
                value={rekonModal?.status || ''}
                onValueChange={(v) => setRekonModal((prev) => (prev ? { ...prev, status: v } : null))}
                placeholder="Pilih Status"
                className="w-full h-input"
                options={[
                  { value: 'BELUM', label: 'BELUM REKON' },
                  { value: 'SUDAH', label: 'SUDAH SESUAI' },
                  { value: 'ANOMALI', label: 'ANOMALI / SELISIH' },
                ]}
              />
            </FormField>

            <FormField
              label="Selisih Nilai (Rp)"
              hint="Isi jika ada perbedaan antara buku dan bank"
            >
              <NumericInput
                value={rekonModal?.selisih || 0}
                onValueChange={(val) =>
                  setRekonModal((prev) => (prev ? { ...prev, selisih: val } : null))
                }
                className="h-input bg-fin-page border-fin-border font-bold text-fin-expense"
              />
            </FormField>

            <FormField label="Catatan Audit">
              <Textarea
                placeholder="Tambahkan catatan hasil rekonsiliasi..."
                value={rekonModal?.keterangan || ''}
                onChange={(e) =>
                  setRekonModal((prev) =>
                    prev ? { ...prev, keterangan: e.target.value } : null
                  )
                }
                className="bg-fin-page border-fin-border min-h-[80px] text-xs text-fin-text-primary"
              />
            </FormField>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" size="md" onClick={() => setRekonModal(null)}>
              Batalkan
            </Button>
            <Button
              variant="primary"
              size="md"
              loading={savingRekon}
              onClick={handleSaveRekon}
            >
              Simpan Audit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
