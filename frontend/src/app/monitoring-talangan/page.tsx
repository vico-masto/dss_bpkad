'use client';

import { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  Loader2, 
  CheckCircle2, 
  ArrowRight,
  TrendingDown,
  History,
  Activity,
  Zap,
  Info,
  Copy
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell 
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function MonitoringTalanganPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTalangan();
  }, []);

  const fetchTalangan = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dss/talangan');
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch talangan', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSettle = async (id: string) => {
    if (!confirm('Nyatakan talangan ini lunas secara manual?')) return;
    try {
      await api.post(`/dss/talangan/${id}/settle`);
      toast.success('Talangan berhasil dilunasi');
      fetchTalangan();
    } catch (err) {
      toast.error('Gagal melunasi talangan');
    }
  };

  const activeTalangan = data.filter(t => t.status === 'BELUM');
  const totalActiveVal = activeTalangan.reduce((acc, t) => acc + parseFloat(t.nilai), 0);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-12">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SummaryItem 
          label="Total Talangan Aktif" 
          value={totalActiveVal} 
          color="text-[#B42318]" 
          bg="bg-[#FEF3F2]"
          icon={<TrendingDown size={18} />} 
        />
        <SummaryItem 
          label="Status Likuiditas" 
          value={totalActiveVal > 0 ? 'DEFISIT BERJALAN' : 'KONDISI AMAN'} 
          color={totalActiveVal > 0 ? "text-[#B42318]" : "text-[#027A48]"} 
          bg={totalActiveVal > 0 ? "bg-[#FEF3F2]" : "bg-[#ECFDF3]"}
          icon={<Activity size={18} />} 
          isCurrency={false}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8">
          <Card className="rounded-xl border border-fin-border shadow-sm bg-white overflow-hidden">
            <div className="p-6 border-b border-[#F2F4F7] bg-fin-page/50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-ds-primary rounded-lg flex items-center justify-center text-white">
                  <Activity size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-fin-text-primary">Jurnal Talangan Aktif</h3>
                  <p className="text-xs text-fin-text-secondary font-medium">Monitoring pergerakan dana antar sumber</p>
                </div>
              </div>
              <Badge variant="outline" className="bg-white text-fin-text-muted border-[#EAECF0] px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider">Live Monitoring</Badge>
            </div>

            <div className="overflow-x-auto min-h-[500px]">
               {loading ? (
                 <div className="flex flex-col items-center justify-center py-40 text-fin-text-muted">
                   <Loader2 className="animate-spin mb-4" size={48} />
                   <p className="text-sm font-medium">Sinkronisasi data...</p>
                 </div>
               ) : activeTalangan.length === 0 ? (
                 <div className="py-48 text-center text-fin-text-muted">
                    <ShieldCheck size={64} className="mx-auto mb-6 opacity-20" />
                    <p className="font-bold text-xs uppercase tracking-widest">Semua talangan telah dilunasi.</p>
                 </div>
               ) : (
                 <Table>
                    <TableHeader className="bg-fin-page">
                      <TableRow className="border-b border-fin-border hover:bg-transparent">
                        <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Referensi / ID</TableHead>
                        <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider">Alur Talangan</TableHead>
                        <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-right">Nilai (Rp)</TableHead>
                        <TableHead className="px-6 py-4 text-xs font-medium text-fin-text-secondary uppercase tracking-wider text-center">Tindakan</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-[#E9ECEF]">
                      {activeTalangan.map((t: any) => (
                        <TableRow key={t.id} className="hover:bg-fin-page transition-colors group">
                          <TableCell className="px-6 py-4">
                             <div className="flex items-center gap-2 group/copy cursor-pointer" onClick={() => {
                               if (t.no_referensi) {
                                 navigator.clipboard.writeText(t.no_referensi);
                                 toast.success('Nomor Referensi Disalin', { description: t.no_referensi });
                               }
                             }}>
                                <p className="text-sm font-bold text-fin-text-primary tracking-tight group-hover/copy:text-[#2E90FA] transition-colors uppercase">{t.no_referensi || 'MANUAL ENTRY'}</p>
                                {t.no_referensi && <Copy size={12} className="text-[#2E90FA] opacity-0 group-hover/copy:opacity-100 transition-all" />}
                             </div>
                             <p className="text-[10px] font-semibold text-[#667085] mt-1 uppercase tracking-wider">{format(new Date(t.tanggal), 'dd MMM yyyy')}</p>
                          </TableCell>
                          <TableCell className="px-6 py-4">
                             <div className="flex items-center gap-3">
                                <span className="text-[10px] font-bold text-[#B42318] bg-[#FEF3F2] px-2.5 py-1 rounded-lg border border-[#FECDCA] uppercase">{t.id_sumber_asli}</span>
                                <ArrowRight size={14} className="text-[#D0D5DD]" />
                                <span className="text-[10px] font-bold text-fin-text-secondary bg-[#F9FAFB] px-2.5 py-1 rounded-lg border border-[#EAECF0] uppercase">{t.id_sumber_talangan}</span>
                             </div>
                             <p className="text-[10px] font-medium text-[#667085] mt-2 line-clamp-1 italic">"{t.uraian}"</p>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-right">
                             <span className="text-sm font-bold text-[#B42318] tabular-nums">{formatCurrency(t.nilai)}</span>
                          </TableCell>
                          <TableCell className="px-6 py-4 text-center">
                             <button 
                               onClick={() => handleSettle(t.id)}
                               className="h-9 px-4 bg-[#027A48] hover:bg-[#05603A] text-white rounded-lg font-bold text-[10px] transition-all shadow-sm active:scale-95 uppercase tracking-wider"
                             >
                               Nyatakan Lunas
                             </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                 </Table>
               )}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <Card className="bg-ds-primary p-8 rounded-xl shadow-lg text-white relative overflow-hidden group border-none">
            <div className="absolute top-0 right-0 p-10 opacity-10 group-hover:scale-125 transition-transform duration-1000">
                <History size={140} />
            </div>
            <h3 className="text-lg font-semibold mb-8 tracking-tight flex items-center">
              <Zap className="mr-3 text-[#FEDF89]" size={20} />
              Logika Pelunasan
            </h3>
            <div className="space-y-6 relative z-10">
              <div className="p-5 bg-white/5 rounded-xl border border-white/10">
                <p className="text-[11px] font-bold text-[#FEDF89] mb-2 uppercase tracking-widest">Otomatisasi</p>
                <p className="text-xs text-white/60 leading-relaxed">Talangan akan dinyatakan lunas seketika (Auto-Settlement) saat ada Kas Masuk pada Sumber Dana asli yang mencukupi untuk menutup defisit.</p>
              </div>
               <div className="p-5 bg-white/5 rounded-xl border border-white/10">
                <p className="text-[11px] font-bold text-[#2E90FA] mb-2 uppercase tracking-widest">Manual Settle</p>
                <p className="text-xs text-white/60 leading-relaxed">Administrator dapat melakukan pelunasan manual jika terjadi pergeseran dana antar rekening bank yang tidak tercatat dalam sistem pendapatan.</p>
              </div>
            </div>
          </Card>

          <Card className="bg-white p-6 rounded-xl shadow-sm border border-fin-border">
             <h3 className="text-xs font-bold text-fin-text-secondary mb-6 flex items-center uppercase tracking-wider">
               <Info size={16} className="mr-2 text-fin-text-muted" />
               Riwayat Settlement
             </h3>
             <div className="space-y-3">
                {data.filter(t => t.status === 'SELESAI').slice(0, 5).map((t, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-[#F9FAFB] rounded-xl border border-[#EAECF0] group/copy cursor-pointer" onClick={() => {
                       if (t.no_referensi) {
                         navigator.clipboard.writeText(t.no_referensi);
                         toast.success('Nomor Referensi Disalin');
                       }
                    }}>
                       <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] font-bold text-fin-text-primary truncate max-w-[150px] group-hover/copy:text-[#2E90FA] transition-colors uppercase tracking-tight">{t.no_referensi || 'AUTO-SYSTEM'}</span>
                             {t.no_referensi && <Copy size={10} className="text-[#2E90FA] opacity-0 group-hover/copy:opacity-100 transition-all" />}
                          </div>
                          <span className="text-[9px] font-semibold text-fin-text-muted mt-1">{format(new Date(t.tanggal_selesai || t.updatedAt), 'dd/MM/yyyy')}</span>
                       </div>
                       <Badge variant="outline" className="text-[9px] font-bold text-[#027A48] bg-[#ECFDF3] border-[#ABEFC6] px-2 py-0.5 rounded-lg">LUNAS</Badge>
                    </div>
                ))}
             </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, color, icon, bg, isCurrency = true }: any) {
  return (
    <Card className="p-4 sm:p-6 rounded-xl border border-fin-border shadow-sm bg-white transition-all hover:border-[#2E90FA] overflow-hidden">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", bg, color)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-fin-text-muted uppercase tracking-wider mb-1 truncate">{label}</p>
          <p className={cn("text-base sm:text-lg lg:text-xl font-bold tracking-tight tabular-nums truncate", color)} title={isCurrency ? formatCurrency(value) : value}>
            {isCurrency ? formatCurrency(value) : value}
          </p>
        </div>
      </div>
    </Card>
  );
}
