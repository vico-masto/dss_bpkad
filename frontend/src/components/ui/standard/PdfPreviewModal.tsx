'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, X, Loader2, Download, Printer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string | null;
  title?: string;
  reference?: string;
}

export function PdfPreviewModal({
  isOpen,
  onClose,
  pdfUrl,
  title = "Preview Dokumen Digital",
  reference
}: PdfPreviewModalProps) {
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8">
          {/* Overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white w-full max-w-6xl h-[95vh] rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden relative z-10 border border-white/20"
          >
            {/* Header Modal */}
            <div className="h-24 px-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 backdrop-blur-xl">
              <div className="flex items-center gap-6">
                <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-[20px] flex items-center justify-center border border-rose-100 shadow-sm">
                  <FileText size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter leading-none italic">{title}</h3>
                  {reference && (
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mt-2">
                      REF: <span className="text-slate-600">{reference}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                 <button 
                   onClick={() => window.open(pdfUrl || '', '_blank')}
                   className="p-4 bg-white border border-slate-200 text-slate-500 rounded-2xl hover:text-indigo-600 hover:border-indigo-100 transition-all shadow-sm active:scale-95"
                 >
                   <Printer size={20} />
                 </button>
                 <button 
                   onClick={onClose}
                   className="p-4 bg-white border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-100 rounded-2xl transition-all shadow-sm active:scale-95"
                 >
                   <X size={24} />
                 </button>
              </div>
            </div>

            {/* Viewer Body */}
            <div className="flex-1 bg-slate-200 relative overflow-hidden">
               {isIframeLoading && (
                 <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-slate-400">
                    <Loader2 className="animate-spin" size={48} />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">Menyiapkan Dokumen Digital...</p>
                 </div>
               )}
               
               {pdfUrl && (
                 <iframe 
                   src={pdfUrl} 
                   className={cn(
                     "w-full h-full transition-opacity duration-1000",
                     isIframeLoading ? "opacity-0" : "opacity-100"
                   )}
                   onLoad={() => setIsIframeLoading(false)}
                 />
               )}
            </div>

            {/* Footer Status */}
            <div className="px-10 py-4 bg-slate-900 flex items-center justify-between">
               <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest italic">Electronic Archive Management System • BPKAD KEP. ARU</p>
               <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest italic">Encrypted Connection</span>
               </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
