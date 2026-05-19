'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface PrintEngineProps {
  children: React.ReactNode;
  orientation?: 'portrait' | 'landscape';
  showKop?: boolean;
  title?: string;
  subTitle?: string;
}

export function PrintEngine({
  children,
  orientation = 'portrait',
  showKop = true,
  title = "LAPORAN REALISASI KAS DAERAH",
  subTitle = "TAHUN ANGGARAN 2026"
}: PrintEngineProps) {
  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 ${orientation};
            margin: 2cm;
          }
          
          body {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }

          /* Hide all UI elements */
          header, 
          nav, 
          aside, 
          #sidebar,
          button, 
          .no-print,
          [role="navigation"],
          .fixed,
          .shadow-sm,
          .shadow-xl,
          .shadow-2xl {
            display: none !important;
          }

          .print-area {
            display: block !important;
            width: 100% !important;
            font-family: 'Times New Roman', Times, serif !important;
            color: black !important;
          }

          .print-area * {
            border-radius: 0 !important;
            box-shadow: none !important;
            background-color: transparent !important;
          }

          /* Official Table Formatting */
          table {
            border-collapse: collapse !important;
            width: 100% !important;
            border: 1.5pt solid black !important;
            margin-bottom: 20pt !important;
          }

          th, td {
            border: 0.5pt solid black !important;
            padding: 6pt !important;
            color: black !important;
            font-size: 10pt !important;
          }

          th {
            background-color: #f1f5f9 !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
          }
        }
      `}</style>

      <div className="print-area hidden md:block">
        {/* Official Letterhead (Kop Surat) */}
        {showKop && (
          <div className="text-center mb-10 pb-4 border-b-[3pt] border-black relative">
            <div className="absolute left-0 top-0 w-24 h-24 flex items-center justify-center opacity-80">
               {/* Space for Logo */}
               <div className="w-20 h-20 bg-slate-100 border border-slate-300 rounded-sm flex items-center justify-center text-[8px] font-bold text-slate-400 no-print">LOGO PEMDA</div>
            </div>
            <h2 className="text-xl font-bold uppercase leading-tight tracking-tight">Pemerintah Kabupaten Kepulauan Aru</h2>
            <h1 className="text-2xl font-bold uppercase leading-tight tracking-tighter">Badan Pengelolaan Keuangan dan Aset Daerah</h1>
            <p className="text-[10pt] italic mt-1">Jln. Pemda II - Kota Dobo, Kepulauan Aru, Maluku</p>
            <div className="mt-4 border-b-[1pt] border-black w-full" />
          </div>
        )}

        {/* Report Title Area */}
        <div className="text-center mb-8">
           <h3 className="text-[14pt] font-bold uppercase underline decoration-black underline-offset-4">{title}</h3>
           <p className="text-[11pt] font-bold uppercase mt-2">{subTitle}</p>
        </div>

        {/* Main Content Render */}
        <div className="official-content leading-relaxed">
           {children}
        </div>

        {/* Official Signatures (Footer) */}
        <div className="mt-16 grid grid-cols-2 gap-20">
           <div className="text-center">
              <p className="text-[11pt] mb-20 font-bold uppercase">Mengesahkan,<br/>Kepala Badan / BUD</p>
              <div className="mt-20">
                 <p className="text-[11pt] font-bold underline uppercase">NAMA KEPALA BADAN</p>
                 <p className="text-[10pt]">NIP. 19XXXXXXXXXXXXXXXX</p>
              </div>
           </div>
           <div className="text-center">
              <p className="text-[11pt] mb-20 font-bold uppercase">Dobo, {new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())}<br/>Bendahara / Pembuat</p>
              <div className="mt-20">
                 <p className="text-[11pt] font-bold underline uppercase">NAMA BENDAHARA</p>
                 <p className="text-[10pt]">NIP. 19XXXXXXXXXXXXXXXX</p>
              </div>
           </div>
        </div>
      </div>
    </>
  );
}
