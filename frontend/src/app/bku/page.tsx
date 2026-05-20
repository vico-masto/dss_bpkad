'use client';

import { useState, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Loader2, 
  Calendar, 
  Coins, 
  BookOpen, 
  RefreshCw, 
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import { format } from 'date-fns';
import api from '@/lib/api';
import useSWR from 'swr';
import { PageHeader } from '@/components/patterns/page-header';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const fetcher = (url: string, params: any) => api.get(url, { params }).then(res => res.data);

export default function BKUPage() {
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(50);
  const [filters, setFilters] = useState({
    id_sumber_dana: '',
    tgl_awal: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'),
    tgl_akhir: format(new Date(), 'yyyy-MM-dd'),
    sort: 'ASC'
  });

  const { data: bkuResponse, isLoading: loading, mutate: refreshBKU } = useSWR(
    ['/reports/bku', { page: currentPage, limit, ...filters }],
    ([url, params]) => fetcher(url, params),
    { revalidateOnFocus: false }
  );

  const { data: sumberDanaList = [] } = useSWR('/dss/sumber-dana', (url) => api.get(url).then(res => res.data));

  const transactions = bkuResponse?.data || [];
  const summary = bkuResponse?.summary || { saldoAwal: 0, totalPenerimaan: 0, totalPengeluaran: 0, saldoAkhir: 0 };
  const pagination = bkuResponse?.pagination || { totalData: 0, totalPages: 1 };

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-1000 pb-20">
      <PageHeader
        title="Buku Kas Umum"
        description="Kronologis saldo berjalan kas daerah"
        icon={<BookOpen className="size-5" />}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-fin-border">
              <Calendar size={14} className="text-fin-text-muted" />
              <div className="flex items-center text-xs font-medium text-fin-text-primary">
                <input
                  type="date"
                  className="bg-transparent border-none outline-none cursor-pointer"
                  value={filters.tgl_awal}
                  onChange={(e) => setFilters({...filters, tgl_awal: e.target.value})}
                />
                <span className="mx-2 text-fin-text-muted">to</span>
                <input
                  type="date"
                  className="bg-transparent border-none outline-none cursor-pointer"
                  value={filters.tgl_akhir}
                  onChange={(e) => setFilters({...filters, tgl_akhir: e.target.value})}
                />
              </div>
            </div>
            <div className="relative">
              <select
                className="bg-white px-4 h-9 rounded-lg border border-fin-border text-xs font-medium text-fin-text-primary outline-none focus:border-ds-focus-ring appearance-none cursor-pointer pr-10 transition-all"
                value={filters.id_sumber_dana}
                onChange={(e) => setFilters({...filters, id_sumber_dana: e.target.value})}
              >
                <option value="">Semua Sumber Dana</option>
                {sumberDanaList.map((sd: any) => (
                  <option key={sd.id} value={sd.id}>{sd.nama}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-fin-text-muted" size={14} />
            </div>
            <Button size="icon" onClick={() => refreshBKU()} className="h-9 w-9 bg-ds-primary text-white rounded-lg hover:bg-ds-primary-hover transition-all">
              <RefreshCw size={16} className={cn(loading && "animate-spin")} />
            </Button>
            <Button variant="outline" className="h-9 px-4 bg-white text-fin-text-secondary border-fin-border rounded-lg font-semibold text-xs hover:bg-fin-page gap-2 transition-all">
              <Download size={14} />
              <span>Export</span>
            </Button>
          </div>
        }
      />

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <SummaryItem 
          label="Total Penerimaan" 
          value={summary.totalPenerimaan} 
          color="text-[#027A48]" 
          bg="bg-[#ECFDF3]"
          icon={<ArrowUpRight size={18} />} 
          loading={loading}
         />
         <SummaryItem 
          label="Total Pengeluaran" 
          value={summary.totalPengeluaran} 
          color="text-[#B42318]" 
          bg="bg-[#FEF3F2]"
          icon={<ArrowDownLeft size={18} />} 
          loading={loading}
         />
         <SummaryItem 
          label="Saldo Akhir Buku" 
          value={summary.saldoAkhir} 
          color="text-fin-text-primary" 
          bg="bg-fin-page"
          icon={<Coins size={18} />} 
          loading={loading}
         />
      </div>

      {/* TABLE SECTION */}
      <Card className="rounded-xl border border-fin-border overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto min-h-[500px]">
          {loading && !bkuResponse ? (
            <div className="flex flex-col items-center justify-center py-40 text-fin-text-muted">
              <Loader2 className="animate-spin mb-4" size={48} />
              <p className="text-sm font-medium">Sinkronisasi data buku...</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-fin-page">
                <TableRow className="border-b border-fin-border hover:bg-transparent">
                  <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Tanggal</TableHead>
                  <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Referensi</TableHead>
                  <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">OPD</TableHead>
                  <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Keterangan</TableHead>
                  <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-right">Debet (Rp)</TableHead>
                  <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-right">Kredit (Rp)</TableHead>
                  <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-right">Saldo (Rp)</TableHead>
                  <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#E9ECEF]">
                {transactions.length === 0 ? (
                  <TableRow>
                    <td colSpan={8} className="px-6 py-40 text-center">
                       <div className="flex flex-col items-center gap-3">
                          <Filter size={48} className="text-[#F1F3F5]" />
                          <p className="text-fin-text-muted text-sm font-medium">Tidak ada transaksi dalam periode ini.</p>
                       </div>
                    </td>
                  </TableRow>
                ) : (
                  transactions.map((tx: any, idx: number) => {
                    const debet = parseFloat(tx.penerimaan || 0);
                    const kredit = parseFloat(tx.pengeluaran || 0);
                    const isAuditReady = tx.status_rekon && tx.status_rekon !== 'N/A';

                    return (
                      <TableRow key={idx} className={cn("hover:bg-fin-page transition-colors group", tx.tipe === 'SALDO_AWAL' && "bg-[#F9FAFB] font-bold")}>
                        <TableCell className="px-6 py-4 text-xs font-medium text-fin-text-secondary">
                          {format(new Date(tx.tanggal), 'dd/MM/yyyy')}
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-fin-subtle text-[#344054] border border-fin-border-strong">
                            {tx.bukti}
                          </span>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                           <p className="text-[11px] font-semibold text-fin-text-primary max-w-[150px] truncate uppercase">{tx.opd}</p>
                        </TableCell>
                        <TableCell className="px-6 py-4">
                          <p className="text-xs font-medium text-fin-text-secondary max-w-[300px] leading-relaxed">{tx.uraian}</p>
                          <p className="text-[10px] font-semibold text-[#2E90FA] mt-1 uppercase">{tx.id_sumber_dana}</p>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right text-xs font-semibold text-[#027A48]" style={{fontVariantNumeric:'tabular-nums'}}>
                          {debet > 0 ? formatCurrency(debet) : '-'}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right text-xs font-semibold text-[#B42318]" style={{fontVariantNumeric:'tabular-nums'}}>
                          {kredit > 0 ? formatCurrency(kredit) : '-'}
                        </TableCell>
                        <TableCell className="px-6 py-4 text-right">
                           <span className="text-xs font-semibold text-fin-text-primary bg-fin-page px-3 py-1.5 rounded-lg border border-fin-border transition-all group-hover:bg-white" style={{fontVariantNumeric:'tabular-nums'}}>
                             {formatCurrency(tx.saldo)}
                           </span>
                        </TableCell>
                        <TableCell className="px-6 py-4 text-center">
                           {isAuditReady ? (
                             tx.status_rekon.includes('SUDAH') ? (
                               <Badge className="bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6] text-[9px] font-bold uppercase py-0.5">
                                 <ShieldCheck size={10} className="mr-1" /> Verified
                               </Badge>
                             ) : (
                               <Badge className="bg-[#FFFAEB] text-[#B54708] border-[#FEDF89] text-[9px] font-bold uppercase py-0.5">
                                 <AlertTriangle size={10} className="mr-1" /> Unverified
                               </Badge>
                             )
                           ) : '-'}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </div>

        {/* PAGINATION FOOTER */}
        <div className="p-6 border-t border-fin-border flex items-center justify-between bg-white">
          <p className="text-xs font-medium text-fin-text-secondary">
            Menampilkan <span className="text-fin-text-primary font-bold">{transactions.length}</span> dari <span className="text-fin-text-primary font-bold">{pagination.totalData}</span> transaksi
          </p>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || loading}
              className="h-8 w-8 p-0 rounded-lg border-fin-border"
            >
              <ChevronLeft size={16} />
            </Button>
            <div className="flex items-center gap-1">
               {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                  let pageNum = i + 1;
                  if (pagination.totalPages > 5 && currentPage > 3) {
                    pageNum = currentPage - 2 + i;
                  }
                  if (pageNum > pagination.totalPages) return null;
                  
                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? "default" : "outline"}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className={cn(
                        "h-8 w-8 p-0 text-xs font-bold rounded-lg",
                        currentPage === pageNum ? "bg-ds-primary text-white" : "border-fin-border text-fin-text-secondary"
                      )}
                    >
                      {pageNum}
                    </Button>
                  );
               })}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={currentPage === pagination.totalPages || loading}
              className="h-8 w-8 p-0 rounded-lg border-fin-border"
            >
              <ChevronRight size={16} />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SummaryItem({ label, value, color, icon, bg, loading }: any) {
  return (
    <Card className="p-4 sm:p-6 rounded-xl border border-fin-border shadow-sm bg-white transition-all hover:border-[#2E90FA] overflow-hidden">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", bg, color)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider mb-1 truncate">{label}</p>
          {loading ? (
            <div className="h-6 w-24 bg-fin-subtle animate-pulse rounded mt-1" />
          ) : (
            <p className={cn("text-base sm:text-lg lg:text-xl font-bold tracking-tight tabular-nums truncate", color)} title={formatCurrency(value)}>
              {formatCurrency(value)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
