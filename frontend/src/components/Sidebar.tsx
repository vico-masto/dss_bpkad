'use client';

import { useState, useEffect } from 'react';
import { TransitionLink as Link } from './TransitionLink';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  LayoutDashboard,
  Wallet,
  BookOpen,
  Database,
  History,
  ShieldCheck,
  CreditCard,
  PlusSquare,
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
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function Sidebar({ isCollapsed, setIsCollapsed }: { isCollapsed: boolean; setIsCollapsed: (v: boolean) => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get('tab');
  
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userStr) setUser(JSON.parse(userStr));
  }, []);

  // Auto-expand sidebar group that contains the active page
  useEffect(() => {
    const menuStructureLocal = [
      { title: 'Dashboard', items: [] as { href: string }[] },
      { title: 'Analisa', items: [
        { href: '/dashboard/simulator' }, { href: '/dashboard/analisa/belanja-opd' }
      ]},
      { title: 'Transaksi Kas Masuk', items: [
        { href: '/pendapatan?tab=rekam' }, { href: '/pendapatan?tab=arsip' }
      ]},
      { title: 'Transaksi Kas Keluar', items: [
        { href: '/dashboard/sp2d?tab=rekam' }, { href: '/dashboard/sp2d?tab=arsip' }, { href: '/dashboard/sp2d/kelengkapan' }
      ]},
      { title: 'Manajemen Potongan', items: [
        { href: '/dashboard/pajak?tab=rekam' }, { href: '/dashboard/pajak?tab=arsip' }, { href: '/dashboard/ledgers/potongan-opd' }
      ]},
      { title: 'Rekonsiliasi Bank', items: [
        { href: '/dashboard/rekon/bank' }, { href: '/dashboard/rekon' }, { href: '/dashboard/rekon/discrepancy' }, { href: '/dashboard/rekon/anomalies' }
      ]},
      { title: 'Laporan', items: [
        { href: '/dashboard/bku' }, { href: '/dashboard/jurnal' }, { href: '/dashboard/talangan' }, { href: '/dashboard/penyesuaian' }
      ]},
      { title: 'Buku Pembantu', items: [
        { href: '/dashboard/ledgers/bank' }, { href: '/dashboard/ledgers/pajak' }, { href: '/dashboard/ledgers/opd' }
      ]},
      { title: 'Administrator', items: [
        { href: '/dashboard/master-data' }, { href: '/dashboard/saldo-awal' }, { href: '/dashboard/logs' }, { href: '/dashboard/users' }, { href: '/dashboard/settings' }
      ]},
    ];

    const activeGroup = menuStructureLocal.find(group =>
      group.items.some(item => {
        const url = new URL(item.href, 'http://localhost');
        return pathname.startsWith(url.pathname);
      })
    );
    if (activeGroup && !openGroups.includes(activeGroup.title)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenGroups([activeGroup.title]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = (group: string) => {
    setOpenGroups(prev => 
      prev.includes(group) ? [] : [group]
    );
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        { name: 'Analisis Belanja OPD', href: '/dashboard/analisa/belanja-opd', icon: BarChart3 },
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
        { name: 'Rekening Bank', href: '/dashboard/rekon/bank', icon: Database },
        { name: 'Rekonsiliasi Cerdas', href: '/dashboard/rekon', icon: RefreshCw },
        { name: 'Laporan Selisih', href: '/dashboard/rekon/discrepancy', icon: BarChart3 },
        { name: 'Potongan Mengendap', href: '/dashboard/rekon/potongan-mengendap', icon: FileText },
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
    
    // Hide 'Administrator' group completely from sidebar as it is now in the Profile dropdown
    if (group.title === 'Administrator') return false;

    // Admin dapat melihat seluruh menu lainnya
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

  // Auto expand groups when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const groupsToOpen = filteredMenuStructure
        .filter(group => 
          group.items.some(item => item.name.toLowerCase().includes(query)) ||
          group.title.toLowerCase().includes(query)
        )
        .map(group => group.title);
      setOpenGroups(prev => [...new Set([...prev, ...groupsToOpen])]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const displayedMenuStructure = filteredMenuStructure.map(group => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchedItems = group.items.filter(item => 
        item.name.toLowerCase().includes(query)
      );
      
      // If group title matches, keep all its items, otherwise keep only matched items
      const itemsToKeep = group.title.toLowerCase().includes(query) 
        ? group.items 
        : matchedItems;

      return {
        ...group,
        items: itemsToKeep
      };
    }
    return group;
  }).filter(group => {
    if (!searchQuery.trim()) return true;
    
    const query = searchQuery.toLowerCase();
    const titleMatches = group.title.toLowerCase().includes(query);
    const hasMatchingItems = group.items.length > 0;
    
    return titleMatches || hasMatchingItems;
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
      <div className="h-14 flex items-center px-5 border-b border-fin-border bg-fin-page/30 dark:bg-slate-950/20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-fin-text-primary dark:bg-ds-primary rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/10 transition-transform hover:scale-105">
            <Activity size={16} className="text-white dark:text-indigo-50" />
          </div>
          <div>
            <h1 className="text-[14px] font-bold text-fin-text-primary tracking-tight leading-none">DSS BPKAD</h1>
            <p className="text-[10px] text-fin-text-secondary mt-1 font-medium leading-none">Kab. Kepulauan Aru</p>
          </div>
        </div>
      </div>

      {/* Menu Search Bar */}
      <div className="px-5 py-3.5 border-b border-fin-border bg-fin-page/10">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fin-text-muted" />
          <input
            type="text"
            placeholder="Cari menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-fin-subtle dark:bg-slate-900/40 border border-fin-border text-[12px] placeholder:text-fin-text-muted text-fin-text-primary rounded-xl focus:outline-none focus:ring-1 focus:ring-fin-info/30 hover:border-fin-border-hover transition-all shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-fin-text-muted hover:text-fin-text-primary hover:scale-105 transition-all cursor-pointer"
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1 scrollbar-hide">
        {displayedMenuStructure.map((group) => (
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

                        const isActive = isPathMatch && (itemTab ? isTabMatch : !currentTab);

                        return (
                          <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                              "flex items-center pl-11 pr-3 py-2.5 rounded-lg transition-colors text-[12px] relative",
                              isActive
                                ? "bg-fin-subtle dark:bg-indigo-900/10 text-fin-text-primary font-semibold"
                                : "text-fin-text-secondary hover:bg-fin-page hover:text-fin-text-primary"
                            )}
                          >
                            {isActive && (
                              <div className="absolute left-4 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-fin-text-primary dark:bg-amber-400 rounded-r-full" />
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
