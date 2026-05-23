"use client";

import React, { useState, Fragment, useEffect } from "react";
import useSWR from "swr";
import { format } from "date-fns";
import { 
  Plus, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft,
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  ShieldAlert, 
  ShieldCheck,
  Save,
  Loader2,
  FileText,
  Clock,
  ArrowRightLeft,
  Calendar,
  MoreVertical,
  CheckCircle,
  AlertTriangle,
  FileDown,
  Printer,
  CheckSquare,
  Square,
  X,
  Banknote,
  FileSpreadsheet,
  Copy,
  AlertCircle
} from "lucide-react";
import api from "@/lib/api";
import { formatCurrency, cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { motion, AnimatePresence } from "framer-motion";
import { PageHeader } from '@/components/patterns/page-header';

const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

export default function TalanganPage() {
  const [isCashMonitorOpen, setIsCashMonitorOpen] = useState(false);
  const [cashStats, setCashStats] = useState<any[]>([]);
  const [loadingCashStats, setLoadingCashStats] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(50);
  const [searchTerm, setSearchTerm] = useState("");

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

  React.useEffect(() => {
    if (isCashMonitorOpen) {
      fetchCashStats();
    }
  }, [isCashMonitorOpen]);

  // Real Pagination SWR
  const { data: bailoutResponse, error, isLoading: loadingBailout, mutate: mutateBailout } = useSWR(
    ["/reports/bailout-monitoring", { page: currentPage, limit, search: searchTerm }],
    ([url, params]) => fetcher(url, params)
  );
  
  const bailoutData = bailoutResponse?.data || [];
  const summary = bailoutResponse?.summary || { total_diberikan: 0, total_dikembalikan: 0, outstanding: 0 };
  const pagination = bailoutResponse?.pagination || { totalPages: 1, totalData: 0 };

  const { data: sumberDanaDataResponse } = useSWR("/dss/sumber-dana", (url) => api.get(url).then(res => res.data));
  const sumberDanaData = sumberDanaDataResponse || [];

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expandedRows, setExpandedRows] = useState<string[]>([]);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Modal States
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    no_referensi: '',
    nilai: '',
    id_sumber_dana_asal: '',
    id_sumber_dana_talangan: '',
    keterangan: ''
  });
  const [creatingManual, setCreatingManual] = useState(false);
  
  const [assignModal, setAssignModal] = useState<any>(null);
  const [selectedSumberTalangan, setSelectedSumberTalangan] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Split States
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [settlingBulk, setSettlingBulk] = useState(false);
  const [isConfirmSettleOpen, setIsConfirmSettleOpen] = useState(false);
  
  const [splitModal, setSplitModal] = useState<any>(null);
  const [allocations, setAllocations] = useState<{ id_sumber_talangan: string, nilai: number }[]>([]);
  const [splitting, setSplitting] = useState(false);
  
  const { data: anomaliData, mutate: mutateAnomalies } = useSWR(
    '/dss/talangan/anomalies',
    (url: string) => api.get(url).then(r => r.data),
    { revalidateOnFocus: false }
  );
  const [fixingAnomalies, setFixingAnomalies] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(false);
  const [balanceCandidates, setBalanceCandidates] = useState<{ settled_talangan: number; sp2d_aman: number } | null>(null);

  const handleCheckBalance = async () => {
    setCheckingBalance(true);
    try {
      const res = await api.post('/dss/talangan/auto-settle-by-balance', { dry_run: true });
      setBalanceCandidates(res.data);
    } catch (err: any) {
      toast.error('Gagal memeriksa saldo sumber dana', { description: err.response?.data?.message });
    } finally {
      setCheckingBalance(false);
    }
  };

  const handleAutoSettleByBalance = async () => {
    setCheckingBalance(true);
    try {
      const res = await api.post('/dss/talangan/auto-settle-by-balance', { dry_run: false });
      if (res.data.sp2d_aman > 0) {
        toast.success(`${res.data.sp2d_aman} SP2D berhasil diubah ke status Aman`, {
          description: `${res.data.settled_talangan} jurnal talangan diselesaikan karena sumber dana sudah tersedia`
        });
      } else {
        toast.info('Tidak ada SP2D yang memenuhi syarat saat ini');
      }
      setBalanceCandidates(null);
      mutateAnomalies();
      mutateBailout();
    } catch (err: any) {
      toast.error('Gagal memproses auto-settle', { description: err.response?.data?.message });
    } finally {
      setCheckingBalance(false);
    }
  };

  const handleFixAnomalies = async () => {
    setFixingAnomalies(true);
    try {
      const res = await api.post('/dss/talangan/fix-anomalies', { dry_run: false });
      toast.success(`Diperbaiki: ${res.data.fixed_orphaned} orphaned di-settle, ${res.data.fixed_nilai} nilai dikoreksi ke neto.`);
      mutateAnomalies();
      mutateBailout();
    } catch (err: any) {
      toast.error('Gagal memperbaiki anomali', { description: err.response?.data?.message });
    } finally {
      setFixingAnomalies(false);
    }
  };

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

  const toggleRow = (id: string) => {
    setExpandedRows(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const toggleSelectItem = (id: string) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const toggleSelectGroup = (group: any) => {
    const ids = group.originalItems.map((o: any) => o.id);
    const allSelected = ids.every((id: string) => selectedItems.includes(id));
    if (allSelected) {
      setSelectedItems(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedItems(prev => [...new Set([...prev, ...ids])]);
    }
  };

  // Grouping logic for Parent-Child display
  const getGroupedBailout = () => {
    if (!bailoutData) return [];
    
    const groups: any = {};
    bailoutData.forEach((item: any) => {
      const key = item.no_referensi || `MAN-${item.id}`;
      if (!groups[key]) {
        groups[key] = {
          id: key,
          no_referensi: item.no_referensi,
          tanggal: item.tanggal,
          uraian: item.uraian,
          opd: item.opd || 'INPUT MANUAL',
          total_nilai: 0,
          status: item.status,
          originalItems: []
        };
      }
      groups[key].total_nilai += parseFloat(item.nilai);
      groups[key].originalItems.push(item);
      if (item.status === 'BELUM') groups[key].status = 'BELUM';
    });

    let result = Object.values(groups);

    // Client-side Filter by Search (Additional to server-side for real-time)
    if (searchTerm && bailoutData.length < 100) {
      result = result.filter((g: any) => 
        g.no_referensi?.toLowerCase().includes(searchTerm.toLowerCase()) || 
        g.uraian?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        g.opd?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by Status
    if (statusFilter !== 'ALL') {
      result = result.filter((g: any) => {
        if (statusFilter === 'LUNAS') return g.status === 'SELESAI';
        if (statusFilter === 'OUTSTANDING') return g.status === 'BELUM';
        if (statusFilter === 'RISKY') {
          const days = Math.floor((new Date().getTime() - new Date(g.tanggal).getTime()) / (1000 * 3600 * 24));
          return g.status === 'BELUM' && days > 14;
        }
        return true;
      });
    }

    return result.sort((a: any, b: any) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  };

  const handleCreateManual = async () => {
    if (!manualForm.no_referensi || !manualForm.nilai || !manualForm.id_sumber_dana_asal) {
      toast.error('Harap lengkapi data minimal: Referensi, Nominal, dan Sumber Asal');
      return;
    }

    setCreatingManual(true);
    try {
      await api.post('/dss/talangan', manualForm);
      toast.success('Pencatatan talangan manual berhasil disimpan');
      setIsManualModalOpen(false);
      setManualForm({ no_referensi: '', nilai: '', id_sumber_dana_asal: '', id_sumber_dana_talangan: '', keterangan: '' });
      mutateBailout();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan data manual');
    } finally {
      setCreatingManual(false);
    }
  };

  const handleSettle = async (item: any) => {
    setConfirmState({
      isOpen: true,
      title: 'Konfirmasi Pelunasan',
      message: `Apakah Anda yakin ingin melunasi talangan untuk ${item.no_referensi || 'Manual'} sebesar ${formatCurrency(item.nilai)}?`,
      type: 'question',
      onConfirm: async () => {
        setConfirmState(prev => ({ ...prev, isLoading: true }));
        try {
          await api.post(`/dss/talangan/${item.id}/settle`);
          toast.success('Talangan berhasil ditandai sebagai Lunas');
          mutateBailout();
          setConfirmState(prev => ({ ...prev, isOpen: false, isLoading: false }));
        } catch (err: any) {
          toast.error(err.response?.data?.message || 'Gagal melakukan penyelesaian');
          setConfirmState(prev => ({ ...prev, isLoading: false }));
        }
      }
    });
  };

  const handleAssignTalangan = async () => {
    if (!selectedSumberTalangan) return;
    setAssigning(true);
    try {
      await api.post(`/dss/talangan-sumber/${assignModal.id}`, { id_sumber_talangan: selectedSumberTalangan });
      toast.success('Penjamin talangan berhasil diperbarui');
      setAssignModal(null);
      mutateBailout();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal memperbarui penjamin');
    } finally {
      setAssigning(false);
    }
  };

  const openSplitModal = (item: any) => {
    setSplitModal(item);
    setAllocations([{ id_sumber_talangan: item.id_sumber_talangan || '', nilai: parseFloat(item.nilai) }]);
  };

  const addAllocation = () => {
    setAllocations([...allocations, { id_sumber_talangan: '', nilai: 0 }]);
  };

  const removeAllocation = (index: number) => {
    setAllocations(allocations.filter((_, i) => i !== index));
  };

  const updateAllocation = (index: number, field: string, value: any) => {
    const next = [...allocations];
    next[index] = { ...next[index], [field]: value };

    // Auto-adjust first allocation if others change (optional logic)
    if (index !== 0 && field === 'nilai' && allocations.length > 1) {
      const otherTotal = next.reduce((sum, a, i) => i !== 0 ? sum + parseFloat(a.nilai.toString() || '0') : sum, 0);
      next[0].nilai = Math.max(0, parseFloat(splitModal.nilai) - otherTotal);
    }
    
    setAllocations(next);
  };

  const handleBulkSettle = async () => {
    if (selectedItems.length === 0) return;
    setSettlingBulk(true);
    try {
      await api.post('/dss/talangan/bulk-settle', { ids: selectedItems });
      toast.success(`${selectedItems.length} talangan berhasil dilunasi secara massal`);
      setSelectedItems([]);
      mutateBailout();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal melunasi talangan secara massal');
    } finally {
      setSettlingBulk(false);
      setIsConfirmSettleOpen(false);
    }
  };

  const handleExport = (type: 'pdf' | 'excel') => {
    if (!bailoutData) return;
    
    const headers = ['No', 'Tanggal', 'No. Referensi', 'OPD', 'Uraian', 'Sumber Asli', 'Penjamin', 'Nilai', 'Status'];
    const exportData = bailoutData.map((item: any, i: number) => [
      i + 1,
      format(new Date(item.tanggal), 'dd/MM/yyyy'),
      item.no_referensi || '-',
      item.opd || '-',
      item.uraian || '-',
      item.sumber_asli || item.id_sumber_asli,
      item.sumber_talangan || item.id_sumber_talangan || 'Belum Ditandai',
      item.nilai,
      item.status === 'SELESAI' ? 'LUNAS' : 'OUTSTANDING'
    ]);

    if (type === 'excel') {
      const excelData = exportData.map((row: any) => ({
        'No': row[0],
        'Tanggal': row[1],
        'No. Referensi': row[2],
        'OPD': row[3],
        'Uraian': row[4],
        'Sumber Asli': row[5],
        'Penjamin': row[6],
        'Nilai': row[7],
        'Status': row[8]
      }));
      exportToExcel(excelData, `Laporan_Talangan_${format(new Date(), 'yyyyMMdd')}`, 'Jurnal Talangan');
    } else {
      const pdfData = exportData.map((row: any) => [
        row[0], row[1], row[2], row[3], row[4], row[5], row[6], formatCurrency(row[7] as number), row[8]
      ]);
      exportToPDF(headers, pdfData, `Laporan_Talangan_${format(new Date(), 'yyyyMMdd')}`, 'MONITORING JURNAL TALANGAN BELANJA DAERAH');
    }
  };

  const handleSplitTalangan = async () => {
    const totalAlloc = allocations.reduce((sum, a) => sum + parseFloat(a.nilai.toString() || '0'), 0);
    if (Math.abs(totalAlloc - parseFloat(splitModal.nilai)) > 1) {
      toast.error('Total alokasi harus sama dengan nilai rincian asli');
      return;
    }
    if (allocations.some(a => !a.id_sumber_talangan || a.nilai <= 0)) {
      toast.error('Pastikan semua sumber dana dan nominal telah terisi');
      return;
    }

    setSplitting(true);
    try {
      await api.post(`/dss/talangan/${splitModal.id}/split`, { allocations });
      toast.success('Alokasi berhasil diperbarui secara manual');
      setSplitModal(null);
      mutateBailout();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal memproses pembagian alokasi');
    } finally {
      setSplitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      {/* PAGE HEADER */}
      <PageHeader
        title="Monitoring Dana Talangan"
        description="Sistem pemantauan silang antar sumber dana"
        icon={<Banknote className="size-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setIsCashMonitorOpen(true)} className="h-10 px-4 text-fin-text-muted font-semibold hover:bg-fin-surface rounded-lg transition-all flex items-center gap-2">
              <Banknote size={16} className="text-fin-info-text" /><span>Monitor Kas</span>
            </Button>
            <Button onClick={() => setIsManualModalOpen(true)} className="h-10 px-6 bg-fin-text-primary text-white rounded-lg text-xs font-semibold hover:opacity-90 transition-all shadow-sm flex items-center gap-2">
              <Plus size={16} /><span>Input Manual</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={() => mutateBailout()} className="h-10 w-10 text-fin-text-muted hover:text-fin-text-primary transition-colors">
              <RefreshCw size={18} className={loadingBailout ? "animate-spin" : ""} />
            </Button>
          </div>
        }
      />

      {/* Banner: Anomali Nilai Talangan */}
      {anomaliData && (anomaliData.total_orphaned > 0 || anomaliData.total_nilai_salah > 0) && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm">
          <AlertCircle size={18} className="shrink-0 text-amber-600 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <p className="font-bold">Anomali Jurnal Talangan Terdeteksi</p>
            {anomaliData.total_orphaned > 0 && (
              <p className="text-xs text-amber-800">
                • <strong>{anomaliData.total_orphaned}</strong> jurnal BELUM tapi SP2D sudah berstatus Aman (orphaned)
              </p>
            )}
            {anomaliData.total_nilai_salah > 0 && (
              <p className="text-xs text-amber-800">
                • <strong>{anomaliData.total_nilai_salah}</strong> jurnal menggunakan <strong>nilai bruto</strong>, seharusnya nilai neto (terdapat selisih potongan)
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            loading={fixingAnomalies}
            onClick={handleFixAnomalies}
            leftIcon={<CheckCircle2 size={12} />}
            className="shrink-0 border-amber-300 bg-amber-600 text-white hover:bg-amber-700 hover:text-white"
          >
            Perbaiki Otomatis
          </Button>
        </div>
      )}

      {/* Banner: Cek Sumber Dana Tersedia */}
      {balanceCandidates ? (
        <div className="flex items-start gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-sm">
          <ShieldCheck size={18} className="shrink-0 text-emerald-600 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <p className="font-bold">Sumber Dana Tersedia — Siap Diselesaikan</p>
            <p className="text-xs text-emerald-800">
              • <strong>{balanceCandidates.settled_talangan}</strong> jurnal talangan dapat diselesaikan
              &nbsp;→&nbsp;
              <strong>{balanceCandidates.sp2d_aman}</strong> SP2D akan berubah menjadi <strong>Aman</strong>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBalanceCandidates(null)}
            >
              Batal
            </Button>
            <Button
              variant="income"
              size="sm"
              loading={checkingBalance}
              leftIcon={<ShieldCheck size={12} />}
              onClick={handleAutoSettleByBalance}
            >
              Tandai Aman
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            loading={checkingBalance}
            leftIcon={<ShieldCheck size={12} />}
            onClick={handleCheckBalance}
            className="border-emerald-200 text-emerald-700 hover:border-emerald-400 hover:bg-fin-surface"
          >
            Cek Sumber Dana Tersedia
          </Button>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
         <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="group">
           <div className="lux-stat lux-stat-navy p-4 rounded-xl flex flex-col hover:opacity-95 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold text-blue-200/70 uppercase tracking-widest">Total Bailout (Bruto)</span>
                <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                  <Banknote className="w-3.5 h-3.5 text-blue-200" />
                </div>
              </div>
              <h2 className="text-xl font-black tracking-tight text-white tabular-nums truncate">
                {formatCurrency(summary.total_diberikan)}
              </h2>
           </div>
         </motion.div>

         <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="group">
           <div className="lux-stat lux-stat-emerald p-4 rounded-xl flex flex-col hover:opacity-95 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold text-emerald-200/70 uppercase tracking-widest">Terselesaikan (Lunas)</span>
                <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-200" />
                </div>
              </div>
              <h2 className="text-xl font-black tracking-tight text-white tabular-nums truncate">
                {formatCurrency(summary.total_dikembalikan)}
              </h2>
           </div>
         </motion.div>

         <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="group">
           <div className="lux-stat lux-stat-amber p-4 rounded-xl flex flex-col hover:opacity-95 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold text-amber-200/70 uppercase tracking-widest">Outstanding (Piutang)</span>
                <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                  <Clock className="w-3.5 h-3.5 text-amber-200" />
                </div>
              </div>
              <h2 className="text-xl font-black tracking-tight text-white tabular-nums truncate">
                {formatCurrency(summary.outstanding)}
              </h2>
           </div>
         </motion.div>

         <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="group">
           <div className="lux-stat lux-stat-rose p-4 rounded-xl flex flex-col hover:opacity-95 transition-all duration-300">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold text-red-200/70 uppercase tracking-widest">Risiko Tinggi (&gt;14 Hr)</span>
                <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
                  <ShieldAlert className="w-3.5 h-3.5 text-red-200" />
                </div>
              </div>
              <h2 className="text-xl font-black tracking-tight text-white">
                {getGroupedBailout().filter((g: any) => {
                  const days = Math.floor((new Date().getTime() - new Date(g.tanggal).getTime()) / (1000 * 3600 * 24));
                  return g.status === 'BELUM' && days > 14;
                }).length} Dokumen
              </h2>
           </div>
         </motion.div>
      </div>

      {/* Filter Panel */}
      <Card className="rounded-xl shadow-sm border border-fin-border bg-fin-surface overflow-hidden">
        <div className="p-6 bg-fin-surface space-y-6">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex-1 max-w-xl relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-fin-text-muted" size={16} />
                <input 
                  type="text" 
                  placeholder="Cari referensi, uraian, atau OPD..." 
                  className="w-full h-11 pl-12 pr-4 bg-fin-page border border-fin-border rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ds-focus-ring/10 transition-all shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 p-1 bg-fin-page rounded-xl border border-fin-border">
                <button 
                  onClick={() => setStatusFilter("ALL")}
                  className={cn("px-5 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-wider", statusFilter === "ALL" ? "bg-fin-surface text-fin-text-primary shadow-sm" : "text-fin-text-muted hover:text-fin-text-primary")}
                >SEMUA</button>
                <button 
                  onClick={() => setStatusFilter("OUTSTANDING")}
                  className={cn("px-5 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-wider", statusFilter === "OUTSTANDING" ? "bg-fin-surface text-fin-text-primary shadow-sm" : "text-fin-text-muted hover:text-fin-text-primary")}
                >OUTSTANDING</button>
                <button 
                  onClick={() => setStatusFilter("LUNAS")}
                  className={cn("px-5 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-wider", statusFilter === "LUNAS" ? "bg-fin-surface text-fin-text-primary shadow-sm" : "text-fin-text-muted hover:text-fin-text-primary")}
                >LUNAS</button>
                <button 
                  onClick={() => setStatusFilter("RISKY")}
                  className={cn("px-5 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-wider", statusFilter === "RISKY" ? "bg-fin-surface text-[#D92D20] shadow-sm" : "text-fin-text-muted hover:text-[#D92D20]")}
                >RISIKO TINGGI</button>
              </div>
           </div>

           <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-3">
                 <Button variant="ghost" onClick={() => handleExport('excel')} className="h-8 px-3 text-[10px] font-bold text-fin-text-muted hover:text-[#027A48] hover:bg-fin-success-bg rounded-lg flex items-center gap-2 transition-all">
                    <FileSpreadsheet size={14} /> Export Excel
                 </Button>
                 <Button variant="ghost" onClick={() => handleExport('pdf')} className="h-8 px-3 text-[10px] font-bold text-fin-text-muted hover:text-[#F04438] hover:bg-[#FEF3F2] rounded-lg flex items-center gap-2 transition-all">
                    <Printer size={14} /> Export PDF
                 </Button>
              </div>
              <div className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">
                 Ditemukan {pagination.totalData} Data Talangan
              </div>
           </div>
        </div>
      </Card>

      {/* RESULTS TABLE (Industrial Standard) */}
      <Card className="rounded-xl border border-fin-border overflow-hidden bg-fin-surface shadow-sm">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-fin-page">
              <TableRow className="border-b border-fin-border hover:bg-transparent">
                <TableHead className="w-[60px] text-center"></TableHead>
                <TableHead className="w-[60px] text-center"></TableHead>
                <TableHead className="w-[120px] px-4 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Tanggal</TableHead>
                <TableHead className="w-[220px] px-4 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">No. SP2D / Ref</TableHead>
                <TableHead className="px-4 py-4 text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Keterangan / Uraian</TableHead>
                <TableHead className="w-[200px] px-4 py-4 text-right text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Nilai Total (Rp)</TableHead>
                <TableHead className="w-[140px] px-4 py-4 text-center text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Status</TableHead>
                <TableHead className="w-[100px] px-4 py-4 text-center text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {getGroupedBailout().map((group: any) => {
                const isExpanded = expandedRows.includes(group.id);
                const days = Math.floor((new Date().getTime() - new Date(group.tanggal).getTime()) / (1000 * 3600 * 24));
                const isRisky = group.status === 'BELUM' && days > 14;

                return (
                  <Fragment key={group.id}>
                    <TableRow key={group.id} className={cn(
                      "hover:bg-fin-page transition-colors cursor-pointer group",
                      isExpanded && "bg-fin-page",
                      isRisky && "bg-red-50/50 hover:bg-red-100/50"
                    )} onClick={() => toggleRow(group.id)}>
                      <TableCell className="w-[50px] text-center" onClick={(e) => e.stopPropagation()}>
                        {group.status === 'BELUM' ? (
                          <div 
                            onClick={() => toggleSelectGroup(group)}
                            className="flex items-center justify-center cursor-pointer"
                          >
                             {group.originalItems.every((o: any) => selectedItems.includes(o.id)) 
                               ? <CheckSquare size={16} className="text-fin-info-text" /> 
                               : <Square size={16} className="text-gray-300 hover:text-fin-info-text" />
                             }
                          </div>
                        ) : <div className="w-4 h-4" />}
                      </TableCell>
                      <TableCell className="w-[50px] text-center">
                        {isExpanded ? <ChevronDown size={16} className="text-fin-text-muted" /> : <ChevronRight size={16} className="text-fin-text-muted" />}
                      </TableCell>
                      <TableCell className="px-4 py-4 text-xs font-medium text-fin-text-muted">
                        {format(new Date(group.tanggal), 'dd/MM/yyyy')}
                      </TableCell>
                      <TableCell className="px-4 py-4 min-w-[220px]">
                        <div 
                          className="flex flex-col group/copy cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(group.no_referensi || 'MANUAL');
                            toast.success(`Copied: ${group.no_referensi || 'MANUAL'}`);
                          }}
                        >
                           <div className="flex items-center gap-1.5">
                              <p className="text-xs font-black text-fin-text-primary group-hover/copy:text-fin-info-text transition-colors">
                                 {group.no_referensi || 'MANUAL'}
                              </p>
                              <div className="opacity-0 group-hover/copy:opacity-100 transition-all">
                                 <Copy size={12} className="text-fin-info-text" />
                              </div>
                           </div>
                           <p className="text-xs text-fin-text-muted font-medium">{group.opd}</p>
                        </div>
                      </TableCell>
                      <TableCell className="px-4 py-4 max-w-md">
                        <p className="text-xs text-fin-text-muted font-medium truncate">{group.uraian}</p>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-right">
                        <p className="text-xs font-black text-fin-text-primary whitespace-nowrap">{formatCurrency(group.total_nilai)}</p>
                      </TableCell>
                      <TableCell className="px-4 py-4 text-center">
                        <Badge className={cn(
                          "text-xs font-bold px-3 py-1 rounded-full border-none shadow-sm",
                          group.status === 'BELUM' 
                            ? (isRisky ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700") 
                            : "bg-emerald-50 text-emerald-700"
                        )}>
                          {group.status === 'BELUM' ? (isRisky ? 'RISIKO TINGGI' : 'OUTSTANDING') : 'LUNAS'}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-fin-text-muted hover:text-fin-info-text hover:bg-fin-page rounded-lg"
                            onClick={(e) => { e.stopPropagation(); /* Detail logic */ }}
                          >
                            <MoreVertical size={16} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    
                    {isExpanded && (
                      <TableRow className="bg-fin-page hover:bg-fin-page">
                        <TableCell colSpan={8} className="p-0 border-b border-fin-border">
                          <motion.div 
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            className="p-6 bg-fin-page"
                          >
                            <div className="bg-fin-surface rounded-xl border border-fin-border overflow-hidden">
                              <div className="px-4 py-3 bg-fin-page border-b border-fin-border flex justify-between items-center">
                                <p className="text-xs font-black text-fin-text-muted uppercase tracking-widest">Rincian Alokasi Kebijakan Talangan</p>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-xs bg-fin-surface text-fin-text-muted">{group.originalItems.length} Rincian</Badge>
                                </div>
                              </div>
                              <div className="p-4 space-y-3">
                                  {group.originalItems.map((item: any, idx: number) => (
                                    <div key={item.id} className="flex items-center justify-between py-2 border-b border-fin-border last:border-0 group/child">
                                      <div className="flex items-center gap-4">
                                        {group.status === 'BELUM' && (
                                          <div 
                                            onClick={(e) => { e.stopPropagation(); toggleSelectItem(item.id); }}
                                            className="cursor-pointer"
                                          >
                                            {selectedItems.includes(item.id) 
                                              ? <CheckSquare size={14} className="text-fin-info-text" /> 
                                              : <Square size={14} className="text-gray-300" />
                                            }
                                          </div>
                                        )}
                                        <div className="w-8 h-8 rounded-lg bg-fin-surface border border-fin-border flex items-center justify-center text-fin-text-muted group-hover/child:text-fin-info-text transition-colors">
                                          <span className="text-xs font-bold">{idx + 1}</span>
                                        </div>
                                        <div>
                                          <p className="text-xs font-bold text-fin-text-primary">{item.sumber_asli || item.id_sumber_asli}</p>
                                          <p className="text-xs text-fin-text-muted font-medium">Nominal: {formatCurrency(item.nilai)}</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-8">
                                        <div className="text-right">
                                          <p className="text-xs font-bold text-fin-text-muted uppercase tracking-tighter">Ditalangi Oleh</p>
                                          <p className="text-xs font-black text-fin-text-primary flex items-center gap-1.5 justify-end">
                                            <ArrowRightLeft size={12} className="text-fin-info-text" />
                                            {item.sumber_talangan || item.id_sumber_talangan || <span className="text-red-400 italic">Belum Ditandai</span>}
                                          </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-8 px-3 text-xs font-bold border-fin-border text-fin-text-muted rounded-lg hover:bg-fin-info-bg hover:text-fin-info-text hover:border-indigo-200 transition-all flex items-center gap-1.5"
                                            onClick={() => setAssignModal(item)}
                                          >
                                            <ShieldCheck size={14} /> Kelola
                                          </Button>
                                          <Button 
                                            variant="outline" 
                                            size="sm" 
                                            className="h-8 px-3 text-xs font-bold border-fin-border text-fin-text-muted rounded-lg hover:bg-fin-info-bg hover:text-fin-info-text hover:border-indigo-200 transition-all flex items-center gap-1.5"
                                            onClick={() => openSplitModal(item)}
                                          >
                                            <ArrowRightLeft size={14} /> Split
                                          </Button>
                                          {item.status === 'BELUM' && (
                                            <Button 
                                              size="sm" 
                                              className="h-8 px-3 text-xs font-bold bg-fin-success-bg text-fin-income-text border-none rounded-lg hover:bg-fin-income-bg transition-all flex items-center gap-1.5"
                                              onClick={() => handleSettle(item)}
                                            >
                                              <CheckCircle size={14} /> Lunaskan
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          </motion.div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination UI */}
        <div className="px-6 py-4 bg-fin-page border-t border-fin-border flex items-center justify-between">
           <div className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest">
              Halaman {currentPage} dari {pagination.totalPages}
           </div>
           <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => prev - 1)}
                className="h-8 px-3 text-xs font-bold border-fin-border text-fin-text-muted bg-fin-surface rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                 <ChevronLeft size={14} className="mr-1" /> Prev
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                disabled={currentPage === pagination.totalPages}
                onClick={() => setCurrentPage(prev => prev + 1)}
                className="h-8 px-3 text-xs font-bold border-fin-border text-fin-text-muted bg-fin-surface rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                 Next <ChevronRight size={14} className="ml-1" />
              </Button>
           </div>
        </div>
      </Card>

      {/* ASSIGN MODAL (KELOLA) */}
      <Dialog open={!!assignModal} onOpenChange={() => setAssignModal(null)}>
        <DialogContent className="w-[95vw] max-w-md rounded-xl p-0 border-none shadow-2xl overflow-hidden bg-fin-surface">
           <div className="p-6 bg-ds-primary text-white">
              <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-fin-info-bg0/20 rounded-xl flex items-center justify-center border border-white/10">
                    <ShieldCheck size={20} className="text-indigo-400" />
                 </div>
                 <div>
                    <DialogTitle className="text-lg font-bold tracking-tight">Kelola Penjamin Kas</DialogTitle>
                    <p className="text-gray-400 text-xs font-medium">Tentukan sumber dana penjamin talangan</p>
                 </div>
              </div>
           </div>

           <div className="p-6 space-y-6">
              <div className="bg-fin-page border border-fin-border rounded-xl p-5 space-y-4">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <p className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">No. Referensi</p>
                       <p className="text-sm font-black text-fin-text-primary truncate">{assignModal?.no_referensi}</p>
                    </div>
                    <div className="space-y-1 text-right">
                       <p className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Nominal</p>
                       <p className="text-sm font-black text-fin-info-text">{formatCurrency(assignModal?.nilai || 0)}</p>
                    </div>
                 </div>
                 <div className="pt-3 border-t border-fin-border space-y-1">
                    <p className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Sumber Asal (Kekurangan)</p>
                    <p className="text-sm font-bold text-fin-text-muted">{assignModal?.sumber_asli || assignModal?.id_sumber_asli}</p>
                 </div>
              </div>

              <div className="space-y-3">
                 <label className="text-xs font-black text-fin-text-primary uppercase tracking-widest ml-1">Pilih Sumber Dana Penjamin</label>
                 <div className="relative group">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-fin-text-muted group-focus-within:text-fin-info-text">
                       <ArrowRightLeft size={16} />
                    </div>
                    <select 
                      className="w-full h-11 pl-12 pr-4 bg-fin-surface border border-fin-border rounded-xl text-sm font-bold text-fin-text-primary focus:ring-2 focus:ring-ds-focus-ring/10 focus:border-ds-focus-ring outline-none transition-all cursor-pointer appearance-none"
                      value={selectedSumberTalangan}
                      onChange={(e) => setSelectedSumberTalangan(e.target.value)}
                    >
                       <option value="">-- Pilih Sumber Dana --</option>
                       {sumberDanaData?.map((s: any) => (
                          <option key={s.id} value={s.id}>{s.nama}</option>
                       ))}
                    </select>
                 </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex gap-3">
                 <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                 <p className="text-xs font-medium text-amber-800 leading-relaxed">
                    Penetapan penjamin akan mengurangi saldo Kas Efektif pada sumber dana terpilih secara otomatis.
                 </p>
              </div>
           </div>

           <div className="p-6 bg-fin-page border-t border-fin-border flex gap-3">
              <Button 
                variant="outline" 
                onClick={() => setAssignModal(null)}
                className="flex-1 h-11 text-xs font-bold text-fin-text-muted bg-fin-surface border-fin-border hover:bg-gray-50 rounded-xl"
              >
                Batal
              </Button>
              <Button 
                onClick={handleAssignTalangan}
                disabled={assigning || !selectedSumberTalangan}
                className="flex-[2] h-11 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-xl font-bold text-xs shadow-md gap-2"
              >
                 {assigning ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                 <span>Terapkan Penjamin</span>
              </Button>
           </div>
        </DialogContent>
      </Dialog>

      {/* SPLIT MODAL */}
      <Dialog open={!!splitModal} onOpenChange={() => setSplitModal(null)}>
        <DialogContent className="w-[95vw] max-w-2xl rounded-xl p-0 border-none shadow-2xl bg-fin-surface overflow-hidden flex flex-col max-h-[85vh]">
           {/* HEADER */}
           <div className="p-4 bg-ds-primary text-white shrink-0 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-fin-info-bg0/10 rounded-full -mr-16 -mt-16 blur-3xl" />
              <div className="relative z-10 flex justify-between items-center px-2">
                 <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-fin-surface/10 rounded-xl flex items-center justify-center border border-white/10">
                       <ArrowRightLeft size={18} className="text-indigo-400" />
                    </div>
                    <div>
                       <DialogTitle className="text-base font-bold tracking-tight">Split Alokasi Talangan</DialogTitle>
                       <p className="text-gray-400 text-xs font-medium">Bagi beban ke beberapa sumber dana</p>
                    </div>
                 </div>
                 <div className="text-right">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Total Kebutuhan</p>
                    <p className="text-lg font-black text-white">{formatCurrency(splitModal?.nilai || 0)}</p>
                 </div>
              </div>
           </div>

           {/* BODY */}
           <div className="p-4 flex-1 overflow-y-auto custom-scrollbar bg-fin-surface">
              <div className="space-y-4">
                 <div className="flex items-center justify-between sticky top-0 bg-fin-surface/95 backdrop-blur-md py-2 z-10 border-b border-gray-50 mb-1">
                    <h4 className="text-xs font-black text-fin-text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-ds-primary" />
                       Rincian Pembagian
                    </h4>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={addAllocation}
                      className="h-7 px-3 border-fin-info-text/20 text-fin-info-text font-black text-xs hover:bg-fin-info-bg rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                    >
                      <Plus size={12} /> Tambah Baris
                    </Button>
                  </div>

                  <div className="space-y-3">
                     {allocations.map((alloc, idx) => (
                        <div 
                          key={idx} 
                          className={cn(
                            "flex items-center gap-4 p-4 bg-fin-surface border rounded-xl transition-all group shadow-sm",
                            idx === 0 ? "border-indigo-200 bg-fin-info-bg/5" : "border-fin-border hover:border-indigo-300"
                          )}
                        >
                           <div className="flex-1 space-y-2">
                              <div className="flex items-center justify-between ml-1">
                                 <label className="text-xs font-black text-fin-text-muted uppercase tracking-wider">Sumber Penjamin</label>
                                 {idx === 0 && <Badge className="h-4 px-2 bg-ds-primary text-white text-[10px] font-black border-none uppercase rounded-lg">Primary</Badge>}
                              </div>
                              <div className="relative">
                                 <select 
                                   className="w-full h-10 pl-3 pr-8 bg-fin-page border border-fin-border rounded-xl text-sm font-bold text-fin-text-primary focus:border-ds-focus-ring outline-none transition-all cursor-pointer appearance-none"
                                   value={alloc.id_sumber_talangan}
                                   onChange={(e) => updateAllocation(idx, 'id_sumber_talangan', e.target.value)}
                                 >
                                    <option value="">Pilih Sumber Dana...</option>
                                    {sumberDanaData?.map((s: any) => (
                                       <option key={s.id} value={s.id}>{s.nama}</option>
                                    ))}
                                 </select>
                                 <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-fin-text-muted">
                                    <ChevronDown size={16} />
                                 </div>
                              </div>
                           </div>

                           <div className="w-[170px] space-y-2">
                              <label className="text-xs font-black text-fin-text-muted uppercase tracking-wider ml-1">Nominal (Rp)</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-black text-fin-text-muted">Rp</span>
                                <input 
                                  type="text" 
                                  readOnly={idx === 0 && allocations.length > 1}
                                  className={cn(
                                    "w-full h-10 pl-9 pr-3 border rounded-xl text-sm font-black text-fin-text-primary focus:border-ds-focus-ring outline-none transition-all",
                                    idx === 0 && allocations.length > 1 ? "bg-[#F3F4F6] border-[#E5E7EB] text-[#9BA3AF] cursor-not-allowed" : "bg-fin-surface border-fin-border"
                                  )}
                                  value={new Intl.NumberFormat('id-ID').format(alloc.nilai || 0)}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '');
                                    updateAllocation(idx, 'nilai', val === '' ? '0' : val);
                                  }}
                                />
                              </div>
                           </div>

                           <div className="pt-6">
                             <Button 
                               variant="ghost" 
                               size="icon" 
                               onClick={() => removeAllocation(idx)}
                               disabled={allocations.length === 1}
                               className="h-9 w-9 text-[#D0D5DD] hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
                             >
                               <Trash2 size={16} />
                             </Button>
                           </div>
                        </div>
                     ))}
                  </div>
              </div>
           </div>

           {/* FOOTER */}
           <div className="p-4 bg-fin-page border-t border-fin-border space-y-3 shrink-0">
              <div className={cn(
                 "p-3 rounded-xl flex items-center justify-between border shadow-sm transition-all",
                 Math.abs(allocations.reduce((sum, a) => sum + parseFloat(a.nilai.toString() || '0'), 0) - parseFloat(splitModal?.nilai || 0)) < 1 
                   ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                   : "bg-red-50 border-red-200 text-red-800"
              )}>
                 <div className="flex items-center gap-3">
                    <div className={cn(
                       "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                       Math.abs(allocations.reduce((sum, a) => sum + parseFloat(a.nilai.toString() || '0'), 0) - parseFloat(splitModal?.nilai || 0)) < 1 
                        ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                    )}>
                       {Math.abs(allocations.reduce((sum, a) => sum + parseFloat(a.nilai.toString() || '0'), 0) - parseFloat(splitModal?.nilai || 0)) < 1 
                          ? <CheckCircle2 size={20} /> 
                          : <ShieldAlert size={20} />}
                    </div>
                    <div>
                       <p className="text-xs font-black uppercase tracking-widest opacity-60">Status</p>
                       <p className="text-sm font-black">{formatCurrency(allocations.reduce((sum, a) => sum + parseFloat(a.nilai.toString() || '0'), 0))}</p>
                    </div>
                 </div>
                 <div className="text-right">
                    <p className="text-xs font-black uppercase tracking-widest opacity-60">Sisa</p>
                    <p className="text-sm font-black">
                       {formatCurrency(parseFloat(splitModal?.nilai || 0) - allocations.reduce((sum, a) => sum + parseFloat(a.nilai.toString() || '0'), 0))}
                    </p>
                 </div>
              </div>

              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={() => setSplitModal(null)}
                  className="flex-1 h-11 text-fin-text-muted font-black text-xs bg-fin-surface border-fin-border-strong hover:bg-gray-50 rounded-xl"
                >
                  Batal
                </Button>
                <Button 
                  onClick={handleSplitTalangan}
                  disabled={splitting || Math.abs(allocations.reduce((sum, a) => sum + parseFloat(a.nilai.toString() || '0'), 0) - parseFloat(splitModal?.nilai || 0)) > 1}
                  className="flex-[2] h-11 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-xl font-black text-xs shadow-lg shadow-ds-primary/10 gap-2 transition-all"
                >
                   {splitting ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                   <span>Simpan Pembagian Alokasi</span>
                </Button>
              </div>
           </div>
         </DialogContent>
      </Dialog>

      {/* CASH MONITOR SIDEBAR */}
      <AnimatePresence>
        {isCashMonitorOpen && (
          <div className="fixed inset-0 z-[100] flex justify-end">
             <motion.div 
               initial={{ opacity: 0 }}
               animate={{ opacity: 1 }}
               exit={{ opacity: 0 }}
               onClick={() => setIsCashMonitorOpen(false)}
               className="absolute inset-0 bg-[#000000]/40 backdrop-blur-[2px]"
             />
             <motion.div 
               initial={{ x: '100%' }}
               animate={{ x: 0 }}
               exit={{ x: '100%' }}
               transition={{ type: 'spring', damping: 25, stiffness: 200 }}
               className="relative w-full max-w-lg h-full bg-fin-surface shadow-2xl flex flex-col"
             >
                <div className="p-6 border-b border-fin-border flex items-center justify-between bg-ds-primary text-white shrink-0">
                   <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-fin-surface/10 rounded-xl flex items-center justify-center text-white border border-white/10">
                         <Banknote size={20} />
                      </div>
                      <div>
                         <h3 className="text-base font-bold text-white">Monitor Posisi Kas</h3>
                         <p className="text-xs text-gray-400 font-medium">Monitoring Real-time Saldo Sumber Dana</p>
                      </div>
                   </div>
                   <Button variant="ghost" size="icon" onClick={() => setIsCashMonitorOpen(false)} className="h-10 w-10 text-white/60 hover:text-white hover:bg-fin-surface/10 rounded-xl">
                      <X size={20} />
                   </Button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-fin-surface">
                   {loadingCashStats ? (
                      <div className="h-full flex flex-col items-center justify-center text-fin-text-muted gap-4">
                         <Loader2 size={32} className="animate-spin text-fin-info-text" />
                         <p className="text-xs font-bold uppercase tracking-widest">Sinkronisasi Saldo...</p>
                      </div>
                   ) : (
                      <div className="space-y-8">
                         <div className="space-y-4">
                            <div className="flex items-center gap-3 px-1">
                               <div className="h-5 w-1 bg-ds-primary rounded-full"></div>
                               <h4 className="text-xs font-black text-fin-text-primary uppercase tracking-[0.2em]">Kas Reguler (Non-Earmark)</h4>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                               {cashStats.filter(s => s.kategori?.toUpperCase() === 'BEBAS').length === 0 ? (
                                  <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-xl">
                                     <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Data tidak tersedia</p>
                                  </div>
                               ) : cashStats.filter(s => s.kategori?.toUpperCase() === 'BEBAS').map((item) => (
                                  <Card key={item.id} className="p-5 border-fin-border hover:border-ds-focus-ring/30 transition-all shadow-sm group">
                                     <div className="flex justify-between items-start mb-4">
                                        <div>
                                           <Badge className="bg-fin-info-bg text-indigo-700 border-none text-xs font-black px-2 mb-1">
                                              {item.id}
                                           </Badge>
                                           <h4 className="text-sm font-bold text-fin-text-primary leading-tight">{item.nama}</h4>
                                        </div>
                                        <div className="text-right">
                                           <p className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Kas Efektif</p>
                                           <p className={cn(
                                              "text-lg font-black tabular-nums",
                                              item.kas_efektif > 0 ? "text-fin-success-text" : "text-[#F04438]"
                                           )}>
                                              {formatCurrency(item.kas_efektif)}
                                           </p>
                                        </div>
                                     </div>
                                     <div className="grid grid-cols-2 gap-4 pt-4 border-t border-fin-border">
                                        <div className="space-y-1">
                                           <p className="text-xs font-bold text-fin-text-muted uppercase tracking-widest">Total Masuk</p>
                                           <p className="text-sm font-bold text-fin-text-primary">{formatCurrency(item.total_masuk)}</p>
                                        </div>
                                        <div className="space-y-1">
                                           <p className="text-xs font-bold text-fin-text-muted uppercase tracking-widest">Total Keluar</p>
                                           <p className="text-sm font-bold text-[#D92D20]">{formatCurrency(item.total_keluar)}</p>
                                        </div>
                                     </div>
                                  </Card>
                               ))}
                            </div>
                         </div>
                      </div>
                   )}
                </div>

                <div className="p-6 bg-fin-page border-t border-fin-border shrink-0">
                   <Button 
                      onClick={fetchCashStats} 
                      disabled={loadingCashStats}
                      className="w-full h-12 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-gray-200 transition-all"
                   >
                      <RefreshCw size={18} className={loadingCashStats ? "animate-spin" : ""} />
                      SINKRONISASI SALDO KAS
                   </Button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmDialog 
        isOpen={isConfirmSettleOpen}
        onClose={() => setIsConfirmSettleOpen(false)}
        onConfirm={handleBulkSettle}
        title="Konfirmasi Pelunasan Massal"
        message={`Apakah Anda yakin ingin menandai ${selectedItems.length} talangan terpilih sebagai LUNAS? Tindakan ini tidak dapat dibatalkan.`}
        confirmText="Ya, Lunaskan"
        type="success"
        isLoading={settlingBulk}
      />

      <ConfirmDialog 
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        message={confirmState.message}
        type={confirmState.type}
        isLoading={confirmState.isLoading}
      />

      {/* MANUAL INPUT MODAL */}
      <Dialog open={isManualModalOpen} onOpenChange={setIsManualModalOpen}>
        <DialogContent className="w-[95vw] max-w-lg rounded-xl p-0 border-none shadow-2xl overflow-hidden bg-fin-surface">
           <div className="p-6 bg-ds-primary text-white relative">
              <div className="relative z-10">
                 <DialogTitle className="text-xl font-bold tracking-tight">Input Jurnal Talangan Manual</DialogTitle>
                 <p className="text-indigo-100 text-xs font-medium">Rekam data transaksi talangan belanja secara mandiri</p>
              </div>
           </div>
           <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                   <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider ml-1">No. Referensi / SP2D</label>
                   <input 
                      type="text" 
                      className="w-full h-10 px-3 bg-fin-page border border-fin-border rounded-xl text-sm font-bold text-fin-text-primary focus:outline-none focus:border-ds-focus-ring"
                      placeholder="Contoh: 001/SP2D/2024"
                      value={manualForm.no_referensi}
                      onChange={(e) => setManualForm({...manualForm, no_referensi: e.target.value})}
                   />
                </div>
                <div className="space-y-1.5">
                   <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider ml-1">Nominal (Rp)</label>
                   <input 
                      type="number" 
                      className="w-full h-10 px-3 bg-fin-page border border-fin-border rounded-xl text-sm font-bold text-fin-text-primary focus:outline-none focus:border-ds-focus-ring"
                      placeholder="0"
                      value={manualForm.nilai}
                      onChange={(e) => setManualForm({...manualForm, nilai: e.target.value})}
                   />
                </div>
              </div>

              <div className="space-y-1.5">
                 <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider ml-1">Sumber Dana Asli (Yang Ditalangi)</label>
                 <select 
                   className="w-full h-10 px-3 bg-fin-page border border-fin-border rounded-xl text-sm font-bold text-fin-text-primary focus:outline-none focus:border-ds-focus-ring"
                   value={manualForm.id_sumber_dana_asal}
                   onChange={(e) => setManualForm({...manualForm, id_sumber_dana_asal: e.target.value})}
                 >
                    <option value="">-- Pilih Sumber Asal --</option>
                    {sumberDanaData?.map((s: any) => (
                       <option key={s.id} value={s.id}>{s.nama}</option>
                    ))}
                 </select>
              </div>

              <div className="space-y-1.5">
                 <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider ml-1">Sumber Dana Talangan (Pengganti)</label>
                 <select 
                   className="w-full h-10 px-3 bg-fin-page border border-fin-border rounded-xl text-sm font-bold text-fin-text-primary focus:outline-none focus:border-ds-focus-ring"
                   value={manualForm.id_sumber_dana_talangan}
                   onChange={(e) => setManualForm({...manualForm, id_sumber_dana_talangan: e.target.value})}
                 >
                    <option value="">-- Pilih Sumber Talangan --</option>
                    {sumberDanaData?.map((s: any) => (
                       <option key={s.id} value={s.id}>{s.nama}</option>
                    ))}
                 </select>
              </div>

              <div className="space-y-1.5">
                 <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider ml-1">Keterangan / Uraian</label>
                 <textarea 
                    className="w-full h-20 p-3 bg-fin-page border border-fin-border rounded-xl text-xs font-medium text-fin-text-primary focus:outline-none focus:border-ds-focus-ring"
                    placeholder="Masukkan alasan atau rincian tambahan..."
                    value={manualForm.keterangan}
                    onChange={(e) => setManualForm({...manualForm, keterangan: e.target.value})}
                 />
              </div>
           </div>

           <div className="p-6 bg-fin-page border-t border-fin-border flex gap-3">
              <Button 
                variant="ghost" 
                onClick={() => setIsManualModalOpen(false)}
                className="flex-1 h-10 text-xs font-bold text-fin-text-muted"
              >
                Batal
              </Button>
              <Button 
                onClick={handleCreateManual}
                disabled={creatingManual}
                className="flex-[2] h-10 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-xl font-bold text-xs shadow-lg gap-2"
              >
                 {creatingManual ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                 <span>Simpan Rekaman Manual</span>
              </Button>
           </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
