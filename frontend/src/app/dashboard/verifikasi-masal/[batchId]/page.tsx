'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Ban,
  RotateCcw,
  Download,
  RefreshCw,
  Landmark,
  ReceiptText,
  Search,
} from 'lucide-react';
import { format } from 'date-fns';
import { id as idLocale } from 'date-fns/locale';
import api from '@/lib/api';
import { PageHeader } from '@/components/patterns/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { Skeleton } from '@/components/ui/skeleton';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Menunggu',
  PROCESSING: 'Diproses',
  COMPLETED: 'Selesai',
  PARTIAL_FAILED: 'Selesai Sebagian',
  FAILED: 'Gagal',
  CANCELLED: 'Dibatalkan',
};

const BANK_STATUS_LABEL: Record<string, string> = {
  UNVERIFIED: 'Belum Dicek',
  VALID: 'Terverifikasi',
  INVALID: 'Tidak Valid',
  NOT_FOUND: 'Tidak Ditemukan',
  ERROR: 'Kesalahan API',
};

const TAX_STATUS_LABEL: Record<string, string> = {
  UNVERIFIED: 'Belum Dicek',
  ACTIVE: 'Aktif',
  EXPIRED: 'Kedaluwarsa',
  INVALID: 'Tidak Valid',
  ERROR: 'Kesalahan API',
};

type StatusVariant = 'income' | 'destructive' | 'secondary' | 'warning' | 'default';

function statusVariant(status: string): StatusVariant {
  if (status === 'COMPLETED' || status === 'VALID' || status === 'ACTIVE' || status === 'MATCH') return 'income';
  if (status === 'FAILED' || status === 'INVALID' || status === 'MISMATCH' || status === 'CANCELLED') return 'destructive';
  if (status === 'PARTIAL_FAILED' || status === 'PARTIAL' || status === 'NOT_FOUND') return 'warning';
  if (status === 'UNVERIFIED' || status === 'ERROR') return 'secondary';
  return 'default';
}

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)}>{STATUS_LABEL[status] ?? status}</Badge>;
}

function itemStatusLabel(status: string) {
  if (status === 'ALL') return 'Semua Status';
  if (status.startsWith('bank:')) return BANK_STATUS_LABEL[status.slice(5)] ?? status;
  if (status.startsWith('tax:')) return TAX_STATUS_LABEL[status.slice(4)] ?? status;
  return STATUS_LABEL[status] ?? status;
}

interface BatchDetail {
  batch: {
    id: string;
    verification_type: 'REKENING' | 'BILLING';
    filename: string;
    created_by_name: string | null;
    total_records: number;
    processed: number;
    ok_count: number;
    fail_count: number;
    status: string;
    error_message: string | null;
    created_at: string;
    finished_at: string | null;
  };
  status_counts: {
    bank: { status: string; count: number }[];
    tax: { status: string; count: number }[];
  };
}

interface ItemRow {
  id: string;
  row_no: number;
  input_account_no: string | null;
  input_account_name: string | null;
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
  validation_message: string | null;
  api_error_message: string | null;
  retry_count: number;
}

interface ItemsResponse {
  data: ItemRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function BatchDetailPage() {
  const params = useParams<{ batchId: string }>();
  const router = useRouter();
  const batchId = params.batchId;

  const [itemPage, setItemPage] = useState(1);
  const [itemStatus, setItemStatus] = useState('ALL');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const limit = 50;

  const { data: detail, isLoading: loadingDetail, mutate: mutateDetail } = useSWR<BatchDetail>(
    `/verifikasi/batches/${batchId}`,
    fetcher,
    {
      refreshInterval: (d) =>
        d && (d.batch.status === 'PENDING' || d.batch.status === 'PROCESSING') ? 2000 : 0,
    }
  );

  const batch = detail?.batch;
  const isActive = batch?.status === 'PENDING' || batch?.status === 'PROCESSING';

  const itemsQuery = `?page=${itemPage}&limit=${limit}&status=${itemStatus}&search=${encodeURIComponent(search)}`;
  const { data: itemsRes, isLoading: loadingItems, mutate: mutateItems } = useSWR<ItemsResponse>(
    `/verifikasi/batches/${batchId}/items${itemsQuery}`,
    fetcher,
    {
      refreshInterval: () => {
        const s = batch?.status;
        return s === 'PENDING' || s === 'PROCESSING' ? 2000 : 0;
      },
    }
  );

  const countMap = useMemo(() => {
    const map: Record<string, number> = {};
    (detail?.status_counts.bank ?? []).forEach((c) => {
      map[`bank:${c.status}`] = c.count;
    });
    (detail?.status_counts.tax ?? []).forEach((c) => {
      map[`tax:${c.status}`] = c.count;
    });
    return map;
  }, [detail]);

  const pct = batch && batch.total_records > 0 ? Math.min(100, Math.round((batch.processed / batch.total_records) * 100)) : 0;

  const cancelBatch = async () => {
    const ok = window.confirm('Batalkan batch ini? Proses verifikasi akan dihentikan.');
    if (!ok) return;
    try {
      await api.post(`/verifikasi/batches/${batchId}/cancel`);
      toast.success('Batch dibatalkan');
      mutateDetail();
      mutateItems();
    } catch {
      toast.error('Gagal membatalkan batch');
    }
  };

  const retryFailed = async () => {
    try {
      await api.post(`/verifikasi/batches/${batchId}/retry-failed`);
      toast.success('Proses ulang antrean dimulai');
      mutateDetail();
      mutateItems();
    } catch {
      toast.error('Gagal mengantrekan proses ulang');
    }
  };

  const exportBatch = async () => {
    try {
      const res = await api.get(`/verifikasi/batches/${batchId}/export`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verifikasi-${batchId}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Gagal mengekspor hasil verifikasi');
    }
  };

  const isRekening = batch?.verification_type === 'REKENING';

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={batch ? batch.filename : 'Detail Batch'}
        description={
          batch
            ? `Batch ${isRekening ? 'Verifikasi Rekening Bank' : 'Verifikasi Billing Pajak'} • dibuat oleh ${
                batch.created_by_name ?? '-'
              } • ${format(new Date(batch.created_at), 'dd MMM yyyy HH:mm', { locale: idLocale })}`
            : 'Memuat detail batch…'
        }
        icon={isRekening ? <Landmark className="size-5" /> : <ReceiptText className="size-5" />}
        badge={batch ? <StatusBadge status={batch.status} /> : undefined}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/verifikasi-masal')}>
              <ArrowLeft className="size-4" />
              Kembali
            </Button>
            {batch && isActive && (
              <Button variant="outline" size="sm" onClick={cancelBatch}>
                <Ban className="size-4" />
                Batalkan
              </Button>
            )}
            {batch?.status === 'PARTIAL_FAILED' && (
              <Button variant="outline" size="sm" onClick={retryFailed}>
                <RotateCcw className="size-4" />
                Proses Ulang Gagal
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={exportBatch}>
              <Download className="size-4" />
              Unduh Hasil
            </Button>
            <Button variant="outline" size="sm" onClick={() => { mutateDetail(); mutateItems(); }} disabled={loadingDetail}>
              <RefreshCw className={loadingDetail ? 'size-4 animate-spin' : 'size-4'} />
              Muat Ulang
            </Button>
          </>
        }
      />

      {batch && (
        <Card>
          <CardHeader>
            <CardTitle>Ringkasan Proses</CardTitle>
            <CardDescription>
              {isActive ? 'Memuat ulang otomatis setiap 2 detik selama proses berjalan.' : 'Proses verifikasi telah selesai.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-2 rounded-full transition-all ${pct === 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {batch.processed}/{batch.total_records} ({pct}%)
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Total Baris</p>
                <p className="text-lg font-semibold tabular-nums">{batch.total_records}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Diproses</p>
                <p className="text-lg font-semibold tabular-nums">{batch.processed}</p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs text-emerald-700">Berhasil</p>
                <p className="text-lg font-semibold text-emerald-700 tabular-nums">{batch.ok_count}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs text-red-700">Gagal</p>
                <p className="text-lg font-semibold text-red-700 tabular-nums">{batch.fail_count}</p>
              </div>
            </div>

            {batch.error_message && (
              <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {batch.error_message}
              </p>
            )}

            {!isActive && isRekening && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Status rekening:</span>
                {detail?.status_counts.bank.map((c) => (
                  <Button
                    key={c.status}
                    variant={itemStatus === `bank:${c.status}` ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setItemStatus(`bank:${c.status}`); setItemPage(1); }}
                  >
                    {BANK_STATUS_LABEL[c.status] ?? c.status} ({c.count})
                  </Button>
                ))}
              </div>
            )}
            {!isActive && !isRekening && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-muted-foreground">Status billing:</span>
                {detail?.status_counts.tax.map((c) => (
                  <Button
                    key={c.status}
                    variant={itemStatus === `tax:${c.status}` ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setItemStatus(`tax:${c.status}`); setItemPage(1); }}
                  >
                    {TAX_STATUS_LABEL[c.status] ?? c.status} ({c.count})
                  </Button>
                ))}
              </div>
            )}
            {!isActive && countMap && Object.keys(countMap).length > 0 && (
              <Button variant="ghost" size="sm" className="self-start" onClick={() => setItemStatus('ALL')}>
                Reset filter
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Detail Data</CardTitle>
            <CardDescription className="mt-1">
              {itemsRes ? `${itemsRes.total} item ditampilkan` : 'Memuat item…'}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={isRekening ? 'Cari nama / nomor rekening…' : 'Cari ID billing / nama…'}
                className="pl-8"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearch(searchInput.trim());
                    setItemPage(1);
                  }
                }}
              />
            </div>
            <div className="w-44">
              <Select
                value={itemStatus}
                onValueChange={(v) => {
                  if (!v) return;
                  setItemStatus(v);
                  setItemPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter status">{itemStatusLabel(itemStatus)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Semua Status</SelectItem>
                  {isRekening ? (
                    <>
                      <SelectItem value="bank:UNVERIFIED">Belum Dicek</SelectItem>
                      <SelectItem value="bank:VALID">Terverifikasi</SelectItem>
                      <SelectItem value="bank:INVALID">Tidak Valid</SelectItem>
                      <SelectItem value="bank:NOT_FOUND">Tidak Ditemukan</SelectItem>
                      <SelectItem value="bank:ERROR">Kesalahan API</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="tax:UNVERIFIED">Belum Dicek</SelectItem>
                      <SelectItem value="tax:ACTIVE">Aktif</SelectItem>
                      <SelectItem value="tax:EXPIRED">Kedaluwarsa</SelectItem>
                      <SelectItem value="tax:INVALID">Tidak Valid</SelectItem>
                      <SelectItem value="tax:ERROR">Kesalahan API</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingItems ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !itemsRes || itemsRes.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Tidak ada item yang cocok dengan filter.
            </p>
          ) : (
            <div className="overflow-auto">
              {isRekening ? (
                <Table className="min-w-[880px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>Nama (Input)</TableHead>
                      <TableHead>No. Rekening</TableHead>
                      <TableHead>Nama Terdaftar</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Kecocokan Nama</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsRes.data.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="tabular-nums text-muted-foreground">{r.row_no}</TableCell>
                        <TableCell className="max-w-56 whitespace-normal break-words">{r.input_account_name ?? '-'}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">{r.input_account_no ?? '-'}</TableCell>
                        <TableCell className="max-w-56 whitespace-normal break-words">{r.bank_registered_name ?? '-'}</TableCell>
                        <TableCell>
                          {r.bank_status ? (
                            <Badge variant={statusVariant(r.bank_status)}>
                              {BANK_STATUS_LABEL[r.bank_status] ?? r.bank_status}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {r.name_match_score != null ? (
                            <div className="flex items-center gap-2">
                              <span className="tabular-nums">{r.name_match_score.toFixed(1)}%</span>
                              {r.name_match_label && (
                                <Badge variant={statusVariant(r.name_match_label)}>{r.name_match_label}</Badge>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="max-w-64">
                          <span className="block truncate text-sm" title={r.validation_message ?? r.api_error_message ?? ''}>
                            {r.validation_message ?? r.api_error_message ?? '-'}
                          </span>
                          {r.retry_count > 0 && (
                            <span className="text-xs text-muted-foreground">percobaan ulang: {r.retry_count}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table className="min-w-[880px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>No</TableHead>
                      <TableHead>ID Billing</TableHead>
                      <TableHead>Penyetor / Nama</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Jenis Pajak</TableHead>
                      <TableHead>Nilai</TableHead>
                      <TableHead>Keterangan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itemsRes.data.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="tabular-nums text-muted-foreground">{r.row_no}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums font-medium">{r.input_billing_id ?? '-'}</TableCell>
                        <TableCell className="max-w-56 whitespace-normal break-words">{r.payer_name ?? r.input_account_name ?? '-'}</TableCell>
                        <TableCell>
                          {r.tax_status ? (
                            <Badge variant={statusVariant(r.tax_status)}>
                              {TAX_STATUS_LABEL[r.tax_status] ?? r.tax_status}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="max-w-56 whitespace-normal break-words">
                          {r.tax_type_name ? (
                            <>
                              <span className="block text-sm">{r.tax_type_name}</span>
                              <span className="text-xs text-muted-foreground tabular-nums">{r.tax_type}</span>
                            </>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {r.tax_amount != null
                            ? new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(r.tax_amount)
                            : '-'}
                        </TableCell>
                        <TableCell className="max-w-64">
                          <span className="block truncate text-sm" title={r.validation_message ?? r.api_error_message ?? ''}>
                            {r.validation_message ?? r.api_error_message ?? '-'}
                          </span>
                          {r.retry_count > 0 && (
                            <span className="text-xs text-muted-foreground">percobaan ulang: {r.retry_count}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {itemsRes && itemsRes.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                disabled={itemPage <= 1}
                onClick={() => setItemPage((p) => Math.max(1, p - 1))}
              >
                Sebelumnya
              </Button>
              <span className="text-sm text-muted-foreground">
                Halaman {itemsRes.page} / {itemsRes.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={itemPage >= itemsRes.totalPages}
                onClick={() => setItemPage((p) => Math.min(itemsRes.totalPages, p + 1))}
              >
                Berikutnya
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}