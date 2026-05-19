"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  ArrowLeft, Printer, Calendar, User, RefreshCw, Building, ShieldCheck, AlertTriangle, Download, Scale
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, startOfMonth, parseISO } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import { cn } from "@/lib/utils";
import useSWR from 'swr';
import api from '@/lib/api';
import { toast } from 'sonner';

// Expert Currency Formatter
const formatCurrency = (val: any) => {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num).replace('Rp', 'Rp ');
};

export default function BARekonPage() {
  const router = useRouter();
  const docRef = useRef<HTMLDivElement>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  const [appConfig, setAppConfig] = useState({
    pemerintah: 'PEMERINTAH KABUPATEN KEPULAUAN ARU',
    instansi: 'BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH',
    alamat: 'Jl. Pemda - Email : bpkad.kepulauanarukab@gmail.com',
    logo: ''
  });

  useEffect(() => {
    setIsMounted(true);
    const saved = localStorage.getItem('app_config');
    if (saved) setAppConfig(JSON.parse(saved));
  }, []);

  const [baData, setBaData] = useState({
    nomorBA: '001/BA-REKON/BPKAD/2026',
    tanggalBA: format(new Date(), 'yyyy-MM-dd'),
    startDate: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    lokasi: 'Dobo',
    pihak1: { nama: 'RENDY RETANUBUN, SE', nip: '198506082010011024', jabatan: 'Kuasa Bendahara Umum Daerah (KBUD)' },
    pihak2: { nama: 'G. N. HEHAMAHUA', jabatan: 'Pimpinan pada PT. Bank Maluku-Maluku Utara Cabang Dobo' },
    mengetahui: { nama: 'RUDI THESMAN, SE', nip: '198403232008041002', jabatan: 'Plt. Kepala Badan' },
    dasarHukum: 'Peraturan Pemerintah Nomor 12 Tahun 2019 tentang Pengelolaan Keuangan Daerah'
  });

  const { data: startBalance, mutate: mutateStart } = useSWR(
    baData.startDate ? [`/reports/reconciliation/balance-comparison`, baData.startDate] : null,
    ([url, d]) => api.get(url, { params: { date: d } }).then(res => res.data)
  );

  const { data: endBalance, mutate: mutateEnd } = useSWR(
    baData.endDate ? [`/reports/reconciliation/balance-comparison`, baData.endDate] : null,
    ([url, d]) => api.get(url, { params: { date: d } }).then(res => res.data)
  );

  const year = baData.endDate.split('-')[0];
  const { data: discrepancyData, mutate: mutateB } = useSWR(
    [ `/reports/reconciliation/discrepancy-report`, year, baData.startDate, baData.endDate ],
    ([url, y]) => api.get(url, { params: { year: y } }).then(res => res.data)
  );

  const handleSyncData = async () => {
    await mutateStart();
    await mutateEnd();
    await mutateB();
  };

  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      // Prepare formatted dates for server
      const startDateFmt = format(new Date(baData.startDate), 'dd MMMM yyyy', { locale: id });
      const endDateFmt = format(new Date(baData.endDate), 'dd MMMM yyyy', { locale: id });
      const tanggalBAFmt = {
        hari: format(new Date(baData.tanggalBA), 'eeee', { locale: id }),
        tgl: format(new Date(baData.tanggalBA), 'dd', { locale: id }),
        bulan: format(new Date(baData.tanggalBA), 'MMMM', { locale: id }),
        tahun: format(new Date(baData.tanggalBA), 'yyyy', { locale: id }),
        full: format(new Date(baData.tanggalBA), 'dd MMMM yyyy', { locale: id })
      };

      const response = await fetch('/api/cetak-rekon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baData,
          systemA,
          systemB,
          totalSystemB,
          appConfig,
          startDateFmt,
          endDateFmt,
          tanggalBAFmt
        })
      });

      if (!response.ok) throw new Error('Failed to generate PDF');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Open in new tab
      const newTab = window.open(url, '_blank');
      if (!newTab) {
        // Fallback: download if popup blocked
        const a = document.createElement('a');
        a.href = url;
        a.download = `BA_REKON_${baData.nomorBA.replace(/\//g, '_')}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      
      toast.success('PDF Berita Acara berhasil digenerate');
    } catch (error) {
      console.error("PDF Export failed:", error);
      toast.error('Gagal membuat PDF. Pastikan server puppeteer berjalan.');
    } finally {
      setIsExporting(false);
    }
  };

  const systemA = {
    saldoAwal: startBalance?.saldoBKU || 0,
    penerimaan: endBalance?.comparison?.bku?.penerimaan || 0,
    pengeluaran: endBalance?.comparison?.bku?.pengeluaran || 0,
    saldoBKU: endBalance?.saldoBKU || 0,
    saldoBank: endBalance?.saldoBank || 0,
    selisih: 0
  };
  systemA.selisih = systemA.saldoBKU - systemA.saldoBank;

  const systemB = React.useMemo(() => {
    const raw = discrepancyData?.unmatchedDetails || [];
    const mapped = raw.filter((item: any) => {
      if (!item.tanggal) return true;
      try {
        const itemDate = new Date(item.tanggal);
        const end = new Date(baData.endDate);
        itemDate.setHours(0,0,0,0);
        end.setHours(0,0,0,0);
        return itemDate <= end;
      } catch (e) {
        return true;
      }
    }).map((item: any) => {
      let sign = 1;
      if (item.tipe === 'BANK_MASUK') sign = -1;
      else if (item.tipe === 'BANK_KELUAR') sign = 1;
      else if (item.d_k === 'MASUK') sign = 1;
      else if (item.d_k === 'KELUAR') sign = -1;
      
      return { ...item, signedValue: (parseFloat(item.nilai) || 0) * sign };
    });
    return mapped;
  }, [discrepancyData, baData.endDate]);

  const totalSystemB = systemB.reduce((acc: number, curr: any) => acc + curr.signedValue, 0);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-6 gap-6 font-sans">
      {/* ACTION HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/dashboard/rekon')} className="w-10 h-10 rounded-xl p-0 hover:bg-slate-100"><ArrowLeft size={20} /></Button>
          <div className="flex flex-col">
            <h1 className="text-xl font-black text-[#101828]">Laporan Berita Acara</h1>
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest italic">Professional Audit Report</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSyncData} variant="outline" className="h-11 px-6 rounded-xl border-indigo-100 text-indigo-700 text-xs font-black gap-2 hover:bg-indigo-50 transition-all active:scale-95">
            <RefreshCw size={16} /> Sinkron Data
          </Button>
          <Button onClick={handleDownloadPDF} disabled={isExporting} className="h-11 px-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black gap-2 shadow-xl shadow-indigo-100 transition-all active:scale-95">
            {isExporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            {isExporting ? 'Memproses PDF...' : 'Download PDF Murni'}
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="h-11 px-6 border-slate-200 text-slate-600 rounded-xl text-xs font-black gap-2 hover:bg-slate-50 transition-all active:scale-95">
            <Printer size={16} /> Cetak Langsung
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start mb-20">
        {/* RESTORED CONFIGURATION SIDEBAR */}
        <div className="xl:col-span-4 space-y-6 print:hidden">
          <Card className="p-6 rounded-[32px] border-none shadow-2xl bg-white space-y-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-50/50 rounded-full -mr-20 -mt-20 z-0" />
            
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 relative z-10">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Calendar size={20} /></div>
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">Setting Dokumen</h3>
            </div>

            <div className="space-y-4 relative z-10">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomor Berita Acara</Label>
                <Input value={baData.nomorBA} onChange={(e) => setBaData({...baData, nomorBA: e.target.value})} className="h-11 rounded-xl border-slate-100 bg-slate-50/50 focus:bg-white font-black text-sm" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dasar Hukum</Label>
                <textarea value={baData.dasarHukum} onChange={(e) => setBaData({...baData, dasarHukum: e.target.value})} className="w-full h-20 p-3 bg-slate-50/50 border border-slate-100 rounded-xl text-xs font-bold focus:bg-white transition-all outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dari</Label><Input type="date" value={baData.startDate} onChange={(e) => setBaData({...baData, startDate: e.target.value})} className="h-11 rounded-xl border-slate-100 bg-slate-50/50 font-bold text-xs" /></div>
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sampai</Label><Input type="date" value={baData.endDate} onChange={(e) => setBaData({...baData, endDate: e.target.value})} className="h-11 rounded-xl border-slate-100 bg-slate-50/50 font-bold text-xs" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tgl TTD</Label><Input type="date" value={baData.tanggalBA} onChange={(e) => setBaData({...baData, tanggalBA: e.target.value})} className="h-11 rounded-xl border-slate-100 bg-slate-50/50 font-bold text-xs" /></div>
                <div className="space-y-2"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lokasi</Label><Input value={baData.lokasi} onChange={(e) => setBaData({...baData, lokasi: e.target.value})} className="h-11 rounded-xl border-slate-100 bg-slate-50/50 font-bold text-xs" /></div>
              </div>
            </div>

            <div className="space-y-4 pt-4 border-t border-slate-100">
               <div className="flex items-center gap-2 text-slate-800 mb-2"><User size={16} className="text-indigo-600" /><span className="text-[10px] font-black uppercase tracking-widest">Pejabat TTD</span></div>
               <div className="space-y-4">
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-2">
                    <Label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Pihak I (Kuasa BUD)</Label>
                    <Input value={baData.pihak1.nama} onChange={(e) => setBaData({...baData, pihak1: {...baData.pihak1, nama: e.target.value.toUpperCase()}})} className="h-8 bg-white border-none shadow-sm rounded-lg text-[10px] font-black mb-1" />
                    <Input value={baData.pihak1.nip} onChange={(e) => setBaData({...baData, pihak1: {...baData.pihak1, nip: e.target.value}})} className="h-8 bg-white border-none shadow-sm rounded-lg text-[9px] font-bold text-slate-500" />
                  </div>
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-2">
                    <Label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Pihak II (Bank)</Label>
                    <Input value={baData.pihak2.nama} onChange={(e) => setBaData({...baData, pihak2: {...baData.pihak2, nama: e.target.value.toUpperCase()}})} className="h-8 bg-white border-none shadow-sm rounded-lg text-[10px] font-black mb-1" />
                    <textarea value={baData.pihak2.jabatan} onChange={(e) => setBaData({...baData, pihak2: {...baData.pihak2, jabatan: e.target.value}})} className="w-full h-12 p-2 bg-white border-none shadow-sm rounded-lg text-[9px] font-bold text-slate-500 resize-none" />
                  </div>
                  <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 space-y-2">
                    <Label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Mengetahui</Label>
                    <Input value={baData.mengetahui.nama} onChange={(e) => setBaData({...baData, mengetahui: {...baData.mengetahui, nama: e.target.value.toUpperCase()}})} className="h-8 bg-white border-none shadow-sm rounded-lg text-[10px] font-black mb-1" />
                    <Input value={baData.mengetahui.nip} onChange={(e) => setBaData({...baData, mengetahui: {...baData.mengetahui, nip: e.target.value}})} className="h-8 bg-white border-none shadow-sm rounded-lg text-[9px] font-bold text-slate-500 mb-1" />
                    <Input value={baData.mengetahui.jabatan} onChange={(e) => setBaData({...baData, mengetahui: {...baData.mengetahui, jabatan: e.target.value}})} className="h-8 bg-white border-none shadow-sm rounded-lg text-[9px] font-bold text-slate-400 italic" />
                  </div>
               </div>
            </div>
          </Card>
        </div>

        {/* DOCUMENT PREVIEW */}
        <div className="xl:col-span-8 flex justify-center bg-slate-400/20 p-8 rounded-[40px] overflow-hidden min-h-screen print:bg-white print:p-0 print:block">
           <div ref={docRef} id="ba-document" className="doc-page w-[210mm] min-h-[330mm] bg-white flex flex-col relative" style={{ fontFamily: '"Times New Roman", Times, serif', color: '#000000' }}>
              
              <div className="hidden print:block absolute bottom-10 right-[2cm] text-[9pt] italic" style={{ fontFamily: 'sans-serif', color: '#999999' }}>
                 Halaman <span className="page-num"></span>
              </div>

              <div className="flex-1 px-[3cm] py-[2cm] pr-[2cm] flex flex-col pb-[3cm]">
                {/* KOP */}
                <div className="flex items-center gap-8 mb-6 pb-4 relative" style={{ borderBottom: '3.5px solid #000000' }}>
                  <div className="w-20 h-20 shrink-0 flex items-center justify-center">
                    {appConfig.logo ? <img src={appConfig.logo} style={{ maxHeight: '100%' }} /> : <Building size={40} color="#cccccc" />}
                  </div>
                  <div className="flex-1 text-center pr-20">
                    <h1 className="text-[14pt] font-bold uppercase leading-tight">{appConfig.pemerintah}</h1>
                    <h2 className="text-[16pt] font-bold uppercase leading-tight mt-1">{appConfig.instansi}</h2>
                    <p className="text-[10pt] italic mt-2" style={{ fontFamily: 'sans-serif' }}>{appConfig.alamat}</p>
                  </div>
                </div>

                <div className="text-center mb-6">
                  <h3 className="text-[14pt] font-bold uppercase">Berita Acara Rekonsiliasi Kas</h3>
                  <p className="text-[12pt] font-medium mt-1">Nomor: {baData.nomorBA}</p>
                </div>

                <div className="text-[12pt] leading-[1.6] mb-8 text-justify">
                  <p>
                    Berdasarkan {baData.dasarHukum}, pada hari ini, <span className="font-bold italic">{format(new Date(baData.tanggalBA), 'eeee', { locale: id })}</span>, 
                    tanggal <span className="font-bold italic">{format(new Date(baData.tanggalBA), 'dd', { locale: id })}</span> bulan <span className="font-bold italic">{format(new Date(baData.tanggalBA), 'MMMM', { locale: id })}</span> tahun <span className="font-bold italic">{format(new Date(baData.tanggalBA), 'yyyy', { locale: id })}</span>, bertempat di {baData.lokasi}, kami yang bertanda tangan di bawah ini:
                  </p>
                  <div className="mt-4 ml-8 space-y-4">
                    <div className="flex gap-4">
                      <span className="w-4">1.</span>
                      <div className="flex flex-col">
                        <span>Nama : <span className="font-bold uppercase">{baData.pihak1.nama}</span></span>
                        <span>NIP : {baData.pihak1.nip}</span>
                        <span>Jabatan : <span className="italic">{baData.pihak1.jabatan}</span></span>
                      </div>
                    </div>
                    <div className="flex gap-4">
                      <span className="w-4">2.</span>
                      <div className="flex flex-col">
                        <span>Nama : <span className="font-bold uppercase">{baData.pihak2.nama}</span></span>
                        <span>Jabatan : <span className="italic">{baData.pihak2.jabatan}</span></span>
                      </div>
                    </div>
                  </div>
                  <p className="mt-6">Telah melakukan rekonsiliasi kas pada Rekening Kas Umum Daerah (RKUD) Nomor Rekening <span className="font-bold">080 103 6465</span> untuk periode <span className="font-bold italic underline">{format(new Date(baData.startDate), 'dd MMMM yyyy', { locale: id })} s/d {format(new Date(baData.endDate), 'dd MMMM yyyy', { locale: id })}</span>, dengan hasil sebagai berikut:</p>
                </div>

                {/* POIN A */}
                <div className="section-block mb-10" style={{ pageBreakInside: 'avoid' }}>
                  <h4 className="text-[12pt] font-bold mb-3 uppercase">A. SALDO MENURUT BUKU KAS UMUM KBUD DAN REKENING KORAN BANK</h4>
                  <table className="w-full border-collapse text-[11pt]" style={{ border: '1px solid #000000' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC' }}>
                        <th style={{ border: '1px solid #000000', padding: '8px', width: '40px' }}>No.</th>
                        <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'left' }}>Uraian Transaksi</th>
                        <th style={{ border: '1px solid #000000', padding: '8px', width: '190px', textAlign: 'right' }}>Jumlah (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[{n:1, u: `Saldo Awal BKU BUD per ${format(new Date(baData.startDate), 'dd MMMM yyyy', { locale: id })}`, v: systemA.saldoAwal}, {n:2, u: `Total Penerimaan Kas s.d. Tanggal ${format(new Date(baData.endDate), 'dd/MM/yyyy')}`, v: systemA.penerimaan}, {n:3, u: `Total Pengeluaran Kas s.d. Tanggal ${format(new Date(baData.endDate), 'dd/MM/yyyy')}`, v: systemA.pengeluaran, minus: true}, {n:4, u: `SALDO AKHIR BKU RKUD PER TANGGAL ${format(new Date(baData.endDate), 'dd/MM/yyyy')}`, v: systemA.saldoBKU, bold: true}, {n:5, u: `SALDO REKENING KORAN BANK PER TANGGAL ${format(new Date(baData.endDate), 'dd/MM/yyyy')}`, v: systemA.saldoBank, bold: true}].map((row, i) => (
                        <tr key={i} style={{ fontWeight: row.bold ? 'bold' : 'normal', backgroundColor: row.bold ? '#F8FAFC' : 'transparent' }}>
                          <td style={{ border: '1px solid #000000', padding: '8px', textAlign: 'center' }}>{row.n}</td>
                          <td style={{ border: '1px solid #000000', padding: '8px' }}>{row.u}</td>
                          <td style={{ border: '1px solid #000000', padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>{row.minus ? '(' : ''}{formatCurrency(row.v).replace('Rp ', '')}{row.minus ? ')' : ''}</td>
                        </tr>
                      ))}
                      <tr style={{ fontWeight: 'bold' }}>
                        <td style={{ border: '1px solid #000000', padding: '10px', textAlign: 'center' }}>6</td>
                        <td style={{ border: '1px solid #000000', padding: '10px' }}>SELISIH KAS (NO. 4 - NO. 5)</td>
                        <td style={{ border: '1px solid #000000', padding: '10px', textAlign: 'right', fontFamily: 'monospace' }}>{systemA.selisih < 0.01 ? 'NIL' : formatCurrency(systemA.selisih).replace('Rp ', '')}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* POIN B */}
                <div className="section-block mb-10 break-before-page" style={{ pageBreakBefore: 'always', marginTop: '3cm' }}>
                  <h4 className="text-[12pt] font-bold mb-3 uppercase">B. RINCIAN SELISIH (OUTSTANDING ITEMS)</h4>
                  <p className="text-[11pt] italic mb-4 text-justify">
                    {systemA.selisih < 0.01 
                      ? "Berdasarkan hasil audit, tidak terdapat selisih antara pembukuan Buku Kas Umum dengan Rekening Koran Bank (Kas Terverifikasi Sinkron) dengan rincian sebagai berikut:"
                      : "Selisih terjadi dikarenakan adanya transaksi yang belum tercatat oleh bank atau pembukuan dengan rincian sebagai berikut:"}
                  </p>
                  <table className="w-full border-collapse text-[10pt]" style={{ border: '1px solid #000000' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#F8FAFC' }}>
                        <th style={{ border: '1px solid #000000', padding: '8px', width: '40px' }}>No.</th>
                        <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'left' }}>Ref / Tipe</th>
                        <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'left' }}>Uraian Transaksi</th>
                        <th style={{ border: '1px solid #000000', padding: '8px', textAlign: 'right', width: '160px' }}>Nilai (Rp)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {systemB.length > 0 ? systemB.slice(0, 100).map((o: any, idx: number) => (
                        <tr key={idx}>
                          <td style={{ border: '1px solid #000000', padding: '8px', textAlign: 'center' }}>{idx + 1}</td>
                          <td style={{ border: '1px solid #000000', padding: '8px' }}>{o.bukti}<br/><span style={{ fontSize: '8pt', color: '#666666' }}>{o.tipe}</span></td>
                          <td style={{ border: '1px solid #000000', padding: '8px' }}><b>{o.opd}</b><br/><span style={{ fontSize: '8pt', fontStyle: 'italic' }}>{o.uraian}</span></td>
                          <td style={{ border: '1px solid #000000', padding: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
                            {o.signedValue > 0 ? '+' : ''}{formatCurrency(o.signedValue).replace('Rp ', '')}
                          </td>
                        </tr>
                      )) : <tr><td colSpan={4} style={{ padding: '24px', textAlign: 'center', color: '#999999', fontStyle: 'italic' }}>Kas Terverifikasi Sinkron.</td></tr>}
                      {systemB.length > 0 && (
                        <tr style={{ fontWeight: 'bold', backgroundColor: '#F8FAFC' }}>
                          <td colSpan={3} style={{ border: '1px solid #000000', padding: '10px', textAlign: 'right', textTransform: 'uppercase' }}>Total Rincian Selisih (Poin B)</td>
                          <td style={{ border: '1px solid #000000', padding: '10px', textAlign: 'right', fontFamily: 'monospace' }}>{formatCurrency(totalSystemB).replace('Rp ', '')}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  {Math.abs(totalSystemB - systemA.selisih) > 1 && (
                    <p className="text-[9pt] italic text-rose-600 mt-2 print:hidden font-sans">
                      * Peringatan: Terdapat selisih antara Poin A ({formatCurrency(systemA.selisih)}) dan Poin B ({formatCurrency(totalSystemB)}). Silakan periksa kembali data rekon.
                    </p>
                  )}
                </div>

                {/* KESIMPULAN */}
                <div className="section-block mb-12 text-justify text-[12pt] leading-[1.6]" style={{ pageBreakInside: 'avoid' }}>
                  <h4 className="font-bold mb-2 uppercase">C. KESIMPULAN</h4>
                  <p>
                    Berdasarkan hasil proses rekonsiliasi tersebut di atas, saldo Kas Rekening Kas Umum Daerah (RKUD) Kepulauan Aru per tanggal {format(new Date(baData.endDate), 'dd MMMM yyyy', { locale: id })} dinyatakan <span className="font-bold italic underline uppercase">{systemA.selisih < 0.01 ? 'SESUAI' : 'TIDAK SESUAI'}</span> antara Buku Kas Umum KBUD dengan Rekening Koran PT. Bank Maluku-Maluku Utara Cabang Dobo.
                  </p>
                  <p className="mt-4">Demikian Berita Acara Rekonsiliasi Kas ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.</p>
                </div>

                {/* SIGNATURES */}
                <div className="signatures-block" style={{ pageBreakInside: 'avoid', marginTop: '1.5rem' }}>
                   <div className="text-right mb-16 text-[12pt] font-bold">{baData.lokasi}, {format(new Date(baData.tanggalBA), 'dd MMMM yyyy', { locale: id })}</div>
                   <div style={{ display: 'flex', width: '100%', textAlign: 'center' }}>
                      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <p style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '120px' }}>Pihak I<br/>{baData.pihak1.jabatan}</p>
                        <p style={{ fontWeight: 'bold', textTransform: 'uppercase', textDecoration: 'underline' }}>{baData.pihak1.nama}</p>
                        <p style={{ fontSize: '11pt' }}>NIP. {baData.pihak1.nip}</p>
                      </div>
                      <div style={{ width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <p style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '120px' }}>Pihak II<br/>Bank Maluku-Maluku Utara</p>
                        <p style={{ fontWeight: 'bold', textTransform: 'uppercase', textDecoration: 'underline' }}>{baData.pihak2.nama}</p>
                        <p style={{ fontSize: '11pt', textTransform: 'uppercase' }}>{baData.pihak2.jabatan}</p>
                      </div>
                   </div>
                   <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: '60px' }}>
                      <p style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '120px' }}>Mengetahui,<br/>{baData.mengetahui.jabatan}</p>
                      <p style={{ fontWeight: 'bold', textTransform: 'uppercase', textDecoration: 'underline' }}>{baData.mengetahui.nama}</p>
                      <p style={{ fontSize: '11pt' }}>NIP. {baData.mengetahui.nip}</p>
                   </div>
                </div>
              </div>

              <div className="hidden print:flex px-[3cm] pb-6 justify-between items-end text-[#999999] text-[7pt] italic absolute bottom-0 w-full left-0" style={{ fontFamily: 'sans-serif' }}>
                 <div>AUDITED BY DSS BPKAD | OFFICIAL RECORD</div>
                 <div>Timestamp: {isMounted ? format(new Date(), 'dd/MM/yyyy HH:mm:ss') : ''}</div>
              </div>
           </div>
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: 210mm 330mm; margin: 0; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; counter-reset: page; }
          .print\\:hidden { display: none !important; }
          .page-num::after { counter-increment: page; content: counter(page); }
          .doc-page { width: 210mm !important; min-height: 330mm !important; height: auto !important; padding-bottom: 2cm; }
        }
      `}</style>
    </div>
  );
}
