'use client';

import { motion } from 'framer-motion';
import { ShieldCheck, Sparkles } from 'lucide-react';

export default function JoyfulLoader({ size = 'md', text = 'Memproses Data...' }: { size?: 'sm' | 'md' | 'lg', text?: string }) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-14 h-14',
    lg: 'w-24 h-24'
  };

  const iconSizes = {
    sm: 14,
    md: 24,
    lg: 40
  };

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className={`relative ${sizeClasses[size]} flex items-center justify-center`}>
        {/* Animated Outer Halo (The Happiness Pulse) */}
        <motion.div
          animate={{ 
            scale: [1, 1.4, 1],
            opacity: [0.3, 0.1, 0.3],
          }}
          transition={{ 
            duration: 1.5, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          className="absolute inset-0 bg-indigo-500 rounded-full blur-xl"
        />

        {/* The Professional Data Processor */}
        <motion.div
          animate={{ 
            y: [0, -12, 0],
            rotate: [0, 5, -5, 0],
            scale: [1, 1.05, 0.95, 1]
          }}
          transition={{ 
            duration: 1.2, 
            repeat: Infinity, 
            ease: "easeInOut" 
          }}
          className="relative z-10 w-full h-full bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] rounded-xl shadow-2xl shadow-slate-900/20 flex items-center justify-center border-2 border-white/10"
        >
          {/* Subtle Sparkle Icons */}
          <motion.div
            animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
            transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
            className="absolute -top-1 -right-1 text-blue-400"
          >
            <Sparkles size={iconSizes[size] / 2} />
          </motion.div>

          {/* Central Security/Finance Icon */}
          <ShieldCheck size={iconSizes[size]} className="text-blue-400" />
        </motion.div>

        {/* Professional Data Pulses */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ 
              x: [0, i % 2 === 0 ? 30 : -30], 
              y: [0, i < 2 ? 30 : -30],
              opacity: [1, 0],
              scale: [1, 0]
            }}
            transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.3 }}
            className="absolute w-1 h-1 bg-blue-500 rounded-full blur-[0.5px]"
          />
        ))}
      </div>

      {text && (
        <motion.p 
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-[11px] font-black text-slate-500 uppercase tracking-[0.3em] ml-1"
        >
          {text}
        </motion.p>
      )}
    </div>
  );
}
