import * as React from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  /** Judul halaman utama */
  title: React.ReactNode
  /** Deskripsi singkat di bawah judul */
  description?: React.ReactNode
  /** Ikon di kiri judul */
  icon?: React.ReactNode
  /** Badge/chip di samping judul (e.g. status, count) */
  badge?: React.ReactNode
  /** Tombol / aksi di kanan — biasanya <Button> atau group */
  actions?: React.ReactNode
  /** Class tambahan untuk container utama */
  className?: string
}

/**
 * PageHeader — header standar halaman dashboard.
 *
 * Contoh:
 *   <PageHeader
 *     title="Rekonsiliasi Bank"
 *     description="Cocokkan mutasi BKU dengan rekening koran"
 *     icon={<Landmark className="size-5" />}
 *     actions={<Button>Export</Button>}
 *   />
 */
function PageHeader({
  title,
  description,
  icon,
  badge,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div
      data-slot="page-header"
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      {/* Left: icon + text */}
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <div className="mt-0.5 shrink-0 rounded-lg bg-fin-subtle p-2 text-fin-text-secondary">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold leading-tight text-fin-text-primary truncate">
              {title}
            </h1>
            {badge}
          </div>
          {description && (
            <p className="mt-0.5 text-sm text-fin-text-secondary leading-snug">
              {description}
            </p>
          )}
        </div>
      </div>

      {/* Right: actions */}
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}

export { PageHeader }
export type { PageHeaderProps }
