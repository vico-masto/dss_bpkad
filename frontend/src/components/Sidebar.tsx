'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  FilePlus,
  Wallet,
  BookOpen,
  Database,
  History,
  ShieldCheck,
  CreditCard,
  PlusSquare,
  LogOut,
  FileText,
  Activity,
  User,
  Settings,
  RefreshCw,
  Layers,
  Banknote,
  Scale,
  Building2,
  ShieldAlert,
  BarChart3,
  CalendarCheck,
  FileSpreadsheet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function Sidebar({ isCollapsed, setIsCollapsed }: { isCollapsed: boolean; setIsCollapsed: (v: boolean) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');
  
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) setUser(JSON.parse(userStr));
  }, []);

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => 
      prev.includes(group) ? prev.filter(g => g !== group) : [...prev, group]
    );
  };

  const sidebarVariants: any = {
    expanded: { 
      width: '240px',
      x: 0,
      opacity: 1,
      transition: { type: 'spring', stiffness: 300, damping: 30 }
    },
    collapsed: { 
      width: '0px',
      x: -240,
      opacity: 0,
      transition: { type: 'spring', stiffness: 300, damping: 30 }
    }
  };

  const menuStructure = [
    {
      title: 'Dashboard',
      icon: LayoutDashboard,
      dotColor: 'bg-[#2E90FA]',
      items: []
    },
    {
      title: 'Analisa',
      icon: Activity,
      dotColor: 'bg-[#6941C6]',
      items: [
        { name: 'Simulator Kas Cerdas', href: '/dashboard/simulator', icon: Activity },
      ]
    },
    {
      title: 'Transaksi Kas Masuk',
      icon: Wallet,
      dotColor: 'bg-[#12B76A]',
      items: [
        { name: 'Perekaman Kas Masuk', href: '/pendapatan?tab=rekam', icon: PlusSquare },
        { name: 'Arsip Kas Masuk', href: '/pendapatan?tab=arsip', icon: FileText },
      ]
    },
    {
      title: 'Transaksi Kas Keluar',
      icon: CreditCard,
      dotColor: 'bg-[#F04438]',
      items: [
        { name: 'Perekaman SP2D', href: '/dashboard/sp2d?tab=rekam', icon: PlusSquare },
        { name: 'Arsip Kas Keluar', href: '/dashboard/sp2d?tab=arsip', icon: FileText },
        { name: 'Kelengkapan Pencairan', href: '/dashboard/sp2d/kelengkapan', icon: CalendarCheck },
      ]
    },
    {
      title: 'Manajemen Potongan',
      icon: ShieldCheck,
      dotColor: 'bg-[#F79009]',
      items: [
        { name: 'Rekam Potongan', href: '/dashboard/pajak?tab=rekam', icon: PlusSquare },
        { name: 'Arsip & Monitoring', href: '/dashboard/pajak?tab=arsip', icon: ShieldCheck },
        { name: 'Realisasi Potongan OPD', href: '/dashboard/ledgers/potongan-opd', icon: FileSpreadsheet },
      ]
    },
    {
      title: 'Rekonsiliasi Bank',
      icon: RefreshCw,
      dotColor: 'bg-ds-primary',
      items: [
        { name: 'Manajemen Rekening Koran', href: '/dashboard/rekon/bank', icon: Database },
        { name: 'Rekonsiliasi Cerdas', href: '/dashboard/rekon', icon: RefreshCw },
        { name: 'Laporan Selisih', href: '/dashboard/rekon/discrepancy', icon: BarChart3 },
        { name: 'Integritas Data', href: '/dashboard/rekon/anomalies', icon: ShieldAlert },
      ]
    },
    {
      title: 'Laporan',
      icon: BookOpen,
      dotColor: 'bg-[#2E90FA]',
      items: [
        { name: 'Buku Kas Umum', href: '/dashboard/bku', icon: BookOpen },
        { name: 'Buku Besar / Jurnal', href: '/dashboard/jurnal', icon: History },
        { name: 'Jurnal Talangan', href: '/dashboard/talangan', icon: Layers },
        { name: 'Penyesuaian & Koreksi', href: '/dashboard/penyesuaian', icon: History },
      ]
    },
    {
      title: 'Buku Pembantu',
      icon: Layers,
      dotColor: 'bg-ds-primary',
      items: [
        { name: 'BP Bank (Rekening)', href: '/dashboard/ledgers/bank', icon: Banknote },
        { name: 'BP Potongan (Pajak/IWP)', href: '/dashboard/ledgers/pajak', icon: Scale },
        { name: 'BP Unit Kerja (OPD)', href: '/dashboard/ledgers/opd', icon: Building2 },
      ]
    },
    {
      title: 'Administrator',
      icon: Settings,
      dotColor: 'bg-fin-text-muted',
      items: [
        { name: 'Master Data (Referensi)', href: '/dashboard/master-data', icon: Database },
        { name: 'Setup Saldo Awal', href: '/dashboard/saldo-awal', icon: Database },
        { name: 'Log Aktivitas', href: '/dashboard/logs', icon: ShieldCheck },
        { name: 'Manajemen Akun', href: '/dashboard/users', icon: User },
        { name: 'Profil & Pengaturan', href: '/dashboard/settings', icon: Settings },
      ]
    }
  ];

  const filteredMenuStructure = menuStructure.map(group => {
    if (user?.role === 'Operator SP2D' && group.title === 'Transaksi Kas Keluar') {
      return {
        ...group,
        items: group.items.filter(item => item.name !== 'Kelengkapan Pencairan')
      };
    }
    return group;
  }).filter(group => {
    if (!user) return true; // Tampilkan semua saat memuat data profil awal
    
    const role = user.role;
    
    // Admin dapat melihat seluruh menu
    if (role === 'admin') return true;
    
    // Operator Penerimaan hanya melihat Transaksi Kas Masuk
    if (role === 'Operator Penerimaan') {
      return group.title === 'Transaksi Kas Masuk';
    }
    
    // Operator SP2D hanya melihat Transaksi Kas Keluar
    if (role === 'Operator SP2D') {
      return group.title === 'Transaksi Kas Keluar';
    }
    
    // Default untuk peran lainnya
    return true;
  });

  return (
    <motion.aside 
      id="sidebar" 
      initial={false}
      animate={isCollapsed ? "collapsed" : "expanded"}
      variants={sidebarVariants}
      className="bg-fin-surface border-r border-fin-border h-screen sticky top-0 flex flex-col shrink-0 z-40 overflow-hidden shadow-xl"
    >
      {/* Institution Branding */}
      <div className="h-20 flex items-center px-5 border-b border-fin-border bg-fin-page/30 dark:bg-slate-950/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-fin-text-primary dark:bg-ds-primary rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/10 transition-transform hover:scale-105">
            <Activity size={20} className="text-white dark:text-indigo-50" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-fin-text-primary tracking-tight leading-none">DSS BPKAD</h1>
            <p className="text-xs text-fin-text-secondary mt-1.5 font-medium leading-none">Kab. Kepulauan Aru</p>
          </div>
        </div>
      </div>

      {/* Year Badge */}
      <div className="px-5 py-4 border-b border-fin-border">
        <div className="flex items-center gap-2.5 px-3 py-2 bg-fin-subtle dark:bg-slate-900/50 rounded-xl border border-fin-border shadow-sm">
          <div className="w-2 h-2 bg-fin-income rounded-full shadow-[0_0_8px_var(--fin-income)]" />
          <span className="text-xs font-semibold text-fin-text-secondary">Tahun Anggaran {new Date().getFullYear()}</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-hide">
        {filteredMenuStructure.map((group) => (
          <div key={group.title} className="mb-1">
            <div className="mx-3 h-px bg-fin-subtle mb-1 mt-2 first:hidden" />
            
            {group.title === 'Dashboard' ? (
              <Link 
                href="/dashboard"
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 mt-1 text-xs font-bold transition-all rounded-lg group/header",
                  pathname === '/dashboard' && !currentTab ? "bg-fin-subtle dark:bg-indigo-900/20 text-fin-text-primary" : "text-fin-text-primary hover:bg-fin-page"
                )}
              >
                <div className="flex items-center gap-3">
                   <div className={cn(
                     "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                     pathname === '/dashboard' && !currentTab ? "bg-fin-surface border border-fin-border shadow-sm" : "bg-transparent"
                   )}>
                      <group.icon size={14} className={cn("transition-colors", pathname === '/dashboard' && !currentTab ? "text-fin-text-primary" : "text-fin-text-muted group-hover/header:text-fin-text-secondary")} />
                   </div>
                   <span className="text-[13px] font-bold">{group.title}</span>
                </div>
              </Link>
            ) : (
              <>
                <button 
                  onClick={() => toggleGroup(group.title)}
                  className="w-full flex items-center justify-between px-3 py-2 mt-1 text-xs font-bold text-fin-text-primary hover:bg-fin-page transition-all rounded-lg group/header"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                      openGroups.includes(group.title) ? "bg-fin-subtle border border-fin-border shadow-sm" : "bg-transparent"
                    )}>
                        <group.icon size={14} className={cn("transition-colors", openGroups.includes(group.title) ? "text-fin-text-primary" : "text-fin-text-muted group-hover/header:text-fin-text-secondary")} />
                    </div>
                    <span className="text-[13px] font-bold text-fin-text-primary">{group.title}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {openGroups.includes(group.title) ? <ChevronDown size={14} className="text-fin-text-muted" /> : <ChevronRight size={14} className="text-fin-text-muted" />}
                  </div>
                </button>

                <AnimatePresence>
                  {openGroups.includes(group.title) && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden space-y-0 mt-0"
                    >
                      {group.items.map((item) => {
                        const url = new URL(item.href, 'http://localhost');
                        const itemPath = url.pathname;
                        const itemTab = url.searchParams.get('tab');
                        
                        const isPathMatch = pathname === itemPath;
                        const isTabMatch = currentTab === itemTab;
                        
                        // Active if path matches AND (no tab requested OR tab matches)
                        const isActive = isPathMatch && (itemTab ? isTabMatch : !currentTab);
                        
                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                              "flex items-center pl-11 pr-3 py-1.5 rounded-lg transition-colors text-[12px] relative",
                              isActive 
                                ? "bg-fin-subtle dark:bg-indigo-900/10 text-fin-text-primary font-medium" 
                                : "text-fin-text-secondary hover:bg-fin-page hover:text-fin-text-primary"
                            )}
                          >
                            {isActive && (
                              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-[2px] h-3 bg-fin-text-primary dark:bg-amber-400 rounded-r-full" />
                            )}
                            <item.icon size={14} className={cn("mr-3 flex-shrink-0", isActive ? "text-fin-text-primary" : "text-fin-text-muted")} />
                            <span className="truncate">{item.name}</span>
                          </Link>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        ))}
      </nav>


      {/* Creator Info */}
      <div className="px-4 py-3 bg-fin-page/50 border-t border-fin-border flex items-center justify-between">
        <div className="flex flex-col">
           <p className="text-[10px] font-bold text-fin-text-secondary">© Vico Masbaitubun</p>
           <p className="text-[10px] text-fin-text-muted mt-0.5">DSS BPKAD</p>
        </div>
        <div className="flex items-center gap-1.5">
           <div className="w-1.5 h-1.5 bg-[#2E90FA] rounded-full animate-pulse" />
        </div>
      </div>
    </motion.aside>
  );
}
