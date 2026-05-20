'use client';

import { useState, useEffect } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { 
  Plus, 
  Trash2, 
  Save, 
  FileText, 
  CheckCircle2, 
  Loader2, 
  X, 
  Banknote, 
  Building2, 
  Calendar,
  AlertCircle,
  Clock,
  ArrowRight,
  UploadCloud,
  Calculator,
  ShieldCheck,
  ClipboardCheck,
  ShieldAlert,
  RefreshCw,
  ChevronDown,
  Copy
} from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import api from '@/lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { PageHeader } from '@/components/patterns/page-header';

type FormValues = {
  nomor: string;
  tanggal: string;
  tanggal_pencairan: string;
  opd: string;
  jenis: string;
  uraian: string;
  penerima: string;
  nilai_bruto: number;
  nilai_potongan: number;
  nilai_neto: number;
  confirmTalangan?: boolean;
  details: {
    id_sumber_dana: string;
    nilai_bruto: number;
  }[];
};

export default function CreateSp2dPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get('edit');
  const [fetching, setFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sumberDanaList, setSumberDanaList] = useState([]);
  const [opdList, setOpdList] = useState<string[]>([]);
  const [jenisList, setJenisList] = useState<string[]>([]);

  // DSS States
  const [showTalanganModal, setShowTalanganModal] = useState(false);
  const [defisitData, setDefisitData] = useState<any>(null);
  const [nomorAvailable, setNomorAvailable] = useState<boolean | null>(null);
  const [checkingNomor, setCheckingNomor] = useState(false);
  const [pendingData, setPendingData] = useState<FormValues | null>(null);

  const { register, control, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      nomor: '',
      tanggal: new Date().toISOString().split('T')[0],
      tanggal_pencairan: new Date().toISOString().split('T')[0],
      opd: '',
      jenis: '',
      uraian: '',
      penerima: '',
      nilai_bruto: 0,
      nilai_potongan: 0,
      nilai_neto: 0,
      details: [{ id_sumber_dana: '', nilai_bruto: 0 }]
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "details"
  });

  // Watchers for Real-time Calculation
  const watchDetails = useWatch({ control, name: "details" });
  const watchPotongan = watch("nilai_potongan");

  useEffect(() => {
    fetchSumberDana();
    fetchOpdList();
    fetchJenisList();
    if (editId) fetchEditData();
  }, [editId]);

  const fetchJenisList = async () => {
    try {
      const res = await api.get('/sp2d/jenis');
      setJenisList(res.data);
    } catch (err) {}
  };

  const fetchOpdList = async () => {
    try {
      const res = await api.get('/sp2d/opd');
      setOpdList(res.data);
    } catch (err) {}
  };

  const fetchEditData = async () => {
    setFetching(true);
    try {
      const res = await api.get(`/sp2d/${editId}`);
      const item = res.data;
      reset({
        nomor: item.nomor,
        tanggal: item.tanggal.split('T')[0],
        tanggal_pencairan: item.tanggal_pencairan ? item.tanggal_pencairan.split('T')[0] : '',
        opd: item.opd,
        jenis: item.jenis,
        uraian: item.uraian,
        penerima: item.penerima,
        nilai_bruto: item.nilai_bruto,
        nilai_potongan: item.nilai_potongan,
        nilai_neto: item.nilai_neto,
        details: item.details || [{ id_sumber_dana: '', nilai_bruto: 0 }]
      });
    } catch (err) {
      toast.error('Gagal mengambil data SP2D');
    } finally {
      setFetching(false);
    }
  };

  const fetchSumberDana = async () => {
    try {
      const res = await api.get('/dss/sumber-dana');
      setSumberDanaList(res.data);
    } catch (err) {}
  };

  // Debounced Nomor Check
  const watchNomor = watch("nomor");
  useEffect(() => {
    if (!watchNomor || editId) return;
    const timer = setTimeout(async () => {
      setCheckingNomor(true);
      try {
        const res = await api.get('/sp2d/check-nomor', { params: { nomor: watchNomor } });
        setNomorAvailable(!res.data.exists);
      } catch (err) {
        setNomorAvailable(null);
      } finally {
        setCheckingNomor(false);
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [watchNomor, editId]);

  // Real-time Calculation Logic
  useEffect(() => {
    const totalBruto = watchDetails.reduce((sum, item) => sum + (Number(item?.nilai_bruto) || 0), 0);
    const totalNeto = totalBruto - (Number(watchPotongan) || 0);
    
    setValue("nilai_bruto", totalBruto);
    setValue("nilai_neto", totalNeto);
  }, [watchDetails, watchPotongan, setValue]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const onSubmit = async (data: FormValues) => {
    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, value]) => {
        if (key === 'details') {
          formData.append(key, JSON.stringify(value));
        } else if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      if (selectedFile) {
        formData.append('file', selectedFile);
      }

      if (editId) {
        await api.put(`/sp2d/${editId}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        toast.success('Koreksi Berhasil', { description: 'Data SP2D dan dokumen telah diperbarui.' });
        router.push('/dashboard/sp2d');
      } else {
        const res = await api.post('/sp2d', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        if (res.data.needsConfirmTalangan) {
          setDefisitData(res.data.defisitItems);
          setPendingData(data);
          setShowTalanganModal(true);
          return;
        }

        toast.success('Berhasil Disimpan', { description: 'Data SP2D dan dokumen telah tercatat secara aman.' });
        router.push('/dashboard/sp2d');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan data. Periksa pagu anggaran.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmTalangan = async () => {
    if (!pendingData) return;
    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries({ ...pendingData, confirmTalangan: true }).forEach(([key, value]) => {
        if (key === 'details') {
          formData.append(key, JSON.stringify(value));
        } else if (value !== undefined && value !== null) {
          formData.append(key, value.toString());
        }
      });
      
      if (selectedFile) {
        formData.append('file', selectedFile);
      }

      await api.post('/sp2d', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Talangan Direkam', { description: 'Pencairan SP2D dan dokumen berhasil dicatat sebagai Dana Talangan.' });
      setShowTalanganModal(false);
      router.push('/dashboard/sp2d');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal mengonfirmasi talangan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      <PageHeader
        title={editId ? 'Koreksi Data SP2D' : 'Perekaman SP2D (SIPD-RI)'}
        description="Sistem sinkronisasi otomatis dengan database SIPD-RI"
        icon={<ClipboardCheck className="size-5" />}
        actions={
          <Button variant="outline" onClick={() => router.push('/dashboard/sp2d')} className="h-10 border-fin-border text-fin-text-secondary font-semibold rounded-lg hover:bg-fin-page gap-2">
            <X size={18} />
            Kembali ke Dashboard
          </Button>
        }
      />

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Form Content */}
          <div className="lg:col-span-8 space-y-6">
            {/* Informasi Pengeluaran */}
            <div className="bg-fin-surface p-8 rounded-xl shadow-sm border border-fin-border relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-slate-100 group-focus-within:bg-ds-primary transition-colors"></div>
              
              <div className="flex justify-between items-start mb-8">
                <h3 className="text-xs font-semibold text-slate-900 flex items-center">
                  <CheckCircle2 className="mr-3 text-fin-info-text" size={16} />
                  Informasi Pengeluaran (SIPD-RI)
                </h3>
                {editId && <Badge variant="outline" className="bg-[#FFFAEB] text-[#B54708] border-[#FEDF89] px-3 py-1 rounded-lg text-[10px] font-semibold">Mode Koreksi Aktif</Badge>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-slate-500 ml-2">OPD / Instansi Terkait (*)</label>
                    <Input 
                      {...register("opd", { required: true })} 
                      list="opd-suggestions" 
                      placeholder="Pilih atau ketik OPD..." 
                      className="h-14 px-8 bg-fin-page border-fin-border rounded-xl focus:border-ds-focus-ring font-medium text-slate-700 text-sm transition-all" 
                    />
                    <datalist id="opd-suggestions">
                      {opdList.map(o => <option key={o} value={o} />)}
                    </datalist>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 ml-2">Nomor SP2D Digital (*)</label>
                    <div className="relative group/input">
                      <Input 
                        {...register("nomor", { required: true })} 
                        placeholder="0001/SP2D/BPKAD/2026" 
                        className={cn("h-14 pl-8 pr-12 bg-fin-page border rounded-xl focus:border-ds-focus-ring font-medium text-slate-800 text-sm transition-all", nomorAvailable === false ? "border-rose-500" : "border-fin-border")} 
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                         {checkingNomor ? (
                            <Loader2 className="animate-spin text-slate-300" size={18} />
                         ) : (
                            watchNomor && (
                               <button 
                                 type="button"
                                 onClick={() => {
                                   navigator.clipboard.writeText(watchNomor);
                                   toast.success('Nomor SP2D Disalin');
                                 }}
                                 className="p-2 text-slate-400 hover:text-fin-info-text hover:bg-indigo-50 rounded-lg transition-all"
                                 title="Salin Nomor"
                               >
                                 <Copy size={16} />
                               </button>
                            )
                         )}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 ml-2">Jenis Belanja / Pencairan (*)</label>
                    <div className="relative">
                      <select {...register("jenis", { required: true })} className="w-full h-14 px-8 bg-fin-page border border-fin-border rounded-xl outline-none focus:border-ds-focus-ring font-medium text-slate-700 text-sm appearance-none cursor-pointer transition-all">
                        <option value="">Pilih Jenis...</option>
                        {jenisList.map(j => <option key={j} value={j}>{j}</option>)}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><ChevronDown size={14} /></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-slate-500 ml-2">Tanggal Terbit SIPD (*)</label>
                    <Input type="date" {...register("tanggal", { required: true })} className="h-14 px-8 bg-fin-page border-fin-border rounded-xl focus:border-ds-focus-ring font-medium text-slate-700 text-sm transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-fin-info-text ml-2 flex items-center">
                       <Calendar size={14} className="mr-2" />
                       Tanggal Pencairan Bank (*)
                    </label>
                    <Input type="date" {...register("tanggal_pencairan", { required: true })} className="h-14 px-8 bg-indigo-50/30 border-indigo-100 rounded-xl focus:border-ds-focus-ring font-medium text-indigo-900 text-sm transition-all" />
                  </div>
                </div>

              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500 ml-2">Nama Lengkap Penerima Dana (*)</label>
                  <Input 
                    {...register("penerima", { required: true })} 
                    placeholder="CV. MAJU BERSAMA" 
                    className="h-14 px-8 bg-fin-page border-fin-border rounded-xl focus:border-ds-focus-ring font-medium text-slate-800 text-sm transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-slate-500 ml-2">Uraian / Keterangan Pembayaran Secara Detail (*)</label>
                  <Textarea 
                    {...register("uraian", { required: true })} 
                    placeholder="Pembayaran atas pekerjaan..." 
                    className="px-8 py-6 bg-fin-page border-fin-border rounded-xl focus:border-ds-focus-ring min-h-[120px] font-medium text-slate-700 text-sm transition-all resize-none" 
                  />
                </div>
              </div>
            </div>

            {/* Rincian Anggaran */}
            <div className="bg-fin-surface p-8 rounded-xl shadow-sm border border-fin-border">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center">
                  <ClipboardCheck className="mr-3 text-fin-info-text" size={16} />
                  Rincian Anggaran (Sumber Dana)
                </h3>
                <Button 
                  type="button" 
                  onClick={() => append({ id_sumber_dana: '', nilai_bruto: 0 })} 
                  className="h-10 px-4 bg-ds-primary text-white rounded-lg font-semibold text-xs hover:bg-slate-800 transition-all shadow-sm active:scale-95 gap-2"
                >
                  <Plus size={14} />
                  <span>Tambah Rincian</span>
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-1 md:grid-cols-12 gap-6 p-6 bg-fin-page/50 rounded-xl border border-fin-border items-end hover:bg-fin-surface transition-all group/item shadow-sm">
                    <div className="md:col-span-7 space-y-2">
                      <label className="text-xs font-medium text-slate-500 ml-2">Pilih Sumber Dana Anggaran</label>
                      <select 
                        {...register(`details.${index}.id_sumber_dana` as const, { required: true })} 
                        className="w-full px-6 py-3.5 bg-fin-surface border border-slate-200 rounded-xl outline-none font-medium text-slate-700 text-xs cursor-pointer focus:border-ds-focus-ring transition-all"
                      >
                        <option value="">Pilih sumber...</option>
                        {sumberDanaList.map((sd: any) => <option key={sd.id} value={sd.id}>{sd.nama}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-4 space-y-2">
                      <label className="text-xs font-medium text-slate-500 ml-2">Nilai Bruto (Rp)</label>
                      <Input 
                        type="text" 
                        className="h-11 px-6 bg-fin-surface border-slate-200 rounded-xl focus:border-ds-focus-ring font-medium text-slate-800 text-xs transition-all" 
                        value={formatNumber(watchDetails[index]?.nilai_bruto || 0)} 
                        onChange={(e) => setValue(`details.${index}.nilai_bruto`, parseNumber(e.target.value))} 
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-center pb-1">
                       <button type="button" onClick={() => remove(index)} className="w-10 h-10 flex items-center justify-center text-slate-300 hover:text-rose-500 transition-all active:scale-90" disabled={fields.length === 1}><Trash2 size={20} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Ringkasan */}
            <div className="bg-fin-surface p-8 rounded-xl shadow-sm border border-fin-border overflow-hidden relative">
              <h3 className="text-xs font-semibold text-slate-900 mb-8 flex items-center">
                <Banknote className="mr-3 text-[#12B76A]" size={16} />
                Ringkasan & Verifikasi Pembayaran
              </h3>

              <div className="space-y-8">
                {/* POTONGAN - DI ATAS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-medium text-slate-500">Potongan Pajak/Lainnya</label>
                      <span className="text-[10px] font-semibold text-fin-info-text bg-indigo-50 px-2 py-0.5 rounded cursor-pointer hover:bg-indigo-100 transition-colors">Pilih Jenis Potongan...</span>
                    </div>
                    <Input 
                      type="text" 
                      className="h-14 px-6 bg-fin-page border-fin-border rounded-xl focus:border-ds-focus-ring font-semibold text-slate-700 text-lg transition-all" 
                      value={formatNumber(watchPotongan)} 
                      onChange={(e) => setValue("nilai_potongan", parseNumber(e.target.value))} 
                    />
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-[#ECFDF3] rounded-xl border border-[#ABEFC6] h-14">
                    <Calculator size={18} className="text-[#12B76A]" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#027A48] leading-none">Kalkulasi otomatis aktif</p>
                      <p className="text-[9px] text-[#027A48]/70 font-medium mt-1">Data sinkron dengan SIPD-RI</p>
                    </div>
                  </div>
                </div>

                {/* NILAI BRUTO & NETO */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="bg-fin-page p-8 rounded-xl border border-fin-border flex flex-col justify-center">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Total Nilai Bruto</p>
                    <p className="text-3xl font-bold text-slate-900 tracking-tight">{formatCurrency(watch("nilai_bruto"))}</p>
                  </div>

                  <div className="bg-ds-primary p-8 rounded-xl shadow-xl shadow-[#101828]/20 text-white flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-fin-surface/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000"></div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Nilai Neto yang Dicairkan</p>
                    <p className="text-4xl font-bold tracking-tight">{formatCurrency(watch("nilai_neto"))}</p>
                  </div>
                </div>

                {/* Peringatan Bruto vs Bank — tampil hanya jika ada potongan */}
                {Number(watchPotongan) > 0 && (
                  <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertCircle size={15} className="text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-amber-800">Nilai yang Muncul di Rekening Bank</p>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        Rekening bank akan mencatat{' '}
                        <strong>{formatCurrency(watch('nilai_neto'))}</strong> (Neto), bukan{' '}
                        <strong>{formatCurrency(watch('nilai_bruto'))}</strong> (Bruto).
                        Potongan <strong>{formatCurrency(Number(watchPotongan))}</strong> dicatat sebagai transaksi terpisah (setoran pajak/potongan).
                        Saat rekonsiliasi, cocokkan mutasi bank dengan nilai <strong>Neto</strong>.
                      </p>
                    </div>
                  </div>
                )}

                {/* UNGGAH DOKUMEN - DI BAWAH */}
                <div className="pt-4 border-t border-slate-50 space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-500 ml-1 flex items-center">
                      <UploadCloud size={16} className="mr-2 text-indigo-500" />
                      E-Arsip (Dokumen PDF Terpindai)
                    </label>
                  </div>
                  <label className="w-full flex items-center justify-center gap-6 py-10 bg-fin-page border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-indigo-500 hover:bg-fin-surface transition-all group">
                    <div className="w-16 h-16 bg-fin-surface rounded-xl flex items-center justify-center text-slate-300 group-hover:text-fin-info-text shadow-sm border border-fin-border transition-all">
                      <FileText size={32} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-slate-700">
                        {selectedFile ? selectedFile.name : 'Unggah SP2D Terpindai'}
                      </p>
                      <p className="text-xs text-slate-400 font-medium mt-1">
                        {selectedFile ? `${(selectedFile.size / 1024 / 1024).toFixed(2)} MB` : 'Pastikan dokumen terbaca jelas (Maks. 5MB)'}
                      </p>
                    </div>
                    <input 
                      type="file" 
                      className="hidden" 
                      accept=".pdf" 
                      onChange={handleFileChange}
                    />
                  </label>
                </div>
              </div>

              <div className="mt-10 pt-10 border-t border-slate-50 flex flex-col gap-3">
                <Button 
                  type="submit" 
                  disabled={loading || fetching} 
                  className="w-full h-14 bg-ds-primary text-white rounded-xl font-semibold shadow-lg shadow-[#101828]/20 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 text-sm hover:bg-slate-800"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : editId ? <RefreshCw size={20} /> : <Save size={20} />}
                  <span>{editId ? 'Perbarui Data SP2D' : 'Simpan Data SP2D'}</span>
                </Button>
                <Button 
                  type="button" 
                  variant="ghost"
                  onClick={() => router.push('/dashboard/sp2d')} 
                  className="w-full h-12 text-xs font-medium text-[#F04438] hover:bg-[#FEF3F2] rounded-xl transition-colors"
                >
                  Batalkan & Kembali
                </Button>
              </div>
            </div>
          </div>

          {/* Info Sidebar */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="bg-ds-primary p-6 rounded-xl text-white shadow-lg relative overflow-hidden group border-none">
              <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform duration-1000">
                <AlertCircle size={160} />
              </div>
              <h4 className="text-xs font-semibold text-[#2E90FA] mb-4">Peringatan Sistem</h4>
              <p className="text-xs leading-relaxed opacity-80">Pastikan rincian sumber dana sesuai dengan DPA-SKPD terbaru untuk menghindari gagal bayar pada proses SP2D Bank.</p>
            </Card>

            <Card className="bg-[#ECFDF3] p-6 rounded-xl border border-[#D1FADF] flex items-start gap-4">
              <div className="w-10 h-10 bg-fin-surface rounded-lg flex items-center justify-center text-[#12B76A] shrink-0 shadow-sm"><Calculator size={20} /></div>
              <div>
                <p className="text-sm font-semibold text-[#027A48]">Sistem Real-Time</p>
                <p className="text-xs text-[#027A48] opacity-80 mt-1.5 leading-relaxed">Nilai neto akan dihitung otomatis berdasarkan potongan pajak yang dimasukkan.</p>
              </div>
            </Card>
          </div>
        </div>
      </form>

      {showTalanganModal && (
        <Dialog open={showTalanganModal} onOpenChange={setShowTalanganModal}>
          <DialogContent className="max-w-md rounded-xl shadow-2xl p-10 text-center bg-fin-surface">
            <div className="w-20 h-20 bg-[#FEF3F2] text-[#F04438] rounded-xl flex items-center justify-center mx-auto mb-8">
              <ShieldAlert size={40} />
            </div>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-fin-text-primary mb-2 text-center">Defisit Anggaran!</DialogTitle>
              <DialogDescription className="text-fin-text-secondary text-sm leading-relaxed mb-8 px-2 text-center">
                Pagu sumber dana tidak mencukupi. Lanjutkan proses sebagai talangan kas daerah?
              </DialogDescription>
            </DialogHeader>
            
            <DialogFooter className="flex-col gap-3 sm:flex-col">
              <Button 
                onClick={handleConfirmTalangan}
                className="w-full h-12 bg-[#F04438] text-white rounded-lg font-semibold shadow-md active:scale-95 transition-all hover:bg-[#D92D20]"
              >
                Ya, Simpan Talangan
              </Button>
              <Button 
                variant="ghost"
                onClick={() => setShowTalanganModal(false)}
                className="w-full h-12 bg-fin-subtle text-[#344054] rounded-lg font-semibold hover:bg-[#E4E7EB] transition-all active:scale-95"
              >
                Batalkan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
