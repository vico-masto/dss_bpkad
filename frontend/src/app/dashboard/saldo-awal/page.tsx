'use client';

import { useState, useEffect } from 'react';
import { 
  Database, 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Banknote,
  History,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import { toast } from 'sonner';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumericInput } from '@/components/NumericInput';
import { PageHeader } from '@/components/patterns/page-header';

export default function SaldoAwalPage() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sumberDana, setSumberDana] = useState<any[]>([]);
  const [tahun, setTahun] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchSaldoAwal();
  }, [tahun]);

  const fetchSaldoAwal = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dss/saldo-awal', { params: { tahun } });
      setSumberDana(res.data.map((item: any) => ({
        ...item,
        saldo_awal: parseFloat(item.nilai) || 0
      })));
    } catch (err) {
      console.error(err);
      toast.error('Gagal mengambil data saldo awal');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (id: string, value: number) => {
    setSumberDana(prev => prev.map(item => 
      item.id === id ? { ...item, saldo_awal: value } : item
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.post('/dss/saldo-awal', { tahun, data: sumberDana });
      toast.success('Saldo awal berhasil disimpan');
      fetchSaldoAwal();
    } catch (err) {
      toast.error('Gagal menyimpan saldo awal');
    } finally {
      setSaving(false);
    }
  };

  const totalSaldoAwal = sumberDana.reduce((sum, item) => sum + item.saldo_awal, 0);

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700 pb-20">
      {/* PAGE HEADER */}
      <PageHeader
        title="Saldo Awal Tahun"
        description="Konfigurasi saldo awal kas per sumber dana"
        icon={<Banknote className="size-5" />}
        actions={
          <div className="flex items-center gap-2">
            <Select value={tahun.toString()} onValueChange={(v) => setTahun(parseInt(v))}>
              <SelectTrigger className="h-10 w-48 bg-fin-surface border-fin-border rounded-lg text-xs font-semibold px-4 shadow-sm">
                <SelectValue placeholder="Pilih Tahun" />
              </SelectTrigger>
              <SelectContent className="rounded-lg border-fin-border">
                <SelectItem value="2026" className="text-xs font-semibold">Tahun Anggaran 2026</SelectItem>
                <SelectItem value="2025" className="text-xs font-semibold">Tahun Anggaran 2025</SelectItem>
              </SelectContent>
            </Select>
            <Button size="icon" variant="outline" onClick={fetchSaldoAwal} className="h-10 w-10 bg-fin-surface border-fin-border text-fin-text-muted rounded-lg hover:bg-fin-page transition-all">
              <RefreshCw size={18} className={cn(loading && "animate-spin")} />
            </Button>
          </div>
        }
      />

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-[#101828] p-6 rounded-xl shadow-xl text-white relative overflow-hidden group border-none">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
            <TrendingUp size={80} />
          </div>
          <p className="text-[10px] font-semibold text-fin-text-muted mb-2 uppercase">Total Saldo Awal Gabungan</p>
          <h2 className="text-2xl font-bold tracking-tight" style={{fontVariantNumeric:'tabular-nums'}}>{formatCurrency(totalSaldoAwal)}</h2>
          <div className="mt-6">
             <Badge className="bg-fin-surface/10 text-white rounded-md text-[9px] font-semibold uppercase border border-white/10 px-2 py-0.5">Ready TA {tahun}</Badge>
          </div>
        </Card>

        <Card className="bg-fin-surface p-6 rounded-xl shadow-sm border border-fin-border flex flex-col justify-between group hover:border-[#2E90FA] transition-all duration-300">
          <div>
            <p className="text-[10px] font-semibold text-fin-text-muted mb-2 uppercase">Sumber Dana Terdaftar</p>
            <h2 className="text-3xl font-bold text-fin-text-primary tracking-tight">{sumberDana.length} <span className="text-xs text-fin-text-muted font-semibold uppercase ml-2">Mata Anggaran</span></h2>
          </div>
          <div className="mt-6 flex items-center text-[#12B76A] gap-2">
            <CheckCircle2 size={16} />
            <span className="text-[10px] font-semibold uppercase">Terverifikasi</span>
          </div>
        </Card>

        <Card className="bg-fin-page p-6 rounded-xl shadow-sm border border-fin-border flex flex-col justify-between group hover:border-[#2E90FA] transition-all duration-300">
           <div>
            <p className="text-[10px] font-semibold text-fin-text-muted mb-2 uppercase">Terakhir Sinkronisasi</p>
            <h2 className="text-xl font-bold text-fin-text-primary tracking-tight">{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
          </div>
           <div className="mt-6">
              <Badge variant="outline" className="text-[10px] text-[#2E90FA] font-semibold uppercase flex items-center gap-2 px-3 py-1 border-[#B2DDFF] bg-[#F5F8FF]">
                 <div className="w-1.5 h-1.5 bg-[#2E90FA] rounded-full animate-pulse" />
                 Audit Trail Active
              </Badge>
           </div>
        </Card>
      </div>

      {/* INPUT TABLE */}
      <Card className="rounded-xl shadow-sm border border-fin-border overflow-hidden bg-fin-surface">
        <div className="px-6 py-4 border-b border-fin-border bg-fin-page flex justify-between items-center">
           <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#101828] text-white rounded-lg flex items-center justify-center">
                <Banknote size={20} />
              </div>
              <div>
                 <h3 className="text-sm font-semibold text-fin-text-primary">Rincian Saldo Per Sumber Dana</h3>
                 <p className="text-[10px] font-medium text-fin-text-muted uppercase">Konfigurasi saldo penutupan tahun anggaran {tahun - 1}</p>
              </div>
           </div>
           <Badge variant="outline" className="px-3 py-1 bg-[#FFFAEB] border border-[#FEDF89] rounded-lg text-[10px] font-semibold text-[#B54708] uppercase flex gap-2">
              <AlertCircle size={14} />
              <span>Validasi Saldo Awal</span>
           </Badge>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-fin-page">
              <TableRow className="border-b border-fin-border hover:bg-transparent">
                <TableHead className="px-8 py-4 text-[10px] font-semibold text-fin-text-muted uppercase">Nama Sumber Dana</TableHead>
                <TableHead className="px-8 py-4 text-[10px] font-semibold text-fin-text-muted uppercase w-48 text-center">Kode</TableHead>
                <TableHead className="px-8 py-4 text-[10px] font-semibold text-fin-text-muted uppercase text-right">Saldo Awal (Rp)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-[#E9ECEF]">
              {loading ? (
                <TableRow><TableCell colSpan={3} className="py-40 text-center">
                   <Loader2 className="animate-spin mx-auto text-fin-text-muted mb-4" size={48} />
                   <p className="text-sm font-medium text-fin-text-muted">Sinkronisasi data...</p>
                </TableCell></TableRow>
              ) : sumberDana.map((item) => (
                <TableRow key={item.id} className="hover:bg-fin-page transition-colors group">
                  <TableCell className="px-8 py-6">
                    <p className="text-sm font-bold text-fin-text-primary group-hover:text-[#2E90FA] transition-colors">{item.nama}</p>
                    <p className="text-[10px] text-fin-text-muted font-medium mt-1">{item.keterangan || 'SUMBER DANA ANGGARAN DAERAH'}</p>
                  </TableCell>
                  <TableCell className="px-8 py-6 text-center">
                    <span className="px-3 py-1 bg-[#F2F4F7] text-fin-text-primary border border-[#D0D5DD] rounded-md text-[10px] font-semibold">
                      {item.id}
                    </span>
                  </TableCell>
                  <TableCell className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <span className="text-fin-text-muted font-semibold text-lg">Rp</span>
                      <NumericInput 
                        className="h-11 w-64 text-right font-bold text-fin-text-primary text-xl bg-fin-page border-fin-border rounded-lg focus:border-[#2E90FA] transition-all"
                        value={item.saldo_awal}
                        onValueChange={(val) => handleInputChange(item.id, val)}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="p-8 bg-fin-page border-t border-fin-border flex flex-col lg:flex-row justify-between items-center gap-6">
           <div className="flex items-start gap-4">
              <div className="w-10 h-10 bg-fin-surface rounded-lg flex items-center justify-center text-fin-text-muted shadow-sm border border-fin-border">
                 <History size={20} />
              </div>
              <div>
                 <p className="text-xs font-bold text-fin-text-primary uppercase">Verifikasi Saldo Selesai?</p>
                 <p className="text-[10px] text-fin-text-muted font-medium mt-1 leading-relaxed max-w-lg">
                   Pastikan seluruh angka di atas telah diverifikasi dengan laporan BKU tutup tahun sebelumnya. 
                   Saldo ini akan menjadi dasar perhitungan realisasi kas di sistem.
                 </p>
              </div>
           </div>

           <Button 
             size="lg"
             onClick={handleSave}
             disabled={saving}
             className="h-12 px-10 bg-[#101828] text-white rounded-lg font-semibold shadow-lg shadow-[#101828]/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 text-xs"
           >
             {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
             <span>Simpan Konfigurasi</span>
             <ArrowRight size={16} />
           </Button>
        </div>
      </Card>
    </div>
  );
}
