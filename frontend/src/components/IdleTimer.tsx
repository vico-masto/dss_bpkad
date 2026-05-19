'use client';

import { useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';

const IDLE_TIMEOUT = 30 * 60 * 1000; // Permanen: 30 Menit

export default function IdleTimer() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleLogout = useCallback(() => {
    // Membersihkan data sesi
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    
    // Memberikan informasi kepada user
    toast.info('Sesi berakhir', {
      description: 'Anda telah otomatis logout karena tidak ada aktivitas selama 30 menit.',
      duration: 10000,
    });

    // Pengalihan ke halaman login
    setTimeout(() => {
      window.location.href = '/login';
    }, 1000);
  }, []);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    // Jika tidak ada token (sudah logout), jangan jalankan timer
    if (!localStorage.getItem('token')) return;

    // Set timeout untuk logout otomatis
    timeoutRef.current = setTimeout(handleLogout, IDLE_TIMEOUT);
  }, [handleLogout]);

  useEffect(() => {
    // Kejadian yang dianggap sebagai aktivitas user - Ditambah click dan focus
    const events = [
      'mousedown', 
      'mousemove', 
      'keypress', 
      'scroll', 
      'touchstart',
      'click',
      'focus'
    ];

    // Inisialisasi timer pertama kali
    resetTimer();

    // Tambahkan event listener untuk setiap aktivitas
    const handleActivity = () => {
      resetTimer();
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity);
    });

    // Cleanup saat komponen unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimer]);

  return null; // Komponen ini tidak merender UI apa pun
}
