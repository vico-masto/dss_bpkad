'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  CalendarCheck,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
} from 'lucide-react';
import api from '@/lib/api';
import { PageHeader } from '@/components/patterns/page-header';
import { formatCurrency, cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Combobox } from "@/components/ui/combobox";
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

interface StatsData {
  sp2dCount: number;
  sp2dNeto: number;
  potonganCount: number;
  potonganNilai: number;
}

interface Sp2dRow {
  id: string;
  nomor: string;
  tanggal: string;
  opd: string;
  uraian?: string;
  nilai_neto: number;
}

interface PotRow {
  id: string;
  jenis_potongan: string;
  nilai: string | number;
  sp2d_nomor?: string;
  sp2d_tanggal?: string;
  opd?: string;
}

interface AutoMatchResult {
  sp2dId: string;
  sp2dNomor: string;
  bankId: number;
  selisih: number;
}

interface ListData {
  data: Sp2dRow[] | PotRow[];
  total: number;
  totalPages: number;
}

export default function KelengkapanPencairanPage() {
  const [activeTab, setActiveTab] = useState<'sp2d' | 'potongan'>('sp2d');
  const [filters, setFilters] = useState({ tahun: String(CURRENT_YEAR), bulan: '', opd: '' });
  const [page, setPage] = useState(1);
  const limit = 30;

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [rowDates, setRowDates] = useState<Record<string, string>>({});
  const [bulkDate, setBulkDate] = useState('');
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [lastAutoMatched, setLastAutoMatched] = useState<AutoMatchResult[]>([]);

  const { data: stats, mutate: mutateStats } = useSWR<StatsData>(
    `/sp2d/missing-pencairan/stats?tahun=${filters.tahun}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const listParams = new URLSearchParams({
    type: activeTab,
    tahun: filters.tahun,
    page: String(page),
    limit: String(limit),
    ...(filters.bulan && { bulan: filters.bulan }),
    ...(filters.opd && { opd: filters.opd }),
  });

  const { data: listData, isLoading, mutate: mutateList } = useSWR<ListData>(
    `/sp2d/missing-pencairan?${listParams}`,
    fetcher,
    { revalidateOnFocus: false }
  );

  const rows = listData?.data || [];
  const total: number = listData?.total || 0;
  const totalPages: number = listData?.totalPages || 1;

  const resetSelection = () => {
    setSelectedIds(new Set());
    setPage(1);
  };

  const handleTabChange = (v: string) => {
    setActiveTab(v as 'sp2d' | 'potongan');
    resetSelection();
  };

  const handleFilterChange = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    resetSelection();
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => String(r.id))));
    }
  };

  const saveSingle = async (id: string) => {
    const tgl = rowDates[id];
    if (!tgl) { toast.error('Masukkan tanggal pencairan terlebih dahulu'); return; }
    setSaving((prev) => new Set([...prev, id]));
    try {
      const res = await api.put('/sp2d/missing-pencairan/bulk', {
        ids: [id], tanggal_pencairan: tgl, type: activeTab,
      });
      toast.success(res.data.message || 'Tersimpan');
      const matched = res.data.autoMatched as AutoMatchResult[] | undefined;
      if (matched && matched.length > 0) {
        setLastAutoMatched(matched);
        toast.success(`${matched.length} SP2D berhasil auto-match ke bank!`);
      }
      mutateList();
      mutateStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal menyimpan';
      toast.error(msg);
    } finally {
      setSaving((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  };

  const saveBulk = async () => {
    if (!bulkDate) { toast.error('Masukkan tanggal pencairan'); return; }
    if (selectedIds.size === 0) { toast.error('Pilih minimal 1 baris'); return; }
    setBulkLoading(true);
    try {
      const res = await api.put('/sp2d/missing-pencairan/bulk', {
        ids: [...selectedIds], tanggal_pencairan: bulkDate, type: activeTab,
      });
      toast.success(res.data.message || 'Berhasil diupdate');
      const matched = res.data.autoMatched as AutoMatchResult[] | undefined;
      if (matched && matched.length > 0) setLastAutoMatched(matched);
      setSelectedIds(new Set());
      setBulkDate('');
      mutateList();
      mutateStats();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal update';
      toast.error(msg);
    } finally {
      setBulkLoading(false);
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
          title="Kelengkapan Tanggal Pencairan"
          description="SP2D dan potongan yang belum memiliki tanggal pencairan — isi agar rekonsiliasi bank akurat"
          icon={<CalendarCheck className="size-5" />}
          className="flex-1"
        />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className={cn(
          'lux-stat p-4 rounded-xl flex flex-col group',
          (stats?.sp2dCount ?? 0) > 0 ? 'lux-stat-amber' : 'lux-stat-emerald'
        )}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-white/60 uppercase tracking-wider">SP2D Belum Tanggal Pencairan</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <CalendarCheck className={cn('w-3.5 h-3.5', (stats?.sp2dCount ?? 0) > 0 ? 'text-amber-200' : 'text-emerald-200')} />
            </div>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{stats?.sp2dCount ?? '—'}</p>
          <p className="text-xs text-white/50 mt-1 tabular-nums">{formatCurrency(stats?.sp2dNeto ?? 0)}</p>
        </div>
        <div className={cn(
          'lux-stat p-4 rounded-xl flex flex-col group',
          (stats?.potonganCount ?? 0) > 0 ? 'lux-stat-amber' : 'lux-stat-emerald'
        )}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-bold text-white/60 uppercase tracking-wider">Potongan Belum Tanggal Pencairan</span>
            <div className="w-7 h-7 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <AlertTriangle className={cn('w-3.5 h-3.5', (stats?.potonganCount ?? 0) > 0 ? 'text-amber-200' : 'text-emerald-200')} />
            </div>
          </div>
          <p className="text-2xl font-bold text-white tabular-nums">{stats?.potonganCount ?? '—'}</p>
          <p className="text-xs text-white/50 mt-1 tabular-nums">{formatCurrency(stats?.potonganNilai ?? 0)}</p>
        </div>
      </div>

      {/* Auto-match result banner */}
      {lastAutoMatched.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-green-800 text-sm">
          <CheckCircle2 size={18} className="shrink-0 text-green-600 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">
              Auto-Match Berhasil: {lastAutoMatched.length} SP2D langsung cocok ke bank
            </p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {lastAutoMatched.slice(0, 5).map((m) => (
                <li key={m.sp2dId}>
                  {m.sp2dNomor} → bank id:{m.bankId}
                  {m.selisih > 0 && ` (selisih Rp ${m.selisih.toLocaleString('id-ID')})`}
                </li>
              ))}
              {lastAutoMatched.length > 5 && <li>... dan {lastAutoMatched.length - 5} lainnya</li>}
            </ul>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setLastAutoMatched([])}
            className="shrink-0 text-green-700 hover:bg-green-100"
          >
            <X size={14} />
          </Button>
        </div>
      )}

      {/* Main Content Card */}
      <Card className="bg-fin-surface border border-fin-border rounded-xl shadow-sm">
        <CardContent className="p-6 space-y-4">
          {/* Tabs + Filters */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="bg-fin-page border border-fin-border h-auto p-0.5 rounded-lg">
                <TabsTrigger
                  value="sp2d"
                  className="px-4 py-1.5 rounded text-xs font-medium data-[state=active]:bg-fin-surface data-[state=active]:shadow-sm flex items-center gap-1.5"
                >
                  SP2D
                  {(stats?.sp2dCount ?? 0) > 0 && (
                    <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 h-4">
                      {stats?.sp2dCount}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="potongan"
                  className="px-4 py-1.5 rounded text-xs font-medium data-[state=active]:bg-fin-surface data-[state=active]:shadow-sm flex items-center gap-1.5"
                >
                  Potongan
                  {(stats?.potonganCount ?? 0) > 0 && (
                    <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 h-4">
                      {stats?.potonganCount}
                    </Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap gap-2">
              <Combobox
                value={filters.tahun}
                onValueChange={(v) => handleFilterChange('tahun', v || '')}
                className="h-8 w-24"
                size="sm"
                options={YEARS.map((y) => ({ value: y, label: y }))}
              />
              <Combobox
                value={filters.bulan || 'all'}
                onValueChange={(v) => handleFilterChange('bulan', v === 'all' ? '' : v || '')}
                placeholder="Semua Bulan"
                className="h-8 w-36"
                size="sm"
                options={[{ value: 'all', label: 'Semua Bulan' }, ...MONTHS]}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => { mutateList(); mutateStats(); }}
                className="h-8 px-3 text-xs border-fin-border gap-1.5"
              >
                <RefreshCw size={12} /> Refresh
              </Button>
            </div>
          </div>

          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl">
              <span className="text-sm font-semibold text-indigo-700">
                {selectedIds.size} baris dipilih
              </span>
              <Input
                type="date"
                value={bulkDate}
                onChange={(e) => setBulkDate(e.target.value)}
                className="h-8 w-40 text-xs border-indigo-300"
              />
              <Button
                onClick={saveBulk}
                disabled={!bulkDate}
                loading={bulkLoading}
                size="sm"
                leftIcon={<CalendarCheck size={12} />}
              >
                Terapkan & Auto-Match ke Bank
              </Button>
              <Button
                variant="link"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                Batalkan pilihan
              </Button>
            </div>
          )}

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-fin-text-muted gap-2">
              <Loader2 size={20} className="animate-spin" /> Memuat data...
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-fin-text-muted">
              <CheckCircle2 size={44} className="text-green-500" />
              <p className="font-semibold text-fin-text-primary text-lg">Semua Lengkap!</p>
              <p className="text-sm">
                Tidak ada {activeTab === 'sp2d' ? 'SP2D' : 'potongan'} yang belum memiliki tanggal
                pencairan{filters.bulan
                  ? ` untuk bulan ${MONTHS.find((m) => m.value === filters.bulan)?.label}`
                  : ''}.
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-fin-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-fin-page/60">
                      <TableHead className="w-10 pl-4">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 rounded border-fin-border accent-indigo-600 cursor-pointer"
                          checked={selectedIds.size === rows.length && rows.length > 0}
                          onChange={toggleSelectAll}
                        />
                      </TableHead>
                      {activeTab === 'sp2d' ? (
                        <>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted">Nomor SP2D</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted">Tgl SIPD</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted">OPD</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted">Uraian</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted text-right pr-4">Nilai Neto</TableHead>
                        </>
                      ) : (
                        <>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted">Jenis</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted">SP2D Ref</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted">Tgl SP2D</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted">OPD</TableHead>
                          <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted text-right pr-4">Nilai</TableHead>
                        </>
                      )}
                      <TableHead className="text-[10px] font-bold uppercase tracking-wider text-fin-text-muted">Tanggal Pencairan</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeTab === 'sp2d'
                      ? (rows as Sp2dRow[]).map((row) => {
                          const id = String(row.id);
                          const isSaving = saving.has(id);
                          const isSelected = selectedIds.has(id);
                          const tglDisplay = row.tanggal
                            ? format(new Date(row.tanggal), 'dd/MM/yyyy')
                            : '-';
                          return (
                            <TableRow key={id} className={cn('hover:bg-fin-page/30 transition-colors', isSelected && 'bg-indigo-50/50')}>
                              <TableCell className="pl-4">
                                <input type="checkbox" className="w-3.5 h-3.5 rounded border-fin-border accent-indigo-600 cursor-pointer" checked={isSelected} onChange={() => toggleSelect(id)} />
                              </TableCell>
                              <TableCell className="text-xs font-mono font-medium text-fin-text-primary max-w-[180px] truncate" title={row.nomor}>{row.nomor}</TableCell>
                              <TableCell className="text-xs text-fin-text-muted whitespace-nowrap">{tglDisplay}</TableCell>
                              <TableCell className="text-xs text-fin-text-muted max-w-[160px] truncate" title={row.opd}>{row.opd}</TableCell>
                              <TableCell className="text-xs text-fin-text-muted max-w-[180px] truncate" title={row.uraian || ''}>{row.uraian || '-'}</TableCell>
                              <TableCell className="text-xs font-semibold text-fin-text-primary text-right pr-4 whitespace-nowrap">{formatCurrency(row.nilai_neto)}</TableCell>
                              <TableCell>
                                <Input type="date" value={rowDates[id] || ''} onChange={(e) => setRowDates((p) => ({ ...p, [id]: e.target.value }))} className="h-7 text-xs border-fin-border w-36" />
                              </TableCell>
                              <TableCell>
                                <Button size="sm" onClick={() => saveSingle(id)} disabled={!rowDates[id]} loading={isSaving} className="h-7 px-3 text-[11px]">
                                  Simpan
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      : (rows as PotRow[]).map((row) => {
                          const id = String(row.id);
                          const isSaving = saving.has(id);
                          const isSelected = selectedIds.has(id);
                          const tglDisplay = row.sp2d_tanggal
                            ? format(new Date(row.sp2d_tanggal), 'dd/MM/yyyy')
                            : '-';
                          return (
                            <TableRow key={id} className={cn('hover:bg-fin-page/30 transition-colors', isSelected && 'bg-indigo-50/50')}>
                              <TableCell className="pl-4">
                                <input type="checkbox" className="w-3.5 h-3.5 rounded border-fin-border accent-indigo-600 cursor-pointer" checked={isSelected} onChange={() => toggleSelect(id)} />
                              </TableCell>
                              <TableCell className="text-xs font-medium">
                                <Badge variant="outline" className="text-[10px] font-semibold">{row.jenis_potongan}</Badge>
                              </TableCell>
                              <TableCell className="text-xs font-mono text-fin-text-muted max-w-[160px] truncate" title={row.sp2d_nomor || ''}>{row.sp2d_nomor || '-'}</TableCell>
                              <TableCell className="text-xs text-fin-text-muted whitespace-nowrap">{tglDisplay}</TableCell>
                              <TableCell className="text-xs text-fin-text-muted max-w-[160px] truncate" title={row.opd || ''}>{row.opd}</TableCell>
                              <TableCell className="text-xs font-semibold text-fin-text-primary text-right pr-4 whitespace-nowrap">{formatCurrency(Number(row.nilai))}</TableCell>
                              <TableCell>
                                <Input type="date" value={rowDates[id] || ''} onChange={(e) => setRowDates((p) => ({ ...p, [id]: e.target.value }))} className="h-7 text-xs border-fin-border w-36" />
                              </TableCell>
                              <TableCell>
                                <Button size="sm" onClick={() => saveSingle(id)} disabled={!rowDates[id]} loading={isSaving} className="h-7 px-3 text-[11px]">
                                  Simpan
                                </Button>
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
                    {total} item · Halaman {page} dari {totalPages}
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
