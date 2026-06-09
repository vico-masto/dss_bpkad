'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ─── Tipe Props ───────────────────────────────────────────────────────────────
interface ProgressCardProps {
  /** Nilai saat ini (0 – total) */
  current: number;
  /** Nilai maksimum */
  total: number;
  /** Judul utama kartu */
  title?: string;
  /** Deskripsi singkat di bawah judul */
  subtitle?: string;
  /**
   * Daftar pesan status yang ditampilkan bergantian.
   * Default: pesan generik proses data.
   */
  statusMessages?: string[];
  /** Label kiri bawah (mis. "Pair diproses") */
  leftLabel?: string;
  /** Konten kustom untuk slot kanan bawah */
  rightContent?: React.ReactNode;
  /** Warna tema — 'emerald' | 'blue' | 'violet' */
  color?: 'emerald' | 'blue' | 'violet';
}

// ─── Konfigurasi warna ────────────────────────────────────────────────────────
const COLOR = {
  emerald: {
    bar:     'from-emerald-600 via-teal-400 to-emerald-400',
    glow:    'shadow-[0_0_14px_rgba(16,185,129,0.55)]',
    shimmer: 'via-emerald-300/30',
    text:    'text-emerald-400',
    seg:     'border-emerald-500/30',
    dot:     'bg-emerald-400',
  },
  blue: {
    bar:     'from-blue-700 via-sky-400 to-blue-400',
    glow:    'shadow-[0_0_14px_rgba(59,130,246,0.55)]',
    shimmer: 'via-sky-300/30',
    text:    'text-sky-400',
    seg:     'border-sky-500/30',
    dot:     'bg-sky-400',
  },
  violet: {
    bar:     'from-violet-700 via-purple-400 to-violet-400',
    glow:    'shadow-[0_0_14px_rgba(139,92,246,0.55)]',
    shimmer: 'via-purple-300/30',
    text:    'text-violet-400',
    seg:     'border-violet-500/30',
    dot:     'bg-violet-400',
  },
} as const;

const DEFAULT_MESSAGES = [
  'Memverifikasi integritas data...',
  'Mencocokkan transaksi BKU...',
  'Memproses pasangan rekonsiliasi...',
  'Menganalisis selisih nilai...',
  'Mengindeks referensi silang...',
  'Memvalidasi nomor SP2D...',
  'Menyinkronkan mutasi bank...',
];

// Fragment data pendek yang bergulir — memberi ilusi sistem aktif memproses data
const FRAGMENTS = [
  'SP2D-082', 'IWP-8%', 'PPN-11', '4.01.2', 'NETO', 'BKU',
  'PPh21', 'SUDAH', 'BELUM', 'IDR', 'REF', 'REKON',
  '000027', 'LS/4.02', 'BRUTO', '8991549', 'MATCH',
];

function useElapsed(active: boolean) {
  const [elapsed, setElapsed] = useState(0);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (active) {
      setElapsed(0);
      ref.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [active]);
  const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const s = (elapsed % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Komponen utama ───────────────────────────────────────────────────────────
export function ProgressCard({
  current,
  total,
  title = 'Memproses Data',
  subtitle = 'Harap tunggu sebentar...',
  statusMessages = DEFAULT_MESSAGES,
  leftLabel = 'Diproses',
  rightContent,
  color = 'emerald',
}: ProgressCardProps) {
  const pct = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;
  const c   = COLOR[color];

  // ── Status message yang bergantian ──
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx(i => (i + 1) % statusMessages.length);
    }, 2200);
    return () => clearInterval(id);
  }, [statusMessages.length]);

  // ── Fragment data bergulir ──
  const [fragIdx, setFragIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setFragIdx(i => (i + 1) % FRAGMENTS.length);
    }, 180);
    return () => clearInterval(id);
  }, []);

  // ── Timer ──
  const elapsed = useElapsed(total > 0);

  // ── Segmen bar (12 segmen) ──
  const SEGS = 12;
  const filledSegs = Math.round((pct / 100) * SEGS);

  return (
    <div className="w-full max-w-sm mx-auto bg-[#0d1117] border border-white/10 rounded-2xl p-5 shadow-2xl space-y-4 select-none">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className={`text-[10px] font-black uppercase tracking-[0.18em] ${c.text}`}>
            {title}
          </p>
          {/* Status message bergantian */}
          <div className="h-4 overflow-hidden mt-0.5">
            <AnimatePresence mode="wait">
              <motion.p
                key={msgIdx}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="text-[10px] text-white/50 truncate"
              >
                {statusMessages[msgIdx]}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        {/* ── Persentase ── */}
        <div className="shrink-0 text-right">
          <AnimatePresence mode="wait">
            <motion.span
              key={pct}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className={`text-2xl font-black tabular-nums ${c.text}`}
            >
              {pct}
            </motion.span>
          </AnimatePresence>
          <span className="text-[10px] text-white/30 font-bold">%</span>
        </div>
      </div>

      {/* ── Progress bar tersegmentasi ── */}
      <div className="space-y-1.5">
        {/* Track dengan segmen */}
        <div className="flex gap-[3px]">
          {Array.from({ length: SEGS }).map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-[5px] rounded-full transition-all duration-300 border ${
                i < filledSegs
                  ? `bg-gradient-to-r ${c.bar} ${c.glow} border-transparent`
                  : `bg-white/5 ${c.seg}`
              }`}
            />
          ))}
        </div>

        {/* Shimmer bar di bawah segmen (ilusi proses aktif) */}
        <div className="h-[2px] w-full bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className={`h-full w-1/3 bg-gradient-to-r from-transparent ${c.shimmer} to-transparent rounded-full`}
            animate={{ x: ['−100%', '400%'] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>
      </div>

      {/* ── Data stream (fragment bergulir) ── */}
      <div className="flex items-center gap-2 overflow-hidden h-4">
        <span className="text-[9px] text-white/20 font-mono uppercase shrink-0">stream</span>
        <div className="flex-1 flex gap-1.5 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <AnimatePresence key={i} mode="wait">
              <motion.span
                key={`${fragIdx}-${i}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 0.3 + i * 0.1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, delay: i * 0.04 }}
                className="text-[9px] font-mono text-white/40 shrink-0"
              >
                {FRAGMENTS[(fragIdx + i) % FRAGMENTS.length]}
              </motion.span>
            </AnimatePresence>
          ))}
        </div>
        {/* Dot indikator proses aktif */}
        <div className="flex gap-1 shrink-0">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className={`w-1 h-1 rounded-full ${c.dot}`}
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 1, delay: i * 0.33, repeat: Infinity }}
            />
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="flex items-center justify-between pt-1 border-t border-white/5">
        <div>
          <p className="text-[8px] text-white/30 uppercase tracking-widest">{leftLabel}</p>
          <p className="text-[11px] font-black text-white/70 tabular-nums">
            {current} <span className="text-white/30">/ {total}</span>
          </p>
        </div>

        {rightContent ?? (
          <div className="text-right">
            <p className="text-[8px] text-white/30 uppercase tracking-widest">Elapsed</p>
            <p className="text-[11px] font-mono font-black text-white/50 tabular-nums">
              {elapsed}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
