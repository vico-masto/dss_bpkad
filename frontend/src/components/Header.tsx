'use client';

import { Bell, LogOut, Search, User, Menu, PanelLeftClose, PanelLeft, Sun, Moon, Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from 'sonner';

export default function Header({ isCollapsed, setIsCollapsed }: { isCollapsed: boolean; setIsCollapsed: (v: boolean) => void }) {
  const [user, setUser] = useState<any>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAIVisible, setIsAIVisible] = useState(true);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) setUser(JSON.parse(userStr));

    // Theme logic
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
    
    // AI Visibility logic
    const savedAI = localStorage.getItem('ai_visible');
    if (savedAI === 'false') {
      setIsAIVisible(false);
    }
  }, []);

  const toggleTheme = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
      toast.success('Midnight Audit Mode Aktif');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
      toast.info('Normal Mode Aktif');
    }
  };

  const toggleAI = () => {
    const nextState = !isAIVisible;
    setIsAIVisible(nextState);
    localStorage.setItem('ai_visible', String(nextState));
    window.dispatchEvent(new Event('ai-visibility-change'));
    if (nextState) {
      toast.success('Asisten Bro Jenius Aktif');
    } else {
      toast.info('Asisten Bro Jenius Dinonaktifkan');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  return (
    <header className="h-14 bg-fin-surface border-b border-fin-border flex items-center justify-between px-6 shrink-0 z-40 sticky top-0">
      {/* Left */}
      <div className="flex items-center gap-3">
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 text-fin-text-muted hover:text-fin-text-secondary hover:bg-fin-page rounded-lg transition-colors"
          title={isCollapsed ? "Tampilkan Sidebar" : "Sembunyikan Sidebar"}
        >
          {isCollapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <div className="h-5 w-px bg-fin-border" />
        <div>
          <p className="text-sm font-medium text-fin-text-primary leading-none">Portal Eksekutif</p>
          <p className="text-[11px] text-fin-text-muted mt-0.5">BPKAD Kab. Kepulauan Aru</p>
        </div>
      </div>

      {/* Middle - Global Marquee */}
      <div className="hidden md:flex flex-1 max-w-[40%] mx-8 overflow-hidden bg-indigo-950/20 border border-indigo-500/10 rounded-full px-4 py-1 backdrop-blur-sm relative group hover:border-indigo-500/30 transition-all duration-500">
         <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-transparent to-indigo-500/5 pointer-events-none"></div>
         <div className="animate-marquee whitespace-nowrap flex items-center gap-10">
            <div className="flex items-center gap-2">
               <Sparkles size={12} className="text-indigo-400 animate-pulse" />
               <span className="text-[10px] font-black text-indigo-400 uppercase tracking-tighter">
                  {(() => {
                     const hour = new Date().getHours();
                     let g = "Malam";
                     if (hour >= 4 && hour < 6) g = "Subuh";
                     else if (hour >= 6 && hour < 11) g = "Pagi";
                     else if (hour >= 11 && hour < 15) g = "Siang";
                     else if (hour >= 15 && hour < 18) g = "Sore";
                     return `Selamat ${g}, Pak ViGIt MaSrah!`;
                  })()} 
               </span>
               <span className="text-[10px] font-bold text-fin-text-muted/80 ml-2">
                  — Bro Jenius Neural Matcher: Active & Monitoring Aru RKUD.
               </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500/80 uppercase tracking-widest">
               <div className="w-1 h-1 rounded-full bg-emerald-500 animate-ping"></div>
               Security Level: High • Dashboard Integritas 2026
            </div>
         </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-fin-income-bg rounded-full">
           <div className="w-1.5 h-1.5 bg-fin-income rounded-full animate-pulse"></div>
           <span className="text-[11px] font-medium text-fin-income-text">Online</span>
        </div>

        <div className="h-5 w-px bg-fin-border" />

        <button 
          type="button"
          onClick={(e) => {
            e.preventDefault();
            toggleTheme();
          }}
          className="p-2 text-fin-text-muted hover:text-indigo-600 dark:hover:text-amber-400 hover:bg-fin-page rounded-xl transition-all relative z-[100] cursor-pointer"
          title={isDarkMode ? "Aktifkan Mode Terang" : "Aktifkan Mode Malam"}
        >
          {isDarkMode ? <Sun size={20} className="animate-in spin-in-180 duration-500" /> : <Moon size={20} className="animate-in spin-in-180 duration-500" />}
        </button>

        <div className="h-5 w-px bg-fin-border" />

        <button 
          type="button"
          onClick={toggleAI}
          className={cn(
            "p-2 rounded-xl transition-all relative z-[100] cursor-pointer",
            isAIVisible ? "text-fin-info bg-fin-info/10" : "text-fin-text-muted hover:bg-fin-page"
          )}
          title={isAIVisible ? "Matikan Asisten AI" : "Aktifkan Asisten AI"}
        >
          <Sparkles size={20} className={cn(isAIVisible && "animate-pulse")} />
        </button>

        <div className="h-5 w-px bg-fin-border" />

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[13px] font-medium text-fin-text-primary">
              {user?.username || 'Administrator'}
            </p>
            <p className="text-[11px] text-fin-text-muted">
              {user?.role || 'Operator'}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-fin-subtle border border-fin-border flex items-center justify-center text-fin-text-secondary">
            <User size={14} />
          </div>
        </div>

        <button 
          onClick={() => setShowLogoutConfirm(true)}
          className="p-1.5 text-fin-text-muted hover:text-fin-expense-text hover:bg-fin-expense-bg rounded-lg transition-colors"
          title="Keluar"
        >
          <LogOut size={16} />
        </button>
      </div>

      <ConfirmDialog 
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Konfirmasi Logout"
        message="Apakah Anda yakin ingin keluar dari sistem? Sesi Anda akan diakhiri."
        confirmText="Ya, Keluar"
        cancelText="Batal"
        type="danger"
      />
    </header>
  );
}
