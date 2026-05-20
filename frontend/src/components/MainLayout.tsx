'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';
import IdleTimer from './IdleTimer';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [user, setUser] = useState<any>(null);
  const isLoginPage = pathname === '/login';

  useEffect(() => {
    if (isLoginPage) return;

    const userStr = localStorage.getItem('user');
    if (userStr) {
      const parsedUser = JSON.parse(userStr);
      setUser(parsedUser);
      
      const role = parsedUser.role;
      const path = pathname;

      // Proteksi rute untuk Operator Penerimaan
      if (role === 'Operator Penerimaan') {
        // Operator Penerimaan hanya diizinkan mengakses rute kas masuk (/pendapatan...)
        // Akses ke /dashboard (dashboard utama) atau sub-rute /dashboard/... dilarang penuh
        if (path === '/dashboard' || path.startsWith('/dashboard/')) {
          router.push('/pendapatan?tab=rekam');
          toast.error('Akses ditolak: Operator Penerimaan hanya diizinkan mengakses modul Transaksi Kas Masuk');
        }
      } 
      // Proteksi rute untuk Operator SP2D
      else if (role === 'Operator SP2D') {
        // Operator SP2D hanya diizinkan mengakses Perekaman SP2D & Arsip Kas Keluar (rute /dashboard/sp2d...)
        // Dilarang keras mengakses Kelengkapan Pencairan (/dashboard/sp2d/kelengkapan) atau modul lainnya
        const isSp2dBase = path.startsWith('/dashboard/sp2d');
        const isKelengkapan = path.startsWith('/dashboard/sp2d/kelengkapan');
        const isAllowedSp2d = isSp2dBase && !isKelengkapan;

        if (!isAllowedSp2d) {
          router.push('/dashboard/sp2d?tab=rekam');
          toast.error('Akses ditolak: Operator SP2D hanya diizinkan mengakses modul Perekaman SP2D dan Arsip Kas Keluar');
        }
      }
    }
  }, [pathname, isLoginPage, router]);

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen bg-fin-page">
      <IdleTimer />
      <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
      <div className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]",
        isCollapsed ? "pl-0" : ""
      )}>
        <Header isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />
        <main className="flex-1 px-6 pt-6 pb-8 overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
