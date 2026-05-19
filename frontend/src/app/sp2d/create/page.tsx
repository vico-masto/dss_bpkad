'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Save, AlertTriangle, FileText, CheckCircle2, Loader2, X, Banknote, TrendingDown, Wallet, FileSignature, User, ShieldCheck } from 'lucide-react';
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function CreateSp2dPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [masterData, setMasterData] = useState({
    sumberDana: [],
    opd: ['DINAS PENDIDIKAN', 'DINAS KESEHATAN', 'SEKRETARIAT DAERAH', 'DINAS PEKERJAAN UMUM', 'DINAS SOSIAL'],
    jenisBelanja: ['LS Barang Jasa', 'LS Gaji', 'GU Nihil', 'TU Nihil', 'LS Modal']
  });

  const [formData, setFormData] = useState({
    nomor: '',
    tanggal: new Date().toISOString().split('T')[0],
    tanggal_pencairan: '',
    opd: '',
    jenis: '',
    uraian: '',
    penerima: '',
    nilai_bruto: 0,
    nilai_potongan: 0,
    jenis_potongan: '',
    nilai_neto: 0,
  });

  const [details, setDetails] = useState([
    { id_sumber_dana: '', nilai_bruto: 0, nilai_neto: 0 }
  ]);

  const [talanganPrompt, setTalanganPrompt] = useState<any>(null);
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await api.get('/dss/sumber-dana');
      setMasterData(prev => ({ ...prev, sumberDana: res.data }));
    } catch (err) {
      console.error('Failed to fetch master data', err);
    }
  };

  const addDetail = () => {
    setDetails([...details, { id_sumber_dana: '', nilai_bruto: 0, nilai_neto: 0 }]);
  };

  const removeDetail = (index: number) => {
    if (details.length > 1) {
      const newDetails = details.filter((_, i) => i !== index);
      setDetails(newDetails);
      updateTotals(newDetails);
    }
  };

  const updateDetail = (index: number, field: string, value: any) => {
    const newDetails = [...details];
    (newDetails[index] as any)[field] = value;
    
    // Auto calculate neto if bruto changed (assuming simple deduction logic for now)
    // In complex mode, user sets bruto & neto per detail
    if (field === 'nilai_bruto') {
        newDetails[index].nilai_neto = value;
    }
    
    setDetails(newDetails);
    updateTotals(newDetails);
  };

  const updateTotals = (currentDetails: any[]) => {
    const totalBruto = currentDetails.reduce((acc, curr) => acc + Number(curr.nilai_bruto), 0);
    const totalNeto = currentDetails.reduce((acc, curr) => acc + Number(curr.nilai_neto), 0);
    const pot = totalBruto - totalNeto;
    setFormData(prev => ({ ...prev, nilai_bruto: totalBruto, nilai_neto: totalNeto, nilai_potongan: pot }));
  };

  const handleSubmit = async (e?: React.FormEvent, forceTalangan = false) => {
    if (e) e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const data = new FormData();
      Object.entries(formData).forEach(([key, val]) => data.append(key, String(val)));
      data.append('details', JSON.stringify(details));
      if (file) data.append('file', file);
      if (forceTalangan) data.append('forceTalangan', 'true');

      const res = await api.post('/sp2d', data, {
        headers: { 
            'Content-Type': 'multipart/form-data' 
        }
      });

      if (res.data.status === 'needsConfirmTalangan') {
        setTalanganPrompt(res.data);
      } else {
        toast.success('SP2D berhasil disimpan!');
        router.push('/dashboard');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Gagal menyimpan SP2D');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-slate-900/30">
            <FileSignature size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Perekaman SP2D</h1>
            <p className="text-slate-500 font-semibold mt-1 text-[11px]">Electronic Data Capture System</p>
          </div>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(e)} className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-10">
          {/* Header Section */}
          <div className="bg-white p-10 rounded-[32px] shadow-sm border border-slate-100 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-2 h-full bg-slate-100 group-focus-within:bg-indigo-600 transition-colors duration-500"></div>
            <div className="flex items-center justify-between mb-10">
              <h3 className="text-lg font-bold text-slate-900 tracking-tight flex items-center">
                <FileText className="mr-3 text-indigo-600" size={24} />
                Identitas dokumen
              </h3>
              <div className="px-4 py-1.5 bg-slate-100 rounded-full text-[10px] font-bold text-slate-400">Wajib diisi</div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
              <div className="space-y-2 group/field">
                <label className="text-[11px] font-bold text-slate-500 ml-1 transition-colors group-focus-within/field:text-indigo-600">Nomor SP2D</label>
                <input 
                  type="text" 
                  placeholder="0000/SP2D/LS/2026"
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-600/5 focus:border-indigo-600 outline-none transition-all focus:bg-white font-bold text-slate-800 placeholder:text-slate-200"
                  value={formData.nomor}
                  onChange={(e) => setFormData({...formData, nomor: e.target.value})}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2 group/field">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 group-focus-within/field:text-brand">Tgl. Terbit</label>
                  <input 
                    type="date" 
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none font-bold text-slate-700"
                    value={formData.tanggal}
                    onChange={(e) => setFormData({...formData, tanggal: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2 group/field">
                  <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 group-focus-within/field:text-brand">Tgl. Cair</label>
                  <input 
                    type="date" 
                    className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none font-bold text-slate-700"
                    value={formData.tanggal_pencairan}
                    onChange={(e) => setFormData({...formData, tanggal_pencairan: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2 group/field">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 group-focus-within/field:text-brand">Organisasi (OPD)</label>
                <select 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none font-black text-slate-700 appearance-none cursor-pointer"
                  value={formData.opd}
                  onChange={(e) => setFormData({...formData, opd: e.target.value})}
                  required
                >
                  <option value="">Pilih OPD...</option>
                  {masterData.opd.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>

              <div className="space-y-2 group/field">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 group-focus-within/field:text-brand">Jenis Belanja</label>
                <select 
                  className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none font-black text-slate-700 appearance-none cursor-pointer"
                  value={formData.jenis}
                  onChange={(e) => setFormData({...formData, jenis: e.target.value})}
                  required
                >
                  <option value="">Pilih Jenis...</option>
                  {masterData.jenisBelanja.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
              </div>

              <div className="md:col-span-2 space-y-2 group/field">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 group-focus-within/field:text-brand">Penerima / Pihak Ketiga</label>
                <div className="relative">
                  <User className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                  <input 
                    type="text" 
                    placeholder="Nama Perusahaan atau Nama Pegawai"
                    className="w-full pl-14 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none transition-all focus:bg-white font-black text-slate-800 placeholder:text-slate-200"
                    value={formData.penerima}
                    onChange={(e) => setFormData({...formData, penerima: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="md:col-span-2 space-y-2 group/field">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1 group-focus-within/field:text-brand">Keperluan / Uraian</label>
                <textarea 
                  className="w-full px-6 py-5 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-brand/5 focus:border-brand outline-none min-h-[120px] font-medium text-slate-700"
                  placeholder="Jelaskan rincian belanja secara lengkap..."
                  value={formData.uraian}
                  onChange={(e) => setFormData({...formData, uraian: e.target.value})}
                  required
                ></textarea>
              </div>
            </div>
          </div>

          {/* Details Section */}
          <div className="bg-white p-10 rounded-[48px] shadow-sm border border-slate-100">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center">
                <CheckCircle2 className="mr-3 text-status-emerald" size={24} />
                Distribusi Anggaran
              </h3>
              <button 
                type="button"
                onClick={addDetail}
                className="flex items-center space-x-2 text-xs bg-brand text-white font-black hover:bg-brand-dark px-6 py-3 rounded-2xl transition-all shadow-lg shadow-brand/20 active:scale-95"
              >
                <Plus size={16} />
                <span>TAMBAH RINCIAN</span>
              </button>
            </div>
            
            <div className="space-y-6">
              {details.map((detail, index) => (
                <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-6 p-8 bg-slate-50/50 rounded-3xl border border-slate-100 items-end hover:bg-white hover:shadow-xl hover:shadow-slate-200/50 transition-all group/item">
                  <div className="md:col-span-7 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sumber Dana</label>
                    <select 
                      className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-brand/5 focus:border-brand font-black text-slate-700"
                      value={detail.id_sumber_dana}
                      onChange={(e) => updateDetail(index, 'id_sumber_dana', e.target.value)}
                      required
                    >
                      <option value="">Pilih Sumber Dana...</option>
                      {masterData.sumberDana.map(sd => (
                        <option key={sd.id} value={sd.id}>{sd.nama}</option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-4 space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nominal (Rp)</label>
                    <div className="relative">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-300">IDR</div>
                      <input 
                        type="text" 
                        className="w-full pl-14 pr-5 py-4 bg-white border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-brand/5 focus:border-brand font-black text-brand text-lg"
                        value={formatNumber(detail.nilai_bruto)}
                        onChange={(e) => updateDetail(index, 'nilai_bruto', parseNumber(e.target.value))}
                        required
                      />
                    </div>
                  </div>
                  <div className="md:col-span-1 flex justify-center pb-1">
                     <button 
                      type="button"
                      onClick={() => removeDetail(index)}
                      className="w-12 h-12 flex items-center justify-center text-slate-300 hover:text-white hover:bg-rose-500 rounded-2xl transition-all shadow-sm"
                      disabled={details.length === 1}
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
           {/* Summary Side Card */}
           <div className="bg-slate-900 p-10 rounded-[48px] shadow-2xl text-white sticky top-10 overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand/10 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-brand/20 transition-all duration-700"></div>
              
              <h3 className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] mb-10">Kalkulasi Final</h3>
              
              <div className="space-y-8 relative z-10">
                <div className="flex items-center gap-6 p-6 bg-white/5 rounded-3xl border border-white/5 group/val hover:bg-white/10 transition-colors">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center shadow-inner">
                    <Banknote size={28} className="text-slate-400 group-hover/val:scale-110 transition-transform" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Bruto</p>
                    <p className="text-2xl font-black">{formatCurrency(formData.nilai_bruto)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 p-6 bg-white/5 rounded-3xl border border-white/5 group/val hover:bg-white/10 transition-colors">
                  <div className="w-14 h-14 rounded-2xl bg-rose-500/20 flex items-center justify-center shadow-inner">
                    <TrendingDown size={28} className="text-rose-500 group-hover/val:rotate-12 transition-transform" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Potongan Pajak</p>
                    <input 
                      type="text"
                      className="w-full bg-transparent border-b border-white/10 p-1 text-xl font-black text-rose-500 outline-none focus:border-rose-500 transition-colors"
                      value={formatNumber(formData.nilai_potongan)}
                      onChange={(e) => {
                        const pot = parseNumber(e.target.value);
                        setFormData({...formData, nilai_potongan: pot, nilai_neto: formData.nilai_bruto - pot});
                      }}
                    />
                  </div>
                </div>
                
                <div className="pt-10 border-t border-white/5 flex items-center gap-6">
                  <div className="w-16 h-16 rounded-[24px] bg-brand/20 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform duration-700">
                    <Wallet size={32} className="text-brand-light" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-brand-light uppercase tracking-[0.2em] mb-1">Neto Pencairan</p>
                    <p className="text-4xl font-black text-white tracking-tighter leading-none">{formatCurrency(formData.nilai_neto)}</p>
                  </div>
                </div>

                <div className="space-y-3 pt-6">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Lampiran Digital (PDF)</label>
                  <div className="relative">
                    <input 
                      type="file" 
                      accept=".pdf"
                      className="hidden"
                      id="file-upload"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <label 
                      htmlFor="file-upload"
                      className="w-full flex items-center justify-center p-4 bg-white/5 border border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/10 hover:border-brand transition-all text-xs font-bold text-slate-400"
                    >
                      {file ? file.name : 'PILIH FILE ARSIP...'}
                    </label>
                  </div>
                </div>

                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-5 bg-brand hover:bg-brand-dark text-white rounded-[24px] font-black shadow-2xl shadow-brand/40 transition-all flex items-center justify-center space-x-3 active:scale-95 disabled:opacity-50 group/btn mt-4 overflow-hidden relative"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-brand to-indigo-600 opacity-0 group-hover/btn:opacity-100 transition-opacity duration-500"></div>
                  {loading ? (
                    <Loader2 className="animate-spin relative z-10" size={24} />
                  ) : (
                    <Save className="relative z-10 group-hover/btn:-rotate-12 transition-transform" size={24} />
                  )}
                  <span className="relative z-10 uppercase tracking-widest">{loading ? 'MENYIMPAN...' : 'TERBITKAN SP2D'}</span>
                </button>
              </div>
           </div>

           <div className="bg-white p-8 rounded-[40px] border border-emerald-100 shadow-xl shadow-emerald-500/5">
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <p className="text-slate-900 font-black text-sm tracking-tight">DSS Intelligence Active</p>
                  <p className="text-slate-500 text-[10px] font-medium mt-1 leading-relaxed">Sistem memantau pagu anggaran & ketersediaan likuiditas bank secara real-time.</p>
                </div>
              </div>
           </div>
        </div>
      </form>

      {/* Talangan Confirmation Modal */}
      {talanganPrompt && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-xl p-10 animate-in fade-in zoom-in duration-300">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
                <AlertTriangle className="text-amber-500" size={40} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">Konfirmasi Dana Talangan</h3>
              <p className="text-slate-500 mb-8">
                Saldo kas pada beberapa sumber dana tidak mencukupi. Terbitkan SP2D menggunakan dana talangan dari <strong>PAD</strong>?
              </p>
              
              <div className="w-full bg-slate-50 rounded-2xl p-6 mb-8 text-left space-y-3">
                {talanganPrompt.defisitItems.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between items-center text-sm">
                    <span className="text-slate-600 font-medium">{item.id_sumber_dana}</span>
                    <span className="text-status-rose font-bold">Defisit: {formatCurrency(item.shortage)}</span>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4 w-full">
                <button 
                  onClick={() => setTalanganPrompt(null)}
                  className="py-4 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-2xl transition-all"
                >
                  Batalkan
                </button>
                <button 
                  onClick={() => handleSubmit(undefined, true)}
                  className="py-4 bg-brand hover:bg-brand-dark text-white font-bold rounded-2xl shadow-lg shadow-brand/20 transition-all active:scale-95"
                >
                  Terbitkan (Talangan)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

