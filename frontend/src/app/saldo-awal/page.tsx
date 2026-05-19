'use client';

import { useState, useEffect } from 'react';
import { 
  Database, 
  Save, 
  Loader2, 
  Calendar, 
  Banknote,
  AlertCircle,
  RefreshCcw,
  CheckCircle2
} from 'lucide-react';
import { 
  Table, 
  TableHeader, 
  TableBody, 
  TableRow, 
  TableHead, 
  TableCell 
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import api from '@/lib/api';
import { toast } from 'sonner';

export default function SaldoAwalPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tahun, setTahun] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchSaldoAwal();
  }, [tahun]);

  const fetchSaldoAwal = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dss/saldo-awal', { params: { tahun } });
      setData(res.data);
    } catch (err) {
      console.error('Failed to fetch saldo awal', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (id_sumber_dana: string, nilai: number) => {
    setSaving(true);
    try {
      await api.post('/dss/saldo-awal', { id_sumber_dana, tahun, nilai });
      // update local state
      setData(prev => prev.map(item => item.id === id_sumber_dana ? { ...item, nilai } : item));
      toast.success('Saldo awal berhasil diperbarui');
    } catch (err) {
      toast.error('Gagal memperbarui saldo awal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-slate-900/20 ring-4 ring-slate-900/5">
            <Database size={32} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Konfigurasi Saldo Awal</h1>
            <p className="text-slate-500 font-medium mt-1.5 text-[11px]">Baseline liquidity setup for fiscal year</p>
          </div>
        </div>
        
        <div className="flex items-center space-x-3 bg-white px-6 py-3 rounded-[24px] shadow-sm border border-slate-100 group hover:border-brand transition-colors">
          <Calendar size={18} className="text-slate-400 group-hover:text-brand" />
          <select 
            className="bg-transparent outline-none font-bold text-slate-700 text-xs cursor-pointer"
            value={tahun}
            onChange={(e) => setTahun(Number(e.target.value))}
          >
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>Tahun {y}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SummaryItem 
          label="Total Saldo Awal" 
          value={data.reduce((acc: any, curr: any) => acc + (curr.nilai || 0), 0)} 
          color="text-[#101828]" 
          bg="bg-[#F8F9FA]"
          icon={<Banknote size={18} />} 
        />
        <SummaryItem 
          label="Tahun Anggaran" 
          value={tahun} 
          color="text-[#175CD3]" 
          bg="bg-[#EFF8FF]"
          icon={<Calendar size={18} />} 
          isCurrency={false}
        />
        <SummaryItem 
          label="Status Setup" 
          value={data.length > 0 ? "AKTIF" : "BELUM ADA"} 
          color="text-[#027A48]" 
          bg="bg-[#ECFDF3]"
          icon={<CheckCircle2 size={18} />} 
          isCurrency={false}
        />
      </div>

      <div className="bg-[#FFFAEB] border border-[#FEDF89] p-6 rounded-xl flex items-start gap-4 shadow-sm">
        <div className="w-10 h-10 bg-[#F79009] rounded-lg flex items-center justify-center text-white flex-shrink-0 shadow-sm">
          <AlertCircle size={20} />
        </div>
        <div>
          <p className="font-bold text-[#B54708] text-sm tracking-tight">Penting: Baseline Likuiditas</p>
          <p className="text-[#B54708] text-xs font-medium mt-1.5 leading-relaxed opacity-80">Saldo awal ini akan menjadi dasar perhitungan kas efektif sepanjang tahun anggaran. Pastikan angka sesuai dengan saldo kas daerah per 31 Desember tahun sebelumnya.</p>
        </div>
      </div>

      <Card className="rounded-xl border border-[#E9ECEF] overflow-hidden bg-white shadow-sm">
        <div className="p-6 border-b border-[#F2F4F7] bg-[#F8F9FA]/50 flex justify-between items-center">
           <h3 className="text-lg font-semibold text-[#101828]">Master Saldo Awal</h3>
           {saving && (
             <div className="flex items-center gap-2 text-[#2E90FA] animate-pulse">
               <Loader2 size={14} className="animate-spin" />
               <span className="text-[10px] font-bold uppercase tracking-wider">Auto-saving...</span>
             </div>
           )}
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-[#F8F9FA]">
              <TableRow className="border-b border-[#E9ECEF] hover:bg-transparent">
                <TableHead className="px-6 py-4 text-xs font-medium text-[#475467] uppercase tracking-wider">Sumber Dana</TableHead>
                <TableHead className="px-6 py-4 text-xs font-medium text-[#475467] uppercase tracking-wider">Nilai Saldo Awal (Rp)</TableHead>
                <TableHead className="px-6 py-4 text-xs font-medium text-[#475467] uppercase tracking-wider text-right">Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#E9ECEF]">
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="px-6 py-20 text-center">
                    <Loader2 className="animate-spin mx-auto text-[#98A2B3]" size={40} />
                  </TableCell>
                </TableRow>
              ) : (
                data.map((item: any) => (
                  <TableRow key={item.id} className="hover:bg-[#F8F9FA] transition-colors group">
                    <TableCell className="px-6 py-4">
                      <div className="flex flex-col">
                        <p className="font-bold text-[#101828] text-sm tracking-tight uppercase">{item.nama}</p>
                        <p className="text-[10px] font-semibold text-[#667085] mt-0.5">{item.id}</p>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="relative max-w-[250px]">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#98A2B3]">RP</div>
                        <Input 
                          type="text" 
                          className="w-full h-10 pl-10 bg-[#F9FAFB] border-[#EAECF0] rounded-lg focus-visible:ring-[#2E90FA]/20 focus-visible:border-[#2E90FA] font-bold text-sm text-[#101828] transition-all"
                          value={formatNumber(item.nilai || 0)}
                          onChange={(e) => {
                            const val = parseNumber(e.target.value);
                            setData(prev => prev.map(p => p.id === item.id ? { ...p, nilai: val } : p));
                          }}
                          onBlur={(e) => {
                            const val = parseNumber(e.target.value);
                            handleUpdate(item.id, val);
                          }}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-right">
                       <div className="flex justify-end">
                         <div className="w-8 h-8 rounded-lg bg-[#ECFDF3] text-[#027A48] flex items-center justify-center shadow-sm">
                            <CheckCircle2 size={16} />
                         </div>
                       </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function SummaryItem({ label, value, color, icon, bg, isCurrency = true }: any) {
  return (
    <Card className="p-4 sm:p-6 rounded-xl border border-[#E9ECEF] shadow-sm bg-white transition-all hover:border-[#2E90FA] overflow-hidden">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", bg, color)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-[#98A2B3] uppercase tracking-wider mb-1 truncate">{label}</p>
          <p className={cn("text-base sm:text-lg lg:text-xl font-bold tracking-tight tabular-nums truncate", color)} title={isCurrency ? formatCurrency(value) : value}>
            {isCurrency ? formatCurrency(value) : value}
          </p>
        </div>
      </div>
    </Card>
  );
}
