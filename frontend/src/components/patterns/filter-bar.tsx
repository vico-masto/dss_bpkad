"use client"

import * as React from "react"
import { SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

interface FilterBarProps {
  /** Label / judul di kiri (opsional) */
  title?: string
  /** Komponen filter — SearchInput, Select, DatePicker, dll */
  children?: React.ReactNode
  /** Tombol aksi di kanan — Export, Tambah, dsb */
  actions?: React.ReactNode
  /** Apakah ada filter aktif — tampilkan tombol reset */
  isFiltered?: boolean
  /** Callback tombol reset */
  onReset?: () => void
  /** Class tambahan untuk wrapper */
  className?: string
}

/**
 * FilterBar — baris filter standar di atas tabel.
 *
 * Contoh:
 *   <FilterBar
 *     isFiltered={!!search || !!statusFilter}
 *     onReset={handleReset}
 *     actions={<Button leftIcon={<Plus />}>Tambah</Button>}
 *   >
 *     <SearchInput value={search} onSearch={setSearch} className="w-64" />
 *     <Select value={status} onValueChange={setStatus}>…</Select>
 *   </FilterBar>
 */
function FilterBar({
  title,
  children,
  actions,
  isFiltered,
  onReset,
  className,
}: FilterBarProps) {
  return (
    <div
      data-slot="filter-bar"
      className={cn(
        "flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between",
        className
      )}
    >
      {/* Left: title + filters */}
      <div className="flex flex-1 flex-wrap items-center gap-2">
        {title && (
          <div className="flex items-center gap-1.5 text-micro font-bold uppercase tracking-wide text-fin-text-muted">
            <SlidersHorizontal className="size-3" />
            {title}
          </div>
        )}

        {children}

        {isFiltered && onReset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReset}
            leftIcon={<X className="size-3" />}
            className="text-fin-expense hover:text-fin-expense-text hover:bg-fin-expense-bg"
          >
            Reset
          </Button>
        )}
      </div>

      {/* Right: primary actions */}
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}

export { FilterBar }
export type { FilterBarProps }
