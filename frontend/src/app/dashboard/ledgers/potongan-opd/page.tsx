'use client';

import React, { useState, useMemo } from 'react';
import useSWR from 'swr';
import {
  Filter,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Building2,
  Receipt,
  TrendingDown,
  FileText,
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcelMultiSheet, printPDF } from '@/lib/exportUtils';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const BULAN_NAMES = [
  'Semua Bulan', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const JENIS_OPTIONS = ['SEMUA', 'PPH 21', 'PPH 22', 'PPH 23', 'PPN', 'IWP', 'TAPERUM', 'BPJS', 'LAINNYA'];

const fetcher = (url: string, params: Record<string, string>) => api.get(url, { params }).then(r => r.data);

type RincianItem = {
  id: string;
  tanggal: string;
  nomorSp2d: string;
  jenisPotongan: string;
  uraian: string;
  idBilling: string;
  nilai: number;
  tipe: string;
  statusRekon: string;
};

type OpdRow = {
  opd: string;
  totalDipungut: number;
  totalDisetor: number;
  selisih: number;
  jumlahDokumen: number;
  status: string;
  rincian: RincianItem[];
};

export default function RealisasiPotonganOpdPage() {
  const currentYear = new Date().getFullYear();

  const [filters, setFilters] = useState({
    tahun: currentYear.toString(),
    bulan: '0',
    startDate: '',
    endDate: '',
    opd: 'SEMUA',
    jenisPotongan: 'SEMUA',
  });
  const [queryParams, setQueryParams] = useState({ ...filters });
  const [showFilters, setShowFilters] = useState(true);
  const [expandedOpd, setExpandedOpd] = useState<Set<string>>(new Set());
  const [searchOpd, setSearchOpd] = useState('');

  const { data, error, isLoading, mutate } = useSWR(
    ['/reports/potongan-opd-realisasi', queryParams],
    ([url, params]) => fetcher(url, params)
  );

  const summary = data?.summary ?? { totalDipungut: 0, totalDisetor: 0, selisih: 0, totalDokumen: 0, jumlahOpd: 0 };
  const rows: OpdRow[] = useMemo(() => data?.data ?? [], [data]);

  const filteredRows = useMemo(() => {
    if (!searchOpd.trim()) return rows;
    return rows.filter(r => r.opd.toLowerCase().includes(searchOpd.toLowerCase()));
  }, [rows, searchOpd]);

  const handleDisplay = () => {
    setQueryParams({ ...filters });
    mutate();
  };

  const toggleExpand = (opd: string) => {
    setExpandedOpd(prev => {
      const next = new Set(prev);
      if (next.has(opd)) { next.delete(opd); } else { next.add(opd); }
      return next;
    });
  };

  const buildPeriodeLabel = () => {
    const { tahun, bulan, startDate, endDate } = queryParams;
    if (startDate && endDate) return `${startDate} s.d. ${endDate}`;
    if (bulan !== '0') return `${BULAN_NAMES[parseInt(bulan)]} ${tahun}`;
    return `Tahun ${tahun}`;
  };

  const handleExportExcel = () => {
    if (!rows.length) { toast.error('Tidak ada data untuk diekspor'); return; }

    const rekapData = rows.map((r, i) => ({
      'No': i + 1,
      'OPD': r.opd,
      'Total Dipungut (Rp)': r.totalDipungut,
      'Total Disetor (Rp)': r.totalDisetor,
      'Selisih (Rp)': r.selisih,
      'Jumlah Dokumen': r.jumlahDokumen,
      'Status': r.status === 'LUNAS' ? 'Lunas' : 'Belum Lunas',
    }));

    const rincianAll: Record<string, string | number>[] = [];
    rows.forEach(r => {
      r.rincian.forEach((item, idx) => {
        rincianAll.push({
          'No': idx + 1,
          'OPD': r.opd,
          'Tanggal': item.tanggal ? format(new Date(item.tanggal), 'dd/MM/yyyy') : '-',
          'No. SP2D / Bukti': item.nomorSp2d,
          'Jenis Potongan': item.jenisPotongan,
          'Uraian': item.uraian,
          'ID Billing': item.idBilling,
          'Nilai (Rp)': item.nilai,
          'Tipe': item.tipe === 'POTONGAN_BANK' ? 'Potongan Bank' : 'Input Manual',
          'Status Rekon': item.statusRekon,
        });
      });
    });

    type JenisItem = { jenis: string; total: number; count: number };
    const jenisData = (data?.breakdownJenis ?? [] as JenisItem[]).map((j: JenisItem, i: number) => ({
      'No': i + 1,
      'Jenis Potongan': j.jenis,
      'Total (Rp)': j.total,
      'Jumlah Transaksi': j.count,
    }));

    const periode = buildPeriodeLabel().replace(/[^a-zA-Z0-9]/g, '_');
    exportToExcelMultiSheet(
      [
        { data: rekapData, sheetName: 'Rekapitulasi' },
        { data: rincianAll, sheetName: 'Rincian' },
        { data: jenisData, sheetName: 'Per Jenis' },
      ],
      `Realisasi_Potongan_OPD_${periode}`
    );
    toast.success('File Excel berhasil diunduh');
  };

  const handleCetak = () => {
    if (!filteredRows.length) { toast.error('Tidak ada data untuk dicetak'); return; }

    const headers = ['No', 'OPD', 'Dipungut (Rp)', 'Disetor (Rp)', 'Selisih (Rp)', 'Dok', 'Status'];
    const body = filteredRows.map((r, i) => [
      i + 1,
      r.opd,
      formatCurrency(r.totalDipungut),
      formatCurrency(r.totalDisetor),
      formatCurrency(r.selisih),
      r.jumlahDokumen,
      r.status === 'LUNAS' ? 'Lunas' : 'Belum Lunas',
    ]);
    const foot = [['', 'TOTAL',
      formatCurrency(summary.totalDipungut),
      formatCurrency(summary.totalDisetor),
      formatCurrency(summary.selisih),
      summary.totalDokumen,
      '',
    ]];

    try {
      printPDF(headers, body, `REALISASI RINCIAN POTONGAN PER OPD — ${buildPeriodeLabel().toUpperCase()}`, foot);
    } catch {
      toast.error('Gagal mencetak laporan');
    }
  };

  const statusBadge = (status: string) =>
    status === 'LUNAS'
      ? <Badge className="bg-fin-income/10 text-fin-income border-fin-income/20 text-[10px]"><CheckCircle2 size={10} className="mr-1" />Lunas</Badge>
      : <Badge className="bg-fin-expense/10 text-fin-expense border-fin-expense/20 text-[10px]"><AlertTriangle size={10} className="mr-1" />Belum Lunas</Badge>;

  const rekonBadge = (s: string) =>
    s === 'SUDAH'
      ? <span className="text-fin-income text-[10px] font-semibold">✓ Disetor</span>
      : <span className="text-fin-expense text-[10px]">⏳ Belum</span>;

  return (
    <div className="flex flex-col space-y-6 p-6 min-h-screen bg-fin-page">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-fin-text-primary tracking-tight flex items-center gap-3">
            <div className="w-10 h-10 bg-[#F79009] rounded-xl flex items-center justify-center shadow-lg shadow-[#F79009]/20">
              <FileSpreadsheet className="text-white" size={22} />
            </div>
            Realisasi Potongan Per OPD
          </h1>
          <p className="text-sm text-fin-text-muted mt-1 font-medium">Laporan rincian potongan yang dipungut dan disetor per unit kerja</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowFilters(v => !v)} className={cn('h-10 border-fin-border', showFilters && 'bg-fin-page')}>
            <Filter size={16} className="mr-2" /> Filter
          </Button>
          <Button variant="outline" onClick={handleExportExcel} className="h-10 border-fin-border">
            <FileSpreadsheet size={16} className="mr-2" /> Excel
          </Button>
          <Button variant="primary" onClick={handleCetak} className="h-10">
            <Printer size={16} className="mr-2" /> Cetak Laporan
          </Button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <AnimatePresence>
        {showFilters && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <Card className="border-fin-border shadow-sm bg-fin-surface">
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Tahun</label>
                    <select
                      value={filters.tahun}
                      onChange={e => setFilters(f => ({ ...f, tahun: e.target.value }))}
                      className="w-full h-10 rounded-md border border-fin-border bg-fin-surface px-3 text-sm text-fin-text-primary focus:outline-none focus:ring-1 focus:ring-fin-text-primary"
                    >
                      {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Bulan</label>
                    <select
                      value={filters.bulan}
                      onChange={e => setFilters(f => ({ ...f, bulan: e.target.value }))}
                      className="w-full h-10 rounded-md border border-fin-border bg-fin-surface px-3 text-sm text-fin-text-primary focus:outline-none focus:ring-1 focus:ring-fin-text-primary"
                    >
                      {BULAN_NAMES.map((b, i) => <option key={i} value={i}>{b}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Dari Tanggal</label>
                    <Input type="date" value={filters.startDate} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} className="h-10 border-fin-border" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Sampai Tanggal</label>
                    <Input type="date" value={filters.endDate} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} className="h-10 border-fin-border" />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Jenis Potongan</label>
                    <select
                      value={filters.jenisPotongan}
                      onChange={e => setFilters(f => ({ ...f, jenisPotongan: e.target.value }))}
                      className="w-full h-10 rounded-md border border-fin-border bg-fin-surface px-3 text-sm text-fin-text-primary focus:outline-none focus:ring-1 focus:ring-fin-text-primary"
                    >
                      {JENIS_OPTIONS.map(j => <option key={j} value={j}>{j}</option>)}
                    </select>
                  </div>

                  <Button onClick={handleDisplay} className="h-10 bg-[#F79009] hover:opacity-90 text-white font-bold">
                    <RefreshCw size={16} className="mr-2" /> Tampilkan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-5 -mr-4 -mt-4 rotate-12 group-hover:scale-110 transition-transform">
            <Building2 size={80} />
          </div>
          <CardContent className="p-5">
            <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Total Dipungut</p>
            <h3 className="text-xl font-black text-fin-text-primary tabular-nums">
              {isLoading ? '...' : formatCurrency(summary.totalDipungut)}
            </h3>
            <p className="text-[10px] text-fin-text-muted mt-1">{summary.jumlahOpd} OPD</p>
          </CardContent>
        </Card>

        <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-5 -mr-4 -mt-4 -rotate-12 group-hover:scale-110 transition-transform">
            <CheckCircle2 size={80} />
          </div>
          <CardContent className="p-5">
            <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Total Disetor</p>
            <h3 className="text-xl font-black text-fin-income tabular-nums">
              {isLoading ? '...' : formatCurrency(summary.totalDisetor)}
            </h3>
            <p className="text-[10px] text-fin-text-muted mt-1">
              {summary.totalDipungut > 0
                ? `${((summary.totalDisetor / summary.totalDipungut) * 100).toFixed(1)}% realisasi`
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-fin-expense/20 shadow-sm bg-fin-expense-bg overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-10 -mr-4 -mt-4 group-hover:scale-110 transition-transform">
            <TrendingDown size={80} className="text-fin-expense" />
          </div>
          <CardContent className="p-5">
            <p className="text-[10px] font-black text-fin-expense uppercase tracking-widest mb-1">Selisih / Outstanding</p>
            <h3 className="text-xl font-black text-fin-expense tabular-nums">
              {isLoading ? '...' : formatCurrency(summary.selisih)}
            </h3>
            <p className="text-[10px] text-fin-expense/70 mt-1">
              {summary.totalDipungut > 0
                ? `${((summary.selisih / summary.totalDipungut) * 100).toFixed(1)}% outstanding`
                : '—'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden relative group">
          <div className="absolute top-0 right-0 p-6 opacity-5 -mr-4 -mt-4 rotate-6 group-hover:scale-110 transition-transform">
            <Receipt size={80} />
          </div>
          <CardContent className="p-5">
            <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest mb-1">Jumlah Dokumen</p>
            <h3 className="text-xl font-black text-fin-text-primary tabular-nums">
              {isLoading ? '...' : summary.totalDokumen.toLocaleString('id-ID')}
            </h3>
            <p className="text-[10px] text-fin-text-muted mt-1">transaksi tercatat</p>
          </CardContent>
        </Card>
      </div>

      {/* SEARCH + TABLE */}
      <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-fin-border bg-fin-page/30">
          <p className="text-[11px] font-bold text-fin-text-muted uppercase tracking-widest">
            Rekapitulasi Per OPD — {buildPeriodeLabel()}
          </p>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Cari OPD..."
              value={searchOpd}
              onChange={e => setSearchOpd(e.target.value)}
              className="h-8 w-48 border-fin-border text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-20 gap-3 text-fin-text-muted">
              <Loader2 size={24} className="animate-spin" />
              <span className="text-sm">Memuat data...</span>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-20 gap-3 text-fin-expense">
              <AlertCircle size={20} />
              <span className="text-sm">Gagal memuat data. Periksa koneksi server.</span>
            </div>
          )}

          {!isLoading && !error && (
            <Table>
              <TableHeader className="bg-fin-page/50">
                <TableRow className="border-b border-fin-border">
                  <TableHead className="w-12 text-[10px] font-black text-fin-text-muted uppercase text-center py-3">No</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3">OPD / Unit Kerja</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3 text-right">Dipungut</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3 text-right">Disetor</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3 text-right">Selisih</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3 text-center">Dok</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3 text-center">Status</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filteredRows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16 text-fin-text-muted text-sm">
                      <FileText size={32} className="mx-auto mb-2 opacity-30" />
                      Tidak ada data potongan pada periode ini.
                    </TableCell>
                  </TableRow>
                )}

                {filteredRows.map((row, idx) => {
                  const isExpanded = expandedOpd.has(row.opd);
                  return (
                    <React.Fragment key={row.opd}>
                      {/* OPD Summary Row */}
                      <TableRow
                        key={row.opd}
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-fin-page/60 border-b border-fin-border/50',
                          isExpanded && 'bg-fin-subtle/50'
                        )}
                        onClick={() => toggleExpand(row.opd)}
                      >
                        <TableCell className="text-center text-[11px] text-fin-text-muted font-medium py-3">{idx + 1}</TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            {isExpanded
                              ? <ChevronDown size={14} className="text-fin-text-muted flex-shrink-0" />
                              : <ChevronRight size={14} className="text-fin-text-muted flex-shrink-0" />}
                            <span className="text-[12px] font-semibold text-fin-text-primary">{row.opd}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right text-[12px] font-semibold text-fin-text-primary tabular-nums py-3">
                          {formatCurrency(row.totalDipungut)}
                        </TableCell>
                        <TableCell className="text-right text-[12px] font-semibold text-fin-income tabular-nums py-3">
                          {formatCurrency(row.totalDisetor)}
                        </TableCell>
                        <TableCell className={cn('text-right text-[12px] font-bold tabular-nums py-3', row.selisih > 1 ? 'text-fin-expense' : 'text-fin-text-muted')}>
                          {formatCurrency(row.selisih)}
                        </TableCell>
                        <TableCell className="text-center text-[11px] text-fin-text-secondary py-3">{row.jumlahDokumen}</TableCell>
                        <TableCell className="text-center py-3">{statusBadge(row.status)}</TableCell>
                      </TableRow>

                      {/* Expandable Detail Rows */}
                      <AnimatePresence>
                        {isExpanded && (
                          <TableRow key={`${row.opd}-detail`} className="bg-fin-page/30">
                            <TableCell colSpan={7} className="p-0">
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-fin-border/50 bg-fin-page/60">
                                  <div className="px-6 py-2 border-b border-fin-border/30">
                                    <p className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">
                                      Rincian Transaksi — {row.opd}
                                    </p>
                                  </div>
                                  {row.rincian.length === 0 ? (
                                    <p className="text-center py-6 text-[11px] text-fin-text-muted">Tidak ada rincian transaksi</p>
                                  ) : (
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="border-b border-fin-border/30 bg-fin-subtle/30">
                                          <th className="pl-12 pr-3 py-2 text-left text-[10px] font-black text-fin-text-muted uppercase">Tanggal</th>
                                          <th className="px-3 py-2 text-left text-[10px] font-black text-fin-text-muted uppercase">No. SP2D / Bukti</th>
                                          <th className="px-3 py-2 text-left text-[10px] font-black text-fin-text-muted uppercase">Jenis</th>
                                          <th className="px-3 py-2 text-left text-[10px] font-black text-fin-text-muted uppercase">Uraian</th>
                                          <th className="px-3 py-2 text-left text-[10px] font-black text-fin-text-muted uppercase">ID Billing</th>
                                          <th className="px-3 py-2 text-right text-[10px] font-black text-fin-text-muted uppercase">Nilai</th>
                                          <th className="px-3 py-2 text-center text-[10px] font-black text-fin-text-muted uppercase">Status</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {row.rincian.map((item, i) => (
                                          <tr key={item.id} className={cn('border-b border-fin-border/20', i % 2 === 0 ? 'bg-transparent' : 'bg-fin-subtle/20')}>
                                            <td className="pl-12 pr-3 py-2 text-fin-text-secondary">
                                              {item.tanggal ? format(new Date(item.tanggal), 'dd/MM/yyyy') : '-'}
                                            </td>
                                            <td className="px-3 py-2 font-mono text-fin-text-secondary text-[10px]">{item.nomorSp2d || '-'}</td>
                                            <td className="px-3 py-2">
                                              <span className="bg-fin-subtle border border-fin-border rounded px-1.5 py-0.5 text-[9px] font-bold text-fin-text-secondary uppercase">
                                                {item.jenisPotongan}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-fin-text-secondary max-w-xs truncate">{item.uraian || '-'}</td>
                                            <td className="px-3 py-2 font-mono text-fin-text-muted text-[10px]">{item.idBilling || '-'}</td>
                                            <td className="px-3 py-2 text-right font-semibold text-fin-text-primary tabular-nums">
                                              {formatCurrency(item.nilai)}
                                            </td>
                                            <td className="px-3 py-2 text-center">{rekonBadge(item.statusRekon)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </motion.div>
                            </TableCell>
                          </TableRow>
                        )}
                      </AnimatePresence>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Footer totals */}
        {!isLoading && !error && filteredRows.length > 0 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-fin-border bg-fin-page/50">
            <span className="text-[11px] text-fin-text-muted">
              Menampilkan {filteredRows.length} OPD · {summary.totalDokumen} dokumen total
            </span>
            <div className="flex items-center gap-6 text-[11px] font-bold">
              <span className="text-fin-text-muted">Total Dipungut: <span className="text-fin-text-primary tabular-nums">{formatCurrency(summary.totalDipungut)}</span></span>
              <span className="text-fin-text-muted">Total Disetor: <span className="text-fin-income tabular-nums">{formatCurrency(summary.totalDisetor)}</span></span>
              <span className="text-fin-text-muted">Selisih: <span className="text-fin-expense tabular-nums">{formatCurrency(summary.selisih)}</span></span>
            </div>
          </div>
        )}
      </Card>

      {/* Breakdown Per Jenis */}
      {!isLoading && data?.breakdownJenis?.length > 0 && (
        <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden">
          <div className="px-5 py-3 border-b border-fin-border bg-fin-page/30">
            <p className="text-[11px] font-bold text-fin-text-muted uppercase tracking-widest">Breakdown Per Jenis Potongan</p>
          </div>
          <CardContent className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {(data.breakdownJenis as { jenis: string; total: number; count: number }[]).map((j) => (
                <div key={j.jenis} className="bg-fin-page rounded-lg p-3 border border-fin-border">
                  <p className="text-[10px] font-black text-fin-text-muted uppercase mb-1 truncate">{j.jenis}</p>
                  <p className="text-[13px] font-black text-fin-text-primary tabular-nums">{formatCurrency(j.total)}</p>
                  <p className="text-[10px] text-fin-text-muted mt-0.5">{j.count} transaksi</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
