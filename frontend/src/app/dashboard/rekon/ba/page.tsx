"use client";

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Printer, Calendar, User, RefreshCw, Building, Download
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format, startOfMonth } from 'date-fns';
import { id } from 'date-fns/locale';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import api from '@/lib/api';
import { toast } from 'sonner';

const fmt = (val: any) => {
  const num = parseFloat(val) || 0;
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

const fmtCurrency = (val: any) => `Rp ${fmt(val)}`;

export default function BARekonPage() {
  const router = useRouter();
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
    nomorRekening: '080 103 6465',
    namaBank: 'PT. Bank Maluku-Maluku Utara Cabang Dobo',
    pihak1: { nama: 'RENDY RETANUBUN, SE', nip: '198506082010011024', jabatan: 'Kuasa Bendahara Umum Daerah (KBUD)' },
    pihak2: { nama: 'G. N. HEHAMAHUA', jabatan: 'Pimpinan pada PT. Bank Maluku-Maluku Utara Cabang Dobo' },
    mengetahui: { nama: 'RUDI THESMAN, SE', nip: '198403232008041002', jabatan: 'Plt. Kepala Badan' },
    dasarHukum: 'Peraturan Pemerintah Nomor 12 Tahun 2019 tentang Pengelolaan Keuangan Daerah'
  });

  const { data: startBalance, mutate: mutateStart } = useSWR(
    baData.startDate ? [`/reports/reconciliation/balance-comparison`, baData.startDate] : null,
    ([url, d]) => api.get(url, { params: { date: d } }).then(r => r.data)
  );
  const { data: endBalance, mutate: mutateEnd } = useSWR(
    baData.endDate ? [`/reports/reconciliation/balance-comparison`, baData.endDate] : null,
    ([url, d]) => api.get(url, { params: { date: d } }).then(r => r.data)
  );
  const year = baData.endDate.split('-')[0];
  const { data: discrepancyData, mutate: mutateB } = useSWR(
    [`/reports/reconciliation/discrepancy-report`, year],
    ([url, y]) => api.get(url, { params: { year: y } }).then(r => r.data)
  );

  const handleSyncData = async () => {
    await Promise.all([mutateStart(), mutateEnd(), mutateB()]);
    toast.success('Data berhasil disinkronkan');
  };

  // ─── System A: SAP Compliant — BKU Side + Bank Side ───────────────────────
  const systemA = {
    // BKU side breakdown (Permendagri 77/2020)
    bkuSilpa:       Number(endBalance?.comparison?.bku?.saldo_awal_silpa || 0),
    bkuPendapatan:  Number(endBalance?.comparison?.bku?.pendapatan_berjalan || 0),
    bkuSp2dNeto:    Number(endBalance?.comparison?.bku?.sp2d_neto || 0),
    bkuPotongan:    Number(endBalance?.comparison?.bku?.rincian_potongan || 0),
    bkuSetoran:     Number(endBalance?.comparison?.bku?.setoran_pajak_standalone || 0),
    saldoBKU:       Number(endBalance?.saldoBKU || 0),
    // Bank side breakdown
    saldoBankAwal:  Number(startBalance?.saldoBank || 0),
    bankKredit:     Number(endBalance?.comparison?.bank?.penerimaan || 0),
    bankDebet:      Number(endBalance?.comparison?.bank?.pengeluaran || 0),
    saldoBank:      Number(endBalance?.saldoBank || 0),
    selisih:        0,
  };
  systemA.selisih = systemA.saldoBKU - systemA.saldoBank;

  // ─── System B: Outstanding Items ──────────────────────────────────────────
  const systemB: any[] = React.useMemo(() => {
    const raw: any[] = discrepancyData?.unmatchedDetails || [];
    return raw.filter((item: any) => {
      if (!item.tanggal) return true;
      try {
        const d = new Date(item.tanggal); d.setHours(0,0,0,0);
        const e = new Date(baData.endDate); e.setHours(0,0,0,0);
        return d <= e;
      } catch { return true; }
    }).map((item: any) => {
      let sign = 1;
      if (item.tipe === 'BANK_MASUK') sign = -1;
      else if (item.tipe === 'BANK_KELUAR') sign = 1;
      else if (item.d_k === 'MASUK') sign = 1;
      else if (item.d_k === 'KELUAR') sign = -1;
      // Kelompok SAP: I = BKU belum di Bank, II = Bank belum di BKU, III = Selisih Nilai
      let kelompok = 'I';
      if (item.tipe === 'BANK_MASUK' || item.tipe === 'BANK_KELUAR') kelompok = 'II';
      else if (item.tipe === 'SELISIH_POTONGAN' || item.tipe === 'SELISIH_PAJAK') kelompok = 'III';
      return { ...item, signedValue: (parseFloat(item.nilai) || 0) * sign, kelompok };
    });
  }, [discrepancyData, baData.endDate]);

  const totalSystemB = systemB.reduce((a: number, c: any) => a + c.signedValue, 0);
  const groupI   = systemB.filter((i: any) => i.kelompok === 'I');
  const groupII  = systemB.filter((i: any) => i.kelompok === 'II');
  const groupIII = systemB.filter((i: any) => i.kelompok === 'III');
  const totalI   = groupI.reduce((a: number, c: any) => a + c.signedValue, 0);
  const totalII  = groupII.reduce((a: number, c: any) => a + c.signedValue, 0);
  const totalIII = groupIII.reduce((a: number, c: any) => a + c.signedValue, 0);

  const handleDownloadPDF = async () => {
    setIsExporting(true);
    try {
      const startDateFmt = format(new Date(baData.startDate), 'dd MMMM yyyy', { locale: id });
      const endDateFmt   = format(new Date(baData.endDate), 'dd MMMM yyyy', { locale: id });
      const tanggalBAFmt = {
        hari:  format(new Date(baData.tanggalBA), 'eeee', { locale: id }),
        tgl:   format(new Date(baData.tanggalBA), 'dd', { locale: id }),
        bulan: format(new Date(baData.tanggalBA), 'MMMM', { locale: id }),
        tahun: format(new Date(baData.tanggalBA), 'yyyy', { locale: id }),
        full:  format(new Date(baData.tanggalBA), 'dd MMMM yyyy', { locale: id }),
      };
      const res = await fetch('/api/cetak-rekon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baData, systemA, systemB, totalSystemB, totalI, totalII, totalIII, appConfig, startDateFmt, endDateFmt, tanggalBAFmt })
      });
      if (!res.ok) throw new Error('PDF generation failed');
      const blob = await res.blob();
      const url  = window.URL.createObjectURL(blob);
      const tab  = window.open(url, '_blank');
      if (!tab) {
        const a = document.createElement('a');
        a.href = url; a.download = `BA_REKON_${baData.nomorBA.replace(/\//g, '_')}.pdf`;
        document.body.appendChild(a); a.click(); a.remove();
      }
      toast.success('PDF Berita Acara berhasil digenerate');
    } catch (err) {
      console.error(err);
      toast.error('Gagal membuat PDF.');
    } finally { setIsExporting(false); }
  };

  // ─── Shared table styles ──────────────────────────────────────────────────
  const TH: React.CSSProperties = { border: '1px solid #000', padding: '7px 8px', backgroundColor: '#f0f4f8', textAlign: 'center' };
  const TD: React.CSSProperties = { border: '1px solid #000', padding: '7px 8px' };
  const TOTAL_ROW: React.CSSProperties = { fontWeight: 'bold', backgroundColor: '#f0f4f8' };
  const GROUP_HDR: React.CSSProperties = { border: '1px solid #000', padding: '6px 8px', fontWeight: 'bold', backgroundColor: '#e8edf2', fontStyle: 'italic' };

  const endDateLabel = isMounted ? format(new Date(baData.endDate), 'dd/MM/yyyy') : '';
  const startDateLabel = isMounted ? format(new Date(baData.startDate), 'dd/MM/yyyy') : '';
  const startDateLong  = isMounted ? format(new Date(baData.startDate), 'dd MMMM yyyy', { locale: id }) : '';
  const endDateLong    = isMounted ? format(new Date(baData.endDate), 'dd MMMM yyyy', { locale: id }) : '';
  const tanggalBALong  = isMounted ? format(new Date(baData.tanggalBA), 'dd MMMM yyyy', { locale: id }) : '';
  const hariBA         = isMounted ? format(new Date(baData.tanggalBA), 'eeee', { locale: id }) : '';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col p-6 gap-6 font-sans">
      {/* ACTION HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm print:hidden">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/dashboard/rekon')} className="w-10 h-10 rounded-xl p-0 hover:bg-slate-100"><ArrowLeft size={20} /></Button>
          <div>
            <h1 className="text-xl font-black text-[#101828]">Berita Acara Rekonsiliasi Kas</h1>
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest italic">Standar SAP — Permendagri 77/2020</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleSyncData} variant="outline" className="h-11 px-6 rounded-xl border-indigo-100 text-indigo-700 text-xs font-black gap-2 hover:bg-indigo-50">
            <RefreshCw size={16} /> Sinkron Data
          </Button>
          <Button onClick={handleDownloadPDF} disabled={isExporting} className="h-11 px-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black gap-2">
            {isExporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
            {isExporting ? 'Memproses...' : 'Download PDF'}
          </Button>
          <Button onClick={() => window.print()} variant="outline" className="h-11 px-6 border-slate-200 text-slate-600 rounded-xl text-xs font-black gap-2">
            <Printer size={16} /> Cetak
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start mb-20">
        {/* SIDEBAR */}
        <div className="xl:col-span-4 space-y-5 print:hidden">
          <Card className="p-6 rounded-[32px] border-none shadow-2xl bg-white space-y-5">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center"><Calendar size={20} /></div>
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">Setting Dokumen</h3>
            </div>
            <div className="space-y-3">
              <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomor Berita Acara</Label>
                <Input value={baData.nomorBA} onChange={e => setBaData({...baData, nomorBA: e.target.value})} className="h-10 rounded-xl border-slate-100 bg-slate-50 font-black text-sm" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dasar Hukum</Label>
                <textarea value={baData.dasarHukum} onChange={e => setBaData({...baData, dasarHukum: e.target.value})} className="w-full h-16 p-3 bg-slate-50 border border-slate-100 rounded-xl text-xs font-bold outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dari</Label>
                  <Input type="date" value={baData.startDate} onChange={e => setBaData({...baData, startDate: e.target.value})} className="h-10 rounded-xl border-slate-100 bg-slate-50 text-xs" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sampai</Label>
                  <Input type="date" value={baData.endDate} onChange={e => setBaData({...baData, endDate: e.target.value})} className="h-10 rounded-xl border-slate-100 bg-slate-50 text-xs" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tgl TTD</Label>
                  <Input type="date" value={baData.tanggalBA} onChange={e => setBaData({...baData, tanggalBA: e.target.value})} className="h-10 rounded-xl border-slate-100 bg-slate-50 text-xs" /></div>
                <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lokasi</Label>
                  <Input value={baData.lokasi} onChange={e => setBaData({...baData, lokasi: e.target.value})} className="h-10 rounded-xl border-slate-100 bg-slate-50 text-xs" /></div>
              </div>
              <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nomor Rekening RKUD</Label>
                <Input value={baData.nomorRekening} onChange={e => setBaData({...baData, nomorRekening: e.target.value})} className="h-10 rounded-xl border-slate-100 bg-slate-50 font-mono text-sm" /></div>
              <div className="space-y-1"><Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nama Bank</Label>
                <Input value={baData.namaBank} onChange={e => setBaData({...baData, namaBank: e.target.value})} className="h-10 rounded-xl border-slate-100 bg-slate-50 text-xs" /></div>
            </div>
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center gap-2 text-slate-800 mb-1"><User size={16} className="text-indigo-600" /><span className="text-[10px] font-black uppercase tracking-widest">Pejabat Penandatangan</span></div>
              {[
                { label: 'Pihak I — Kuasa BUD', key: 'pihak1', hasNip: true },
                { label: 'Pihak II — Bank', key: 'pihak2', hasNip: false },
                { label: 'Mengetahui', key: 'mengetahui', hasNip: true },
              ].map(({ label, key, hasNip }) => (
                <div key={key} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                  <Label className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">{label}</Label>
                  <Input value={(baData as any)[key].nama} onChange={e => setBaData({...baData, [key]: {...(baData as any)[key], nama: e.target.value.toUpperCase()}})} className="h-8 bg-white border-none shadow-sm rounded-lg text-[10px] font-black" placeholder="Nama" />
                  {hasNip && <Input value={(baData as any)[key].nip} onChange={e => setBaData({...baData, [key]: {...(baData as any)[key], nip: e.target.value}})} className="h-8 bg-white border-none shadow-sm rounded-lg text-[9px] text-slate-500" placeholder="NIP" />}
                  <textarea value={(baData as any)[key].jabatan} onChange={e => setBaData({...baData, [key]: {...(baData as any)[key], jabatan: e.target.value}})} className="w-full h-12 p-2 bg-white border-none shadow-sm rounded-lg text-[9px] text-slate-500 resize-none outline-none" placeholder="Jabatan" />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* DOCUMENT PREVIEW */}
        <div className="xl:col-span-8 flex justify-center bg-slate-400/20 p-8 rounded-[40px] overflow-hidden min-h-screen print:bg-white print:p-0 print:block">
          <div id="ba-document" className="doc-page w-[210mm] min-h-[297mm] bg-white flex flex-col" style={{ fontFamily: '"Times New Roman", Times, serif', color: '#000' }}>
            <div className="flex-1 px-[2.5cm] py-[1.5cm] pr-[2cm] flex flex-col pb-[2cm]">

              {/* KOP SURAT */}
              <div className="flex items-center gap-6 mb-5 pb-3" style={{ borderBottom: '3.5px solid #000' }}>
                <div className="w-16 h-16 shrink-0 flex items-center justify-center">
                  {appConfig.logo ? <img src={appConfig.logo} style={{ maxHeight: '100%' }} alt="logo" /> : <Building size={36} color="#ccc" />}
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[12pt] font-bold uppercase leading-tight">{appConfig.pemerintah}</p>
                  <p className="text-[14pt] font-bold uppercase leading-tight mt-0.5">{appConfig.instansi}</p>
                  <p className="text-[9pt] italic mt-1" style={{ fontFamily: 'sans-serif' }}>{appConfig.alamat}</p>
                </div>
              </div>

              {/* JUDUL */}
              <div className="text-center mb-5">
                <p className="text-[13pt] font-bold uppercase">Berita Acara Rekonsiliasi Kas</p>
                <p className="text-[11pt] mt-0.5">Nomor: {baData.nomorBA}</p>
              </div>

              {/* PARAGRAF PEMBUKA */}
              <div className="text-[11pt] leading-relaxed mb-6 text-justify">
                <p>
                  Berdasarkan {baData.dasarHukum}, pada hari ini,{' '}
                  <span className="font-bold italic">{hariBA}</span>, tanggal{' '}
                  <span className="font-bold italic">{isMounted ? format(new Date(baData.tanggalBA), 'dd', { locale: id }) : ''}</span> bulan{' '}
                  <span className="font-bold italic">{isMounted ? format(new Date(baData.tanggalBA), 'MMMM', { locale: id }) : ''}</span> tahun{' '}
                  <span className="font-bold italic">{isMounted ? format(new Date(baData.tanggalBA), 'yyyy') : ''}</span>, bertempat di {baData.lokasi}, kami yang bertanda tangan di bawah ini:
                </p>
                <div className="mt-3 ml-6 space-y-3 text-[11pt]">
                  {[
                    { no: 1, nama: baData.pihak1.nama, nip: baData.pihak1.nip, jabatan: baData.pihak1.jabatan },
                    { no: 2, nama: baData.pihak2.nama, nip: null, jabatan: baData.pihak2.jabatan },
                  ].map(p => (
                    <div key={p.no} className="flex gap-3">
                      <span className="w-4 shrink-0">{p.no}.</span>
                      <div>
                        <div>Nama    : <span className="font-bold uppercase">{p.nama}</span></div>
                        {p.nip && <div>NIP     : {p.nip}</div>}
                        <div>Jabatan : <span className="italic">{p.jabatan}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-4">
                  Telah melakukan rekonsiliasi kas pada Rekening Kas Umum Daerah (RKUD) Nomor Rekening{' '}
                  <span className="font-bold">{baData.nomorRekening}</span> untuk periode{' '}
                  <span className="font-bold italic underline">{startDateLong} s/d {endDateLong}</span>, dengan hasil sebagai berikut:
                </p>
              </div>

              {/* ═══════════════════════════════════════════════════════════
                  SECTION A — SAP Compliant: BKU + Bank Side (Permendagri 77/2020)
              ════════════════════════════════════════════════════════════ */}
              <div className="mb-8" style={{ pageBreakInside: 'avoid' }}>
                <p className="text-[11pt] font-bold uppercase mb-2">A. Posisi Kas — Rekonsiliasi Saldo BKU dan Rekening Koran</p>
                <table className="w-full border-collapse text-[10.5pt]">
                  <thead>
                    <tr>
                      <th style={{ ...TH, width: 32 }}>No.</th>
                      <th style={{ ...TH, textAlign: 'left' }}>Uraian</th>
                      <th style={{ ...TH, width: 190, textAlign: 'right' }}>Jumlah (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* ── BKU SIDE ── */}
                    <tr><td colSpan={3} style={GROUP_HDR}>I. Saldo Menurut Buku Kas Umum (KBUD)</td></tr>
                    <tr><td style={{ ...TD, textAlign: 'center' }}>1</td><td style={TD}>Saldo Awal / SILPA per {startDateLabel}</td><td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(systemA.bkuSilpa)}</td></tr>
                    <tr><td style={{ ...TD, textAlign: 'center' }}>2</td><td style={TD}>( + ) Pendapatan s.d. {endDateLabel}</td><td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(systemA.bkuPendapatan)}</td></tr>
                    <tr><td style={{ ...TD, textAlign: 'center' }}>3</td><td style={TD}>( − ) Pengeluaran SP2D Neto s.d. {endDateLabel}</td><td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>({fmt(systemA.bkuSp2dNeto)})</td></tr>
                    <tr><td style={{ ...TD, textAlign: 'center' }}>4</td><td style={TD}>( − ) Potongan Pajak & Iuran s.d. {endDateLabel}</td><td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>({fmt(systemA.bkuPotongan)})</td></tr>
                    {systemA.bkuSetoran > 0 && (
                      <tr><td style={{ ...TD, textAlign: 'center' }}>4a</td><td style={TD}>( − ) Setoran Pajak Mandiri s.d. {endDateLabel}</td><td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>({fmt(systemA.bkuSetoran)})</td></tr>
                    )}
                    <tr style={TOTAL_ROW}>
                      <td style={{ ...TD, textAlign: 'center' }}></td>
                      <td style={TD}>= SALDO AKHIR BKU KBUD PER {endDateLabel}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(systemA.saldoBKU)}</td>
                    </tr>

                    {/* ── BANK SIDE ── */}
                    <tr><td colSpan={3} style={GROUP_HDR}>II. Saldo Menurut Rekening Koran Bank ({baData.namaBank})</td></tr>
                    <tr><td style={{ ...TD, textAlign: 'center' }}>5</td><td style={TD}>Saldo Rekening Koran per {startDateLabel}</td><td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(systemA.saldoBankAwal)}</td></tr>
                    <tr><td style={{ ...TD, textAlign: 'center' }}>6</td><td style={TD}>( + ) Kredit / Penerimaan s.d. {endDateLabel}</td><td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(systemA.bankKredit)}</td></tr>
                    <tr><td style={{ ...TD, textAlign: 'center' }}>7</td><td style={TD}>( − ) Debet / Pengeluaran s.d. {endDateLabel}</td><td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>({fmt(systemA.bankDebet)})</td></tr>
                    <tr style={TOTAL_ROW}>
                      <td style={{ ...TD, textAlign: 'center' }}></td>
                      <td style={TD}>= SALDO REKENING KORAN PER {endDateLabel}</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(systemA.saldoBank)}</td>
                    </tr>

                    {/* ── SELISIH ── */}
                    <tr style={{ fontWeight: 'bold', backgroundColor: systemA.selisih < 0.01 ? '#e8f5e9' : '#fff3e0' }}>
                      <td colSpan={2} style={{ ...TD, textAlign: 'right', paddingRight: 16 }}>SELISIH KAS (I − II)</td>
                      <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>
                        {systemA.selisih < 0.01 ? 'NIL' : fmt(systemA.selisih)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* ═══════════════════════════════════════════════════════════
                  SECTION B — Outstanding Items (Kelompok per SAP)
              ════════════════════════════════════════════════════════════ */}
              <div className="mb-8" style={{ pageBreakBefore: 'always', marginTop: '2cm' }}>
                <p className="text-[11pt] font-bold uppercase mb-1">B. Rincian Selisih (Outstanding Items)</p>
                <p className="text-[10pt] italic mb-3 text-justify">
                  {systemA.selisih < 0.01
                    ? 'Berdasarkan hasil rekonsiliasi, tidak terdapat selisih antara BKU KBUD dengan Rekening Koran Bank. Kas dinyatakan sinkron.'
                    : 'Selisih terjadi karena adanya transaksi yang belum dicatat/diselesaikan, dengan rincian sebagai berikut:'}
                </p>

                <table className="w-full border-collapse text-[10pt]">
                  <thead>
                    <tr>
                      <th style={{ ...TH, width: 28 }}>No.</th>
                      <th style={{ ...TH, width: 100, textAlign: 'left' }}>Ref / Bukti</th>
                      <th style={{ ...TH, textAlign: 'left' }}>Uraian Transaksi</th>
                      <th style={{ ...TH, width: 140, textAlign: 'right' }}>Nilai (Rp)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemB.length === 0 ? (
                      <tr><td colSpan={4} style={{ ...TD, textAlign: 'center', fontStyle: 'italic', color: '#666' }}>Tidak ada outstanding item. Kas Terverifikasi Sinkron.</td></tr>
                    ) : (
                      <>
                        {/* Kelompok I */}
                        {groupI.length > 0 && <>
                          <tr><td colSpan={4} style={GROUP_HDR}>Kelompok I — Transaksi BKU belum tercatat di Bank (setoran/SP2D dalam perjalanan)</td></tr>
                          {groupI.map((o: any, i: number) => (
                            <tr key={`I-${i}`}>
                              <td style={{ ...TD, textAlign: 'center' }}>{i + 1}</td>
                              <td style={TD}><span className="text-[9pt]">{o.bukti}</span><br /><span style={{ fontSize: '8pt', color: '#555' }}>{o.tipe}</span></td>
                              <td style={TD}><b>{o.opd || '—'}</b><br /><span style={{ fontSize: '9pt', fontStyle: 'italic' }}>{o.uraian}</span></td>
                              <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{o.signedValue > 0 ? '+' : ''}{fmt(o.signedValue)}</td>
                            </tr>
                          ))}
                          <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                            <td colSpan={3} style={{ ...TD, textAlign: 'right' }}>Sub Total Kelompok I</td>
                            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{totalI >= 0 ? '+' : ''}{fmt(totalI)}</td>
                          </tr>
                        </>}

                        {/* Kelompok II */}
                        {groupII.length > 0 && <>
                          <tr><td colSpan={4} style={GROUP_HDR}>Kelompok II — Transaksi Bank belum tercatat di BKU (nota kredit/debet bank)</td></tr>
                          {groupII.map((o: any, i: number) => (
                            <tr key={`II-${i}`}>
                              <td style={{ ...TD, textAlign: 'center' }}>{i + 1}</td>
                              <td style={TD}><span className="text-[9pt]">{o.bukti}</span><br /><span style={{ fontSize: '8pt', color: '#555' }}>{o.tipe}</span></td>
                              <td style={TD}><b>{o.opd || '—'}</b><br /><span style={{ fontSize: '9pt', fontStyle: 'italic' }}>{o.uraian}</span></td>
                              <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{o.signedValue > 0 ? '+' : ''}{fmt(o.signedValue)}</td>
                            </tr>
                          ))}
                          <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                            <td colSpan={3} style={{ ...TD, textAlign: 'right' }}>Sub Total Kelompok II</td>
                            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{totalII >= 0 ? '+' : ''}{fmt(totalII)}</td>
                          </tr>
                        </>}

                        {/* Kelompok III */}
                        {groupIII.length > 0 && <>
                          <tr><td colSpan={4} style={GROUP_HDR}>Kelompok III — Selisih Nilai (koreksi / pembulatan)</td></tr>
                          {groupIII.map((o: any, i: number) => (
                            <tr key={`III-${i}`}>
                              <td style={{ ...TD, textAlign: 'center' }}>{i + 1}</td>
                              <td style={TD}><span className="text-[9pt]">{o.bukti}</span><br /><span style={{ fontSize: '8pt', color: '#555' }}>{o.tipe}</span></td>
                              <td style={TD}><b>{o.opd || '—'}</b><br /><span style={{ fontSize: '9pt', fontStyle: 'italic' }}>{o.uraian}</span></td>
                              <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{o.signedValue > 0 ? '+' : ''}{fmt(o.signedValue)}</td>
                            </tr>
                          ))}
                          <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                            <td colSpan={3} style={{ ...TD, textAlign: 'right' }}>Sub Total Kelompok III</td>
                            <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{totalIII >= 0 ? '+' : ''}{fmt(totalIII)}</td>
                          </tr>
                        </>}

                        {/* Total */}
                        <tr style={{ fontWeight: 'bold', backgroundColor: '#e8edf2' }}>
                          <td colSpan={3} style={{ ...TD, textAlign: 'right', textTransform: 'uppercase' }}>Total Rincian Selisih (Poin B)</td>
                          <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{totalSystemB >= 0 ? '+' : ''}{fmt(totalSystemB)}</td>
                        </tr>

                        {/* Saldo Disesuaikan — Verifikasi kedua sisi bertemu */}
                        <tr><td colSpan={4} style={GROUP_HDR}>Verifikasi: Saldo Disesuaikan (SAP — kedua sisi harus sama)</td></tr>
                        <tr>
                          <td colSpan={2} style={TD}>Saldo Rekening Koran + Total Outstanding</td>
                          <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>
                            {fmt(systemA.saldoBank)} + ({fmt(totalSystemB)})
                          </td>
                          <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', fontWeight: 'bold' }}>{fmt(systemA.saldoBank + totalSystemB)}</td>
                        </tr>
                        <tr style={{ fontWeight: 'bold', backgroundColor: Math.abs((systemA.saldoBank + totalSystemB) - systemA.saldoBKU) < 1 ? '#e8f5e9' : '#ffebee' }}>
                          <td colSpan={2} style={TD}>= Saldo BKU Tersaji</td>
                          <td colSpan={2} style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>
                            {fmt(systemA.saldoBKU)} {Math.abs((systemA.saldoBank + totalSystemB) - systemA.saldoBKU) < 1 ? '✓ SESUAI' : '✗ TIDAK SESUAI'}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>

                {Math.abs(totalSystemB - systemA.selisih) > 1 && systemB.length > 0 && (
                  <p className="text-[8.5pt] italic text-rose-600 mt-1 print:hidden">
                    * Peringatan: Total Poin B ({fmtCurrency(totalSystemB)}) tidak sama dengan Selisih Poin A ({fmtCurrency(systemA.selisih)}). Periksa data rekonsiliasi.
                  </p>
                )}
              </div>

              {/* ═══════════════════════════════════════════════════════════
                  SECTION C — KESIMPULAN
              ════════════════════════════════════════════════════════════ */}
              <div className="mb-10 text-justify text-[11pt] leading-relaxed" style={{ pageBreakInside: 'avoid' }}>
                <p className="font-bold uppercase mb-2">C. Kesimpulan</p>
                <p>
                  Berdasarkan hasil proses rekonsiliasi tersebut di atas, saldo Kas Rekening Kas Umum Daerah (RKUD) Kabupaten Kepulauan Aru pada{' '}
                  <span className="font-bold">{baData.namaBank}</span> Nomor Rekening{' '}
                  <span className="font-bold">{baData.nomorRekening}</span> per tanggal{' '}
                  {endDateLong} dinyatakan{' '}
                  <span className="font-bold italic underline uppercase">
                    {systemA.selisih < 0.01 ? 'SESUAI' : 'TIDAK SESUAI'}
                  </span>{' '}
                  antara Buku Kas Umum KBUD dengan Rekening Koran Bank.
                </p>
                <p className="mt-3">
                  Demikian Berita Acara Rekonsiliasi Kas ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.
                </p>
              </div>

              {/* TANDA TANGAN */}
              <div style={{ pageBreakInside: 'avoid' }}>
                <div className="text-right mb-14 text-[11pt] font-bold">{baData.lokasi}, {tanggalBALong}</div>
                <div style={{ display: 'flex', width: '100%', textAlign: 'center' }}>
                  <div style={{ width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <p style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 90, fontSize: '11pt' }}>Pihak I<br />{baData.pihak1.jabatan}</p>
                    <p style={{ fontWeight: 'bold', textTransform: 'uppercase', textDecoration: 'underline', fontSize: '11pt' }}>{baData.pihak1.nama}</p>
                    <p style={{ fontSize: '10pt' }}>NIP. {baData.pihak1.nip}</p>
                  </div>
                  <div style={{ width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <p style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 90, fontSize: '11pt' }}>Pihak II<br />{baData.namaBank.replace('PT. ', '').replace('Cabang Dobo', '').trim()}</p>
                    <p style={{ fontWeight: 'bold', textTransform: 'uppercase', textDecoration: 'underline', fontSize: '11pt' }}>{baData.pihak2.nama}</p>
                    <p style={{ fontSize: '10pt', textTransform: 'uppercase' }}>{baData.pihak2.jabatan}</p>
                  </div>
                </div>
                <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginTop: 50 }}>
                  <p style={{ fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 90, fontSize: '11pt' }}>Mengetahui,<br />{baData.mengetahui.jabatan}</p>
                  <p style={{ fontWeight: 'bold', textTransform: 'uppercase', textDecoration: 'underline', fontSize: '11pt' }}>{baData.mengetahui.nama}</p>
                  <p style={{ fontSize: '10pt' }}>NIP. {baData.mengetahui.nip}</p>
                </div>
              </div>

            </div>{/* end flex-1 */}
          </div>{/* end doc-page */}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4; margin: 0; }
          body { background: white !important; margin: 0 !important; padding: 0 !important; }
          .print\\:hidden { display: none !important; }
          .doc-page { width: 210mm !important; min-height: 297mm !important; }
        }
      `}</style>
    </div>
  );
}
