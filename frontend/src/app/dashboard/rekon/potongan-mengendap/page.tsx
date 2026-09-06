'use client';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Filter,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  Loader2,
  AlertCircle,
  FileText,
  ShieldAlert,
  ArrowRight,
  Clock,
  CircleCheck,
  CheckCircle2,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { exportToExcelMultiSheet, printPDF } from '@/lib/exportUtils';
import { useAuth } from '@/hooks/useAuth';

const BULAN_NAMES = [
  'Semua Bulan', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const STATUS_OPTIONS = [
  { value: 'MENGENDAP', label: 'Mengendap', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  { value: 'DISETOR', label: 'Disetor', color: 'bg-sky-100 text-sky-700 border-sky-300' },
  { value: 'JADI_PADAN', label: 'Jadi PAD', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
];

const STATUS_COLORS: Record<string, string> = {
  MENGENDAP: 'bg-amber-100 text-amber-700 border border-amber-300',
  DISETOR: 'bg-sky-100 text-sky-700 border border-sky-300',
  JADI_PADAN: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
};

const fetcher = (url: string, params: unknown) => api.get(url, { params: params as Record<string, string> }).then(r => r.data);

type PotonganMengendapItem = {
  id: string;
  keterangan: string;
  nilai: number;
  no_sp2d: string;
  tanggal_sp2d: string | null;
  opd: string;
  uraian_sp2d: string;
  status_rekon: string;
  status_mengendap: string;
  tanggal_penyelesaian: string | null;
  catatan_penyelesaian: string | null;
  umur_hari: number | null;
};

type Summary = { MENGENDAP: number; DISETOR: number; JADI_PADAN: number };

type ApiResponse = { records: PotonganMengendapItem[]; summary: Summary };

export default function PotonganMengendapPage() {
  const currentYear = new Date().getFullYear();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === 'admin';

  const [filters, setFilters] = useState({ tahun: currentYear.toString(), bulan: '0', opd: '' });
  const [queryParams, setQueryParams] = useState({ ...filters });
  const [showFilters, setShowFilters] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedRow, setSelectedRow] = useState<PotonganMengendapItem | null>(null);
  const [newStatus, setNewStatus] = useState('DISETOR');
  const [catatan, setCatatan] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data, error, isLoading, mutate } = useSWR<ApiResponse>(
    ['/reports/reconciliation/potongan-mengendap', queryParams],
    ([url, params]) => fetcher(url, params)
  );

  const rows: PotonganMengendapItem[] = useMemo(() => {
    const recs = data?.records || [];
    return [...recs].sort((a, b) => new Date(a.tanggal_sp2d || 0).getTime() - new Date(b.tanggal_sp2d || 0).getTime());
  }, [data]);

  const filteredRows = useMemo(() => {
    if (statusFilter === 'ALL') return rows;
    return rows.filter(r => (r.status_mengendap || 'MENGENDAP') === statusFilter);
  }, [rows, statusFilter]);

  const summary: Summary = data?.summary || { MENGENDAP: 0, DISETOR: 0, JADI_PADAN: 0 };
  const totalNilai = useMemo(() => filteredRows.reduce((acc, curr) => acc + curr.nilai, 0), [filteredRows]);

  const handleDisplay = () => { setQueryParams({ ...filters }); mutate(); };

  const buildPeriodeLabel = () => {
    const { tahun, bulan } = queryParams;
    if (bulan !== '0') return `${BULAN_NAMES[parseInt(bulan)]} ${tahun}`;
    return `Tahun ${tahun}`;
  };

  const getUmurBadge = (hari: number | null) => {
    if (hari === null) return <span className="text-fin-text-muted">—</span>;
    const cls = hari > 180 ? 'bg-red-100 text-red-700' : hari > 90 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600';
    return <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums', cls)}>{hari} hari</span>;
  };

  const handleOpenStatus = (row: PotonganMengendapItem) => {
    setSelectedRow(row);
    const current = row.status_mengendap || 'MENGENDAP';
    setNewStatus(current === 'MENGENDAP' ? 'DISETOR' : 'MENGENDAP');
    setCatatan('');
    setShowModal(true);
  };

  const handleSubmitStatus = async () => {
    if (!selectedRow || !catatan.trim()) { toast.error('Catatan wajib diisi'); return; }
    setIsSubmitting(true);
    try {
      await api.patch(`/dss/mengendap/${selectedRow.id}`, {
        status_mengendap: newStatus,
        catatan_penyelesaian: catatan.trim(),
      });
      toast.success(`Status ${selectedRow.no_sp2d} diubah ke ${newStatus}`);
      setShowModal(false);
      await mutate();
    } catch (e: any) {
      toast.error('Gagal: ' + (e.response?.data?.message || e.message));
    } finally { setIsSubmitting(false); }
  };

  const handleExportExcel = () => {
    if (!filteredRows.length) { toast.error('Tidak ada data untuk diekspor'); return; }
    const excelData = filteredRows.map((r, i) => ({
      'No': i + 1,
      'Tanggal': r.tanggal_sp2d ? format(new Date(r.tanggal_sp2d), 'dd/MM/yyyy') : '-',
      'OPD': r.opd,
      'No. SP2D': r.no_sp2d,
      'Keterangan': r.keterangan,
      'Nilai (Rp)': r.nilai,
      'Status': r.status_mengendap || 'MENGENDAP',
      'Umur (hari)': r.umur_hari ?? '-',
    }));
    exportToExcelMultiSheet([{ data: excelData, sheetName: 'Mengendap' }], `Potongan_Mengendap_${buildPeriodeLabel().replace(/[^a-zA-Z0-9]/g, '_')}`);
    toast.success('File Excel diunduh');
  };

  const handleCetak = () => {
    if (!filteredRows.length) { toast.error('Tidak ada data'); return; }
    const headers = ['No', 'Tanggal', 'OPD', 'No. SP2D', 'Keterangan', 'Status', 'Umur', 'Nilai (Rp)'];
    const body = filteredRows.map((r, i) => [
      i + 1,
      r.tanggal_sp2d ? format(new Date(r.tanggal_sp2d), 'dd/MM/yyyy') : '-',
      r.opd,
      r.no_sp2d,
      r.keterangan || '-',
      r.status_mengendap || 'MENGENDAP',
      r.umur_hari !== null ? `${r.umur_hari} hr` : '-',
      formatCurrency(r.nilai),
    ]);
    const foot = [['', '', '', '', '', '', 'TOTAL', formatCurrency(totalNilai)]];
    try {
      printPDF(headers, body, `POTONGAN MENGENDAP — ${buildPeriodeLabel().toUpperCase()}`, foot);
    } catch { toast.error('Gagal mencetak'); }
  };

  return (
    <div className="flex flex-col space-y-6 p-6 min-h-screen bg-fin-page">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-fin-text-primary tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-rose-500 rounded-xl flex items-center justify-center shadow-lg shadow-rose-500/20">
              <ShieldAlert className="text-white" size={22} />
            </div>
            Potongan Mengendap
          </h1>
          <p className="text-sm text-fin-text-muted mt-1 font-medium">Rincian potongan &quot;Lainnya&quot; belum disalurkan — lacak status penyelesaian</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowFilters(v => !v)} className={cn('h-10 border-fin-border', showFilters && 'bg-fin-page')}>
            <Filter size={16} className="mr-2" /> Filter
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="h-10 border-fin-border">
            <FileSpreadsheet size={16} className="mr-2" /> Excel
          </Button>
          <Button variant="primary" onClick={handleCetak} className="h-10">
            <Printer size={16} className="mr-2" /> Cetak
          </Button>
        </div>
      </div>

      {/* FILTER PANEL */}
      {showFilters && (
        <Card className="border-fin-border shadow-sm bg-fin-surface">
          <CardContent className="p-5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tahun</label>
                <select value={filters.tahun} onChange={e => setFilters(f => ({ ...f, tahun: e.target.value }))}
                  className="w-full h-10 rounded-md border border-fin-border bg-fin-surface px-3 text-sm">
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Bulan</label>
                <select value={filters.bulan} onChange={e => setFilters(f => ({ ...f, bulan: e.target.value }))}
                  className="w-full h-10 rounded-md border border-fin-border bg-fin-surface px-3 text-sm">
                  {BULAN_NAMES.map((b, i) => <option key={i} value={i}>{b}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">OPD</label>
                <Input placeholder="Ketik nama OPD..." value={filters.opd} onChange={e => setFilters(f => ({ ...f, opd: e.target.value }))} className="h-10 border-fin-border" />
              </div>
              <Button onClick={handleDisplay} className="h-10 bg-ds-primary hover:opacity-90 text-white font-bold">
                <RefreshCw size={16} className="mr-2" /> Tampilkan
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl bg-fin-surface border border-fin-border/50">
          <span className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Total Mengendap</span>
          <h3 className="text-xl font-black text-fin-text-primary tabular-nums mt-1">{isLoading ? '...' : formatCurrency(summary.MENGENDAP)}</h3>
          <span className="text-[10px] text-fin-text-muted">{summary.MENGENDAP} dokumen</span>
        </div>
        <div className="p-4 rounded-xl bg-fin-surface border border-fin-border/50">
          <span className="text-[10px] font-black text-sky-500 uppercase tracking-widest">Disetor</span>
          <h3 className="text-xl font-black text-sky-700 tabular-nums mt-1">{isLoading ? '...' : formatCurrency(summary.DISETOR)}</h3>
          <span className="text-[10px] text-fin-text-muted">{summary.DISETOR} dokumen</span>
        </div>
        <div className="p-4 rounded-xl bg-fin-surface border border-fin-border/50">
          <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Jadi PAD</span>
          <h3 className="text-xl font-black text-emerald-700 tabular-nums mt-1">{isLoading ? '...' : formatCurrency(summary.JADI_PADAN)}</h3>
          <span className="text-[10px] text-fin-text-muted">{summary.JADI_PADAN} dokumen</span>
        </div>
        <div className="p-4 rounded-xl bg-fin-surface border border-fin-border/50">
          <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Filtered</span>
          <h3 className="text-xl font-black text-rose-700 tabular-nums mt-1">{isLoading ? '...' : formatCurrency(totalNilai)}</h3>
          <span className="text-[10px] text-fin-text-muted">{filteredRows.length} / {rows.length} dokumen</span>
        </div>
      </div>

      {/* STATUS FILTER CHIPS */}
      <div className="flex flex-wrap items-center gap-2">
        {['ALL', 'MENGENDAP', 'DISETOR', 'JADI_PADAN'].map(s => {
          const active = statusFilter === s;
          const count = s === 'ALL' ? rows.length : (summary[s as keyof Summary] || 0);
          const label = s === 'ALL' ? 'Semua' : STATUS_OPTIONS.find(o => o.value === s)?.label || s;
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={cn('px-3 h-8 rounded-lg text-[11px] font-bold transition-colors border',
                active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-fin-surface text-fin-text-secondary border-fin-border hover:border-indigo-300')}>
              {label} ({count})
            </button>
          );
        })}
      </div>

      {/* TABLE */}
      <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-fin-border bg-fin-page/30">
          <p className="text-[11px] font-bold text-fin-text-muted uppercase tracking-widest">Rincian — {buildPeriodeLabel()}</p>
          {isAdmin && <p className="text-[10px] text-fin-text-muted italic">Admin dapat mengubah status penyelesaian</p>}
        </div>
        <div className="overflow-x-auto">
          {isLoading && <div className="flex items-center justify-center py-20 gap-3 text-fin-text-muted"><Loader2 size={24} className="animate-spin" /><span className="text-sm">Memuat...</span></div>}
          {error && <div className="flex items-center justify-center py-20 gap-3 text-fin-expense"><AlertCircle size={20} /><span className="text-sm">Gagal memuat</span></div>}
          {!isLoading && !error && (
            <Table>
              <TableHeader className="bg-fin-page/50">
                <TableRow className="border-b border-fin-border">
                  <TableHead className="w-10 text-[10px] font-black text-fin-text-muted uppercase text-center py-2">No</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-2">Tanggal</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-2">OPD</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-2">No. SP2D</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-2">Keterangan</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-2">Uraian SP2D</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-2 text-right">Nilai</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-2 text-center">Umur</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-2 text-center">Status</TableHead>
                  {isAdmin && <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-2 text-center w-20">Aksi</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow><TableCell colSpan={isAdmin ? 10 : 9} className="text-center py-16 text-fin-text-muted text-sm">
                    <FileText size={32} className="mx-auto mb-2 opacity-30" />Tidak ada data.
                  </TableCell></TableRow>
                )}
                {filteredRows.map((row, idx) => (
                  <TableRow key={row.id} className="transition-colors hover:bg-fin-page border-b border-fin-border/50">
                    <TableCell className="text-center text-[11px] text-fin-text-muted font-medium py-2">{idx + 1}</TableCell>
                    <TableCell className="py-2 text-[12px] font-medium text-fin-text-secondary whitespace-nowrap">
                      {row.tanggal_sp2d ? format(new Date(row.tanggal_sp2d), 'dd/MM/yyyy') : '-'}
                    </TableCell>
                    <TableCell className="py-2 text-[12px] font-semibold text-fin-text-primary">{row.opd}</TableCell>
                    <TableCell className="py-2">
                      <span className="font-mono text-[12px] font-bold text-fin-text-primary whitespace-nowrap">{row.no_sp2d}</span>
                    </TableCell>
                    <TableCell className="py-2 text-[12px] text-fin-text-secondary max-w-[220px] truncate">{row.keterangan || '-'}</TableCell>
                    <TableCell className="py-2 text-[12px] text-fin-text-secondary max-w-[220px] truncate">{row.uraian_sp2d || '-'}</TableCell>
                    <TableCell className="text-right text-[12px] font-bold text-fin-text-primary tabular-nums py-2">{formatCurrency(row.nilai)}</TableCell>
                    <TableCell className="text-center py-2">{getUmurBadge(row.umur_hari)}</TableCell>
                    <TableCell className="text-center py-2">
                      <span className={cn('px-2 py-0.5 rounded-md text-[10px] font-bold uppercase', STATUS_COLORS[row.status_mengendap || 'MENGENDAP'] || STATUS_COLORS.MENGENDAP)}>
                        {row.status_mengendap === 'DISETOR' ? 'Disetor' : row.status_mengendap === 'JADI_PADAN' ? 'Jadi PAD' : 'Mengendap'}
                      </span>
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="text-center py-2">
                        <button onClick={() => handleOpenStatus(row)}
                          className="text-[10px] font-bold text-indigo-600 underline hover:text-indigo-800"
                          title="Ubah status penyelesaian">
                          Ubah
                        </button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {/* MODAL UBAH STATUS */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md rounded-xl border-fin-border">
          <DialogHeader>
            <DialogTitle className="text-sm font-black">Ubah Status Penyelesaian</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-fin-page rounded-lg p-3 text-xs space-y-1">
              <p className="font-bold text-fin-text-primary">{selectedRow?.no_sp2d}</p>
              <p className="text-fin-text-muted">{selectedRow?.opd}</p>
              <p className="tabular-nums font-bold">{selectedRow ? formatCurrency(selectedRow.nilai) : ''}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Status Baru</label>
              <Select value={newStatus} onValueChange={(v) => v && setNewStatus(v)}>
                <SelectTrigger className="h-10 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Catatan (wajib)</label>
              <Input placeholder="Nomor bukti setor, keputusan BUD, dll." value={catatan} onChange={e => setCatatan(e.target.value)} className="text-xs" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowModal(false)} className="text-xs">Batal</Button>
            <Button onClick={handleSubmitStatus} disabled={isSubmitting || !catatan.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5">
              {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
              Simpan Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
