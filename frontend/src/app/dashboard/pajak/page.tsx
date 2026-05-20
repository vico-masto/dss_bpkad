'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  PlusSquare,
  ShieldCheck,
  History,
  Database,
  Search,
  Edit,
  Trash2,
  Save,
  RefreshCw,
  Download,
  Printer,
  FileUp,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
  ArrowRight,
  Loader2,
  ChevronDown,
  FileSpreadsheet,
  AlertCircle,
  LayoutTemplate,
  FileText,
  BookOpen,
  BarChart3,
  Activity,
  Table as TableIcon,
  Eye,
  EyeOff
} from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcel, exportToPDF, printPDF, downloadTemplate } from '@/lib/exportUtils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from 'sonner';
import { NumericInput } from '@/components/NumericInput';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { PageHeader } from '@/components/patterns/page-header';

const fetcher = (url: string) => api.get(url).then(res => res.data);

export default function PajakUnifiedPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');

  const [activeTab, setActiveTab] = useState('manajemen');

  useEffect(() => {
    if (tabParam === 'manajemen' || tabParam === 'bku' || tabParam === 'monitoring') {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');


  // Setoran Pajak Form State
  const [sumberDanaList, setSumberDanaList] = useState([]);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    nomor_ntpn: '',
    uraian: '',
    id_sumber_dana: '',
    opd: '',
    nilai: 0,
    jenis_pajak: 'PPN'
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [editSource, setEditSource] = useState<string | null>(null);

  // Confirm Dialog State
  const [confirmConfig, setConfirmConfig] = useState<{
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
    type: 'warning',
    onConfirm: () => {},
    isLoading: false
  });

  // Rister States
  const [showData, setShowData] = useState(false);
  const [importPotonganBulan, setImportPotonganBulan] = useState<number>(0);
  const [importPotonganTahun, setImportPotonganTahun] = useState<number>(new Date().getFullYear());
  const [isImportingPotongan, setIsImportingPotongan] = useState(false);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [selectedItems, setSelectedItems] = useState<{id: string, source: string}[]>([]);
  const { data: potonganCountData, mutate: mutatePotonganCount } = useSWR(
    activeTab === 'manajemen' ? `/sp2d/potongan-count?bulan=${importPotonganBulan}&tahun=${importPotonganTahun}` : null,
    fetcher
  );

  // Data Fetching with Auto-Refresh (Polling every 2 minutes)
  const swrConfig = {
    refreshInterval: 120000, // 2 minutes
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 5000
  };

  const { data: monitorData, error: monitorError, isLoading: monitorLoading, mutate: mutateMonitor } = useSWR(showData ? `/reports/tax-monitoring?page=${currentPage}&limit=10` : null, fetcher, swrConfig);
  const { data: setoranData, mutate: mutateSetoran } = useSWR(showData ? `/dss/setoran-pajak` : null, fetcher, swrConfig);
  const { data: risterBkuData, mutate: mutateRisterBku, error: risterBkuError, isLoading: risterLoading } = useSWR(
    (showData && (activeTab === 'bku' || activeTab === 'manajemen')) ? `/reports/rister-bku?bulan=${importPotonganBulan}&tahun=${importPotonganTahun}` : null,
    fetcher,
    swrConfig
  );
  const { data: opdSummaryData, mutate: mutateOpdSummary } = useSWR(activeTab === 'monitoring' ? `/reports/opd-tax-summary?tahun=${importPotonganTahun}&bulan=${importPotonganBulan}` : null, fetcher, swrConfig);
  const { data: monthlyAnalyticsData } = useSWR(activeTab === 'monitoring' ? `/reports/tax-monthly-analytics?tahun=${importPotonganTahun}` : null, fetcher, swrConfig);

  useEffect(() => {
    if (risterBkuError) {
      toast.error('Gagal memuat data BKU Rister: ' + (risterBkuError.response?.data?.error || risterBkuError.message));
    }
  }, [risterBkuError]);

  useEffect(() => {
    fetchSumberDana();
  }, []);

  const { data: opdListData } = useSWR('/sp2d/opd', fetcher);
  const opdList = Array.isArray(opdListData) ? opdListData : (opdListData?.data || []);

  const fetchSumberDana = async () => {
    try {
      const res = await api.get('/dss/sumber-dana');
      setSumberDanaList(res.data);
    } catch (err) {}
  };

  const handleExportExcel = () => {
    if (!monitorData?.data) return;
    const exportData = monitorData.data.map((item: any, index: number) => ({
      'No': index + 1,
      'Tanggal': format(new Date(item.tanggal), 'dd/MM/yyyy'),
      'No. Bukti': item.bukti,
      'Keterangan': item.keterangan,
      'Tipe': item.tipe,
      'Nilai': item.nilai,
      'Saldo Outstand.': item.saldo,
      'Audit Rekon': item.keterangan_rekon || item.status_rekon || '-'
    }));
    exportToExcel(exportData, `Buku_Pembantu_Pajak_${format(new Date(), 'yyyyMMdd')}`);
  };

  const handleExportPDF = async () => {
    const loadToast = toast.loading('Menyiapkan dokumen PDF...');
    try {
      const res = await api.get(`/reports/tax-monitoring`, { params: { limit: 10000, page: 1 } });
      const allData = res.data.data || [];
      toast.dismiss(loadToast);

      const headers = ['No.', 'Tgl', 'Bukti', 'Keterangan', 'Tipe', 'Nilai', 'Saldo', 'Audit Rekon'];
      const body = allData.map((item: any, index: number) => [
        index + 1,
        format(new Date(item.tanggal), 'dd/MM/yy'),
        item.bukti,
        item.keterangan.substring(0, 30),
        item.tipe,
        formatCurrency(item.nilai),
        formatCurrency(item.saldo), item.keterangan_rekon || item.status_rekon || '-'
      ]);
      exportToPDF(headers, body, `Buku_Pembantu_Pajak_${format(new Date(), 'yyyyMMdd')}`, 'Buku Pembantu Pajak');
    } catch (err) {
      toast.error('Gagal memuat data lengkap');
      toast.dismiss(loadToast);
    }
  };

  const handleExportRisterExcel = () => {
    if (!risterBkuData?.data) return;
    const exportData = risterBkuData.data.map((item: any, index: number) => ({
      'No': index + 1,
      'Tanggal': format(new Date(item.tanggal), 'dd/MM/yyyy'),
      'No. SP2D': item.bukti || 'Tidak Terdeteksi',
      'OPD': item.opd,
      'Uraian': item.uraian,
      'Nilai': item.nilai
    }));
    exportToExcel(exportData, `BKU_Rister_${format(new Date(), 'yyyyMMdd')}`);
  };

  const handleExportRisterPDF = async () => {
    const headers = ['No.', 'Tgl', 'No. SP2D', 'OPD', 'Uraian', 'Nilai', 'Audit Rekon'];
    const body = (risterBkuData?.data || []).map((item: any, index: number) => [
      index + 1,
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.bukti || 'Tidak Terdeteksi',
      item.opd,
      item.uraian.substring(0, 30),
      formatCurrency(item.nilai),
      item.keterangan_rekon || item.status_rekon || '-'
    ]);
    exportToPDF(headers, body, `BKU_Rister_${format(new Date(), 'yyyyMMdd')}`, 'BKU Rincian Potongan Bank (Rister)');
  };

  const handlePrintPDF = async () => {
    const loadToast = toast.loading('Menyiapkan dokumen cetak...');
    try {
      const res = await api.get(`/reports/tax-monitoring`, { params: { limit: 10000, page: 1 } });
      const allData = res.data.data || [];
      toast.dismiss(loadToast);

      const headers = ['No.', 'Tgl', 'Bukti', 'Keterangan', 'Tipe', 'Nilai', 'Saldo', 'Audit Rekon'];
      const body = allData.map((item: any, index: number) => [
        index + 1,
        format(new Date(item.tanggal), 'dd/MM/yy'),
        item.bukti,
        item.keterangan.substring(0, 30),
        item.tipe,
        formatCurrency(item.nilai),
        formatCurrency(item.saldo), item.keterangan_rekon || item.status_rekon || '-'
      ]);
      printPDF(headers, body, 'Buku Pembantu Pajak');
    } catch (err) {
      toast.error('Gagal memuat dokumen');
      toast.dismiss(loadToast);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ['tanggal', 'nomor_bukti', 'id_sumber_dana', 'nilai', 'uraian'];
    const sampleData = [
      ['2026-01-10', 'NTPN123456789', 'SD-PENDAPATAN', 500000, 'Setoran PPN Kegiatan X'],
      ['2026-01-12', 'NTPN987654321', 'SD-LAINNYA', 150000, 'Setoran PPh 21 Januari']
    ];
    downloadTemplate(headers, 'Template_Import_Pajak_Manual', sampleData);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);
        
        if (!rawData || rawData.length === 0) {
          toast.error('File Excel kosong');
          return;
        }

        setConfirmConfig({
          isOpen: true,
          title: 'Konfirmasi Impor',
          message: `Impor ${rawData.length} data setoran pajak ke dalam sistem?`,
          type: 'question',
          onConfirm: async () => {
            setConfirmConfig(prev => ({ ...prev, isLoading: true }));
            setSaving(true);
            let successCount = 0;
            let failCount = 0;
            let errors: string[] = [];

            for (const item of rawData as any[]) {
              try {
                const getVal = (keyTarget: string) => {
                  const found = Object.keys(item).find(k => {
                    const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                    const cleanTarget = keyTarget.toLowerCase().replace(/[^a-z0-9]/g, '');
                    if (cleanKey === cleanTarget) return true;
                    if (cleanTarget === 'idsumberdana' && (cleanKey === 'sumberdana' || cleanKey === 'sd' || cleanKey === 'id_sd')) return true;
                    if (cleanTarget === 'nomorbukti' && (cleanKey === 'ntpn' || cleanKey === 'no_resi' || cleanKey === 'nobukti')) return true;
                    return false;
                  });
                  return found ? item[found] : '';
                };

                let rawDate = getVal('tanggal') || getVal('tgl');
                let dateVal = new Date().toISOString().split('T')[0];
                
                if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
                  dateVal = format(rawDate, 'yyyy-MM-dd');
                } else if (typeof rawDate === 'string' && rawDate.length >= 8) {
                  const d = new Date(rawDate);
                  if (!isNaN(d.getTime())) dateVal = format(d, 'yyyy-MM-dd');
                } else if (typeof rawDate === 'number') {
                   const jsDate = new Date((rawDate - 25569) * 86400 * 1000);
                   if (!isNaN(jsDate.getTime())) dateVal = format(jsDate, 'yyyy-MM-dd');
                }

                let sdVal = getVal('idsumberdana');
                if (sdVal) {
                  const sd = sdVal.toString().toUpperCase().trim();
                  if (sd === 'DAU' || sd.includes('SD-DAU')) sdVal = 'SD-DAU';
                  else if (sd === 'PAD' || sd.includes('SD-PAD')) sdVal = 'SD-PAD';
                  else if (sd.includes('DAK') && sd.includes('FISIK')) sdVal = 'SD-DAKF';
                  else if (sd.includes('DAK') && sd.includes('NON')) sdVal = 'SD-DAKNF';
                  else if (sd === 'DBH' || sd.includes('SD-DBH')) sdVal = 'SD-DBH';
                  else if (sd === 'SILPA' || sd.includes('SD-SILPA')) sdVal = 'SD-SILPA';
                }

                const ntpn = (getVal('nomorbukti')?.toString() || '').trim();
                const uraian = (getVal('uraian')?.toString() || '').trim();
                const nilaiVal = getVal('nilai') || getVal('nominal') || getVal('jumlah') || 0;

                await api.post('/dss/setoran-pajak', {
                  tanggal: dateVal,
                  nomor_bukti: ntpn || `NTPN-${Date.now()}-${Math.random().toString(36).substring(7)}`,
                  id_sumber_dana: sdVal || 'SD-LAINNYA',
                  nilai: parseNumber(nilaiVal) || 0,
                  uraian: uraian || 'Setoran Pajak (Import)',
                  jenis_pajak: getVal('jenispajak') || 'PPN',
                  skipDuplicate: true
                });
                successCount++;
              } catch (err: any) {
                const errMsg = err.response?.data?.message || err.message;
                if (!errors.includes(errMsg)) errors.push(errMsg);
                failCount++;
              }
            }
            
            if (failCount > 0) {
               toast.warning(`Impor selesai: ${successCount} berhasil, ${failCount} gagal.`, {
                 description: errors.length > 0 ? `Masalah: ${errors.join(', ')}` : undefined
               });
            } else {
               toast.success(`Berhasil mengimpor ${successCount} data setoran pajak.`);
            }
            mutateMonitor();
            mutateSetoran();
            setSaving(false);
            setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
          }
        });
      } catch (err) {
        toast.error('Gagal impor data. Pastikan format kolom sesuai template.');
      } finally {
        setSaving(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleDownloadTemplatePotongan = () => {
    const headers = ['TANGGAL_PENCAIRAN', 'NOMOR_SP2D', 'OPD', 'SUMBER_DANA', 'URAIAN', 'NILAI_POTONGAN'];
    const sampleData = [
      ['2026-01-15', '00123/SP2D/LS/2026', 'DINAS KESEHATAN', 'SD-DAU', 'POTONGAN PPN ATAS BELANJA ALAT MEDIS', 2500000],
      ['2026-01-20', '00456/SP2D/GJ/2026', 'BPKAD', 'SD-PAD', 'IURAN WAJIB PEGAWAI (IWP) 8% JANUARI', 1200000],
      ['2026-01-25', '00789/SP2D/LS/2026', 'DINAS SOSIAL', 'SD-DAU', 'ZAKAT PROFESI ASN BULAN JANUARI', 350000]
    ];
    downloadTemplate(headers, 'Template_Import_Potongan_Rister', sampleData);
  };

  const handleImportPotonganManual = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingPotongan(true);
    const toastId = toast.loading('Memproses file rincian potongan...');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json(ws);

        if (!rawData || rawData.length === 0) {
           toast.error('File Excel rincian kosong');
           setIsImportingPotongan(false);
           return;
        }

        setConfirmConfig({
          isOpen: true,
          title: 'Konfirmasi Impor Rincian',
          message: `Ditemukan ${rawData.length} baris data. Lanjutkan proses impor rincian potongan ke database?`,
          type: 'question',
          onConfirm: async () => {
            setConfirmConfig(prev => ({ ...prev, isLoading: true }));
            setIsImportingPotongan(true);
            const toastId = toast.loading('Mengunggah data rincian ke server...');

            try {
              const processed = rawData.map((item: any) => {
                const findVal = (keys: string[]) => {
                  const foundKey = Object.keys(item).find(k => {
                    const cleanK = k.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    return keys.some(tk => {
                      const cleanTk = tk.toUpperCase().replace(/[^A-Z0-9]/g, '');
                      return cleanK.includes(cleanTk);
                    });
                  });
                  return foundKey ? item[foundKey] : null;
                };

                let rawDate = findVal(['TANGGALPENCAIRAN', 'TANGGAL', 'CAIR', 'DATE']);
                let dateVal = new Date().toISOString().split('T')[0];
                
                if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
                  dateVal = `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`;
                } else if (typeof rawDate === 'string' && rawDate.length >= 8) {
                  const d = new Date(rawDate);
                  if (!isNaN(d.getTime())) {
                    if (rawDate.includes('-') && rawDate.length >= 10) {
                      dateVal = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
                    } else {
                      dateVal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    }
                  }
                } else if (typeof rawDate === 'number') {
                  const jsDate = new Date((rawDate - 25569) * 86400 * 1000);
                  if (!isNaN(jsDate.getTime())) {
                    dateVal = `${jsDate.getFullYear()}-${String(jsDate.getMonth() + 1).padStart(2, '0')}-${String(jsDate.getDate()).padStart(2, '0')}`;
                  }
                }

                return {
                  TANGGAL_PENCAIRAN: dateVal,
                  NOMOR_SP2D: (findVal(['NOMORSP2D', 'NOSPI', 'NO_SP2D', 'BUKTI'])?.toString() || '').trim(),
                  OPD: (findVal(['NAMAOPD', 'DINAS', 'OPD'])?.toString() || '').trim(),
                  SUMBER_DANA: (findVal(['SUMBERDANA', 'SD', 'ID_SD', 'DANA'])?.toString() || '').trim(),
                  URAIAN: (findVal(['URAIAN', 'KETERANGAN', 'KEGIATAN'])?.toString() || '').trim(),
                  NILAI_POTONGAN: parseNumber(findVal(['NILAIPOTONGAN', 'POTONGAN', 'JUMLAH']) || 0)
                };
              }).filter(row => row.NILAI_POTONGAN > 0);

              const res = await api.post('/sp2d/import-potongan-manual', {
                data: processed,
                bulan: Number(importPotonganBulan),
                tahun: importPotonganTahun
              });

              toast.dismiss(toastId);
              toast.success('Impor Rincian Selesai', {
                description: `Berhasil mengolah data rincian potongan bank.`
              });
              mutatePotonganCount();
              mutateRisterBku();
              setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
            } catch (err: any) {
              toast.dismiss(toastId);
              const errMsg = err.response?.data?.message || err.message;
              toast.error('Gagal memproses file potongan: ' + errMsg);
              setConfirmConfig(prev => ({ ...prev, isLoading: false }));
            } finally {
              setIsImportingPotongan(false);
            }
          }
        });
      } catch (err: any) {
        toast.dismiss(toastId);
        const errMsg = err.response?.data?.message || err.message;
        toast.error('Gagal memproses file potongan: ' + errMsg);
        console.error(err);
      } finally {
        setIsImportingPotongan(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImportExcelPajak = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImportingExcel(true);

    setConfirmConfig({
      isOpen: true,
      title: 'Konfirmasi Impor SIPD',
      message: `Unggah dan proses file ekspor SIPD RI Penatausahaan? Sistem akan memetakan rincian potongan secara otomatis.`,
      type: 'question',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isLoading: true }));
        const toastId = toast.loading('Mengunggah dan memproses rincian dari SIPD RI...');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('bulan', importPotonganBulan.toString());
        formData.append('tahun', importPotonganTahun.toString());

        try {
          const res = await api.post('/sp2d/import-excel-pajak', formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });

          toast.dismiss(toastId);
          toast.success(res.data.message, {
            description: `Berhasil memproses ${res.data.summary.success} rincian potongan.`
          });
          mutatePotonganCount();
          mutateRisterBku();
          mutateMonitor();
          setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err: any) {
          toast.dismiss(toastId);
          toast.error(err.response?.data?.message || 'Gagal mengimpor file Excel');
          setConfirmConfig(prev => ({ ...prev, isLoading: false }));
        } finally {
          setIsImportingExcel(false);
        }
      }
    });

    if (e.target) e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        tanggal: formData.tanggal,
        nomor_bukti: formData.nomor_ntpn,
        uraian: formData.uraian,
        id_sumber_dana: formData.id_sumber_dana || null,
        opd: formData.opd,
        nilai: formData.nilai,
        jenis_pajak: formData.jenis_pajak
      };

      if (editId) {
        if (editSource === 'bank') {
          await api.put(`/sp2d/potongan/${editId}`, payload);
        } else {
          await api.put(`/dss/setoran-pajak/${editId}`, payload);
        }
        toast.success('Pembaruan Berhasil', { description: 'Data rincian potongan telah diperbarui dalam sistem.' });
      } else {
        await api.post('/dss/setoran-pajak', payload);
        toast.success('Berhasil Disimpan', { description: 'Setoran pajak baru telah berhasil direkam ke database.' });
      }

      setFormData({
        tanggal: new Date().toISOString().split('T')[0],
        nomor_ntpn: '',
        uraian: '',
        id_sumber_dana: '',
        opd: '',
        nilai: 0,
        jenis_pajak: 'PPN'
      });
      setEditId(null);
      setEditSource(null);
      mutateMonitor();
      mutateSetoran();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan setoran pajak');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: any) => {
    const targetId = item.original_id || item.id;
    setFormData({
      tanggal: format(new Date(item.tanggal), 'yyyy-MM-dd'),
      nomor_ntpn: item.bukti || item.nomor_bukti,
      uraian: item.keterangan || item.uraian,
      id_sumber_dana: item.id_sumber_dana || '',
      opd: item.opd || '',
      nilai: item.nilai,
      jenis_pajak: item.jenis_pajak || 'PPN'
    });
    setEditId(targetId);
    setEditSource(item.source || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string, source?: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Hapus Data Pajak',
      message: 'Apakah Anda yakin ingin menghapus data rincian potongan ini? Tindakan ini tidak dapat dibatalkan.',
      type: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isLoading: true }));
        try {
          if (source === 'bank') {
            await api.delete(`/sp2d/potongan/${id}`);
          } else {
            await api.delete(`/dss/setoran-pajak/${id}`);
          }
          toast.success('Data berhasil dihapus');
          mutateMonitor();
          mutateSetoran();
          mutateRisterBku();
          mutatePotonganCount();
          mutateOpdSummary();
          setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          toast.error('Gagal menghapus data');
          setConfirmConfig(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Hapus Masal Data',
      message: `Apakah Anda yakin ingin menghapus ${selectedItems.length} data terpilih secara masal?`,
      type: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isLoading: true }));
        const loadToast = toast.loading(`Menghapus ${selectedItems.length} data...`);
        try {
          await api.post('/sp2d/potongan/bulk-delete', { items: selectedItems });
          toast.success('Berhasil dihapus secara masal');
          setSelectedItems([]);
          mutateMonitor();
          mutateSetoran();
          mutateRisterBku();
          mutatePotonganCount();
          mutateOpdSummary();
          setConfirmConfig(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err) {
          toast.error('Gagal melakukan hapus masal');
          setConfirmConfig(prev => ({ ...prev, isLoading: false }));
        } finally {
          toast.dismiss(loadToast);
        }
      }
    });
  };

  const toggleSelection = (id: string, source: string) => {
    setSelectedItems(prev => {
      const exists = prev.find(i => i.id === id && i.source === source);
      if (exists) return prev.filter(i => !(i.id === id && i.source === source));
      return [...prev, { id, source }];
    });
  };

  const toggleAllSelection = (items: any[]) => {
    if (selectedItems.length === items.length && items.length > 0) {
      setSelectedItems([]);
    } else {
      setSelectedItems(items.map(i => ({ id: i.id || i.original_id, source: i.source })));
    }
  };

  const monitorItems = monitorData?.data || [];
  const summary = (activeTab === 'bku' && risterBkuData?.summary)
    ? { 
        totalCollected: risterBkuData.summary.totalPenerimaan, 
        totalRemitted: risterBkuData.summary.totalPengeluaran, 
        outstandingTax: risterBkuData.summary.totalPenerimaan - risterBkuData.summary.totalPengeluaran 
      }
    : (monitorData?.summary || { totalCollected: 0, totalRemitted: 0, outstandingTax: 0 });

  const combinedArsip = [
    ...(setoranData?.data || []).map((d: any) => ({ ...d, source: 'manual' })),
    ...(risterBkuData?.data || []).map((d: any) => ({ ...d, source: 'bank', nomor_bukti: d.bukti }))
  ];

  const arsipItems = combinedArsip.filter((h: any) =>
    (h.nomor_bukti?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (h.uraian?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  ).sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700 pb-20">

      {/* PAGE HEADER */}
      <PageHeader
        title="Buku Pembantu Potongan (Pajak)"
        description="Manajemen perekaman rincian potongan dan sinkronisasi fakta bank"
        icon={<FileText className="size-5" />}
        actions={
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="w-auto">
            <TabsList className="bg-fin-page rounded-lg p-1 h-11 border border-fin-border">
              <TabsTrigger value="manajemen" className="px-5 py-2 rounded-lg text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2">
                <Database size={14} /><span>Manajemen Rincian</span>
              </TabsTrigger>
              <TabsTrigger value="bku" className="px-5 py-2 rounded-lg text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2">
                <BookOpen size={14} /><span>Buku Pembantu</span>
              </TabsTrigger>
              <TabsTrigger value="monitoring" className="px-5 py-2 rounded-lg text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all flex items-center gap-2">
                <Activity size={14} /><span>Monitoring OPD</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <AnimatePresence mode="wait">
        {activeTab === 'manajemen' ? (
          <motion.div
            key="manajemen"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-8"
          >
            {/* Quick Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface">
                <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Total Potongan Dipungut</p>
                <h2 className="text-2xl font-black text-fin-text-primary mt-1">{formatCurrency(summary.totalCollected || 0)}</h2>
              </Card>
              <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface">
                <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Terdeteksi di SP2D</p>
                <h2 className="text-2xl font-black text-fin-income mt-1">{potonganCountData?.count || 0} Records</h2>
              </Card>
              <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface">
                <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Outstanding (Sisa Utang)</p>
                <h2 className="text-2xl font-black text-fin-expense mt-1">{formatCurrency(summary.outstandingTax || 0)}</h2>
              </Card>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* FORM SECTION */}
              <div className="lg:col-span-8">
                <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
                  <div className="px-6 py-4 border-b border-fin-border bg-fin-page flex justify-between items-center">
                    <h3 className="text-sm font-semibold text-fin-text-primary flex items-center gap-2">
                      <PlusSquare size={18} className="text-fin-info" /> Form Perekaman Potongan
                    </h3>
                    {editId && <Badge variant="outline" className="bg-fin-warning/10 text-fin-warning border-fin-warning/20 px-3 py-1 rounded-lg text-[10px] font-semibold">Mode Edit Aktif</Badge>}
                  </div>

                  <CardContent className="p-8 space-y-6">
                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest ml-1">Jenis Potongan</label>
                          <Combobox
                            value={formData.jenis_pajak}
                            onValueChange={(v) => setFormData({...formData, jenis_pajak: v || ''})}
                            placeholder="Pilih Jenis..."
                            className="h-11"
                            options={[
                              { value: 'PPN', label: 'PPN (Pajak Pertambahan Nilai)' },
                              { value: 'PPh 21', label: 'PPh 21 (Gaji/Honor)' },
                              { value: 'PPh 4(2)', label: 'PPh Pasal 4 Ayat 2 (Final)' },
                              { value: 'IWP 8%', label: 'Iuran Wajib Pegawai 8%' },
                              { value: 'IWP 1%', label: 'Iuran Wajib Pegawai 1%' },
                              { value: 'JKES 4%', label: 'Iuran Jaminan Kesehatan 4%' },
                              { value: 'JKK', label: 'Iuran Jaminan Kecelakaan Kerja' },
                              { value: 'JKM', label: 'Iuran Jaminan Kematian' },
                              { value: 'Taperum', label: 'Taperum' },
                              { value: 'BULOG', label: 'Beras (BULOG)' },
                              { value: 'Zakat', label: 'Zakat' },
                              { value: 'LAINNYA', label: 'Potongan Lain-lain' },
                            ]}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-fin-text-muted ml-1">Tanggal Pembayaran</label>
                          <Input type="date" className="h-11 bg-fin-page border-fin-border rounded-lg text-sm font-medium text-fin-text-primary focus:border-ds-focus-ring transition-all" value={formData.tanggal} onChange={(e) => setFormData({...formData, tanggal: e.target.value})} required />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest ml-1">No. Referensi / NTPN</label>
                        <Input type="text" placeholder="Contoh: 012345678901234 atau No. Resi Bank" className="h-11 bg-fin-page border-fin-border rounded-xl text-sm font-medium text-fin-text-primary focus:ring-4 focus:ring-ds-focus-ring transition-all placeholder:text-fin-text-muted/50" value={formData.nomor_ntpn} onChange={(e) => setFormData({...formData, nomor_ntpn: e.target.value})} required />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-fin-text-muted ml-1">Organisasi Perangkat Daerah (OPD)</label>
                        <Combobox
                          value={formData.opd}
                          onValueChange={(v) => setFormData({...formData, opd: v || ''})}
                          placeholder="Pilih OPD Penanggungjawab..."
                          className="h-11"
                          options={opdList.map((opd: string) => ({ value: opd, label: opd }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-fin-text-muted ml-1">Rekening Bank Sumber Setoran</label>
                        <Combobox
                          value={formData.id_sumber_dana}
                          onValueChange={(v) => setFormData({...formData, id_sumber_dana: v || ''})}
                          placeholder="Pilih rekening bank sumber dana..."
                          className="h-11"
                          options={sumberDanaList.map((sd: any) => ({ value: sd.id, label: sd.nama }))}
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-fin-text-muted ml-1">Nilai Potongan (Rp)</label>
                        <div className="relative">
                          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-fin-text-muted font-semibold text-lg">Rp</div>
                          <NumericInput
                            className="h-16 pl-14 pr-6 bg-fin-page border-fin-border rounded-lg text-2xl font-bold tracking-tight text-fin-text-primary focus:border-fin-info transition-all"
                            value={formData.nilai}
                            onValueChange={(val) => setFormData({...formData, nilai: val})}
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-fin-text-muted ml-1">Keterangan / Uraian</label>
                        <Textarea className="px-5 py-4 bg-fin-page border-fin-border rounded-lg text-sm font-medium text-fin-text-primary focus:border-fin-info transition-all min-h-[100px] resize-none leading-relaxed" placeholder="Contoh: Rincian potongan atas SP2D nomor..." value={formData.uraian} onChange={(e) => setFormData({...formData, uraian: e.target.value})} required />
                      </div>

                      <div className="pt-4 flex flex-col sm:flex-row gap-3 justify-end">
                        {editId && (
                          <Button
                            variant="ghost"
                            onClick={() => {
                              setEditId(null);
                              setEditSource(null);
                              setFormData({
                                tanggal: new Date().toISOString().split('T')[0],
                                nomor_ntpn: '',
                                uraian: '',
                                id_sumber_dana: '',
                                opd: '',
                                nilai: 0,
                                jenis_pajak: 'PPN'
                              });
                            }}
                            className="h-11 px-6 text-sm font-medium text-fin-expense hover:bg-fin-expense/10 rounded-lg transition-all"
                          >
                            Batalkan Edit
                          </Button>
                        )}
                        <Button
                          type="submit"
                          disabled={saving}
                          className="h-11 px-10 bg-fin-text-primary text-fin-surface rounded-lg font-semibold text-sm shadow-lg shadow-black/10 active:scale-95 transition-all flex items-center gap-2"
                        >
                          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                          <span>{editId ? 'Perbarui Data' : 'Simpan Transaksi'}</span>
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>

              {/* ACTION & SUMMARY SECTION */}
              <div className="lg:col-span-4 space-y-6">
                <Card className="p-8 bg-fin-text-primary text-fin-surface rounded-xl border-none shadow-xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-1000">
                    <History size={150} />
                  </div>
                  <div className="relative z-10 space-y-8">
                    <div className="w-12 h-12 bg-fin-info rounded-xl flex items-center justify-center shadow-lg shadow-fin-info/20">
                      <RefreshCw size={24} />
                    </div>
                    <div>
                       <h3 className="text-xs font-semibold text-indigo-300 uppercase tracking-widest mb-2">Impor Fakta Bank (Semi-Otomatis)</h3>
                       <p className="text-sm opacity-80 leading-relaxed">
                          Gunakan fitur ini untuk sinkronisasi massal rincian potongan langsung dari ekspor SIPD RI Penatausahaan. Sistem akan mendeteksi SP2D secara otomatis.
                       </p>
                    </div>
                     <div className="space-y-3">
                        <div className="flex gap-2">
                          <label className="flex-1 h-12 flex items-center justify-center rounded-xl bg-fin-info hover:opacity-90 text-fin-surface text-[10px] font-black gap-2 cursor-pointer transition-all shadow-lg shadow-fin-info/20 uppercase tracking-widest text-center px-2">
                              <FileUp size={16} />
                              {isImportingPotongan ? '...' : 'Impor Rincian'}
                              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImportPotonganManual} disabled={isImportingPotongan} />
                          </label>
                          <label className="flex-1 h-12 flex items-center justify-center rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black gap-2 cursor-pointer transition-all shadow-lg shadow-emerald-600/20 uppercase tracking-widest text-center px-2">
                              <FileSpreadsheet size={16} />
                              {isImportingExcel ? '...' : 'Impor SIPD'}
                              <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handleImportExcelPajak} disabled={isImportingExcel} />
                          </label>
                        </div>
                        <Button variant="outline" className="w-full h-12 rounded-xl border-white/30 bg-fin-surface/5 text-white hover:bg-fin-surface/10 text-xs font-bold gap-2 uppercase tracking-widest shadow-sm transition-all" onClick={handleDownloadTemplatePotongan}>
                           <Download size={16} /> Unduh Template
                        </Button>
                     </div>
                  </div>
                </Card>

                <Card className="rounded-xl shadow-sm border border-fin-border overflow-hidden bg-fin-surface">
                  <div className="px-6 py-4 border-b border-fin-border bg-fin-page flex items-center justify-between">
                    <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Status Data {importPotonganBulan}/{importPotonganTahun}</p>
                    <Badge className="bg-fin-income/10 text-fin-income border-none text-[9px] font-bold">
                       {potonganCountData?.count || 0} REKAMAN
                    </Badge>
                  </div>
                  <div className="p-6">
                     <div className="space-y-6">
                        {[
                          { label: 'Total Rekam Manual', value: setoranData?.data?.length || 0, icon: PlusSquare, color: 'text-blue-500' },
                          { label: 'Terdeteksi SP2D', value: potonganCountData?.count || 0, icon: ShieldCheck, color: 'text-fin-income' }
                        ].map((stat, i) => (
                           <div key={i} className="flex gap-4 items-center">
                              <div className={cn("w-10 h-10 rounded-xl bg-fin-subtle border border-fin-border flex items-center justify-center transition-colors", stat.color)}>
                                 <stat.icon size={18} />
                              </div>
                              <div className="space-y-0.5">
                                 <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">{stat.label}</p>
                                 <p className="text-lg font-black text-fin-text-primary">{stat.value}</p>
                              </div>
                           </div>
                        ))}
                     </div>
                  </div>
                </Card>
              </div>
            </div>

            {/* INTEGRATED ARCHIVE TABLE */}
            <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
              <div className="px-6 py-4 border-b border-fin-border bg-fin-page flex flex-col sm:flex-row justify-between items-center gap-4">
                 <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-fin-text-primary flex items-center gap-2">
                      <Database size={18} className="text-fin-info-text" /> Arsip Rincian Potongan Terpadu
                    </h3>
                    <div className="flex items-center gap-2">
                       <Combobox
                         value={importPotonganBulan.toString()}
                         onValueChange={(v) => setImportPotonganBulan(Number(v || '0'))}
                         placeholder="Bulan"
                         className="w-[140px] h-9"
                         size="sm"
                         options={[
                           { value: '0', label: 'Semua Bulan' },
                           ...Array.from({ length: 12 }, (_, i) => ({
                             value: (i + 1).toString(),
                             label: new Date(0, i).toLocaleString('id-ID', { month: 'long' }),
                           })),
                         ]}
                       />
                       <Combobox
                         value={importPotonganTahun.toString()}
                         onValueChange={(v) => setImportPotonganTahun(Number(v || '0'))}
                         placeholder="Tahun"
                         className="w-[100px] h-9"
                         size="sm"
                         options={[2024, 2025, 2026, 2027].map(y => ({ value: y.toString(), label: String(y) }))}
                       />
                       <Button variant="outline" size="sm" className="h-9 gap-2 text-xs font-bold" onClick={() => mutateOpdSummary()}>
                          <RefreshCw size={14} /> Segarkan
                       </Button>
                    </div>
                 </div>
                 <div className="flex items-center gap-3 w-full sm:w-auto">
                     <Button
                        onClick={() => setShowData(!showData)}
                        variant={showData ? "outline" : "default"}
                        size="sm"
                        className={cn(
                          "h-9 px-4 rounded-lg text-xs font-bold gap-2 transition-all",
                          !showData && "bg-fin-info hover:opacity-90 text-fin-surface shadow-lg shadow-fin-info/20"
                        )}
                     >
                        {showData ? <EyeOff size={14} /> : <Eye size={14} />}
                        {showData ? "Sembunyikan Data" : "Tampilkan Data Rincian"}
                     </Button>
                    {selectedItems.length > 0 && (
                      <Button
                        onClick={handleBulkDelete}
                        variant="destructive"
                        size="sm"
                        className="h-8 px-3 rounded-lg text-[10px] font-bold gap-2 animate-in fade-in slide-in-from-right-2"
                      >
                        <Trash2 size={12} />
                        Hapus ({selectedItems.length})
                      </Button>
                    )}
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fin-text-muted" size={14} />
                      <Input
                        className="pl-9 h-9 bg-fin-surface border-fin-border rounded-lg text-xs font-medium text-fin-text-primary placeholder:text-fin-text-muted"
                        placeholder="Cari bukti, NTPN, atau uraian..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                    </div>
                 </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-fin-page">
                    <TableRow className="border-b border-fin-border hover:bg-transparent">
                      <TableHead className="w-[50px] px-6 py-4">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded border-fin-border text-fin-info focus:ring-ds-focus-ring cursor-pointer bg-fin-surface"
                            checked={arsipItems.length > 0 && selectedItems.length === arsipItems.length}
                            onChange={() => toggleAllSelection(arsipItems)}
                          />
                        </div>
                      </TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Tgl</TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">No. Bukti / Referensi</TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Keterangan / Uraian</TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider text-right">Nilai Potongan</TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-fin-border">
                    {!showData ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-20 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <div className="p-4 bg-indigo-50 rounded-full text-fin-info-text">
                              <Database size={32} />
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-sm font-bold text-fin-text-primary">Data Rincian Tersembunyi</h3>
                              <p className="text-xs text-[#667085]">Tekan tombol "Tampilkan Data" untuk memuat rincian potongan.</p>
                            </div>
                            <Button 
                              onClick={() => setShowData(true)}
                              className="mt-2 bg-ds-primary hover:bg-ds-primary-hover"
                            >
                              Tampilkan Sekarang
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : arsipItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-20 text-center text-fin-text-muted text-xs font-medium">
                          Tidak ada data yang ditemukan.
                        </TableCell>
                      </TableRow>
                    ) : (
                      arsipItems.map((h: any) => (
                        <TableRow key={h.id} className={cn("hover:bg-fin-page transition-colors group", selectedItems.find(i => i.id === h.id && i.source === h.source) && "bg-indigo-50/50")}>
                          <TableCell className="px-6 py-4">
                             <div className="flex items-center justify-center">
                               <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-fin-border text-fin-info focus:ring-ds-focus-ring cursor-pointer bg-fin-surface"
                                  checked={!!selectedItems.find(i => i.id === h.id && i.source === h.source)}
                                  onChange={() => toggleSelection(h.id, h.source)}
                               />
                             </div>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-xs font-medium text-fin-text-muted">{format(new Date(h.tanggal), 'dd/MM/yy')}</TableCell>
                          <TableCell className="px-6 py-4">
                             <div className="flex flex-col gap-1">
                               <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold text-fin-text-primary uppercase">{h.nomor_bukti}</span>
                                  {h.source === 'bank' ? (
                                     <Badge className="bg-fin-info/20 text-fin-info border-none text-[8px] font-black px-1.5 py-0.5 uppercase tracking-wider"> BANK</Badge>
                                  ) : (
                                     <Badge className="bg-fin-subtle text-fin-text-muted border-none text-[8px] font-black px-1.5 py-0.5 uppercase tracking-wider"> MANUAL</Badge>
                                  )}
                               </div>
                               <p className="text-[10px] text-[#667085] font-medium italic">{h.id_billing || 'Tanpa NTPN/ID Billing'}</p>
                             </div>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                             <div className="flex flex-col gap-0.5">
                                <p className="text-xs font-semibold text-fin-text-primary max-w-[300px] truncate uppercase">{h.uraian}</p>
                                <div className="flex items-center gap-1">
                                  <Badge variant="outline" className="w-fit text-[8px] px-1 py-0 border-none bg-fin-subtle text-fin-text-muted">{h.jenis_pajak || 'POTONGAN'}</Badge>
                                  {h.opd && h.opd !== '-' && (
                                    <Badge className="w-fit text-[8px] px-1 py-0 border-none bg-fin-info/10 text-fin-info font-bold uppercase">{h.opd}</Badge>
                                  )}
                                </div>
                             </div>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-right font-black text-sm text-fin-text-primary" style={{fontVariantNumeric:'tabular-nums'}}>{formatCurrency(h.nilai)}</TableCell>
                          <TableCell className="px-6 py-4">
                            <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                               <Button variant="ghost" size="icon" onClick={() => handleEdit(h)} className="h-8 w-8 text-fin-text-muted hover:text-[#2E90FA] hover:bg-fin-surface rounded-lg transition-all"><Edit size={14} /></Button>
                               <Button variant="ghost" size="icon" onClick={() => handleDelete(h.id, h.source)} className="h-8 w-8 text-fin-text-muted hover:text-fin-expense hover:bg-fin-surface rounded-lg transition-all"><Trash2 size={14} /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="bku"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Quick Summary Cards (BKU) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface">
                <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Saldo Awal Potongan</p>
                <h2 className="text-xl font-black text-fin-text-primary mt-1">{formatCurrency(summary.totalCollected)}</h2>
              </Card>
              <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface border-b-2 border-b-emerald-500">
                <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Dipungut Periode Ini</p>
                <h2 className="text-xl font-black text-fin-income mt-1">{formatCurrency(summary.totalCollected)}</h2>
              </Card>
              <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface border-b-2 border-b-rose-500">
                <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Disetor Periode Ini</p>
                <h2 className="text-xl font-black text-fin-expense mt-1">{formatCurrency(summary.totalRemitted)}</h2>
              </Card>
              <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface border-b-2 border-b-blue-500">
                <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Saldo Akhir Potongan</p>
                <h2 className="text-xl font-black text-fin-text-primary mt-1">{formatCurrency(summary.outstandingTax)}</h2>
              </Card>
            </div>


            {/* UNIFIED BKU TABLE */}
            <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
              <div className="px-6 py-4 border-b border-fin-border bg-fin-page flex flex-col sm:flex-row justify-between items-center gap-4">
                 <div className="flex items-center gap-4">
                   <h3 className="text-sm font-semibold text-fin-text-primary flex items-center gap-2">
                     <BookOpen size={18} className="text-[#2E90FA]" /> Buku Pembantu Potongan Gabungan
                   </h3>
                   <div className="flex items-center gap-2">
                      <Combobox
                         value={importPotonganBulan.toString()}
                         onValueChange={(v) => setImportPotonganBulan(parseInt(v || '0'))}
                         placeholder="Bulan..."
                         className="h-8 w-32"
                         size="sm"
                         options={[
                           { value: '0', label: 'Semua Bulan' },
                           ...Array.from({ length: 12 }, (_, i) => ({
                             value: (i + 1).toString(),
                             label: new Date(0, i).toLocaleString('id-ID', { month: 'long' }),
                           })),
                         ]}
                      />
                      <Combobox
                         value={importPotonganTahun.toString()}
                         onValueChange={(v) => setImportPotonganTahun(parseInt(v || '0'))}
                         className="h-8 w-24"
                         size="sm"
                         options={[2024, 2025, 2026, 2027].map(y => ({ value: y.toString(), label: String(y) }))}
                      />
                   </div>
                 </div>
                 <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleExportExcel} className="h-9 rounded-lg text-xs font-medium gap-2 border-fin-border">
                      <Download size={14} /> Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={handlePrintPDF} className="h-9 rounded-lg text-xs font-medium gap-2 border-fin-border">
                      <Printer size={14} /> PDF
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => mutateRisterBku()} className="h-9 w-9 text-fin-text-muted hover:text-fin-info-text transition-colors">
                      <RefreshCw size={14} />
                    </Button>
                 </div>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-fin-page">
                    <TableRow className="border-b border-fin-border hover:bg-transparent">
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Tgl</TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">No. Bukti / SP2D</TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Keterangan / Uraian</TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider text-right">Nilai Potongan</TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider text-right">Saldo</TableHead>
                      <TableHead className="px-6 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider text-center">Audit Rekon</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-fin-border">
                    {!showData ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-20 text-center">
                          <div className="flex flex-col items-center justify-center gap-3">
                            <div className="p-4 bg-indigo-50 rounded-full text-fin-info-text">
                              <BookOpen size={32} />
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-sm font-bold text-fin-text-primary">Buku Pembantu Tersembunyi</h3>
                              <p className="text-xs text-[#667085]">Tekan tombol "Tampilkan Data" untuk memuat rincian BKU.</p>
                            </div>
                            <Button 
                              onClick={() => setShowData(true)}
                              className="mt-2 bg-ds-primary hover:bg-ds-primary-hover"
                            >
                              Muat BKU Sekarang
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (risterBkuData?.data || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-20 text-center text-fin-text-muted text-xs font-medium">
                          Tidak ada data rister untuk periode ini.
                        </TableCell>
                      </TableRow>
                    ) : (
                      (risterBkuData?.data || []).map((item: any, i: number) => (
                        <TableRow key={i} className="hover:bg-fin-page transition-colors group">
                          <TableCell className="px-6 py-4 text-xs font-medium text-fin-text-muted">{format(new Date(item.tanggal), 'dd/MM/yy')}</TableCell>
                          <TableCell className="px-6 py-4">
                            <div className="flex flex-col gap-1">
                               <Badge className={cn("w-fit px-2.5 py-1 rounded-lg font-semibold text-[9px] border-none uppercase tracking-wider", item.bukti ? "bg-[#ECFDF3] text-[#027A48]" : "bg-slate-100 text-fin-text-muted")}>
                                 {item.bukti || 'TIDAK TERDETEKSI'}
                               </Badge>
                               <span className="text-[9px] font-black text-fin-info-text uppercase leading-none">
                                  {item.opd}
                               </span>
                               <span className="text-[8px] font-bold text-fin-text-muted uppercase tracking-tighter">
                                  {item.tipe === 'INPUT_MANUAL' ? ' MANUAL' : ' BANK'}
                               </span>
                            </div>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                             <div className="flex flex-col gap-0.5">
                                <p className="text-xs font-semibold text-fin-text-primary uppercase max-w-[400px] truncate">{item.uraian || item.keterangan}</p>
                                {item.id_sumber_dana && (
                                   <Badge variant="outline" className="w-fit text-[8px] px-1.5 py-0 border-indigo-100 bg-indigo-50 text-fin-info-text font-bold">
                                      {item.id_sumber_dana}
                                   </Badge>
                                )}
                             </div>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-right font-black text-sm text-fin-text-primary" style={{fontVariantNumeric:'tabular-nums'}}>{formatCurrency(item.nilai)}</TableCell>
                          <TableCell className="px-6 py-4 text-right font-bold text-sm text-[#2E90FA]" style={{fontVariantNumeric:'tabular-nums'}}>{formatCurrency(item.saldo || 0)}</TableCell>
                          <TableCell className="px-6 py-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {item.status_rekon === 'SUDAH' ? (
                                <Badge variant="outline" className="bg-fin-income/10 text-fin-income border-fin-income/20 text-[9px] px-2 py-0.5 font-bold whitespace-nowrap">COCOK</Badge>
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
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="px-6 py-4 bg-fin-subtle border-fin-border flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-6">
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Total Penerimaan (Dipungut):</span>
                    <span className="text-sm font-black text-emerald-600">{formatCurrency(risterBkuData?.summary?.totalPenerimaan || 0)}</span>
                  </div>
                  <div className="flex flex-col border-l border-fin-border pl-6">
                    <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Total Pengeluaran (Disetor):</span>
                    <span className="text-sm font-black text-rose-600">{formatCurrency(risterBkuData?.summary?.totalPengeluaran || 0)}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest">Saldo Akhir Periode:</span>
                  <span className="text-lg font-black text-fin-info-text">{formatCurrency(risterBkuData?.summary?.totalPenerimaan - risterBkuData?.summary?.totalPengeluaran)}</span>
                </div>
              </div>
            </Card>
          </motion.div>
        )}

        {activeTab === 'monitoring' && (
          <motion.div
            key="monitoring"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface">
                   <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Total Dipungut (OPD)</p>
                   <h2 className="text-xl font-black text-fin-text-primary mt-1">{formatCurrency(summary.totalCollected)}</h2>
                </Card>
                <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface">
                   <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Total Disetor (OPD)</p>
                   <h2 className="text-xl font-black text-fin-income mt-1">{formatCurrency(summary.totalRemitted)}</h2>
                </Card>
                <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface">
                   <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">Sisa Kewajiban (OPD)</p>
                   <h2 className="text-xl font-black text-fin-expense mt-1">{formatCurrency(summary.outstandingTax)}</h2>
                </Card>
                <Card className="p-6 rounded-xl border-fin-border shadow-sm bg-fin-surface">
                   <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">OPD Belum Lunas</p>
                   <h2 className="text-xl font-black text-fin-text-primary mt-1">{opdSummaryData?.data?.filter((o: any) => parseFloat(o.utang) > 0).length || 0} OPD</h2>
                </Card>
             </div>


             <Card className="rounded-xl shadow-sm border border-fin-border overflow-hidden bg-fin-surface">
                <div className="px-8 py-6 border-b border-fin-border bg-fin-page flex items-center justify-between">
                   <h3 className="text-sm font-bold text-fin-text-primary flex items-center gap-2">
                      <LayoutTemplate size={18} className="text-[#2E90FA]" /> Ringkasan Kewajiban Potongan per OPD
                   </h3>
                   <div className="flex items-center gap-3">
                      <Combobox
                        value={importPotonganBulan.toString()}
                        onValueChange={(v) => setImportPotonganBulan(Number(v || '0'))}
                        placeholder="Bulan"
                        className="w-[140px] h-9"
                        size="sm"
                        options={[
                          { value: '0', label: 'Semua Bulan' },
                          ...Array.from({ length: 12 }, (_, i) => ({
                            value: (i + 1).toString(),
                            label: new Date(0, i).toLocaleString('id-ID', { month: 'long' }),
                          })),
                        ]}
                      />
                      <Combobox
                        value={importPotonganTahun.toString()}
                        onValueChange={(v) => setImportPotonganTahun(Number(v || '0'))}
                        placeholder="Tahun"
                        className="w-[120px] h-9"
                        size="sm"
                        options={[2024, 2025, 2026].map(y => ({ value: y.toString(), label: String(y) }))}
                      />
                      <Button variant="outline" size="sm" className="h-9 gap-2 text-xs font-bold" onClick={() => mutateOpdSummary()}>
                         <RefreshCw size={14} /> Segarkan
                      </Button>
                   </div>
                </div>
                <div className="overflow-x-auto">
                   <Table>
                      <TableHeader className="bg-fin-page">
                       <TableRow className="border-b border-fin-border hover:bg-transparent">
                          <TableHead className="px-8 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Nama Organisasi Perangkat Daerah (OPD)</TableHead>
                          <TableHead className="px-8 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider text-right">Dipungut (SP2D)</TableHead>
                          <TableHead className="px-8 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider text-right">Disetor (Bank/Manual)</TableHead>
                          <TableHead className="px-8 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider text-right">Sisa Utang</TableHead>
                          <TableHead className="px-8 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider text-center">Status</TableHead>
                       </TableRow>
                    </TableHeader>
                      <TableBody className="divide-y divide-fin-border">
                         {opdSummaryData?.data?.map((item: any, idx: number) => (
                            <TableRow key={idx} className="hover:bg-fin-page transition-colors">
                               <TableCell className="px-8 py-5 text-xs font-bold text-fin-text-primary uppercase">{item.opd}</TableCell>
                               <TableCell className="px-8 py-5 text-right font-medium text-xs">{formatCurrency(item.dipungut)}</TableCell>
                               <TableCell className="px-8 py-5 text-right font-medium text-xs text-emerald-600">{formatCurrency(item.disetor)}</TableCell>
                               <TableCell className="px-8 py-5 text-right font-black text-sm text-rose-600">{formatCurrency(item.utang)}</TableCell>
                               <TableCell className="px-8 py-5 text-center">
                                  {parseFloat(item.utang) <= 0 ? (
                                     <Badge className="bg-[#ECFDF3] text-[#027A48] border-none text-[9px] font-black uppercase">LUNAS</Badge>
                                  ) : (
                                     <Badge className="bg-[#FFF1F2] text-[#E11D48] border-none text-[9px] font-black uppercase">TERTUNGGAK</Badge>
                                  )}
                               </TableCell>
                            </TableRow>
                         ))}
                         {(!opdSummaryData?.data || opdSummaryData.data.length === 0) && (
                            <TableRow>
                               <TableCell colSpan={5} className="px-8 py-20 text-center">
                                  <div className="flex flex-col items-center gap-2 opacity-30">
                                     <Info size={48} />
                                     <p className="text-sm font-bold uppercase tracking-widest">Tidak ada data monitoring untuk tahun ini</p>
                                  </div>
                               </TableCell>
                            </TableRow>
                         )}
                      </TableBody>
                   </Table>
                </div>
             </Card>

             {/* MONTHLY ANALYTICS SUMMARY (GLOBAL) */}
             <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mt-8">
                <Card className="lg:col-span-1 p-6 rounded-xl border border-fin-border bg-fin-surface shadow-sm flex flex-col justify-between">
                   <div className="space-y-4">
                      <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-fin-info-text">
                         <BarChart3 size={20} />
                      </div>
                      <div>
                         <h4 className="text-xs font-bold text-fin-text-muted uppercase tracking-widest">Rata-rata Potongan</h4>
                         <p className="text-xl font-black text-fin-text-primary mt-1">
                            {formatCurrency((monthlyAnalyticsData?.global?.reduce((acc: any, curr: any) => acc + parseFloat(curr.disetor), 0) || 0) / 12)}
                            <span className="text-[10px] text-fin-text-muted font-medium ml-1">/ BULAN</span>
                         </p>
                      </div>
                   </div>
                   <div className="pt-4 border-t border-fin-border mt-4">
                      <p className="text-[10px] text-fin-text-muted font-medium italic">Data akumulasi seluruh OPD tahun {importPotonganTahun}</p>
                   </div>
                </Card>

                <Card className="lg:col-span-3 p-6 rounded-xl border border-fin-border bg-fin-surface shadow-sm overflow-hidden">
                   <h4 className="text-xs font-bold text-fin-text-muted uppercase tracking-widest mb-6 flex items-center gap-2">
                      <Activity size={14} className="text-emerald-500" /> Tren Potongan Global Bulanan
                   </h4>
                   <div className="flex items-end justify-between h-[120px] gap-2 px-2">
                      {(monthlyAnalyticsData?.global || Array.from({length:12}, (_,i)=>({bulan:i+1, disetor:0}))).map((m: any, i: number) => {
                         const maxVal = Math.max(...(monthlyAnalyticsData?.global?.map((x: any) => parseFloat(x.disetor)) || [1]));
                         const height = (parseFloat(m.disetor) / (maxVal || 1)) * 100;
                         return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative">
                               <div 
                                 className="w-full bg-indigo-500/10 group-hover:bg-indigo-500 rounded-t-sm transition-all duration-500 relative" 
                                 style={{ height: `${Math.max(height, 5)}%` }}
                               >
                                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none">
                                     {formatCurrency(m.disetor)}
                                  </div>
                               </div>
                               <span className="text-[9px] font-bold text-fin-text-muted">{['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][m.bulan-1]}</span>
                            </div>
                         );
                      })}
                   </div>
                </Card>
             </div>

             {/* PER-OPD MONTHLY BREAKDOWN TABLE */}
             <Card className="rounded-xl shadow-sm border border-fin-border overflow-hidden bg-fin-surface mt-8">
                <div className="px-8 py-4 border-b border-fin-border bg-fin-page flex items-center justify-between">
                   <h3 className="text-[10px] font-black text-fin-text-muted uppercase tracking-[0.2em] flex items-center gap-2">
                      <TableIcon size={14} className="text-fin-info-text" /> Rincian Potongan Disetor per OPD per Bulan
                   </h3>
                </div>
                <div className="overflow-x-auto">
                   <Table>
                      <TableHeader className="bg-fin-surface">
                         <TableRow className="border-b border-fin-border">
                            <TableHead className="px-6 py-4 text-[9px] font-bold text-fin-text-muted uppercase sticky left-0 bg-fin-surface z-10">Organisasi Perangkat Daerah</TableHead>
                            {['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map(m => (
                               <TableHead key={m} className="px-4 py-4 text-[9px] font-bold text-fin-text-muted uppercase text-right">{m}</TableHead>
                            ))}
                            <TableHead className="px-6 py-4 text-[9px] font-bold text-fin-text-muted uppercase text-right bg-fin-page">Total</TableHead>
                         </TableRow>
                      </TableHeader>
                      <TableBody>
                         {opdSummaryData?.data?.map((opd: any, idx: number) => {
                            const monthly = monthlyAnalyticsData?.opd_breakdown?.filter((x: any) => x.opd_name === opd.opd) || [];
                            return (
                               <TableRow key={idx} className="hover:bg-fin-page/50 transition-colors">
                                  <TableCell className="px-6 py-3 text-[10px] font-bold text-slate-700 uppercase sticky left-0 bg-fin-surface group-hover:bg-fin-page z-10 border-r border-slate-50">{opd.opd}</TableCell>
                                  {Array.from({length:12}, (_, i) => i + 1).map(m => {
                                     const val = parseFloat(monthly.find((x: any) => parseInt(x.bulan) === m)?.nilai || 0);
                                     return (
                                        <TableCell key={m} className={cn("px-4 py-3 text-[10px] text-right font-medium", val > 0 ? "text-fin-info-text" : "text-slate-300")}>
                                           {val > 0 ? formatCurrency(val) : '-'}
                                        </TableCell>
                                     );
                                  })}
                                  <TableCell className="px-6 py-3 text-[10px] text-right font-black text-fin-text-primary bg-fin-page/50">{formatCurrency(opd.disetor)}</TableCell>
                               </TableRow>
                            );
                         })}
                      </TableBody>
                   </Table>
                </div>
             </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog 
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        type={confirmConfig.type}
        isLoading={confirmConfig.isLoading}
      />
    </div>
  );
}
