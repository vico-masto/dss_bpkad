'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet, Coins, Receipt, Landmark, CheckCircle2,
  Lock, Loader2, ArrowRight, RefreshCw, Wand2, AlertTriangle, Upload, Trash2,
  Eye, EyeOff
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns/page-header';
import api from '@/lib/api';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import Sp2dBulkImport from '@/app/dashboard/sp2d/Sp2dBulkImport';

const fetcher = (url: string) => api.get(url).then(r => r.data);

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

type StepKey = 'sp2d' | 'potongan' | 'pendapatan' | 'rkud';

interface StepDef {
  key: StepKey;
  no: number;
  title: string;
  desc: string;
  icon: React.ElementType;
}

const STEPS: StepDef[] = [
  { key:'sp2d',       no:1, title:'SP2D Pengeluaran',                 desc:'Excel: Nomor, Tanggal Terbit, Tanggal Pencairan, ID Sumber Dana, Nilai Bruto, Nilai Potongan, OPD, Jenis, Uraian, Penerima.', icon:FileSpreadsheet },
  { key:'potongan',   no:2, title:'Rincian Potongan — seluruh Pajak', desc:'Unggah file ekspor SIPD RI Penatausahaan — rincian potongan akan dipetakan otomatis oleh sistem.',                                                    icon:Coins },
  { key:'pendapatan', no:3, title:'Penerimaan (Pendapatan)',          desc:'File impor bulk pendapatan bulan berjalan.',                                                                                   icon:Receipt },
  { key:'rkud',       no:4, title:'Rekening Koran (RKUD)',            desc:'Kolom: Tanggal, Uraian, Penerimaan, Pengeluaran, Saldo. Impor terakhir sebelum rekonsiliasi.',                                  icon:Landmark },
];

// ── Util pembaca Excel & kolom longgar (case-insensitive) ──
const readWorkbook = (file: File): Promise<any[]> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws));
      } catch (e) { reject(e); }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsBinaryString(file);
  });

const num = (v: any) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };

// Tanpa cellDates, sel Tanggal dibaca sebagai nilai mentah (Excel serial number atau
// string asli seperti "DD/MM/YYYY"). Nilai mentah ini dikirim apa adanya ke backend,
// lalu parseDateSafe menormalkannya jadi UTC bersih — tidak bergantung zona waktu browser.
// Ini menyamakan perilaku dengan halaman /dashboard/rekon/bank (yang selalu akurat).
const rawTanggal = (v: any): string => {
  if (v == null || v === '') return '';
  return String(v);
};

export default function ImporTerpaduPage() {
  const [tahun, setTahun] = useState('');
  const [bulan, setBulan] = useState('');
  const periodSelected = tahun !== '' && bulan !== '';

  const qs = tahun && bulan ? `?tahun=${tahun}&bulan=${bulan}` : null;
  const { data: st, mutate: mutateStatus, isLoading } = useSWR(
    qs ? [`/dss/impor-status${qs}`, tahun, bulan] : null,
    ([url]) => fetcher(url),
    { revalidateOnFocus: false }
  );

  const order: StepKey[] = ['sp2d','potongan','pendapatan','rkud'];
  const unlockedUpTo = (() => {
    if (!st?.steps) return -1;
    for (let i = 0; i < order.length; i++) if (!st.steps[order[i]].done) return i;
    return order.length;
  })();

  type Prog = { busy?:boolean; done?:boolean; error?:string; info?:any };
  const [prog, setProg] = useState<Record<string,Prog>>({});
  const setP = (k:string,p:Partial<Prog>)=>setProg(prev=>({...prev,[k]:{...(prev[k]||{}),...p}}));

  const [files, setFiles] = useState<Record<string, File|null>>({});
  const [drift, setDrift] = useState<any>(null);
  const [showSp2dImport, setShowSp2dImport] = useState(false);

  // ── [KELOLA DATA] CRUD bulanan ──
  const [kelolaTab, setKelolaTab] = useState<StepKey>('sp2d');
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [showKelola, setShowKelola] = useState(false);
  const anyDone = st ? order.some(k => st.steps[k].done) : false;
  const pad = String(bulan).padStart(2, '0');
  const lastDayISO = `${tahun}-${pad}-${new Date(parseInt(tahun), parseInt(bulan), 0).getDate()}`;
  const previewUrl = periodSelected && anyDone
    ? `/dss/impor-preview?tahun=${tahun}&bulan=${bulan}&komponen=${kelolaTab}&limit=100` : null;
  const { data: previewRows, mutate: mutatePreview } = useSWR(previewUrl, fetcher,
    { revalidateOnFocus: false });

  const delUrl = (k: StepKey) =>
    k === 'rkud'        ? '/reports/reconciliation/bank/delete-range'
    : k === 'pendapatan'? `/pendapatan/bulan?tahun=${tahun}&bulan=${bulan}`
    : k === 'potongan'  ? `/sp2d/potongan-bulan?bulan=${bulan}&tahun=${tahun}`
    :                     `/sp2d/bulan?tahun=${tahun}&bulan=${bulan}`;

  const doDelete = async (k: StepKey) => {
    if (deleting || resetting) return;
    setDeleting(k);
    try {
      let r;
      if (k === 'rkud') {
        r = await api.post(delUrl(k), { startDate: `${tahun}-${pad}-01`, endDate: lastDayISO });
      } else {
        r = await api.delete(delUrl(k));
      }
      toast.success(`Data ${k.toUpperCase()} bulan ${MONTHS[parseInt(bulan)-1]} dihapus`, { description: r.data?.message });
      await mutateStatus(); await mutatePreview?.();
    } catch (e: any) {
      toast.error('Gagal menghapus: ' + (e.response?.data?.message || e.message));
    } finally { setDeleting(null); }
  };
  const resetBerurutan = async () => {
    if (resetting) return;
    setResetting(true);
    try {
      for (const k of [...order].reverse()) {
        if (k === 'rkud') {
          await api.post(delUrl(k), { startDate: `${tahun}-${pad}-01`, endDate: lastDayISO });
        } else {
          await api.delete(delUrl(k));
        }
      }
      toast.success('Seluruh data bulan ini berhasil direset');
      await mutateStatus(); await mutatePreview?.();
    } catch (e: any) {
      toast.error('Gagal mereset: ' + (e.response?.data?.message || e.message));
    } finally {
      setResetting(false);
      setResetConfirmOpen(false);
      setDeleting(null);
    }
  };

  // ── LANGKAH ② POTONGAN (Impor SIPD) : kirim file mentah ke backend ──
  const submitPotongan = async () => {
    const f = files['potongan']; if (!f) return;
    setP('potongan',{busy:true});
    try{
      const fd = new FormData();
      fd.append('file', f as File);
      fd.append('bulan', bulan); fd.append('tahun', tahun);
      const r = await api.post('/sp2d/import-excel-pajak', fd,
        { headers:{'Content-Type':'multipart/form-data'}, timeout:600000 });
      setP('potongan',{busy:false,done:true,info:r.data});
      await mutateStatus();
    }catch(e:any){
      // Proxy timeout: backend mungkin sudah selesai tapi response terputus.
      // Cek status setelah beberapa saat — jika data sudah ada, anggap berhasil.
      await new Promise(r => setTimeout(r, 3000));
      const fresh: any = await mutateStatus();
      if (fresh?.steps?.potongan?.count > 0) {
        setP('potongan',{busy:false,done:true,info:{message:'Impor berhasil (server memproses lebih lama dari biasanya)' }});
        toast.success('Impor rincian potongan berhasil (data sudah tersimpan)');
      } else {
        setP('potongan',{busy:false,error:String(e.response?.data?.message||e.message)});
      }
    }
  };

  // ── LANGKAH ③ PENDAPATAN : endpoint impor bulk eksisting ──
  const submitPendapatan = async () => {
    const f = files['pendapatan']; if (!f) return;
    setP('pendapatan',{busy:true});
    try{
      const fd = new FormData(); fd.append('file', f as File);
      fd.append('mode', 'add');
      fd.append('tahun', tahun); fd.append('bulan', bulan);
      const r = await api.post('/pendapatan/import-bulk', fd,
        { headers:{'Content-Type':'multipart/form-data'}, timeout:600000 });
      setP('pendapatan',{busy:false,done:true,info:r.data});
      await mutateStatus();
    }catch(e:any){
      setP('pendapatan',{busy:false,error:String(e.response?.data?.message||e.message)});
    }
  };

  // ── LANGKAH ④ RKUD : parse kolom standar -> POST {data} ──
  const submitRkud = async () => {
    const f = files['rkud']; if (!f) return;
    setP('rkud',{busy:true}); setDrift(null);
    try{
      const rows = await readWorkbook(f);

      // Deteksi kolom Saldo dari header Excel
      const excelHeaders = Object.keys(rows[0] || {});
      const saldoKeywords = ['Saldo', 'SALDO', 'SALDO AKHIR', 'Saldo Akhir', 'SALDO_AKHIR', 'saldo_akhir'];
      const hasSaldo = excelHeaders.some((h: string) => saldoKeywords.includes(h));

      const data = rows.map((r:any) => ({
        TANGGAL: rawTanggal(r['Tanggal']||r['TANGGAL']||r['Date']||r['DATE']),
        NOMOR_BUKTI: r['Nomor Bukti']||r['NOMOR BUKTI']||r['NOMOR_BUKTI']||r['No Bukti']||r['Ref']||'',
        URAIAN: r['Keterangan']||r['URAIAN']||r['Description']||r['DESKRIPSI']||r['Uraian']||'',
        PENERIMAAN: num(r['Penerimaan']||r['Kredit']||r['MASUK']||r['PENERIMAAN']||0),
        PENGELUARAN: num(r['Pengeluaran']||r['Debet']||r['KELUAR']||r['PENGELUARAN']||0),
        SALDO: num(r['Saldo']||r['SALDO AKHIR']||r['SALDO']||0)
      })).filter((r:any) => r.TANGGAL && (r.PENERIMAAN > 0 || r.PENGELUARAN > 0));
      if(data.length===0){ setP('rkud',{busy:false,error:'Tidak ada data valid. Periksa header kolom (Tanggal, Uraian, Penerimaan, Pengeluaran)'}); return; }
      const r = await api.post('/reports/reconciliation/import',{ data, hasSaldo }, { timeout:600000 });

      if ((r.data as any).mode === 'TANPA_SALDO') {
        setDrift(null);
        const { saldoAwalOtomatis, saldoAkhirOtomatis, importedCount } = r.data as any;
        setP('rkud',{busy:false,done:true,info:{
          message: `Berhasil mengimpor ${importedCount} mutasi. Saldo dihitung otomatis.`,
          saldoAwalOtomatis,
          saldoAkhirOtomatis
        }});
      } else {
        setDrift((r.data as any)?.driftCheck || null);
        setP('rkud',{busy:false,done:true,info:r.data});
      }
      await mutateStatus();
    }catch(e:any){
      setP('rkud',{busy:false,error:String(e.response?.data?.message||e.message)});
    }
  };

  // ── FINALISASI STATUS DANA ──
  const [finalizing, setFinalizing] = useState(false);
  const [finalResult, setFinalResult] = useState<any>(null);
  const runFinalisasi = async () => {
    setFinalizing(true);
    try{
      const r = await api.post(`/dss/finalisasi-status-dana${qs}`);
      setFinalResult(r.data);
    }catch(e:any){ setFinalResult({error:String(e.response?.data?.message||e.message)}); }
    finally{ setFinalizing(false); }
  };

  const stepState=(idx:number):'done'|'active'|'locked'=>{
    const k=order[idx]; if(!st?.steps) return 'locked';
    if(st.steps[k].done) return 'done';
    return idx===unlockedUpTo?'active':'locked';
  };
  const badge=(s:string)=> s==='done'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase"><CheckCircle2 size={11}/> Selesai</span>
    : s==='active'
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 text-[10px] font-black uppercase">Aktif</span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-black uppercase"><Lock size={11}/> Terkunci</span>;

  const handlers: Record<StepKey, ()=>void> = {
    sp2d: () => {},
    potongan: submitPotongan,
    pendapatan: submitPendapatan, rkud: submitRkud
  };
  const accepts: Record<StepKey,string> = {
    sp2d:'.xlsx,.xls', potongan:'.xlsx,.xls,.csv', pendapatan:'.xlsx,.xls,.csv', rkud:'.xlsx,.xls,.csv'
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      <PageHeader title="Impor Terpadu"
        description="Upload seluruh data bulanan langsung dari menu ini — berurutan, satu tempat, memakai mesin impor resmi sistem."
        icon={<Wand2 className="size-5"/>}/>

      {/* Periode */}
      <Card className="rounded-xl border-fin-border bg-fin-surface p-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-black uppercase text-fin-text-secondary tracking-wider ml-1">Tahun</label>
            <select value={tahun} onChange={e=>setTahun(e.target.value)}
              className="h-10 text-xs bg-fin-surface border border-fin-border text-fin-text-primary rounded-lg shadow-sm px-3 w-full outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50">
              <option value="" disabled>— Pilih Tahun —</option>
              {[new Date().getFullYear()-1, new Date().getFullYear(), new Date().getFullYear()+1].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-black uppercase text-fin-text-secondary tracking-wider ml-1">Bulan</label>
            <select value={bulan} onChange={e=>setBulan(e.target.value)}
              className="h-10 text-xs bg-fin-surface border border-fin-border text-fin-text-primary rounded-lg shadow-sm px-3 w-full outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50">
              <option value="" disabled>— Pilih Bulan —</option>
              {MONTHS.map((m,i)=><option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={()=>mutateStatus()} disabled={!periodSelected || isLoading} className="h-10 gap-1.5 shrink-0">
            {isLoading?<Loader2 size={13} className="animate-spin"/>:<RefreshCw size={13}/>} Segarkan Status
          </Button>
        </div>
        {!periodSelected && (
          <p className="text-[11px] text-amber-600 font-bold mt-3 flex items-center gap-1.5">
            <AlertTriangle size={12}/> Pilih tahun dan bulan terlebih dahulu untuk memulai impor data.
          </p>
        )}
      </Card>

      {periodSelected && !st && !isLoading && (
        <Card className="rounded-xl border-fin-border bg-fin-surface p-6 text-sm text-fin-text-muted flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-500"/> Gagal memuat status impor — klik "Segarkan Status".
        </Card>
      )}

      {/* SKELETON LOADING */}
      {periodSelected && isLoading && (
        <div className="space-y-4">
          {[1,2,3,4].map(i=>(
            <Card key={i} className="rounded-xl p-5 border-fin-border bg-fin-surface animate-pulse">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-fin-border shrink-0"/>
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-fin-border rounded"/>
                  <div className="h-3 w-72 bg-fin-border rounded opacity-60"/>
                </div>
              </div>
              <div className="ml-12 h-8 w-64 bg-fin-border rounded-lg opacity-40"/>
            </Card>
          ))}
        </div>
      )}

      {/* STEPPER */}
      {!isLoading && <div className="space-y-4">
        {!periodSelected && (
          <Card className="rounded-xl border-amber-200 bg-amber-50/50 p-8 flex flex-col items-center gap-3 text-center">
            <Lock size={32} className="text-amber-400"/>
            <p className="text-sm font-black text-amber-800">Pilih Periode Terlebih Dahulu</p>
            <p className="text-[11px] text-amber-600 max-w-sm">Tentukan tahun dan bulan pada kolom di atas sebelum memulai proses impor data.</p>
          </Card>
        )}
        {periodSelected && STEPS.map((def,idx)=>{
          const s = stepState(idx);
          const info = st?.steps?.[def.key];
          const p = prog[def.key] || {};
          const showPraCek = def.key==='potongan' && info?.sudahAkanTerhapus>0 && !p.done;
          return (
            <Card key={def.key}
              className={`rounded-xl p-5 transition-all ${
                s==='done'?'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-900/10'
                :s==='active'?'border-indigo-300 ring-2 ring-indigo-500/20 bg-fin-surface'
                :'border-fin-border bg-fin-page opacity-70'}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    s==='done'?'bg-emerald-500 text-white':s==='active'?'bg-indigo-600 text-white':'bg-fin-border text-fin-text-muted'}`}>
                    {s==='done'?<CheckCircle2 size={18}/>:s==='active'?<def.icon size={18}/>:<Lock size={16}/>}
                  </div>
                  <div>
                    <p className="text-sm font-black text-fin-text-primary leading-tight">Langkah {def.no} — {def.title}</p>
                    <p className="text-[11px] text-fin-text-muted max-w-[520px]">{def.desc}</p>
                  </div>
                </div>
                {badge(s)}
              </div>

              {info && (
                <p className="text-[11px] text-fin-text-muted mb-3 ml-12">
                  Saat ini tercatat: <span className="font-black text-fin-text-primary">{info.count}</span> baris
                  {showPraCek && (<span className="text-amber-600 font-bold"> · ⚠ {info.sudahAkanTerhapus} baris SUDAH akan terhapus bila impor dijalankan</span>)}
                </p>
              )}
              {showPraCek && (
                <div className="ml-12 mb-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-800 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5"/>
                  Impor Potongan menghapus seluruh rincian bulan ini terlebih dahulu. Lanjutkan hanya jika Anda memang memproses ulang.
                </div>
              )}

              {/* KONTROL UPLOAD */}
              {periodSelected && s==='active' && !isLoading && (
                def.key==='sp2d' ? (
                  <div className="ml-12 space-y-3">
                    <Button size="sm" onClick={()=>setShowSp2dImport(true)}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5">
                      <Upload size={14}/> Impor SP2D (Excel)
                    </Button>
                    <p className="text-[11px] text-fin-text-muted">Pratinjau AMAN/TALANGAN berbasis saldo sistem akan tampil sebelum tersimpan.</p>
                  </div>
                ) : def.key==='potongan' ? (
                  <div className="ml-12 space-y-3">
                    <p className="text-[11px] text-fin-text-muted">
                      Unggah file ekspor SIPD RI Penatausahaan — rincian potongan akan dipetakan otomatis oleh sistem.
                    </p>
                    <div className="flex flex-wrap items-center gap-3">
                      <input type="file" accept={accepts[def.key]}
                        onChange={e=>setFiles(prev=>({...prev,[def.key]:e.target.files?.[0]||null}))}
                        className="text-xs file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 cursor-pointer"/>
                      <Button size="sm" disabled={!files[def.key]||p.busy} onClick={handlers[def.key]}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5">
                        {p.busy?<Loader2 size={14} className="animate-spin"/>:<Upload size={14}/>} Impor SIPD
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="ml-12 flex flex-wrap items-center gap-3">
                    <input type="file" accept={accepts[def.key]}
                      onChange={e=>setFiles(prev=>({...prev,[def.key]:e.target.files?.[0]||null}))}
                      className="text-xs file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 cursor-pointer"/>
                    <Button size="sm" disabled={!files[def.key]||p.busy} onClick={handlers[def.key]}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold gap-1.5">
                      {p.busy?<Loader2 size={14} className="animate-spin"/>:<Upload size={14}/>} Impor Sekarang
                    </Button>
                  </div>
                )
              )}
              {/* PROGRESS INDICATOR */}
              {periodSelected && s==='active' && p.busy && (
                <div className="ml-12 mt-3 flex items-center gap-3 p-3 rounded-lg bg-indigo-50 border border-indigo-200">
                  <Loader2 size={16} className="animate-spin text-indigo-600 shrink-0"/>
                  <p className="text-xs font-bold text-indigo-700">
                    {def.key==='potongan' ? 'Mengunggah & memproses file SIPD…'
                      : def.key==='rkud' ? 'Membaca & mengunggah mutasi bank…'
                      : 'Mengunggah data…'}
                  </p>
                </div>
              )}

              {/* Hasil / Error */}
              {p.error && (
                <div className="ml-12 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 whitespace-pre-wrap">{p.error}</div>
              )}
              {def.key==='rkud' && drift && (
                <div className={`ml-12 mt-3 p-3 rounded-lg text-xs border ${drift.status==='OK'?'bg-emerald-50 border-emerald-200 text-emerald-800':'bg-amber-50 border-amber-200 text-amber-900'}`}>
                  Drift file: <b>Rp{Number(drift.drift).toLocaleString('id-ID')}</b> ({drift.status})
                  {drift.status!=='OK' && <> — kolom Saldo file tidak konsisten dgn mutasi. Periksa file sumber.</>}
                </div>
              )}
              {def.key==='rkud' && p.done && p.info?.mode==='TANPA_SALDO' && (
                <div className="ml-12 mt-3 p-3 rounded-lg text-xs border bg-blue-50 border-blue-200 text-blue-800">
                  Saldo dihitung otomatis — awal: <b>Rp{Number(p.info.saldoAwalOtomatis||0).toLocaleString('id-ID')}</b>, akhir: <b>Rp{Number(p.info.saldoAkhirOtomatis||0).toLocaleString('id-ID')}</b>
                </div>
              )}
            </Card>
          );
        })}
      </div>}

      {/* [KELOLA DATA] */}
      {periodSelected && anyDone && (
        <Card className="rounded-xl border-fin-border bg-fin-surface p-5 space-y-4">
          <button onClick={()=>setShowKelola(v=>!v)}
            className="w-full flex items-center justify-between group">
            <p className="text-sm font-black text-fin-text-primary flex items-center gap-2">
              <Trash2 size={15} className="text-red-500"/> Kelola Data Bulan {MONTHS[parseInt(bulan)-1]} {tahun}
            </p>
            <span className="flex items-center gap-1.5 text-[10px] font-bold text-fin-text-muted uppercase tracking-wider group-hover:text-indigo-600 transition-colors">
              {showKelola ? <><EyeOff size={13}/> Sembunyikan</> : <><Eye size={13}/> Tampilkan</>}
            </span>
          </button>

          {showKelola && (<>
          {/* Tab komponen */}
          <div className="flex flex-wrap gap-2">
            {order.map((k, i) => {
              const cnt = st?.steps?.[k]?.count ?? 0;
              return (
                <button key={k} onClick={()=>setKelolaTab(k as StepKey)}
                  className={`px-3 h-8 rounded-lg text-[11px] font-bold transition-colors ${
                    kelolaTab===k ? 'bg-indigo-600 text-white' : 'bg-fin-page text-fin-text-secondary border border-fin-border hover:border-indigo-300'}`}>
                  {STEPS[i].no}. {STEPS[i].title.split('—')[0].trim()} ({cnt})
                </button>
              );
            })}
          </div>

          {/* Tabel pratinjau */}
          <div className="rounded-lg border border-fin-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-fin-page">
                <tr>
                  <th className="text-left px-3 py-2 text-[9px] font-black uppercase text-fin-text-muted">Tanggal</th>
                  <th className="text-left px-3 py-2 text-[9px] font-black uppercase text-fin-text-muted">{kelolaTab==='rkud'?'Uraian':'Referensi/Uraian'}</th>
                  <th className="text-right px-3 py-2 text-[9px] font-black uppercase text-fin-text-muted">Nilai</th>
                  <th className="text-center px-3 py-2 text-[9px] font-black uppercase text-fin-text-muted">Status</th>
                  <th className="text-center px-3 py-2 text-[9px] font-black uppercase text-fin-text-muted">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fin-border">
                {(previewRows || []).map((r: any) => (
                  <tr key={r.id} className="hover:bg-fin-page">
                    <td className="px-3 py-1.5 text-fin-text-secondary">{r.tanggal}</td>
                    <td className="px-3 py-1.5 truncate max-w-[280px] text-fin-text-primary">{r.ref}{r.uraian ? ` — ${String(r.uraian).slice(0,40)}` : ''}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(r.nilai || 0)}</td>
                    <td className="px-3 py-1.5 text-center">{r.status || '-'}</td>
                    <td className="px-3 py-1.5 text-center">
                      {kelolaTab==='sp2d' && (
                        <Link href={`/dashboard/sp2d?edit=${r.id}`} target="_blank"
                          className="text-[10px] font-bold text-indigo-600 underline">Edit ↗</Link>
                      )}
                      {kelolaTab!=='sp2d' && <span className="text-[10px] text-fin-text-muted/60">via menu sumber</span>}
                    </td>
                  </tr>
                ))}
                {(!previewRows || previewRows.length===0) && (
                  <tr><td colSpan={5} className="text-center text-fin-text-muted py-4 text-[11px]">Tidak ada baris.</td></tr>
                )}
              </tbody>
            </table>
            {Array.isArray(previewRows) && previewRows.length>=100 && (
              <p className="text-[10px] text-fin-text-muted px-3 py-1.5 bg-fin-page">Menampilkan 100 baris pertama…</p>
            )}
          </div>

          {/* Danger zone */}
          <div className="pt-3 border-t border-fin-border space-y-3">
            <p className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1.5">
              <AlertTriangle size={13}/> Zona berbahaya — penghapusan permanen bulan ini
            </p>
            <p className="text-[11px] text-fin-text-muted">Ketik <b>{'HAPUS ' + MONTHS[parseInt(bulan)-1].toUpperCase()}</b> untuk mengaktifkan tombol hapus per langkah.</p>
            <div className="flex flex-wrap items-center gap-3">
              <input value={confirmText} onChange={e=>setConfirmText(e.target.value)}
                placeholder={`HAPUS ${MONTHS[parseInt(bulan)-1].toUpperCase()}`}
                className="h-9 px-3 text-xs rounded-lg border border-red-200 bg-white min-w-[200px] flex-1 max-w-xs outline-none focus:border-red-500"/>
              <Button size="sm" disabled={confirmText !== 'HAPUS ' + MONTHS[parseInt(bulan)-1].toUpperCase() || deleting!==null || resetting || !st.steps[kelolaTab]?.done}
                onClick={()=>doDelete(kelolaTab)}
                className="bg-red-600 hover:bg-red-700 text-white font-bold gap-1.5">
                {deleting===kelolaTab?<Loader2 size={14} className="animate-spin"/>:<Trash2 size={14}/>} Hapus Semua ({st?.steps?.[kelolaTab]?.count ?? 0})
              </Button>
              <Button size="sm" variant="outline" disabled={deleting!==null || resetting}
                onClick={()=>setResetConfirmOpen(true)} className="gap-1.5 font-bold">
                {resetting?<Loader2 size={14} className="animate-spin"/>:<RefreshCw size={14}/>} Reset Berurutan Aman ④→③→②→①
              </Button>
            </div>
            <p className="text-[10px] text-fin-text-muted">Urutan aman dijalankan otomatis oleh tombol Reset. Bank memakai rentang 01–akhir bulan; item BKU terkait ikut dikembalikan ke BELUM.</p>
          </div>

          {/* CONFIRM RESET DIALOG */}
          {resetConfirmOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white rounded-xl shadow-2xl border border-fin-border p-6 max-w-sm w-full mx-4 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle size={18} className="text-amber-600"/>
                  </div>
                  <div>
                    <p className="text-sm font-black text-fin-text-primary">Reset Berurutan?</p>
                    <p className="text-[11px] text-fin-text-muted">Semua data bulan ini akan dihapus: Bank → Pendapatan → Potongan → SP2D.</p>
                  </div>
                </div>
                <div className="flex gap-3 justify-end">
                  <Button size="sm" variant="outline" onClick={()=>setResetConfirmOpen(false)} disabled={resetting}>Batal</Button>
                  <Button size="sm" onClick={resetBerurutan} disabled={resetting}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold gap-1.5">
                    {resetting?<Loader2 size={14} className="animate-spin"/>:<RefreshCw size={14}/>} Ya, Reset
                  </Button>
                </div>
              </div>
            </div>
          )}
          </>)}
        </Card>
      )}

      {/* PANEL SELESAI */}
      {periodSelected && st && unlockedUpTo>=order.length && (
        <Card className="rounded-xl border-emerald-300 bg-emerald-50/50 p-6 space-y-4">
          <p className="text-sm font-black text-emerald-800 flex items-center gap-2">
            <CheckCircle2 size={16}/> Seluruh langkah impor bulan {MONTHS[parseInt(bulan)-1]} {tahun} selesai.
          </p>
          {!finalResult && !finalizing && (
            <Button onClick={runFinalisasi} disabled={finalizing}
              className="bg-ds-primary hover:bg-slate-800 text-white font-bold gap-1.5">
              {finalizing?<Loader2 size={14} className="animate-spin"/>:<Wand2 size={14}/>} Finalisasi Status Dana
            </Button>
          )}
          {finalizing && <p className="text-xs font-bold text-indigo-600 flex items-center gap-2"><Loader2 size={13} className="animate-spin"/> Menyetel ulang status dana…</p>}
          {finalResult && !finalResult.error && (
            <div className="text-xs bg-white rounded-lg border border-fin-border p-3 inline-block">
              ✅ Aman: <b>{finalResult.hasil.aman}</b> · Talangan: <b>{finalResult.hasil.talangan}</b> · Jurnal dibersihkan: <b>{finalResult.hasil.jurnal_dibersihkan}</b> · ditambah: <b>{finalResult.hasil.jurnal_ditambah}</b>
            </div>
          )}
          {finalResult?.error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">❌ {finalResult.error}</div>}
          <div className="pt-2">
            <Link href="/dashboard/rekon" className="inline-flex items-center gap-2 h-11 px-8 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase">
              Jalankan Rekonsiliasi Otomatis <ArrowRight size={15}/>
            </Link>
          </div>
        </Card>
      )}
      {/* MODAL IMPOR SP2D BERSAMA */}
      <Sp2dBulkImport open={showSp2dImport} onClose={()=>setShowSp2dImport(false)}
        onDone={async()=>{ await mutateStatus(); }} />
    </div>
  );
}
