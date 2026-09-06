import { format } from 'date-fns';

// toN lokal — konsisten dgn halaman pemakai (Number(v) || 0, tahan string "0")
const toN = (v: any) => Number(v) || 0;

/**
 * [W-BAR] Klasifikasi periode: BAR/Ringkasan bulan N menampilkan posisi selisih
 * per AKHIR bulan N (prinsip cut-off / periodisasi — PSAP 1 & Permendagri 77/2020).
 *
 * - Item dengan perbaikan bank yang jatuh DI DALAM bulan N (awal s.d. akhir bulan N)
 *   → "ditutup" (seksi C.2), nilai = selisih ASLI dari resolved-map (baris induk bank).
 *   Item yang sudah ditutup di bulan SEBELUM N tidak diulang (monthly, bukan kumulatif).
 * - Perbaikan jatuh SESUDAH akhir bulan N → masih OUTSTANDING di bulan itu,
 *   nilai = selisih ASLI bila selisih_rekon sudah di-nol-kan koreksi basis LANGSUNG.
 * - Tanpa info penutupan → outstanding (nilai = selisih_rekon / nilai item).
 *
 * Dipakai bersama oleh: dashboard/rekon/discrepancy (BAR) & dashboard/rekon/ringkasan.
 */
export const classifyBarSelisih = (
  rows: any[],
  resolvedBySp2d: Record<string, any>,
  resolvedByPotongan: Record<string, any>,
  targetBulan: number,
  year: number
) => {
  const awalBulan = new Date(year, targetBulan - 1, 1, 0, 0, 0);
  const akhirBulan = new Date(year, targetBulan, 0, 23, 59, 59);
  const outstanding: any[] = [];
  const closed: any[] = [];
  for (const r of rows) {
    const isPotonganTipe = r.tipe === 'POTONGAN' || r.tipe === 'POTONGAN SP2D' || r.tipe === 'POTONGAN_BANK';
    const info = r.tipe === 'SP2D' ? resolvedBySp2d[r.id] : (isPotonganTipe ? resolvedByPotongan[r.id] : null);
    const perbaikanRaw = info?.perbaikanTanggal || info?.resolvedAt;
    const perbaikan = perbaikanRaw ? new Date(perbaikanRaw) : null;
    const base = {
      tipe: r.tipe,
      bukti: r.bukti,
      tanggal: r.tanggal ? format(new Date(r.tanggal), 'dd/MM/yyyy') : '-',
      keterangan: r.keterangan_rekon || r.uraian || 'Belum ada penjelasan',
      opd: r.opd || '',
    };
    // Ditutup HANYA pada bulan penutupannya (monthly): perbaikan bank jatuh DI DALAM
    // bulan target → seksi C.2. Perbaikan di bulan SEBELUM target sudah tampil di C.2
    // bulan tsb → dilewati (tidak kumulatif). Belum ditutup / ditutup setelah bulan
    // target (perbaikan > akhirBulan) → masih OUTSTANDING di bulan ini.
    if (perbaikan && perbaikan >= awalBulan && perbaikan <= akhirBulan) {
      closed.push({
        ...base,
        nilai: toN(info.selisihNilai ?? (r.selisih || r.nilai)),
        perbaikanTanggal: format(perbaikan, 'dd/MM/yyyy'),
        nomorSurat: info.nomorSurat || '-',
      });
    } else if (!perbaikan || perbaikan > akhirBulan) {
      outstanding.push({
        ...base,
        // Item yang selisihnya sudah di-nol-kan di header (koreksi basis LANGSUNG)
        // tetap menampilkan selisih ASLI dari resolved-map di bulan sebelum perbaikan.
        nilai: toN(r.selisih) !== 0 ? toN(r.selisih) : toN(info?.selisihNilai ?? r.nilai),
      });
    }
    // perbaikan < awalBulan (sudah ditutup di bulan sebelumnya) → dilewati di sesi ini.
  }
  return { outstanding, closed };
};
