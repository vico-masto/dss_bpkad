'use client';

import { useState } from 'react';
import { 
  History, 
  Plus, 
  Save, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRightLeft,
  Search,
  FileText,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import { cn, formatCurrency, formatNumber, parseNumber } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumericInput } from '@/components/NumericInput';
import { PageHeader } from '@/components/patterns/page-header';


export default function PenyesuaianPage() {
  const [activeTab, setActiveTab] = useState<'create' | 'history'>('create');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    tanggal: new Date().toISOString().split('T')[0],
    jenis: '',
    nilai: 0,
    keterangan: ''
  });

  // Mock data untuk histori koreksi
  const correctionHistory = [
    { id: 1, tanggal: '2026-04-28', uraian: 'Koreksi Saldo Awal DAU', nilai: 150000000, tipe: 'PENAMBAHAN', user: 'Admin Utama' },
    { id: 2, tanggal: '2026-04-25', uraian: 'Penyesuaian Pajak PPh 21 Terganda', nilai: 4500000, tipe: 'PENGURANGAN', user: 'Kabid Treasury' },
  ];

  return (
    <div className="max-w-[1440px] mx-auto space-y-6 animate-in fade-in duration-700 pb-20">
      
      {/* PAGE HEADER */}
      <PageHeader
        title="Data Penyesuaian Saldo"
        description="Manajemen penyesuaian kas dan koreksi rekonsiliasi"
        icon={<ArrowRightLeft className="size-5" />}
        actions={
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-auto">
            <TabsList className="bg-fin-page rounded-lg p-1 h-10 border border-fin-border">
              <TabsTrigger value="create" className="px-6 py-1.5 rounded-md text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all">Input Koreksi</TabsTrigger>
              <TabsTrigger value="history" className="px-6 py-1.5 rounded-md text-xs font-semibold data-[state=active]:bg-fin-surface data-[state=active]:text-fin-text-primary data-[state=active]:shadow-sm transition-all">Log Histori</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      <AnimatePresence mode="wait">
        {activeTab === 'create' ? (
          <motion.div 
            key="create" 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* LEFT: FORM */}
            <Card className="lg:col-span-8 rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
               <div className="px-6 py-4 border-b border-fin-border bg-fin-page">
                  <h3 className="text-xs font-semibold text-fin-text-primary flex items-center gap-2">
                    <Plus size={16} className="#2E90FA" /> Formulir Penyesuaian Manual
                  </h3>
               </div>
               <CardContent className="p-8 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div className="space-y-2">
                        <Label className="text-xs font-medium text-fin-text-muted ml-1">Tanggal Efektif</Label>
                        <Input type="date" className="h-10 bg-fin-page border-fin-border rounded-lg text-sm font-medium text-fin-text-primary focus:border-[#2E90FA] transition-all" />
                     </div>
                     <div className="space-y-2">
                        <Label className="text-xs font-medium text-fin-text-muted ml-1">Jenis Penyesuaian</Label>
                        <Select>
                          <SelectTrigger className="h-10 bg-fin-page border-fin-border rounded-lg text-xs font-medium text-fin-text-primary">
                            <SelectValue placeholder="Pilih Jenis" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border-fin-border">
                            <SelectItem value="add" className="text-xs font-medium">Penambahan Saldo (+)</SelectItem>
                            <SelectItem value="sub" className="text-xs font-medium">Pengurangan Saldo (-)</SelectItem>
                            <SelectItem value="reclass" className="text-xs font-medium">Reklasifikasi Jurnal</SelectItem>
                          </SelectContent>
                        </Select>
                     </div>
                  </div>

                  <div className="space-y-2">
                     <Label className="text-xs font-medium text-fin-text-muted ml-1">Nilai Penyesuaian (Rp)</Label>
                     <div className="relative">
                        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-fin-text-muted font-semibold text-lg">Rp</div>
                        <NumericInput 
                           placeholder="0" 
                           className="pl-12 h-16 bg-fin-page border-fin-border rounded-lg text-2xl font-bold tracking-tight text-fin-text-primary focus:border-[#2E90FA] transition-all" 
                           value={formData.nilai}
                           onValueChange={(val) => setFormData({...formData, nilai: val})}
                        />
                     </div>
                  </div>

                  <div className="space-y-2">
                     <Label className="text-xs font-medium text-fin-text-muted ml-1">Keterangan / Alasan Koreksi</Label>
                     <Textarea rows={4} placeholder="Jelaskan alasan dilakukannya koreksi ini secara detail..." className="bg-fin-page border-fin-border rounded-lg px-4 py-3 text-sm font-medium text-fin-text-primary focus:border-[#2E90FA] transition-all outline-none resize-none leading-relaxed" />
                  </div>

                  <div className="pt-4 flex justify-end">
                     <Button 
                       size="lg"
                       className="h-12 px-10 bg-[#101828] text-white rounded-lg font-semibold text-sm shadow-lg shadow-[#101828]/20 active:scale-95 gap-2"
                       onClick={() => {
                         setIsSubmitting(true);
                         setTimeout(() => { 
                           setIsSubmitting(false); 
                           toast.success('Koreksi berhasil disimpan.'); 
                         }, 1500);
                       }}
                     >
                       {isSubmitting ? <RefreshCw size={18} className="animate-spin" /> : <Save size={18} />}
                       Simpan Penyesuaian
                     </Button>
                  </div>
               </CardContent>
            </Card>

            {/* RIGHT: GUIDELINES */}
            <div className="lg:col-span-4 space-y-6">
               <Card className="bg-[#FFFAEB] border border-[#FEDF89] p-6 space-y-4 rounded-xl shadow-sm">
                  <div className="flex items-center gap-2 text-[#B54708]">
                     <AlertCircle size={18} />
                     <h4 className="text-sm font-semibold">Panduan Penting</h4>
                  </div>
                  <ul className="space-y-3">
                     <li className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#F79009] mt-1.5 shrink-0"></div>
                        <p className="text-xs font-medium text-[#B54708] leading-relaxed">Koreksi akan langsung mempengaruhi <strong>Buku Kas Umum</strong> dan <strong>Saldo Kas Efektif</strong>.</p>
                     </li>
                     <li className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#F79009] mt-1.5 shrink-0"></div>
                        <p className="text-xs font-medium text-[#B54708] leading-relaxed">Setiap tindakan koreksi akan dicatat dalam <strong>Log Aktivitas</strong> dan bersifat permanen (Immutable Audit Trail).</p>
                     </li>
                  </ul>
               </Card>

               <Card className="bg-[#101828] text-white rounded-xl p-6 space-y-4 shadow-sm">
                  <div className="flex items-center gap-2">
                     <ShieldCheck size={18} className="text-[#2E90FA]" />
                     <h4 className="text-xs font-semibold">Validasi Berjenjang</h4>
                  </div>
                  <p className="text-xs text-fin-text-muted leading-relaxed">
                    Gunakan fitur ini hanya jika terdapat kesalahan pencatatan manual yang tidak dapat diperbaiki melalui pembatalan transaksi SP2D atau Penerimaan.
                  </p>
               </Card>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="history" 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
             <Card className="rounded-xl border border-fin-border shadow-sm overflow-hidden bg-fin-surface">
                <div className="overflow-x-auto">
                   <Table>
                      <TableHeader className="bg-fin-page">
                         <TableRow className="border-b border-fin-border">
                            <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted">Tanggal</TableHead>
                            <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted">Uraian Koreksi</TableHead>
                            <TableHead className="px-6 py-4 text-right text-xs font-semibold text-fin-text-muted">Nilai (Rp)</TableHead>
                            <TableHead className="px-6 py-4 text-center text-xs font-semibold text-fin-text-muted">Tipe</TableHead>
                            <TableHead className="px-6 py-4 text-xs font-semibold text-fin-text-muted">Pelaku</TableHead>
                         </TableRow>
                      </TableHeader>
                      <TableBody className="divide-y divide-[#E9ECEF]">
                         {correctionHistory.map((item) => (
                            <TableRow key={item.id} className="hover:bg-fin-page transition-colors">
                               <TableCell className="px-6 py-4 text-xs font-medium text-fin-text-muted">{format(new Date(item.tanggal), 'dd MMM yyyy')}</TableCell>
                               <TableCell className="px-6 py-4">
                                  <p className="text-xs font-semibold text-fin-text-primary">{item.uraian}</p>
                               </TableCell>
                               <TableCell className={cn("px-6 py-4 text-right font-bold text-sm", item.tipe === 'PENAMBAHAN' ? "text-[#027A48]" : "text-[#B42318]")} style={{fontVariantNumeric:'tabular-nums'}}>
                                  {item.tipe === 'PENAMBAHAN' ? '+' : '-'}{formatCurrency(item.nilai)}
                               </TableCell>
                               <TableCell className="px-6 py-4 text-center">
                                  <Badge className={cn("px-2.5 py-1 rounded-md text-[9px] font-bold border-none", item.tipe === 'PENAMBAHAN' ? "bg-[#ECFDF3] text-[#027A48]" : "bg-[#FEF3F2] text-[#B42318]")}>
                                     {item.tipe === 'PENAMBAHAN' ? 'Penambahan' : 'Pengurangan'}
                                  </Badge>
                               </TableCell>
                               <TableCell className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                     <div className="w-8 h-8 bg-[#F2F4F7] rounded-full flex items-center justify-center text-[10px] font-bold text-fin-text-muted">AD</div>
                                     <span className="text-xs font-medium text-fin-text-primary">{item.user}</span>
                                  </div>
                               </TableCell>
                            </TableRow>
                         ))}
                      </TableBody>
                   </Table>
                </div>
             </Card>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
