'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

// ─── Props ────────────────────────────────────────────────────────────────────
interface LoadingScreenProps {
  message?: string;
  variant?: 'full' | 'inline';
}

// ─── Status messages ──────────────────────────────────────────────────────────
const STATUS_MESSAGES = [
  'Memuat data keuangan…',
  'Menginisialisasi modul rekonsiliasi…',
  'Menyinkronkan mutasi bank…',
  'Memverifikasi integritas data…',
  'Mengindeks referensi SP2D…',
  'Menghubungkan ke sistem BPKAD…',
];

// ─── Komponen utama ───────────────────────────────────────────────────────────
export default function LoadingScreen({
  message,
  variant = 'full',
}: LoadingScreenProps) {
  const [msgIdx, setMsgIdx] = useState(0);

  // Cycling status messages
  useEffect(() => {
    const id = setInterval(() => {
      setMsgIdx(i => (i + 1) % STATUS_MESSAGES.length);
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const displayMessage = message ?? STATUS_MESSAGES[msgIdx];

  const inner = (
    <div className="relative flex flex-col items-center justify-center w-full h-full overflow-hidden">

      {/* ── Background map texture ── */}
      <div className="absolute inset-0 pointer-events-none select-none flex items-end justify-end overflow-hidden">
        <Image
          src="/aru-map-minimalist-nodot.png"
          alt=""
          width={520}
          height={520}
          className="opacity-[0.04] blur-sm object-contain translate-x-1/4 translate-y-1/4"
          priority
        />
      </div>

      {/* ── Ambient glow orbs ── */}
      <div
        className="absolute -top-32 -left-32 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(46,144,250,0.12) 0%, transparent 70%)',
          filter: 'blur(60px)',
        }}
      />
      <div
        className="absolute top-1/3 -right-24 w-80 h-80 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(18,183,106,0.10) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />
      <div
        className="absolute -bottom-20 left-1/3 w-72 h-72 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.09) 0%, transparent 70%)',
          filter: 'blur(55px)',
        }}
      />

      {/* ── Center card ── */}
      <div
        className="relative z-10 flex flex-col items-center gap-5 px-10 py-8 rounded-2xl border border-white/10"
        style={{
          background: 'rgba(17,24,39,0.55)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          minWidth: '260px',
        }}
      >
        {/* Logo with pulsing ring */}
        <div className="relative flex items-center justify-center">
          {/* Outer pulsing ring */}
          <motion.div
            className="absolute rounded-full border border-emerald-500/40"
            style={{ width: 72, height: 72 }}
            animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          {/* Inner pulsing ring */}
          <motion.div
            className="absolute rounded-full border border-blue-400/30"
            style={{ width: 60, height: 60 }}
            animate={{ scale: [1, 1.12, 1], opacity: [0.4, 0, 0.4] }}
            transition={{ duration: 2.4, delay: 0.6, repeat: Infinity, ease: 'easeInOut' }}
          />
          <Image
            src="/logo-aru.png"
            alt="Logo DSS BPKAD"
            width={48}
            height={48}
            className="relative z-10 object-contain drop-shadow-lg"
            priority
          />
        </div>

        {/* Identity */}
        <div className="flex flex-col items-center gap-0.5 text-center">
          <p className="text-base font-black tracking-[0.12em] text-white uppercase">
            DSS BPKAD
          </p>
          <p className="text-[11px] text-white/45 tracking-wider">
            Kab. Kepulauan Aru
          </p>
        </div>

        {/* Divider */}
        <div className="w-full border-t border-white/10" />

        {/* Status message cycling */}
        <div className="h-4 overflow-hidden w-full text-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={message ? 'static' : msgIdx}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="text-[11px] text-white/40 truncate"
            >
              {displayMessage}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* 4-dot sequential loader */}
        <div className="flex items-center gap-2">
          {[0, 1, 2, 3].map(i => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full"
              style={{
                background: i % 2 === 0 ? '#2E90FA' : '#12B76A',
              }}
              animate={{
                opacity: [0.2, 1, 0.2],
                scale: [0.8, 1.3, 0.8],
              }}
              transition={{
                duration: 1.2,
                delay: i * 0.18,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div>
      </div>

      {/* ── Bottom shimmer bar ── */}
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/5 overflow-hidden">
        <motion.div
          className="h-full w-1/3 rounded-full"
          style={{
            background: 'linear-gradient(90deg, transparent, #12B76A55, #2E90FA55, transparent)',
          }}
          animate={{ x: ['-100%', '400%'] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
    </div>
  );

  if (variant === 'inline') {
    return (
      <div className="relative w-full flex items-center justify-center" style={{ minHeight: '320px' }}>
        {inner}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: '#090D18' }}
    >
      {inner}
    </div>
  );
}
