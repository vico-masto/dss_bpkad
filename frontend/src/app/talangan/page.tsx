'use client';

import { useState, useEffect } from 'react';
import { 
  ShieldAlert, 
  ShieldCheck, 
  PlusSquare, 
  Save, 
  Loader2, 
  History,
  Activity,
  ArrowRight,
  RefreshCw,
  AlertCircle,
  Banknote,
  CheckCircle2,
  X,
  CreditCard,
  ArrowUpRight,
  Edit,
  Trash2
} from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import api from '@/lib/api';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell 
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export default function JurnalTalanganPage() {
  const [talanganList, setTalanganList] = useState([]);
  const [sp2dTalangan, setSp2dTalangan] = useState([]);
  const [sumberDanaList, setSumberDanaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const [formData, setFormData] = useState({
    id_sumber_dana_asal: '',
    id_sumber_dana_talangan: '',
    nilai: 0,
    keterangan: ''
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

  useEffect(() => {
    fetchData();
    fetchSumberDana();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [talRes, sp2dRes] = await Promise.all([
        api.get('/dss/talangan'),
        api.get('/sp2d', { params: { status: 'Talangan' } })
      ]);
      setTalanganList(talRes.data || []);
      setSp2dTalangan(sp2dRes.data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSumberDana = async () => {
    try {
      const res = await api.get('/dss/sumber-dana');
      setSumberDanaList(res.data);
    } catch (err) {}
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.id_sumber_dana_asal === formData.id_sumber_dana_talangan) {
      return toast.error('Sumber dana asal dan talangan tidak boleh sama');
    }
    setSaving(true);
    try {
      if (editId) {
        await api.put(`/dss/talangan/${editId}`, formData);
        toast.success('Jurnal Diperbarui', { description: 'Data jurnal talangan telah berhasil diperbarui.' });
      } else {
        await api.post('/dss/talangan', formData);
        toast.success('Jurnal Direkam', { description: 'Pencatatan dana talangan manual telah berhasil dilakukan.' });
      }
      setFormData({ id_sumber_dana_asal: '', id_sumber_dana_talangan: '', nilai: 0, keterangan: '' });
      setEditId(null);
      setShowModal(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan jurnal');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (item: any) => {
    setFormData({
      id_sumber_dana_asal: item.id_sumber_dana_asal,
      id_sumber_dana_talangan: item.id_sumber_dana_talangan,
      nilai: item.nilai,
      keterangan: item.keterangan || ''
    });
    setEditId(item.id);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Hapus Jurnal Talangan?',
      description: 'Apakah Anda yakin ingin menghapus catatan talangan ini secara permanen? Data yang dihapus tidak dapat dikembalikan.',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await api.delete(`/dss/talangan/${id}`);
          toast.success('Jurnal Dihapus', { description: 'Data jurnal talangan telah dihapus secara permanen.' });
          fetchData();
        } catch (err) { toast.error('Gagal menghapus jurnal'); }
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const handleSettle = async (id: string) => {
    setConfirmState({
      isOpen: true,
      title: 'Konfirmasi Pelunasan?',
      description: 'Apakah Anda yakin ingin menyatakan talangan ini LUNAS secara manual? Tindakan ini akan menutup catatan hutang kas.',
      variant: 'info',
      onConfirm: async () => {
        try {
          await api.post(`/dss/talangan/${id}/settle`);
          toast.success('Talangan Lunas', { description: 'Status talangan telah diubah menjadi lunas secara manual.' });
          fetchData();
        } catch (err) { toast.error('Gagal melunasi talangan'); }
        setConfirmState(prev => ({ ...prev, isOpen: false }));
      }
    });
  };

  const activeTalangan = talanganList.filter((t: any) => t.status === 'BELUM');
  const settledTalangan = talanganList.filter((t: any) => t.status === 'SELESAI');
  const totalActiveVal = activeTalangan.reduce((acc, t: any) => acc + parseFloat(t.nilai), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-rose-600 rounded-xl flex items-center justify-center text-white shadow-xl shadow-rose-900/20">
            <ShieldAlert size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight leading-none">Jurnal Dana Talangan</h1>
            <p className="text-slate-400 font-semibold text-[11px] mt-1.5">Inter-Fund Loan Registry & Tracking</p>
          </div>
        </div>
        
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center space-x-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold text-[11px] hover:bg-slate-800 transition-all shadow-xl shadow-slate-900/20"
        >
           <PlusSquare size={16} />
           <span>Jurnal Manual</span>
        </button>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <SummaryItem 
          label="Talangan Aktif" 
          value={`${activeTalangan.length} Item`} 
          color="text-[#B42318]" 
          bg="bg-[#FEF3F2]"
          icon={<Activity size={18} />} 
          isCurrency={false}
        />
        <SummaryItem 
          label="Telah Dilunasi" 
          value={`${settledTalangan.length} Item`} 
          color="text-[#027A48]" 
          bg="bg-[#ECFDF3]"
          icon={<ShieldCheck size={18} />} 
          isCurrency={false}
        />
        <SummaryItem 
          label="Total Hutang Kas" 
          value={totalActiveVal} 
          color="text-fin-text-primary" 
          bg="bg-fin-page"
          icon={<Banknote size={18} />} 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-4">
           <Card className="rounded-xl border border-fin-border shadow-sm bg-white overflow-hidden h-full">
              <div className="p-6 border-b border-[#F2F4F7] bg-fin-page/50">
                <h3 className="text-xs font-bold text-fin-text-primary flex items-center uppercase tracking-wider">
                   <AlertCircle className="mr-2 text-[#F04438]" size={16} />
                   SP2D Bertanda Talangan
                </h3>
              </div>
              
              <div className="p-6 space-y-4">
                 {loading ? (
                   <div className="py-20 flex flex-col items-center justify-center text-fin-text-muted">
                      <Loader2 className="animate-spin mb-4" size={32} />
                      <p className="text-[10px] font-bold uppercase tracking-widest">Memuat arsip...</p>
                   </div>
                 ) : sp2dTalangan.length === 0 ? (
                   <div className="py-20 text-center text-fin-text-muted">
                      <CheckCircle2 className="mx-auto mb-3 opacity-20" size={48} />
                      <p className="text-[10px] font-bold uppercase tracking-widest">Semua SP2D Aman</p>
                   </div>
                 ) : (
                   sp2dTalangan.map((s: any) => (
                     <div key={s.id} className="p-4 bg-[#FEF3F2] border border-[#FECDCA] rounded-xl group hover:bg-white transition-all">
                        <div className="flex justify-between items-start mb-2">
                           <span className="text-[10px] font-bold text-[#B42318]">{s.nomor}</span>
                           <span className="text-[9px] font-semibold text-[#F04438]">{format(new Date(s.tanggal), 'dd/MM/yy')}</span>
                        </div>
                        <p className="text-xs font-medium text-fin-text-secondary truncate mb-3">{s.uraian}</p>
                        <div className="flex justify-between items-center">
                           <span className="text-[11px] font-bold text-fin-text-primary tabular-nums">{formatCurrency(s.nilai_bruto)}</span>
                           <Badge className="bg-[#B42318] text-white text-[8px] font-bold rounded px-1.5 py-0">TALANGAN</Badge>
                        </div>
                     </div>
                   ))
                 )}
              </div>
           </Card>
        </div>

        <div className="lg:col-span-8">
           <Card className="rounded-xl border border-fin-border shadow-sm bg-white overflow-hidden">
              <div className="p-6 border-b border-[#F2F4F7] bg-fin-page/50 flex justify-between items-center">
                 <h3 className="text-xs font-bold text-fin-text-primary uppercase tracking-wider">Histori Jurnal Talangan</h3>
                 <button onClick={fetchData} className="p-2 hover:bg-white rounded-lg transition-all text-fin-text-muted hover:text-[#2E90FA]">
                    <RefreshCw size={14} className={cn(loading && "animate-spin")} />
                 </button>
              </div>

              <div className="overflow-x-auto">
                 <Table>
                    <TableHeader className="bg-fin-page">
                       <TableRow className="border-b border-fin-border hover:bg-transparent">
                          <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Tanggal</TableHead>
                          <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Sumber Asal</TableHead>
                          <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-center"><ArrowRight size={12} className="mx-auto" /></TableHead>
                          <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Sumber Talangan</TableHead>
                          <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-right">Nilai (Rp)</TableHead>
                          <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-center">Status</TableHead>
                          <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-center">Aksi</TableHead>
                       </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-[#E9ECEF]">
                       {talanganList.map((t: any) => (
                         <TableRow key={t.id} className="hover:bg-fin-page transition-colors group">
                            <TableCell className="px-6 py-4 text-xs font-semibold text-[#667085]">{format(new Date(t.tanggal), 'dd/MM/yy')}</TableCell>
                            <TableCell className="px-6 py-4 text-xs font-bold text-fin-text-primary uppercase">{t.id_sumber_dana_asal}</TableCell>
                            <TableCell className="px-6 py-4 text-center"><ArrowRight size={12} className="mx-auto text-[#D0D5DD]" /></TableCell>
                            <TableCell className="px-6 py-4 text-xs font-bold text-fin-text-primary uppercase">{t.id_sumber_dana_talangan}</TableCell>
                            <TableCell className="px-6 py-4 text-right font-bold text-fin-text-primary text-sm tabular-nums">{formatCurrency(t.nilai)}</TableCell>
                            <TableCell className="px-6 py-4 text-center">
                               <Badge variant="outline" className={cn(
                                 "text-[9px] font-bold px-2 py-0.5 rounded-lg uppercase border",
                                 t.status === 'BELUM' ? "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]" : "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]"
                               )}>
                                 {t.status === 'BELUM' ? 'Hutang' : 'Lunas'}
                               </Badge>
                            </TableCell>
                             <TableCell className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-3">
                                   {t.status === 'BELUM' ? (
                                     <button 
                                       onClick={() => handleSettle(t.id)}
                                       className="text-[10px] font-bold text-[#2E90FA] hover:underline uppercase tracking-tight"
                                     >
                                       Pelunasan
                                     </button>
                                   ) : (
                                     <span className="text-[10px] font-bold text-fin-text-muted uppercase">Selesai</span>
                                   )}
                                   <div className="flex items-center gap-1 border-l border-[#EAECF0] pl-2">
                                      <button onClick={() => handleEdit(t)} className="p-1 text-fin-text-muted hover:text-[#2E90FA] transition-colors"><Edit size={12} /></button>
                                      <button onClick={() => handleDelete(t.id)} className="p-1 text-fin-text-muted hover:text-[#F04438] transition-colors"><Trash2 size={12} /></button>
                                   </div>
                                </div>
                             </TableCell>
                         </TableRow>
                       ))}
                    </TableBody>
                 </Table>
              </div>
           </Card>
        </div>
      </div>

      {/* Manual Journal Modal (Standardized) */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[#0B0F19]/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-fin-border"
            >
               <div className="px-8 py-6 border-b border-[#F2F4F7] bg-fin-page/50 flex justify-between items-center">
                  <div>
                    <h3 className="text-lg font-semibold text-fin-text-primary tracking-tight">{editId ? 'Perbarui Jurnal Talangan' : 'Perekaman Jurnal Manual'}</h3>
                    <p className="text-[10px] font-bold text-[#667085] mt-1 uppercase tracking-wider">{editId ? 'Update Entry' : 'Inter-fund Debt Registry'}</p>
                  </div>
                  <button onClick={() => { setShowModal(false); setEditId(null); }} className="p-2 hover:bg-white rounded-lg transition-all text-fin-text-muted"><X size={20} /></button>
               </div>
               
               <form onSubmit={handleSubmit} className="p-8 space-y-6">
                  <div className="space-y-5">
                     <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                           <label className="text-xs font-semibold text-fin-text-secondary ml-1">Sumber Dana Asal</label>
                           <select className="w-full h-11 px-4 bg-[#F9FAFB] border border-[#EAECF0] rounded-lg outline-none font-bold text-fin-text-primary text-xs appearance-none" value={formData.id_sumber_dana_asal} onChange={(e) => setFormData({...formData, id_sumber_dana_asal: e.target.value})} required>
                              <option value="">Pilih Asal...</option>
                              {sumberDanaList.map((sd: any) => <option key={sd.id} value={sd.id} className="uppercase">{sd.nama}</option>)}
                           </select>
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-xs font-semibold text-fin-text-secondary ml-1">Sumber Dana Talangan</label>
                           <select className="w-full h-11 px-4 bg-[#F9FAFB] border border-[#EAECF0] rounded-lg outline-none font-bold text-fin-text-primary text-xs appearance-none" value={formData.id_sumber_dana_talangan} onChange={(e) => setFormData({...formData, id_sumber_dana_talangan: e.target.value})} required>
                              <option value="">Pilih Talangan...</option>
                              {sumberDanaList.map((sd: any) => <option key={sd.id} value={sd.id} className="uppercase">{sd.nama}</option>)}
                           </select>
                        </div>
                     </div>

                     <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-fin-text-secondary ml-1">Nilai Rupiah (Rp)</label>
                        <Input type="text" className="h-14 px-4 bg-[#F9FAFB] border-[#EAECF0] rounded-lg outline-none font-bold text-fin-text-primary text-2xl tracking-tight" value={formatNumber(formData.nilai)} onChange={(e) => setFormData({...formData, nilai: parseNumber(e.target.value)})} required />
                     </div>

                     <div className="space-y-1.5">
                        <label className="text-xs font-semibold text-fin-text-secondary ml-1">Keterangan / Alasan</label>
                        <Textarea className="px-4 py-3 bg-[#F9FAFB] border-[#EAECF0] rounded-lg outline-none min-h-[100px] font-medium text-fin-text-primary text-sm" placeholder="Jelaskan rincian peminjaman dana..." value={formData.keterangan} onChange={(e) => setFormData({...formData, keterangan: e.target.value})} required />
                     </div>
                  </div>

                  <Button type="submit" disabled={saving} className="w-full h-12 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-lg font-bold shadow-sm transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50">
                    {saving ? <Loader2 className="animate-spin" size={20} /> : editId ? <RefreshCw size={20} /> : <Save size={20} />}
                    <span className="uppercase tracking-widest text-[10px]"> {editId ? 'Perbarui Jurnal' : 'Rekam Jurnal'}</span>
                  </Button>
               </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
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
