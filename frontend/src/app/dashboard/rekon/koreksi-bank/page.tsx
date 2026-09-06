'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Plus,
  RefreshCw,
  Landmark,
  Ban,
  FileText,
  Upload,
  Trash2,
  Eye,
  Pencil,
  CheckCircle2,
  AlertCircle,
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

interface SumberDana {
  id: string;
  nama: string;
  nomor_rekening: string | null;
}

interface DetailRow {
  _key: string;
  jenis_koreksi: 'KURANG_TRANSFER' | 'LEBIH_TRANSFER' | 'PEMINDAHBUKUAN_TANPA_SP2D' | 'PENUTUP_SELISIH';
  nilai: string;
  uraian: string;
  id_sumber_dana: string;
  ref_bank_id: string;
  ref_bank_koreksi_id: string;
  ref_sp2d_id: string;
}

interface SuratKoreksi {
  id: string;
  nomor_surat: string;
  tanggal_surat: string;
  tanggal_diterima: string | null;
  pihak_bank: string | null;
  keterangan: string | null;
  file_path: string | null;
  total_nilai: number;
  status: string;
  user_pelaksana: string | null;
  created_at: string;
  details: DetailKoreksi[];
}

interface DetailKoreksi {
  id: string;
  id_surat: string;
  jenis_koreksi: string;
  nilai: number;
  uraian: string;
  id_sumber_dana: string | null;
  ref_bank_id: number | null;
  ref_sp2d_id: string | null;
  ref_penyesuaian_id: string | null;
  ref_bank_koreksi_id?: string | null;
  status: string;
}

interface Sp2dCandidate {
  id: string;
  nomor: string;
  tanggal: string;
  tanggal_pencairan: string | null;
  opd: string;
  penerima: string;
  nilai_bruto: number;
  nilai_potongan: number;
  nilai_neto: number;
  totalBankDebit: number;
  selisihTersisa: number;
  status_rekon: string;
  selisih_rekon: number;
  arah: 'LEBIH' | 'KURANG';
  basis: 'LANGSUNG' | 'POTONGAN';
  catatan_selisih: string | null;
}

interface BankCandidate {
  id: number;
  tanggal: string;
  deskripsi: string;
  nomor_bukti: string | null;
  debet: number;
  kredit: number;
  is_matched: boolean;
  selisih_nilai: number;
  catatan_selisih: string | null;
  ref_bku_id: string | null;
  statusKandidat: 'UNMATCHED' | 'SELISIH_MATCHED';
}

const JENIS_OPTIONS = [
  { value: 'KURANG_TRANSFER', label: 'Kurang Transfer' },
  { value: 'LEBIH_TRANSFER', label: 'Lebih Transfer' },
  { value: 'PEMINDAHBUKUAN_TANPA_SP2D', label: 'Pemindahbukuan Tanpa SP2D' },
  { value: 'PENUTUP_SELISIH', label: 'Penutup Selisih (Koreksi Bank)' },
];

let keyCounter = 0;
const makeKey = () => `row-${++keyCounter}-${Date.now()}`;

const emptyRow = (): DetailRow => ({
  _key: makeKey(),
  jenis_koreksi: 'KURANG_TRANSFER',
  nilai: '',
  uraian: '',
  id_sumber_dana: '',
  ref_bank_id: '',
  ref_bank_koreksi_id: '',
  ref_sp2d_id: '',
});

const statusBadge = (status: string) => {
  if (status === 'APPLIED') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">APPLIED</Badge>;
  if (status === 'VOID') return <Badge className="bg-red-100 text-red-700 border-red-200">VOID</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200">{status}</Badge>;
};

const jenisLabel = (j: string) => JENIS_OPTIONS.find(o => o.value === j)?.label ?? j;

// Hapus suffix snapshot [SNAP] (JSON audit trail) dari uraian detail PENUTUP_SELISIH
// saat memuat draft edit, agar user tidak melihat/mengedit teks JSON internal.
const cleanSnapUraian = (u: string) => {
  const i = u.indexOf('[SNAP]');
  return i === -1 ? u : u.slice(0, i).trim();
};

export default function KoreksiBankPage() {
  const [nomorSurat, setNomorSurat] = useState('');
  const [tanggalSurat, setTanggalSurat] = useState('');
  const [tanggalDiterima, setTanggalDiterima] = useState('');
  const [pihakBank, setPihakBank] = useState('');
  const [keterangan, setKeterangan] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isKBSubmitting, setIsKBSubmitting] = useState(false);

  const [historyYear, setHistoryYear] = useState(new Date().getFullYear().toString());
  const { data: kbHistoryData, mutate: mutateKBHistory } = useSWR(
    `/koreksi-bank?tahun=${historyYear}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const [detailSurat, setDetailSurat] = useState<SuratKoreksi | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showVoid, setShowVoid] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const { data: bankCandidates } = useSWR('/koreksi-bank/bank-candidates', fetcher, { revalidateOnFocus: false });
  const { data: sp2dListData } = useSWR('/koreksi-bank/sp2d-candidates', fetcher, { revalidateOnFocus: false });
  const sp2dList: Sp2dCandidate[] = (sp2dListData?.data ?? []) as Sp2dCandidate[];

  const { data: sumberDanaRes } = useSWR('/dss/sumber-dana', fetcher);
  const sumberDanaList: SumberDana[] = Array.isArray(sumberDanaRes) ? sumberDanaRes : (sumberDanaRes?.data || []);

  // Prefill draft dari auto-detect (query params: draft=1&jenis=...&sp2d=...&bank=...&nilai=...&uraian=...)
  const [rows, setRows] = useState<DetailRow[]>(() => {
    if (typeof window === 'undefined') return [emptyRow()];
    const sp = new URLSearchParams(window.location.search);
    if (sp.get('draft') !== '1') return [emptyRow()];
    // Defer toast to avoid setState-in-effect lint
    queueMicrotask(() => toast.success('Draft koreksi dari auto-detect telah diisi. Silakan lengkapi & submit.'));
    return [{
      _key: makeKey(),
      jenis_koreksi: (sp.get('jenis') || 'KURANG_TRANSFER') as DetailRow['jenis_koreksi'],
      nilai: sp.get('nilai') || '',
      uraian: sp.get('uraian') || '',
      id_sumber_dana: '',
      ref_bank_id: sp.get('bank') || '',
      ref_bank_koreksi_id: '',
      ref_sp2d_id: sp.get('sp2d') || '',
    }];
  });

  const updateRow = (key: string, field: keyof DetailRow, val: string) => {
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: val } : r));
  };
  const addRow = () => setRows(prev => [...prev, emptyRow()]);
  const removeRow = (key: string) => setRows(prev => prev.length <= 1 ? prev : prev.filter(r => r._key !== key));

  const totalNilai = useMemo(
    () => rows.reduce((s, r) => s + (parseFloat(r.nilai) || 0), 0),
    [rows]
  );

  const rowAnalysis = (r: DetailRow) => {
    const nilai = parseFloat(r.nilai) || 0;
    let kind = 'none' as string;
    let before = 0;
    let after = 0;
    let balanced = false;
    let basis: 'LANGSUNG' | 'POTONGAN' | null = null;
    if (r.jenis_koreksi === 'KURANG_TRANSFER' || r.jenis_koreksi === 'LEBIH_TRANSFER') {
      const sp = sp2dList.find((s) => s.id === r.ref_sp2d_id);
      if (sp) {
        kind = r.jenis_koreksi === 'KURANG_TRANSFER' ? 'KURANG' : 'LEBIH';
        // selisih_rekon bertanda dari catatan admin (KURANG negatif / LEBIH positif).
        before = Number(sp.selisih_rekon || 0);
        after = before + (kind === 'LEBIH' ? -nilai : nilai);
        balanced = Math.abs(after) <= 0.005;
        basis = sp.basis || 'LANGSUNG';
      }
    } else if (r.jenis_koreksi === 'PENUTUP_SELISIH') {
      const bank = (bankCandidates?.data ?? []).find((b: BankCandidate) => String(b.id) === String(r.ref_bank_id));
      if (bank) {
        kind = 'PENUTUP';
        before = Number(bank.selisih_nilai || 0);
        after = before - nilai;
        balanced = Math.abs(after) <= 0.005;
      }
    }
    return { kind, before, after, balanced, basis };
  };

  const totalSisa = rows.reduce((sum, r) => sum + rowAnalysis(r).after, 0);

  const resetKBForm = () => {
    setNomorSurat(''); setTanggalSurat(''); setTanggalDiterima('');
    setPihakBank(''); setKeterangan(''); setFile(null);
    setRows([emptyRow()]);
  };

  const handleSubmitKB = async () => {
    if (!nomorSurat.trim()) return toast.error('Nomor surat wajib diisi.');
    if (!tanggalSurat) return toast.error('Tanggal surat wajib diisi.');
    const validRows = rows.filter(r => r.nilai && parseFloat(r.nilai) > 0 && r.uraian.trim());
    if (validRows.length === 0) return toast.error('Minimal 1 detail dengan nilai > 0 dan uraian.');

    for (const r of validRows) {
      if (r.jenis_koreksi === 'PEMINDAHBUKUAN_TANPA_SP2D' && !r.id_sumber_dana) {
        return toast.error('Sumber dana wajib untuk pemindahbukuan tanpa SP2D.');
      }
      if (r.jenis_koreksi === 'PENUTUP_SELISIH') {
        if (!r.id_sumber_dana) return toast.error('Sumber dana wajib untuk penutup selisih (penyesuaian kas).');
        if (!r.ref_bank_id) return toast.error('Baris bank induk (selisih) wajib dipilih.');
        if (!r.ref_bank_koreksi_id) return toast.error('Baris perbaikan bank (koreksi) wajib dipilih.');
        if (String(r.ref_bank_id) === String(r.ref_bank_koreksi_id)) {
          return toast.error('Baris induk dan baris koreksi tidak boleh sama.');
        }
        continue;
      }
      const refBankRow = (bankCandidates?.data ?? []).find(
        (b: BankCandidate) => r.ref_bank_id && String(b.id) === String(r.ref_bank_id)
      );
      const isSelisihMatched = refBankRow?.statusKandidat === 'SELISIH_MATCHED';
      if ((r.jenis_koreksi === 'KURANG_TRANSFER' || r.jenis_koreksi === 'LEBIH_TRANSFER') && !r.ref_sp2d_id && !isSelisihMatched) {
        return toast.error('Ref SP2D wajib untuk kurang/lebih transfer.');
      }
      if (!r.ref_bank_id) {
        return toast.error('Ref Bank wajib dipilih untuk koreksi.');
      }
      if (r.jenis_koreksi === 'KURANG_TRANSFER' || r.jenis_koreksi === 'LEBIH_TRANSFER') {
        const bankRow = (bankCandidates?.data ?? []).find(
          (b: BankCandidate) => String(b.id) === String(r.ref_bank_id)
        );
        const bankDebet = Number(bankRow?.debet || 0) > 0;
        const arahCocok = r.jenis_koreksi === 'KURANG_TRANSFER' ? bankDebet : !bankDebet;
        if (bankRow && !arahCocok) {
          toast.warning(
            `Item diarahkan ${r.jenis_koreksi === 'KURANG_TRANSFER' ? 'Debet' : 'Kredit'}, tetapi baris bank terpilih berarah ${bankDebet ? 'Debet' : 'Kredit'}. Lanjutkan hanya bila yakin.`
          );
        }
      }
    }

    setIsKBSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('nomor_surat', nomorSurat.trim());
      fd.append('tanggal_surat', tanggalSurat);
      if (tanggalDiterima) fd.append('tanggal_diterima', tanggalDiterima);
      if (pihakBank) fd.append('pihak_bank', pihakBank.trim());
      if (keterangan) fd.append('keterangan', keterangan.trim());
      if (file) fd.append('file', file);
      fd.append('details', JSON.stringify(validRows.map(({ _key, ...rest }) => rest)));

      await api.post('/koreksi-bank', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Koreksi bank berhasil disimpan.');
      resetKBForm();
      mutateKBHistory();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Gagal menyimpan.';
      toast.error(msg);
    } finally {
      setIsKBSubmitting(false);
    }
  };

  const openDetail = async (suratId: string) => {
    try {
      const res = await api.get(`/koreksi-bank/${suratId}`);
      setDetailSurat(res.data);
      setShowDetail(true);
    } catch {
      toast.error('Gagal memuat detail.');
    }
  };

  const handleVoid = async () => {
    if (!detailSurat) return;
    setVoiding(true);
    try {
      await api.delete(`/koreksi-bank/${detailSurat.id}`);
      toast.success('Surat berhasil di-VOID.');
      setShowDetail(false);
      setShowVoid(false);
      setDetailSurat(null);
      mutateKBHistory();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Gagal mem-VOID.';
      toast.error(msg);
    } finally {
      setVoiding(false);
    }
  };

  const loadEditDraft = (surat: SuratKoreksi) => {
    setNomorSurat(surat.nomor_surat);
    setTanggalSurat(surat.tanggal_surat ? String(surat.tanggal_surat).slice(0, 10) : '');
    setTanggalDiterima(surat.tanggal_diterima ? String(surat.tanggal_diterima).slice(0, 10) : '');
    setPihakBank(surat.pihak_bank ?? '');
    setKeterangan(surat.keterangan ?? '');
    setFile(null);
    const detailRows: DetailRow[] = (surat.details ?? []).map((d) => ({
      _key: makeKey(),
      jenis_koreksi: (['KURANG_TRANSFER', 'LEBIH_TRANSFER', 'PEMINDAHBUKUAN_TANPA_SP2D', 'PENUTUP_SELISIH'].includes(d.jenis_koreksi)
        ? d.jenis_koreksi
        : 'KURANG_TRANSFER') as DetailRow['jenis_koreksi'],
      nilai: Number(d.nilai ?? 0).toString(),
      uraian: cleanSnapUraian(d.uraian ?? ''),
      id_sumber_dana: d.id_sumber_dana ?? '',
      ref_bank_id: d.ref_bank_id != null ? String(d.ref_bank_id) : '',
      ref_bank_koreksi_id: d.ref_bank_koreksi_id ?? '',
      ref_sp2d_id: d.ref_sp2d_id ?? '',
    }));
    setRows(detailRows.length > 0 ? detailRows : [emptyRow()]);
  };

  // Edit = VOID surat lama (semua efek dibalik) lalu muat ulang sebagai draft baru.
  const handleEdit = async (suratId: string) => {
    setEditing(true);
    try {
      const res = await api.get(`/koreksi-bank/${suratId}`);
      const surat: SuratKoreksi = res.data;

      await api.delete(`/koreksi-bank/${suratId}`);
      toast.success('Surat lama di-VOID. Data dimuat ke form untuk diedit.');

      loadEditDraft(surat);
      setShowDetail(false);
      setDetailSurat(null);
      setShowEditConfirm(false);
      mutateKBHistory();
      // Arahkan pandangan user ke form header di atas.
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Gagal mengedit koreksi bank.';
      toast.error(msg);
      setShowEditConfirm(false);
    } finally {
      setEditing(false);
    }
  };

  const kbList: SuratKoreksi[] = kbHistoryData?.data ?? [];

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700 pb-20">

      <PageHeader
        title="Koreksi Bank"
        description="Koreksi resmi dari bank (surat koreksi) dan penutupan selisih rekonsiliasi"
        icon={<Landmark className="size-5" />}
      />

      {/* Surat Header */}
      <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
        <CardHeader className="px-6 py-4 border-b border-fin-border bg-fin-page">
          <CardTitle className="text-xs font-semibold text-fin-text-primary flex items-center gap-2">
            <Landmark size={16} />
            Surat Koreksi Bank
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-fin-text-muted">Nomor Surat *</Label>
              <Input value={nomorSurat} onChange={e => setNomorSurat(e.target.value)} placeholder="Contoh: KB/2026/001" className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-fin-text-muted">Pihak Bank</Label>
              <Input value={pihakBank} onChange={e => setPihakBank(e.target.value)} placeholder="PT. Bank Maluku-Maluku Utara Cabang Dobo" className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium" />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-fin-text-muted">Tanggal Surat Bank *</Label>
              <Input type="date" value={tanggalSurat} onChange={e => setTanggalSurat(e.target.value)} className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-fin-text-muted">Tanggal Diterima BPKAD</Label>
              <Input type="date" value={tanggalDiterima} onChange={e => setTanggalDiterima(e.target.value)} className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-fin-text-muted">File Bukti Surat</Label>
              <Input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] ?? null)} className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-ds-primary file:text-white" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-medium text-fin-text-muted">Keterangan</Label>
            <Textarea value={keterangan} onChange={e => setKeterangan(e.target.value)} placeholder="Catatan tambahan mengenai koreksi bank ini..." rows={2} className="bg-fin-page border-fin-border rounded-lg px-4 py-2 text-sm font-medium resize-none" />
          </div>
        </CardContent>
      </Card>

      {/* Detail Rows */}
      <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
        <CardHeader className="px-6 py-4 border-b border-fin-border bg-fin-page flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-semibold text-fin-text-primary flex items-center gap-2">
            <FileText size={16} />
            Detail Koreksi ({rows.length} item)
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addRow} className="h-8 px-3 text-xs font-semibold border-fin-border hover:bg-fin-surface">
            <Plus className="w-3.5 h-3.5 mr-1" /> Tambah Baris
          </Button>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {rows.map((row, idx) => {
            const an = rowAnalysis(row);
            return (
            <div key={row._key} className="border border-fin-border rounded-lg p-3 bg-fin-page space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Item {idx + 1}</span>
                {rows.length > 1 && (
                  <button onClick={() => removeRow(row._key)} className="p-1 rounded hover:bg-red-50 text-fin-text-muted hover:text-red-500 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="grid grid-cols-12 gap-3 items-end">
                {/* BARIS 1 — Jenis, Nilai, Uraian (selalu tampil) */}
                <div className="col-span-12 sm:col-span-3 space-y-1">
                  <Label className="text-[10px] font-medium text-fin-text-muted">Jenis Koreksi *</Label>
                  <select
                    value={row.jenis_koreksi}
                    onChange={e => updateRow(row._key, 'jenis_koreksi', e.target.value)}
                    className="h-9 w-full px-2 border border-fin-border rounded-lg bg-white text-fin-text-primary text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {JENIS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>

                <div className="col-span-12 sm:col-span-3 space-y-1">
                  <Label className="text-[10px] font-medium text-fin-text-muted">Nilai (Rp) *</Label>
                  <div className="relative">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fin-text-muted text-xs font-semibold">Rp</span>
                    <NumericInput
                      placeholder="0"
                      className="pl-8 h-9 w-full bg-white border-fin-border rounded-lg text-sm font-bold text-fin-text-primary"
                      value={parseFloat(row.nilai) || 0}
                      onValueChange={(val) => updateRow(row._key, 'nilai', val.toString())}
                    />
                  </div>
                </div>

                <div className="col-span-12 sm:col-span-6 space-y-1">
                  <Label className="text-[10px] font-medium text-fin-text-muted">Uraian *</Label>
                  <Input
                    value={row.uraian}
                    onChange={e => updateRow(row._key, 'uraian', e.target.value)}
                    placeholder="Uraian koreksi..."
                    className="h-9 bg-white border-fin-border rounded-lg text-sm font-medium"
                  />
                </div>
              </div>

              {/* BARIS 2 — referensi kontekstual (Ref Bank & SP2D sejajar) */}
              <div className="grid grid-cols-12 gap-3 items-end">
                {row.jenis_koreksi === 'PENUTUP_SELISIH' ? (
                  <>
                    <div className="col-span-12 sm:col-span-4 space-y-1">
                      <Label className="text-[10px] font-medium text-fin-text-muted">Sumber Dana *</Label>
                      <select
                        value={row.id_sumber_dana}
                        onChange={e => updateRow(row._key, 'id_sumber_dana', e.target.value)}
                        className="h-9 w-full px-2 border border-fin-border rounded-lg bg-white text-fin-text-primary text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">— Pilih —</option>
                        {sumberDanaList.map((sd: SumberDana) => (
                          <option key={sd.id} value={sd.id}>{sd.nama}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-4 space-y-1">
                      <Label className="text-[10px] font-medium text-fin-text-muted">Baris Induk (Selisih) *</Label>
                      <select
                        value={row.ref_bank_id}
                        onChange={e => {
                          const v = e.target.value;
                          updateRow(row._key, 'ref_bank_id', v);
                          const b = (bankCandidates?.data ?? []).find((x: BankCandidate) => String(x.id) === String(v));
                          if (b) updateRow(row._key, 'nilai', Math.abs(Number(b.selisih_nilai || 0)).toFixed(2));
                        }}
                        className="h-9 w-full px-2 border border-fin-border rounded-lg bg-white text-fin-text-primary text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 truncate"
                      >
                        <option value="">— Pilih Baris Induk —</option>
                        {(bankCandidates?.data ?? [])
                          .filter((b: BankCandidate) => b.statusKandidat === 'SELISIH_MATCHED')
                          .map((b: BankCandidate) => {
                            const val = Number(b.debet) > 0 ? Number(b.debet) : Number(b.kredit);
                            const tipe = Number(b.debet) > 0 ? 'Debet' : 'Kredit';
                            const s = Number(b.selisih_nilai || 0);
                            return (
                              <option key={b.id} value={b.id}>
                                {format(new Date(b.tanggal), 'dd MMM yyyy', { locale: id })} | {(b.deskripsi || '').slice(0, 34)} | {tipe} {formatCurrency(val)} | selisih {formatCurrency(s)}
                              </option>
                            );
                          })}
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-4 space-y-1">
                      <Label className="text-[10px] font-medium text-fin-text-muted">Baris Perbaikan Bank (Koreksi) *</Label>
                      <select
                        value={row.ref_bank_koreksi_id}
                        onChange={e => updateRow(row._key, 'ref_bank_koreksi_id', e.target.value)}
                        className="h-9 w-full px-2 border border-fin-border rounded-lg bg-white text-fin-text-primary text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 truncate"
                      >
                        <option value="">— Pilih Baris Koreksi (bln perbaikan) —</option>
                        {(bankCandidates?.data ?? [])
                          .filter((b: BankCandidate) => b.statusKandidat === 'UNMATCHED')
                          .map((b: BankCandidate) => {
                            const val = Number(b.debet) > 0 ? Number(b.debet) : Number(b.kredit);
                            const tipe = Number(b.debet) > 0 ? 'Debet' : 'Kredit';
                            return (
                              <option key={b.id} value={b.id}>
                                {format(new Date(b.tanggal), 'dd MMM yyyy', { locale: id })} | {(b.deskripsi || '').slice(0, 34)} | {tipe} {formatCurrency(val)}
                              </option>
                            );
                          })}
                      </select>
                    </div>
                    {row.ref_bank_id && row.ref_bank_koreksi_id && (
                      <div className="col-span-12">
                        <p className="text-[9px] leading-tight text-amber-600 font-medium mt-1 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
                          Penutupan selisih — nilai mutasi bank (debet/kredit) TIDAK diubah (immutable). Sistem akan: (1) mencocokkan baris koreksi terhadap selisih induk,
                          (2) membuat penyesuaian kas otomatis di bulan perbaikan beserta jurnal, (3) mencatat riwayat di kedua baris bank + SP2D/potongan. Total Nilai (Rp) diisi = besaran selisih.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {row.jenis_koreksi === 'PEMINDAHBUKUAN_TANPA_SP2D' && (
                      <div className="col-span-12 sm:col-span-4 space-y-1">
                        <Label className="text-[10px] font-medium text-fin-text-muted">Sumber Dana *</Label>
                        <select
                          value={row.id_sumber_dana}
                          onChange={e => updateRow(row._key, 'id_sumber_dana', e.target.value)}
                          className="h-9 w-full px-2 border border-fin-border rounded-lg bg-white text-fin-text-primary text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        >
                          <option value="">— Pilih —</option>
                          {sumberDanaList.map((sd: SumberDana) => (
                            <option key={sd.id} value={sd.id}>{sd.nama}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className={`col-span-12 ${row.jenis_koreksi === 'PEMINDAHBUKUAN_TANPA_SP2D' ? 'sm:col-span-8' : (row.jenis_koreksi === 'KURANG_TRANSFER' || row.jenis_koreksi === 'LEBIH_TRANSFER') ? 'sm:col-span-6' : 'sm:col-span-12'} space-y-1`}>
                      <Label className="text-[10px] font-medium text-fin-text-muted">Ref Bank</Label>
                      <select
                        value={row.ref_bank_id}
                        onChange={e => updateRow(row._key, 'ref_bank_id', e.target.value)}
                        className="h-9 w-full px-2 border border-fin-border rounded-lg bg-white text-fin-text-primary text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 truncate"
                      >
                        <option value="">
                          {row.jenis_koreksi === 'KURANG_TRANSFER' ? '— Pilih Debit Bank pelengkap —' : row.jenis_koreksi === 'LEBIH_TRANSFER' ? '— Pilih Kredit Bank (reversal) —' : '— Pilih Bank —'}
                        </option>
                        {(bankCandidates?.data ?? [])
                          .filter((b: BankCandidate) => b.statusKandidat === 'UNMATCHED')
                          .sort((a: BankCandidate, b: BankCandidate) => {
                            const aD = Number(a.debet) > 0 ? 1 : 0;
                            const bD = Number(b.debet) > 0 ? 1 : 0;
                            // KURANG: debet dahulu; LEBIH: kredit dahulu
                            return row.jenis_koreksi === 'LEBIH_TRANSFER' ? aD - bD : bD - aD;
                          })
                          .map((b: BankCandidate) => {
                            const val = Number(b.debet) > 0 ? Number(b.debet) : Number(b.kredit);
                            const tipe = Number(b.debet) > 0 ? 'Debet' : 'Kredit';
                            const cocok =
                              (row.jenis_koreksi === 'KURANG_TRANSFER' && Number(b.debet) > 0) ||
                              (row.jenis_koreksi === 'LEBIH_TRANSFER' && Number(b.kredit) > 0);
                            return (
                              <option key={b.id} value={b.id}>
                                {format(new Date(b.tanggal), 'dd MMM yyyy', { locale: id })} | {cocok ? '✓' : ''} {tipe} {formatCurrency(val)} | {(b.deskripsi || '').slice(0, 34)}
                              </option>
                            );
                          })}
                      </select>
                      {row.ref_bank_id && (
                        <p className="text-[9px] leading-tight text-amber-600 font-medium mt-1">
                          {row.jenis_koreksi === 'KURANG_TRANSFER'
                            ? 'Pilih baris bank berarah <strong>Debet</strong> (pelengkap transfer). Untuk selisih baris bank gunakan jenis "Penutup Selisih".'
                            : row.jenis_koreksi === 'LEBIH_TRANSFER'
                              ? 'Pilih baris bank berarah <strong>Kredit</strong> (reversal lebih bayar). Baris berarah Debet tidak cocok untuk lebih transfer.'
                              : 'Untuk baris &quot;Selisih Tercatat&quot;, gunakan jenis &quot;Penutup Selisih&quot; agar nilai bank tetap (immutable).'}
                        </p>
                      )}
                    </div>
                    {(row.jenis_koreksi === 'KURANG_TRANSFER' || row.jenis_koreksi === 'LEBIH_TRANSFER') && (
                      <div className="col-span-12 sm:col-span-6 space-y-1">
                        <Label className="text-[10px] font-medium text-fin-text-muted">Referensi SP2D *</Label>
                        <select
                          value={row.ref_sp2d_id}
                          onChange={e => {
                            const v = e.target.value;
                            updateRow(row._key, 'ref_sp2d_id', v);
                            const sp = sp2dList.find((s) => s.id === v);
                            if (sp) {
                              // Nilai otomatis = besaran selisih (dari catatan admin).
                              updateRow(row._key, 'nilai', Math.abs(Number(sp.selisih_rekon || 0)).toFixed(2));
                              // Pra-pilih Jenis sesuai arah selisih (Kurang/Lebih) — bisa diubah user.
                              updateRow(row._key, 'jenis_koreksi', sp.arah === 'LEBIH' ? 'LEBIH_TRANSFER' : 'KURANG_TRANSFER');
                            }
                          }}
                          className="h-9 w-full px-2 border border-fin-border rounded-lg bg-white text-fin-text-primary text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 truncate"
                        >
                          <option value="">— Pilih SP2D berselisih (ber-catatan admin) —</option>
                          {sp2dList.map((s: Sp2dCandidate) => (
                            <option key={s.id} value={s.id}>
                              {s.arah === 'LEBIH' ? '[Lebih]' : '[Kurang]'} {s.nomor} | {format(new Date(s.tanggal), 'dd MMM yyyy', { locale: id })} | {formatCurrency(Math.abs(Number(s.selisih_rekon || 0)))}
                            </option>
                          ))}
                        </select>
                        {sp2dList.length === 0 && (
                          <p className="text-[9px] leading-tight text-amber-600 font-medium">
                            Tidak ada selisih yang diberi catatan admin. Koreksi mungkin tidak diperlukan.
                          </p>
                        )}
                        {(() => {
                          const sel = sp2dList.find((s) => s.id === row.ref_sp2d_id);
                          if (!sel) return null;
                          const selisih = Number(sel.selisih_rekon || 0);
                          return (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 space-y-1">
                              <div className="grid grid-cols-4 gap-2">
                                <div>
                                  <p className="text-[9px] font-semibold text-blue-700 uppercase tracking-wide">Arah</p>
                                  <p className={`text-xs font-bold ${sel.arah === 'LEBIH' ? 'text-emerald-700' : 'text-red-700'}`}>{sel.arah === 'LEBIH' ? 'Lebih Transfer' : 'Kurang Transfer'}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] font-semibold text-blue-700 uppercase tracking-wide">Neto SP2D</p>
                                  <p className="text-xs font-bold text-blue-900">{formatCurrency(sel.nilai_neto)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] font-semibold text-blue-700 uppercase tracking-wide">Debit Bank</p>
                                  <p className="text-xs font-bold text-blue-900">{formatCurrency(sel.totalBankDebit)}</p>
                                </div>
                                <div>
                                  <p className="text-[9px] font-semibold text-blue-700 uppercase tracking-wide">Selisih</p>
                                  <p className={`text-xs font-bold ${Math.abs(selisih) > 0.005 ? 'text-amber-600' : 'text-emerald-600'}`}>{formatCurrency(selisih)}</p>
                                </div>
                              </div>
                              <p className="text-[9px] leading-tight text-slate-500 font-medium">
                                Nilai (Rp) otomatis terisi = {formatCurrency(Math.abs(selisih))}. Jenis Koreksi di-pra-pilih sesuai arah ({sel.arah === 'LEBIH' ? 'Lebih Transfer' : 'Kurang Transfer'}) &mdash; Anda bisa menggantinya, mis. ke &quot;Penutup Selisih&quot;.
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}

                {/* PANEL REALTIME — badge + sisa (sebelum → sesudah koreksi) */}
                {an.kind !== 'none' && (
                  <div className="col-span-12">
                    <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold border ${an.balanced ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                      {an.balanced ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                      <span>{an.balanced ? 'Balance' : 'Belum balance'}</span>
                      <span className="font-medium">· Sebelum {formatCurrency(an.before)} → Sesudah koreksi sisa {formatCurrency(an.after)}</span>
                    </div>
                    {an.basis === 'POTONGAN' && (
                      <p className="text-[10px] text-fin-text-muted mt-1.5 ml-1">
                        Basis POTONGAN — koreksi menutup selisih di level potongan; header SP2D di-nol-kan dan baris induk ditandai DITUTUP.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-end gap-4 border-t border-fin-border pt-3 mt-2">
            <span className="text-xs font-semibold text-fin-text-muted">Total Nilai: <span className="text-lg font-bold text-ds-primary ml-2">{formatCurrency(totalNilai)}</span></span>
            {totalSisa !== 0 && (
              <span className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-semibold border ${Math.abs(totalSisa) <= 0.005 ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
                {Math.abs(totalSisa) <= 0.005 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                Total sisa setelah koreksi: {formatCurrency(totalSisa)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex justify-end gap-3">
        <Button onClick={resetKBForm} variant="ghost" className="h-11 px-6 text-sm font-semibold text-fin-text-muted">
          Reset
        </Button>
        <Button onClick={handleSubmitKB} disabled={isKBSubmitting} className="h-11 px-10 bg-ds-primary text-white rounded-lg font-semibold text-sm shadow-lg shadow-[#101828]/20 active:scale-95 gap-2">
          {isKBSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Simpan Koreksi Bank
        </Button>
      </div>

      {/* History */}
      <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
        <CardHeader className="px-6 py-4 border-b border-fin-border bg-fin-page flex flex-row items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-xs font-semibold text-fin-text-primary flex items-center gap-2">
            <FileText size={16} />
            Riwayat Surat Koreksi ({kbList.length})
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium text-fin-text-muted">Tahun:</Label>
            <Input
              type="number"
              value={historyYear}
              onChange={e => setHistoryYear(e.target.value)}
              className="h-8 w-24 bg-fin-page border-fin-border rounded-lg text-xs font-medium"
            />
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {kbList.length === 0 ? (
            <p className="text-center text-xs text-fin-text-muted py-8">Belum ada surat koreksi bank.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-fin-page">
                    <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Nomor Surat</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Tanggal Surat</TableHead>
                    <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Pihak Bank</TableHead>
                    <TableHead className="px-3 py-2 text-right text-[10px] font-semibold text-fin-text-muted">Total</TableHead>
                    <TableHead className="px-3 py-2 text-center text-[10px] font-semibold text-fin-text-muted">Status</TableHead>
                    <TableHead className="px-3 py-2 text-center text-[10px] font-semibold text-fin-text-muted">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-[#E9ECEF]">
                  {kbList.map((s) => (
                    <TableRow key={s.id} className="hover:bg-fin-page transition-colors">
                      <TableCell className="px-3 py-2 text-xs font-semibold text-fin-text-primary">{s.nomor_surat}</TableCell>
                      <TableCell className="px-3 py-2 text-xs font-medium text-fin-text-muted">{format(new Date(s.tanggal_surat), 'dd MMM yyyy', { locale: id })}</TableCell>
                      <TableCell className="px-3 py-2 text-xs font-medium text-fin-text-muted max-w-[240px] truncate">{s.pihak_bank ?? '-'}</TableCell>
                      <TableCell className="px-3 py-2 text-xs font-bold text-fin-text-primary text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Number(s.total_nilai))}</TableCell>
                      <TableCell className="px-3 py-2 text-center">{statusBadge(s.status)}</TableCell>
                      <TableCell className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1">
                          {s.status === 'APPLIED' && (
                            <button onClick={() => { setEditTargetId(s.id); setShowEditConfirm(true); }} className="p-1.5 rounded hover:bg-emerald-50 text-fin-text-muted hover:text-emerald-600 transition-colors" title="Edit (VOID & muat ulang sebagai draft)">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => openDetail(s.id)} className="p-1.5 rounded hover:bg-blue-50 text-fin-text-muted hover:text-blue-600 transition-colors" title="Lihat Detail">
                            <Eye className="w-3.5 h-3.5" />
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

      {/* DETAIL MODAL */}
      {showDetail && detailSurat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDetail(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-fin-text-primary flex items-center gap-2"><FileText className="w-5 h-5" /> Detail Surat Koreksi</h2>
              <Button variant="ghost" size="sm" onClick={() => setShowDetail(false)}>✕</Button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-xs font-semibold text-fin-text-muted">Nomor Surat:</span> <span className="text-xs font-medium text-fin-text-primary ml-2">{detailSurat.nomor_surat}</span></div>
              <div><span className="text-xs font-semibold text-fin-text-muted">Status:</span> <span className="ml-2">{statusBadge(detailSurat.status)}</span></div>
              <div><span className="text-xs font-semibold text-fin-text-muted">Tanggal Surat:</span> <span className="text-xs font-medium text-fin-text-primary ml-2">{format(new Date(detailSurat.tanggal_surat), 'dd MMMM yyyy', { locale: id })}</span></div>
              <div><span className="text-xs font-semibold text-fin-text-muted">Tanggal Diterima:</span> <span className="text-xs font-medium text-fin-text-primary ml-2">{detailSurat.tanggal_diterima ? format(new Date(detailSurat.tanggal_diterima), 'dd MMMM yyyy', { locale: id }) : '-'}</span></div>
              <div><span className="text-xs font-semibold text-fin-text-muted">Pihak Bank:</span> <span className="text-xs font-medium text-fin-text-primary ml-2">{detailSurat.pihak_bank ?? '-'}</span></div>
              <div><span className="text-xs font-semibold text-fin-text-muted">Pelaksana:</span> <span className="text-xs font-medium text-fin-text-primary ml-2">{detailSurat.user_pelaksana}</span></div>
              {detailSurat.file_path && (
                <div className="col-span-2">
                  <span className="text-xs font-semibold text-fin-text-muted">File Bukti:</span>{' '}
                  <a href={detailSurat.file_path} target="_blank" rel="noopener noreferrer" className="text-ds-accent underline ml-2 text-xs font-medium">
                    Lihat file
                  </a>
                </div>
              )}
              {detailSurat.keterangan && (
                <div className="col-span-2"><span className="text-xs font-semibold text-fin-text-muted">Keterangan:</span> <span className="text-xs font-medium text-fin-text-primary ml-2">{detailSurat.keterangan}</span></div>
              )}
            </div>

            <div className="border-t border-fin-border pt-3">
              <h3 className="text-xs font-semibold text-fin-text-muted mb-2">Detail Item ({detailSurat.details.length})</h3>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-fin-page">
                      <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">No</TableHead>
                      <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Jenis</TableHead>
                      <TableHead className="px-3 py-2 text-right text-[10px] font-semibold text-fin-text-muted">Nilai</TableHead>
                      <TableHead className="px-3 py-2 text-[10px] font-semibold text-fin-text-muted">Uraian</TableHead>
                      <TableHead className="px-3 py-2 text-center text-[10px] font-semibold text-fin-text-muted">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-[#E9ECEF]">
                    {detailSurat.details.map((d: DetailKoreksi, i: number) => (
                      <TableRow key={d.id} className="hover:bg-fin-page transition-colors">
                        <TableCell className="px-3 py-2 text-xs font-medium text-fin-text-muted">{i + 1}</TableCell>
                        <TableCell className="px-3 py-2 text-xs font-medium text-fin-text-primary">{jenisLabel(d.jenis_koreksi)}</TableCell>
                        <TableCell className="px-3 py-2 text-xs font-bold text-fin-text-primary text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(Number(d.nilai))}</TableCell>
                        <TableCell className="px-3 py-2 text-xs font-medium text-fin-text-primary">{d.uraian}</TableCell>
                        <TableCell className="px-3 py-2 text-center">{d.status === 'APPLIED'
                          ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[9px]">APPLIED</Badge>
                          : <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[9px]">PENDING</Badge>
                        }</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-between items-center border-t border-fin-border pt-3">
              <span className="text-xs font-semibold text-fin-text-muted">Total: <span className="text-lg font-bold text-ds-primary ml-2">{formatCurrency(Number(detailSurat.total_nilai))}</span></span>
              {detailSurat.status === 'APPLIED' && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditTargetId(detailSurat.id); setShowDetail(false); setShowEditConfirm(true); }} className="gap-1">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setShowVoid(true)} className="gap-1">
                    <Ban className="w-3.5 h-3.5" /> Void Surat
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showVoid}
        onClose={() => setShowVoid(false)}
        onConfirm={handleVoid}
        title="Void Surat Koreksi Bank"
        message={`Yakin ingin mem-VOID surat ${detailSurat?.nomor_surat}? Semua efek (penyesuaian + jurnal, link bank, status SP2D) akan dibalikkan.`}
        confirmText="Ya, Void"
        type="danger"
        isLoading={voiding}
      />

      <ConfirmDialog
        isOpen={showEditConfirm}
        onClose={() => setShowEditConfirm(false)}
        onConfirm={() => editTargetId && handleEdit(editTargetId)}
        title="Edit Surat Koreksi Bank"
        message="Edit akan mem-VOID surat asli (semua efek: penyesuaian + jurnal, link bank, status SP2D dibalikkan) lalu memuat datanya ke form sebagai draft untuk diubah & disubmit ulang sebagai surat baru. Lanjutkan?"
        confirmText="Ya, Edit"
        type="warning"
        isLoading={editing}
      />
    </div>
  );
}
