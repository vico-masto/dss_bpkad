'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  Search,
  Filter,
  MoreVertical,
  Edit,
  Trash2,
  FileText,
  Printer,
  Eye,
  X,
  Paperclip,
  Trash,
  FileSearch,
  Loader2,
  Calendar,
  Building2,
  ChevronDown,
  Download,
  AlertCircle,
  Database,
  ArrowRight,
  CheckSquare,
  Square,
  Banknote,
  CheckCircle2,
  FileUp,
  FileSpreadsheet,
  LayoutTemplate,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Activity,
  Sparkles,
  Save,
  Pencil,
  Copy,
  CalendarCheck,
  Receipt,
} from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcel, exportToPDF, printPDF, previewPDF, downloadTemplate } from '@/lib/exportUtils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import Sp2dForm from './Sp2dForm';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NumericInput } from "@/components/NumericInput";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from '@/components/patterns/page-header';


const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

export default function Sp2dUnifiedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const tabParam = searchParams.get('tab');
  
  // Tab State
  const [activeTab, setActiveTab] = useState<'rekam' | 'arsip'>(
    editId ? 'rekam' : (tabParam === 'rekam' ? 'rekam' : 'arsip')
  );

  // Sync tab with query param
  useEffect(() => {
    if (tabParam === 'rekam' || tabParam === 'arsip') {
      setActiveTab(tabParam as 'rekam' | 'arsip');
    }
  }, [tabParam]);

  const [currentPage, setCurrentPage] = useState(1);

  const [filters, setFilters] = useState({
    opd: '',
    jenis: '',
    status: '',
    search: '',
    startDate: '',
    endDate: '',
    onlySelisih: ''
  });

  const [isCashMonitorOpen, setIsCashMonitorOpen] = useState(false);
  const [cashStats, setCashStats] = useState<any[]>([]);
  const [loadingCashStats, setLoadingCashStats] = useState(false);

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [rekonModal, setRekonModal] = useState<{ id: number; selisih: any; keterangan: string; nilaiNeto: number; nilaiBank: any; tanggalPencairan: string } | null>(null);
  const [savingRekon, setSavingRekon] = useState(false);
  const [opdList, setOpdList] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [jenisList, setJenisList] = useState<string[]>([]);

  const [limit, setLimit] = useState(15);
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
    isLoading: false
  });

  const { data, isLoading, mutate } = useSWR(
    ['/sp2d', { ...filters, page: currentPage, limit }],
    ([url, params]) => fetcher(url, params)
  );

  const { data: missingStats } = useSWR(
    '/sp2d/missing-pencairan/stats',
    (url: string) => api.get(url).then(r => r.data),
    { revalidateOnFocus: false }
  );

  const { data: selisihStats } = useSWR(
    '/sp2d/selisih-potongan/stats',
    (url: string) => api.get(url).then(r => r.data),
    { revalidateOnFocus: false }
  );

  const { data: restorePreview, mutate: mutateRestorePreview } = useSWR(
    `/sp2d/restore-tanggal-pencairan/preview?tahun=${new Date().getFullYear()}`,
    (url: string) => api.get(url).then(r => r.data),
    { revalidateOnFocus: false }
  );

  const [restoreModal, setRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreLog, setRestoreLog] = useState<any[]>([]);

  const [bannerDismissed, setBannerDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem('pencairan_banner_dismissed') === '1';
  });

  useEffect(() => {
    fetchOpdList();
    fetchJenisList();
  }, []);

  const fetchJenisList = async () => {
    try {
      const res = await api.get('/sp2d/jenis');
      setJenisList(res.data);
    } catch (err) {}
  };

  const handleRestore = async (dryRun = false) => {
    setRestoring(true);
    try {
      const res = await api.post('/sp2d/restore-tanggal-pencairan', {
        tahun: new Date().getFullYear(),
        dry_run: dryRun
      });
      const d = res.data;
      setRestoreLog(d.log || []);
      if (dryRun) {
        toast.info(`Preview: ${d.restored_from_potongan + d.restored_from_bank} SP2D akan dipulihkan, ${d.tidak_ditemukan} tidak ditemukan.`);
      } else {
        toast.success(`Berhasil memulihkan ${d.restored_from_potongan + d.restored_from_bank} tanggal pencairan.`);
        mutateRestorePreview();
        mutate();
        setRestoreModal(false);
      }
    } catch (err: any) {
      toast.error('Gagal memulihkan data', { description: err.response?.data?.message });
    } finally {
      setRestoring(false);
    }
  };

  const fetchOpdList = async () => {
    try {
      const res = await api.get('/sp2d/opd');
      setOpdList(res.data);
    } catch (err) {}
  };

  const fetchCashStats = async () => {
    setLoadingCashStats(true);
    try {
      const res = await api.get('/reports/dashboard-stats', { params: { tahun: new Date().getFullYear() } });
      setCashStats(res.data.stats || []);
    } catch (err) {
      toast.error('Gagal memuat rincian saldo kas');
    } finally {
      setLoadingCashStats(false);
    }
  };

  useEffect(() => {
    if (isCashMonitorOpen) {
      fetchCashStats();
    }
  }, [isCashMonitorOpen]);

  const sp2dList = data?.data || [];

  const getFileUrl = (path: string) => {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    
    let baseUrl = '';
    if (process.env.NEXT_PUBLIC_API_URL) {
      baseUrl = process.env.NEXT_PUBLIC_API_URL.replace('/api', '');
    } else if (typeof window !== 'undefined') {
      // Robust detection: use current hostname but assume backend is on port 5000
      baseUrl = `${window.location.protocol}//${window.location.hostname}:5000`;
    }

    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${cleanPath}`;
  };

  const handleExportExcel = async () => {
    let dataToExport = [];
    
    if (selectedIds.length > 0) {
      dataToExport = sp2dList.filter((i: any) => selectedIds.includes(i.id));
    } else {
      const loadToast = toast.loading('Menyiapkan file excel seluruh halaman...');
      try {
        const res = await api.get('/sp2d', { 
          params: { ...filters, limit: 10000, page: 1 } 
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
      'Tanggal': format(new Date(item.tanggal), 'yyyy-MM-dd'),
      'Nomor': item.nomor,
      'OPD': item.opd,
      'Penerima': item.penerima,
      'Bruto': item.nilai_bruto,
      'Potongan': item.nilai_potongan,
      'Neto': item.nilai_neto,
      'Status': item.status_dana
    }));
    exportToExcel(exportData, `Arsip_SP2D_${format(new Date(), 'yyyyMMdd_HHmm')}`);
  };

  const handleExportPDF = async () => {
    let dataToExport = [];
    
    if (selectedIds.length > 0) {
      dataToExport = sp2dList.filter((i: any) => selectedIds.includes(i.id));
    } else {
      const loadToast = toast.loading('Menyiapkan data laporan seluruh halaman...');
      try {
        const res = await api.get('/sp2d', { 
          params: { ...filters, limit: 10000, page: 1 } 
        });
        dataToExport = res.data.data || [];
        toast.dismiss(loadToast);
      } catch (err) {
        toast.error('Gagal mengambil data lengkap');
        toast.dismiss(loadToast);
        return;
      }
    }

    const headers = ['No.', 'Tgl', 'Nomor', 'OPD', 'Sumber Dana', 'Uraian', 'Bruto (Rp)'];
    const body = dataToExport.map((item: any, i: number) => [
      i + 1,
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.nomor,
      item.opd,
      item.sumber_dana || '-',
      item.uraian,
      formatCurrency(item.nilai_bruto)
    ]);

    const totalBruto = dataToExport.reduce((acc: number, curr: any) => acc + parseFloat(curr.nilai_bruto || 0), 0);
    const foot = [['', '', '', '', '', 'TOTAL NILAI BRUTO', formatCurrency(totalBruto)]];

    exportToPDF(headers, body, `Arsip_SP2D_${format(new Date(), 'yyyyMMdd_HHmm')}`, 'LAPORAN ARSIP PENGELUARAN (SP2D)', foot);
  };

  const handlePrintPDF = async () => {
    let dataToPrint = [];
    
    if (selectedIds.length > 0) {
      dataToPrint = sp2dList.filter((i: any) => selectedIds.includes(i.id));
    } else {
      const loadToast = toast.loading('Menyiapkan dokumen cetak...');
      try {
        const res = await api.get('/sp2d', { 
          params: { ...filters, limit: 10000, page: 1 } 
        });
        dataToPrint = res.data.data || [];
        toast.dismiss(loadToast);
      } catch (err) {
        toast.error('Gagal memuat dokumen');
        toast.dismiss(loadToast);
        return;
      }
    }

    const headers = ['No.', 'Tgl', 'Nomor', 'OPD', 'Sumber Dana', 'Uraian', 'Bruto (Rp)'];
    const body = dataToPrint.map((item: any, i: number) => [
      i + 1,
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.nomor,
      item.opd,
      item.sumber_dana || '-',
      item.uraian,
      formatCurrency(item.nilai_bruto)
    ]);

    const totalBruto = dataToPrint.reduce((acc: number, curr: any) => acc + parseFloat(curr.nilai_bruto || 0), 0);
    const foot = [['', '', '', '', '', 'TOTAL NILAI BRUTO', formatCurrency(totalBruto)]];

    printPDF(headers, body, 'LAPORAN ARSIP PENGELUARAN (SP2D)', foot);
  };

  const handlePreviewReport = async () => {
    let dataToPreview = [];

    if (selectedIds.length > 0) {
      dataToPreview = sp2dList.filter((i: any) => selectedIds.includes(i.id));
    } else {
      const loadToast = toast.loading('Menyiapkan pratinjau seluruh halaman...');
      try {
        const res = await api.get('/sp2d', { 
          params: { ...filters, limit: 10000, page: 1 } 
        });
        dataToPreview = res.data.data || [];
        toast.dismiss(loadToast);
      } catch (err) {
        toast.error('Gagal memuat pratinjau');
        toast.dismiss(loadToast);
        return;
      }
    }

    const headers = ['No.', 'Tgl', 'Nomor', 'OPD', 'Sumber Dana', 'Uraian', 'Bruto (Rp)'];
    const body = dataToPreview.map((item: any, i: number) => [
      i + 1,
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.nomor,
      item.opd,
      item.sumber_dana || '-',
      item.uraian,
      formatCurrency(item.nilai_bruto)
    ]);

    const totalBruto = dataToPreview.reduce((acc: number, curr: any) => acc + parseFloat(curr.nilai_bruto || 0), 0);
    const foot = [['', '', '', '', '', 'TOTAL NILAI BRUTO', formatCurrency(totalBruto)]];

    const url = previewPDF(headers, body, 'PRATINJAU LAPORAN ARSIP PENGELUARAN (SP2D)', foot);
    setPreviewPdf(url);
  };

  // Import Preview States
  const [importPreview, setImportPreview] = useState<{ isOpen: boolean, data: any[], stats: any }>({ isOpen: false, data: [], stats: null });
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentName: '' });

  const handleDownloadTemplate = () => {
    const headers = [
      'Nomor SP2D', 
      'Tanggal Terbit (YYYY-MM-DD)', 
      'Tanggal Pencairan (YYYY-MM-DD)', 
      'OPD', 
      'ID Sumber Dana',
      'Jenis', 
      'Uraian', 
      'Penerima', 
      'Nilai Bruto', 
      'Nilai Potongan'
    ];
    const sample = [
      '0001/SP2D/LS/2026',
      format(new Date(), 'yyyy-MM-dd'),
      format(new Date(), 'yyyy-MM-dd'),
      'DINAS PENDIDIKAN',
      'SD-PAD',
      'LS BARJAS',
      'Pembayaran Belanja Modal Alat Kantor',
      'PT. MAJU BERSAMA',
      '50000000',
      '1000000'
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_Import_SP2D.xlsx');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // AMBIL DATA SALDO TERUPDATE DARI SISTEM (Penerimaan)
    const loadBalToast = toast.loading('Menyinkronkan saldo kas sistem...');
    let systemBalances: Record<string, number> = {};
    try {
      const res = await api.get('/reports/dashboard-stats', { params: { tahun: new Date().getFullYear() } });
      res.data.stats.forEach((s: any) => {
        systemBalances[s.id] = s.kas_efektif; // Gunakan Kas Efektif (Saldo - Talangan Aktif)
      });
      toast.dismiss(loadBalToast);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
      toast.dismiss(loadBalToast);
      // Tetap lanjut tapi dengan asumsi saldo 0 jika gagal fetch
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const dataArr = XLSX.utils.sheet_to_json(ws);
        
        let totalNilai = 0;
        const processed = (dataArr as any[]).map(item => {
           const getVal = (keyTarget: string) => {
              const cleanTarget = keyTarget.toLowerCase().replace(/[^a-z0-9]/g, '');
              const found = Object.keys(item).find(k => {
                const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                return cleanKey.includes(cleanTarget);
              });
              return found ? item[found] : '';
           };

           const parseExcelDate = (val: any, allowEmpty = false) => {
              if (val instanceof Date) {
                const y = val.getUTCFullYear();
                const m = String(val.getUTCMonth() + 1).padStart(2, '0');
                const d = String(val.getUTCDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
              }
              if (typeof val === 'string' && val.length >= 10) return val;
              if (typeof val === 'number') {
                const jsDate = new Date((val - 25569) * 86400 * 1000);
                const y = jsDate.getUTCFullYear();
                const m = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
                const d = String(jsDate.getUTCDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
              }
              return allowEmpty ? null : null;
            };

           const tglSp2d = parseExcelDate(getVal('tanggalterbit'), true);
           const tglCair = parseExcelDate(getVal('tanggalpencairan'), true);
           const idSumberDana = getVal('idsumberdana') || '';
           
           // Pagu/Saldo diambil dari sistem, bukan dari Excel
           const paguSistem = systemBalances[idSumberDana] || 0;

           const nilaiBruto = parseFloat(getVal('nilaibruto')) || 0;
           const nilaiPotongan = parseFloat(getVal('nilaipotongan')) || 0;
           
           totalNilai += nilaiBruto;

           // LOGIKA BARU DARI USER
           let statusDokumen = 'AMAN';
           let statusInput = '-';

           if (!tglSp2d) {
             statusDokumen = 'INVALID';
             statusInput = '-';
           } else {
             // Cek Kondisi Talangan (Berdasarkan Saldo Sistem)
             if (!idSumberDana || idSumberDana === 'SD-LAINNYA' || paguSistem <= 0 || paguSistem < nilaiBruto) {
               statusDokumen = 'TALANGAN';
             } else {
               statusDokumen = 'AMAN';
             }

             // Cek Status Input
             if (!tglCair) {
               statusInput = 'BELUM INPUT';
             } else {
               statusInput = tglCair;
             }
           }

           return {
              nomor: getVal('nomorsp2d'),
              tanggal: tglSp2d || null,
              tanggal_pencairan: tglCair,
              opd: getVal('opd') || 'OPD LAINNYA',
              id_sumber_dana: idSumberDana || 'SD-LAINNYA',
              pagu_sistem: paguSistem,
              jenis: getVal('jenis') || 'LS',
              uraian: getVal('uraian') || 'Pencairan SP2D (Import)',
              penerima: getVal('penerima') || 'Pihak Ketiga',
              nilai_bruto: nilaiBruto,
               nilai_potongan: nilaiPotongan,
              status_dokumen: statusDokumen,
              status_input: statusInput
           };
        });

        setImportPreview({
           isOpen: true,
           data: processed,
           stats: {
              count: processed.length,
              total: totalNilai
           }
        });
      } catch (err) {
        toast.error('Gagal membaca file Excel. Pastikan format sesuai template.');
      } finally {
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCommitImport = async () => {
     setIsImporting(true);
     let successCount = 0;
     let failCount = 0;
     const total = importPreview.data.length;
     setImportProgress({ current: 0, total, currentName: 'Memulai proses impor...' });

     const toastId = toast.loading(`Mengimpor ${total} dokumen...`);

     for (let i = 0; i < importPreview.data.length; i++) {
        const item = importPreview.data[i];
        setImportProgress(prev => ({ ...prev, current: i + 1, currentName: item.nomor || `Item #${i+1}` }));
        
        try {
           const nilaiNeto = item.nilai_bruto - item.nilai_potongan;
           
           let finalUraian = item.uraian;
            if (item.status_dokumen === 'INVALID') {
             finalUraian = `[INVALID - Tgl SP2D Kosong] ${finalUraian}`;
           }

           const formData = new FormData();
           formData.append('nomor', item.nomor || `SP2D-IMP-${Date.now()}-${Math.random().toString(36).substring(7)}`);
           formData.append('tanggal', item.tanggal || new Date().toISOString().split('T')[0]);
           if (item.tanggal_pencairan) formData.append('tanggal_pencairan', item.tanggal_pencairan);
           
           formData.append('opd', item.opd);
           formData.append('jenis', item.jenis);
           formData.append('uraian', finalUraian);
           formData.append('penerima', item.penerima);
           formData.append('nilai_bruto', item.nilai_bruto.toString());
           formData.append('nilai_potongan', item.nilai_potongan.toString());
           formData.append('nilai_neto', nilaiNeto.toString());
           
           formData.append('status_dana', item.status_dokumen === 'TALANGAN' ? 'Talangan' : (item.status_dokumen === 'AMAN' ? 'Aman' : 'Invalid'));
           formData.append('confirmTalangan', 'true');
           formData.append('id_sumber_talangan', 'SD-SILPA'); 

           formData.append('details', JSON.stringify([{ 
              id_sumber_dana: item.id_sumber_dana, 
              nilai_bruto: item.nilai_bruto, 
              nilai_neto: nilaiNeto 
           }]));
           
           await api.post('/sp2d', formData);
           successCount++;
        } catch (err) {
           console.error('Row fail:', err);
           failCount++;
        }
     }

     toast.dismiss(toastId);
     if (failCount > 0) {
        toast.warning(`Impor selesai dengan ${failCount} kegagalan.`, { description: `${successCount} data berhasil dimasukkan.` });
     } else {
        toast.success(`Berhasil mengimpor ${successCount} data SP2D`);
     }
     
     setImportPreview({ isOpen: false, data: [], stats: null });
     setIsImporting(false);
     setImportProgress({ current: 0, total: 0, currentName: '' });
     mutate();
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === sp2dList.length) setSelectedIds([]);
    else setSelectedIds(sp2dList.map((x: any) => x.id));
  };

  const handleDeleteBulk = async () => {
    if (selectedIds.length === 0) return;
    setConfirmState({
      isOpen: true,
      title: 'Hapus Data Terpilih?',
      message: `Apakah Anda yakin ingin menghapus ${selectedIds.length} data SP2D secara permanen? Tindakan ini tidak dapat dibatalkan.`,
      type: 'danger',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isLoading: true }));
        try {
          await Promise.all(selectedIds.map(id => api.delete(`/sp2d/${id}`)));
          toast.success('Data Dihapus', { description: `${selectedIds.length} data SP2D telah dihapus dari sistem.` });
          setSelectedIds([]);
          mutate();
          setConfirmState(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) { 
          toast.error('Gagal menghapus data'); 
          setConfirmState(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const handleEdit = (id: number) => {
    router.push(`/dashboard/sp2d/create?edit=${id}`);
  };

  const handleDelete = async (id: number) => {
    setConfirmState({
      isOpen: true,
      title: 'Hapus Dokumen SP2D?',
      message: 'Apakah Anda yakin ingin menghapus data ini secara permanen? Data yang dihapus tidak dapat dipulihkan.',
      type: 'danger',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isLoading: true }));
        try {
          await api.delete(`/sp2d/${id}`);
          toast.success('Data Dihapus', { description: 'Data SP2D berhasil dihapus secara permanen.' });
          mutate();
          setConfirmState(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) { 
          toast.error('Gagal menghapus data'); 
          setConfirmState(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const handleClone = (item: any) => {
    const query = new URLSearchParams({ 
      clone: item.id.toString(),
      tab: 'rekam'
    }).toString();
    router.push(`/dashboard/sp2d?${query}`);
    setActiveTab('rekam');
    toast.info('Data telah diduplikasi', { description: 'Silakan sesuaikan nomor SP2D dan tanggal sebelum menyimpan.' });
  };

  const handleQuickFilter = (type: string) => {
    const now = new Date();
    if (type === 'bulan_ini') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
      setFilters({ ...filters, startDate: firstDay, endDate: lastDay });
    } else if (type === 'talangan') {
      setFilters({ ...filters, status: 'Talangan' });
    } else if (type === 'aman') {
      setFilters({ ...filters, status: 'Aman' });
    } else if (type === 'selisih') {
      setFilters({ ...filters, onlySelisih: 'true', startDate: '', endDate: '' });
    } else if (type === 'reset') {
      setFilters({ opd: '', jenis: '', status: '', search: '', startDate: '', endDate: '', onlySelisih: '' });
    }
    setCurrentPage(1);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setCurrentPage(1);
    mutate();
  };

  const handleSaveRekon = async () => {
    if (!rekonModal) return;
    setSavingRekon(true);
    try {
      // Pastikan selisih diproses dengan parseNumber agar aman dari format titik/koma
      const finalSelisih = parseNumber(rekonModal.selisih);
      
      await api.patch(`/sp2d/rekon/${rekonModal.id}`, {
        selisih_rekon: finalSelisih,
        keterangan_rekon: rekonModal.keterangan,
        tanggal_pencairan: rekonModal.tanggalPencairan
      });
      toast.success('Rekonsiliasi Berhasil', { description: 'Data selisih bank telah diperbarui secara akurat.' });
      setRekonModal(null);
      mutate();
    } catch (err) {
      toast.error('Gagal menyimpan data rekonsiliasi');
    } finally {
      setSavingRekon(false);
    }
  };

  const handleSyncRekon = async () => {
    if (!rekonModal) return;
    const loadToast = toast.loading('Sinkronisasi dengan Rekening Koran...');
    try {
      const res = await api.get(`/sp2d/rekon/sync-bank/${rekonModal.id}`);
      if (res.data.success) {
        setRekonModal({
          ...rekonModal,
          nilaiBank: res.data.nilai_bank,
          selisih: res.data.selisih,
          keterangan: res.data.keterangan,
          tanggalPencairan: res.data.tanggal_bank ? res.data.tanggal_bank.split('T')[0] : ''
        });
        toast.success('Data Bank Ditemukan', { description: 'Nilai bank dan selisih telah diisi secara otomatis.' });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal sinkronisasi');
    } finally {
      toast.dismiss(loadToast);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700">
      {/* PAGE HEADER */}
      <PageHeader
        title="Perekaman & Arsip SP2D"
        description="Sistem administrasi pengeluaran digital daerah"
        icon={<FileText className="size-5" />}
        actions={
          <div className="flex items-center gap-3">
            <div className="bg-fin-page p-1 rounded-lg border border-fin-border">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-auto">
                <TabsList className="bg-transparent h-auto p-0">
                  <TabsTrigger value="rekam" className="px-6 py-2 rounded-lg text-xs font-medium data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2">
                    <FileUp size={14} /> Perekaman Baru
                  </TabsTrigger>
                  <TabsTrigger value="arsip" className="px-6 py-2 rounded-lg text-xs font-medium data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2">
                    <Database size={14} /> Arsip Data
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <Button onClick={() => setIsCashMonitorOpen(true)} className="h-10 px-6 bg-fin-surface text-fin-info-text border border-fin-info/20 hover:bg-fin-info-bg rounded-xl transition-all text-xs font-bold shadow-sm flex items-center gap-2">
              <Banknote size={16} /><span>Monitor Kas</span>
            </Button>
          </div>
        }
      />

      {/* Banner: SP2D / Potongan belum ada tanggal pencairan */}
      {!bannerDismissed && missingStats && (missingStats.sp2dCount > 0 || missingStats.potonganCount > 0) && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
          <CalendarCheck size={18} className="shrink-0 text-amber-600" />
          <span className="flex-1">
            <strong>{missingStats.sp2dCount > 0 ? `${missingStats.sp2dCount} SP2D` : ''}</strong>
            {missingStats.sp2dCount > 0 && missingStats.potonganCount > 0 ? ' dan ' : ''}
            <strong>{missingStats.potonganCount > 0 ? `${missingStats.potonganCount} potongan` : ''}</strong>
            {' '}belum memiliki tanggal pencairan — rekonsiliasi bank tidak akan akurat.
          </span>
          <Link
            href="/dashboard/sp2d/kelengkapan"
            className="shrink-0 font-semibold underline underline-offset-2 hover:text-amber-900"
          >
            Perbaiki Sekarang →
          </Link>
          <button
            onClick={() => { setBannerDismissed(true); sessionStorage.setItem('pencairan_banner_dismissed','1'); }}
            className="shrink-0 p-1 rounded hover:bg-amber-100 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Banner: SP2D dengan rincian potongan kurang */}
      {selisihStats && selisihStats.KURANG?.jumlah > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-xl text-orange-800 text-sm">
          <Receipt size={18} className="shrink-0 text-orange-600" />
          <span className="flex-1">
            <strong>{selisihStats.KURANG.jumlah} SP2D</strong> memiliki rincian potongan yang belum lengkap
            (total selisih <strong>{new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(selisihStats.KURANG.total_selisih)}</strong>)
            — potongan belum terdokumentasi per komponen pajak/iuran.
          </span>
          <Link
            href="/dashboard/sp2d/audit-potongan"
            className="shrink-0 font-semibold underline underline-offset-2 hover:text-orange-900 whitespace-nowrap"
          >
            Audit Sekarang →
          </Link>
        </div>
      )}

      {/* Banner: Tanggal Pencairan yang belum dipulihkan */}
      {restorePreview && restorePreview.total_null > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm">
          <CalendarCheck size={18} className="shrink-0 text-rose-600" />
          <span className="flex-1">
            <strong>{restorePreview.total_null} SP2D</strong> tidak memiliki tanggal pencairan
            — {restorePreview.bisa_pulih_dari_potongan > 0 && <><strong>{restorePreview.bisa_pulih_dari_potongan}</strong> dapat dipulihkan otomatis dari data potongan.</>}
          </span>
          <button
            onClick={() => setRestoreModal(true)}
            className="shrink-0 font-semibold underline underline-offset-2 hover:text-rose-900 whitespace-nowrap"
          >
            Pulihkan →
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'arsip' ? (
          <motion.div 
            key="arsip"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            {/* Quick Stats Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
               <Card className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group hover:border-ds-focus-ring transition-all">
                  <div className="w-12 h-12 bg-fin-info-bg text-[#175CD3] rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Banknote size={24} /></div>
                  <div>
                    <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Total Bruto (Periode)</p>
                    <p className="text-xl font-bold text-fin-text-primary mt-0.5">{formatCurrency(data?.totalBruto || 0)}</p>
                  </div>
               </Card>
               <Card className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group hover:border-fin-expense transition-all">
                  <div className="w-12 h-12 bg-[#FEF3F2] text-fin-expense rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><AlertCircle size={24} /></div>
                  <div>
                    <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Talangan Aktif</p>
                    <div className="flex flex-col">
                       <p className="text-xl font-bold text-[#D92D20] mt-0.5">{formatCurrency(data?.totalNominalTalangan || 0)}</p>
                       <p className="text-[10px] font-medium text-fin-text-muted">{data?.totalTalangan || 0} Dokumen Terdeteksi</p>
                    </div>
                  </div>
               </Card>
               <Card className="bg-fin-surface p-6 rounded-xl border border-fin-border shadow-sm flex items-center gap-4 group hover:border-ds-focus-ring transition-all">
                  <div className="w-12 h-12 bg-[#F5F9FF] text-[#175CD3] rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Activity size={24} /></div>
                  <div>
                    <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Total Transaksi</p>
                    <p className="text-xl font-bold text-fin-text-primary mt-0.5">{data?.total || 0} Records</p>
                  </div>
               </Card>
               <Card className={cn(
                 "bg-fin-surface p-6 rounded-xl border shadow-sm flex items-center gap-4 group transition-all cursor-pointer",
                 filters.onlySelisih === 'true' ? "border-[#B54708] bg-[#FFFAEB]" : "border-fin-border hover:border-[#B54708]"
               )} onClick={() => { setFilters({...filters, onlySelisih: filters.onlySelisih === 'true' ? '' : 'true'}); setCurrentPage(1); }}>
                  <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform",
                    filters.onlySelisih === 'true' ? "bg-[#B54708] text-white" : "bg-amber-50 text-amber-600"
                  )}><RefreshCw size={24} className={filters.onlySelisih === 'true' ? "animate-spin-slow" : ""} /></div>
                  <div>
                    <p className={cn("text-[10px] font-bold uppercase tracking-wider", filters.onlySelisih === 'true' ? "text-[#B54708]" : "text-fin-text-muted")}>Audit Selisih Bank</p>
                    <div className="flex flex-col">
                       <p className="text-xl font-bold text-[#B54708] mt-0.5">{formatCurrency(data?.totalSelisih || 0)}</p>
                       <p className="text-[10px] font-medium text-[#B54708] opacity-80">{data?.countSelisih || 0} Temuan Selisih</p>
                    </div>
                  </div>
               </Card>
            </div>

            {/* Filter Bar (Modernized Gold Standard) */}
            <Card className="rounded-xl border border-fin-border bg-fin-surface shadow-sm overflow-hidden">
                 <div className="px-6 py-4 border-b border-fin-border flex justify-between items-center bg-fin-surface rounded-t-xl">
                    <div className="flex items-center gap-3">
                       <div className="w-9 h-9 bg-fin-subtle text-fin-info rounded-xl flex items-center justify-center shadow-sm border border-fin-border">
                          <Filter size={18} />
                       </div>
                       <div>
                          <h3 className="text-xs font-black text-fin-text-primary uppercase tracking-widest leading-none">Panel Kontrol Arsip</h3>
                          <p className="text-xs text-fin-text-muted font-medium mt-1.5 flex items-center gap-1">
                             <Activity size={10} className="text-fin-info" /> Filter & Ekspor Data SP2D
                          </p>
                       </div>
                    </div>
                    <div className="flex items-center gap-3">
                       <Button 
                         variant="ghost" 
                         size="sm" 
                         onClick={() => setShowFilters(!showFilters)}
                         className="h-9 px-4 text-xs font-bold text-fin-info hover:bg-fin-info/10 rounded-full transition-all flex items-center gap-2 border border-transparent hover:border-fin-info/20"
                       >
                         {showFilters ? <><X size={14} /> Sembunyikan Filter</> : <><Filter size={14} /> Tampilkan Filter</>}
                       </Button>
                       <Button 
                         variant="ghost" 
                         size="icon" 
                         onClick={() => { setFilters({ opd: '', jenis: '', status: '', search: '', startDate: '', endDate: '', onlySelisih: '' }); mutate(); }}
                         className="h-9 w-9 text-fin-text-muted hover:text-fin-text-primary hover:bg-fin-subtle rounded-full transition-all border border-fin-border"
                         title="Refresh & Reset"
                       >
                         <RefreshCw size={15} className={cn(isLoading && "animate-spin")} />
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
                        <div className="p-7 space-y-7 bg-fin-surface border-b border-fin-border">
                           {/* ROW 1: MAIN FILTERS */}
                           <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
                              <div className="lg:col-span-3 space-y-2.5">
                                 <label className="text-xs font-bold text-fin-info uppercase tracking-wider flex items-center gap-2 ml-1">
                                    <Search size={13} /> Pencarian Bukti
                                 </label>
                                 <Input 
                                   placeholder="Cari bukti / uraian..." 
                                   className="h-11 bg-fin-page border-fin-border rounded-xl text-xs font-medium px-4 focus:ring-2 focus:ring-ds-focus-ring transition-all shadow-sm" 
                                   value={filters.search}
                                   onChange={(e) => setFilters({...filters, search: e.target.value})}
                                 />
                              </div>

                              <div className="lg:col-span-3 space-y-2.5">
                                 <label className="text-[10px] font-bold text-fin-info uppercase tracking-wider flex items-center gap-2 ml-1">
                                    <Building2 size={13} /> Satuan Kerja (OPD)
                                 </label>
                                 <Combobox
                                   value={filters.opd || 'none'}
                                   onValueChange={(v) => setFilters({...filters, opd: v === 'none' || !v ? '' : v})}
                                   placeholder="Semua Dinas / Badan"
                                   className="h-11"
                                   options={[
                                     { value: 'none', label: 'SEMUA SUMBER' },
                                     ...opdList.map((opd: any) => ({ value: opd, label: opd })),
                                   ]}
                                 />
                              </div>

                              <div className="lg:col-span-4 space-y-2.5">
                                 <label className="text-[10px] font-bold text-fin-info uppercase tracking-wider flex items-center gap-2 ml-1">
                                    <Calendar size={13} /> Rentang Periode
                                 </label>
                                 <div className="flex items-center gap-2 bg-fin-page border border-fin-border rounded-xl px-3 h-11 transition-all focus-within:ring-2 focus-within:ring-fin-info/10 shadow-sm">
                                    <Input type="date" className="h-9 border-none bg-transparent text-[11px] font-bold p-0 w-full focus-visible:ring-0" value={filters.startDate} onChange={(e) => setFilters({...filters, startDate: e.target.value})} />
                                    <span className="text-[10px] font-black text-fin-text-muted shrink-0 px-2 uppercase">S/D</span>
                                    <Input type="date" className="h-9 border-none bg-transparent text-[11px] font-bold p-0 w-full focus-visible:ring-0 text-right" value={filters.endDate} onChange={(e) => setFilters({...filters, endDate: e.target.value})} />
                                 </div>
                              </div>

                              <div className="lg:col-span-2 flex items-center gap-2">
                                 <Button variant="primary" onClick={() => setCurrentPage(1)} className="h-11 flex-1 rounded-xl text-[10px] font-black gap-2 shadow-md active:scale-95">
                                    <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Tampilkan
                                 </Button>
                                 <Button variant="ghost" onClick={() => setFilters({ opd: '', jenis: '', status: '', search: '', startDate: '', endDate: '', onlySelisih: '' })} className="h-11 px-3 bg-fin-subtle hover:bg-fin-border text-fin-text-muted rounded-xl text-[10px] font-bold transition-all">
                                    Reset
                                 </Button>
                              </div>
                           </div>

                           {/* ROW 2: QUICK FILTERS & ACTION BAR */}
                           <div className="flex flex-wrap items-center justify-between gap-6 pt-6 border-t border-[#F8F9FA]">
                              <div className="flex items-center gap-5">
                                 <span className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest ml-1">Filter Cepat:</span>
                                 <div className="flex items-center gap-2.5">
                                    <Button variant="outline" onClick={() => handleQuickFilter('bulan_ini')} className="h-9 px-4 border-[#EAECF0] hover:border-[#2E90FA] hover:bg-fin-surface rounded-full text-[10px] font-bold text-fin-text-muted gap-2 transition-all shadow-sm">
                                       <Calendar size={14} className="text-fin-info" /> Bulan Ini
                                    </Button>
                                    <Button variant="outline" onClick={() => handleQuickFilter('talangan')} className="h-9 px-4 border-[#EAECF0] hover:border-[#F04438] hover:bg-fin-surface rounded-full text-[10px] font-bold text-fin-text-muted gap-2 transition-all shadow-sm">
                                       <Activity size={14} className="text-fin-expense" /> Nominal Besar (&gt;1M)
                                    </Button>
                                    <Button 
                                       variant="outline" 
                                       onClick={() => { setFilters({...filters, onlySelisih: filters.onlySelisih === 'true' ? '' : 'true'}); setCurrentPage(1); }} 
                                       className={cn(
                                         "h-9 px-4 rounded-full text-[10px] font-bold gap-2 transition-all shadow-sm border",
                                         filters.onlySelisih === 'true' 
                                           ? "bg-[#B54708] text-white border-[#B54708] hover:bg-[#93370d]" 
                                           : "border-[#EAECF0] hover:border-[#B54708] text-fin-text-muted"
                                       )}
                                     >
                                        <RefreshCw size={14} className={filters.onlySelisih === 'true' ? "text-white" : "text-[#B54708]"} /> 
                                        {filters.onlySelisih === 'true' ? 'Menampilkan Temuan Selisih' : 'Hanya Selisih'}
                                     </Button>
                                    <div className="flex items-center gap-2.5 ml-3">
                                        <select
                                          value={filters.jenis || 'none'}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setFilters({...filters, jenis: v === 'none' || !v ? '' : v});
                                          }}
                                          className="h-9 min-w-[150px] px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                                        >
                                          <option value="none">SEMUA JENIS</option>
                                          {jenisList.map((j: any) => (
                                            <option key={j} value={j} className="bg-fin-surface text-fin-text-primary">
                                              {j}
                                            </option>
                                          ))}
                                        </select>
                                        <select
                                          value={filters.status || 'none'}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setFilters({...filters, status: v === 'none' || !v ? '' : v});
                                          }}
                                          className="h-9 min-w-[140px] px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                                        >
                                          <option value="none">SEMUA STATUS</option>
                                          <option value="Aman" className="bg-fin-surface text-fin-text-primary">AMAN (KAS)</option>
                                          <option value="Talangan" className="bg-fin-surface text-fin-text-primary">TALANGAN</option>
                                        </select>
                                     </div>
                                 </div>
                              </div>

                              <div className="flex items-center gap-1 p-1 bg-fin-subtle border border-fin-border rounded-full shadow-inner">
                                 <Button variant="ghost" onClick={handlePreviewReport} className="h-8 px-4 text-[10px] font-bold text-fin-text-muted hover:text-fin-info hover:bg-fin-surface rounded-full flex items-center gap-2 transition-all">
                                    <Eye size={13} /> Preview
                                 </Button>
                                 <div className="w-px h-3.5 bg-[#D0D5DD] mx-1" />
                                 <Button variant="ghost" onClick={handlePrintPDF} className="h-8 px-4 text-[10px] font-bold text-fin-text-muted hover:text-fin-expense hover:bg-fin-surface rounded-full flex items-center gap-2 transition-all">
                                    <Printer size={13} /> PDF
                                 </Button>
                                 <Button variant="ghost" onClick={handleExportExcel} className="h-8 px-4 text-[10px] font-bold text-fin-text-muted hover:text-fin-income hover:bg-fin-surface rounded-full flex items-center gap-2 transition-all">
                                    <FileSpreadsheet size={13} /> Excel
                                 </Button>
                                 <div className="w-px h-3.5 bg-[#D0D5DD] mx-1" />
                                 <Button variant="ghost" onClick={handleDownloadTemplate} className="h-8 px-4 text-[10px] font-bold text-fin-text-muted hover:text-fin-info hover:bg-fin-surface rounded-full flex items-center gap-2 transition-all">
                                    <LayoutTemplate size={13} /> Template
                                 </Button>
                                 <div className="relative">
                                    <input type="file" className="absolute inset-0 opacity-0 cursor-pointer z-10" onChange={handleImportFile} />
                                    <Button variant="ghost" className="h-8 px-4 text-[10px] font-bold text-fin-income hover:bg-fin-surface rounded-full flex items-center gap-2 transition-all">
                                       <FileUp size={13} /> Import
                                    </Button>
                                 </div>
                              </div>
                           </div>
                        </div>
                     </motion.div>
                   )}
                 </AnimatePresence>
            </Card>

      {/* Results Table (Industrial Standard with Shadcn/UI) */}
            <Card className="rounded-xl border border-fin-border overflow-hidden bg-fin-surface shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto min-h-[500px]">
                  <Table>
                    <TableHeader className="bg-fin-page">
                      <TableRow className="hover:bg-transparent border-b border-fin-border">
                        <TableHead className="px-6 py-4 text-center w-16">
                          <button onClick={toggleSelectAll} className="text-fin-text-muted hover:text-fin-text-muted transition-all">
                            {selectedIds.length === sp2dList.length && sp2dList.length > 0 ? <CheckSquare size={16} /> : <Square size={16} />}
                          </button>
                        </TableHead>
                        <TableHead className="px-4 py-4 text-xs font-medium text-fin-text-muted">Tanggal (SP2D/Cair)</TableHead>
                        <TableHead className="px-4 py-4 text-xs font-medium text-fin-text-muted">Nomor SP2D</TableHead>
                        <TableHead className="px-4 py-4 text-xs font-medium text-fin-text-muted">OPD / Organisasi</TableHead>
                        <TableHead className="px-4 py-4 text-xs font-medium text-fin-text-muted">Uraian & Penerima</TableHead>
                        <TableHead className="px-4 py-4 text-xs font-medium text-fin-text-muted">Sumber Dana</TableHead>
                        <TableHead className="px-4 py-4 text-xs font-medium text-fin-text-muted text-right">Bruto / Neto (Rp)</TableHead>
                        <TableHead className="px-4 py-4 text-xs font-medium text-fin-text-muted text-center">Status</TableHead>
                        <TableHead className="px-4 py-4 text-xs font-medium text-fin-text-muted text-center">Rekon</TableHead>
                        <TableHead className="px-4 py-4 text-xs font-medium text-fin-text-muted text-center">Bukti</TableHead>
                        <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-muted text-center">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {isLoading ? (
                      [1,2,3,4,5].map(i => (
                        <TableRow key={i} className="animate-in fade-in duration-500">
                          <TableCell className="text-center py-4"><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                          <TableCell className="py-4"><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell className="py-4"><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell className="py-4"><Skeleton className="h-4 w-40" /></TableCell>
                          <TableCell className="py-4"><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell className="py-4"><Skeleton className="h-6 w-full" /></TableCell>
                          <TableCell className="py-4 text-right"><Skeleton className="h-4 w-24 ml-auto" /></TableCell>
                          <TableCell className="py-4 text-center"><Skeleton className="h-6 w-16 mx-auto rounded-full" /></TableCell>
                          <TableCell className="py-4 text-center"><Skeleton className="h-8 w-8 mx-auto rounded-lg" /></TableCell>
                          <TableCell className="py-4 text-center"><Skeleton className="h-8 w-8 mx-auto rounded-lg" /></TableCell>
                          <TableCell className="py-4 text-center"><Skeleton className="h-8 w-8 mx-auto rounded-lg" /></TableCell>
                        </TableRow>
                      ))
                    ) : sp2dList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="h-[400px] text-center">
                           <div className="flex flex-col items-center justify-center space-y-4">
                              <div className="w-16 h-16 bg-fin-page rounded-full flex items-center justify-center text-slate-300">
                                 <FileSearch size={32} />
                              </div>
                              <div>
                                 <p className="text-sm font-bold text-slate-900">Data Tidak Ditemukan</p>
                                 <p className="text-xs text-slate-400 mt-1">Sesuaikan filter atau kata kunci pencarian Anda.</p>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => handleQuickFilter('reset')} className="h-8 text-[10px] font-bold uppercase tracking-wider">Reset Semua Filter</Button>
                           </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      sp2dList.map((item: any) => (
                        <TableRow 
                          key={item.id} 
                          className={cn(
                            "hover:bg-fin-page transition-colors group", 
                            selectedIds.includes(item.id) && "bg-[#F5F8FF]",
                            item.selisih_rekon != 0 && "bg-amber-50/70 hover:bg-amber-50"
                          )}
                        >
                          <TableCell className="px-6 py-4 text-center">
                            <button onClick={() => toggleSelect(item.id)} className={cn("transition-all", selectedIds.includes(item.id) ? "text-fin-info" : "text-[#D0D5DD]")}>
                              {selectedIds.includes(item.id) ? <CheckSquare size={16} /> : <Square size={16} />}
                            </button>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-fin-text-primary">{(() => { 
                                if (!item.tanggal) return '-';
                                const [y, m, d] = item.tanggal.split('T')[0].split('-');
                                return `${d}/${m}/${y}`;
                              })()}</p>
                              {item.tanggal_pencairan ? (
                                <p className="text-[10px] font-medium text-fin-income flex items-center">
                                  <Calendar size={10} className="mr-1" />
                                  {(() => { 
                                    if (!item.tanggal_pencairan) return '-';
                                    const [y, m, d] = item.tanggal_pencairan.split('T')[0].split('-');
                                    return `${d}/${m}/${y.substring(2)}`;
                                  })()}
                                </p>
                              ) : (
                                <p className="text-[10px] font-bold text-fin-expense flex items-center uppercase italic opacity-70">
                                  <AlertCircle size={10} className="mr-1" />
                                  BELUM INPUT
                                </p>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <div className="flex items-center gap-1.5 group/copy">
                              <p className="text-xs font-semibold text-fin-text-primary transition-colors group-hover/copy:text-fin-info-text select-all">{item.nomor}</p>
                              <button
                                title="Salin nomor SP2D"
                                onClick={() => {
                                  navigator.clipboard.writeText(item.nomor);
                                  toast.success('Nomor disalin', { description: item.nomor });
                                }}
                                className="p-0.5 rounded opacity-40 hover:opacity-100 hover:bg-indigo-50 hover:text-fin-info-text text-fin-text-muted transition-all shrink-0"
                              >
                                <Copy size={11} />
                              </button>
                            </div>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-fin-subtle text-[#344054] border border-fin-border-strong uppercase mt-1">
                              {item.jenis}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <p className="text-xs font-bold text-fin-text-primary truncate max-w-[150px]">{item.opd}</p>
                            <p className="text-xs text-fin-text-muted mt-0.5">Kode Satker: {item.opd.substring(0, 5)}</p>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                            <p className="text-xs font-bold text-fin-text-primary truncate max-w-[200px]" title={item.uraian}>{item.uraian}</p>
                            <p className="text-xs text-fin-text-muted max-w-[200px] truncate mt-0.5" title={item.penerima}>{item.penerima}</p>
                          </TableCell>
                          <TableCell className="px-4 py-4">
                             <div className="flex flex-wrap gap-1 max-w-[120px]">
                                {item.sumber_dana && item.sumber_dana !== 'SD-LAINNYA' ? item.sumber_dana.split(',').map((sd: string) => (
                                   <Badge key={sd} className="bg-[#F5F8FF] text-fin-info border-[#B2DDFF] text-[10px] font-bold px-1.5 py-0">
                                      {sd.trim()}
                                   </Badge>
                                )) : (
                                   <Badge className="bg-fin-expense/10 text-fin-expense border-fin-expense/20 text-[10px] font-bold px-1.5 py-0 italic">
                                      BELUM INPUT
                                   </Badge>
                                )}
                             </div>
                          </TableCell>
                          <TableCell className="px-4 py-4 text-right">
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-fin-text-primary" style={{fontVariantNumeric:'tabular-nums'}}>{formatCurrency(item.nilai_bruto)}</p>
                              <div className="flex flex-col items-end gap-1">
                                <p className="text-[11px] font-medium text-fin-income" style={{fontVariantNumeric:'tabular-nums'}}>{formatCurrency(item.nilai_neto)}</p>
                              </div>
                            </div>
                          </TableCell>
                           <TableCell className="px-4 py-4 text-center">
                             <div className="flex flex-col items-center gap-1">
                               <span 
                                 className={cn(
                                   "inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase",
                                   item.status_dana === 'Aman' 
                                     ? "bg-fin-income/10 text-fin-income border-fin-income/20" 
                                     : (item.status_dana === 'Talangan' 
                                         ? "bg-fin-warning/10 text-fin-warning border-fin-warning/20" 
                                         : "bg-fin-expense/10 text-fin-expense border-fin-expense/20")
                                 )}
                               >
                                 {item.status_dana}
                               </span>
                               {item.selisih_rekon != 0 && (
                                 <Badge className="bg-[#B54708] text-white border-none text-[9px] font-black px-1.5 py-0 shadow-sm animate-pulse">BANK DIFF</Badge>
                               )}
                             </div>
                           </TableCell>
                          <TableCell className="px-4 py-4 text-center">
                              <button 
                                onClick={() => setRekonModal({ 
                                   id: item.id, 
                                   nilaiNeto: item.nilai_neto,
                                   nilaiBank: item.nilai_neto - (item.selisih_rekon || 0),
                                   selisih: item.selisih_rekon || 0, 
                                   keterangan: item.keterangan_rekon || '',
                                   tanggalPencairan: item.tanggal_pencairan ? item.tanggal_pencairan.split('T')[0] : ''
                                })}
                                className={cn(
                                   "inline-flex items-center px-3 py-1 rounded-lg text-[10px] font-black border mx-auto transition-all shadow-sm",
                                   item.selisih_rekon != 0 
                                     ? "bg-fin-warning text-fin-surface border-fin-warning hover:opacity-90 ring-2 ring-fin-warning/10" 
                                     : "bg-fin-surface text-fin-text-muted border-fin-border hover:border-[#2E90FA] hover:text-fin-info"
                                 )}
                               >
                                 {item.selisih_rekon != 0 ? 'FIX DIFF' : 'CEK'}
                               </button>
                          </TableCell>
                          <TableCell className="px-4 py-4 text-center">
                            {item.file_url ? (
                              <button 
                                onClick={() => setPreviewPdf(getFileUrl(item.file_url))}
                                className="w-10 h-10 flex items-center justify-center bg-fin-income/10 text-fin-income rounded-xl border border-fin-income/20 hover:bg-fin-income/20 transition-all shadow-sm group/btn"
                                title="Pratinjau Bukti Fisik"
                              >
                                <FileSearch size={18} className="group-hover/btn:scale-110 transition-transform" />
                              </button>
                            ) : (
                              <div className="w-10 h-10 flex items-center justify-center bg-fin-subtle text-fin-text-muted rounded-xl border border-fin-border">
                                <Paperclip size={18} />
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-2">
                               <Button variant="ghost" size="icon" onClick={() => handleClone(item)} className="h-8 w-8 rounded-lg text-fin-text-muted hover:text-fin-info hover:bg-fin-info-bg transition-colors" title="Duplikasi">
                                  <RefreshCw size={14} />
                               </Button>
                               <Button variant="ghost" size="icon" onClick={() => {
                                  router.push(`/dashboard/sp2d?edit=${item.id}&tab=rekam`);
                                  setActiveTab('rekam');
                               }} className="h-8 w-8 rounded-lg text-fin-text-muted hover:text-fin-info hover:bg-fin-info-bg transition-colors" title="Edit">
                                  <Edit size={14} />
                               </Button>
                               <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)} className="h-8 w-8 rounded-lg text-fin-text-muted hover:text-fin-expense hover:bg-fin-expense/10 transition-colors" title="Hapus">
                                  <Trash2 size={14} />
                               </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
            </Table>
          </div>
        </CardContent>

        {/* Pagination Footer */}
        <div className="px-6 py-4 bg-fin-page border-t border-fin-border flex flex-col md:flex-row justify-between items-center gap-4">
           <div className="flex items-center gap-4">
              <p className="text-xs text-fin-text-muted">
                Showing {(currentPage - 1) * limit + 1} - {Math.min(currentPage * limit, data?.total || 0)} of {data?.total || 0} Entries
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => { setLimit(10000); setCurrentPage(1); }}
                className={cn("text-[10px] font-bold h-7 px-3 rounded-lg", limit === 10000 ? "bg-ds-primary text-white" : "text-fin-info bg-fin-info-bg hover:bg-[#D1E9FF]")}
              >
                {limit === 10000 ? 'SEMUA DATA AKTIF' : 'TAMPILKAN SEMUA'}
              </Button>
              {limit === 10000 && (
                <Button variant="ghost" size="sm" onClick={() => { setLimit(15); setCurrentPage(1); }} className="text-[10px] font-bold h-7 text-fin-expense">
                  Reset Pagination
                </Button>
              )}
           </div>
           <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                size="icon"
                disabled={currentPage === 1 || limit === 10000}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="h-8 w-8 bg-fin-surface border-fin-border rounded-lg text-fin-text-muted disabled:opacity-30 transition-all active:scale-95"
              >
                <ChevronLeft size={16} />
              </Button>
              <div className="flex items-center px-4 h-8 bg-fin-surface border border-fin-border rounded-lg text-xs font-bold text-fin-text-primary">
                Page {currentPage} of {data?.totalPages || 1}
              </div>
              <Button 
                variant="outline"
                size="icon"
                disabled={currentPage >= (data?.totalPages || 1) || limit === 10000}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="h-8 w-8 bg-fin-surface border-fin-border rounded-lg text-fin-text-muted disabled:opacity-30 transition-all active:scale-95"
              >
                <ChevronRight size={16} />
              </Button>
           </div>
        </div>
      </Card>

          </motion.div>
        ) : (
          <motion.div 
            key="rekam"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
          >
             <Sp2dForm onSuccess={() => { setActiveTab('arsip'); mutate(); }} editId={editId} />
          </motion.div>
        )}

        {isCashMonitorOpen && (
          <div className="fixed inset-0 z-[300] flex justify-end bg-black/40 backdrop-blur-sm">
             <motion.div 
                initial={{ x: '100%' }} 
                animate={{ x: 0 }} 
                exit={{ x: '100%' }}
                className="w-full max-w-5xl bg-fin-page h-full shadow-2xl flex flex-col"
             >
                <div className="p-8 bg-fin-text-primary text-fin-surface shrink-0">
                   <div className="flex justify-between items-start mb-6">
                      <div className="w-12 h-12 bg-fin-surface/10 rounded-xl flex items-center justify-center border border-white/10">
                         <Activity size={24} className="text-fin-info" />
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => setIsCashMonitorOpen(false)} className="text-white/60 hover:text-white hover:bg-fin-surface/10">
                         <X size={24} />
                      </Button>
                   </div>
                   <h3 className="text-xl font-bold tracking-tight">Monitor Saldo Kas</h3>
                   <p className="text-sm text-fin-text-muted mt-1">Informasi ketersediaan dana per rincian sumber dana</p>
                </div>

                 <div className="flex-1 overflow-y-auto p-6 space-y-10 custom-scrollbar">
                   {loadingCashStats ? (
                      <div className="flex flex-col items-center justify-center py-20 gap-4">
                         <Loader2 className="animate-spin text-fin-info" size={32} />
                         <p className="text-xs font-bold text-fin-text-muted uppercase tracking-widest">Sinkronisasi Data...</p>
                      </div>
                   ) : (
                      <>
                        {/* KAS BEBAS SECTION */}
                        <div className="space-y-4">
                           <div className="flex items-center gap-3 px-1">
                              <div className="h-6 w-1 bg-ds-primary rounded-full"></div>
                              <h4 className="text-[11px] font-black text-fin-text-primary uppercase tracking-[0.2em]">Kelompok Kas Bebas</h4>
                              <div className="flex-1 h-px bg-[#E9ECEF]"></div>
                           </div>
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {cashStats.filter(s => s.kategori === 'BEBAS').map((item) => (
                                 <Card key={item.id} className="p-5 border-fin-border hover:border-ds-focus-ring/30 transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-1">
                                       <div className="w-1.5 h-1.5 rounded-full bg-ds-primary/20 group-hover:bg-ds-primary transition-colors"></div>
                                    </div>
                                    <div className="flex justify-between items-start mb-4">
                                       <div>
                                          <Badge className="bg-indigo-50 text-indigo-700 border-none text-[10px] font-black px-2 mb-1">
                                             {item.id}
                                          </Badge>
                                          <h4 className="text-sm font-bold text-fin-text-primary leading-tight">{item.nama}</h4>
                                       </div>
                                       <div className="text-right">
                                          <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Kas Efektif</p>
                                          <p className={cn(
                                             "text-lg font-extrabold tabular-nums",
                                             item.kas_efektif > 0 ? "text-fin-income" : "text-fin-expense"
                                          )}>
                                             {formatCurrency(item.kas_efektif)}
                                          </p>
                                       </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#F2F4F7]">
                                       <div className="space-y-1">
                                          <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Total Masuk</p>
                                          <p className="text-xs font-bold text-fin-text-primary">{formatCurrency(item.total_masuk)}</p>
                                       </div>
                                       <div className="space-y-1">
                                          <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Total Keluar</p>
                                          <p className="text-xs font-bold text-[#D92D20]">{formatCurrency(item.total_keluar)}</p>
                                       </div>
                                    </div>
     
                                    <div className="mt-4 bg-[#F9FAFB] rounded-lg p-3 flex justify-between items-center border border-fin-border">
                                       <span className="text-[10px] font-bold text-fin-text-muted">Saldo Buku:</span>
                                       <span className="text-[10px] font-extrabold text-fin-text-primary">{formatCurrency(item.saldo_buku)}</span>
                                    </div>
                                    
                                    {item.talangan_diberikan > 0 && (
                                       <div className="mt-2 flex items-center gap-2 text-[#B42318] px-1">
                                          <AlertCircle size={12} />
                                          <span className="text-[9px] font-bold uppercase">Terikat Talangan: {formatCurrency(item.talangan_diberikan)}</span>
                                       </div>
                                    )}
                                 </Card>
                              ))}
                           </div>
                        </div>

                        {/* KAS EARMARK SECTION */}
                        <div className="space-y-4">
                           <div className="flex items-center gap-3 px-1">
                              <div className="h-6 w-1 bg-amber-500 rounded-full"></div>
                              <h4 className="text-[11px] font-black text-fin-text-primary uppercase tracking-[0.2em]">Kelompok Kas Earmark</h4>
                              <div className="flex-1 h-px bg-[#E9ECEF]"></div>
                           </div>
                           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {cashStats.filter(s => s.kategori === 'EARMARK').map((item) => (
                                 <Card key={item.id} className="p-5 border-fin-border hover:border-amber-600/30 transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 right-0 p-1">
                                       <div className="w-1.5 h-1.5 rounded-full bg-amber-500/20 group-hover:bg-amber-500 transition-colors"></div>
                                    </div>
                                    <div className="flex justify-between items-start mb-4">
                                       <div>
                                          <Badge className="bg-amber-50 text-amber-700 border-none text-[10px] font-black px-2 mb-1">
                                             {item.id}
                                          </Badge>
                                          <h4 className="text-sm font-bold text-fin-text-primary leading-tight">{item.nama}</h4>
                                       </div>
                                       <div className="text-right">
                                          <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Kas Efektif</p>
                                          <p className={cn(
                                             "text-lg font-extrabold tabular-nums",
                                             item.kas_efektif > 0 ? "text-fin-income" : "text-fin-expense"
                                          )}>
                                             {formatCurrency(item.kas_efektif)}
                                          </p>
                                       </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#F2F4F7]">
                                       <div className="space-y-1">
                                          <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Total Masuk</p>
                                          <p className="text-xs font-bold text-fin-text-primary">{formatCurrency(item.total_masuk)}</p>
                                       </div>
                                       <div className="space-y-1">
                                          <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Total Keluar</p>
                                          <p className="text-xs font-bold text-[#D92D20]">{formatCurrency(item.total_keluar)}</p>
                                       </div>
                                    </div>
     
                                    <div className="mt-4 bg-[#F9FAFB] rounded-lg p-3 flex justify-between items-center border border-amber-50">
                                       <span className="text-[10px] font-bold text-fin-text-muted">Saldo Buku:</span>
                                       <span className="text-[10px] font-extrabold text-fin-text-primary">{formatCurrency(item.saldo_buku)}</span>
                                    </div>
                                    
                                    {item.talangan_diberikan > 0 && (
                                       <div className="mt-2 flex items-center gap-2 text-[#B42318] px-1">
                                          <AlertCircle size={12} />
                                          <span className="text-[9px] font-bold uppercase">Terikat Talangan: {formatCurrency(item.talangan_diberikan)}</span>
                                       </div>
                                    )}
                                 </Card>
                              ))}
                           </div>
                        </div>
                      </>
                   )}
                </div>

                <div className="p-6 bg-fin-page border-t border-fin-border shrink-0">
                   <Button 
                      onClick={fetchCashStats} 
                      className="w-full h-12 bg-fin-text-primary hover:opacity-90 text-fin-surface rounded-xl font-bold flex items-center justify-center gap-2"
                   >
                      <RefreshCw size={16} className={loadingCashStats ? "animate-spin" : ""} />
                      Refresh Saldo
                   </Button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODALS */}
      <AnimatePresence>
        {previewPdf && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#000000]/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="bg-fin-surface w-full max-w-6xl h-[90vh] rounded-xl shadow-2xl overflow-hidden flex flex-col">
                <div className="h-16 border-b border-fin-border flex items-center justify-between px-8 bg-fin-page">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-ds-primary rounded-lg flex items-center justify-center text-white"><FileText size={16} /></div>
                    <div>
                       <h3 className="text-sm font-semibold text-fin-text-primary">Document Viewer</h3>
                       <p className="text-[11px] text-fin-text-muted">Pratinjau Arsip Digital SP2D</p>
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
        {rekonModal && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-[#000000]/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-fin-surface w-full max-w-lg rounded-xl shadow-2xl p-10 border border-fin-border">
               <div>
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 bg-[#F5F8FF] text-fin-info rounded-lg flex items-center justify-center border border-[#B2DDFF]">
                      <RefreshCw size={24} />
                    </div>
                    <Button 
                      variant="outline" 
                      onClick={handleSyncRekon}
                      className="h-9 px-4 border-indigo-100 bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100 hover:text-indigo-800 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm group"
                    >
                      <Sparkles size={14} className="group-hover:rotate-12 transition-transform" />
                      Auto-Sync Magic Match
                    </Button>
                  </div>
                  <h3 className="text-xl font-semibold text-fin-text-primary mb-1">Rekonsiliasi Bank</h3>
                  <p className="text-sm text-fin-text-muted mb-8">Validasi selisih nilai SP2D dan pemindahbukuan</p>
                  
                  <div className="space-y-6">
                     <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-black text-fin-info uppercase tracking-widest ml-1">Tanggal Cair (Bank)</label>
                          <Input 
                            type="date" 
                            className="h-12 bg-fin-surface border-2 border-[#2E90FA]/10 rounded-lg outline-none focus:border-ds-focus-ring font-bold text-fin-text-primary transition-all shadow-sm"
                            value={rekonModal.tanggalPencairan}
                            onChange={(e) => setRekonModal({...rekonModal, tanggalPencairan: e.target.value})}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-fin-info ml-1 uppercase tracking-widest">Nilai Real Bank (Rp)</label>
                          <div className="relative">
                            <input 
                              type="text" 
                              className="w-full px-4 h-12 bg-fin-surface border-2 border-[#2E90FA]/20 rounded-lg outline-none focus:border-ds-focus-ring font-bold text-fin-text-primary text-lg tracking-tight transition-all shadow-sm"
                              placeholder="0"
                              value={formatNumber(rekonModal.nilaiBank)}
                              onChange={(e) => {
                                const nBank = parseNumber(e.target.value);
                                setRekonModal({
                                  ...rekonModal,
                                  nilaiBank: nBank,
                                  selisih: rekonModal.nilaiNeto - nBank
                                });
                              }}
                            />
                          </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                           <label className="text-[10px] font-medium text-fin-text-muted ml-1 uppercase tracking-wider">Nilai SP2D (Neto)</label>
                           <div className="h-10 flex items-center px-4 bg-fin-subtle border border-fin-border rounded-lg font-bold text-fin-text-muted text-sm tabular-nums">
                             {formatCurrency(rekonModal.nilaiNeto)}
                           </div>
                        </div>
                        <div className="space-y-2">
                           <label className="text-[10px] font-medium text-fin-text-muted ml-1 uppercase tracking-wider">Kalkulasi Selisih</label>
                           <div className={cn(
                             "h-10 flex items-center px-4 rounded-lg font-black text-sm tabular-nums border",
                             rekonModal.selisih === 0 ? "bg-fin-income/10 text-fin-income border-fin-income/20" : "bg-fin-warning/10 text-fin-warning border-fin-warning/20"
                           )}>
                             {formatCurrency(rekonModal.selisih)}
                           </div>
                        </div>
                     </div>
  
                     <div className="space-y-2">
                       <label className="text-xs font-medium text-fin-text-muted ml-1">Keterangan / Berita Acara</label>
                       <textarea 
                         className="w-full px-4 py-3 bg-fin-page border border-fin-border rounded-lg outline-none min-h-[80px] font-medium text-fin-text-primary text-sm transition-all"
                         placeholder="Masukkan alasan selisih secara detail..."
                         value={rekonModal.keterangan}
                         onChange={(e) => setRekonModal({...rekonModal, keterangan: e.target.value})}
                       />
                     </div>
  
                     <div className="flex gap-3 pt-2">
                        <Button 
                          variant="outline"
                          onClick={() => setRekonModal(null)}
                          className="flex-1 h-11 border-fin-border text-fin-text-muted font-semibold rounded-lg hover:bg-fin-page"
                        >
                          Batal
                        </Button>
                        <Button 
                          onClick={handleSaveRekon}
                          disabled={savingRekon}
                          className="flex-1 h-11 bg-fin-text-primary text-fin-surface rounded-lg font-semibold hover:opacity-90 transition-all gap-2"
                        >
                          {savingRekon ? <Loader2 className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
                          Simpan Rekon
                        </Button>
                     </div>
                  </div>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FLOATING ACTION BAR FOR BULK ACTIONS */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[150] w-full max-w-2xl px-4"
          >
            <div className="bg-fin-surface/95 backdrop-blur-xl text-fin-text-primary p-4 rounded-xl shadow-2xl border border-fin-border flex items-center justify-between gap-6 ring-4 ring-black/10">
               <div className="flex items-center gap-4 pl-2">
                 <div className="w-8 h-8 bg-fin-info text-fin-surface rounded-lg flex items-center justify-center font-bold text-sm">
                   {selectedIds.length}
                 </div>
                 <div>
                    <p className="text-xs font-bold">Data Terpilih</p>
                    <p className="text-[10px] text-fin-text-muted">Aksi massal untuk dokumen SP2D</p>
                 </div>
               </div>
               
               <div className="flex items-center gap-2">
                  <Button 
                    variant="ghost" 
                    onClick={() => setSelectedIds([])}
                    className="h-10 px-4 text-xs font-semibold text-fin-text-muted hover:text-fin-text-primary hover:bg-fin-subtle rounded-lg"
                  >
                    Batalkan
                  </Button>
                  <Button 
                    onClick={handleDeleteBulk}
                    className="h-10 px-6 bg-fin-expense text-fin-surface rounded-lg font-bold text-xs hover:opacity-90 shadow-lg shadow-fin-expense/20 flex items-center gap-2"
                  >
                    <Trash size={14} />
                    Hapus Permanen
                  </Button>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* RESTORE TANGGAL PENCAIRAN DIALOG */}
      <Dialog open={restoreModal} onOpenChange={setRestoreModal}>
        <DialogContent className="max-w-md bg-fin-surface rounded-xl p-0 overflow-hidden border border-fin-border">
          <div className="bg-rose-600 p-7 text-white">
            <div className="flex items-center gap-3">
              <CalendarCheck size={28} />
              <div>
                <h2 className="text-lg font-black uppercase tracking-wide">Pulihkan Tanggal Pencairan</h2>
                <p className="text-rose-100 text-xs mt-0.5">Restore otomatis dari data potongan & bank statement</p>
              </div>
            </div>
          </div>
          <div className="p-6 space-y-4">
            {restorePreview && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-rose-600">{restorePreview.total_null}</p>
                  <p className="text-[9px] text-rose-500 uppercase font-bold mt-1">SP2D Tanpa Tgl Cair</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-black text-green-600">{restorePreview.bisa_pulih_dari_potongan}</p>
                  <p className="text-[9px] text-green-600 uppercase font-bold mt-1">Bisa Dipulihkan</p>
                </div>
              </div>
            )}
            {restoreLog.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-fin-border divide-y divide-fin-border text-xs">
                {restoreLog.slice(0, 50).map((r, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2">
                    <span className="font-mono text-fin-text-muted">{r.nomor}</span>
                    <span className={`font-bold ${r.sumber === 'TIDAK_DITEMUKAN' ? 'text-rose-400' : 'text-green-600'}`}>
                      {r.sumber === 'TIDAK_DITEMUKAN' ? '—' : r.tanggal}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-fin-text-muted leading-relaxed">
              Strategi 1: dari <strong>data potongan SP2D</strong> (tidak ikut reset rekonsiliasi).<br/>
              Strategi 2: fuzzy-match dari <strong>bank statement</strong> berdasarkan nilai &amp; tanggal.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => handleRestore(false)}
                disabled={restoring || (restorePreview?.total_null === 0)}
                className="flex-1 h-12 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-black text-xs uppercase"
              >
                {restoring ? <Loader2 size={14} className="animate-spin mr-2" /> : <CalendarCheck size={14} className="mr-2" />}
                Pulihkan Sekarang
              </Button>
              <Button variant="ghost" onClick={() => setRestoreModal(false)} className="h-12 px-4 rounded-xl text-xs font-bold">
                Batal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* IMPORT PREVIEW DIALOG (NEW PREMIUM UI) */}
      <Dialog open={importPreview.isOpen} onOpenChange={(v) => !isImporting && setImportPreview({ ...importPreview, isOpen: v })}>
         <DialogContent className="!fixed !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !max-w-2xl !w-[90vw] !max-h-[95vh] rounded-xl p-0 overflow-hidden border-none shadow-2xl flex flex-col">
            <div className="bg-ds-primary p-8 text-white relative overflow-hidden shrink-0">
               <div className="absolute top-0 right-0 p-6 opacity-10 rotate-12">
                  <FileUp size={80} />
               </div>
               <div className="relative z-10 flex items-center gap-4">
                  <div className="w-16 h-16 bg-fin-surface/10 backdrop-blur-xl rounded-[20px] flex items-center justify-center text-fin-info border border-white/10">
                     <Sparkles size={32} />
                  </div>
                  <div>
                     <DialogTitle className="text-xl font-bold tracking-tight">Pratinjau Impor Data</DialogTitle>
                     <DialogDescription className="text-fin-text-muted font-medium mt-0.5">Verifikasi dokumen sebelum dimasukkan ke dalam sistem</DialogDescription>
                  </div>
               </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
               <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 bg-fin-page rounded-xl border border-fin-border">
                     <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest mb-1">Jumlah Dokumen</p>
                     <p className="text-xl font-bold text-fin-text-primary">{importPreview.stats?.count} Records</p>
                  </div>
                  <div className="p-5 bg-fin-page rounded-xl border border-fin-border">
                     <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest mb-1">Total Nilai Bruto</p>
                     <p className="text-xl font-bold text-fin-income">{formatCurrency(importPreview.stats?.total || 0)}</p>
                  </div>
               </div>

               <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                     <h4 className="text-[10px] font-bold text-fin-text-primary uppercase tracking-wider">Detil Batch</h4>
                     <Badge className="bg-fin-info-bg text-[#175CD3] border-none font-bold text-[9px]">READY FOR IMPORT</Badge>
                  </div>
                  <div className="space-y-2">
                     {importPreview.data.map((item: any, idx: number) => (
                        <div key={idx} className="p-3 bg-fin-surface border border-fin-border rounded-xl flex justify-between items-center hover:border-[#2E90FA] transition-colors group">
                           <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-lg bg-[#F1F3F5] flex items-center justify-center text-[9px] font-bold text-fin-text-muted group-hover:bg-[#2E90FA] group-hover:text-white transition-colors">
                                 {idx + 1}
                              </div>
                              <div>
                                 <div className="flex items-center gap-1.5 group/copy">
                                    <p className="text-[11px] font-bold text-fin-text-primary truncate max-w-[150px] transition-colors group-hover/copy:text-fin-info-text select-all">{item.nomor || 'NOMOR KOSONG'}</p>
                                    <button
                                      title="Salin nomor SP2D"
                                      onClick={() => {
                                        navigator.clipboard.writeText(item.nomor);
                                        toast.success('Nomor disalin', { description: item.nomor });
                                      }}
                                      className="p-0.5 rounded opacity-40 hover:opacity-100 hover:bg-indigo-50 hover:text-fin-info-text text-fin-text-muted transition-all shrink-0"
                                    >
                                      <Copy size={11} />
                                    </button>
                                 </div>
                                 <p className="text-[9px] font-medium text-fin-text-muted truncate max-w-[150px]">{item.opd}</p>
                              </div>
                           </div>
                           <div className="text-right flex flex-col items-end gap-1">
                              <p className="text-[11px] font-bold text-fin-text-primary">{formatCurrency(item.nilai_bruto)}</p>
                              <div className="flex gap-1">
                                 <Badge className={cn(
                                   "text-[7px] font-bold uppercase px-1 py-0 border-none",
                                   item.status_dokumen === 'AMAN' ? "bg-[#ECFDF3] text-[#027A48]" : 
                                   (item.status_dokumen === 'TALANGAN' ? "bg-[#FFFAEB] text-[#B54708]" : "bg-[#FEF3F2] text-[#B42318]")
                                 )}>
                                   {item.status_dokumen}
                                 </Badge>
                                 <Badge className={cn(
                                   "text-[7px] font-bold uppercase px-1 py-0 border-none",
                                   item.status_input === 'BELUM INPUT' ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#F5F8FF] text-[#2E90FA]"
                                 )}>
                                   {item.status_input === 'BELUM INPUT' ? 'BELUM INPUT' : 'INPUT OK'}
                                 </Badge>
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

               <div className="bg-amber-50 border border-amber-100 p-5 rounded-xl flex items-start gap-3">
                  <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-500/20">
                     <AlertCircle size={16} />
                  </div>
                  <p className="text-[11px] font-semibold text-amber-900 leading-relaxed">
                     Sistem akan secara otomatis mencatat data sebagai **TALANGAN** jika saldo kas per sumber dana tidak mencukupi. Data akan tetap masuk ke aplikasi untuk perbaikan manual.
                  </p>
               </div>
            </div>

            <DialogFooter className="p-10 bg-fin-page border-t border-fin-border flex flex-col gap-6">
               {isImporting ? (
                  <div className="w-full space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
                     <div className="flex justify-between items-end">
                        <div className="space-y-1">
                           <p className="text-[10px] font-black text-fin-text-primary uppercase tracking-widest">Status Pengunggahan</p>
                           <p className="text-xs font-medium text-[#667085]">Memproses: <span className="text-fin-text-primary font-bold">{importProgress.currentName}</span></p>
                        </div>
                        <p className="text-xl font-black text-fin-text-primary tabular-nums">
                           {Math.round((importProgress.current / importProgress.total) * 100)}%
                        </p>
                     </div>
                     <div className="h-3 w-full bg-[#EAECF0] rounded-full overflow-hidden border border-fin-border-strong/20 shadow-inner">
                        <motion.div 
                           initial={{ width: 0 }}
                           animate={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                           className="h-full bg-ds-primary rounded-full"
                        />
                     </div>
                     <p className="text-[10px] text-center font-bold text-fin-text-muted uppercase tracking-widest">
                        {importProgress.current} DARI {importProgress.total} DOKUMEN BERHASIL DIPROSES
                     </p>
                  </div>
               ) : (
                  <div className="flex gap-4 w-full sm:flex-row flex-col">
                     <Button 
                       onClick={handleCommitImport} 
                       className="h-14 flex-1 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-xl font-bold text-sm shadow-xl shadow-[#101828]/20 group transition-all"
                     >
                        <div className="flex items-center gap-2">
                           <Save size={18} className="group-hover:scale-110 transition-transform" />
                           <span>KONFIRMASI & IMPORT SEKARANG</span>
                        </div>
                     </Button>
                     <Button 
                       variant="ghost" 
                       onClick={() => setImportPreview({ isOpen: false, data: [], stats: null })}
                       className="h-14 px-8 text-fin-text-muted font-bold hover:bg-fin-surface rounded-xl transition-all"
                     >
                        BATALKAN
                     </Button>
                  </div>
               )}
            </DialogFooter>
         </DialogContent>
      </Dialog>

      <ConfirmDialog 
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        type={confirmState.type}
        isLoading={confirmState.isLoading}
      />
    </div>
  );
}
