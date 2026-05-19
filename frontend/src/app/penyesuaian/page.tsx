'use client';

import { useState, useEffect } from 'react';
import { 
  PlusSquare, 
  Save, 
  Loader2, 
  RefreshCcw, 
  Calendar, 
  FileText, 
  ArrowRightLeft,
  Banknote,
  CheckCircle2,
  Info
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatNumber, parseNumber, cn } from '@/lib/utils';
import api from '@/lib/api';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function PenyesuaianPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sumberDanaList, setSumberDanaList] = useState([]);
  
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    uraian: '',
    id_sumber_dana: '',
    nilai: 0,
    jenis: 'MASUK',
    sisi_pengaruh: 'BUKU'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [adjRes, sdRes] = await Promise.all([
        api.get('/dss/penyesuaian'),
        api.get('/dss/sumber-dana')
      ]);
      setData(adjRes.data.data || []);
      setSumberDanaList(sdRes.data);
    } catch (err) {
      console.error('Failed to fetch adjustments', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/dss/penyesuaian', formData);
      toast.success('Penyesuaian Berhasil', { description: 'Data koreksi telah dicatat ke dalam buku kas.' });
      setFormData({
        tanggal: new Date().toISOString().split('T')[0],
        uraian: '',
        id_sumber_dana: '',
        nilai: 0,
        jenis: 'MASUK',
        sisi_pengaruh: 'BUKU'
      });
      fetchData();
    } catch (err) {
      toast.error('Gagal menyimpan penyesuaian');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-20">
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 bg-slate-900 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-slate-900/20 ring-4 ring-slate-900/5">
          <RefreshCcw size={32} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Penyesuaian & Koreksi</h1>
          <p className="text-slate-500 font-medium mt-1.5 text-[11px]">Financial adjustments & manual journal entry</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5">
          <Card className="rounded-xl border border-[#E9ECEF] shadow-sm bg-white overflow-hidden">
            <div className="p-6 border-b border-[#F2F4F7] bg-[#F8F9FA]/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#101828] rounded-lg flex items-center justify-center text-white">
                  <PlusSquare size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[#101828]">Entri Jurnal</h3>
                  <p className="text-xs text-[#475467] font-medium">Koreksi & penyesuaian saldo</p>
                </div>
              </div>
            </div>
            
            <div className="p-8">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-2 gap-3">
                   <button 
                    type="button"
                    onClick={() => setFormData({...formData, jenis: 'MASUK'})}
                    className={cn(
                      "py-3 rounded-lg font-bold text-[10px] border transition-all uppercase tracking-wider",
                      formData.jenis === 'MASUK' ? "bg-[#027A48] text-white border-[#027A48] shadow-sm" : "bg-[#F9FAFB] text-[#98A2B3] border-[#EAECF0]"
                    )}
                   >
                     Saldo Masuk (+)
                   </button>
                   <button 
                    type="button"
                    onClick={() => setFormData({...formData, jenis: 'KELUAR'})}
                    className={cn(
                      "py-3 rounded-lg font-bold text-[10px] border transition-all uppercase tracking-wider",
                      formData.jenis === 'KELUAR' ? "bg-[#B42318] text-white border-[#B42318] shadow-sm" : "bg-[#F9FAFB] text-[#98A2B3] border-[#EAECF0]"
                    )}
                   >
                     Saldo Keluar (-)
                   </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#475467] ml-1">Tanggal</label>
                  <Input 
                    type="date" 
                    className="h-11 bg-[#F9FAFB] border-[#EAECF0] rounded-lg focus-visible:ring-[#2E90FA]/20 focus-visible:border-[#2E90FA] font-bold text-sm"
                    value={formData.tanggal}
                    onChange={(e) => setFormData({...formData, tanggal: e.target.value})}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#475467] ml-1">Sumber Dana</label>
                  <select 
                    className="w-full h-11 px-4 bg-[#F9FAFB] border border-[#EAECF0] rounded-lg outline-none focus:ring-[#2E90FA]/20 focus:border-[#2E90FA] font-bold text-sm appearance-none cursor-pointer"
                    value={formData.id_sumber_dana}
                    onChange={(e) => setFormData({...formData, id_sumber_dana: e.target.value})}
                    required
                  >
                    <option value="">Pilih sumber dana...</option>
                    {sumberDanaList.map((sd: any) => (
                      <option key={sd.id} value={sd.id}>{sd.nama}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#475467] ml-1">Nilai Penyesuaian (Rp)</label>
                  <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-bold text-[#98A2B3]">IDR</div>
                    <Input 
                      type="text" 
                      className="w-full h-11 pl-12 pr-4 bg-[#F9FAFB] border-[#EAECF0] rounded-lg focus-visible:ring-[#2E90FA]/20 focus-visible:border-[#2E90FA] font-bold text-sm"
                      value={formatNumber(formData.nilai)}
                      onChange={(e) => setFormData({...formData, nilai: parseNumber(e.target.value)})}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#475467] ml-1">Sisi Pengaruh</label>
                  <select 
                    className="w-full h-11 px-4 bg-[#F9FAFB] border border-[#EAECF0] rounded-lg outline-none focus:ring-[#2E90FA]/20 focus:border-[#2E90FA] font-bold text-sm appearance-none cursor-pointer"
                    value={formData.sisi_pengaruh}
                    onChange={(e) => setFormData({...formData, sisi_pengaruh: e.target.value})}
                    required
                  >
                    <option value="BUKU">Pengaruh BKU (Fisik)</option>
                    <option value="REALIASI">Pengaruh Realisasi Pagu</option>
                    <option value="KEDUA_SISI">Pengaruh Kedua Sisi</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[#475467] ml-1">Keterangan / Uraian</label>
                  <Textarea 
                    className="px-4 py-3 bg-[#F9FAFB] border-[#EAECF0] rounded-lg focus-visible:ring-[#2E90FA]/20 focus-visible:border-[#2E90FA] min-h-[100px] font-medium text-sm"
                    placeholder="Contoh: Koreksi salah catat atau pengembalian belanja..."
                    value={formData.uraian}
                    onChange={(e) => setFormData({...formData, uraian: e.target.value})}
                    required
                  />
                </div>

                <Button 
                  type="submit"
                  disabled={saving}
                  className="w-full h-12 bg-[#101828] hover:bg-[#1D2939] text-white rounded-lg font-bold shadow-sm flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="animate-spin" size={20} /> : <Save size={20} />}
                  <span className="uppercase tracking-widest text-[10px]">Simpan Penyesuaian</span>
                </Button>
              </form>
            </div>
          </Card>
        </div>

        <div className="lg:col-span-7">
          <Card className="rounded-xl border border-[#E9ECEF] shadow-sm bg-white overflow-hidden">
             <div className="p-6 border-b border-[#F2F4F7] bg-[#F8F9FA]/50 flex justify-between items-center">
               <h3 className="text-lg font-semibold text-[#101828]">Daftar Koreksi Terakhir</h3>
               <ArrowRightLeft size={18} className="text-[#98A2B3]" />
             </div>

             <div className="overflow-x-auto min-h-[500px]">
               {loading ? (
                 <div className="flex flex-col items-center justify-center py-40 text-[#98A2B3]">
                   <Loader2 className="animate-spin mb-4" size={48} />
                   <p className="text-sm font-medium">Memuat data penyesuaian...</p>
                 </div>
               ) : data.length === 0 ? (
                 <div className="py-40 text-center text-[#98A2B3] font-medium text-xs uppercase tracking-widest">Tidak ada data penyesuaian.</div>
               ) : (
                 <Table>
                   <TableHeader className="bg-[#F8F9FA]">
                     <TableRow className="border-b border-[#E9ECEF] hover:bg-transparent">
                       <TableHead className="px-6 py-4 text-xs font-medium text-[#475467] uppercase tracking-wider">Tanggal</TableHead>
                       <TableHead className="px-6 py-4 text-xs font-medium text-[#475467] uppercase tracking-wider">Uraian / Sumber</TableHead>
                       <TableHead className="px-6 py-4 text-xs font-medium text-[#475467] uppercase tracking-wider text-right">Nilai (Rp)</TableHead>
                       <TableHead className="px-6 py-4 text-xs font-medium text-[#475467] uppercase tracking-wider text-center">Tipe</TableHead>
                     </TableRow>
                   </TableHeader>
                   <TableBody className="divide-y divide-[#E9ECEF]">
                     {data.map((item: any) => (
                       <TableRow key={item.id} className="hover:bg-[#F8F9FA] transition-colors group">
                         <TableCell className="px-6 py-4 text-xs font-semibold text-[#667085]">
                            {format(new Date(item.tanggal), 'dd/MM/yyyy')}
                         </TableCell>
                         <TableCell className="px-6 py-4">
                            <p className="text-sm font-bold text-[#101828] tracking-tight">{item.uraian}</p>
                            <p className="text-[10px] font-semibold text-[#2E90FA] mt-1 uppercase">{item.id_sumber_dana}</p>
                         </TableCell>
                         <TableCell className={cn(
                           "px-6 py-4 text-right font-bold text-sm tabular-nums",
                           item.jenis === 'MASUK' ? "text-[#027A48]" : "text-[#B42318]"
                         )}>
                            {item.jenis === 'MASUK' ? '+' : '-'} {formatCurrency(item.nilai)}
                         </TableCell>
                         <TableCell className="px-6 py-4 text-center">
                            <span className={cn(
                              "text-[9px] font-bold px-2 py-1 rounded-md uppercase border",
                              item.sisi_pengaruh === 'BUKU' ? "bg-[#F2F4F7] text-[#344054] border-[#D0D5DD]" : "bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]"
                            )}>
                              {item.sisi_pengaruh}
                            </span>
                         </TableCell>
                       </TableRow>
                     ))}
                   </TableBody>
                 </Table>
               )}
             </div>
          </Card>
        </div>
      </div>
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
