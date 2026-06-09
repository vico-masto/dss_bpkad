'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Plus, Trash2, Search, Upload, AlertTriangle, FileSpreadsheet, Download, Loader2, X
} from 'lucide-react';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { toast } from 'sonner';
import { PageHeader } from '@/components/patterns/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { motion } from 'framer-motion';

type ConfirmState = {
  isOpen: boolean;
  step: 'first' | 'final';
  isLoading: boolean;
};

const BULAN_LABELS: Record<string, string> = {
  null: 'Semua Bulan (Tahunan)',
  '1': 'Januari', '2': 'Februari', '3': 'Maret',
  '4': 'April', '5': 'Mei', '6': 'Juni',
  '7': 'Juli', '8': 'Agustus', '9': 'September',
  '10': 'Oktober', '11': 'November', '12': 'Desember',
};

const TAHUN_OPTIONS = [2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027];
const BULAN_OPTIONS = [
  { value: '', label: 'Tahunan (Konsolidasi)' },
  { value: '1', label: 'Januari' },
  { value: '2', label: 'Februari' },
  { value: '3', label: 'Maret' },
  { value: '4', label: 'April' },
  { value: '5', label: 'Mei' },
  { value: '6', label: 'Juni' },
  { value: '7', label: 'Juli' },
  { value: '8', label: 'Agustus' },
  { value: '9', label: 'September' },
  { value: '10', label: 'Oktober' },
  { value: '11', label: 'November' },
  { value: '12', label: 'Desember' },
];

export default function LRAManagementPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tahun, setTahun] = useState(new Date().getFullYear().toString());
  const [bulan, setBulan] = useState('null');
  const [confirm, setConfirm] = useState<ConfirmState>({ isOpen: false, step: 'first', isLoading: false });
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);

  // Manual form state
  const [manualOpen, setManualOpen] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [form, setForm] = useState({
    kode_rekening: '', uraian: '', anggaran: '', realisasi: '',
    tahun: new Date().getFullYear().toString(), bulan: '', keterangan: ''
  });

  // Upload state
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadTahun, setUploadTahun] = useState(new Date().getFullYear().toString());
  const [uploadBulan, setUploadBulan] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/dss/lra', { params: { tahun, bulan } });
      setData(res.data);
    } catch {
      toast.error('Gagal mengambil data LRA');
    } finally {
      setLoading(false);
    }
  }, [tahun, bulan]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // --- Single Delete ---
  const handleDeleteClick = (id: number) => {
    setDeleteTarget(id);
    setConfirm({ isOpen: true, step: 'first', isLoading: false });
  };

  const handleDeleteConfirm = async () => {
    if (deleteTarget === null) return;
    setConfirm(prev => ({ ...prev, isLoading: true }));
    try {
      await api.delete(`/dss/lra/${deleteTarget}`);
      toast.success('Data berhasil dihapus');
      setConfirm({ isOpen: false, step: 'first', isLoading: false });
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Gagal menghapus data');
      setConfirm(prev => ({ ...prev, isLoading: false }));
    }
  };

  // --- Mass Delete ---
  const handleMassDeleteClick = () => {
    if (data.length === 0) {
      toast.info('Tidak ada data untuk dihapus');
      return;
    }
    setDeleteTarget(null);
    setConfirm({ isOpen: true, step: 'first', isLoading: false });
  };

  const handleMassDeleteFirstConfirm = () => {
    setConfirm(prev => ({ ...prev, isOpen: false }));
    setTimeout(() => {
      setConfirm({ isOpen: true, step: 'final', isLoading: false });
    }, 250);
  };

  const handleMassDeleteFinalConfirm = async () => {
    setConfirm(prev => ({ ...prev, isLoading: true }));
    try {
      const res = await api.delete('/dss/lra/all', { params: { tahun, bulan } });
      toast.success(res.data.message);
      setConfirm({ isOpen: false, step: 'first', isLoading: false });
      fetchData();
    } catch {
      toast.error('Gagal menghapus data massal');
      setConfirm(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleConfirmAction = () => {
    if (deleteTarget !== null) {
      handleDeleteConfirm();
    } else if (confirm.step === 'first') {
      handleMassDeleteFirstConfirm();
    } else {
      handleMassDeleteFinalConfirm();
    }
  };

  const handleClose = () => {
    if (confirm.isLoading) return;
    setConfirm({ isOpen: false, step: 'first', isLoading: false });
    setDeleteTarget(null);
  };

  // --- Manual Form ---
  const handleManualSubmit = async () => {
    if (!form.kode_rekening || !form.uraian) {
      toast.error('Kode Rekening dan Uraian wajib diisi');
      return;
    }
    setFormSaving(true);
    try {
      await api.post('/dss/lra', {
        ...form,
        anggaran: parseFloat(form.anggaran || '0'),
        realisasi: parseFloat(form.realisasi || '0'),
        tahun: parseInt(form.tahun),
        bulan: form.bulan ? parseInt(form.bulan) : null,
      });
      toast.success('Data LRA berhasil ditambahkan');
      setManualOpen(false);
      setForm({ kode_rekening: '', uraian: '', anggaran: '', realisasi: '', tahun: new Date().getFullYear().toString(), bulan: '', keterangan: '' });
      fetchData();
    } catch {
      toast.error('Gagal menambahkan data');
    } finally {
      setFormSaving(false);
    }
  };

  // --- Upload ---
  const handleUploadSubmit = async () => {
    if (!uploadFile) {
      toast.error('Pilih file Excel terlebih dahulu');
      return;
    }
    if (!uploadTahun) {
      toast.error('Pilih tahun LRA');
      return;
    }
    setUploading(true);
    setUploadPercent(5);
    let trickle: ReturnType<typeof setInterval> | null = null;
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('tahun', uploadTahun);
      if (uploadBulan) formData.append('bulan', uploadBulan);

      const res = await api.post('/dss/lra/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
        onUploadProgress: (event) => {
          if (event.total && event.total > 0) {
            const pct = Math.round((event.loaded / event.total) * 70) + 5;
            setUploadPercent(Math.min(pct, 75));
            if (event.loaded >= event.total && !trickle) {
              trickle = setInterval(() => {
                setUploadPercent(p => {
                  if (p >= 96) { clearInterval(trickle!); return 96; }
                  return p + 0.3;
                });
              }, 100);
            }
          }
        }
      });
      if (trickle) clearInterval(trickle);
      setUploadPercent(100);
      toast.success(res.data.message);
      setTimeout(() => {
        setUploadOpen(false);
        setUploadFile(null);
        setUploadPercent(0);
        if (fileInputRef.current) fileInputRef.current.value = '';
        fetchData();
      }, 600);
    } catch (err: any) {
      if (trickle) clearInterval(trickle);
      const msg = err.response?.data?.message || err.response?.data?.error || 'Gagal upload file';
      toast.error(msg);
      if (err.response?.data?.headers_ditemukan) {
        console.log('Kolom ditemukan:', err.response.data.headers_ditemukan);
      }
    } finally {
      setUploading(false);
    }
  };

  const filteredData = data.filter(item => 
    item.uraian.toLowerCase().includes(search.toLowerCase()) ||
    item.kode_rekening.includes(search)
  );

  const isMassDelete = deleteTarget === null;
  const count = data.length;
  const bulanLabel = BULAN_LABELS[bulan] || `Bulan ${bulan}`;

  return (
    <div className="space-y-6">
      <PageHeader title="Manajemen Data LRA Historis" description="Kelola data realisasi anggaran tahunan dan bulanan sebagai basis proyeksi" />

      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
        <div className="flex flex-wrap gap-2">
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              placeholder="Cari uraian atau kode..." 
              className="pl-10" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select 
            className="h-10 px-3 rounded-md border bg-background text-sm"
            value={tahun}
            onChange={(e) => setTahun(e.target.value)}
          >
            {TAHUN_OPTIONS.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select 
            className="h-10 px-3 rounded-md border bg-background text-sm"
            value={bulan}
            onChange={(e) => setBulan(e.target.value)}
          >
            <option value="null">Tahunan (Konsolidasi)</option>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
              <option key={m} value={m}>Bulan {m}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button 
            variant="destructive" 
            size="sm" 
            className="gap-2"
            onClick={handleMassDeleteClick}
            disabled={data.length === 0}
          >
            <Trash2 size={16} /> Hapus Semua
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
            onClick={() => setUploadOpen(true)}
          >
            <Upload size={16} /> Import Excel
          </Button>
          <Button 
            size="sm" 
            className="gap-2 bg-ds-primary text-white"
            onClick={() => setManualOpen(true)}
          >
            <Plus size={16} /> Tambah Manual
          </Button>
        </div>
      </div>

      <Card className="border-fin-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[150px]">Kode</TableHead>
              <TableHead>Uraian</TableHead>
              <TableHead className="text-right">Anggaran</TableHead>
              <TableHead className="text-right">Realisasi</TableHead>
              <TableHead className="text-right">Capaian</TableHead>
              <TableHead className="w-[100px] text-center">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Memuat data...</TableCell></TableRow>
            ) : filteredData.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">Tidak ada data LRA untuk filter ini</TableCell></TableRow>
            ) : filteredData.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono text-xs">{item.kode_rekening}</TableCell>
                <TableCell className="font-medium">{item.uraian}</TableCell>
                <TableCell className="text-right">{formatCurrency(item.anggaran)}</TableCell>
                <TableCell className="text-right font-bold">{formatCurrency(item.realisasi)}</TableCell>
                <TableCell className="text-right">
                  {item.anggaran > 0 ? ((item.realisasi/item.anggaran)*100).toFixed(2) : 0}%
                </TableCell>
                <TableCell className="text-center">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteClick(item.id)}
                  >
                    <Trash2 size={16} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* === DIALOG: Tambah Manual === */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Tambah Data LRA Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 px-6 pb-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Tahun</label>
                <select className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  value={form.tahun} onChange={(e) => setForm(f => ({ ...f, tahun: e.target.value }))}>
                  {TAHUN_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Bulan</label>
                <select className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  value={form.bulan} onChange={(e) => setForm(f => ({ ...f, bulan: e.target.value }))}>
                  {BULAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Kode Rekening</label>
              <Input placeholder="Contoh: 5.1.01" value={form.kode_rekening}
                onChange={(e) => setForm(f => ({ ...f, kode_rekening: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Uraian</label>
              <Input placeholder="Nama rekening/akun" value={form.uraian}
                onChange={(e) => setForm(f => ({ ...f, uraian: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Anggaran (Rp)</label>
                <Input type="number" step="0.01" placeholder="0" value={form.anggaran}
                  onChange={(e) => setForm(f => ({ ...f, anggaran: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Realisasi (Rp)</label>
                <Input type="number" step="0.01" placeholder="0" value={form.realisasi}
                  onChange={(e) => setForm(f => ({ ...f, realisasi: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Keterangan (opsional)</label>
              <Input placeholder="Sumber data, notes, dll" value={form.keterangan}
                onChange={(e) => setForm(f => ({ ...f, keterangan: e.target.value }))} />
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 pt-2">
            <Button variant="ghost" onClick={() => setManualOpen(false)}>Batal</Button>
            <Button onClick={handleManualSubmit} loading={formSaving} className="bg-ds-primary text-white">
              {formSaving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === DIALOG: Import Excel === */}
      <Dialog open={uploadOpen} onOpenChange={(v) => { if (!uploading) setUploadOpen(v); }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Import Data LRA dari Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 px-6 pb-2">
            <div className="p-4 rounded-lg bg-muted/50 border border-dashed border-muted-foreground/30 text-center space-y-2">
              {uploadFile ? (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-background border">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="text-emerald-500 shrink-0" size={24} />
                    <div className="text-left">
                      <p className="text-sm font-medium truncate max-w-[280px]">{uploadFile.name}</p>
                      <p className="text-xs text-muted-foreground">{(uploadFile.size / 1024).toFixed(1)} KB</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => { setUploadFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}>
                    <X size={16} />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="mx-auto text-muted-foreground" size={32} />
                  <p className="text-sm font-medium">Klik untuk pilih file Excel</p>
                  <p className="text-xs text-muted-foreground">.xlsx atau .xls — maks 10MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setUploadFile(file);
                }}
              />
              {!uploadFile && (
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Pilih File
                </Button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Tahun Data</label>
                <select className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  value={uploadTahun} onChange={(e) => setUploadTahun(e.target.value)}>
                  {TAHUN_OPTIONS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-fin-text-muted uppercase tracking-wider">Periode</label>
                <select className="w-full h-10 px-3 rounded-md border bg-background text-sm"
                  value={uploadBulan} onChange={(e) => setUploadBulan(e.target.value)}>
                  {BULAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 flex gap-2.5">
              <AlertTriangle className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" size={16} />
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p className="font-medium">Format kolom yang didukung:</p>
                <p><strong>Kode Rekening</strong>, <strong>URAIAN</strong>, <strong>ANGGARAN</strong>, <strong>REALISASI</strong></p>
                <p>Baris dengan judul <strong>JUMLAH...</strong> atau <strong>huruf kapital</strong> akan dilewati otomatis.</p>
              </div>
            </div>
          </div>
          <DialogFooter className="px-6 pb-6 pt-2 flex flex-col gap-4">
            {uploading ? (
              <div className="w-full space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="flex justify-between items-end">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-black text-fin-text-primary uppercase tracking-widest">Status Pengunggahan</p>
                    <p className="text-xs font-medium text-[#667085]">
                      {uploadPercent < 75 ? 'Mengunggah file ke server...' : uploadPercent < 96 ? 'Server memproses data LRA...' : 'Selesai!'}
                    </p>
                  </div>
                  <p className="text-xl font-black text-fin-text-primary tabular-nums">{Math.round(uploadPercent)}%</p>
                </div>
                <div className="h-3 w-full bg-[#EAECF0] rounded-full overflow-hidden border border-fin-border-strong/20 shadow-inner">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadPercent}%` }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="h-full bg-ds-primary rounded-full"
                  />
                </div>
                <p className="text-[10px] text-center font-bold text-fin-text-muted uppercase tracking-widest">
                  {uploadPercent < 75 ? 'MENGUNGGAH FILE...' : uploadPercent < 96 ? 'SERVER MEMPROSES DATA...' : 'SELESAI — MEMUAT ULANG...'}
                </p>
              </div>
            ) : (
              <div className="flex gap-3 w-full justify-end">
                <Button variant="ghost" onClick={() => setUploadOpen(false)}>Batal</Button>
                <Button
                  onClick={handleUploadSubmit}
                  disabled={!uploadFile}
                  className="bg-ds-primary text-white"
                >
                  <Upload size={16} /> Upload & Import
                </Button>
              </div>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === Confirm Dialogs === */}
      {deleteTarget !== null && (
        <ConfirmDialog
          isOpen={confirm.isOpen}
          onClose={handleClose}
          onConfirm={handleConfirmAction}
          title="Hapus Data LRA?"
          description="Data yang dihapus tidak dapat dikembalikan. Pastikan Anda ingin menghapus item ini."
          confirmText="Ya, Hapus"
          cancelText="Batal"
          variant="danger"
          isLoading={confirm.isLoading}
        />
      )}

      {isMassDelete && confirm.isOpen && confirm.step === 'first' && (
        <ConfirmDialog
          isOpen={confirm.isOpen}
          onClose={handleClose}
          onConfirm={handleConfirmAction}
          title="Hapus Semua Data LRA?"
          description={
            <div className="space-y-3 text-left">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30">
                <AlertTriangle className="text-[#F04438] shrink-0" size={20} />
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">Tindakan ini tidak dapat dibatalkan!</p>
              </div>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between items-center py-1.5 px-3 rounded-md bg-muted/50">
                  <span className="text-fin-text-muted">Jumlah Data</span>
                  <span className="font-bold text-fin-text-primary text-lg">{count} baris</span>
                </div>
                <div className="flex justify-between items-center py-1.5 px-3 rounded-md bg-muted/50">
                  <span className="text-fin-text-muted">Tahun</span>
                  <span className="font-bold text-fin-text-primary">{tahun}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 px-3 rounded-md bg-muted/50">
                  <span className="text-fin-text-muted">Periode</span>
                  <span className="font-bold text-fin-text-primary">{bulanLabel}</span>
                </div>
              </div>
            </div>
          }
          confirmText="Lanjutkan ke Konfirmasi"
          cancelText="Batal"
          variant="danger"
        />
      )}

      {isMassDelete && confirm.isOpen && confirm.step === 'final' && (
        <ConfirmDialog
          isOpen={confirm.isOpen}
          onClose={handleClose}
          onConfirm={handleConfirmAction}
          title="Konfirmasi Akhir"
          description={
            <div className="space-y-2">
              <p className="text-center">
                Anda yakin ingin menghapus <strong className="text-[#F04438]">{count} data LRA</strong> untuk tahun <strong>{tahun}</strong> ({bulanLabel})?
              </p>
              <div className="flex items-center gap-2 justify-center p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30">
                <AlertTriangle className="text-[#F79009] shrink-0" size={16} />
                <p className="text-xs text-amber-700 dark:text-amber-400">Data yang dihapus <strong>tidak dapat</strong> dikembalikan</p>
              </div>
            </div>
          }
          confirmText="Ya, Hapus Semua"
          cancelText="Kembali"
          variant="danger"
          isLoading={confirm.isLoading}
        />
      )}
    </div>
  );
}
