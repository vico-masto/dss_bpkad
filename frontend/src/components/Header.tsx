'use client';
 
import { LogOut, User, Menu, Sun, Moon, Sparkles, ChevronDown, Database, Scale, ScrollText, Users, Settings, Monitor } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from './ConfirmDialog';
import { toast } from 'sonner';
import { TransitionLink as Link } from './TransitionLink';

export default function Header({ isCollapsed, setIsCollapsed }: { isCollapsed: boolean; setIsCollapsed: (v: boolean) => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAIVisible, setIsAIVisible] = useState(true);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

    // Click outside handler for profile dropdown
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
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
      {/* Left — Sleek Trigger */}
      <div className="flex items-center">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-9 h-9 flex items-center justify-center text-fin-text-muted hover:text-fin-text-primary hover:bg-fin-subtle/60 rounded-full transition-all duration-300 active:scale-95 cursor-pointer"
          title={isCollapsed ? "Tampilkan Menu" : "Sembunyikan Menu"}
        >
          <Menu size={16} className={cn("transition-transform duration-300", !isCollapsed && "rotate-90")} />
        </button>
      </div>

      {/* Middle — Static Info Bar */}
      <div className="hidden md:flex flex-1 max-w-[42%] mx-8 items-center gap-3 bg-fin-subtle/30 dark:bg-slate-900/40 border border-fin-border rounded-full px-4 py-1.5 backdrop-blur-md overflow-hidden">
        {/* Greeting */}
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles size={12} className="text-fin-info dark:text-fin-info-text shrink-0" />
          <span className="text-[10px] font-extrabold text-fin-info-text dark:text-fin-info uppercase tracking-wider whitespace-nowrap">
            {(() => {
              const hour = new Date().getHours();
              let g = "Malam";
              if (hour >= 4 && hour < 6) g = "Subuh";
              else if (hour >= 6 && hour < 11) g = "Pagi";
              else if (hour >= 11 && hour < 15) g = "Siang";
              else if (hour >= 15 && hour < 18) g = "Sore";
              const name = user?.username
                ? user.username.charAt(0).toUpperCase() + user.username.slice(1)
                : 'Administrator';
              return `Selamat ${g}, ${name}`;
            })()}
          </span>
        </div>

        <div className="h-3 w-px bg-fin-border shrink-0" />

        {/* System Status */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest whitespace-nowrap">
            Sistem Aktif
          </span>
        </div>

        <div className="h-3 w-px bg-fin-border shrink-0" />

        {/* Fiscal Year */}
        <span className="text-[10px] font-semibold text-fin-text-muted whitespace-nowrap truncate">
          TA {new Date().getFullYear()} · Rekonsiliasi Otomatis
        </span>
      </div>

      {/* Right — Minimalist Action Items */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleAI}
          className={cn(
            "w-9 h-9 flex items-center justify-center rounded-full transition-all duration-300 active:scale-95 cursor-pointer",
            isAIVisible ? "text-fin-info bg-fin-info/10 hover:bg-fin-info/20" : "text-fin-text-muted hover:bg-fin-subtle/60"
          )}
          title={isAIVisible ? "Matikan Asisten AI" : "Aktifkan Asisten AI"}
        >
          <Sparkles size={18} className={cn(isAIVisible && "animate-pulse")} />
        </button>

        {/* Unified Premium Profile Dropdown Pill */}
        <div className="relative" ref={dropdownRef}>
          <div
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="rounded-full bg-fin-subtle/50 hover:bg-fin-subtle border border-fin-border cursor-pointer select-none pl-1 pr-3 py-1 flex items-center gap-2 transition-all duration-300 active:scale-[0.98]"
          >
            {/* Avatar container with online dot */}
            <div className="relative">
              <div className="w-7 h-7 rounded-full bg-fin-page border border-fin-border flex items-center justify-center text-fin-text-secondary select-none">
                <User size={12} />
              </div>
              <div className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-fin-surface ring-1 ring-emerald-400/50 animate-pulse" />
            </div>

            {/* User Name */}
            <span className="text-[12px] font-bold text-fin-text-primary tracking-tight">
              {user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : 'Administrator'}
            </span>

            {/* Chevron icon */}
            <ChevronDown
              size={12}
              className={cn("text-fin-text-muted transition-transform duration-300", isDropdownOpen && "rotate-180")}
            />
          </div>

          {/* Floating Dropdown Card strictly matching visual specs */}
          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-[240px] bg-fin-surface border border-fin-border rounded-xl shadow-xl z-50 p-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
              
              {/* Dropdown Header Info */}
              <div className="flex items-center gap-2.5 px-2.5 py-2">
                <div className="w-8 h-8 rounded-full bg-fin-subtle flex items-center justify-center text-fin-text-primary border border-fin-border select-none">
                  <User size={14} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[12px] font-bold text-fin-text-primary truncate leading-none">
                    {user?.username ? user.username.charAt(0).toUpperCase() + user.username.slice(1) : 'Administrator'}
                  </span>
                  <span className="text-[10px] text-fin-text-muted mt-1 uppercase tracking-wider font-semibold">
                    {user?.role || 'Operator'}
                  </span>
                </div>
                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsDropdownOpen(false)}
                  className="ml-auto p-1 text-fin-text-muted hover:text-fin-text-primary hover:bg-fin-subtle rounded-lg transition-all"
                  title="Pengaturan Profil"
                >
                  <Settings size={14} />
                </Link>
              </div>

              {/* Separator */}
              <div className="h-px bg-fin-border my-1 mx-1" />

              {/* Administrator Module Menu List */}
              <div className="space-y-0.5">
                <Link
                  href="/dashboard/master-data"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-semibold text-fin-text-secondary hover:text-fin-text-primary hover:bg-fin-subtle/80 transition-all"
                >
                  <Database size={14} className="text-fin-text-muted" />
                  <span>Master Data (Referensi)</span>
                </Link>

                <Link
                  href="/dashboard/saldo-awal"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-semibold text-fin-text-secondary hover:text-fin-text-primary hover:bg-fin-subtle/80 transition-all"
                >
                  <Scale size={14} className="text-fin-text-muted" />
                  <span>Setup Saldo Awal</span>
                </Link>

                <Link
                  href="/dashboard/logs"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-semibold text-fin-text-secondary hover:text-fin-text-primary hover:bg-fin-subtle/80 transition-all"
                >
                  <ScrollText size={14} className="text-fin-text-muted" />
                  <span>Log Aktivitas</span>
                </Link>

                <Link
                  href="/dashboard/users"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-semibold text-fin-text-secondary hover:text-fin-text-primary hover:bg-fin-subtle/80 transition-all"
                >
                  <Users size={14} className="text-fin-text-muted" />
                  <span>Manajemen Akun</span>
                </Link>

                <Link
                  href="/dashboard/settings"
                  onClick={() => setIsDropdownOpen(false)}
                  className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-semibold text-fin-text-secondary hover:text-fin-text-primary hover:bg-fin-subtle/80 transition-all"
                >
                  <Settings size={14} className="text-fin-text-muted" />
                  <span>Profil & Pengaturan</span>
                </Link>
              </div>

              {/* Separator */}
              <div className="h-px bg-fin-border my-1 mx-1" />

              {/* Sign Out row with distinct red style matching mockup */}
              <button
                onClick={() => {
                  setIsDropdownOpen(false);
                  setShowLogoutConfirm(true);
                }}
                className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-[12px] font-bold text-fin-expense-text hover:bg-fin-expense-bg transition-all cursor-pointer"
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>

              {/* Separator */}
              <div className="h-px bg-fin-border my-1 mx-1" />

              {/* Theme Switcher Footer Segmented Control strictly matching mockup */}
              <div className="bg-fin-page p-0.5 rounded-lg flex items-center justify-between gap-0.5 border border-fin-border mx-1 mb-0.5 mt-1">
                <button
                  onClick={() => {
                    if (isDarkMode) toggleTheme();
                  }}
                  className={cn(
                    "flex-1 py-1.5 flex items-center justify-center rounded-md transition-all text-xs cursor-pointer",
                    !isDarkMode ? "bg-fin-surface text-amber-500 border border-fin-border shadow-sm" : "text-fin-text-muted hover:text-fin-text-primary"
                  )}
                  title="Mode Terang"
                >
                  <Sun size={13} />
                </button>
                <button
                  onClick={() => {
                    if (!isDarkMode) toggleTheme();
                  }}
                  className={cn(
                    "flex-1 py-1.5 flex items-center justify-center rounded-md transition-all text-xs cursor-pointer",
                    isDarkMode ? "bg-fin-surface text-indigo-400 border border-fin-border shadow-sm" : "text-fin-text-muted hover:text-fin-text-primary"
                  )}
                  title="Mode Gelap"
                >
                  <Moon size={13} />
                </button>
                <button
                  onClick={() => {
                    toast.info('Sistem mengikuti preferensi admin');
                  }}
                  className="flex-1 py-1.5 flex items-center justify-center rounded-md text-fin-text-muted hover:text-fin-text-primary transition-all text-xs cursor-pointer"
                  title="Preferensi Sistem"
                >
                  <Monitor size={13} />
                </button>
              </div>

            </div>
          )}
        </div>
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
