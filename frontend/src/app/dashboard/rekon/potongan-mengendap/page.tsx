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
  ShieldAlert
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import { motion, AnimatePresence } from 'framer-motion';
import { exportToExcelMultiSheet, printPDF } from '@/lib/exportUtils';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

const BULAN_NAMES = [
  'Semua Bulan', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const fetcher = (url: string, params: Record<string, string>) => api.get(url, { params }).then(r => r.data);

type PotonganMengendapItem = {
  id: string;
  keterangan: string;
  nilai: number;
  no_sp2d: string;
  tanggal_sp2d: string | null;
  opd: string;
  status_rekon: string;
};

export default function PotonganMengendapPage() {
  const currentYear = new Date().getFullYear();

  const [filters, setFilters] = useState({
    tahun: currentYear.toString(),
    bulan: '0',
    opd: '',
  });
  const [queryParams, setQueryParams] = useState({ ...filters });
  const [showFilters, setShowFilters] = useState(true);

  const { data, error, isLoading, mutate } = useSWR(
    ['/reports/reconciliation/potongan-mengendap', queryParams],
    ([url, params]) => fetcher(url, params)
  );

  const rows: PotonganMengendapItem[] = useMemo(() => {
    if (!Array.isArray(data)) return [];
    return [...data].sort((a, b) => new Date(a.tanggal_sp2d || 0).getTime() - new Date(b.tanggal_sp2d || 0).getTime());
  }, [data]);

  const handleDisplay = () => {
    setQueryParams({ ...filters });
    mutate();
  };

  const buildPeriodeLabel = () => {
    const { tahun, bulan } = queryParams;
    if (bulan !== '0') return `${BULAN_NAMES[parseInt(bulan)]} ${tahun}`;
    return `Tahun ${tahun}`;
  };

  const totalNilai = useMemo(() => rows.reduce((acc, curr) => acc + curr.nilai, 0), [rows]);

  const handleExportExcel = () => {
    if (!rows.length) { toast.error('Tidak ada data untuk diekspor'); return; }

    const excelData = rows.map((r, i) => ({
      'No': i + 1,
      'Tanggal': r.tanggal_sp2d ? format(new Date(r.tanggal_sp2d), 'dd/MM/yyyy') : '-',
      'OPD / Unit Kerja': r.opd,
      'No. SP2D': r.no_sp2d,
      'Keterangan Potongan': r.keterangan,
      'Nilai (Rp)': r.nilai,
    }));

    const periode = buildPeriodeLabel().replace(/[^a-zA-Z0-9]/g, '_');
    exportToExcelMultiSheet(
      [
        { data: excelData, sheetName: 'Data Mengendap' },
      ],
      `Laporan_Potongan_Mengendap_${periode}`
    );
    toast.success('File Excel berhasil diunduh');
  };

  const handleCetak = () => {
    if (!rows.length) { toast.error('Tidak ada data untuk dicetak'); return; }

    const headers = ['No', 'Tanggal', 'OPD / Unit Kerja', 'No. SP2D', 'Keterangan Potongan', 'Nilai (Rp)'];
    const body = rows.map((r, i) => [
      i + 1,
      r.tanggal_sp2d ? format(new Date(r.tanggal_sp2d), 'dd/MM/yyyy') : '-',
      r.opd,
      r.no_sp2d,
      r.keterangan || '-',
      formatCurrency(r.nilai),
    ]);
    
    const foot = [['', '', '', '', 'TOTAL MENGENDAP', formatCurrency(totalNilai)]];

    try {
      printPDF(headers, body, `LAPORAN DETAIL POTONGAN MENGENDAP (BELUM DISALURKAN) — ${buildPeriodeLabel().toUpperCase()}`, foot);
    } catch {
      toast.error('Gagal mencetak laporan');
    }
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
          <p className="text-sm text-fin-text-muted mt-1 font-medium">Laporan rincian potongan "Lainnya" yang belum disalurkan di Rekening Koran Bank</p>
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
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
                    <label className="text-[10px] font-black text-fin-text-muted uppercase tracking-widest">Unit Kerja (OPD)</label>
                    <Input placeholder="Ketik nama OPD..." value={filters.opd} onChange={e => setFilters(f => ({ ...f, opd: e.target.value }))} className="h-10 border-fin-border" />
                  </div>

                  <Button onClick={handleDisplay} className="h-10 bg-ds-primary hover:opacity-90 text-white font-bold">
                    <RefreshCw size={16} className="mr-2" /> Tampilkan
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SUMMARY CARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lux-stat lux-stat-rose p-5 rounded-xl flex flex-col group col-span-1 lg:col-span-1 border border-fin-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-rose-200/70 uppercase tracking-widest">Total Potongan Mengendap</span>
            <div className="w-8 h-8 bg-white/10 border border-white/10 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform shrink-0">
              <ShieldAlert className="w-4 h-4 text-rose-200" />
            </div>
          </div>
          <h3 className="text-2xl font-black text-white tabular-nums truncate">
            {isLoading ? '...' : formatCurrency(totalNilai)}
          </h3>
          <span className="text-[10px] text-rose-200/50 mt-1">{rows.length} transaksi belum disalurkan</span>
        </div>
      </div>

      {/* SEARCH + TABLE */}
      <Card className="border-fin-border shadow-sm bg-fin-surface overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-fin-border bg-fin-page/30">
          <p className="text-[11px] font-bold text-fin-text-muted uppercase tracking-widest">
            Rincian Transaksi Mengendap — {buildPeriodeLabel()}
          </p>
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
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3">Tanggal</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3">OPD / Unit Kerja</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3 w-[250px]">No. SP2D</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3">Keterangan Potongan</TableHead>
                  <TableHead className="text-[10px] font-black text-fin-text-muted uppercase py-3 text-right">Nilai (Rp)</TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-16 text-fin-text-muted text-sm">
                      <FileText size={32} className="mx-auto mb-2 opacity-30" />
                      Tidak ada data potongan mengendap pada periode ini.
                    </TableCell>
                  </TableRow>
                )}

                {rows.map((row, idx) => (
                    <TableRow key={row.id} className="transition-colors hover:bg-fin-page border-b border-fin-border/50">
                      <TableCell className="text-center text-[11px] text-fin-text-muted font-medium py-3">{idx + 1}</TableCell>
                      <TableCell className="py-3 text-[12px] font-medium text-fin-text-secondary whitespace-nowrap">
                        {row.tanggal_sp2d ? format(new Date(row.tanggal_sp2d), 'dd/MM/yyyy') : '-'}
                      </TableCell>
                      <TableCell className="py-3 text-[12px] font-semibold text-fin-text-primary">
                        {row.opd}
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="font-mono text-[12px] font-bold text-fin-text-primary whitespace-nowrap">{row.no_sp2d}</span>
                      </TableCell>
                      <TableCell className="py-3 text-[12px] text-fin-text-secondary">
                        {row.keterangan || '-'}
                      </TableCell>
                      <TableCell className="text-right text-[12px] font-bold text-fin-text-primary tabular-nums py-3">
                        {formatCurrency(row.nilai)}
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>
    </div>
  );
}
