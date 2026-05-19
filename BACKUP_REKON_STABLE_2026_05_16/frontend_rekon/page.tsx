'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { 
  Search, 
  Filter, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Database, 
  Activity, 
  Sparkles, 
  Loader2,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  FileSpreadsheet,
  Eye,
  X,
  Calendar,
  Building2,
  AlertCircle,
  HelpCircle,
  Link as LinkIcon,
  Trash2,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  Info,
  ShieldCheck,
  Zap,
  Tag,
  Hash,
  MousePointer2,
  Lock,
  FileText
} from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import * as XLSX from 'xlsx';

const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);
const toN = (v: any) => Number(v) || 0;

export default function ReconciliationPage() {
  // 1. DATA FETCHING & PAGINATION STATES
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [filters, setFilters] = useState({
    opd: '',
    search: '',
    startDate: '2026-04-01',
    endDate: format(new Date(), 'yyyy-MM-dd'),
    status: 'BELUM' // Default: Tampilkan yang belum rekon
  });

  const { data, isLoading, mutate } = useSWR(
    ['/reports/reconciliation/data', { ...filters, page: currentPage, limit }],
    ([url, params]) => fetcher(url, params)
  );

  // 2. UI CONTROL STATES
  const [showFilters, setShowFilters] = useState(true);
  const [activeTab, setActiveTab] = useState('bku');
  const [opdList, setOpdList] = useState<string[]>([]);
  const [isMatching, setIsMatching] = useState(false);
  const [selectedBkuIds, setSelectedBkuIds] = useState<number[]>([]);
  const [selectedBankIds, setSelectedBankIds] = useState<number[]>([]);

  const [smartGroupValue, setSmartGroupValue] = useState<number | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number, total: number, isOpen: boolean }>({ current: 0, total: 0, isOpen: false });
  const [manualPairingMap, setManualPairingMap] = useState<Record<number, number>>({}); // Maps Bank Sequence (#1, #2...) to BKU ID
  const [bankTypeFilter, setBankTypeFilter] = useState<'ALL' | 'PENERIMAAN' | 'PENGELUARAN'>('ALL');

  // Computed totals for value-based filtering/matching
  const totalSelectedBku = data?.bku?.filter((b: any) => selectedBkuIds.includes(b.id))
    .reduce((sum: number, b: any) => sum + (Number(b.nilai_neto) || Number(b.nilai_bruto) || Number(b.nilai)), 0) || 0;
  
  const totalSelectedBank = data?.bank?.filter((b: any) => selectedBankIds.includes(b.id))
    .reduce((sum: number, b: any) => sum + (Number(b.debet) || Number(b.kredit)), 0) || 0;

  // 4. SUGGESTIONS STATE
  const { data: suggestionsData, isLoading: isLoadingSuggestions } = useSWR(
    selectedBankIds.length > 0 
      ? [
          `/reports/reconciliation/suggestions/${selectedBankIds[0]}`, 
          // Requirement: If in smart group mode, don't send all IDs to prevent backend summing.
          // Just fetch candidates for the specific value.
          { bankIds: smartGroupValue !== null ? selectedBankIds[0].toString() : selectedBankIds.join(',') }
        ] 
      : null,
    ([url, params]) => fetcher(url, params)
  );

  // Mode-aware BKU counting for Bulk Action Bar
  const bkuCountForDisplay = smartGroupValue !== null 
    ? Object.keys(manualPairingMap).length 
    : selectedBkuIds.length;

  const totalBkuForDisplay = useMemo(() => {
    if (smartGroupValue === null) return totalSelectedBku;
    
    // Sum of values from manual pairing map
    return Object.values(manualPairingMap).reduce((sum, bkuId) => {
      const bku = suggestionsData?.data?.find((s: any) => s.id === bkuId) || data?.bku?.find((b: any) => b.id === bkuId);
      const val = Number(bku?.nilai_neto) || Number(bku?.nilai_bruto) || Number(bku?.nilai) || 0;
      return sum + val;
    }, 0);
  }, [smartGroupValue, manualPairingMap, totalSelectedBku, suggestionsData, data?.bku]);

  const isBalancedForDisplay = Math.abs(totalBkuForDisplay - totalSelectedBank) < 1;



  // Intelligent Filtering: Hide items that don't match the selected value
  const filteredBku = useMemo(() => {
    let baseBku = data?.bku || [];
    
    // Requirement: If AI has suggestions, ensure those items are available in the candidate list
    // even if they are filtered out by other criteria.
    if (suggestionsData?.data?.length > 0) {
      const suggestionIds = suggestionsData.data.map((s: any) => s.id);
      // This is a bit tricky since suggestions might not have the full BKU object structure, 
      // but usually they have enough for the card display.
      const suggestionsAsBku = suggestionsData.data.filter((s: any) => !baseBku.some((b: any) => b.id === s.id));
      baseBku = [...baseBku, ...suggestionsAsBku];
    }

    if (selectedBankIds.length === 0) return baseBku;
    
    const target = smartGroupValue !== null ? smartGroupValue : totalSelectedBank;
    
    return baseBku.filter((b: any) => {
       if (selectedBkuIds.includes(b.id)) return true;
       const val = Number(b.nilai_neto) || Number(b.nilai_bruto) || Number(b.nilai);
       // Show items that match the target value OR are suggested by AI
       const isSuggested = suggestionsData?.data?.some((s: any) => s.id === b.id);
       return Math.abs(val - target) < 10000 || selectedBkuIds.length > 0 || isSuggested;
    });
  }, [data?.bku, selectedBankIds, totalSelectedBank, selectedBkuIds, smartGroupValue, suggestionsData]);

  const filteredBank = useMemo(() => {
    let baseBank = data?.bank || [];

    // 1. Apply Type Filter
    if (bankTypeFilter === 'PENERIMAAN') {
      baseBank = baseBank.filter((b: any) => Number(b.kredit) > 0);
    } else if (bankTypeFilter === 'PENGELUARAN') {
      baseBank = baseBank.filter((b: any) => Number(b.debet) > 0);
    }

    if (selectedBkuIds.length === 0) return baseBank;
    
    const target = totalSelectedBku;
    return baseBank.filter((b: any) => {
       if (selectedBankIds.includes(b.id)) return true;
       const val = Number(b.debet) || Number(b.kredit);
       // If in smart group mode, we keep showing other items of same value
       if (smartGroupValue !== null && Math.abs(val - smartGroupValue) < 1) return true;
       return Math.abs(val - target) < 10000 || selectedBankIds.length > 0;
    });
  }, [data?.bank, selectedBkuIds, totalSelectedBku, selectedBankIds, smartGroupValue, bankTypeFilter]);

  // Computed: Bank items that match the smart group filter
  const smartGroupBankItems = useMemo(() => {
    if (smartGroupValue === null) return filteredBank;
    return filteredBank?.filter((b: any) => (Number(b.debet) || Number(b.kredit)) === smartGroupValue);
  }, [filteredBank, smartGroupValue]);

  const handleBatchSmartGroupRekon = async () => {
    if (selectedBankIds.length === 0) return;
    
    // If no BKU selected, we look for suggestions
    let bkuToUse = [...selectedBkuIds];
    if (bkuToUse.length === 0 && suggestionsData?.data?.length > 0) {
      // Use the first N suggestions that match the bank items
      bkuToUse = suggestionsData.data.slice(0, selectedBankIds.length).map((s: any) => s.id);
    }

    if (bkuToUse.length === 0) {
      toast.error('Tidak ada saran pencocokan BKU untuk diproses.');
      return;
    }

    // Priority 1: Use manual pairings defined by the user (Labeling)
    const successPairs: {bankId: number, bkuId: number}[] = [];
    
    // Build the final execution list
    selectedBankIds.forEach((bankId, index) => {
       const bankSeq = index + 1;
       if (manualPairingMap[bankSeq]) {
          successPairs.push({ bankId, bkuId: manualPairingMap[bankSeq] });
       } else if (suggestionsData?.data?.length > index) {
          // Fallback to default sequential suggestion if not manually paired
          successPairs.push({ bankId, bkuId: suggestionsData.data[index].id });
       }
    });

    if (successPairs.length === 0) {
      toast.error('Gunakan fitur Labeling (#1, #2...) untuk menentukan pasangan yang tepat.');
      return;
    }

    setBatchProgress({ current: 0, total: successPairs.length, isOpen: true });
    let successCount = 0;

    for (let i = 0; i < successPairs.length; i++) {
      const { bankId, bkuId } = successPairs[i];
      
      const bankItem = data?.bank?.find((b: any) => b.id === bankId);
      const bankVal = bankItem ? (Number(bankItem.debet) || Number(bankItem.kredit)) : 0;
      const bkuItem = suggestionsData?.data?.find((s: any) => s.id === bkuId) || data?.bku?.find((b: any) => b.id === bkuId);
      const bkuVal = bkuItem ? (Number(bkuItem.nilai_neto) || Number(bkuItem.nilai_bruto) || Number(bkuItem.nilai)) : 0;

      // Authentic check: Only proceed if value matches or within strict margin
      if (Math.abs(bankVal - bkuVal) > 100) continue;

      try {
        await api.post('/reports/reconciliation/match-individual', {
          bankId,
          bkuId,
          matchType: 'SMART_GROUP_MANUAL_LABEL',
          keterangan_admin: manualRef || 'Rekon Massal (Manual Labeling)'
        });
        successCount++;
        setBatchProgress(prev => ({ ...prev, current: i + 1 }));
      } catch (err) {}
    }

    toast.success(`${successCount} transaksi berhasil direkonsiliasi.`);
    await mutate();
    setBatchProgress(prev => ({ ...prev, isOpen: false }));
    setSelectedBankIds([]);
    setSelectedBkuIds([]);
    setSmartGroupValue(null);
    setManualPairingMap({});
    setManualRef('');
  };

  // State for range selection
  const [lastSelectedBku, setLastSelectedBku] = useState<number | null>(null);
  const [lastSelectedBank, setLastSelectedBank] = useState<number | null>(null);

  const handleBkuClick = (e: React.MouseEvent, id: number, items: any[]) => {
    if (e.shiftKey && lastSelectedBku !== null) {
      const startIdx = items.findIndex(item => item.id === lastSelectedBku);
      const endIdx = items.findIndex(item => item.id === id);
      const range = items.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1).map(item => item.id);
      setSelectedBkuIds(prev => [...new Set([...prev, ...range])]);
    } else {
      if (selectedBkuIds.includes(id)) {
        setSelectedBkuIds(selectedBkuIds.filter(bid => bid !== id));
      } else {
        setSelectedBkuIds([...selectedBkuIds, id]);
      }
    }
    setLastSelectedBku(id);
  };

  const handleBankClick = (e: React.MouseEvent, id: number, items: any[]) => {
    const bank = items.find(item => item.id === id);
    const bankVal = bank ? (Number(bank.debet) || Number(bank.kredit)) : 0;

    // Requirement 1: Trigger Smart Group on click if not already in group mode
    if (smartGroupValue === null) {
      setSmartGroupValue(bankVal);
    }

    if (e.shiftKey && lastSelectedBank !== null) {
      const startIdx = items.findIndex(item => item.id === lastSelectedBank);
      const endIdx = items.findIndex(item => item.id === id);
      const range = items.slice(Math.min(startIdx, endIdx), Math.max(startIdx, endIdx) + 1).map(item => item.id);
      setSelectedBankIds(prev => [...new Set([...prev, ...range])]);
    } else {
      if (selectedBankIds.includes(id)) {
        setSelectedBankIds(selectedBankIds.filter(bid => bid !== id));
      } else {
        setSelectedBankIds([...selectedBankIds, id]);
      }
    }
    setLastSelectedBank(id);
  };
  

  
  // 3. RECON MODAL STATES
  const [rekonModal, setRekonModal] = useState<{
    id: number;
    type: 'SP2D' | 'PENDAPATAN' | 'POTONGAN';
    nilaiBku: number;
    nilaiBank: number;
    selisih: number;
    keterangan: string;
    tanggalPencairan: string;
    manualTag?: string;
  } | null>(null);
  
  const [magicMatchProgress, setMagicMatchProgress] = useState<{
    isOpen: boolean;
    total: number;
    current: number;
    success: number;
    fails: number;
  } | null>(null);

  const [refMatchModal, setRefMatchModal] = useState<{
    isOpen: boolean;
    value: string;
  }>({ isOpen: false, value: '' });

  const [resetModal, setResetModal] = useState<{
    isOpen: boolean;
    value: string;
  }>({ isOpen: false, value: '' });

  const [confirmSmartMatch, setConfirmSmartMatch] = useState(false);

  const [manualRef, setManualRef] = useState('');



  // Helper: Select all Bank Mutations with the same value as target
  const selectIdenticalBankValues = (value: number) => {
    const identicalIds = data?.bank
      ?.filter((b: any) => !b.is_matched && (Number(b.debet) === value || Number(b.kredit) === value))
      .map((b: any) => b.id) || [];
    
    // Toggle: If all are already selected, deselect them. Otherwise, select all.
    const allSelected = identicalIds.every((id: number) => selectedBankIds.includes(id));
    if (allSelected) {
       setSelectedBankIds(selectedBankIds.filter(id => !identicalIds.includes(id)));
    } else {
       setSelectedBankIds([...new Set([...selectedBankIds, ...identicalIds])]);
    }
  };

  // 5. NEURAL AUDIT LINK (VISUAL CONNECTOR)




  // 6. ACTION HANDLERS
  const handleRefMatch = async () => {
    if (!refMatchModal.value) return;
    setIsMatching(true);
    try {
      const res = await api.post('/reports/reconciliation/match-bulk', {
        referenceNumber: refMatchModal.value
      });
      toast.success(res.data.message);
      setRefMatchModal({ isOpen: false, value: '' });
      mutate();
    } catch (err: any) {
      toast.error('Gagal mencocokkan referensi', { description: err.response?.data?.message });
    } finally {
      setIsMatching(false);
    }
  };

  const handleBulkMatch = async () => {
    if (selectedBkuIds.length === 0 || selectedBankIds.length === 0) return;
    
    // If counts match, we perform individual 1-to-1 batch for "authentic" pairing
    if (selectedBkuIds.length === selectedBankIds.length && selectedBkuIds.length > 1) {
       setBatchProgress({ current: 0, total: selectedBankIds.length, isOpen: true });
       let successCount = 0;
       for (let i = 0; i < selectedBankIds.length; i++) {
          try {
             await api.post('/reports/reconciliation/match-individual', {
                bankId: selectedBankIds[i],
                bkuId: selectedBkuIds[i],
                matchType: 'MANUAL_1TO1_BATCH',
                keterangan_admin: manualRef || 'Pencocokan Manual 1-ke-1'
             });
             successCount++;
             setBatchProgress(prev => ({ ...prev, current: i + 1 }));
          } catch (err) {}
       }
       toast.success(`Berhasil mencocokkan ${successCount} pasangan secara manual.`);
       setSelectedBkuIds([]);
       setSelectedBankIds([]);
       mutate();
       setBatchProgress(prev => ({ ...prev, isOpen: false }));
       return;
    }

    // Default bulk behavior for m-to-n matching
    setIsMatching(true);
    try {
      await api.post('/reports/reconciliation/match-bulk', {
        bkuIds: selectedBkuIds,
        bankIds: selectedBankIds,
        keterangan: manualRef || 'Pencocokan Masal (Bulk Match)'
      });
      toast.success(`Berhasil mencocokkan ${selectedBkuIds.length} BKU dengan ${selectedBankIds.length} Bank`);
      setSelectedBkuIds([]);
      setSelectedBankIds([]);
      setManualRef('');
      mutate();
    } catch (err: any) {
      toast.error('Gagal mencocokkan masal', { description: err.response?.data?.message });
    } finally {
      setIsMatching(false);
    }
  };

  const handleBatchUnmatch = async (ids: number[]) => {
    if (!confirm(`Apakah Anda yakin ingin membatalkan ${ids.length} pencocokan?`)) return;
    
    try {
      await api.post('/reports/reconciliation/unmatch-batch', { ids });
      toast.success('Berhasil membatalkan pencocokan masal');
      mutate();
    } catch (err: any) {
      toast.error('Gagal membatalkan pencocokan', { description: err.response?.data?.message });
    }
  };

  const handleResetAll = async (code: string) => {
    try {
      setIsMatching(true);
      await api.post('/reports/reconciliation/reset-all', {
        year: new Date().getFullYear(),
        code: code
      });
      toast.success('Seluruh data rekonsiliasi tahun ini telah direset.');
      mutate();
      return true;
    } catch (err: any) {
      toast.error('Gagal mereset data', { description: err.response?.data?.message });
      return false;
    } finally {
      setIsMatching(false);
    }
  };



  useEffect(() => {
    const fetchOpds = async () => {
      try {
        const res = await api.get('/sp2d/opd');
        setOpdList(res.data);
      } catch (err) {}
    };
    fetchOpds();
  }, []);

  const [savingRekon, setSavingRekon] = useState(false);

  const handleSaveRekon = async () => {
    if (!rekonModal || selectedBankIds.length === 0) return;
    setSavingRekon(true);
    try {
      const isMultiple = selectedBankIds.length > 1;
      const endpoint = isMultiple 
        ? '/reports/reconciliation/match-multiple' 
        : '/reports/reconciliation/match-individual';
      
      const payload = isMultiple 
        ? {
            bkuId: rekonModal.id,
            bankIds: selectedBankIds,
            keterangan_admin: rekonModal.keterangan,
          }
        : {
            bkuId: rekonModal.id,
            bankId: selectedBankIds[0],
            nilaiBank: rekonModal.nilaiBank,
            keterangan_admin: rekonModal.keterangan,
            manual_tag: rekonModal.manualTag,
            tanggalPencairan: rekonModal.tanggalPencairan
          };

      await api.post(endpoint, payload);
      toast.success('Audit Berhasil Disimpan');
      setRekonModal(null);
      setSelectedBkuIds([]);
      setSelectedBankIds([]);
      mutate();
    } catch (err: any) {
      toast.error('Gagal menyimpan audit', { description: err.response?.data?.message });
    } finally {
      setSavingRekon(false);
    }
  };

  const handleMagicMatch = async () => {
    setMagicMatchProgress({ isOpen: true, total: 100, current: 0, success: 0, fails: 0 });
    
    // Polling Interval for REAL progress
    const pollInterval = setInterval(async () => {
      try {
        const pRes = await api.get('/reports/reconciliation/smart-progress');
        if (pRes.data.isOpen) {
          setMagicMatchProgress(pRes.data);
        }
      } catch (e) {
        console.error('Progress polling failed', e);
      }
    }, 800);

    try {
      const res = await api.post('/reports/reconciliation/match-smart', {
        year: new Date().getFullYear()
      });
      
      clearInterval(pollInterval);
      setMagicMatchProgress(prev => prev ? { ...prev, current: 100, success: res.data.matchCount } : null);
      
      await mutate();
      toast.success(res.data.message);
      setTimeout(() => setMagicMatchProgress(null), 2000);
      
    } catch (err: any) {
      clearInterval(pollInterval);
      toast.error('Gagal menjalankan Smart Engine', { description: err.response?.data?.message });
      setMagicMatchProgress(null);
    }
  };

  const handleManualMatch = async () => {
    if (selectedBkuIds.length === 0 || selectedBankIds.length === 0) {
      toast.warning('Pilih data BKU dan setidaknya satu mutasi bank.');
      return;
    }
    
    setIsMatching(true);
    try {
      await api.post('/reports/reconciliation/match-bulk', {
        bkuIds: selectedBkuIds,
        bankIds: selectedBankIds,
        keterangan: 'Manual Match oleh Admin'
      });
      toast.success('Pencocokan Berhasil');
      setSelectedBkuIds([]);
      setSelectedBankIds([]);
      mutate();
    } catch (err) {
      toast.error('Gagal mencocokkan data');
    } finally {
      setIsMatching(false);
    }
  };

  const handleQuickFilter = (type: string) => {
    const now = new Date();
    if (type === 'bulan_ini') {
      setFilters({ ...filters, startDate: format(now, 'yyyy-MM-01'), endDate: format(now, 'yyyy-MM-dd') });
    } else if (type === 'selisih') {
      setFilters({ ...filters, status: 'SELISIH' });
    } else if (type === 'reset') {
      setFilters({ opd: '', search: '', startDate: format(now, 'yyyy-MM-01'), endDate: format(now, 'yyyy-MM-dd'), status: 'BELUM' });
    }
    setCurrentPage(1);
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700">

      {/* PAGE HEADER */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-[#101828]">Rekonsiliasi Bank & BKU</h1>
          <p className="text-sm text-[#475467] mt-1">Audit integritas data pengeluaran (SP2D) vs Mutasi RKUD</p>
        </div>
        
        <div className="flex items-center gap-3">
          <Button 
            onClick={() => setResetModal({ isOpen: true, value: '' })}
            variant="ghost"
            className="h-10 px-4 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl font-black text-[9px] uppercase transition-all"
          >
            <RefreshCw size={14} className="mr-2" /> Reset All
          </Button>

          <Button 
            onClick={() => setConfirmSmartMatch(true)}
            className="h-10 px-6 bg-[#101828] text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 shadow-lg shadow-slate-200 transition-all flex items-center gap-2 group"
          >
            <Sparkles size={14} className="text-amber-400 group-hover:rotate-12 transition-transform" />
            <span>Magic Match AI</span>
          </Button>
          <Button 
            onClick={() => setRefMatchModal({ isOpen: true, value: '' })}
            variant="outline"
            className="h-10 px-4 border-[#EAECF0] text-indigo-600 rounded-xl font-black text-[10px] uppercase bg-indigo-50/50 hover:bg-indigo-100 transition-all shadow-sm"
          >
            <Hash size={14} className="mr-2" /> Match No. Bukti
          </Button>

          {selectedBankIds.length > 0 && filters.status !== 'BELUM' && (
            <Button 
              onClick={() => handleBatchUnmatch(selectedBankIds)}
              variant="destructive"
              className="h-10 px-4 rounded-xl font-black text-[10px] uppercase shadow-md animate-in zoom-in duration-200"
            >
              <Trash2 size={14} className="mr-2" /> Unmatch ({selectedBankIds.length})
            </Button>
          )}

          <Button 
            variant="outline"
            className="h-10 px-4 border-[#EAECF0] text-[#101828] rounded-xl font-semibold text-xs bg-white hover:bg-[#F8F9FA]"
          >
            <Download size={14} className="mr-2" /> Export
          </Button>
        </div>
      </div>

      {/* SUMMARY STATS (The Gold Standard) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-[#EFF8FF] p-6 rounded-xl border border-[#B2DDFF] shadow-sm group hover:scale-[1.02] transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white text-[#175CD3] rounded-xl flex items-center justify-center shadow-sm">
              <Database size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#175CD3] uppercase tracking-widest">Total Belanja (BKU)</p>
              <p className="text-xl font-black text-[#101828] mt-0.5">{formatCurrency(data?.summary?.totalBku || 0)}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-[#FEF3F2] p-6 rounded-xl border border-[#FECDCA] shadow-sm group hover:scale-[1.02] transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white text-[#F04438] rounded-xl flex items-center justify-center shadow-sm">
              <AlertTriangle size={24} />
            </div>
            <div>
               <p className="text-[10px] font-bold text-[#B42318] uppercase tracking-widest">Outstanding BKU</p>
               <p className="text-xl font-black text-[#B42318] mt-0.5">{formatCurrency(data?.summary?.totalUnmatched || 0)}</p>
            </div>
          </div>
        </Card>

        <Card className="bg-[#F5F9FF] p-6 rounded-xl border border-[#D1E9FF] shadow-sm group hover:scale-[1.02] transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white text-[#175CD3] rounded-xl flex items-center justify-center shadow-sm">
              <Activity size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-[#175CD3] uppercase tracking-widest">Akurasi Rekon</p>
              <p className="text-xl font-black text-[#101828] mt-0.5">{data?.summary?.accuracy || 0}%</p>
            </div>
          </div>
        </Card>

        <Card className="bg-amber-50 p-6 rounded-xl border border-amber-200 shadow-sm group hover:scale-[1.02] transition-all">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white text-amber-600 rounded-xl flex items-center justify-center shadow-sm">
              <ShieldCheck size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Saldo RKUD (Real)</p>
              <p className="text-xl font-black text-[#101828] mt-0.5">{formatCurrency(data?.summary?.bankBalance || 0)}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* FILTER BAR (Modernized Gold Standard) */}
      <Card className="rounded-2xl border border-slate-100 shadow-sm overflow-hidden bg-white">
        <div className="h-14 flex items-center justify-between px-6 bg-slate-50/50 border-b border-slate-100">
           <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                 <Filter size={14} className="text-white" />
              </div>
              <h2 className="text-[11px] font-black text-[#101828] uppercase tracking-wider">Parameter Audit & Pencarian</h2>
           </div>
           <div className="flex bg-slate-200/50 p-1 rounded-xl">
             <button 
               onClick={() => setFilters(prev => ({ ...prev, status: 'BELUM' }))}
               className={cn(
                 "px-5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all duration-300",
                 filters.status === 'BELUM' ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"
               )}
             >Outstanding</button>
             <button 
               onClick={() => setFilters(prev => ({ ...prev, status: 'SUDAH' }))}
               className={cn(
                 "px-5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all duration-300",
                 filters.status === 'SUDAH' ? "bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"
               )}
             >Selesai</button>
             <button 
               onClick={() => setFilters(prev => ({ ...prev, status: 'SELISIH' }))}
               className={cn(
                 "px-5 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all duration-300",
                 filters.status === 'SELISIH' ? "bg-white text-rose-600 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:text-slate-700"
               )}
             >Anomali</button>
           </div>
        </div>
        <div className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-3 space-y-2.5">
            <label className="text-[10px] font-black text-[#2E90FA] uppercase tracking-wider flex items-center gap-2 ml-1">
              <Search size={13} /> Cari Transaksi
            </label>
            <Input 
              placeholder="Nomor SP2D / STS..." 
              className="h-11 bg-[#F9FAFB] border-[#EAECF0] rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/10"
              value={filters.search}
              onChange={(e) => setFilters({...filters, search: e.target.value})}
            />
          </div>

          <div className="lg:col-span-3 space-y-2.5">
            <label className="text-[10px] font-black text-[#2E90FA] uppercase tracking-wider flex items-center gap-2 ml-1">
              <Building2 size={13} /> Satuan Kerja (OPD)
            </label>
            <Select value={filters.opd} onValueChange={(v) => setFilters({...filters, opd: v === 'none' ? '' : v})}>
              <SelectTrigger className="h-11 bg-[#F9FAFB] border-[#EAECF0] rounded-xl text-xs font-medium">
                <SelectValue placeholder="Pilih OPD" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">SEMUA OPD</SelectItem>
                {opdList.map(opd => <SelectItem key={opd} value={opd}>{opd}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="lg:col-span-4 space-y-2.5">
            <label className="text-[10px] font-black text-[#2E90FA] uppercase tracking-wider flex items-center gap-2 ml-1">
              <Calendar size={13} /> Rentang Tanggal
            </label>
            <div className="flex items-center gap-2 bg-[#F9FAFB] border border-[#EAECF0] rounded-xl px-3 h-11 shadow-sm">
              <input type="date" className="bg-transparent text-xs font-bold w-full outline-none" value={filters.startDate} onChange={(e) => setFilters({...filters, startDate: e.target.value})} />
              <span className="text-[10px] font-black text-[#D0D5DD]">S/D</span>
              <input type="date" className="bg-transparent text-xs font-bold w-full outline-none text-right" value={filters.endDate} onChange={(e) => setFilters({...filters, endDate: e.target.value})} />
            </div>
          </div>

          <div className="lg:col-span-2">
            <Button onClick={() => mutate()} className="w-full h-11 bg-[#101828] hover:bg-[#1D2939] text-white rounded-xl text-xs font-bold gap-2">
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /> Tampilkan Data
            </Button>
          </div>
        </div>
      </Card>

      {/* MAIN RECONCILIATION AREA - 3 PANELS SYSTEM */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        
        <div className="xl:col-span-3 flex flex-col">
          <div className="h-14 flex items-center justify-between px-5 bg-white border-b border-slate-100 rounded-t-2xl relative overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.02)] z-10">
             {/* SUM-LOCK INDICATOR BAR (Dynamic) */}
             {selectedBankIds.length > 0 && (
                <motion.div 
                   initial={{ y: -60 }} 
                   animate={{ y: 0 }}
                   className={cn(
                      "absolute inset-0 z-30 flex items-center justify-between px-5 transition-colors duration-500",
                      Math.abs(totalBkuForDisplay - totalSelectedBank) < 1 ? "bg-emerald-600 text-white shadow-lg" : "bg-indigo-600 text-white shadow-lg"
                   )}
                >
                   <div className="flex items-center gap-4">
                      <div className="flex flex-col">
                         <span className="text-[7px] font-black uppercase opacity-70 leading-none">Target Bank</span>
                         <span className="text-[11px] font-black tabular-nums">{formatCurrency(totalSelectedBank)}</span>
                      </div>
                      <ArrowRight size={14} className={Math.abs(totalBkuForDisplay - totalSelectedBank) < 1 ? "animate-bounce-x" : "opacity-40"} />
                      <div className="flex flex-col">
                         <span className="text-[7px] font-black uppercase opacity-70 leading-none">Selected BKU</span>
                         <span className="text-[11px] font-black tabular-nums">{formatCurrency(totalBkuForDisplay)}</span>
                      </div>
                   </div>
                </motion.div>
             )}

            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shadow-sm">
                  <Database size={16} className="text-indigo-600" />
               </div>
               <div className="flex flex-col">
                  <h2 className="text-[11px] font-black text-[#101828] uppercase tracking-wider leading-none">Audit BKU</h2>
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-1.5">{data?.bku?.length || 0} Entri ditemukan</span>
               </div>
            </div>
          </div>
          
          <div className="p-4 space-y-4 h-[750px] overflow-hidden flex flex-col bg-white border border-slate-100 border-t-0 rounded-b-2xl shadow-sm">
            <Tabs defaultValue="SP2D" className="w-full flex-1 flex flex-col">
              <TabsList className="grid w-full grid-cols-3 bg-slate-50 p-1 rounded-xl h-11 shrink-0 border border-slate-200/50">
                <TabsTrigger value="SP2D" className="rounded-lg text-[9px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-slate-200">SP2D</TabsTrigger>
                <TabsTrigger value="PENDAPATAN" className="rounded-lg text-[9px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-slate-200">STS</TabsTrigger>
                <TabsTrigger value="POTONGAN" className="rounded-lg text-[9px] font-black uppercase tracking-widest data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-slate-200">POT</TabsTrigger>
              </TabsList>

            {['SP2D', 'PENDAPATAN', 'POTONGAN'].map((tabValue) => (
              <TabsContent key={tabValue} value={tabValue} className="space-y-3 max-h-[750px] overflow-y-auto pr-2 custom-scrollbar">
                {isLoading ? (
                  [1,2,3,4].map(i => <div key={i} className="h-24 animate-pulse bg-slate-50 rounded-xl border border-dashed border-slate-200" />)
                ) : filteredBku?.filter((i: any) => 
                    tabValue === 'SP2D' ? i.source === 'SP2D' :
                    tabValue === 'PENDAPATAN' ? i.source === 'PENDAPATAN' :
                    (i.source === 'POTONGAN' || i.source === 'SETORAN')
                  ).length === 0 ? (
                  <div className="py-20 text-center opacity-30 border-2 border-dashed rounded-2xl">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Data Kosong</p>
                    {selectedBankIds.length > 0 && <p className="text-[7px] font-bold mt-2">Filter nilai aktif (±10rb)</p>}
                  </div>
                ) : (
                  filteredBku?.filter((item: any) => 
                    tabValue === 'SP2D' ? item.source === 'SP2D' :
                    tabValue === 'PENDAPATAN' ? item.source === 'PENDAPATAN' :
                    (item.source === 'POTONGAN' || item.source === 'SETORAN')
                  ).map((item: any) => (
                    <Card 
                      key={`${item.source}-${item.id}`} 
                      id={`bku-${item.id}`}
                      onClick={(e) => handleBkuClick(e, item.id, filteredBku)}
                      className={cn(
                        "p-3 cursor-pointer border-2 transition-all duration-200 group relative",
                        selectedBkuIds.includes(item.id) ? "border-indigo-600 bg-indigo-50/50 shadow-lg scale-[1.02]" : "border-slate-100 hover:border-slate-300 bg-white"
                      )}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="flex items-center gap-2">
                             <span className="text-[8px] font-black text-slate-400 uppercase tracking-tighter">#{item.id.toString().substring(0,6)}</span>
                             {selectedBkuIds.includes(item.id) && (
                                <Badge className="bg-indigo-600 text-white border-none h-4 px-1 text-[8px] font-black animate-in zoom-in">
                                   #{selectedBkuIds.indexOf(item.id) + 1}
                                </Badge>
                             )}
                          </div>
                          <div className="flex gap-1">
                             <Badge className={cn(
                               "text-[7px] h-4 px-1.5 font-black border-none shadow-sm flex items-center gap-1",
                               item.status_rekon?.startsWith('SUDAH') ? "bg-emerald-500 text-white" : 
                               item.status_rekon?.includes('ANOMALI') ? "bg-rose-600 text-white animate-pulse" : "bg-slate-100 text-slate-500"
                             )}>
                               {item.status_rekon?.startsWith('SUDAH') && <CheckCircle2 size={8} />}
                               {item.status_rekon?.includes('ANOMALI') && <AlertCircle size={8} />}
                               {item.status_rekon?.startsWith('SUDAH') ? 'TEREKONSILIASI' : 
                                item.status_rekon?.includes('ANOMALI') ? 'ANOMALI AUDIT' : 'OUTSTANDING'}
                             </Badge>
                            <Badge className={cn(
                              "text-[7px] h-3.5 px-1 border-none bg-slate-900"
                            )}>{item.source}</Badge>
                          </div>
                        </div>
                        <p className="text-[10px] font-black text-[#101828] leading-tight line-clamp-2 uppercase italic">{item.bukti}</p>
                        <div className="flex justify-between items-end">
                          <div className="space-y-0.5">
                            <p className="text-[11px] font-black text-indigo-600 tabular-nums">{formatCurrency(item.nilai)}</p>
                            {item.selisih_rekon !== 0 && (
                              <p className="text-[8px] font-bold text-rose-600">Selisih: {formatCurrency(item.selisih_rekon)}</p>
                            )}
                          </div>
                          <span className="text-[8px] font-bold text-slate-400">{format(new Date(item.tanggal), 'dd/MM/yy')}</span>
                        </div>
                        {item.manual_tag && (
                          <div className="absolute top-0 right-0 transform translate-x-1/4 -translate-y-1/4">
                             <Badge className="bg-amber-500 text-white border-none shadow-sm h-4 px-1 text-[8px] font-black">TAG: {item.manual_tag}</Badge>
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 opacity-20 group-hover:opacity-100 transition-opacity">
                           <FileText size={12} className="text-indigo-400" />
                        </div>
                      </div>
                    </Card>
                  ))
                )}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </div>

        {/* PANEL 2: BANK STATEMENTS (TENGAH - 50%) */}
        <div className="xl:col-span-5 flex flex-col">
          <div className="h-14 flex items-center justify-between px-5 bg-white border-b border-slate-100 rounded-t-2xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] z-10">
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center border border-emerald-100 shadow-sm">
                   <Activity size={16} className="text-emerald-600" />
                </div>
                <div className="flex flex-col">
                   <h2 className="text-[11px] font-black text-[#101828] uppercase tracking-wider leading-none">Mutasi Bank</h2>
                   <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex items-center gap-1 bg-emerald-50/50 px-1.5 py-0.5 rounded-full border border-emerald-100/50">
                         <div className="w-1 h-1 rounded-full bg-emerald-500" />
                         <span className="text-[7px] font-black text-emerald-700 uppercase tabular-nums">{data?.summary?.matchedCount || 0} OK</span>
                      </div>
                      <div className="flex items-center gap-1 bg-rose-50/50 px-1.5 py-0.5 rounded-full border border-rose-100/50">
                         <div className="w-1 h-1 rounded-full bg-rose-500" />
                         <span className="text-[7px] font-black text-rose-700 uppercase tabular-nums">{data?.summary?.unmatchedCount || 0} NO</span>
                      </div>
                   </div>
                </div>
              </div>
              
              <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-200/50 shadow-inner">
                <button 
                  onClick={() => setBankTypeFilter('ALL')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all duration-300",
                    bankTypeFilter === 'ALL' ? "bg-white text-indigo-600 shadow-sm ring-1 ring-slate-200" : "text-slate-400 hover:text-slate-600"
                  )}
                >Semua</button>
                <button 
                  onClick={() => setBankTypeFilter('PENERIMAAN')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all duration-300",
                    bankTypeFilter === 'PENERIMAAN' ? "bg-emerald-600 text-white shadow-md shadow-emerald-100" : "text-slate-400 hover:text-slate-600"
                  )}
                >Masuk</button>
                <button 
                  onClick={() => setBankTypeFilter('PENGELUARAN')}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase transition-all duration-300",
                    bankTypeFilter === 'PENGELUARAN' ? "bg-rose-500 text-white shadow-md shadow-rose-100" : "text-slate-400 hover:text-slate-600"
                  )}
                >Keluar</button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <TooltipProvider delayDuration={100}>
                {smartGroupValue !== null && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={() => {
                          setSmartGroupValue(null);
                          setSelectedBankIds([]);
                          setSelectedBkuIds([]);
                          setManualPairingMap({});
                        }}
                        variant="ghost"
                        className="h-8 w-8 p-0 text-rose-500 hover:bg-rose-50 hover:text-rose-600 rounded-lg border border-rose-100/50"
                      >
                        <RefreshCw size={14} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[10px] font-bold bg-slate-900 border-none text-white">Reset Smart Group Filter</TooltipContent>
                  </Tooltip>
                )}
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => {
                        const items = smartGroupValue !== null ? smartGroupBankItems : filteredBank;
                        const allIds = items?.map((b: any) => b.id) || [];
                        const allSelected = allIds.every(id => selectedBankIds.includes(id));
                        if (allSelected) {
                          setSelectedBankIds(selectedBankIds.filter(id => !allIds.includes(id)));
                        } else {
                          setSelectedBankIds([...new Set([...selectedBankIds, ...allIds])]);
                        }
                      }}
                      variant="outline"
                      className="h-8 w-8 p-0 border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 rounded-lg shadow-sm"
                    >
                      <MousePointer2 size={14} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-[10px] font-bold bg-slate-900 border-none text-white">
                    {(smartGroupValue !== null ? smartGroupBankItems : filteredBank)?.every((b: any) => selectedBankIds.includes(b.id)) 
                      ? 'Batalkan Pilihan Semua' 
                      : 'Pilih Semua yang Terlihat'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          
          <Card 
            className="rounded-t-none rounded-b-2xl border border-slate-100 border-t-0 shadow-sm overflow-hidden bg-white h-[750px]"
            onClick={(e) => {
               // Reset smart group if clicking on the background of the bank mutation panel
               if (e.target === e.currentTarget) {
                 setSmartGroupValue(null);
               }
            }}
          >
             <div className="max-h-[750px] overflow-y-auto custom-scrollbar">
                <Table>
                   <TableHeader className="bg-slate-50/50 sticky top-0 z-20 backdrop-blur-md">
                      <TableRow className="hover:bg-transparent border-b border-slate-100">
                         <TableHead className="w-12 text-[10px] font-black uppercase text-slate-400 py-4 pl-6 tracking-widest">#</TableHead>
                         <TableHead className="w-10"></TableHead>
                         <TableHead className="text-[10px] font-black uppercase text-slate-400 py-4 tracking-widest">Tanggal</TableHead>
                         <TableHead className="text-[10px] font-black uppercase text-slate-400 py-4 tracking-widest">Deskripsi Transaksi</TableHead>
                         <TableHead className="text-[10px] font-black uppercase text-slate-400 py-4 text-right pr-6 tracking-widest">Nominal Mutasi</TableHead>
                      </TableRow>
                   </TableHeader>
                   <TableBody>
                       {filteredBank?.length === 0 ? (
                          <TableRow>
                             <TableCell colSpan={5} className="py-20 text-center">
                                <p className="text-[10px] font-black uppercase text-slate-300 tracking-widest">Tidak ada mutasi yang cocok</p>
                             </TableCell>
                          </TableRow>
                       ) : (
                         filteredBank?.map((bank: any, index: number) => {
                         const bankVal = Number(bank.debet) || Number(bank.kredit);
                         const isHidden = smartGroupValue !== null && bankVal !== smartGroupValue;
                         const groupIndex = smartGroupValue !== null 
                           ? (smartGroupBankItems?.findIndex((b: any) => b.id === bank.id) ?? -1) + 1 
                           : index + 1;
                         const isBankPaired = !!Object.keys(manualPairingMap).includes(groupIndex.toString());
                         const hasExactMatch = data?.bku?.some((b: any) => {
                             const bkuVal = Number(b.nilai_neto) || Number(b.nilai_bruto) || Number(b.nilai);
                             return Math.abs(bkuVal - bankVal) < 1;
                          });
                         
                         return (
                          <TableRow 
                            key={bank.id} 
                            id={`bank-${bank.id}`}
                            onClick={(e) => {
                               handleBankClick(e, bank.id, filteredBank);
                            }}
                            className={cn(
                               "cursor-pointer transition-all duration-300 group relative border-b border-slate-50",
                               selectedBankIds.includes(bank.id) ? "bg-indigo-50/80 shadow-inner" : "hover:bg-slate-50/50",
                               bank.is_matched && "opacity-40 grayscale",
                               isHidden && "hidden",
                               isBankPaired && "bg-emerald-50 border-l-4 border-l-emerald-500 shadow-[inset_0_0_20px_rgba(16,185,129,0.05)]",
                               !isBankPaired && !isHidden && smartGroupValue !== null && hasExactMatch && "bg-emerald-50/30 border-l-2 border-l-emerald-200"
                            )}
                          >
                             <TableCell className="p-3 pl-4 text-[9px] font-black text-slate-400 group-hover:text-indigo-600 transition-colors">
                                <span className={cn(
                                  "inline-flex items-center justify-center w-6 h-6 rounded-md",
                                  smartGroupValue !== null ? "bg-indigo-600 text-white shadow-sm" : "bg-slate-100"
                                )}>
                                  #{groupIndex}
                                </span>
                             </TableCell>
                             <TableCell className="p-3">
                                <div className="flex items-center gap-2">
                                   <div className={cn(
                                      "w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all",
                                      selectedBankIds.includes(bank.id) ? "bg-indigo-600 border-indigo-600 text-white scale-110" : "border-slate-200 bg-white"
                                   )}>
                                      {selectedBankIds.includes(bank.id) && <CheckCircle2 size={12} strokeWidth={3} />}
                                   </div>
                                   {!bank.is_matched && (new Date().getTime() - new Date(bank.tanggal).getTime()) / (1000 * 3600 * 24) > 30 && (
                                       <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                                   )}
                                </div>
                             </TableCell>
                             <TableCell className="text-[9px] font-black text-slate-500 py-4 tabular-nums">{format(new Date(bank.tanggal), 'dd/MM/yy')}</TableCell>
                             <TableCell className="py-4">
                                <p className="text-[10px] font-bold text-[#101828] line-clamp-2 uppercase leading-relaxed tracking-tight" title={bank.deskripsi}>{bank.deskripsi}</p>
                                {bank.is_matched && (
                                   <div className="flex items-center gap-2 mt-1.5">
                                      <Badge className="bg-emerald-500 h-4 text-[7px] px-1.5 font-black shadow-sm border-none">VERIFIED</Badge>
                                      <span className="text-[7px] font-black text-slate-400 uppercase tracking-widest">Audit ID: {bank.ref_bku_id?.substring(0,8)}</span>
                                   </div>
                                )}
                                {!bank.is_matched && hasExactMatch && (
                                   <div className="flex items-center gap-1.5 mt-1.5 animate-in fade-in duration-500">
                                      <Sparkles size={10} className="text-emerald-500" />
                                      <span className="text-[7px] font-black text-emerald-600 uppercase tracking-widest">Saran Akurat Ditemukan (100%)</span>
                                   </div>
                                )}
                             </TableCell>
                             <TableCell className="text-right pr-4">
                                <div className="flex flex-col items-end">
                                   <span className={cn(
                                      "text-[10px] font-black tabular-nums tracking-tight",
                                      toN(bank.debet) > 0 ? "text-rose-600" : "text-emerald-600"
                                   )}>
                                      {toN(bank.debet) > 0 ? '-' : '+'}{formatCurrency(bankVal)}
                                   </span>
                                   <Badge className={cn(
                                      "text-[7px] font-black border-none h-3.5 px-1 mt-0.5",
                                      toN(bank.debet) > 0 ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"
                                   )}>
                                      {toN(bank.debet) > 0 ? 'PENGELUARAN' : 'PENERIMAAN'}
                                   </Badge>
                                   {!bank.is_matched && (
                                      <button 
                                         onClick={(e) => {
                                            e.stopPropagation();
                                            selectIdenticalBankValues(bankVal);
                                         }}
                                         className="text-[7px] font-black uppercase text-indigo-600 hover:text-white hover:bg-indigo-600 border border-indigo-100 bg-indigo-50/50 px-2 py-1 rounded-md flex items-center gap-1 transition-all"
                                      >
                                         <MousePointer2 size={8} /> Group Nilai Sama
                                      </button>
                                   )}
                                </div>
                             </TableCell>
                          </TableRow>
                         );
                      })
                   )}
                   </TableBody>
                </Table>
             </div>
          </Card>
        </div>

        <div className="xl:col-span-4 flex flex-col">
          <div className="h-14 flex items-center justify-between px-5 bg-white border-b border-slate-100 rounded-t-2xl shadow-[0_1px_2px_rgba(0,0,0,0.02)] z-10">
            <div className="flex flex-col">
              <h2 className="text-[11px] font-black text-[#101828] uppercase tracking-wider flex items-center gap-2">
                <Zap size={14} className="text-amber-500 fill-amber-500" />
                Audit Intelligence
              </h2>
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter mt-0.5">Analisis pencocokan otomatis</span>
            </div>
            <div className="flex items-center gap-2">
               {selectedBankIds.length > 0 && (
                  <Badge className="bg-indigo-50 text-indigo-600 border-none text-[8px] font-black h-5 uppercase px-1.5 animate-pulse">
                     Live Analysis
                  </Badge>
               )}
            </div>
          </div>

          <Card className="rounded-t-none rounded-b-2xl border border-indigo-100 border-t-0 shadow-2xl shadow-indigo-100/30 overflow-hidden bg-white h-[750px]">
            <div className="p-5 space-y-5 h-full overflow-hidden flex flex-col">
                 {selectedBankIds.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 text-center">
                       <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center border-4 border-dashed border-slate-100 mb-6">
                          <LinkIcon size={32} className="text-slate-200" />
                       </div>
                       <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Pilih Mutasi Bank</h4>
                       <p className="text-[9px] font-bold text-slate-300 max-w-[180px] leading-relaxed">Pilih satu atau beberapa mutasi bank di panel tengah untuk mencari pasangan BKU secara otomatis.</p>
                    </div>
                 ) : (
                      <div className="animate-in fade-in slide-in-from-right-8 duration-500 space-y-6 flex-1 flex flex-col relative overflow-hidden">
                        {/* SUGGESTIONS LIST - SCROLLABLE AREA */}
                        <div className="flex-1 overflow-hidden flex flex-col relative">
                           <div className="flex items-center gap-2 mb-3">
                              <div className="h-0.5 flex-1 bg-indigo-50"></div>
                              <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Analisis Kandidat Audit</span>
                              <div className="h-0.5 flex-1 bg-indigo-50"></div>
                           </div>
                          
                            {isLoadingSuggestions ? (
                               <div className="space-y-3">
                                 {[1,2,3].map(i => <div key={i} className="h-24 animate-pulse bg-slate-50 rounded-xl border border-dashed border-slate-200" />)}
                               </div>
                            ) : suggestionsData?.data?.length > 0 ? (
                               <div className="space-y-3 overflow-y-auto pr-2 custom-scrollbar pb-32">
                                  {suggestionsData.data.map((sug: any) => {
                                     const bkuVal = sug.match_mode === 'bruto' ? sug.nilai_bruto : sug.nilai_neto;
                                     const reconVal = smartGroupValue !== null 
                                        ? smartGroupValue 
                                        : data?.bank?.filter((bk: any) => selectedBankIds.includes(bk.id)).reduce((s: number, bk: any) => s + (Number(bk.debet) || Number(bk.kredit)), 0);
                                     const selisih = bkuVal - reconVal;
                                     const matchPercent = Math.max(0, Math.min(100, 100 - (Math.abs(selisih) / (bkuVal || 1) * 100)));
                                     
                                     // Check if this BKU is manually paired to a bank sequence
                                     const pairedWith = Object.entries(manualPairingMap).find(([_, id]) => id === sug.id)?.[0];

                                     return (
                                        <Card 
                                           key={sug.id} 
                                           id={`suggestion-${sug.id}`}
                                           className={cn(
                                              "p-3 border-slate-100 hover:border-indigo-300 transition-all cursor-pointer group shadow-sm hover:shadow-md relative overflow-hidden",
                                              pairedWith ? "border-emerald-500 bg-emerald-50 shadow-[0_0_15px_rgba(16,185,129,0.1)]" : "bg-white",
                                              selectedBkuIds.includes(sug.id) && !pairedWith && "border-indigo-600 bg-indigo-50/30",
                                              sug.suggestion_type === 'EXACT' && !pairedWith && "border-emerald-100 bg-emerald-50/20"
                                           )}
                                           onClick={() => {
                                              if (selectedBkuIds.includes(sug.id)) {
                                                 setSelectedBkuIds(selectedBkuIds.filter(id => id !== sug.id));
                                              } else {
                                                 setSelectedBkuIds([...selectedBkuIds, sug.id]);
                                              }
                                           }}
                                        >
                                           {/* Status Badge (Locked Slot) */}
                                           {pairedWith && (
                                              <div className="absolute top-0 left-0 bg-emerald-600 text-white text-[8px] font-black px-2 py-1 rounded-br-lg shadow-sm flex items-center gap-1 z-20">
                                                 <Lock size={10} className="fill-white" />
                                                 SLOT #{pairedWith}
                                              </div>
                                           )}
                                           {/* Pairing Toolbar (Manual Labeling) */}
                                           <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity">
                                               <Select
                                                  value={pairedWith || "none"}
                                                  onValueChange={(val) => {
                                                     if (val === "none") {
                                                        const keyToDel = Object.keys(manualPairingMap).find(k => manualPairingMap[Number(k)] === sug.id);
                                                        if (keyToDel) {
                                                           setManualPairingMap(prev => {
                                                              const next = { ...prev };
                                                              delete next[Number(keyToDel)];
                                                              return next;
                                                           });
                                                           // Don't deselect BKU immediately, let user do it if they want
                                                        }
                                                        return;
                                                     }
                                                     
                                                     const seq = Number(val);
                                                     setManualPairingMap(prev => {
                                                        const next = { ...prev };
                                                        // Remove this BKU from any other seq if it was there
                                                        Object.keys(next).forEach(k => { if(next[Number(k)] === sug.id) delete next[Number(k)]; });
                                                        next[seq] = sug.id;
                                                        setSelectedBkuIds(prevIds => [...new Set([...prevIds, sug.id])]);
                                                        return next;
                                                     });
                                                  }}
                                               >
                                                  <SelectTrigger className="h-7 w-28 text-[9px] font-black bg-white/95 border-slate-200 shadow-sm">
                                                     <SelectValue placeholder="Pair with..." />
                                                  </SelectTrigger>
                                                  <SelectContent>
                                                     <SelectItem value="none" className="text-[10px]">Lepas Pairing</SelectItem>
                                                     {selectedBankIds.map((_, idx) => {
                                                        const s = (idx + 1).toString();
                                                        const isPairedToOther = Object.keys(manualPairingMap).includes(s) && manualPairingMap[Number(s)] !== sug.id;
                                                        return (
                                                           <SelectItem 
                                                              key={idx} 
                                                              value={s} 
                                                              disabled={isPairedToOther}
                                                              className="text-[10px]"
                                                           >
                                                              Slot Bank #{s} {isPairedToOther ? "(Used)" : ""}
                                                           </SelectItem>
                                                        );
                                                     })}
                                                  </SelectContent>
                                               </Select>
                                              {/* OLD BUTTONS REMOVED */}
                                               {false && selectedBankIds.map((_, idx) => {
                                                 const seq = idx + 1;
                                                 const isThisSeq = pairedWith === seq.toString();
                                                 const isOtherPaired = Object.keys(manualPairingMap).includes(seq.toString()) && !isThisSeq;
                                                 
                                                 return (
                                                    <button
                                                       key={idx}
                                                       onClick={(e) => {
                                                          e.stopPropagation();
                                                          setManualPairingMap(prev => {
                                                             const next = { ...prev };
                                                             if (isThisSeq) {
                                                                delete next[seq];
                                                                setSelectedBkuIds(prevIds => prevIds.filter(id => id !== sug.id));
                                                             } else {
                                                                Object.keys(next).forEach(k => { if(next[Number(k)] === sug.id) delete next[Number(k)]; });
                                                                next[seq] = sug.id;
                                                                setSelectedBkuIds(prevIds => [...new Set([...prevIds, sug.id])]);
                                                             }
                                                             return next;
                                                          });
                                                       }}
                                                       className={cn(
                                                          "w-5 h-5 rounded flex items-center justify-center text-[8px] font-black transition-all",
                                                          isOtherPaired && "opacity-20 cursor-not-allowed"
                                                       )}
                                                    >
                                                       #{seq}
                                                    </button>
                                                 );
                                              })}
                                           </div>



                                           {/* Progress bar matching background */}
                                           <div className="absolute bottom-0 left-0 h-1 bg-indigo-600/10 w-full">
                                              <div className="h-full bg-indigo-600" style={{ width: `${matchPercent}%` }}></div>
                                           </div>

                                           <div className="space-y-2">
                                              <div className="flex justify-between items-center">
                                                 <div className="flex items-center gap-1.5 min-w-0">
                                                    <Badge className={cn(
                                                       "text-[7px] h-3.5 px-1 font-black border-none shrink-0",
                                                       sug.suggestion_type === 'EXACT' ? "bg-emerald-500" : "bg-indigo-600"
                                                    )}>{sug.suggestion_type === 'EXACT' ? 'MATCH' : sug.source}</Badge>
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate max-w-[100px]">{sug.bukti}</span>
                                                 </div>
                                                 <div className="flex items-center gap-1 shrink-0">
                                                    <div className="text-[8px] font-black bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md border border-indigo-100">
                                                       {matchPercent.toFixed(0)}%
                                                    </div>
                                                 </div>
                                              </div>

                                              <div className="space-y-0.5">
                                                 <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1 min-w-0">
                                                       <Building2 size={8} className="text-slate-400 shrink-0" />
                                                       <p className="text-[8px] font-bold text-slate-400 uppercase truncate">{sug.opd || 'SEMUA OPD'}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                       <Calendar size={8} className="text-slate-400" />
                                                       <span className="text-[8px] font-bold text-slate-400">{sug.tanggal ? format(new Date(sug.tanggal), 'dd/MM/yy') : '-'}</span>
                                                    </div>
                                                 </div>
                                                 <p className="text-[9px] font-bold text-[#101828] leading-tight line-clamp-1 uppercase italic">{sug.uraian}</p>
                                              </div>

                                              <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-50">
                                                 <div>
                                                    <p className="text-[7px] font-black text-slate-400 uppercase">BKU</p>
                                                    <p className="text-[9px] font-black text-indigo-700 tabular-nums truncate">
                                                       {formatCurrency(bkuVal)}
                                                    </p>
                                                 </div>
                                                 <div className="text-right">
                                                    <p className="text-[7px] font-black text-slate-400 uppercase">REKON</p>
                                                    <p className="text-[9px] font-black text-slate-900 tabular-nums truncate">{formatCurrency(reconVal)}</p>
                                                 </div>
                                              </div>

                                              <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                                                 <div className="flex items-center gap-1">
                                                    <p className="text-[7px] font-black text-slate-400 uppercase">Selisih:</p>
                                                    <p className={cn(
                                                       "text-[9px] font-black tabular-nums",
                                                       Math.abs(selisih) > 1 ? "text-rose-600" : "text-emerald-600"
                                                    )}>{formatCurrency(selisih)}</p>
                                                 </div>
                                                 
                                                 <div className="flex items-center gap-1.5">
                                                    <TooltipProvider>
                                                       <Tooltip>
                                                          <TooltipTrigger asChild>
                                                             <Button 
                                                                size="icon" 
                                                                className="w-6 h-6 rounded-lg bg-emerald-500 hover:bg-emerald-600 shadow-sm"
                                                                disabled={savingRekon}
                                                                onClick={async (e) => {
                                                                   e.stopPropagation();
                                                                   if (!selectedBankIds.length) {
                                                                      toast.error('Pilih mutasi bank terlebih dahulu');
                                                                      return;
                                                                   }
                                                                   setSavingRekon(true);
                                                                   try {
                                                                      const isMultiple = selectedBankIds.length > 1;
                                                                      const endpoint = isMultiple 
                                                                         ? '/reports/reconciliation/match-multiple' 
                                                                         : '/reports/reconciliation/match-individual';
                                                                      
                                                                      const payload = isMultiple 
                                                                         ? { bkuId: sug.id, bankIds: selectedBankIds, keterangan_admin: manualRef || 'Konfirmasi Instan AI' }
                                                                         : { 
                                                                            bkuId: sug.id, 
                                                                            bankId: selectedBankIds[0], 
                                                                            match_type: sug.match_mode, // Gunakan match_mode dari AI
                                                                            keterangan_admin: manualRef || 'Konfirmasi Instan AI' 
                                                                         };

                                                                      await api.post(endpoint, payload);
                                                                      toast.success('Pencocokan Instan Berhasil');
                                                                      setSelectedBkuIds([]);
                                                                      setSelectedBankIds([]);
                                                                      setManualRef('');
                                                                      mutate();
                                                                   } catch (err: any) {
                                                                      toast.error('Gagal mencocokkan', { description: err.response?.data?.message || 'Internal Server Error' });
                                                                   } finally {
                                                                      setSavingRekon(false);
                                                                   }
                                                                }}
                                                             >
                                                                {savingRekon ? <Loader2 size={10} className="animate-spin text-white" /> : <CheckCircle2 size={12} className="text-white" />}
                                                             </Button>
                                                          </TooltipTrigger>
                                                          <TooltipContent className="text-[9px] font-bold">Konfirmasi Instan</TooltipContent>
                                                       </Tooltip>
                                                    </TooltipProvider>

                                                    <TooltipProvider>
                                                       <Tooltip>
                                                          <TooltipTrigger asChild>
                                                             <Button 
                                                                size="icon" 
                                                                variant="outline"
                                                                className="w-6 h-6 rounded-lg border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-indigo-600"
                                                                onClick={(e) => {
                                                                   e.stopPropagation();
                                                                   setRekonModal({
                                                                      id: sug.id,
                                                                      nomor: sug.bukti,
                                                                      opd: sug.opd,
                                                                      nilaiBku: sug.match_mode === 'bruto' ? sug.nilai_bruto : sug.nilai_neto || sug.nilai,
                                                                      nilaiBank: reconVal,
                                                                      selisih: selisih,
                                                                      tanggalPencairan: format(new Date(), 'yyyy-MM-dd')
                                                                   });
                                                                }}
                                                             >
                                                                <Filter size={10} />
                                                             </Button>
                                                          </TooltipTrigger>
                                                          <TooltipContent className="text-[9px] font-bold">Audit Detail</TooltipContent>
                                                       </Tooltip>
                                                    </TooltipProvider>
                                                 </div>
                                              </div>
                                           </div>
                                        </Card>
                                     );
                                  })}
                               </div>
                            ) : (
                               <div className="flex flex-col items-center justify-center py-12 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-100">
                                  <AlertCircle size={24} className="text-slate-300 mb-3" />
                                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tidak Ada Saran</p>
                                  <p className="text-[8px] font-bold text-slate-300 max-w-[150px] mt-1 leading-relaxed">Nilai atau tanggal mutasi bank tidak memiliki pasangan yang relevan di BKU.</p>
                               </div>
                            )}
                        </div>
                    </div>
                 )}
              </div>
            </Card>
         </div>
      </div>

      {/* RECONCILIATION MODAL (Premium Audit Modal) */}
      <AnimatePresence>
         {rekonModal && (
           <Dialog open={!!rekonModal} onOpenChange={() => setRekonModal(null)}>
             <DialogContent className="sm:max-w-md rounded-[24px]">
               <DialogHeader>
                 <DialogTitle className="flex items-center gap-2 text-indigo-600">
                    <Sparkles size={20} /> Audit Integritas Data
                 </DialogTitle>
                 <DialogDescription className="text-xs">
                    Lakukan penyesuaian nilai jika terdapat selisih antara BKU dan mutasi bank.
                 </DialogDescription>
               </DialogHeader>
               
               <div className="space-y-6 py-4">
                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Nilai BKU</label>
                        <div className="h-10 bg-slate-50 rounded-lg flex items-center px-3 font-bold text-slate-700 text-xs">
                           {formatCurrency(rekonModal.nilaiBku)}
                        </div>
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-indigo-600 uppercase">Nilai Bank</label>
                        <Input 
                           value={formatNumber(rekonModal.nilaiBank)}
                           onChange={(e) => {
                              const val = parseNumber(e.target.value);
                              setRekonModal({...rekonModal, nilaiBank: val, selisih: rekonModal.nilaiBku - val});
                           }}
                           className="h-10 font-black text-xs text-indigo-700 border-indigo-200"
                        />
                     </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-amber-600 uppercase flex items-center gap-1">
                           <Tag size={10} /> Penomoran Manual (Data Kembar)
                        </label>
                        <Input 
                           placeholder="Contoh: 1, 2, atau A"
                           value={rekonModal.manualTag || ''}
                           onChange={(e) => setRekonModal({...rekonModal, manualTag: e.target.value})}
                           className="h-10 text-xs font-bold border-amber-200 focus:ring-amber-100"
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase">Tanggal Cair</label>
                        <Input 
                           type="date"
                           value={rekonModal.tanggalPencairan}
                           onChange={(e) => setRekonModal({...rekonModal, tanggalPencairan: e.target.value})}
                           className="h-10 text-xs font-bold"
                        />
                     </div>
                  </div>

                  <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 flex justify-between items-center">
                     <span className="text-[10px] font-black text-rose-800 uppercase">Selisih Audit</span>
                     <span className="text-sm font-black text-rose-600 tabular-nums">{formatCurrency(rekonModal.selisih)}</span>
                  </div>

                  <div className="space-y-2">
                     <label className="text-[10px] font-black text-slate-400 uppercase">Catatan Audit</label>
                     <textarea 
                        className="w-full min-h-[80px] p-3 text-xs font-medium bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-300 transition-all"
                        placeholder="Alasan selisih (contoh: Kesalahan NTPN atau pembulatan bank)..."
                        value={rekonModal.keterangan}
                        onChange={(e) => setRekonModal({...rekonModal, keterangan: e.target.value})}
                     />
                  </div>
               </div>

               <DialogFooter>
                  <Button variant="ghost" onClick={() => setRekonModal(null)} className="rounded-xl text-xs font-bold">Batal</Button>
                  <Button 
                    onClick={handleSaveRekon}
                    disabled={savingRekon}
                    className="bg-[#101828] text-white rounded-xl text-xs font-bold px-6 gap-2"
                  >
                    {savingRekon ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                    Simpan & Verifikasi
                  </Button>
               </DialogFooter>
             </DialogContent>
           </Dialog>
         )}
      </AnimatePresence>



      {/* BULK ACTION BAR */}
      {(selectedBkuIds.length > 0 || selectedBankIds.length > 0) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[200] w-fit">
          <div className="bg-[#101828]/95 text-white rounded-xl shadow-2xl border border-white/10 p-2.5 px-5 backdrop-blur-xl flex items-center gap-5 animate-in fade-in slide-in-from-bottom-3 duration-300">
            <div className="flex items-center gap-4 border-r border-white/10 pr-5">
              <div className="flex flex-col">
                <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest">BKU ({bkuCountForDisplay})</span>
                <span className="text-[11px] font-black tabular-nums leading-none mt-1">{formatCurrency(totalBkuForDisplay)}</span>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center">
                <ArrowRight size={12} className={cn("transition-transform", isBalancedForDisplay ? "text-emerald-400" : "text-slate-500")} />
              </div>
              <div className="flex flex-col">
                <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest">BANK ({selectedBankIds.length})</span>
                <span className="text-[11px] font-black tabular-nums leading-none mt-1">{formatCurrency(totalSelectedBank)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest mb-1">Nomor Manual</span>
                <Input 
                   value={manualRef}
                   onChange={(e) => setManualRef(e.target.value)}
                   placeholder="No. Ref / Group"
                   className="h-7 w-28 bg-white/5 border-white/10 text-white text-[9px] font-black placeholder:text-slate-500 rounded-lg focus:ring-emerald-500"
                />
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest mb-1">Status Balance</span>
                <div className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-all border",
                  isBalancedForDisplay ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-white/5 text-slate-400 border-white/10"
                )}>
                  {isBalancedForDisplay ? (
                    <CheckCircle2 size={10} className="animate-pulse" />
                  ) : (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                  )}
                  <span className="text-[9px] font-black tabular-nums leading-none">
                    {isBalancedForDisplay ? "SINKRON" : "BELUM BALANCE"}
                  </span>
                </div>
              </div>
              
              <Button 
                onClick={smartGroupValue !== null ? handleBatchSmartGroupRekon : handleBulkMatch}
                disabled={(selectedBkuIds.length === 0 && Object.keys(manualPairingMap).length === 0) || selectedBankIds.length === 0 || isMatching}
                className={cn(
                  "h-9 px-6 rounded-lg font-black text-[9px] uppercase tracking-widest transition-all shadow-xl",
                  (isBalancedForDisplay || (smartGroupValue !== null && Object.keys(manualPairingMap).length > 0)) && selectedBankIds.length > 0
                    ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-900/20 active:scale-95" 
                    : "bg-white/10 text-white/50 cursor-not-allowed opacity-50"
                )}
              >
                {isMatching || batchProgress.isOpen ? <Loader2 className="animate-spin mr-2" size={12} /> : (
                  smartGroupValue !== null ? <Sparkles className="mr-2 text-amber-400" size={12} /> : (isBalancedForDisplay ? <Zap className="mr-2 fill-current" size={12} /> : <Lock size={12} className="mr-2" />)
                )}
                {smartGroupValue !== null ? `Rekon Massal (${selectedBankIds.length})` : (isBalancedForDisplay ? "Eksekusi Rekon" : "Kunci Balance")}
              </Button>

              <Button 
                variant="ghost"
                onClick={() => {
                  setSelectedBkuIds([]);
                  setSelectedBankIds([]);
                  setSmartGroupValue(null);
                  setManualPairingMap({});
                }}
                className="h-9 px-3 rounded-lg font-black text-[9px] uppercase tracking-widest text-slate-400 hover:text-white hover:bg-white/5"
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* SMART MATCH DIALOG (BY REFERENCE) */}
      <Dialog open={refMatchModal.isOpen} onOpenChange={(open) => setRefMatchModal(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-indigo-600 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md border border-white/30">
                <Hash size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest">Smart Match</h2>
              <p className="text-indigo-100 text-[10px] font-bold mt-2 uppercase tracking-tight">Pencocokan Otomatis Berdasarkan Nomor Bukti / SP2D</p>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Masukkan Nomor Referensi</label>
              <div className="relative">
                <Input 
                  placeholder="Contoh: 00123/SP2D/..." 
                  className="h-14 pl-4 bg-slate-50 border-slate-100 rounded-2xl font-black text-slate-700 placeholder:text-slate-300 focus:ring-indigo-500 focus:border-indigo-500 transition-all uppercase"
                  value={refMatchModal.value}
                  onChange={(e) => setRefMatchModal(prev => ({ ...prev, value: e.target.value }))}
                />
              </div>
              <p className="text-[9px] font-bold text-slate-400 italic mt-2 px-1">
                Sistem akan mencari mutasi bank dan data BKU yang mengandung nomor ini dan melakukan pencocokan otomatis secara masal.
              </p>
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={handleRefMatch}
                disabled={!refMatchModal.value || isMatching}
                className="flex-1 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all active:scale-95"
              >
                {isMatching ? <Loader2 className="animate-spin mr-2" /> : <Zap className="mr-2 fill-current" size={14} />}
                Mulai Pencocokan
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setRefMatchModal({ isOpen: false, value: '' })}
                className="h-14 px-6 rounded-2xl font-black text-[10px] uppercase text-slate-400 hover:bg-slate-50"
              >
                Batal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CONFIRM SMART MATCH DIALOG */}
      <Dialog open={confirmSmartMatch} onOpenChange={setConfirmSmartMatch}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-[#101828] p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md border border-white/10">
                <Sparkles size={32} className="text-indigo-400" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest">Aktivasi Smart Engine</h2>
              <p className="text-slate-400 text-[10px] font-bold mt-2 uppercase tracking-tight">Otomasi Rekonsiliasi Berbasis AI</p>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="space-y-4">
               <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center shrink-0 mt-0.5">
                     <CheckCircle2 size={12} className="text-emerald-600" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase">
                     Sistem akan mencocokkan transaksi dengan nilai <span className="text-indigo-600 font-black italic underline">Identik</span> (Bruto atau Netto).
                  </p>
               </div>
               <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center shrink-0 mt-0.5">
                     <Calendar size={12} className="text-indigo-600" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase">
                     Rentang waktu pencairan bank maksimal <span className="text-indigo-600 font-black italic underline">H+7</span> dari tanggal BKU.
                  </p>
               </div>
               <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-full bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                     <ShieldCheck size={12} className="text-amber-600" />
                  </div>
                  <p className="text-[10px] font-bold text-slate-600 leading-relaxed uppercase">
                     Hanya mengeksekusi jika ditemukan <span className="text-amber-600 font-black italic underline">Satu Kandidat Unik</span> untuk menjaga akurasi.
                  </p>
               </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button 
                onClick={() => {
                   setConfirmSmartMatch(false);
                   handleMagicMatch();
                }}
                className="flex-1 h-14 bg-[#101828] hover:bg-slate-800 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95"
              >
                Mulai Proses
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setConfirmSmartMatch(false)}
                className="h-14 px-6 rounded-2xl font-black text-[10px] uppercase text-slate-400 hover:bg-slate-50"
              >
                Batal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MAGIC MATCH PROGRESS DIALOG */}
      <Dialog open={!!magicMatchProgress} onOpenChange={(open) => !open && setMagicMatchProgress(null)}>
        <DialogContent className="max-w-md bg-[#101828] text-white rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="p-8 space-y-8 relative overflow-hidden">
             {/* Background glows */}
             <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-3xl -mr-32 -mt-32 animate-pulse"></div>
             <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-600/20 rounded-full blur-3xl -ml-32 -mb-32 animate-pulse" style={{ animationDelay: '1s' }}></div>

             <div className="relative z-10 flex flex-col items-center text-center space-y-6">
                <div className="w-24 h-24 relative flex items-center justify-center">
                   <div className="absolute inset-0 bg-indigo-600/20 rounded-3xl rotate-12 animate-reverse-spin"></div>
                   <div className="absolute inset-0 bg-emerald-600/20 rounded-3xl -rotate-12 animate-spin"></div>
                   <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-2xl flex items-center justify-center border border-white/20 shadow-xl">
                      <Sparkles size={32} className="text-indigo-400 animate-bounce" />
                   </div>
                </div>

                <div className="space-y-2">
                   <h2 className="text-2xl font-black uppercase tracking-widest italic">Magic Engine</h2>
                   <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">Automated Intelligence in Progress</p>
                </div>

                {magicMatchProgress?.current >= magicMatchProgress?.total && magicMatchProgress?.status === 'done' ? (
                   <div className="w-full space-y-6 animate-in zoom-in duration-500">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
                         <p className="text-emerald-400 text-3xl font-black tabular-nums">{magicMatchProgress.success}</p>
                         <p className="text-emerald-500/60 text-[10px] font-black uppercase mt-1 tracking-widest">Transaksi Berhasil Dicocokkan</p>
                      </div>
                      <Button 
                         onClick={() => setMagicMatchProgress(null)}
                         className="w-full h-14 bg-white text-[#101828] hover:bg-slate-100 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all"
                      >
                         Selesai & Tutup
                      </Button>
                   </div>
                ) : (
                   <div className="w-full space-y-4">
                      <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                         <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, Math.floor((magicMatchProgress?.current || 0) / (magicMatchProgress?.total || 1) * 100))}%` }}
                            className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500"
                         />
                      </div>
                      <div className="flex justify-between items-center px-1">
                         <div className="flex flex-col items-start">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">
                               {magicMatchProgress?.message || 'Scanning Database...'}
                            </span>
                            {magicMatchProgress?.total > 0 && (
                               <span className="text-[9px] font-bold text-slate-500 uppercase mt-1">
                                  Progress: {magicMatchProgress.current} / {magicMatchProgress.total} Transaksi
                               </span>
                            )}
                         </div>
                         <span className="text-lg font-black text-indigo-400 tabular-nums">
                            {Math.min(100, Math.floor((magicMatchProgress?.current || 0) / (magicMatchProgress?.total || 1) * 100))}%
                         </span>
                      </div>
                   </div>
                )}
             </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* RESET ALL DIALOG */}
      <Dialog open={resetModal.isOpen} onOpenChange={(open) => setResetModal(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-rose-600 p-8 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-md border border-white/30">
                <AlertTriangle size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-black uppercase tracking-widest text-white">Reset Seluruh Data</h2>
              <p className="text-rose-100 text-[10px] font-bold mt-2 uppercase tracking-tight">Tindakan ini tidak dapat dibatalkan</p>
            </div>
          </div>
          
          <div className="p-8 space-y-6">
            <div className="bg-rose-50 border border-rose-100 rounded-2xl p-4 text-center">
              <p className="text-[10px] font-bold text-rose-800 uppercase leading-relaxed">
                Anda akan menghapus semua status rekonsiliasi tahun {new Date().getFullYear()}. <br/>
                Ketik <span className="font-black underline">RESET REKON {new Date().getFullYear()}</span> untuk konfirmasi.
              </p>
            </div>

            <div className="space-y-2">
              <Input 
                placeholder={`RESET REKON ${new Date().getFullYear()}`}
                className="h-14 text-center bg-slate-50 border-slate-100 rounded-2xl font-black text-slate-700 placeholder:text-slate-300 focus:ring-rose-500 focus:border-rose-500 transition-all"
                value={resetModal.value}
                onChange={(e) => setResetModal(prev => ({ ...prev, value: e.target.value }))}
              />
            </div>

            <div className="flex gap-3">
              <Button 
                onClick={async () => {
                  const success = await handleResetAll(resetModal.value);
                  if (success) setResetModal({ isOpen: false, value: '' });
                }}
                disabled={resetModal.value !== `RESET REKON ${new Date().getFullYear()}` || isMatching}
                className="flex-1 h-14 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-200 transition-all active:scale-95"
              >
                {isMatching ? <Loader2 className="animate-spin mr-2" /> : <RefreshCw className="mr-2" size={14} />}
                Reset Permanen
              </Button>
              <Button 
                variant="ghost" 
                onClick={() => setResetModal({ isOpen: false, value: '' })}
                className="h-14 px-6 rounded-2xl font-black text-[10px] uppercase text-slate-400 hover:bg-slate-50"
              >
                Batal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* FOOTER PAGER */}
      <div className="flex flex-col md:flex-row justify-between items-center py-6 border-t border-slate-100 mt-10">
         <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            BPKAD Decision Support System — Reconciliation Engine v2.0
         </p>
         <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
               <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
               <span className="text-[10px] font-black text-slate-700 uppercase">System Integrated</span>
            </div>
         </div>
      </div>
      {/* BATCH PROGRESS OVERLAY */}
      <AnimatePresence>
        {batchProgress.isOpen && (
          <motion.div 
             initial={{ opacity: 0, y: 50 }}
             animate={{ opacity: 1, y: 0 }}
             exit={{ opacity: 0, y: 50 }}
             className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] w-96"
          >
             <Card className="bg-[#101828] border-white/10 text-white p-6 shadow-2xl rounded-2xl">
                <div className="flex flex-col items-center text-center space-y-4">
                   <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/20">
                      <RefreshCw size={24} className="text-emerald-400 animate-spin" />
                   </div>
                    <div className="space-y-1">
                       <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400">Verifikasi Integritas</h3>
                       <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">Memproses Pasangan Data Autentik...</p>
                    </div>
                    <div className="w-full space-y-3">
                       <div className="flex justify-between items-center px-1">
                          <div className="flex flex-col items-start">
                             <span className="text-[8px] font-black text-slate-500 uppercase">Processing Pair</span>
                             <span className="text-[10px] font-black text-white">Bank ID: #{selectedBankIds[batchProgress.current]?.toString().substring(0,8) || '-'}</span>
                          </div>
                          <div className="flex flex-col items-end">
                             <span className="text-[8px] font-black text-slate-500 uppercase">Progress</span>
                             <span className="text-[10px] font-black text-emerald-400">{batchProgress.current} / {batchProgress.total}</span>
                          </div>
                       </div>
                       <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden border border-white/10 p-0.5">
                          <div 
                             className="h-full bg-gradient-to-r from-emerald-600 to-teal-400 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" 
                             style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
                          />
                       </div>
                    </div>
                </div>
             </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


