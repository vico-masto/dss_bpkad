'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { FileUp, Brain, Copy, Save, AlertCircle, Loader2 } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/**
 * IMPOR MASSAL SP2D — diekstrak verbatim dari /dashboard/sp2d (tab Rekam)
 * agar dapat dipakai di Wizard Impor Terpadu tanpa duplikasi logika.
 * Props: open, onClose, onDone (dipanggil setelah commit sukses)
 */
export default function Sp2dBulkImport({ open, onClose, onDone }: {
  open: boolean; onClose: () => void; onDone?: () => void;
}) {
  const [importPreview, setImportPreview] = useState<{ isOpen: boolean, data: any[], stats: any }>({ isOpen: false, data: [], stats: null });
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentName: '' });

  const handleDownloadTemplate = () => {
    const headers = [
      'Tanggal Terbit (YYYY-MM-DD)',
      'Tanggal Pencairan (YYYY-MM-DD)',
      'Nomor SP2D',
      'OPD',
      'Uraian',
      'Penerima',
      'ID Sumber Dana',
      'Jenis',
      'Nilai Bruto',
      'Nilai Potongan'
    ];
    const sample = [
      format(new Date(), 'yyyy-MM-dd'),
      format(new Date(), 'yyyy-MM-dd'),
      '0001/SP2D/LS/2026',
      'DINAS PENDIDIKAN',
      'Pembayaran Belanja Modal Alat Kantor',
      'PT. MAJU BERSAMA',
      'SD-PAD',
      'LS BARJAS',
      '50000000',
      '1000000'
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'Template_Import_SP2D.xlsx');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // AMBIL DATA SALDO TERUPDATE DARI SISTEM (Penerimaan)
    const loadBalToast = toast.loading('Menyinkronkan saldo kas sistem...');
    let systemBalances: Record<string, number> = {};
    try {
      const res = await api.get('/reports/dashboard-stats', { params: { tahun: new Date().getFullYear() } });
      res.data.stats.forEach((s: any) => {
        systemBalances[s.id] = s.kas_efektif; // Gunakan Kas Efektif (Saldo - Talangan Aktif)
      });
      toast.dismiss(loadBalToast);
    } catch (err) {
      console.error('Failed to fetch balances:', err);
      toast.dismiss(loadBalToast);
      // Tetap lanjut tapi dengan asumsi saldo 0 jika gagal fetch
    }

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: false });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const dataArr = XLSX.utils.sheet_to_json(ws);

        let totalNilai = 0;
        const processed = (dataArr as any[]).map(item => {
           const getVal = (keyTarget: string) => {
              const cleanTarget = keyTarget.toLowerCase().replace(/[^a-z0-9]/g, '');
              const found = Object.keys(item).find(k => {
                const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
                return cleanKey.includes(cleanTarget);
              });
              return found ? item[found] : '';
           };

           const parseExcelDate = (val: any, allowEmpty = false) => {
              if (val instanceof Date) {
                const y = val.getUTCFullYear();
                const m = String(val.getUTCMonth() + 1).padStart(2, '0');
                const d = String(val.getUTCDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
              }
              if (typeof val === 'string' && val.length >= 10) return val;
              if (typeof val === 'number') {
                const jsDate = new Date((val - 25569) * 86400 * 1000);
                const y = jsDate.getUTCFullYear();
                const m = String(jsDate.getUTCMonth() + 1).padStart(2, '0');
                const d = String(jsDate.getUTCDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
              }
              return allowEmpty ? null : null;
            };

           const tglSp2d = parseExcelDate(getVal('tanggalterbit'), true);
           const tglCair = parseExcelDate(getVal('tanggalpencairan'), true);
           const idSumberDana = getVal('idsumberdana') || '';

           // Pagu/Saldo diambil dari sistem, bukan dari Excel
           const paguSistem = systemBalances[idSumberDana] || 0;

           const nilaiBruto = parseFloat(getVal('nilaibruto')) || 0;
           const nilaiPotongan = parseFloat(getVal('nilaipotongan')) || 0;

           totalNilai += nilaiBruto;

           let statusDokumen = 'AMAN';
           let statusInput = '-';

           if (!tglSp2d) {
             statusDokumen = 'INVALID';
             statusInput = '-';
           } else {
             if (!idSumberDana || idSumberDana === 'SD-LAINNYA' || paguSistem <= 0 || paguSistem < nilaiBruto) {
               statusDokumen = 'TALANGAN';
             } else {
               statusDokumen = 'AMAN';
             }

             if (!tglCair) {
               statusInput = 'BELUM INPUT';
             } else {
               statusInput = tglCair;
             }
           }

           return {
              nomor: getVal('nomorsp2d'),
              tanggal: tglSp2d || null,
              tanggal_pencairan: tglCair,
              opd: getVal('opd') || 'OPD LAINNYA',
              id_sumber_dana: idSumberDana || 'SD-LAINNYA',
              pagu_sistem: paguSistem,
              jenis: getVal('jenis') || 'LS',
              uraian: getVal('uraian') || 'Pencairan SP2D (Import)',
              penerima: getVal('penerima') || 'Pihak Ketiga',
              nilai_bruto: nilaiBruto,
              nilai_potongan: nilaiPotongan,
              status_dokumen: statusDokumen,
              status_input: statusInput
           };
        });

        setImportPreview({
           isOpen: true,
           data: processed,
           stats: {
              count: processed.length,
              total: totalNilai
           }
        });
      } catch (err) {
        toast.error('Gagal membaca file Excel. Pastikan format sesuai template.');
      } finally {
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleCommitImport = async () => {
     setIsImporting(true);
     let successCount = 0;
     let failCount = 0;
     const errors: string[] = [];
     const total = importPreview.data.length;
     setImportProgress({ current: 0, total, currentName: 'Memulai proses impor...' });

     const toastId = toast.loading(`Mengimpor ${total} dokumen...`);

     for (let i = 0; i < importPreview.data.length; i++) {
        const item = importPreview.data[i];
        setImportProgress(prev => ({ ...prev, current: i + 1, currentName: item.nomor || `Item #${i+1}` }));

        try {
           const nilaiNeto = item.nilai_bruto - item.nilai_potongan;

           let finalUraian = item.uraian;
            if (item.status_dokumen === 'INVALID') {
             finalUraian = `[INVALID - Tgl SP2D Kosong] ${finalUraian}`;
           }

           const formData = new FormData();
           formData.append('nomor', item.nomor || `SP2D-IMP-${Date.now()}-${Math.random().toString(36).substring(7)}`);
           formData.append('tanggal', item.tanggal || new Date().toISOString().split('T')[0]);
           if (item.tanggal_pencairan) formData.append('tanggal_pencairan', item.tanggal_pencairan);

           formData.append('opd', item.opd);
           formData.append('jenis', item.jenis);
           formData.append('uraian', finalUraian);
           formData.append('penerima', item.penerima);
           formData.append('nilai_bruto', item.nilai_bruto.toString());
           formData.append('nilai_potongan', item.nilai_potongan.toString());
           formData.append('nilai_neto', nilaiNeto.toString());

           formData.append('status_dana', item.status_dokumen === 'TALANGAN' ? 'Talangan' : (item.status_dokumen === 'AMAN' ? 'Aman' : 'Invalid'));
           formData.append('confirmTalangan', 'true');
           formData.append('id_sumber_talangan', 'SD-SILPA');

           formData.append('details', JSON.stringify([{
              id_sumber_dana: item.id_sumber_dana,
              nilai_bruto: item.nilai_bruto,
              nilai_neto: nilaiNeto
           }]));

           await api.post('/sp2d', formData);
           successCount++;
        } catch (err: any) {
           failCount++;
           const errMsg = err.response?.data?.message || err.message || 'Gagal menyimpan';
           errors.push(`${item.nomor || `Item #${i+1}`}: ${errMsg}`);
        }
     }

     toast.dismiss(toastId);
     if (failCount > 0) {
        toast.warning(`Impor selesai: ${successCount} berhasil, ${failCount} gagal.`, {
          description: (
            <div className="mt-2 max-h-32 overflow-y-auto">
              <ul className="list-disc pl-4 text-[11px] text-orange-700 space-y-0.5">
                {errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          ),
          duration: 10000,
        });
     } else {
        toast.success(`Berhasil mengimpor ${successCount} data SP2D`);
     }

     setImportProgress({ current: 0, total: 0, currentName: '' });
     setIsImporting(false);
     setImportPreview({ isOpen: false, data: [], stats: null });
     onDone?.();
     onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!isImporting) { if (!v) onClose(); else setImportPreview(p => ({ ...p, isOpen: v })); } }}>
      <DialogContent className="!fixed !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !max-w-2xl !w-[90vw] !max-h-[95vh] rounded-xl p-0 overflow-hidden border-none shadow-2xl flex flex-col">
        <div className="bg-ds-primary p-8 text-white relative overflow-hidden shrink-0">
          <div className="absolute top-0 right-0 p-6 opacity-10 rotate-12">
            <FileUp size={80} />
          </div>
          <div className="relative z-10 flex items-center gap-4">
            <div className="w-16 h-16 bg-fin-surface/10 backdrop-blur-xl rounded-[20px] flex items-center justify-center text-fin-info border border-white/10">
              <Brain size={32} />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight">Pratinjau Impor Data</DialogTitle>
              <DialogDescription className="text-fin-text-muted font-medium mt-0.5">Verifikasi dokumen sebelum dimasukkan ke dalam sistem</DialogDescription>
            </div>
          </div>
        </div>

        {!importPreview.isOpen && (
          <div className="p-8 space-y-4 flex-1 overflow-y-auto custom-scrollbar">
            <p className="text-xs text-fin-text-secondary leading-relaxed">
              Unduh template, isi sesuai kolom (tanggal terbit, pencairan, nomor, OPD, sumber dana, bruto, potongan),
              lalu unggah. Sistem akan menampilkan pratinjau status per baris: AMAN / TALANGAN / INVALID
              berdasarkan saldo kas sistem saat itu.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleDownloadTemplate} className="gap-1.5 h-10 rounded-lg border-fin-border text-fin-text-primary hover:bg-fin-page">
                Unduh Template Excel
              </Button>
              <label className="inline-flex">
                <input type="file" accept=".xlsx,.xls"
                  onChange={handleImportFile}
                  className="text-xs file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-indigo-50 file:text-indigo-700 cursor-pointer"/>
              </label>
            </div>
            <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white shrink-0">
                <AlertCircle size={16} />
              </div>
              <p className="text-[11px] font-semibold text-amber-900 leading-relaxed">
                Sistem akan mencatat sebagai TALANGAN otomatis jika saldo kas per sumber dana tidak mencukupi — data tetap masuk untuk perbaikan manual.
              </p>
            </div>
          </div>
        )}

        {importPreview.isOpen && (
        <>
        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-5 bg-fin-page rounded-xl border border-fin-border">
              <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest mb-1">Jumlah Dokumen</p>
              <p className="text-xl font-bold text-fin-text-primary">{importPreview.stats?.count} Records</p>
            </div>
            <div className="p-5 bg-fin-page rounded-xl border border-fin-border">
              <p className="text-[9px] font-bold text-fin-text-muted uppercase tracking-widest mb-1">Total Nilai Bruto</p>
              <p className="text-xl font-bold text-fin-income">{formatCurrency(importPreview.stats?.total || 0)}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <h4 className="text-[10px] font-bold text-fin-text-primary uppercase tracking-wider">Detil Batch</h4>
              <Badge className="bg-fin-info-bg text-[#175CD3] border-none font-bold text-[9px]">READY FOR IMPORT</Badge>
            </div>
            <div className="space-y-2">
              {importPreview.data.map((item: any, idx: number) => (
                <div key={idx} className="p-3 bg-fin-surface border border-fin-border rounded-xl flex justify-between items-center hover:border-[#2E90FA] transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-[#F1F3F5] flex items-center justify-center text-[9px] font-bold text-fin-text-muted group-hover:bg-[#2E90FA] group-hover:text-white transition-colors">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 group/copy">
                        <p className="text-[11px] font-bold text-fin-text-primary truncate max-w-[150px] transition-colors group-hover/copy:text-fin-info-text select-all">{item.nomor || 'NOMOR KOSONG'}</p>
                        <button title="Salin nomor SP2D"
                          onClick={() => { navigator.clipboard.writeText(item.nomor); toast.success('Nomor disalin', { description: item.nomor }); }}
                          className="p-0.5 rounded opacity-40 hover:opacity-100 hover:bg-indigo-50 hover:text-fin-info-text text-fin-text-muted transition-all shrink-0">
                          <Copy size={11} />
                        </button>
                      </div>
                      <p className="text-[9px] font-medium text-fin-text-muted truncate max-w-[150px]">{item.opd}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-[11px] font-bold text-fin-text-primary">{formatCurrency(item.nilai_bruto)}</p>
                    <div className="flex gap-1">
                      <Badge className={cn("text-[7px] font-bold uppercase px-1 py-0 border-none",
                        item.status_dokumen === 'AMAN' ? "bg-[#ECFDF3] text-[#027A48]"
                        : (item.status_dokumen === 'TALANGAN' ? "bg-[#FFFAEB] text-[#B54708]" : "bg-[#FEF3F2] text-[#B42318]"))}>
                        {item.status_dokumen}
                      </Badge>
                      <Badge className={cn("text-[7px] font-bold uppercase px-1 py-0 border-none",
                        item.status_input === 'BELUM INPUT' ? "bg-[#FEF3F2] text-[#B42318]" : "bg-[#F5F8FF] text-[#2E90FA]")}>
                        {item.status_input === 'BELUM INPUT' ? 'BELUM INPUT' : 'INPUT OK'}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-100 p-5 rounded-xl flex items-start gap-3">
            <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-500/20">
              <AlertCircle size={16} />
            </div>
            <p className="text-[11px] font-semibold text-amber-900 leading-relaxed">
              Sistem akan secara otomatis mencatat data sebagai TALANGAN jika saldo kas per sumber dana tidak mencukupi. Data akan tetap masuk ke aplikasi untuk perbaikan manual.
            </p>
          </div>
        </div>

        <DialogFooter className="p-8 bg-fin-page border-t border-fin-border">
          {isImporting ? (
            <div className="w-full flex items-center gap-3">
              <Loader2 className="animate-spin text-ds-primary shrink-0" size={20} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-fin-text-primary truncate">Mengimpor data SP2D...</p>
                <p className="text-[11px] text-fin-text-muted">{importProgress.current} dari {importProgress.total} dokumen</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-4 w-full sm:flex-row flex-col">
              <Button onClick={handleCommitImport}
                className="h-14 flex-1 bg-ds-primary hover:bg-ds-primary-hover text-white rounded-xl font-bold text-sm shadow-xl shadow-[#101828]/20 group transition-all">
                <div className="flex items-center gap-2"><Save size={18} className="group-hover:scale-110 transition-transform" /><span>KONFIRMASI & IMPORT SEKARANG</span></div>
              </Button>
              <Button variant="ghost"
                onClick={() => { setImportPreview({ isOpen: false, data: [], stats: null }); onClose(); }}
                className="h-14 px-8 rounded-xl font-bold text-xs uppercase">
                Batal
              </Button>
            </div>
          )}
        </DialogFooter>
        </>
          )}
        </DialogContent>
      </Dialog>
  );
}
