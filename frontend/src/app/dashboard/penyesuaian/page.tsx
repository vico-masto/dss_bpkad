'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  History,
  Plus,
  Save,
  RefreshCw,
  AlertCircle,
  ArrowRightLeft,
  ShieldCheck,
  Edit,
  Trash2,
  Info,
  X
} from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { NumericInput } from '@/components/NumericInput';
import { PageHeader } from '@/components/patterns/page-header';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const fetcher = (url: string) => api.get(url).then(res => res.data);

interface Penyesuaian {
  id: string;
  tanggal: string;
  jenis: string;
  sisi_pengaruh: string;
  uraian: string;
  id_sumber_dana: string | null;
  nilai: number;
  user_pelaksana: string;
  created_at: string;
  master_sumber_dana?: { id: string; nama: string } | null;
}

interface SumberDana {
  id: string;
  nama: string;
  nomor_rekening: string | null;
}

const EMPTY_FORM = {
  tanggal: new Date().toISOString().split('T')[0],
  jenis: 'MASUK',
  sisi_pengaruh: 'BUKU',
  uraian: '',
  id_sumber_dana: '',
  nilai: 0,
};

export default function PenyesuaianPage() {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [editId, setEditId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Penyesuaian | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: penyesuaianRes, mutate: mutatePenyesuaian } = useSWR('/dss/penyesuaian', fetcher);
  const { data: sumberDanaRes } = useSWR('/dss/sumber-dana', fetcher);

  const penyesuaianList: Penyesuaian[] = penyesuaianRes?.data || [];
  const sumberDanaList: SumberDana[] = Array.isArray(sumberDanaRes) ? sumberDanaRes : (sumberDanaRes?.data || []);

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setEditId(null);
  };

  const handleEdit = (item: Penyesuaian) => {
    setFormData({
      tanggal: format(new Date(item.tanggal), 'yyyy-MM-dd'),
      jenis: item.jenis || 'MASUK',
      sisi_pengaruh: item.sisi_pengaruh || 'BUKU',
      uraian: item.uraian || '',
      id_sumber_dana: item.id_sumber_dana || '',
      nilai: Number(item.nilai),
    });
    setEditId(item.id);
    setActiveTab('create');
  };

  const handleSubmit = async () => {
    if (!formData.uraian.trim()) {
      toast.error('Uraian / keterangan wajib diisi.');
      return;
    }
    if (!formData.nilai || formData.nilai <= 0) {
      toast.error('Nilai harus lebih dari 0.');
      return;
    }
    setIsSubmitting(true);
    try {
      if (editId) {
        await api.put(`/dss/penyesuaian/${editId}`, formData);
        toast.success('Penyesuaian berhasil diperbarui');
      } else {
        await api.post('/dss/penyesuaian', formData);
        toast.success('Penyesuaian berhasil disimpan');
      }
      mutatePenyesuaian();
      resetForm();
      setActiveTab('history');
    } catch (err: any) {
      toast.error('Gagal menyimpan penyesuaian', { description: err.response?.data?.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await api.delete(`/dss/penyesuaian/${deleteTarget.id}`);
      toast.success('Penyesuaian berhasil dihapus');
      mutatePenyesuaian();
    } catch (err: any) {
      toast.error('Gagal menghapus', { description: err.response?.data?.message });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700 pb-20">

      <PageHeader
        title="Data Penyesuaian Saldo"
        description="Manajemen penyesuaian kas dan koreksi rekonsiliasi"
        icon={<ArrowRightLeft className="size-5" />}
        actions={
          <div className="flex items-center gap-3">
            {editId && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
                <Edit size={12} className="text-amber-600" />
                <span className="text-xs font-semibold text-amber-700">Mode Edit Aktif</span>
                <button onClick={resetForm} className="ml-1 text-amber-500 hover:text-amber-700">
                  <X size={12} />
                </button>
              </div>
            )}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'create' | 'history')} className="w-auto">
              <TabsList className="bg-fin-page rounded-lg p-1 h-10 border border-fin-border">
                <TabsTrigger value="create" className="px-6 py-1.5 rounded-lg text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all">
                  {editId ? 'Edit Koreksi' : 'Input Koreksi'}
                </TabsTrigger>
                <TabsTrigger value="history" className="px-6 py-1.5 rounded-lg text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all">
                  Log Histori
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        }
      />

      <AnimatePresence mode="wait">
        {activeTab === 'create' ? (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* FORM */}
            <Card className="lg:col-span-8 rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
              <div className="px-6 py-4 border-b border-fin-border bg-fin-page">
                <h3 className="text-xs font-semibold text-fin-text-primary flex items-center gap-2">
                  <Plus size={16} />
                  {editId ? `Edit Penyesuaian — ${editId}` : 'Formulir Penyesuaian Manual'}
                </h3>
              </div>
              <CardContent className="p-8 space-y-6">

                {/* Edit mode: peringatan auto-settlement */}
                {editId && (
                  <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-xs font-medium text-blue-700 leading-relaxed">
                      <strong>Mode Edit:</strong> Jika penyesuaian ini sebelumnya berjenis <strong>MASUK</strong> dan memicu pelunasan talangan, pelunasan tersebut <strong>tidak akan dibatalkan</strong> secara otomatis saat disimpan ulang. Hubungi administrator jika diperlukan pembalikan jurnal talangan.
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-fin-text-muted ml-1">Tanggal Efektif</Label>
                    <Input
                      type="date"
                      value={formData.tanggal}
                      onChange={(e) => setFormData({ ...formData, tanggal: e.target.value })}
                      className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium text-fin-text-primary focus:border-ds-focus-ring transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-fin-text-muted ml-1">Jenis Penyesuaian</Label>
                    <select
                      value={formData.jenis}
                      onChange={(e) => setFormData({ ...formData, jenis: e.target.value })}
                      className="h-10 w-full px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                    >
                      <option value="MASUK" className="bg-fin-surface text-fin-text-primary">Penambahan Saldo (+)</option>
                      <option value="KELUAR" className="bg-fin-surface text-fin-text-primary">Pengurangan Saldo (−)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-fin-text-muted ml-1">Sisi Pengaruh</Label>
                    <select
                      value={formData.sisi_pengaruh}
                      onChange={(e) => setFormData({ ...formData, sisi_pengaruh: e.target.value })}
                      className="h-10 w-full px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                    >
                      <option value="BUKU" className="bg-fin-surface text-fin-text-primary">BKU (Buku Kas Umum)</option>
                      <option value="BANK" className="bg-fin-surface text-fin-text-primary">Bank (Rekening Koran)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-fin-text-muted ml-1">Sumber Dana</Label>
                    <select
                      value={formData.id_sumber_dana}
                      onChange={(e) => setFormData({ ...formData, id_sumber_dana: e.target.value })}
                      className="h-10 w-full px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
                    >
                      <option value="">— Pilih Sumber Dana (opsional) —</option>
                      {sumberDanaList.map((sd) => (
                        <option key={sd.id} value={sd.id} className="bg-fin-surface text-fin-text-primary">
                          {sd.nama}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-fin-text-muted ml-1">Nilai Penyesuaian (Rp)</Label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-fin-text-muted font-semibold text-lg">Rp</div>
                    <NumericInput
                      placeholder="0"
                      className="pl-12 h-16 bg-fin-page border-fin-border rounded-lg text-2xl font-bold tracking-tight text-fin-text-primary focus:border-ds-focus-ring transition-all"
                      value={formData.nilai}
                      onValueChange={(val) => setFormData({ ...formData, nilai: val })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-medium text-fin-text-muted ml-1">Uraian / Alasan Koreksi <span className="text-red-500">*</span></Label>
                  <Textarea
                    rows={4}
                    value={formData.uraian}
                    onChange={(e) => setFormData({ ...formData, uraian: e.target.value })}
                    placeholder="Jelaskan alasan dilakukannya koreksi ini secara detail..."
                    className="bg-fin-page border-fin-border rounded-lg px-4 py-3 text-sm font-medium text-fin-text-primary focus:border-ds-focus-ring transition-all outline-none resize-none leading-relaxed"
                  />
                </div>

                <div className="pt-4 flex items-center justify-end gap-3">
                  {editId && (
                    <Button
                      variant="ghost"
                      onClick={resetForm}
                      className="h-12 px-6 rounded-lg font-semibold text-sm text-fin-text-muted hover:bg-fin-page"
                    >
                      Batal Edit
                    </Button>
                  )}
                  <Button
                    size="lg"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="h-12 px-10 bg-ds-primary text-white rounded-lg font-semibold text-sm shadow-lg shadow-[#101828]/20 active:scale-95 gap-2"
                  >
                    {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                    {editId ? 'Perbarui Penyesuaian' : 'Simpan Penyesuaian'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* RIGHT: GUIDELINES */}
            <div className="lg:col-span-4 space-y-6">
              <Card className="bg-[#FFFAEB] border border-[#FEDF89] p-6 space-y-4 rounded-xl shadow-sm">
                <div className="flex items-center gap-2 text-[#B54708]">
                  <AlertCircle size={18} />
                  <h4 className="text-sm font-semibold">Panduan Penting</h4>
                </div>
                <ul className="space-y-3">
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#F79009] mt-1.5 shrink-0"></div>
                    <p className="text-xs font-medium text-[#B54708] leading-relaxed">Koreksi akan langsung mempengaruhi <strong>Buku Kas Umum</strong> dan <strong>Saldo Kas Efektif</strong>.</p>
                  </li>
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#F79009] mt-1.5 shrink-0"></div>
                    <p className="text-xs font-medium text-[#B54708] leading-relaxed">Setiap tindakan koreksi dicatat dalam <strong>Log Aktivitas</strong> dan bersifat permanen.</p>
                  </li>
                  <li className="flex gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#F79009] mt-1.5 shrink-0"></div>
                    <p className="text-xs font-medium text-[#B54708] leading-relaxed">Penyesuaian jenis <strong>MASUK</strong> dapat memicu pelunasan otomatis talangan yang aktif.</p>
                  </li>
                </ul>
              </Card>
              <Card className="bg-ds-primary text-white rounded-xl p-6 space-y-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-[#2E90FA]" />
                  <h4 className="text-xs font-semibold">Validasi Berjenjang</h4>
                </div>
                <p className="text-xs text-fin-text-muted leading-relaxed">
                  Gunakan fitur ini hanya jika terdapat kesalahan pencatatan manual yang tidak dapat diperbaiki melalui pembatalan transaksi SP2D atau Penerimaan.
                </p>
              </Card>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-fin-page">
                    <TableRow className="border-b border-fin-border">
                      <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted">Tanggal</TableHead>
                      <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted">Sumber Dana</TableHead>
                      <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted">Uraian Koreksi</TableHead>
                      <TableHead className="px-6 py-4 text-center text-xs font-semibold text-fin-text-muted">Sisi</TableHead>
                      <TableHead className="px-6 py-4 text-right text-xs font-semibold text-fin-text-muted">Nilai (Rp)</TableHead>
                      <TableHead className="px-6 py-4 text-center text-xs font-semibold text-fin-text-muted">Tipe</TableHead>
                      <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted">Pelaku</TableHead>
                      <TableHead className="px-6 py-4 text-center text-xs font-semibold text-fin-text-muted">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-[#E9ECEF]">
                    {penyesuaianList.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="px-6 py-12 text-center text-xs font-medium text-fin-text-muted">
                          Belum ada data penyesuaian.
                        </TableCell>
                      </TableRow>
                    ) : penyesuaianList.map((item) => (
                      <TableRow key={item.id} className="hover:bg-fin-page transition-colors">
                        <TableCell className="px-6 py-4 text-xs font-medium text-fin-text-muted whitespace-nowrap">
                          {format(new Date(item.tanggal), 'dd MMM yyyy')}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-xs font-medium text-fin-text-muted max-w-[140px] truncate">
                          {item.master_sumber_dana?.nama || <span className="text-fin-text-muted italic">—</span>}
                        </TableCell>
                        <TableCell className="px-6 py-4 max-w-[240px]">
                          <p className="text-xs font-semibold text-fin-text-primary truncate">{item.uraian}</p>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-center">
                          <Badge className={cn(
                            "px-2 py-0.5 rounded text-[9px] font-bold border-none",
                            item.sisi_pengaruh === 'BANK' ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-600"
                          )}>
                            {item.sisi_pengaruh || 'BUKU'}
                          </Badge>
                        </TableCell>
                        <TableCell className={cn(
                          "px-6 py-4 text-right font-bold text-sm whitespace-nowrap",
                          item.jenis === 'MASUK' ? "text-[#027A48]" : "text-[#B42318]"
                        )} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {item.jenis === 'MASUK' ? '+' : '−'}{formatCurrency(Number(item.nilai))}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-center">
                          <Badge className={cn(
                            "px-2.5 py-1 rounded-lg text-[9px] font-bold border-none",
                            item.jenis === 'MASUK' ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#FEF3F2] text-[#B42318]"
                          )}>
                            {item.jenis === 'MASUK' ? 'Penambahan' : 'Pengurangan'}
                          </Badge>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-fin-subtle rounded-full flex items-center justify-center text-[10px] font-bold text-fin-text-muted shrink-0">
                              {(item.user_pelaksana || 'SY').slice(0, 2).toUpperCase()}
                            </div>
                            <span className="text-xs font-medium text-fin-text-primary truncate max-w-[80px]">
                              {item.user_pelaksana}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEdit(item)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-fin-text-muted hover:text-blue-600 transition-colors"
                              title="Edit penyesuaian"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(item)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-fin-text-muted hover:text-red-600 transition-colors"
                              title="Hapus penyesuaian"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Hapus Penyesuaian?"
        message={`Tindakan ini akan menghapus penyesuaian "${deleteTarget?.uraian || ''}" secara permanen dari database. Jika penyesuaian ini sebelumnya memicu pelunasan talangan, pelunasan tersebut tidak akan dibatalkan otomatis.`}
        confirmText="Hapus Permanen"
        type="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
