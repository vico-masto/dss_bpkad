'use client';

import { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Building2,
  Mail,
  MapPin,
  Upload,
  Save,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  User,
  Lock,
  ShieldCheck,
  Database
} from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Trash2, ShieldAlert, Zap } from 'lucide-react';
import api from '@/lib/api';

export default function SettingsPage() {
  const [config, setConfig] = useState({
    pemerintah: 'PEMERINTAH KABUPATEN KEPULAUAN ARU',
    instansi: 'BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH',
    alamat: 'Jl. Pemda - Email : bpkad.kepulauanarukab@gmail.com',
    logo: '',
    pimpinan_jabatan: 'KEPALA BADAN',
    pimpinan_nama: 'NAMA PIMPINAN, S.Sos',
    pimpinan_nip: '19XXXXXXXXXXXXXXX'
  });

  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    const savedConfig = localStorage.getItem('app_config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      setConfig({ ...config, ...parsed });
      setPreview(parsed.logo || null);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500000) { // 500KB limit for localStorage
        toast.error('File terlalu besar. Maksimal 500KB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setPreview(base64String);
        setConfig({ ...config, logo: base64String });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    localStorage.setItem('app_config', JSON.stringify(config));
    toast.success('Pengaturan berhasil disimpan', {
      description: 'Logo, detail instansi, dan informasi pimpinan akan diterapkan pada laporan.'
    });
  };

  const handleReset = () => {
    const defaultConfig = {
      pemerintah: 'PEMERINTAH KABUPATEN KEPULAUAN ARU',
      instansi: 'BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH',
      alamat: 'Jl. Pemda - Email : bpkad.kepulauanarukab@gmail.com',
      logo: '',
      pimpinan_jabatan: 'KEPALA BADAN',
      pimpinan_nama: 'NAMA PIMPINAN, S.Sos',
      pimpinan_nip: '19XXXXXXXXXXXXXXX'
    };
    setConfig(defaultConfig);
    setPreview(null);
    localStorage.removeItem('app_config');
    toast.info('Pengaturan dikembalikan ke default');
  };

  const [oldPin, setOldPin] = useState('');
  const [specialPin, setSpecialPin] = useState('');
  const handleUpdatePin = async () => {
    if (specialPin.length < 4) {
      toast.error('PIN minimal 4 karakter');
      return;
    }
    try {
      await api.post('/auth/update-pin', { oldPin, newPin: specialPin });
      toast.success('PIN Khusus diperbarui');
      setSpecialPin('');
      setOldPin('');
    } catch (err: any) {
      toast.error('Gagal memperbarui PIN', {
        description: err.response?.data?.message || 'Pastikan PIN lama Anda benar'
      });
    }
  };

  const [isPurging, setIsPurging] = useState(false);
  const [applyingTriggers, setApplyingTriggers] = useState(false);
  const [triggerResult, setTriggerResult] = useState<any>(null);

  const handleApplyTriggers = async () => {
    setApplyingTriggers(true);
    setTriggerResult(null);
    try {
      const res = await api.post('/admin/apply-db-triggers');
      setTriggerResult({ success: true, triggers: res.data.triggers });
      toast.success('Trigger proteksi berhasil diterapkan', {
        description: `${res.data.triggers?.length} trigger aktif di database.`
      });
    } catch (err: any) {
      setTriggerResult({ success: false, error: err.response?.data?.message || err.message });
      toast.error('Gagal menerapkan trigger', { description: err.response?.data?.message });
    } finally {
      setApplyingTriggers(false);
    }
  };
  const handlePurgeData = async () => {
    const pin = prompt('Tindakan ini sangat berbahaya. Masukkan PIN KHUSUS Anda untuk melanjutkan:');
    
    if (pin) {
      setIsPurging(true);
      try {
        const res = await api.post('/admin/purge-all-data', { pin });
        if (res.data.success) {
           toast.success('Pembersihan Berhasil', {
             description: 'Sistem sekarang kosong dan siap untuk data real.'
           });
        }
      } catch (err: any) {
        toast.error('Gagal membersihkan data', {
          description: err.response?.data?.message || 'PIN SALAH atau terjadi kesalahan sistem'
        });
      } finally {
        setIsPurging(false);
      }
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-fin-text-primary">Pengaturan Aplikasi</h1>
        <p className="text-sm text-fin-text-muted">Konfigurasi identitas instansi dan kop surat untuk laporan resmi.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Left Column: Form Settings */}
        <div className="md:col-span-2 space-y-6">
          <Card className="p-6 border-fin-border shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-fin-border">
               <Building2 size={18} className="text-fin-info-text" />
               <h2 className="text-sm font-bold text-fin-text-primary">Detail Identitas Instansi</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pemerintah" className="text-xs font-semibold text-fin-text-muted">Nama Pemerintah Daerah</Label>
                <Input 
                  id="pemerintah" 
                  value={config.pemerintah} 
                  onChange={(e) => setConfig({...config, pemerintah: e.target.value.toUpperCase()})}
                  className="bg-fin-page border-fin-border focus:ring-ds-focus-ring font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="instansi" className="text-xs font-semibold text-fin-text-muted">Nama Badan / Dinas (Instansi)</Label>
                <Input 
                  id="instansi" 
                  value={config.instansi} 
                  onChange={(e) => setConfig({...config, instansi: e.target.value.toUpperCase()})}
                  className="bg-fin-page border-fin-border focus:ring-ds-focus-ring font-medium"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="alamat" className="text-xs font-semibold text-fin-text-muted">Alamat & Kontak (Kaki Kop)</Label>
                <Input 
                  id="alamat" 
                  value={config.alamat} 
                  onChange={(e) => setConfig({...config, alamat: e.target.value})}
                  className="bg-fin-page border-fin-border focus:ring-ds-focus-ring font-medium"
                  placeholder="Jl. Raya No. 1, Email: instansi@go.id"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-fin-border shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-fin-border">
               <User size={18} className="text-fin-info-text" />
               <h2 className="text-sm font-bold text-fin-text-primary">Informasi Pimpinan (Penanda Tangan)</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="p_jabatan" className="text-xs font-semibold text-fin-text-muted">Jabatan Pimpinan</Label>
                <Input 
                  id="p_jabatan" 
                  value={config.pimpinan_jabatan} 
                  onChange={(e) => setConfig({...config, pimpinan_jabatan: e.target.value.toUpperCase()})}
                  className="bg-fin-page border-fin-border font-medium"
                  placeholder="CONTOH: KEPALA BADAN"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="p_nama" className="text-xs font-semibold text-fin-text-muted">Nama Lengkap & Gelar</Label>
                <Input 
                  id="p_nama" 
                  value={config.pimpinan_nama} 
                  onChange={(e) => setConfig({...config, pimpinan_nama: e.target.value})}
                  className="bg-fin-page border-fin-border font-medium"
                  placeholder="Nama Lengkap, Gelar"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="p_nip" className="text-xs font-semibold text-fin-text-muted">NIP Pimpinan</Label>
                <Input 
                  id="p_nip" 
                  value={config.pimpinan_nip} 
                  onChange={(e) => setConfig({...config, pimpinan_nip: e.target.value})}
                  className="bg-fin-page border-fin-border font-medium"
                  placeholder="19xxxxxxxxxxxxxxx"
                />
              </div>
            </div>
          </Card>

          <Card className="p-6 border-fin-border shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-fin-border">
               <ImageIcon size={18} className="text-fin-info-text" />
               <h2 className="text-sm font-bold text-fin-text-primary">Logo Resmi Instansi</h2>
            </div>

            <div className="flex items-center gap-6">
              <div className="w-24 h-24 bg-fin-page border-2 border-dashed border-fin-border rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                {preview ? (
                  <img src={preview} alt="Preview Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <ImageIcon size={24} className="text-fin-text-muted/40" />
                )}
              </div>
              
              <div className="flex-1 space-y-3">
                <p className="text-[11px] text-fin-text-muted leading-relaxed">Unggah logo instansi dalam format PNG atau JPG. Disarankan menggunakan latar belakang transparan (PNG) untuk hasil terbaik pada PDF.</p>
                <div className="flex items-center gap-3">
                   <Label htmlFor="logo-upload" className="cursor-pointer flex items-center gap-2 px-4 h-9 bg-fin-surface border border-fin-border rounded-lg text-xs font-bold text-fin-text-primary hover:bg-fin-page transition-all shadow-sm">
                      <Upload size={14} />
                      Pilih Logo Baru
                      <input id="logo-upload" type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                   </Label>
                   {preview && (
                     <Button variant="ghost" size="sm" onClick={() => {setPreview(null); setConfig({...config, logo: ''})}} className="text-[#F04438] text-[10px] font-bold hover:bg-[#FEF3F2]">
                       Hapus
                     </Button>
                   )}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-fin-border shadow-sm space-y-6">
            <div className="flex items-center gap-2 pb-2 border-b border-fin-border">
               <Lock size={18} className="text-fin-info-text" />
               <h2 className="text-sm font-bold text-fin-text-primary">Keamanan & PIN Khusus</h2>
            </div>

            <div className="flex flex-col md:flex-row items-end gap-4">
               <div className="flex-1 space-y-2">
                  <Label htmlFor="old-pin" className="text-xs font-semibold text-fin-text-muted">PIN Lama (Kosongkan jika belum ada)</Label>
                  <Input 
                    id="old-pin" 
                    type="password"
                    value={oldPin} 
                    onChange={(e) => setOldPin(e.target.value)}
                    className="bg-fin-page border-fin-border font-bold tracking-widest"
                    placeholder="****"
                    maxLength={10}
                  />
               </div>
               <div className="flex-1 space-y-2">
                  <Label htmlFor="pin" className="text-xs font-semibold text-fin-text-muted">PIN Baru Administrator</Label>
                  <Input 
                    id="pin" 
                    type="password"
                    value={specialPin} 
                    onChange={(e) => setSpecialPin(e.target.value)}
                    className="bg-fin-page border-fin-border font-bold tracking-widest"
                    placeholder="****"
                    maxLength={10}
                  />
               </div>
               <Button onClick={handleUpdatePin} variant="outline" className="h-10 px-6 border-fin-border hover:bg-fin-page text-xs font-bold shrink-0 transition-all">
                 Terapkan PIN Baru
               </Button>
            </div>
          </Card>
        </div>

        {/* Right Column: Preview Kop */}
        <div className="space-y-6">
          <Card className="p-6 border-fin-border bg-ds-primary text-white shadow-xl space-y-4">
             <h3 className="text-xs font-bold uppercase tracking-widest text-white/60">Live Preview Kop Surat</h3>
             <div className="bg-fin-surface rounded-lg p-4 text-fin-text-primary min-h-[120px] shadow-inner flex flex-col items-center justify-center text-center">
                <div className="flex items-center gap-4 w-full">
                  <div className="w-12 h-15 bg-slate-50 flex items-center justify-center">
                    {preview ? <img src={preview} className="max-h-full" /> : <div className="text-[8px] text-slate-300">LOGO</div>}
                  </div>
                  <div className="flex-1">
                    <p className="text-[9px] font-extrabold uppercase leading-tight">{config.pemerintah}</p>
                    <p className="text-[10px] font-black uppercase leading-tight mt-0.5">{config.instansi}</p>
                    <p className="text-[7px] font-medium text-slate-500 mt-1">{config.alamat}</p>
                  </div>
                </div>
                <div className="w-full h-[1.5px] bg-ds-primary mt-2"></div>
                <div className="w-full h-[0.5px] bg-ds-primary mt-[1px]"></div>
             </div>
             <p className="text-[10px] text-white/50 italic">*Tampilan di atas adalah simulasi posisi Kop pada dokumen PDF.</p>
          </Card>

          <div className="flex flex-col gap-3">
            <Button onClick={handleSave} className="w-full bg-[#2E90FA] hover:bg-[#1570EF] text-white h-11 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98] transition-all">
              <Save size={18} />
              Simpan Perubahan
            </Button>
            <Button onClick={handleReset} variant="outline" className="w-full h-11 rounded-xl font-bold text-fin-text-muted border-fin-border hover:bg-fin-page">
              <RefreshCw size={16} className="mr-2" />
              Reset ke Default
            </Button>
          </div>
        </div>

      </div>

      {/* Info Card */}
      <Card className="bg-fin-page border-fin-border p-4 flex items-start gap-3">
         <AlertCircle size={20} className="text-fin-info-text mt-0.5" />
         <div className="space-y-1">
            <h4 className="text-sm font-bold text-fin-text-primary">Penting untuk Diketahui</h4>
            <p className="text-xs text-fin-text-muted leading-relaxed">
              Pengaturan ini disimpan secara lokal di browser Anda. Jika Anda mengakses aplikasi dari komputer lain, Anda mungkin perlu mengatur ulang atau mengunggah logo kembali. Untuk perubahan permanen di server, silakan hubungi tim Administrator Sistem BPKAD.
            </p>
         </div>
      </Card>

      {/* Proteksi Database */}
      <Card className="border-blue-200 bg-blue-50 p-8 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-blue-200">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-700">
            <ShieldCheck size={20} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-blue-900">Proteksi Database</h3>
            <p className="text-xs text-blue-700">Trigger PostgreSQL untuk mencegah penghapusan field kritis secara tidak sengaja.</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          <div className="space-y-1 flex-1">
            <h4 className="text-sm font-bold text-blue-900">Trigger Proteksi tanggal_pencairan</h4>
            <p className="text-xs text-blue-700 max-w-lg leading-relaxed">
              Menerapkan trigger PostgreSQL yang memblokir setiap operasi UPDATE yang mencoba
              menghapus (meng-null-kan) field <code className="bg-blue-100 px-1 rounded">tanggal_pencairan</code> pada
              tabel <code className="bg-blue-100 px-1 rounded">data_sp2d</code> dan <code className="bg-blue-100 px-1 rounded">data_sp2d_potongan</code>.
              Jalankan sekali setelah pertama deploy atau setelah update database.
            </p>
            {triggerResult && (
              <div className={`mt-2 p-3 rounded-lg text-xs font-mono ${triggerResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {triggerResult.success
                  ? triggerResult.triggers?.map((t: any) => `✓ ${t.trigger} → ${t.tabel}`).join('\n')
                  : `✗ ${triggerResult.error}`}
              </div>
            )}
          </div>
          <Button
            onClick={handleApplyTriggers}
            disabled={applyingTriggers}
            className="bg-blue-700 hover:bg-blue-800 text-white font-bold h-11 px-6 rounded-xl shadow transition-all flex items-center gap-2 shrink-0"
          >
            {applyingTriggers ? <RefreshCw size={16} className="animate-spin" /> : <Database size={16} />}
            Terapkan Trigger
          </Button>
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="border-[#FECDCA] bg-[#FFFBFA] p-8 space-y-6">
         <div className="flex items-center gap-3 pb-4 border-b border-[#FEE4E2]">
            <div className="p-2 bg-[#FEE4E2] rounded-lg text-[#D92D20]">
               <ShieldAlert size={20} />
            </div>
            <div>
               <h3 className="text-lg font-bold text-[#912018]">Zona Bahaya (Administrator Only)</h3>
               <p className="text-xs text-[#B42318]">Tindakan di bawah ini bersifat permanen dan tidak dapat dibatalkan.</p>
            </div>
         </div>

         <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1">
               <h4 className="text-sm font-bold text-[#912018]">Bersihkan Seluruh Data Transaksi Dummy</h4>
               <p className="text-xs text-[#B42318] max-w-lg leading-relaxed">
                  Menghapus permanen seluruh data transaksi. Tindakan ini memerlukan **PIN KHUSUS** yang telah Anda atur di bagian Keamanan di atas.
               </p>
            </div>
            <Button 
              onClick={handlePurgeData}
              disabled={isPurging}
              className="bg-[#D92D20] hover:bg-[#B42318] text-white font-bold h-11 px-8 rounded-xl shadow-lg shadow-red-200 transition-all flex items-center gap-2 shrink-0"
            >
               {isPurging ? <RefreshCw size={18} className="animate-spin" /> : <ShieldAlert size={18} />}
               Reset Data dengan PIN
            </Button>
         </div>
      </Card>
    </div>
  );
}
