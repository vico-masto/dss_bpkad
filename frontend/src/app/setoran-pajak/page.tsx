'use client';

import { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Save, 
  Loader2, 
  Calendar, 
  Banknote,
  CheckCircle2,
  AlertCircle,
  FileText,
  Search,
  ArrowUpRight,
  Clock,
  Activity,
  Database,
  ArrowRight,
  FileSpreadsheet,
  FileUp,
  Printer,
  LayoutTemplate,
  RefreshCw,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import api from '@/lib/api';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import useSWR from 'swr';
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { exportToExcel, exportToPDF, downloadTemplate } from '@/lib/exportUtils';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

export default function SetoranPajakPage() {
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit] = useState(5);
  const [searchHistory, setSearchHistory] = useState('');
  
  const { data: historyResponse, isLoading: loading, mutate: refreshHistory } = useSWR(
    ['/dss/setoran-pajak', { page: historyPage, limit: historyLimit, search: searchHistory }],
    ([url, params]) => fetcher(url, params)
  );

  const { data: sumberDanaList = [] } = useSWR('/dss/sumber-dana', (url) => api.get(url).then(res => res.data));
  
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    nomor_ntpn: '',
    uraian: '',
    id_sumber_dana: '',
    nilai: 0,
    jenis_pajak: 'PPN'
  });
  const [editId, setEditId] = useState<string | null>(null);
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    variant: 'danger' | 'info' | 'warning';
  }>({
    isOpen: false,
    title: '',
    description: '',
    onConfirm: () => {},
    variant: 'info'
  });

  const historyData = historyResponse?.data || [];
  const pagination = historyResponse?.pagination || { totalPages: 1, totalData: 0 };

  const handleExportExcel = () => {
    const exportData = historyData.map((item: any) => ({
      'Tanggal': format(new Date(item.tanggal), 'yyyy-MM-dd'),
      'NTPN / Bukti': item.nomor_bukti,
      'Sumber Dana': item.id_sumber_dana,
      'Uraian': item.uraian,
      'Nilai (Rp)': item.nilai
    }));
    exportToExcel(exportData, `Arsip_Pajak_${format(new Date(), 'yyyyMMdd_HHmm')}`);
  };

  const handleExportPDF = () => {
    const headers = ['Tgl', 'NTPN / Bukti', 'Sumber', 'Nilai (Rp)'];
    const body = historyData.map((item: any) => [
      format(new Date(item.tanggal), 'dd/MM/yy'),
      item.nomor_bukti,
      item.id_sumber_dana,
      formatCurrency(item.nilai)
    ]);
    exportToPDF(headers, body, `Arsip_Pajak_${format(new Date(), 'yyyyMMdd_HHmm')}`, 'LAPORAN ARSIP SETORAN PAJAK (NTPN)');
  };

  const handleDownloadTemplate = () => {
    downloadTemplate(['tanggal', 'nomor_bukti', 'id_sumber_dana', 'nilai', 'uraian'], 'Template_Import_Pajak');
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);
        
        setConfirmState({
          isOpen: true,
          title: 'Konfirmasi Impor Pajak?',
          description: `Apakah Anda yakin ingin mengimpor ${data.length} baris data setoran pajak dari file Excel ini?`,
          variant: 'info',
          onConfirm: async () => {
            setConfirmState(prev => ({ ...prev, isOpen: false }));
            setSaving(true);
            let successCount = 0;
            let failCount = 0;

            for (const item of data as any[]) {
              try {
                const getVal = (keyTarget: string) => {
                  const found = Object.keys(item).find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === keyTarget.toLowerCase().replace(/[^a-z0-9]/g, ''));
                  return found ? item[found] : '';
                };

                let rawDate = getVal('tanggal');
                let dateVal = new Date().toISOString().split('T')[0];
                  if (rawDate instanceof Date) {
                    const y = rawDate.getFullYear();
                    const m = String(rawDate.getMonth() + 1).padStart(2, '0');
                    const d = String(rawDate.getDate()).padStart(2, '0');
                    dateVal = `${y}-${m}-${d}`;
                  } else if (typeof rawDate === 'number') {
                    const jsDate = new Date((rawDate - 25569) * 86400 * 1000);
                    const y = jsDate.getFullYear();
                    const m = String(jsDate.getMonth() + 1).padStart(2, '0');
                    const d = String(jsDate.getDate()).padStart(2, '0');
                    dateVal = `${y}-${m}-${d}`;
                  }

                await api.post('/dss/setoran-pajak', {
                  tanggal: dateVal,
                  nomor_bukti: getVal('nomorbukti') || `NTPN-${Date.now()}`,
                  id_sumber_dana: getVal('idsumberdana') || 'SD-LAINNYA',
                  nilai: parseFloat(getVal('nilai')) || 0,
                  uraian: getVal('uraian') || 'Setoran Pajak (Import)'
                });
                successCount++;
              } catch (err) {
                failCount++;
              }
            }
            if (failCount > 0) {
               toast.warning(`Impor selesai: ${successCount} berhasil, ${failCount} gagal.`);
            } else {
               toast.success(`Berhasil mengimpor ${successCount} data pajak.`);
            }
            refreshHistory();
            setSaving(false);
          }
        });
      } catch (err) {
        toast.error('Gagal impor pajak. Periksa format template.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        tanggal: formData.tanggal,
        nomor_bukti: formData.nomor_ntpn,
        uraian: formData.uraian,
        id_sumber_dana: formData.id_sumber_dana,
        nilai: formData.nilai
      };

      if (editId) {
        await api.put(`/dss/setoran-pajak/${editId}`, payload);
        toast.success('Data setoran pajak berhasil diperbarui');
      } else {
        await api.post('/dss/setoran-pajak', payload);
        toast.success('Setoran pajak berhasil direkam.');
      }
      
      setFormData({
        tanggal: new Date().toISOString().split('T')[0],
        nomor_ntpn: '',
        uraian: '',
        id_sumber_dana: '',
        nilai: 0,
        jenis_pajak: 'PPN'
      });
      setEditId(null);
      refreshHistory();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan setoran pajak');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: any) => {
    setFormData({
      tanggal: format(new Date(item.tanggal), 'yyyy-MM-dd'),
      nomor_ntpn: item.nomor_bukti,
      uraian: item.uraian,
      id_sumber_dana: item.id_sumber_dana,
      nilai: item.nilai,
      jenis_pajak: item.jenis_pajak || 'PPN'
    });
    setEditId(item.id);
  };

  const handleDelete = async (id: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Hapus Bukti Setor?',
      description: 'Apakah Anda yakin ingin menghapus data setoran pajak ini? Penghapusan akan mempengaruhi laporan audit NTPN.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/dss/setoran-pajak/${id}`);
          toast.success('Data berhasil dihapus');
          refreshHistory();
        } catch (err) { toast.error('Gagal menghapus data'); }
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <SummaryItem 
          label="Total Arsip Pajak" 
          value={pagination.totalData} 
          color="text-fin-text-primary" 
          bg="bg-fin-page"
          icon={<CreditCard size={18} />} 
          isCurrency={false}
        />
        <SummaryItem 
          label="Tahun Anggaran" 
          value={new Date().getFullYear()} 
          color="text-[#175CD3]" 
          bg="bg-[#EFF8FF]"
          icon={<FileText size={18} />} 
          isCurrency={false}
        />
        <SummaryItem 
          label="Jenis Pajak" 
          value="PPN/PPh" 
          color="text-[#027A48]" 
          bg="bg-[#ECFDF3]"
          icon={<Activity size={18} />} 
          isCurrency={false}
        />
        <SummaryItem 
          label="Sistem Audit" 
          value="NTPN-VALID" 
          color="text-[#B54708]" 
          bg="bg-[#FFFAEB]"
          icon={<Calendar size={18} />} 
          isCurrency={false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8">
          <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-white">
            <div className="p-6 border-b border-[#F2F4F7] bg-fin-page/50 flex flex-row items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-ds-primary rounded-lg flex items-center justify-center text-white">
                  <ArrowUpRight size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-fin-text-primary tracking-tight">Formulir Setoran Pajak</h3>
                  <p className="text-xs font-medium text-fin-text-secondary">Input Bukti Bayar NTPN / SSP Tahun {new Date().getFullYear()}</p>
                </div>
              </div>
              {editId && <Badge variant="outline" className="bg-[#FFFAEB] text-[#B54708] border-[#FEDF89] px-3 py-1 rounded-lg text-[10px] font-semibold">Mode Edit Aktif</Badge>}
            </div>
            
            <CardContent className="p-8 space-y-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-fin-text-secondary ml-1">Jenis Pajak</label>
                    <Combobox
                      value={formData.jenis_pajak}
                      onValueChange={(v) => setFormData({...formData, jenis_pajak: v})}
                      placeholder="Pilih jenis pajak..."
                      className="h-11"
                      options={[
                        { value: 'PPN', label: 'PPN (Pajak Pertambahan Nilai)' },
                        { value: 'PPH_21', label: 'PPh 21 (Pajak Penghasilan)' },
                        { value: 'PPH_22', label: 'PPh 22 (Pajak Penghasilan)' },
                        { value: 'PPH_23', label: 'PPh 23 (Pajak Penghasilan)' },
                        { value: 'PAJAK_DAERAH', label: 'Pajak Daerah' },
                      ]}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-fin-text-secondary ml-1">Tanggal Pembayaran</label>
                    <Input type="date" className="h-11 bg-[#F9FAFB] border-[#EAECF0] rounded-lg focus-visible:ring-ds-focus-ring focus-visible:border-ds-focus-ring font-bold text-sm text-fin-text-primary" value={formData.tanggal} onChange={(e) => setFormData({...formData, tanggal: e.target.value})} required />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-fin-text-secondary ml-1">Nomor NTPN / Kode Billing</label>
                  <Input type="text" placeholder="Masukkan 16 digit kode NTPN..." className="h-11 bg-[#F9FAFB] border-[#EAECF0] rounded-lg focus-visible:ring-ds-focus-ring focus-visible:border-ds-focus-ring font-bold text-sm text-fin-text-primary" value={formData.nomor_ntpn} onChange={(e) => setFormData({...formData, nomor_ntpn: e.target.value})} required />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-fin-text-secondary ml-1">Sumber Dana Pengurang</label>
                  <Combobox
                    value={formData.id_sumber_dana}
                    onValueChange={(v) => setFormData({...formData, id_sumber_dana: v})}
                    placeholder="Pilih sumber dana pengurang..."
                    className="h-11"
                    options={sumberDanaList.map((sd: any) => ({ value: sd.id, label: sd.nama }))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-fin-text-secondary ml-1">Nilai Setoran (Rp)</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-fin-text-muted font-bold text-sm">Rp</div>
                    <Input 
                      type="text" 
                      className="h-14 pl-12 bg-[#F9FAFB] border-[#EAECF0] rounded-lg focus-visible:ring-ds-focus-ring focus-visible:border-ds-focus-ring font-bold text-fin-text-primary text-2xl tracking-tight transition-all" 
                      value={formatNumber(formData.nilai)} 
                      onChange={(e) => setFormData({...formData, nilai: parseNumber(e.target.value)})} 
                      required 
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-fin-text-secondary ml-1">Keterangan Tambahan</label>
                  <Textarea className="px-4 py-3 bg-[#F9FAFB] border-[#EAECF0] rounded-lg focus-visible:ring-ds-focus-ring focus-visible:border-ds-focus-ring min-h-[100px] font-medium text-sm text-fin-text-primary" placeholder="Contoh: Setoran PPN atas SP2D nomor..." value={formData.uraian} onChange={(e) => setFormData({...formData, uraian: e.target.value})} required />
                </div>

                <div className="pt-4 flex flex-col gap-3">
                  <Button 
                    type="submit" 
                    disabled={saving} 
                    className="h-12 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-lg font-bold shadow-sm transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="animate-spin" size={20} /> : editId ? <RefreshCw size={20} /> : <Save size={20} />}
                    <span className="uppercase tracking-widest text-[10px]">{editId ? 'Perbarui Setoran Pajak' : 'Simpan Transaksi Pajak'}</span>
                  </Button>
                  {editId && (
                    <Button 
                      variant="ghost"
                      onClick={() => { setEditId(null); setFormData({ tanggal: new Date().toISOString().split('T')[0], nomor_ntpn: '', uraian: '', id_sumber_dana: '', nilai: 0, jenis_pajak: 'PPN' }); }} 
                      className="h-10 text-xs font-bold text-[#F04438] hover:bg-[#FEF3F2] rounded-lg transition-all"
                    >
                      Batalkan Mode Edit
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Compact History Sidebar (Standardized) */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="rounded-xl border border-fin-border shadow-sm bg-white overflow-hidden">
              <div className="p-6 border-b border-[#F2F4F7] bg-fin-page/50 flex flex-col gap-4">
                 <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-fin-text-secondary flex items-center uppercase tracking-wider">
                      <Clock size={16} className="mr-2 text-fin-text-muted" />
                      Riwayat NTPN
                    </h3>
                    <div className="flex gap-2">
                       <Button variant="ghost" size="icon" onClick={() => refreshHistory()} className="h-8 w-8 rounded-lg hover:bg-white transition-all"><RefreshCw size={14} className={cn(loading && "animate-spin")} /></Button>
                    </div>
                 </div>
                 <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fin-text-muted" size={14} />
                    <Input 
                      placeholder="Cari NTPN / Uraian..." 
                      className="h-9 pl-9 bg-white border-[#EAECF0] text-xs font-medium rounded-lg"
                      value={searchHistory}
                      onChange={(e) => { setSearchHistory(e.target.value); setHistoryPage(1); }}
                    />
                 </div>
              </div>

             <div className="p-6 space-y-4">
               {loading && !historyResponse ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-3">
                    <Loader2 className="animate-spin text-[#2E90FA]" size={32} />
                    <span className="text-xs font-bold text-fin-text-muted uppercase tracking-widest">Sinkronisasi...</span>
                  </div>
               ) : historyData.length === 0 ? (
                  <div className="py-10 text-center space-y-3">
                    <Database className="mx-auto text-[#F2F4F7]" size={48} />
                    <p className="text-fin-text-muted text-xs font-medium uppercase tracking-widest">Data Kosong</p>
                  </div>
               ) : (
                 historyData.map((h: any, i: number) => (
                   <div key={i} className={cn("group p-4 bg-white rounded-xl border border-fin-border hover:border-[#2E90FA] hover:shadow-sm transition-all cursor-pointer", editId === h.id && "border-[#2E90FA] bg-[#EFF8FF]/30")}>
                      <div className="flex justify-between items-start mb-2">
                         <Badge variant="outline" className="text-[9px] font-bold text-[#344054] truncate max-w-[120px] bg-[#F9FAFB] border-[#EAECF0] px-2 py-0.5 rounded-lg">
                           {h.nomor_bukti}
                         </Badge>
                         <span className="text-[9px] font-semibold text-fin-text-muted">{format(new Date(h.tanggal), 'dd/MM/yy')}</span>
                      </div>
                      <p className="text-[10px] text-fin-text-secondary line-clamp-1 mb-3 font-medium uppercase">{h.uraian}</p>
                      <div className="flex justify-between items-center">
                         <span className="text-sm font-bold text-fin-text-primary tabular-nums">{formatCurrency(h.nilai)}</span>
                         <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           <Button variant="ghost" size="icon" onClick={() => handleEdit(h)} className="h-7 w-7 rounded-lg hover:bg-[#EFF8FF] text-fin-text-muted hover:text-[#175CD3] transition-colors"><Edit size={12} /></Button>
                           <Button variant="ghost" size="icon" onClick={() => handleDelete(h.id)} className="h-7 w-7 rounded-lg hover:bg-[#FEF3F2] text-fin-text-muted hover:text-[#B42318] transition-colors"><Trash2 size={12} /></Button>
                         </div>
                      </div>
                   </div>
                 ))
               )}
             </div>

             <div className="p-4 border-t border-[#F2F4F7] bg-fin-page/50 flex items-center justify-between">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={historyPage === 1 || loading}
                  onClick={() => setHistoryPage(p => p - 1)}
                  className="h-8 text-[10px] font-bold uppercase tracking-wider"
                >
                  <ChevronLeft size={14} className="mr-1" /> Prev
                </Button>
                <span className="text-[10px] font-bold text-fin-text-secondary">Hal {historyPage} / {pagination.totalPages}</span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  disabled={historyPage === pagination.totalPages || loading}
                  onClick={() => setHistoryPage(p => p + 1)}
                  className="h-8 text-[10px] font-bold uppercase tracking-wider"
                >
                  Next <ChevronRight size={14} className="ml-1" />
                </Button>
             </div>
          </Card>

          <Card className="p-6 bg-ds-primary text-white rounded-xl border-none shadow-lg relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform duration-700">
               <Activity size={100} />
             </div>
             <div className="flex items-center gap-4 relative z-10">
                <div className="w-10 h-10 rounded-lg bg-[#2E90FA] text-white flex items-center justify-center shadow-lg">
                  <Activity size={20} />
                </div>
                <div>
                   <p className="text-[10px] text-[#2E90FA] font-bold uppercase tracking-wider">Validasi Audit</p>
                   <p className="text-xs text-white/70 font-medium mt-1 leading-relaxed">Pastikan NTPN valid untuk menghindari duplikasi data setoran pajak di sistem BPKAD.</p>
                </div>
             </div>
          </Card>
        </div>
      </div>
      <ConfirmDialog 
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmState.onConfirm}
        title={confirmState.title}
        description={confirmState.description}
        variant={confirmState.variant}
      />
    </div>
  );
}

function SummaryItem({ label, value, color, icon, bg, isCurrency = true }: any) {
  return (
    <Card className="p-4 sm:p-6 rounded-xl border border-fin-border shadow-sm bg-white transition-all hover:border-[#2E90FA] overflow-hidden">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", bg, color)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider mb-1 truncate">{label}</p>
          <p className={cn("text-base sm:text-lg lg:text-xl font-bold tracking-tight tabular-nums truncate", color)} title={isCurrency ? formatCurrency(value) : value}>
            {isCurrency ? formatCurrency(value) : value}
          </p>
        </div>
      </div>
    </Card>
  );
}
