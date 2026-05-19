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
  Banknote, 
  Calendar,
  AlertCircle,
  Calculator,
  UploadCloud,
  ShieldAlert,
  RefreshCw,
  ClipboardCheck,
  ChevronDown,
  Copy,
  Check
} from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { NumericInput } from '@/components/NumericInput';


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

import { useSearchParams } from 'next/navigation';

export default function Sp2dForm({ onSuccess, editId }: { onSuccess: () => void; editId?: string | null }) {
  const searchParams = useSearchParams();
  const cloneId = searchParams.get('clone');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
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

  const watchDetails = useWatch({ control, name: "details" });
  const watchPotongan = watch("nilai_potongan");

  useEffect(() => {
    const init = async () => {
      await Promise.all([
        fetchOpdList(),
        fetchJenisList(),
        fetchSumberDana()
      ]);
      
      if (editId) {
        fetchEditData();
      } else if (cloneId) {
        fetchCloneData();
      }
    };
    
    init();
  }, [editId, cloneId]);

  const fetchCloneData = async () => {
    setFetching(true);
    try {
      const res = await api.get(`/sp2d/${cloneId}`);
      const item = res.data;
      reset({
        nomor: `${item.nomor}_COPY`,
        tanggal: new Date().toISOString().split('T')[0],
        tanggal_pencairan: new Date().toISOString().split('T')[0],
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
      toast.error('Gagal mengambil data kloning SP2D');
    } finally {
      setFetching(false);
    }
  };

  const fetchJenisList = async () => {
    try {
      const res = await api.get('/sp2d/jenis');
      setJenisList(res.data);
    } catch (err) {}
  };

  const fetchOpdList = async () => {
    try {
      const res = await api.get('/sp2d/opd');
      if (Array.isArray(res.data)) {
        setOpdList(res.data);
      } else {
        console.error("Invalid OPD data format", res.data);
      }
    } catch (err: any) {
      console.error("Failed to fetch OPD list", err);
      toast.error("Gagal memuat daftar OPD. Silakan refresh halaman.");
    }
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

  const watchBrutoTotal = watch("nilai_bruto");

  useEffect(() => {
    const totalNeto = (Number(watchBrutoTotal) || 0) - (Number(watchPotongan) || 0);
    setValue("nilai_neto", totalNeto);

    // Primary Source Fund Logic:
    // If multiple sources, index 0 is auto-adjusted to match total bruto
    if (fields.length > 1) {
      const otherDetailsTotal = watchDetails.slice(1).reduce((sum, item) => sum + (Number(item?.nilai_bruto) || 0), 0);
      const calculatedPrimary = Math.max(0, (Number(watchBrutoTotal) || 0) - otherDetailsTotal);
      
      if (watchDetails[0]?.nilai_bruto !== calculatedPrimary) {
        setValue("details.0.nilai_bruto", calculatedPrimary);
      }
    } else if (fields.length === 1) {
      // If only one source, it always matches the total bruto
      if (watchDetails[0]?.nilai_bruto !== watchBrutoTotal) {
        setValue("details.0.nilai_bruto", Number(watchBrutoTotal) || 0);
      }
    }
  }, [watchDetails, watchBrutoTotal, watchPotongan, fields.length, setValue]);

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
        // Jika ada file, tetap gunakan FormData, jika tidak, gunakan JSON murni ke endpoint koreksi
        if (selectedFile) {
          await api.put(`/sp2d/${editId}`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
          });
        } else {
          await api.put(`/sp2d/koreksi/${editId}`, data);
        }
        toast.success('Koreksi Berhasil', { description: 'Data SP2D telah diperbarui secara aman.' });
        onSuccess();
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
        onSuccess();
      }
    } catch (err: any) {
      console.log("--- DEBUG ERROR START ---");
      console.log("Status:", err.response?.status);
      console.log("Data:", JSON.stringify(err.response?.data, null, 2));
      console.error("Full Error Object:", err);
      console.log("--- DEBUG ERROR END ---");
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
      onSuccess();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal mengonfirmasi talangan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Form Content */}
          <div className="lg:col-span-8 space-y-6">
            <div className="bg-fin-surface p-8 rounded-2xl shadow-sm border border-fin-border relative overflow-hidden group">
              <div className="absolute top-0 left-0 w-1.5 h-full bg-fin-subtle group-focus-within:bg-indigo-600 transition-colors"></div>
              
              <div className="flex justify-between items-start mb-8">
                <h3 className="text-sm font-semibold text-fin-text-primary flex items-center">
                  <CheckCircle2 className="mr-3 text-indigo-600" size={16} />
                  Informasi Pengeluaran (SIPD-RI)
                </h3>
                {editId && <Badge variant="outline" className="bg-[#FFFAEB] text-[#B54708] border-[#FEDF89] px-3 py-1 rounded-md text-xs font-semibold">Mode Koreksi Aktif</Badge>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-fin-text-muted ml-2">OPD / Instansi Terkait (*)</label>
                    <div className="relative">
                      <select 
                        {...register("opd", { required: true })} 
                        className="w-full h-14 px-8 bg-fin-page border border-fin-border rounded-xl outline-none focus:border-indigo-600 font-medium text-fin-text-primary text-sm appearance-none cursor-pointer transition-all"
                      >
                        <option value="">-- Pilih OPD --</option>
                        {opdList.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronDown size={14} />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-fin-text-muted ml-2">Nomor SP2D Digital (*)</label>
                    <div className="relative group/input">
                      <Input 
                        {...register("nomor", { required: true })} 
                        placeholder="0001/SP2D/BPKAD/2026" 
                        className={cn("h-14 pl-8 pr-12 bg-fin-page border rounded-xl focus:border-indigo-600 font-medium text-fin-text-primary text-sm transition-all", nomorAvailable === false ? "border-rose-500" : "border-fin-border")} 
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
                                 className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
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
                    <label className="text-xs font-medium text-fin-text-muted ml-2">Jenis Belanja / Pencairan (*)</label>
                    <div className="relative">
                      <select {...register("jenis", { required: true })} className="w-full h-14 px-8 bg-fin-page border border-fin-border rounded-xl outline-none focus:border-indigo-600 font-medium text-fin-text-primary text-sm appearance-none cursor-pointer transition-all">
                        <option value="">Pilih Jenis...</option>
                        {jenisList.map(j => <option key={j} value={j}>{j}</option>)}
                      </select>
                      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-fin-text-muted"><ChevronDown size={14} /></div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-fin-text-muted ml-2">Tanggal Terbit SIPD (*)</label>
                    <Input type="date" {...register("tanggal", { required: true })} className="h-14 px-8 bg-fin-page border-fin-border rounded-xl focus:border-indigo-600 font-medium text-fin-text-primary text-sm transition-all" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-indigo-600 ml-2 flex items-center">
                       <Calendar size={14} className="mr-2" />
                       Tanggal Pencairan Bank (*)
                    </label>
                    <Input type="date" {...register("tanggal_pencairan", { required: true })} className="h-14 px-8 bg-indigo-600/5 border-indigo-100 rounded-xl focus:border-indigo-600 font-medium text-indigo-900 text-sm transition-all dark:bg-indigo-900/20" />
                  </div>
                </div>

              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-fin-text-muted ml-2">Nama Lengkap Penerima Dana (*)</label>
                  <Input 
                    {...register("penerima", { required: true })} 
                    placeholder="CV. MAJU BERSAMA" 
                    className="h-14 px-8 bg-fin-page border-fin-border rounded-xl focus:border-indigo-600 font-medium text-fin-text-primary text-sm transition-all" 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-fin-text-muted ml-2">Uraian / Keterangan Pembayaran Secara Detail (*)</label>
                  <Textarea 
                    {...register("uraian", { required: true })} 
                    placeholder="Pembayaran atas pekerjaan..." 
                    className="px-8 py-6 bg-fin-page border-fin-border rounded-xl focus:border-indigo-600 min-h-[120px] font-medium text-fin-text-primary text-sm transition-all resize-none" 
                  />
                </div>
              </div>
            </div>

            <div className="bg-fin-surface p-8 rounded-2xl shadow-sm border border-fin-border">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-sm font-semibold text-fin-text-primary flex items-center">
                  <ClipboardCheck className="mr-3 text-indigo-600" size={16} />
                  Rincian Anggaran (Sumber Dana)
                </h3>
                <Button 
                  type="button" 
                  onClick={() => append({ id_sumber_dana: '', nilai_bruto: 0 })} 
                  className="h-10 px-4 bg-fin-text-primary text-fin-surface rounded-lg font-semibold text-xs hover:opacity-90 transition-all shadow-sm active:scale-95 gap-2"
                >
                  <Plus size={14} />
                  <span>Tambah Rincian</span>
                </Button>
              </div>

              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className={cn(
                    "grid grid-cols-1 md:grid-cols-12 gap-6 p-6 rounded-xl border items-end transition-all group/item shadow-sm",
                    index === 0 ? "bg-indigo-600/5 border-indigo-100 dark:bg-indigo-900/10" : "bg-fin-page/50 border-fin-border hover:bg-fin-surface"
                  )}>
                    <div className="md:col-span-7 space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-medium text-fin-text-muted ml-2">Pilih Sumber Dana Anggaran</label>
                        {index === 0 && <Badge className="bg-indigo-600 text-[9px] h-4">SUMBER UTAMA</Badge>}
                      </div>
                      <select 
                        {...register(`details.${index}.id_sumber_dana` as const, { required: true })} 
                        className="w-full px-6 py-3.5 bg-fin-surface border border-fin-border rounded-xl outline-none font-medium text-fin-text-primary text-xs cursor-pointer focus:border-indigo-600 transition-all"
                      >
                        <option value="">Pilih sumber...</option>
                        {sumberDanaList.map((sd: any) => <option key={sd.id} value={sd.id}>{sd.nama}</option>)}
                      </select>
                    </div>
                    <div className="md:col-span-4 space-y-2">
                      <label className="text-xs font-medium text-fin-text-muted ml-2">Nilai Bruto (Rp)</label>
                      <NumericInput 
                        className={cn(
                          "h-11 px-6 bg-fin-surface border-fin-border rounded-xl focus:border-indigo-600 font-medium text-fin-text-primary text-xs transition-all",
                          index === 0 && fields.length > 1 && "bg-fin-page text-fin-text-muted cursor-not-allowed"
                        )}
                        readOnly={index === 0 && fields.length > 1}
                        value={watchDetails[index]?.nilai_bruto || 0} 
                        onValueChange={(val) => {
                          if (index === 0 && fields.length > 1) return;
                          setValue(`details.${index}.nilai_bruto`, val);
                          // If it's the only one, also update the master total
                          if (fields.length === 1) setValue("nilai_bruto", val);
                        }} 
                      />
                    </div>
                    <div className="md:col-span-1 flex justify-center pb-1">
                       <button 
                         type="button" 
                         onClick={() => remove(index)} 
                         className={cn("w-10 h-10 flex items-center justify-center transition-all active:scale-90", index === 0 ? "text-slate-200 cursor-not-allowed" : "text-slate-300 hover:text-rose-500")} 
                         disabled={index === 0 || fields.length === 1}
                       >
                         <Trash2 size={20} />
                       </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-fin-surface p-8 rounded-2xl shadow-sm border border-fin-border overflow-hidden relative">
              <h3 className="text-xs font-semibold text-fin-text-primary mb-8 flex items-center">
                <Banknote className="mr-3 text-[#12B76A]" size={16} />
                Ringkasan & Verifikasi Pembayaran
              </h3>

              <div className="space-y-8">
                {/* POTONGAN - DI ATAS */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-end">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center px-1">
                      <label className="text-xs font-medium text-fin-text-muted">Potongan Pajak/Lainnya</label>
                      <span className="text-xs font-semibold text-indigo-600 bg-indigo-600/5 px-2 py-0.5 rounded cursor-pointer hover:bg-indigo-600/10 transition-colors">Pilih Jenis Potongan...</span>
                    </div>
                    <NumericInput 
                      className="h-14 px-6 bg-fin-page border-fin-border rounded-xl focus:border-indigo-600 font-semibold text-fin-text-primary text-lg transition-all" 
                      value={watchPotongan || 0} 
                      onValueChange={(val) => setValue("nilai_potongan", val)} 
                    />
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-[#ECFDF3] rounded-xl border border-[#ABEFC6] h-14">
                    <Calculator size={18} className="text-[#12B76A]" />
                    <div>
                      <p className="text-xs font-semibold text-[#027A48] leading-none">Kalkulasi otomatis aktif</p>
                      <p className="text-xs text-[#027A48]/70 font-medium mt-1">Data sinkron dengan SIPD-RI</p>
                    </div>
                  </div>
                </div>

                {/* NILAI BRUTO & NETO */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-fin-surface p-6 rounded-2xl border border-fin-border flex flex-col justify-center shadow-sm hover:border-indigo-100 transition-all">
                    <div className="text-[10px] font-bold text-fin-text-muted uppercase tracking-widest mb-2 flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-fin-subtle" />
                       Total Nilai Bruto (SP2D)
                    </div>
                    <div className="relative group">
                       <NumericInput 
                         className="bg-transparent border-none p-0 h-auto text-2xl font-bold text-fin-text-primary tracking-tight focus:ring-0 focus:border-none w-full"
                         value={watchBrutoTotal || 0}
                         onValueChange={(val) => setValue("nilai_bruto", val)}
                       />
                       <div className="absolute -bottom-1 left-0 w-0 h-0.5 bg-indigo-600 transition-all group-focus-within:w-full" />
                    </div>
                  </div>

                  <div className="bg-fin-text-primary p-6 rounded-2xl shadow-lg shadow-black/10 text-fin-surface flex flex-col justify-center relative overflow-hidden group">
                    <div className="absolute -top-10 -right-10 w-32 h-32 bg-white/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-all duration-1000"></div>
                    <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-2">
                       <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                       Nilai Neto yang Dicairkan
                    </div>
                    <p className="text-2xl font-black tracking-tight text-white relative z-10" style={{fontVariantNumeric: 'tabular-nums'}}>
                      {formatCurrency(watch("nilai_neto"))}
                    </p>
                  </div>
                </div>

                {/* UNGGAH DOKUMEN - DI BAWAH */}
                <div className="pt-4 border-t border-fin-subtle space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-fin-text-muted ml-1 flex items-center">
                      <UploadCloud size={16} className="mr-2 text-indigo-500" />
                      E-Arsip (Dokumen PDF Terpindai)
                    </label>
                  </div>
                  <label className="w-full flex items-center justify-center gap-6 py-10 bg-fin-page border-2 border-dashed border-fin-border rounded-2xl cursor-pointer hover:border-indigo-500 hover:bg-fin-surface transition-all group">
                    <div className="w-16 h-16 bg-fin-surface rounded-xl flex items-center justify-center text-fin-text-muted/30 group-hover:text-indigo-600 shadow-sm border border-fin-border transition-all">
                      <FileText size={32} />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-fin-text-primary">
                        {selectedFile ? selectedFile.name : 'Unggah SP2D Terpindai'}
                      </p>
                      <p className="text-xs text-fin-text-muted font-medium mt-1">
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

              <div className="mt-10 pt-10 border-t border-fin-subtle flex flex-col gap-3">
                <Button 
                  type="submit" 
                  disabled={loading || fetching} 
                  className="w-full h-14 bg-fin-text-primary text-fin-surface rounded-xl font-semibold shadow-lg shadow-black/5 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 text-sm hover:opacity-90"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                  <span>{editId ? 'Perbarui Data SP2D' : 'Simpan Data SP2D'}</span>
                </Button>
                <Button 
                  type="button" 
                  variant="ghost"
                  onClick={() => onSuccess()} 
                  className="w-full h-12 text-xs font-medium text-fin-expense hover:bg-fin-expense/10 rounded-xl transition-colors"
                >
                  Batalkan & Kembali
                </Button>
              </div>
            </div>
          </div>

          {/* Info Sidebar */}
          <div className="lg:col-span-4 space-y-4">
            <Card className="bg-[#101828] p-6 rounded-xl text-white shadow-lg relative overflow-hidden group border-none">
              <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-110 transition-transform duration-1000">
                <AlertCircle size={160} />
              </div>
              <h4 className="text-xs font-semibold text-[#2E90FA] mb-4">Peringatan Sistem</h4>
              <p className="text-xs leading-relaxed opacity-80">Pastikan rincian sumber dana sesuai dengan DPA-SKPD terbaru untuk menghindari gagal bayar pada proses SP2D Bank.</p>
            </Card>

            <Card className="bg-fin-income-bg p-6 rounded-xl border border-fin-income/20 flex items-start gap-4">
              <div className="w-10 h-10 bg-fin-surface rounded-lg flex items-center justify-center text-fin-income shrink-0 shadow-sm"><Calculator size={20} /></div>
              <div>
                <p className="text-sm font-semibold text-fin-income-text">Sistem Real-Time</p>
                <p className="text-xs text-fin-income-text opacity-80 mt-1.5 leading-relaxed">Nilai neto akan dihitung otomatis berdasarkan potongan pajak yang dimasukkan.</p>
              </div>
            </Card>
          </div>
        </div>
      </form>

      {showTalanganModal && (
        <Dialog open={showTalanganModal} onOpenChange={setShowTalanganModal}>
          <DialogContent className="max-w-md rounded-2xl shadow-2xl p-10 text-center bg-fin-surface border-fin-border">
            <div className="w-20 h-20 bg-fin-expense/10 text-fin-expense rounded-2xl flex items-center justify-center mx-auto mb-8">
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
                className="w-full h-12 bg-fin-expense text-fin-surface rounded-lg font-semibold shadow-md active:scale-95 transition-all hover:opacity-90"
              >
                Ya, Simpan Talangan
              </Button>
              <Button 
                variant="ghost"
                onClick={() => setShowTalanganModal(false)}
                className="w-full h-12 bg-fin-page text-fin-text-secondary rounded-lg font-semibold hover:bg-fin-subtle transition-all active:scale-95"
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
