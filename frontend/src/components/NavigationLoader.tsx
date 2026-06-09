'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { navEvents } from '@/lib/navEvents';

/**
 * Progress bar tipis di atas layar — muncul saat navigasi dimulai,
 * hilang saat pathname berubah. Tidak menutupi konten halaman.
 */
export function NavigationLoader() {
  const pathname  = usePathname();
  const prevRef   = useRef(pathname);
  const [active, setActive] = useState(false);

  useEffect(() => navEvents.on(() => setActive(true)), []);

  useEffect(() => {
    if (pathname !== prevRef.current) {
      prevRef.current = pathname;
      const id = setTimeout(() => setActive(false), 300);
      return () => clearTimeout(id);
    }
  }, [pathname]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="nav-bar"
          className="fixed top-0 left-0 right-0 z-[9999] h-[2px] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Bar utama yang bergerak maju */}
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              background: 'linear-gradient(90deg, #2E90FA, #12B76A)',
              boxShadow: '0 0 8px rgba(18,183,106,0.6)',
            }}
            initial={{ width: '0%', x: '0%' }}
            animate={{ width: ['0%', '85%', '92%'] }}
            transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
          />
          {/* Shimmer sweep */}
          <motion.div
            className="absolute inset-y-0 w-24 rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)',
            }}
            animate={{ x: ['-100px', '100vw'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
