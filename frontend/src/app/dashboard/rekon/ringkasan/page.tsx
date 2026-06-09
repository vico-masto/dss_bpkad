'use client';

import { useState, useMemo } from 'react';
import useSWR from 'swr';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';
import { Printer, RefreshCw, BookOpenCheck } from 'lucide-react';
import { formatCurrency, cn } from '@/lib/utils';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/patterns/page-header';

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const toN = (v: any) => Number(v) || 0;
const fmt = (val: any) => new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(parseFloat(val) || 0);

// ── Inline styles — border selalu muncul saat cetak ──────────────────────────
const TH: React.CSSProperties = { border: '1px solid #000', padding: '7px 8px', backgroundColor: '#f0f4f8', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' };
const TD: React.CSSProperties = { border: '1px solid #000', padding: '7px 8px' };
const TOTAL_ROW: React.CSSProperties = { fontWeight: 'bold', backgroundColor: '#f0f4f8' };
const SELISIH_OK:   React.CSSProperties = { fontWeight: 'bold', backgroundColor: '#e8f5e9' };
const SELISIH_WARN: React.CSSProperties = { fontWeight: 'bold', backgroundColor: '#fff3e0' };

export default function RingkasanRekonPage() {
  const currentMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState('2026');
  const [selectedBulan, setSelectedBulan] = useState(currentMonth);

  const { data, isLoading, mutate } = useSWR(
    ['/reports/reconciliation/discrepancy-report', year],
    ([url, y]: [string, string]) => api.get(url, { params: { year: y } }).then(r => r.data),
    { revalidateOnFocus: false, shouldRetryOnError: false }
  );

  // ── Kalkulasi Point B & C (rekonsiliasi bulanan) ─────────────────────────
  const calc = useMemo(() => {
    if (!data) return null;

    const saldoAwalSilpa = toN(data.saldoAwalSilpa);

    // ── Saldo awal: Jan = SILPA, Feb–Des = saldo akhir bulan sebelumnya ──
    let saldoAwal: number;
    if (selectedBulan === 1) {
      saldoAwal = saldoAwalSilpa;
    } else {
      const mPrev       = (data.monthlyBalance || []).filter((m: any) => m.bulan <= selectedBulan - 1);
      const penPrev     = mPrev.reduce((acc: number, m: any) => acc + toN(m.penerimaan), 0);
      const pengPrev    = mPrev.reduce((acc: number, m: any) => acc + toN(m.pengeluaran), 0);
      const potonganPrev = (data.potonganUnmatched || [])
        .filter((p: any) => p.bulan <= selectedBulan - 1)
        .reduce((acc: number, p: any) => acc + toN(p.total_nilai), 0);
      saldoAwal = penPrev - pengPrev + potonganPrev;
    }

    // ── Penerimaan & pengeluaran: hanya bulan terpilih ──
    const currentMonthData = (data.monthlyBalance || []).find((m: any) => m.bulan === selectedBulan);
    const penerimaan = selectedBulan === 1
      ? toN(currentMonthData?.penerimaan) - saldoAwalSilpa   // Jan: hilangkan SILPA (sudah di saldo awal)
      : toN(currentMonthData?.penerimaan);
    const pengeluaran = toN(currentMonthData?.pengeluaran);

    // Potongan mengendap hanya bulan terpilih
    const potonganBulanIni = (data.potonganUnmatched || [])
      .filter((p: any) => p.bulan === selectedBulan)
      .reduce((acc: number, p: any) => acc + toN(p.total_nilai), 0);

    const saldoAkhirBKU = saldoAwal + penerimaan - pengeluaran + potonganBulanIni;
    const saldoBank     = toN(currentMonthData?.saldo_bank || 0);
    const pSelisih      = Math.abs(saldoBank - saldoAkhirBKU);
    const pIsSesuai     = pSelisih < 1;

    // ── Point C: outstanding items difilter per bulan & tahun ──
    const allAnomalies = [...(data.matchedWithDiscrepancy || []), ...(data.unmatchedDetails || [])];
    const pAnomalyRows = allAnomalies
      .filter((r: any) => {
        if (!r.tanggal) return false;
        const rDate = new Date(r.tanggal);
        return rDate.getMonth() + 1 <= selectedBulan && rDate.getFullYear() === parseInt(year);
      })
      .filter((r: any) => {
        const isPotongan = r.tipe === 'POTONGAN SP2D' || r.tipe === 'POTONGAN' || r.tipe === 'POTONGAN_BANK';
        const isLainnya  = (r.uraian || '').toLowerCase().includes('lainnya') || (r.keterangan_rekon || '').toLowerCase().includes('lainnya');
        return !(isPotongan && isLainnya);
      });

    return { saldoAwal, penerimaan, pengeluaran, saldoAkhirBKU, saldoBank, pSelisih, pIsSesuai, pAnomalyRows };
  }, [data, selectedBulan, year]);

  const bulanLabel = MONTHS[selectedBulan - 1];

  // Tanggal awal dan akhir bulan terpilih untuk uraian tabel
  const lastDay     = new Date(parseInt(year), selectedBulan, 0);           // hari terakhir bulan terpilih
  const lastDayFmt  = format(lastDay, 'dd MMMM yyyy', { locale: id });
  const firstDayFmt = `1 ${MONTHS[selectedBulan - 1]} ${year}`;            // awal bulan terpilih (= akhir bulan sebelumnya untuk Feb–Des)

  return (
    <div className="max-w-5xl mx-auto print:max-w-full space-y-6 pb-20 animate-in fade-in duration-700">

      {/* ── HEADER (tersembunyi saat cetak) ── */}
      <div className="print-hidden">
        <PageHeader
          title="Ringkasan Rekonsiliasi — Point B & C"
          description="Point B (Hasil Rekonsiliasi Kas) dan Point C (Rincian Selisih) tanpa perlu Generate BAR"
          icon={<BookOpenCheck className="size-5" />}
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={year}
                onChange={e => setYear(e.target.value)}
                className="w-28 h-10 px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
              >
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={String(y)} className="bg-fin-surface text-fin-text-primary">{y}</option>
                ))}
              </select>
              <select
                value={selectedBulan}
                onChange={e => setSelectedBulan(Number(e.target.value))}
                className="w-36 h-10 px-3 border border-fin-border rounded-lg bg-fin-surface text-fin-text-primary text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 cursor-pointer"
              >
                {MONTHS.map((m, idx) => (
                  <option key={idx} value={idx + 1} className="bg-fin-surface text-fin-text-primary">{m}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={() => mutate()} className="h-10 gap-2 border-fin-border bg-fin-surface text-fin-text-primary">
                <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                Refresh
              </Button>
              <Button onClick={() => window.print()} className="h-10 bg-ds-primary text-white gap-2 hover:bg-ds-primary-hover shadow-md shadow-ds-primary/20">
                <Printer size={14} />
                Cetak
              </Button>
            </div>
          }
        />
      </div>

      {/* ── STATUS BADGE (tersembunyi saat cetak) ── */}
      {calc && (
        <div className="print-hidden flex items-center gap-3">
          <Badge className={cn('text-sm px-4 py-1.5 font-black rounded-full', calc.pIsSesuai ? 'bg-emerald-100 text-emerald-700 border border-emerald-300' : 'bg-amber-100 text-amber-700 border border-amber-300')}>
            {calc.pIsSesuai ? '✓ KAS SESUAI' : `⚠ TERDAPAT SELISIH Rp ${fmt(calc.pSelisih)}`}
          </Badge>
          <span className="text-xs text-fin-text-muted">{bulanLabel} {year}</span>
        </div>
      )}

      {/* ── LOADING ── */}
      {isLoading && (
        <Card className="p-12 text-center text-fin-text-muted text-sm border-fin-border bg-fin-surface rounded-xl print-hidden">
          <RefreshCw size={24} className="animate-spin mx-auto mb-3 text-indigo-400" />
          Memuat data rekonsiliasi...
        </Card>
      )}

      {/* ── AREA DOKUMEN (tampil di cetak) ── */}
      {!isLoading && calc && (
        <div
          id="print-area"
          className="bg-white rounded-xl shadow-lg print:shadow-none print:rounded-none"
          style={{ fontFamily: '"Times New Roman", Times, serif', color: '#000' }}
        >
          <div className="p-10 print:p-0">

            {/* Judul */}
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <p style={{ fontSize: '14pt', fontWeight: 'bold', textTransform: 'uppercase', margin: 0 }}>
                RINGKASAN REKONSILIASI KAS
              </p>
              <p style={{ fontSize: '11pt', margin: '4px 0 0' }}>
                Periode Bulan{' '}
                <span style={{ fontWeight: 'bold', textDecoration: 'underline' }}>{bulanLabel.toUpperCase()}</span>{' '}
                Tahun Anggaran <span style={{ fontWeight: 'bold' }}>{year}</span>
              </p>
            </div>

            {/* ═══ POINT B — Hasil Rekonsiliasi Kas ═══════════════════════════ */}
            <div style={{ marginBottom: '28px' }}>
              <p style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11pt', margin: '0 0 8px' }}>
                B. HASIL REKONSILIASI KAS
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5pt', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '40px' }} />
                  <col />
                  <col style={{ width: '195px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={TH}>NO</th>
                    <th style={{ ...TH, textAlign: 'left', whiteSpace: 'normal' }}>URAIAN</th>
                    <th style={{ ...TH, textAlign: 'right' }}>JUMLAH (RP)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...TD, textAlign: 'center' }}>1</td>
                    <td style={TD}>SALDO AWAL KAS BKU PER TANGGAL {firstDayFmt.toUpperCase()}</td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(calc.saldoAwal)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...TD, textAlign: 'center' }}>2</td>
                    <td style={TD}>TOTAL PENERIMAAN KAS BULAN {bulanLabel.toUpperCase()}</td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(calc.penerimaan)}</td>
                  </tr>
                  <tr>
                    <td style={{ ...TD, textAlign: 'center' }}>3</td>
                    <td style={TD}>TOTAL PENGELUARAN KAS BULAN {bulanLabel.toUpperCase()}</td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(calc.pengeluaran)}</td>
                  </tr>
                  <tr style={TOTAL_ROW}>
                    <td style={{ ...TD, textAlign: 'center' }}>4</td>
                    <td style={TD}>SALDO AKHIR BKU RKUD PER TANGGAL {lastDayFmt.toUpperCase()}</td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(calc.saldoAkhirBKU)}</td>
                  </tr>
                  <tr style={TOTAL_ROW}>
                    <td style={{ ...TD, textAlign: 'center' }}>5</td>
                    <td style={TD}>SALDO REKENING KORAN BANK PER TANGGAL {lastDayFmt.toUpperCase()}</td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(calc.saldoBank)}</td>
                  </tr>
                  <tr style={calc.pIsSesuai ? SELISIH_OK : SELISIH_WARN}>
                    <td style={{ ...TD, textAlign: 'center' }}>6</td>
                    <td style={TD}>SELISIH (NO. 4 − NO. 5)</td>
                    <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace' }}>
                      {calc.pIsSesuai ? 'NOL' : fmt(calc.pSelisih)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* ═══ POINT C — Rincian Selisih ═══════════════════════════════════ */}
            <div>
              <p style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11pt', margin: '0 0 8px' }}>
                C. RINCIAN SELISIH (OUTSTANDING ITEMS)
              </p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt', tableLayout: 'fixed' }}>
                <colgroup>
                  <col style={{ width: '38px' }} />
                  <col style={{ width: '150px' }} />
                  <col />
                  <col style={{ width: '150px' }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={TH}>NO</th>
                    <th style={{ ...TH, textAlign: 'left', whiteSpace: 'normal' }}>REFERENSI / TIPE</th>
                    <th style={{ ...TH, textAlign: 'left', whiteSpace: 'normal' }}>KETERANGAN TRANSAKSI</th>
                    <th style={{ ...TH, textAlign: 'right' }}>NILAI (RP)</th>
                  </tr>
                </thead>
                <tbody>
                  {calc.pAnomalyRows.length > 0 ? (
                    calc.pAnomalyRows.map((r: any, i: number) => (
                      <tr key={`${r.id ?? 'row'}-${i}`} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                        <td style={{ ...TD, textAlign: 'center', verticalAlign: 'top' }}>{i + 1}</td>
                        <td style={{ ...TD, verticalAlign: 'top', wordBreak: 'break-word' }}>
                          <span style={{ fontWeight: 'bold', textTransform: 'uppercase', display: 'block' }}>{r.tipe}</span>
                          <span style={{ fontSize: '8.5pt', fontFamily: 'monospace', color: '#555' }}>{r.bukti || '—'}</span>
                          <div style={{ fontSize: '8pt', color: '#666', fontStyle: 'italic' }}>
                            {r.tanggal ? format(new Date(r.tanggal), 'dd/MM/yyyy') : '—'}
                          </div>
                        </td>
                        <td style={{ ...TD, verticalAlign: 'top', wordBreak: 'break-word' }}>
                          {r.keterangan_rekon || r.uraian || 'Belum ada penjelasan'}
                          {r.opd && (
                            <div style={{ fontSize: '8pt', color: '#888', fontStyle: 'italic', marginTop: 2 }}>{r.opd}</div>
                          )}
                        </td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'monospace', verticalAlign: 'top' }}>
                          {fmt(toN(r.selisih || r.nilai))}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ ...TD, textAlign: 'center', fontStyle: 'italic', color: '#555', padding: '14px 8px' }}>
                        Kas Terverifikasi Sinkron. Tidak terdapat selisih pembukuan.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Kesimpulan */}
            <div style={{ marginTop: '24px', padding: '12px 16px', border: `2px solid ${calc.pIsSesuai ? '#4caf50' : '#ff9800'}`, borderRadius: '6px', backgroundColor: calc.pIsSesuai ? '#f1f8e9' : '#fff8e1', pageBreakInside: 'avoid', breakInside: 'avoid' }}>
              <p style={{ margin: 0, fontWeight: 'bold', textTransform: 'uppercase', fontSize: '11pt' }}>
                Kesimpulan: Rekonsiliasi Kas Dinyatakan{' '}
                <span style={{ textDecoration: 'underline' }}>
                  {calc.pIsSesuai ? 'SESUAI' : 'TERDAPAT SELISIH'}
                </span>
              </p>
              {!calc.pIsSesuai && (
                <p style={{ margin: '4px 0 0', fontSize: '10pt' }}>
                  Jumlah selisih: <span style={{ fontWeight: 'bold', fontFamily: 'monospace' }}>Rp {fmt(calc.pSelisih)}</span>
                </p>
              )}
            </div>

          </div>{/* end p-10 */}
        </div>
      )}

      {/* ── PRINT CSS ── */}
      <style>{`
        @media print {
          /* Sembunyikan Sidebar dan Header layout */
          aside  { display: none !important; }
          header { display: none !important; }

          /* Sembunyikan elemen kontrol halaman */
          .print-hidden { display: none !important; }

          /* Layout tubuh halaman */
          body { background: white !important; margin: 0 !important; padding: 0 !important; }
          @page { size: A4 portrait; margin: 1.8cm 2cm; }

          /* Hilangkan shadow dan radius area cetak */
          #print-area { box-shadow: none !important; border-radius: 0 !important; }

          /* Area konten — tidak ada padding tambahan karena @page sudah set margin */
          #print-area > div { padding: 0 !important; }

          /* Outer container max-width */
          .max-w-5xl { max-width: 100% !important; }

          /* ── Perbaikan tabel lintas halaman ── */
          table {
            width: 100% !important;
            border-collapse: collapse !important;
            page-break-inside: auto;
          }
          /* Header tabel diulang di setiap halaman baru */
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          /* Baris tidak terputus di tengah */
          tr {
            page-break-inside: avoid;
            break-inside: avoid;
          }
          /* Pastikan border tidak hilang di tepi kanan */
          td, th {
            border: 1px solid #000 !important;
            overflow-wrap: break-word;
            word-break: break-word;
          }
        }
      `}</style>
    </div>
  );
}
