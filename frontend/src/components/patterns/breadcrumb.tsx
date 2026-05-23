'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Home } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Mapping URL segment → label tampilan.
 * Urutan penting: path lebih spesifik duluan.
 */
const ROUTE_LABELS: Record<string, string> = {
  // Root
  'dashboard':         'Dashboard',

  // Analisa
  'analisa':           'Analisa',
  'belanja-opd':       'Analisis Belanja OPD',
  'simulator':         'Simulator Kas Cerdas',

  // Transaksi
  'pendapatan':        'Kas Masuk',
  'sp2d':              'Kas Keluar',
  'kelengkapan':       'Kelengkapan Pencairan',
  'create':            'Tambah Baru',

  // Potongan
  'pajak':             'Manajemen Potongan',

  // Rekonsiliasi
  'rekon':             'Rekonsiliasi Bank',
  'bank':              'Rekening Koran',
  'discrepancy':       'Laporan Selisih',
  'anomalies':         'Integritas Data',
  'ba':                'Berita Acara',

  // Laporan
  'bku':               'Buku Kas Umum',
  'jurnal':            'Buku Besar',
  'talangan':          'Jurnal Talangan',
  'penyesuaian':       'Penyesuaian & Koreksi',

  // Buku Pembantu
  'ledgers':           'Buku Pembantu',
  'potongan-opd':      'Realisasi Potongan OPD',
  'opd':               'BP Unit Kerja',

  // Admin
  'master-data':       'Master Data',
  'saldo-awal':        'Saldo Awal',
  'logs':              'Log Aktivitas',
  'users':             'Manajemen Akun',
  'settings':          'Pengaturan',
  'audit-potongan':    'Audit Potongan',

  // Misc
  'analytics':         'Analitik',
}

function getLabel(segment: string): string {
  return ROUTE_LABELS[segment] ?? segment.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
}

interface BreadcrumbProps {
  className?: string
  /** Override otomatis. Jika tidak diisi, dibaca dari pathname. */
  items?: Array<{ label: string; href?: string }>
}

/**
 * Breadcrumb otomatis berdasarkan pathname.
 *
 * Contoh output untuk `/dashboard/analisa/belanja-opd`:
 *   🏠 Dashboard › Analisa › Analisis Belanja OPD
 */
function Breadcrumb({ className, items }: BreadcrumbProps) {
  const pathname = usePathname()

  const crumbs = React.useMemo(() => {
    if (items) return items

    const segments = pathname.split('/').filter(Boolean)

    return segments.map((seg, idx) => {
      const href = '/' + segments.slice(0, idx + 1).join('/')
      return { label: getLabel(seg), href }
    })
  }, [pathname, items])

  if (crumbs.length <= 1) return null // Tidak tampilkan jika hanya 1 level

  return (
    <nav
      data-slot="breadcrumb"
      aria-label="Breadcrumb"
      className={cn('flex items-center gap-1 text-[11px] font-medium', className)}
    >
      <Link
        href="/dashboard"
        className="text-fin-text-muted hover:text-fin-text-primary transition-colors shrink-0"
        aria-label="Dashboard"
      >
        <Home size={11} />
      </Link>
      {crumbs.map((crumb, idx) => (
        <React.Fragment key={idx}>
          <ChevronRight size={10} className="text-fin-text-muted/50 shrink-0" />
          {idx < crumbs.length - 1 && crumb.href ? (
            <Link
              href={crumb.href}
              className="text-fin-text-muted hover:text-fin-text-primary transition-colors truncate max-w-[120px]"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-fin-text-primary font-semibold truncate max-w-[160px]">
              {crumb.label}
            </span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}

export { Breadcrumb }
export type { BreadcrumbProps }
