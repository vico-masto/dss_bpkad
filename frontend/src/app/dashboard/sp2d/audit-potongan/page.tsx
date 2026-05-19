'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Minus,
  Receipt,
  ArrowRight,
} from 'lucide-react';
import api from '@/lib/api';
import { toast } from 'sonner';
import { PageHeader } from '@/components/patterns/page-header';
import { formatCurrency, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const MONTHS = [
  { value: '01', label: 'Januari' },  { value: '02', label: 'Februari' },
  { value: '03', label: 'Maret' },    { value: '04', label: 'April' },
  { value: '05', label: 'Mei' },      { value: '06', label: 'Juni' },
  { value: '07', label: 'Juli' },     { value: '08', label: 'Agustus' },
  { value: '09', label: 'September' },{ value: '10', label: 'Oktober' },
  { value: '11', label: 'November' }, { value: '12', label: 'Desember' },
];

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [String(CURRENT_YEAR - 1), String(CURRENT_YEAR), String(CURRENT_YEAR + 1)];

interface Stats {
  KURANG:  { jumlah: number; total_selisih: number };
  LENGKAP: { jumlah: number; total_selisih: number };
  LEBIH:   { jumlah: number; total_selisih: number };
  total: number;
}

interface Row {
  id: string;
  nomor: string;
  tanggal: string;
  tanggal_pencairan: string | null;
  opd: string;
  penerima: string;
  uraian: string;
  jenis: string;
  nilai_bruto: number;
  potongan_gelondongan: number;
  sum_rincian_manual: number;
  selisih: number;
  count_rincian: number;
  status_kel: 'KURANG' | 'LENGKAP' | 'LEBIH';
}

interface ListData {
  data: Row[];
  total: number;
  totalPages: number;
}

const STATUS_CFG = {
  KURANG:  { label: 'Kurang Rincian', icon: TrendingDown, bg: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  LENGKAP: { label: 'Lengkap',        icon: CheckCircle2, bg: 'bg-green-100 text-green-700 border-green-200',  dot: 'bg-green-500' },
  LEBIH:   { label: 'Rincian Lebih',  icon: TrendingUp,   bg: 'bg-rose-100 text-rose-700 border-rose-200',    dot: 'bg-rose-500' },
};

export default function AuditPotonganPage() {
  const [filters, setFilters] = useState({
    tahun: String(CURRENT_YEAR),
    bulan: '',
    status: '',
  });
  const [page, setPage] = useState(1);
  const limit = 30;

  const handleFilter = (key: keyof typeof filters, val: string) => {
    setFilters((f) => ({ ...f, [key]: val }));
    setPage(1);
  };

  const { data: stats, mutate: mutateStats } = useSWR<Stats>(
    `/sp2d/selisih-potongan/stats?tahun=${filters.tahun}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const listParams = new URLSearchParams({
    tahun: filters.tahun,
    page: String(page),
    limit: String(limit),
    ...(filters.bulan && { bulan: filters.bulan }),
    ...(filters.status && { status: filters.status }),
  });

  const { data: listData, isLoading, mutate: mutateList } = useSWR<ListData>(
    `/sp2d/selisih-potongan?${listParams}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const rows = listData?.data || [];
  const total = listData?.total || 0;
  const totalPages = listData?.totalPages || 1;

  const refresh = () => { mutateList(); mutateStats(); };

  const [fixingAutoHeader, setFixingAutoHeader] = useState(false);
  const [autoHeaderPreview, setAutoHeaderPreview] = useState<{ deleted: number; sp2d_affected: number } | null>(null);

  const handleCheckAutoHeader = async () => {
    setFixingAutoHeader(true);
    try {
      const res = await api.post('/sp2d/fix-autoheader-potongan', { dry_run: true });
      setAutoHeaderPreview({ deleted: res.data.deleted, sp2d_affected: res.data.sp2d_affected });
    } catch {
      toast.error('Gagal memeriksa data AUTO_HEADER');
    } finally {
      setFixingAutoHeader(false);
    }
  };

  const handleFixAutoHeader = async () => {
    setFixingAutoHeader(true);
    try {
      const res = await api.post('/sp2d/fix-autoheader-potongan', { dry_run: false });
      toast.success(`Berhasil: ${res.data.deleted} AUTO_HEADER dihapus dari ${res.data.sp2d_affected} SP2D`);
      setAutoHeaderPreview(null);
      refresh();
    } catch {
      toast.error('Gagal membersihkan data AUTO_HEADER');
    } finally {
      setFixingAutoHeader(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700">
      <div className="flex items-start gap-3">
        <Link href="/dashboard/sp2d">
          <Button variant="ghost" size="icon" className="mt-0.5 w-9 h-9 shrink-0 text-fin-text-muted hover:text-fin-text-primary hover:bg-fin-surface rounded-lg">
            <ChevronLeft size={16} />
          </Button>
        </Link>
        <PageHeader
          title="Audit Potongan: Gelondongan vs Rincian Manual"
          description="Bandingkan nilai potongan total (header SP2D) dengan jumlah rincian potongan yang sudah diinput. SP2D berstatus Kurang Rincian berpotensi menyebabkan selisih saat rekonsiliasi bank."
          icon={<Receipt className="size-5" />}
          className="flex-1"
          actions={
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckAutoHeader}
              disabled={fixingAutoHeader}
              className="h-9 gap-1.5 text-xs border-fin-border bg-fin-surface text-fin-text-secondary hover:text-fin-text-primary"
            >
              {fixingAutoHeader ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Cek Duplikasi Potongan
            </Button>
          }
        />
      </div>

      {/* Banner: Duplikasi AUTO_HEADER Terdeteksi */}
      {autoHeaderPreview && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm">
          <AlertTriangle size={18} className="shrink-0 text-amber-600 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <p className="font-bold">Duplikasi Potongan AUTO_HEADER Ditemukan</p>
            <p className="text-xs text-amber-800">
              • <strong>{autoHeaderPreview.deleted}</strong> record AUTO_HEADER (placeholder gelondongan) masih ada padahal rincian manual sudah diimport
              &nbsp;→ menyebabkan selisih saldo dan perhitungan neto yang tidak akurat pada <strong>{autoHeaderPreview.sp2d_affected}</strong> SP2D
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAutoHeaderPreview(null)}
              className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-800 text-xs font-semibold rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleFixAutoHeader}
              disabled={fixingAutoHeader}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {fixingAutoHeader ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              Bersihkan Sekarang
            </button>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* KURANG */}
        <Card
          className={cn(
            'border rounded-xl shadow-sm cursor-pointer transition-all hover:shadow-md',
            filters.status === 'KURANG' ? 'border-amber-400 ring-2 ring-amber-200' : 'border-fin-border bg-fin-surface',
          )}
          onClick={() => handleFilter('status', filters.status === 'KURANG' ? '' : 'KURANG')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
              <TrendingDown size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Kurang Rincian</p>
              <p className="text-2xl font-bold text-fin-text-primary">{stats?.KURANG.jumlah ?? '—'} SP2D</p>
              <p className="text-xs text-amber-600 font-semibold mt-0.5 truncate">
                Selisih {formatCurrency(stats?.KURANG.total_selisih ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* LENGKAP */}
        <Card
          className={cn(
            'border rounded-xl shadow-sm cursor-pointer transition-all hover:shadow-md',
            filters.status === 'LENGKAP' ? 'border-green-400 ring-2 ring-green-200' : 'border-fin-border bg-fin-surface',
          )}
          onClick={() => handleFilter('status', filters.status === 'LENGKAP' ? '' : 'LENGKAP')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-green-100 text-green-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={24} />
            </div>
            <div>
              <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Rincian Lengkap</p>
              <p className="text-2xl font-bold text-fin-text-primary">{stats?.LENGKAP.jumlah ?? '—'} SP2D</p>
              <p className="text-xs text-green-600 font-semibold mt-0.5">Selisih = 0</p>
            </div>
          </CardContent>
        </Card>

        {/* LEBIH */}
        <Card
          className={cn(
            'border rounded-xl shadow-sm cursor-pointer transition-all hover:shadow-md',
            filters.status === 'LEBIH' ? 'border-rose-400 ring-2 ring-rose-200' : 'border-fin-border bg-fin-surface',
          )}
          onClick={() => handleFilter('status', filters.status === 'LEBIH' ? '' : 'LEBIH')}
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
              <TrendingUp size={24} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider">Rincian Melebihi</p>
              <p className="text-2xl font-bold text-fin-text-primary">{stats?.LEBIH.jumlah ?? '—'} SP2D</p>
              <p className="text-xs text-rose-600 font-semibold mt-0.5 truncate">
                Lebih {formatCurrency(stats?.LEBIH.total_selisih ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="bg-fin-surface border border-fin-border rounded-xl shadow-sm">
        <CardContent className="p-6 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div className="flex flex-wrap gap-2">
              <Select value={filters.tahun} onValueChange={(v) => handleFilter('tahun', v)}>
                <SelectTrigger className="h-8 w-24 text-xs border-fin-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.bulan || 'all'} onValueChange={(v) => handleFilter('bulan', v === 'all' ? '' : v)}>
                <SelectTrigger className="h-8 w-36 text-xs border-fin-border">
                  <SelectValue placeholder="Semua Bulan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Semua Bulan</SelectItem>
                  {MONTHS.map((m) => <SelectItem key={m.value} value={m.value} className="text-xs">{m.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.status || 'all'} onValueChange={(v) => handleFilter('status', v === 'all' ? '' : v)}>
                <SelectTrigger className="h-8 w-40 text-xs border-fin-border">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">Semua Status</SelectItem>
                  <SelectItem value="KURANG" className="text-xs">Kurang Rincian</SelectItem>
                  <SelectItem value="LENGKAP" className="text-xs">Lengkap</SelectItem>
                  <SelectItem value="LEBIH" className="text-xs">Rincian Melebihi</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button variant="outline" size="sm" onClick={refresh} className="h-8 px-3 text-xs border-fin-border gap-1.5">
              <RefreshCw size={12} /> Refresh
            </Button>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-[11px] text-fin-text-muted border-b border-fin-border pb-3">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              <span><strong>Kurang:</strong> Rincian manual &lt; potongan gelondongan → potensi selisih rekonsiliasi</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-rose-500" />
              <span><strong>Melebihi:</strong> Rincian manual &gt; potongan gelondongan → periksa input ganda</span>
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-fin-text-muted gap-2">
              <Loader2 size={20} className="animate-spin" /> Memuat data...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-fin-text-muted">
              <CheckCircle2 size={44} className="text-green-500" />
              <p className="font-semibold text-fin-text-primary text-lg">Tidak ada data</p>
              <p className="text-sm">Tidak ada SP2D yang memiliki potongan gelondongan untuk filter ini.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-fin-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-fin-page/60">
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted pl-4 min-w-[160px]">
                        Nomor SP2D
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted min-w-[100px]">
                        Tgl Pencairan
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted max-w-[180px]">
                        OPD / Penerima
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted text-right pr-2">
                        Potongan Gelondongan
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted text-right pr-2">
                        Rincian Manual
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted text-right pr-2">
                        Selisih
                      </TableHead>
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted text-center">
                        Status
                      </TableHead>
                      <TableHead className="w-24 text-[10px] font-bold uppercase tracking-wider text-fin-text-muted text-center">
                        Aksi
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const cfg = STATUS_CFG[row.status_kel];
                      const tglCair = row.tanggal_pencairan
                        ? format(new Date(row.tanggal_pencairan), 'dd/MM/yy')
                        : <span className="text-slate-400 italic">—</span>;
                      const rowBg = row.status_kel === 'KURANG'
                        ? 'bg-amber-50/40 hover:bg-amber-50/70'
                        : row.status_kel === 'LEBIH'
                          ? 'bg-rose-50/40 hover:bg-rose-50/70'
                          : 'hover:bg-fin-page/30';

                      return (
                        <TableRow key={row.id} className={cn('transition-colors', rowBg)}>
                          {/* Nomor */}
                          <TableCell className="pl-4">
                            <p className="text-xs font-mono font-semibold text-fin-text-primary truncate max-w-[160px]" title={row.nomor}>
                              {row.nomor}
                            </p>
                            <p className="text-[10px] text-fin-text-muted mt-0.5">{row.jenis}</p>
                          </TableCell>

                          {/* Tgl Pencairan */}
                          <TableCell className="text-xs text-fin-text-muted whitespace-nowrap">
                            {tglCair}
                          </TableCell>

                          {/* OPD / Penerima */}
                          <TableCell className="max-w-[200px]">
                            <p className="text-xs text-fin-text-primary truncate" title={row.opd}>{row.opd}</p>
                            <p className="text-[10px] text-fin-text-muted truncate" title={row.penerima}>{row.penerima}</p>
                          </TableCell>

                          {/* Potongan Gelondongan */}
                          <TableCell className="text-right pr-2">
                            <p className="text-xs font-semibold text-fin-text-primary whitespace-nowrap">
                              {formatCurrency(row.potongan_gelondongan)}
                            </p>
                          </TableCell>

                          {/* Rincian Manual */}
                          <TableCell className="text-right pr-2">
                            <p className={cn(
                              'text-xs font-semibold whitespace-nowrap',
                              row.sum_rincian_manual === 0 ? 'text-slate-400 italic' : 'text-fin-text-primary',
                            )}>
                              {row.sum_rincian_manual === 0
                                ? 'Belum ada'
                                : formatCurrency(row.sum_rincian_manual)}
                            </p>
                            {row.count_rincian > 0 && (
                              <p className="text-[10px] text-fin-text-muted">{row.count_rincian} komponen</p>
                            )}
                          </TableCell>

                          {/* Selisih */}
                          <TableCell className="text-right pr-2">
                            {row.selisih === 0 ? (
                              <div className="flex items-center justify-end gap-1 text-green-600">
                                <Minus size={12} />
                                <span className="text-xs font-semibold">Nihil</span>
                              </div>
                            ) : (
                              <p className={cn(
                                'text-xs font-bold whitespace-nowrap',
                                row.selisih > 0 ? 'text-amber-600' : 'text-rose-600',
                              )}>
                                {row.selisih > 0 ? '-' : '+'}{formatCurrency(Math.abs(row.selisih))}
                              </p>
                            )}
                          </TableCell>

                          {/* Status Badge */}
                          <TableCell className="text-center">
                            <Badge
                              variant="outline"
                              className={cn('text-[10px] font-semibold border px-2 py-0.5 gap-1', cfg.bg)}
                            >
                              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', cfg.dot)} />
                              {cfg.label}
                            </Badge>
                          </TableCell>

                          {/* Aksi */}
                          <TableCell className="text-center">
                            <Link
                              href={`/dashboard/sp2d/create?edit=${row.id}`}
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline transition-colors"
                            >
                              Buka <ArrowRight size={11} />
                            </Link>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-fin-text-muted">
                    {total} SP2D · Halaman {page} dari {totalPages}
                  </p>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="h-7 w-7 p-0">
                      <ChevronLeft size={12} />
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="h-7 w-7 p-0">
                      <ChevronRight size={12} />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
