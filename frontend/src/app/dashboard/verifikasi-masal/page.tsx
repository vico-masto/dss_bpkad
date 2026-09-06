'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useDropzone } from 'react-dropzone';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import {
  Ban,
  CheckCircle2,
  Download,
  Eye,
  FileSpreadsheet,
  Landmark,
  Loader2,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@/components/patterns/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type VerificationType = 'REKENING' | 'BILLING';

interface BatchRow {
  id: string;
  verification_type: VerificationType;
  filename: string;
  created_by: string | null;
  created_by_name: string | null;
  opd: string | null;
  periode: string | null;
  total_records: number;
  processed: number;
  ok_count: number;
  fail_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string | null;
  finished_at: string | null;
}

interface BatchListResponse {
  data: BatchRow[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface UploadRecord {
  nama: string;
  nomor_rekening: string;
  id_billing: string;
}

interface SingleLog {
  id: string;
  verification_type: VerificationType;
  opd: string | null;
  periode: string | null;
  input_account_name: string | null;
  input_account_no: string | null;
  input_billing_id: string | null;
  bank_registered_name: string | null;
  bank_status: string | null;
  name_match_score: number | null;
  name_match_label: string | null;
  tax_status: string | null;
  tax_type: string | null;
  tax_type_name: string | null;
  tax_amount: number | null;
  payer_name: string | null;
  error_message: string | null;
  checked_by_name: string | null;
  created_at: string;
}

interface SingleLogsResponse {
  data: SingleLog[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface ModeInfo {
  mode: 'DRY_RUN' | 'LIVE';
  isLive: boolean;
}

interface SummaryRow {
  opd: string;
  batchCount: number;
  totalRecords: number;
  processed: number;
  okCount: number;
  failCount: number;
  percentDone: number;
  percentOk: number;
}

interface SummaryResponse {
  periode: string | null;
  data: SummaryRow[];
  totals: {
    batchCount: number;
    totalRecords: number;
    processed: number;
    okCount: number;
    failCount: number;
    percentDone: number;
    percentOk: number;
  };
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Menunggu',
  PROCESSING: 'Diproses',
  COMPLETED: 'Selesai',
  PARTIAL_FAILED: 'Selesai Sebagian',
  FAILED: 'Gagal',
  CANCELLED: 'Dibatalkan',
  VALID: 'Valid',
  INVALID: 'Tidak Valid',
  NOT_FOUND: 'Tidak Ditemukan',
  ACTIVE: 'Aktif',
  EXPIRED: 'Kadaluarsa',
  ERROR: 'Error',
};

const ACTIVE_STATUSES = ['PENDING', 'PROCESSING'];

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const variant =
    status === 'COMPLETED' || status === 'VALID' || status === 'ACTIVE'
      ? 'income'
      : status === 'FAILED' || status === 'ERROR' || status === 'INVALID'
        ? 'destructive'
        : status === 'CANCELLED' || status === 'EXPIRED' || status === 'NOT_FOUND'
          ? 'warning'
          : status === 'PARTIAL_FAILED'
            ? 'warning'
            : 'secondary';
  return (
    <Badge variant={variant as 'income' | 'destructive' | 'secondary' | 'warning' | 'default'}>
      {label}
    </Badge>
  );
}

function ProgressBar({ processed, total }: { processed: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  return (
    <div className="flex items-center gap-2 min-w-28">
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className="h-1.5 rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
        {processed}/{total}
      </span>
    </div>
  );
}

function formatPeriode(p?: string | null) {
  if (p && /^\d{4}-\d{2}$/.test(p)) {
    return format(new Date(`${p}-01`), 'MMM yyyy', { locale: idLocale });
  }
  return p || '-';
}

export default function VerifikasiMasalPage() {
  const router = useRouter();
  const [tab, setTab] = useState('batch');

  // ---- Batch list state ----
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [opdFilter, setOpdFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const limit = 20;

  const batchQuery = `?page=${page}&limit=${limit}&status=${statusFilter}${opdFilter !== 'ALL' ? `&opd=${encodeURIComponent(opdFilter)}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<BatchListResponse>(
    `/verifikasi/batches${batchQuery}`,
    fetcher,
    {
      refreshInterval: (latest?: BatchListResponse) =>
        latest && (latest.data ?? []).some((b) => ACTIVE_STATUSES.includes(b.status)) ? 2000 : 0,
    }
  );

  // ---- Upload state ----
  const [uploadType, setUploadType] = useState<VerificationType | null>(null);
  const [fileName, setFileName] = useState('');
  const [rowsParsed, setRowsParsed] = useState<UploadRecord[]>([]);
  const [submitOpd, setSubmitOpd] = useState('');
  const [submitPeriode, setSubmitPeriode] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [showReview, setShowReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const opdList = useSWR<string[]>('/sp2d/opd', fetcher);
  const modeInfo = useSWR<ModeInfo>('/verifikasi/mode', fetcher);

  const activeBatchExists = (data?.data ?? []).some((b) => ACTIVE_STATUSES.includes(b.status));

  const validateRow = useCallback((type: VerificationType, row: UploadRecord) => {
    if (type === 'REKENING') {
      const no = String(row.nomor_rekening ?? '').trim();
      const nama = String(row.nama ?? '').trim();
      if (!/^\d{10,20}$/.test(no)) return 'Nomor rekening harus 10-20 digit angka';
      if (nama.length < 3) return 'Nama pemilik minimal 3 karakter';
      return null;
    }
    const idBilling = String(row.id_billing ?? '').trim();
    if (!/^\d{15,}$/.test(idBilling)) return 'ID Billing minimal 15 digit angka';
    return null;
  }, []);

  const validationSummary = useMemo(() => {
    if (!uploadType || rowsParsed.length === 0) return null;
    const invalid: { row: number; msg: string }[] = [];
    rowsParsed.forEach((r, i) => {
      const msg = validateRow(uploadType, r);
      if (msg) invalid.push({ row: i + 2, msg });
    });
    return { total: rowsParsed.length, valid: rowsParsed.length - invalid.length, invalid };
  }, [uploadType, rowsParsed, validateRow]);

  const parsePaste = useCallback((type: VerificationType, text: string): UploadRecord[] => {
    return text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/\t|;|,/).map((s) => s.trim()).filter(Boolean);
        if (type === 'REKENING') {
          return { nama: parts[0] ?? '', nomor_rekening: parts[1] ?? '', id_billing: '' };
        }
        return { nama: parts[1] ?? '', nomor_rekening: '', id_billing: parts[0] ?? '' };
      });
  }, []);

  const onDrop = useCallback(
    (accepted: File[]) => {
      const file = accepted[0];
      if (!file) {
        toast.error('Tipe file tidak didukung atau file rusak');
        return;
      }
      if (!uploadType) {
        toast.error('Pilih jenis verifikasi (REKENING / BILLING) terlebih dahulu');
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result as ArrayBuffer, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
          const rows: UploadRecord[] = raw.map((r) =>
            uploadType === 'REKENING'
              ? {
                  nama: String(r['NAMA'] ?? '').trim(),
                  nomor_rekening: String(r['NOMOR_REKENING'] ?? '').trim(),
                  id_billing: '',
                }
              : {
                  nama: String(r['NAMA (opsional)'] ?? r['NAMA'] ?? '').trim(),
                  nomor_rekening: '',
                  id_billing: String(r['ID_BILLING'] ?? '').trim(),
                }
          );
          if (rows.length === 0) {
            toast.error('File Excel kosong atau kolom tidak sesuai template');
            return;
          }
          setFileName(file.name);
          setPasteText('');
          setRowsParsed(rows);
        } catch {
          toast.error('Gagal membaca file Excel');
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [uploadType]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: false,
    noClick: true,
  });

  const resetUpload = () => {
    setUploadType(null);
    setFileName('');
    setRowsParsed([]);
    setSubmitOpd('');
    setSubmitPeriode('');
    setPasteText('');
    setShowReview(false);
  };

  const applyPaste = () => {
    if (!uploadType) return;
    const rows = parsePaste(uploadType, pasteText);
    if (rows.length === 0) {
      toast.error('Tidak ada baris valid pada teks yang ditempel');
      return;
    }
    setFileName(`paste-${Date.now()}.txt`);
    setRowsParsed(rows);
    toast.success(`${rows.length} baris dibaca dari teks`);
  };

  const downloadTemplate = async () => {
    if (!uploadType) {
      toast.error('Pilih jenis verifikasi untuk mengunduh template');
      return;
    }
    try {
      const res = await api.get('/verifikasi/template', {
        params: { type: uploadType },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `template-verifikasi-${uploadType.toLowerCase()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Gagal mengunduh template');
    }
  };

  const submitBatch = async () => {
    if (!uploadType || rowsParsed.length === 0 || !validationSummary) return;
    if (validationSummary.valid === 0) {
      toast.error('Semua baris tidak valid. Periksa kembali data Anda.');
      return;
    }
    if (!submitOpd) {
      toast.error('Pilih OPD terlebih dahulu');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/verifikasi/upload', {
        type: uploadType,
        filename: fileName,
        rows: rowsParsed,
        opd: submitOpd,
        periode: submitPeriode || undefined,
      });
      toast.success('Batch verifikasi dibuat dan mulai diproses');
      resetUpload();
      setShowReview(false);
      mutate();
      router.refresh();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal membuat batch verifikasi');
      mutate();
    } finally {
      setSubmitting(false);
    }
  };

  const cancelBatch = async (id: string) => {
    const ok = window.confirm('Batalkan batch ini? Proses verifikasi akan dihentikan.');
    if (!ok) return;
    try {
      await api.post(`/verifikasi/batches/${id}/cancel`);
      toast.success('Batch dibatalkan');
      mutate();
    } catch {
      toast.error('Gagal membatalkan batch');
    }
  };

  const retryBatch = async (id: string) => {
    try {
      await api.post(`/verifikasi/batches/${id}/retry-failed`);
      toast.success('Proses ulang antrean dimulai');
      mutate();
    } catch {
      toast.error('Gagal mengantrekan proses ulang');
    }
  };

  const deleteBatch = async (b: BatchRow) => {
    const ok = window.confirm(
      `Hapus batch "${b.filename}" beserta seluruh hasil verifikasinya? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!ok) return;
    try {
      await api.delete(`/verifikasi/batches/${b.id}`);
      toast.success('Batch dihapus');
      mutate();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e.response?.data?.message || 'Gagal menghapus batch');
    }
  };

  const exportBatch = async (id: string) => {
    try {
      const res = await api.get(`/verifikasi/batches/${id}/export`, { responseType: 'blob' });
      const disposition = res.headers['content-disposition'] as string | undefined;
      const match = disposition?.match(/filename="(.+?\.xlsx)"/) || disposition?.match(/filename=(.+?\.xlsx)/);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = match ? match[1] : `verifikasi-batch-${id}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Gagal mengekspor hasil verifikasi');
    }
  };

  // Notifikasi saat batch aktif selesai diproses
  const activeRef = useRef(new Map<string, string>());
  useEffect(() => {
    if (!data) return;
    const active = new Map<string, string>();
    for (const b of data.data) {
      if (ACTIVE_STATUSES.includes(b.status)) active.set(b.id, b.filename);
    }
    activeRef.current.forEach((fname, id) => {
      if (!active.has(id) && data.data.some((b) => b.id === id)) {
        toast.success(`Batch "${fname}" selesai diproses`);
      }
    });
    activeRef.current = active;
  }, [data]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Verifikasi Masal"
        description="Verifikasi massal & satuan nomor rekening bank dan ID Billing Pajak terhadap rekam data"
        icon={<ShieldCheck className="size-5" />}
        badge={
          <div className="flex items-center gap-2">
            <Badge variant={modeInfo.data?.isLive ? 'destructive' : 'outline'}>
              <span
                className={`mr-1 inline-block size-1.5 rounded-full ${
                  modeInfo.data?.isLive ? 'bg-destructive' : 'bg-emerald-500'
                }`}
              />
              {modeInfo.data?.mode ?? '…'}
            </Badge>
            <Badge variant="secondary">Admin</Badge>
          </div>
        }
        actions={
          <Button variant="outline" size="sm" onClick={() => { mutate(); opdList.mutate(); }} disabled={isLoading}>
            <RefreshCw className={isLoading ? 'size-4 animate-spin' : 'size-4'} />
            Muat Ulang
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(v) => { if (v) setTab(v); }}>
        <TabsList>
          <TabsTrigger value="batch">Batch</TabsTrigger>
          <TabsTrigger value="satuan">Verifikasi Satuan</TabsTrigger>
          <TabsTrigger value="rekap">Rekap per OPD</TabsTrigger>
        </TabsList>

        <TabsContent value="batch" className="flex flex-col gap-6">
          {activeBatchExists && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
              <Ban className="size-4 shrink-0" />
              Terdapat batch yang masih diproses. Maksimal satu batch aktif dalam satu waktu.
            </div>
          )}

          {/* ---- Upload section ---- */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="size-5 text-fin-text-secondary" />
                Unggah / Buat Batch Baru
              </CardTitle>
              <CardDescription>
                Pilih jenis verifikasi, lengkapi tag OPD & periode, lalu unggah file Excel atau tempel daftar (maksimal
                1000 baris per batch).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setUploadType('REKENING')}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    uploadType === 'REKENING'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="mt-0.5 rounded-md bg-fin-subtle p-2 text-fin-text-secondary">
                    <Landmark className="size-5" />
                  </span>
                  <span>
                    <span className="block font-medium">Verifikasi Rekening Bank</span>
                    <span className="block text-sm text-muted-foreground">
                      Cocokkan nomor rekening & nama nasabah dengan data bank.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setUploadType('BILLING')}
                  className={`flex items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    uploadType === 'BILLING'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-primary/40'
                  }`}
                >
                  <span className="mt-0.5 rounded-md bg-fin-subtle p-2 text-fin-text-secondary">
                    <ReceiptText className="size-5" />
                  </span>
                  <span>
                    <span className="block font-medium">Verifikasi Billing Pajak</span>
                    <span className="block text-sm text-muted-foreground">
                      Cocokkan ID Billing Pajak: status, jenis pajak, nilai, penyetor.
                    </span>
                  </span>
                </button>
              </div>

              {uploadType && (
                <>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label>OPD (wajib)</Label>
                      <Select value={submitOpd} onValueChange={(v) => { if (!v) return; setSubmitOpd(v); }}>
                        <SelectTrigger>
                          <SelectValue placeholder="Pilih OPD" />
                        </SelectTrigger>
                        <SelectContent>
                          {(opdList.data ?? []).map((o) => (
                            <SelectItem key={o} value={o}>
                              {o}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>Periode</Label>
                      <Input
                        type="month"
                        value={submitPeriode}
                        onChange={(e) => setSubmitPeriode(e.target.value)}
                        placeholder="YYYY-MM (default bulan berjalan)"
                      />
                    </div>
                    <div className="flex items-end">
                      <Button variant="outline" size="sm" onClick={downloadTemplate}>
                        <Download className="size-4" />
                        Unduh Template .xlsx
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label>
                      {uploadType === 'REKENING'
                        ? 'File berisi kolom: NAMA, NOMOR_REKENING'
                        : 'File berisi kolom: ID_BILLING, NAMA (opsional)'}
                    </Label>
                  </div>

                  <div
                    {...getRootProps()}
                    onClick={open}
                    className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
                      isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <input {...getInputProps()} />
                    <FileSpreadsheet className="size-8 text-fin-text-secondary" />
                    <p className="text-sm font-medium">
                      {isDragActive ? 'Lepaskan file di sini' : 'Tarik & lepas file Excel, atau klik untuk memilih'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {uploadType === 'BILLING'
                        ? 'ID Billing minimal 15 digit. Nilai / jenis pajak / penyetor akan diambil dari API.'
                        : 'Nomor rekening 10-20 digit. Hasil dicocokkan juga dengan nama nasabah.'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label>Atau tempel daftar (satu baris per item)</Label>
                    <Textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      rows={3}
                      placeholder={
                        uploadType === 'REKENING'
                          ? 'NAMA<tab>NOMOR_REKENING — contoh:\nBUDI SANTOSO\t1234567890123'
                          : 'ID_BILLING<tab>NAMA (opsional) — contoh:\n2609200000000000001\tBUDI SANTOSO'
                      }
                    />
                    <div className="flex justify-end">
                      <Button variant="outline" size="sm" onClick={applyPaste} disabled={!pasteText.trim()}>
                        Terapkan dari Teks
                      </Button>
                    </div>
                  </div>

                  {fileName && (
                    <div className="flex flex-col gap-3 rounded-lg border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileSpreadsheet className="size-4 shrink-0 text-fin-text-secondary" />
                          <span className="truncate text-sm font-medium">{fileName}</span>
                          <Badge variant="secondary" className="shrink-0">
                            {rowsParsed.length} baris
                          </Badge>
                        </div>
                        <Button variant="ghost" size="icon" onClick={resetUpload}>
                          <X className="size-4" />
                        </Button>
                      </div>

                      {validationSummary && (
                        <div className="flex flex-wrap gap-2 text-sm">
                          <Badge variant="income">Valid: {validationSummary.valid}</Badge>
                          <Badge variant={validationSummary.invalid.length ? 'destructive' : 'secondary'}>
                            Tidak valid: {validationSummary.invalid.length}
                          </Badge>
                          {validationSummary.invalid.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              Contoh: baris {validationSummary.invalid[0].row} — {validationSummary.invalid[0].msg}
                              {validationSummary.invalid.length > 1
                                ? ` (+${validationSummary.invalid.length - 1} lainnya)`
                                : ''}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="max-h-44 overflow-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              {uploadType === 'REKENING' ? (
                                <>
                                  <TableHead>No</TableHead>
                                  <TableHead>Nama</TableHead>
                                  <TableHead>Nomor Rekening</TableHead>
                                </>
                              ) : (
                                <>
                                  <TableHead>No</TableHead>
                                  <TableHead>ID Billing</TableHead>
                                  <TableHead>Nama</TableHead>
                                </>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rowsParsed.slice(0, 5).map((r, i) => (
                              <TableRow key={i}>
                                <TableCell>{i + 2}</TableCell>
                                {uploadType === 'REKENING' ? (
                                  <>
                                    <TableCell>{r.nama || '-'}</TableCell>
                                    <TableCell className="tabular-nums">{r.nomor_rekening || '-'}</TableCell>
                                  </>
                                ) : (
                                  <>
                                    <TableCell className="tabular-nums">{r.id_billing || '-'}</TableCell>
                                    <TableCell>{r.nama || '-'}</TableCell>
                                  </>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      {rowsParsed.length > 5 && (
                        <p className="text-xs text-muted-foreground">
                          … dan {rowsParsed.length - 5} baris lainnya
                        </p>
                      )}

                      <div className="flex justify-end">
                        <Button
                          onClick={() => setShowReview(true)}
                          disabled={!validationSummary || validationSummary.valid === 0 || !submitOpd}
                        >
                          Pratinjau & Setujui
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}

              <Dialog open={showReview} onOpenChange={setShowReview}>
                <DialogContent size="lg">
                  <DialogHeader>
                    <DialogTitle>Pratinjau & Setujui Batch</DialogTitle>
                    <DialogDescription>Periksa ringkasan sebelum batch diproses.</DialogDescription>
                  </DialogHeader>
                  <DialogBody className="flex flex-col gap-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Jenis</p>
                        <p className="text-sm font-medium">
                          {uploadType === 'REKENING' ? 'Rekening Bank' : 'Billing Pajak'}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">OPD</p>
                        <p className="text-sm font-medium break-words">{submitOpd || '-'}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Periode</p>
                        <p className="text-sm font-medium tabular-nums">{submitPeriode ? formatPeriode(submitPeriode) : '(bulan berjalan)'}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Total baris</p>
                        <p className="text-sm font-medium tabular-nums">{validationSummary?.total ?? 0}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Valid</p>
                        <p className="text-sm font-medium tabular-nums text-emerald-600">{validationSummary?.valid ?? 0}</p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <p className="text-xs text-muted-foreground">Tidak valid</p>
                        <p className="text-sm font-medium tabular-nums text-destructive">
                          {validationSummary?.invalid.length ?? 0}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Baris tidak valid akan dicatat sebagai gagal tanpa dicek ke API.
                    </p>
                  </DialogBody>
                  <DialogFooter showCloseButton>
                    <Button onClick={submitBatch} disabled={submitting}>
                      {submitting ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
                      Setujui & Buat Batch
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>

          {/* ---- Batch list ---- */}
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle>Riwayat Batch</CardTitle>
                <CardDescription className="mt-1">
                  {data ? `${data.pagination.total} batch tercatat` : 'Memuat daftar batch…'}
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="w-44">
                  <Select value={opdFilter} onValueChange={(v) => { if (!v) return; setOpdFilter(v); setPage(1); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter OPD">{opdFilter === 'ALL' ? 'Semua OPD' : opdFilter}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua OPD</SelectItem>
                      {(opdList.data ?? []).map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-44">
                  <Select value={statusFilter} onValueChange={(v) => { if (!v) return; setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Filter status">{statusFilter === 'ALL' ? 'Semua Status' : STATUS_LABEL[statusFilter] ?? statusFilter}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Semua Status</SelectItem>
                      <SelectItem value="PENDING">Menunggu</SelectItem>
                      <SelectItem value="PROCESSING">Diproses</SelectItem>
                      <SelectItem value="COMPLETED">Selesai</SelectItem>
                      <SelectItem value="PARTIAL_FAILED">Selesai Sebagian</SelectItem>
                      <SelectItem value="FAILED">Gagal</SelectItem>
                      <SelectItem value="CANCELLED">Dibatalkan</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : error ? (
                <p className="py-8 text-center text-sm text-destructive">Gagal memuat daftar batch.</p>
              ) : !data || data.data.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Belum ada batch verifikasi.</p>
              ) : (
                <div className="overflow-auto">
                  <Table className="min-w-[880px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>File</TableHead>
                        <TableHead>Jenis</TableHead>
                        <TableHead>OPD</TableHead>
                        <TableHead>Periode</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Progress</TableHead>
                        <TableHead>Ok</TableHead>
                        <TableHead>Gagal</TableHead>
                        <TableHead>Oleh</TableHead>
                        <TableHead>Dibuat</TableHead>
                        <TableHead className="text-right">Aksi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.data.map((b) => (
                        <TableRow key={b.id}>
                          <TableCell className="max-w-52">
                            <span className="block truncate font-medium">{b.filename}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{b.total_records} baris</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={b.verification_type === 'REKENING' ? 'outline' : 'secondary'}>
                              {b.verification_type === 'REKENING' ? 'Rekening Bank' : 'Billing Pajak'}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-44">
                            <span className="block truncate" title={b.opd ?? ''}>
                              {b.opd ?? '-'}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">
                            {formatPeriode(b.periode)}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={b.status} />
                          </TableCell>
                          <TableCell>
                            <ProgressBar processed={b.processed} total={b.total_records} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums text-emerald-600">{b.ok_count}</TableCell>
                          <TableCell className="whitespace-nowrap tabular-nums text-destructive">{b.fail_count}</TableCell>
                          <TableCell className="max-w-36">
                            <span className="block truncate text-sm" title={b.created_by_name ?? ''}>
                              {b.created_by_name ?? '-'}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                            {format(new Date(b.created_at), 'dd MMM yyyy HH:mm', { locale: idLocale })}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline"
                                size="icon"
                                title="Lihat detail"
                                onClick={() => router.push(`/dashboard/verifikasi-masal/${b.id}`)}
                              >
                                <Eye className="size-4" />
                              </Button>
                              {ACTIVE_STATUSES.includes(b.status) && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="text-destructive"
                                  title="Batalkan batch"
                                  onClick={() => cancelBatch(b.id)}
                                >
                                  <Ban className="size-4" />
                                </Button>
                              )}
                              {b.status === 'PARTIAL_FAILED' && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  title="Proses ulang yang gagal"
                                  onClick={() => retryBatch(b.id)}
                                >
                                  <RotateCcw className="size-4" />
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="icon"
                                title="Unduh hasil Excel"
                                onClick={() => exportBatch(b.id)}
                              >
                                <Download className="size-4" />
                              </Button>
                              {!ACTIVE_STATUSES.includes(b.status) && (
                                <Button
                                  variant="outline"
                                  size="icon"
                                  className="text-destructive"
                                  title="Hapus batch"
                                  onClick={() => deleteBatch(b)}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {data && data.pagination.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    Sebelumnya
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Halaman {data.pagination.page} / {data.pagination.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.pagination.totalPages}
                    onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                  >
                    Berikutnya
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="satuan" className="flex flex-col gap-6">
          <SingleVerifySection opdList={opdList.data ?? []} opdLoading={opdList.isLoading} />
        </TabsContent>

        <TabsContent value="rekap">
          <RekapSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab Satuan                                                          */
/* ------------------------------------------------------------------ */

function SingleVerifySection({
  opdList,
  opdLoading,
}: {
  opdList: string[];
  opdLoading: boolean;
}) {
  const [type, setType] = useState<VerificationType>('REKENING');
  const [opd, setOpd] = useState('');
  const [periode, setPeriode] = useState('');
  const [nama, setNama] = useState('');
  const [nomorRekening, setNomorRekening] = useState('');
  const [idBilling, setIdBilling] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<{ output: { input: Record<string, unknown>; result: Record<string, unknown> } } | null>(null);

  const [logPage, setLogPage] = useState(1);
  const [logType, setLogType] = useState('');
  const [logStatus, setLogStatus] = useState('');
  const [logSearch, setLogSearch] = useState('');
  const { data, mutate, isLoading } = useSWR<SingleLogsResponse>(
    `/verifikasi/single-logs?page=${logPage}&limit=10&type=${logType}&status=${logStatus}&search=${encodeURIComponent(logSearch)}`,
    fetcher
  );

  const canSubmit = type === 'REKENING' ? /^\d{10,20}$/.test(nomorRekening) && nama.trim().length >= 3 : /^\d{15,}$/.test(idBilling);

  const doCheck = async () => {
    if (!canSubmit) return;
    setChecking(true);
    try {
      const payload =
        type === 'REKENING'
          ? { type, nama: nama.trim(), nomor_rekening: nomorRekening.trim(), opd: opd || undefined, periode: periode || undefined }
          : { type, nama: nama.trim(), id_billing: idBilling.trim(), opd: opd || undefined, periode: periode || undefined };
      const res = await api.post('/verifikasi/verify-single', payload);
      setResult({ output: { input: payload, result: res.data.result } });
      mutate();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; retryAfterMs?: number } } };
      const msg =
        e.response?.data?.retryAfterMs != null
          ? `Tunggu ${Math.ceil(e.response.data.retryAfterMs / 1000)} detik sebelum cek berikutnya.`
          : e.response?.data?.message || 'Gagal melakukan verifikasi';
      toast.error(msg);
      if (e.response?.data?.retryAfterMs != null) {
        mutate();
      }
    } finally {
      setChecking(false);
    }
  };

  const clearLogs = async () => {
    const ok = window.confirm('Hapus seluruh riwayat verifikasi satuan?');
    if (!ok) return;
    try {
      await api.delete('/verifikasi/single-logs');
      toast.success('Riwayat verifikasi satuan dibersihkan');
      mutate();
    } catch {
      toast.error('Gagal membersihkan riwayat');
    }
  };

  const resetResult = () => setResult(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-fin-text-secondary" />
          Cek Cepat (Satuan)
        </CardTitle>
        <CardDescription>
          Periksa satu nomor rekening atau satu ID billing langsung ke layanan. Hasil tersimpan di riwayat di bawah.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => { setType('REKENING'); setResult(null); }}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              type === 'REKENING' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40'
            }`}
          >
            <span className="rounded-md bg-fin-subtle p-2 text-fin-text-secondary">
              <Landmark className="size-5" />
            </span>
            <span>
              <span className="block font-medium">Rekening Bank</span>
              <span className="block text-xs text-muted-foreground">No. rekening 10-20 digit + nama</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setType('BILLING'); setResult(null); }}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
              type === 'BILLING' ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40'
            }`}
          >
            <span className="rounded-md bg-fin-subtle p-2 text-fin-text-secondary">
              <ReceiptText className="size-5" />
            </span>
            <span>
              <span className="block font-medium">Billing Pajak</span>
              <span className="block text-xs text-muted-foreground">ID Billing minimal 15 digit</span>
            </span>
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label>OPD (opsional)</Label>
            <Select value={opd === '__none__' ? '' : opd} onValueChange={(v) => { if (!v) return; setOpd(v === '__none__' ? '' : v); }}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih OPD (opsional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Tanpa OPD</SelectItem>
                {opdLoading ? (
                  <SelectItem value="__loading__" disabled>
                    Memuat…
                  </SelectItem>
                ) : (
                  opdList.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Periode</Label>
            <Input type="month" value={periode} onChange={(e) => setPeriode(e.target.value)} />
          </div>
        </div>

        {type === 'REKENING' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>Nama pemilik</Label>
              <Input
                value={nama}
                onChange={(e) => setNama(e.target.value)}
                placeholder="minimal 3 karakter"
                onKeyDown={(e) => { if (e.key === 'Enter') doCheck(); }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nomor rekening</Label>
              <Input
                value={nomorRekening}
                onChange={(e) => setNomorRekening(e.target.value)}
                placeholder="10-20 digit angka"
                inputMode="numeric"
                onKeyDown={(e) => { if (e.key === 'Enter') doCheck(); }}
              />
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>ID Billing</Label>
              <Input
                value={idBilling}
                onChange={(e) => setIdBilling(e.target.value)}
                placeholder="minimal 15 digit angka"
                inputMode="numeric"
                onKeyDown={(e) => { if (e.key === 'Enter') doCheck(); }}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Nama penyetor (opsional)</Label>
              <Input value={nama} onChange={(e) => setNama(e.target.value)} placeholder="opsional" />
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={doCheck} disabled={checking || !canSubmit}>
            {checking ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
            Cek Sekarang
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <Label>Hasil Pemeriksaan</Label>
              <Button variant="ghost" size="icon" onClick={resetResult} title="Tutup">
                <X className="size-4" />
              </Button>
            </div>
            <SingleResultView type={type} input={result.output.input} res={result.output.result} />
          </div>
        )}

        <div className="mt-2 flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Riwayat Verifikasi Satuan</Label>
            <Button variant="outline" size="sm" className="text-destructive" onClick={clearLogs} disabled={!data || data.data.length === 0}>
              <Trash2 className="size-4" />
              Bersihkan Riwayat
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              value={logSearch}
              onChange={(e) => { setLogSearch(e.target.value); setLogPage(1); }}
              placeholder="Cari nama / nomor / ID billing…"
            />
            <Select value={logType || '__all__'} onValueChange={(v) => { if (!v) return; setLogType(v === '__all__' ? '' : v); setLogPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Semua jenis">{logType ? (logType === 'REKENING' ? 'Rekening Bank' : 'Billing Pajak') : 'Semua Jenis'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Semua Jenis</SelectItem>
                <SelectItem value="REKENING">Rekening Bank</SelectItem>
                <SelectItem value="BILLING">Billing Pajak</SelectItem>
              </SelectContent>
            </Select>
            <Select value={logStatus || '__all__'} onValueChange={(v) => { if (!v) return; setLogStatus(v === '__all__' ? '' : v); setLogPage(1); }}>
              <SelectTrigger>
                <SelectValue placeholder="Semua status">{logStatus ? (STATUS_LABEL[logStatus] ?? logStatus) : 'Semua Status'}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Semua Status</SelectItem>
                <SelectItem value="VALID">Valid</SelectItem>
                <SelectItem value="INVALID">Tidak Valid</SelectItem>
                <SelectItem value="NOT_FOUND">Tidak Ditemukan</SelectItem>
                <SelectItem value="ACTIVE">Aktif</SelectItem>
                <SelectItem value="EXPIRED">Kadaluarsa</SelectItem>
                <SelectItem value="ERROR">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data || data.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Belum ada riwayat verifikasi satuan.</p>
          ) : (
            <div className="overflow-auto">
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Waktu</TableHead>
                    <TableHead>Jenis</TableHead>
                    <TableHead>Input</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>OPD</TableHead>
                    <TableHead>Oleh</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.data.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {format(new Date(l.created_at), 'dd MMM HH:mm', { locale: idLocale })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={l.verification_type === 'REKENING' ? 'outline' : 'secondary'}>
                          {l.verification_type === 'REKENING' ? 'Rekening' : 'Billing'}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-48">
                        <span className="block truncate font-medium tabular-nums">
                          {l.verification_type === 'REKENING' ? l.input_account_no : l.input_billing_id}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">{l.input_account_name ?? '-'}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={(l.verification_type === 'REKENING' ? l.bank_status : l.tax_status) ?? 'ERROR'} />
                      </TableCell>
                      <TableCell className="max-w-56">
                        {l.verification_type === 'REKENING' ? (
                          l.bank_registered_name ? (
                            <>
                              <span className="block truncate text-sm">{l.bank_registered_name}</span>
                              <span className="text-xs text-muted-foreground">
                                cocok {l.name_match_score ?? '-'}% ({l.name_match_label ?? '-'})
                              </span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">{l.error_message ?? '-'}</span>
                          )
                        ) : (
                          <>
                            <span className="block truncate text-sm">{l.tax_type_name ?? l.tax_type ?? '-'}</span>
                            <span className="text-xs text-muted-foreground">
                              {l.tax_amount != null ? `Rp ${l.tax_amount.toLocaleString('id-ID')}` : ''}
                              {l.payer_name ? ` • ${l.payer_name}` : ''}
                            </span>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="max-w-36">
                        <span className="block truncate text-sm" title={l.opd ?? ''}>
                          {l.opd ?? '-'}
                        </span>
                      </TableCell>
                      <TableCell className="max-w-40">
                        <span className="block truncate text-sm" title={l.checked_by_name ?? ''}>
                          {l.checked_by_name ?? '-'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" disabled={logPage <= 1} onClick={() => setLogPage((p) => Math.max(1, p - 1))}>
                Sebelumnya
              </Button>
              <span className="text-sm text-muted-foreground">
                Halaman {data.pagination.page} / {data.pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={logPage >= data.pagination.totalPages}
                onClick={() => setLogPage((p) => Math.min(data.pagination.totalPages, p + 1))}
              >
                Berikutnya
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function SingleResultView({
  type,
  input,
  res,
}: {
  type: VerificationType;
  input: Record<string, unknown>;
  res: Record<string, unknown>;
}) {
  const status = typeof res.status === 'string' ? res.status : 'ERROR';
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border p-3">
        <p className="text-xs text-muted-foreground">Status</p>
        <div className="mt-1">
          <StatusBadge status={status} />
        </div>
        {typeof res.message === 'string' && res.message && (
          <p className="mt-2 text-xs text-muted-foreground">{res.message}</p>
        )}
      </div>
      {type === 'REKENING' ? (
        <>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Nama terdaftar di bank</p>
            <p className="text-sm font-medium break-words">{String(res.registeredName ?? '-')}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Skor kecocokan nama</p>
            <p className="text-sm font-medium tabular-nums">
              {res.name_match_score != null ? `${String(res.name_match_score)}%` : '-'}{' '}
              {res.name_match_label != null && <Badge variant="outline">{String(res.name_match_label)}</Badge>}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Input</p>
            <p className="text-sm font-medium break-words tabular-nums">
              {String(input.nomor_rekening ?? '-')} • {String(input.nama ?? '-')}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Jenis pajak</p>
            <p className="text-sm font-medium break-words">{String(res.tax_type_name ?? res.tax_type ?? '-')}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Nilai billing</p>
            <p className="text-sm font-medium tabular-nums">
              {res.tax_amount != null ? `Rp ${Number(res.tax_amount).toLocaleString('id-ID')}` : '-'}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Penyetor</p>
            <p className="text-sm font-medium break-words">{String(res.payer_name ?? '-')}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Input</p>
            <p className="text-sm font-medium break-words tabular-nums">
              {String(input.id_billing ?? '-')} {input.nama ? `• ${String(input.nama)}` : ''}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tab Rekap per OPD                                                   */
/* ------------------------------------------------------------------ */

function RekapSection() {
  const [periode, setPeriode] = useState('');
  const { data, isLoading, error, mutate } = useSWR<SummaryResponse>(
    `/verifikasi/summary${periode ? `?periode=${periode}` : ''}`,
    fetcher,
    { refreshInterval: 2000 }
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Rekap per OPD</CardTitle>
          <CardDescription className="mt-1">
            Rekap batch verifikasi dikelompokkan per OPD. Tabel ter-update otomatis saat batch berjalan.
          </CardDescription>
        </div>
        <div className="w-48">
          <Input type="month" value={periode} onChange={(e) => setPeriode(e.target.value)} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-destructive">Gagal memuat rekap.</p>
        ) : !data || data.data.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Belum ada batch untuk ditampilkan.</p>
        ) : (
          <div className="overflow-auto">
            <Table className="min-w-[680px]">
              <TableHeader>
                <TableRow>
                  <TableHead>OPD</TableHead>
                  <TableHead className="text-right">Batch</TableHead>
                  <TableHead className="text-right">Baris</TableHead>
                  <TableHead className="text-right">Diproses</TableHead>
                  <TableHead className="text-right">Valid</TableHead>
                  <TableHead className="text-right">Gagal</TableHead>
                  <TableHead className="text-right">Progress</TableHead>
                  <TableHead className="text-right">% Valid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((r) => (
                  <TableRow key={r.opd}>
                    <TableCell>
                      <span className="block max-w-64 truncate font-medium" title={r.opd}>
                        {r.opd}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.batchCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.totalRecords}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.processed}</TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600">{r.okCount}</TableCell>
                    <TableCell className="text-right tabular-nums text-destructive">{r.failCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.percentDone}%</TableCell>
                    <TableCell className="text-right tabular-nums">{r.percentOk}%</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2">
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{data.totals.batchCount}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{data.totals.totalRecords}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{data.totals.processed}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-emerald-600">
                    {data.totals.okCount}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-destructive">
                    {data.totals.failCount}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{data.totals.percentDone}%</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{data.totals.percentOk}%</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="size-4" />
            Muat Ulang
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}