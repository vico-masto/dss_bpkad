'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  Plus,
  Save,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Edit,
  Trash2,
  X,
  FileText,
  ArrowRightLeft,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  dokumen?: string | null;
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
  dokumen: '',
};

const jenisBadge = (jenis: string) =>
  jenis === 'MASUK'
    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">MASUK (+)</Badge>
    : <Badge className="bg-red-100 text-red-700 border-red-200">KELUAR (−)</Badge>;

export default function PenyesuaianKasPage() {
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
      dokumen: item.dokumen || '',
    });
    setEditId(item.id);
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
    } catch (err: unknown) {
      toast.error('Gagal menyimpan penyesuaian', { description: (err as { response?: { data?: { message?: string } } })?.response?.data?.message });
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
    } catch (err: unknown) {
      toast.error('Gagal menghapus', { description: (err as { response?: { data?: { message?: string } } })?.response?.data?.message });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const isEditing = editId !== null;
  const nilai = Number(formData.nilai) || 0;

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700 pb-20">

      <PageHeader
        title="Penyesuaian Kas"
        description="Koreksi saldo Buku Kas Umum (BUKU) manual beserta jurnal otomatis"
        icon={<ArrowRightLeft className="size-5" />}
        actions={
          isEditing ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <Edit size={12} className="text-amber-600" />
              <span className="text-xs font-semibold text-amber-700">Mode Edit Aktif</span>
              <button onClick={resetForm} className="ml-1 text-amber-500 hover:text-amber-700">
                <X size={12} />
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* FORM */}
        <Card className="lg:col-span-8 rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
          <div className="px-6 py-4 border-b border-fin-border bg-fin-page">
            <h3 className="text-xs font-semibold text-fin-text-primary flex items-center gap-2">
              <Plus size={16} />
              {editId ? `Edit Penyesuaian — ${editId}` : 'Formulir Penyesuaian'}
            </h3>
          </div>
          <CardContent className="p-8 space-y-6">

            {editId && (
              <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <AlertCircle size={16} className="text-blue-600 mt-0.5 shrink-0" />
                <p className="text-xs font-medium text-blue-700 leading-relaxed">
                  <strong>Mode Edit:</strong> Jika penyesuaian ini sebelumnya berjenis <strong>MASUK</strong> dan memicu pelunasan talangan, pelunasan tersebut <strong>tidak akan dibatalkan</strong> secara otomatis saat disimpan ulang.
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
              <div className="space-y-2">
                <Label className="text-xs font-medium text-fin-text-muted ml-1">No. Dokumen / Bukti</Label>
                <Input
                  value={formData.dokumen}
                  onChange={(e) => setFormData({ ...formData, dokumen: e.target.value })}
                  placeholder="Contoh: BKM/2026/001"
                  className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium text-fin-text-primary focus:border-ds-focus-ring transition-all"
                />
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

            {nilai > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-fin-page border border-fin-border rounded-lg">
                  <p className="text-[10px] font-semibold text-fin-text-muted uppercase tracking-wide mb-2">Debet (Dr)</p>
                  <p className="text-sm font-bold text-fin-text-primary">{formData.jenis === 'MASUK' ? '1101 — Kas di Kas Daerah' : '5299 — Belanja Lain-lain'}</p>
                  <p className="text-lg font-bold text-ds-primary mt-1">{formatCurrency(formData.jenis === 'MASUK' ? nilai : nilai)}</p>
                </div>
                <div className="p-4 bg-fin-page border border-fin-border rounded-lg">
                  <p className="text-[10px] font-semibold text-fin-text-muted uppercase tracking-wide mb-2">Kredit (Cr)</p>
                  <p className="text-sm font-bold text-fin-text-primary">{formData.jenis === 'MASUK' ? '4201 — Pendapatan Lain-lain yang Sah' : '1101 — Kas di Kas Daerah'}</p>
                  <p className="text-lg font-bold text-ds-primary mt-1">{formatCurrency(nilai)}</p>
                </div>
              </div>
            )}

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
                <p className="text-xs font-medium text-[#B54708] leading-relaxed">Koreksi akan langsung mempengaruhi <strong>Buku Kas Umum</strong>, <strong>Saldo Kas Efektif</strong>, dan <strong>Jurnal Umum</strong>.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-[#F79009] mt-1.5 shrink-0"></div>
                <p className="text-xs font-medium text-[#B54708] leading-relaxed"><strong>MASUK</strong> → Debet Kas (1101) / Kredit Pendapatan Lain-lain (4201). <strong>KELUAR</strong> → Debet Belanja Lain-lain (5299) / Kredit Kas (1101).</p>
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
              Gunakan fitur ini hanya jika terdapat kesalahan pencatatan manual yang tidak dapat diperbaiki melalui pembatalan transaksi SP2D atau Penerimaan. Koreksi bank resmi ditangani di halaman <strong>Koreksi Bank</strong>.
            </p>
          </Card>
        </div>
      </div>

      {/* LIST */}
      <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
        <CardHeader className="px-6 py-4 border-b border-fin-border bg-fin-page">
          <CardTitle className="text-xs font-semibold text-fin-text-primary flex items-center gap-2">
            <FileText size={16} />
            Riwayat Penyesuaian ({penyesuaianList.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {penyesuaianList.length === 0 ? (
            <p className="text-center text-xs text-fin-text-muted py-8">Belum ada penyesuaian.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-fin-page">
                    <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Tanggal</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Jenis</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Uraian</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Sumber Dana</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Dokumen</TableHead>
                    <TableHead className="px-3 py-2 text-right text-[10px] font-semibold text-fin-text-muted">Nilai</TableHead>
                    <TableHead className="px-3 py-2 text-center text-[10px] font-semibold text-fin-text-muted">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E9ECEF]">
                  {penyesuaianList.map((p) => (
                    <TableRow key={p.id} className="hover:bg-fin-page transition-colors">
                      <TableCell className="px-3 py-2 text-xs font-medium text-fin-text-primary">{format(new Date(p.tanggal), 'dd MMM yyyy', { locale: id })}</TableCell>
                      <TableCell className="px-3 py-2">{jenisBadge(p.jenis)}</TableCell>
                      <TableCell className="px-3 py-2 text-xs font-medium text-fin-text-primary max-w-[320px] truncate" title={p.uraian}>{p.uraian}</TableCell>
                      <TableCell className="px-3 py-2 text-xs font-medium text-fin-text-muted">{p.master_sumber_dana?.nama ?? '-'}</TableCell>
                      <TableCell className="px-3 py-2 text-xs font-medium text-fin-text-muted">{p.dokumen || '-'}</TableCell>
                      <TableCell className="px-3 py-2 text-xs font-bold text-fin-text-primary text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Number(p.nilai))}</TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleEdit(p)} className="p-1.5 rounded hover:bg-blue-50 text-fin-text-muted hover:text-blue-600 transition-colors" title="Edit">
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDeleteTarget(p)} className="p-1.5 rounded hover:bg-red-50 text-fin-text-muted hover:text-red-500 transition-colors" title="Hapus">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Hapus Penyesuaian?"
        message={`Tindakan ini akan menghapus penyesuaian "${deleteTarget?.uraian || ''}" beserta jurnalnya secara permanen. Jika penyesuaian ini sebelumnya memicu pelunasan talangan, pelunasan tersebut tidak akan dibatalkan otomatis.`}
        confirmText="Hapus Permanen"
        type="danger"
        isLoading={isDeleting}
      />
    </div>
  );
}
