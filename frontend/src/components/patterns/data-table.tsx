"use client"

import * as React from "react"
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

// ─── Column definition ────────────────────────────────────────────────────────

export interface ColumnDef<TRow> {
  /** Key unik kolom */
  id: string
  /** Teks header */
  header: React.ReactNode
  /** Render cell — terima row data, kembalikan ReactNode */
  cell: (row: TRow, rowIndex: number) => React.ReactNode
  /** Aktifkan sorting — accessor ke nilai yang diurutkan */
  sortable?: boolean
  sortAccessor?: (row: TRow) => string | number | Date | null | undefined
  /** Class untuk <th> dan <td> */
  headerClassName?: string
  cellClassName?: string
  /** Lebar kolom */
  width?: string | number
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

interface PaginationState {
  pageIndex: number
  pageSize: number
}

function usePagination(total: number, initialPageSize = 10) {
  const [state, setState] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  })

  const pageCount = Math.max(1, Math.ceil(total / state.pageSize))

  const goTo = (page: number) =>
    setState((s) => ({ ...s, pageIndex: Math.min(Math.max(0, page), pageCount - 1) }))

  return {
    pageIndex: state.pageIndex,
    pageSize: state.pageSize,
    pageCount,
    canPrev: state.pageIndex > 0,
    canNext: state.pageIndex < pageCount - 1,
    goTo,
    prev: () => goTo(state.pageIndex - 1),
    next: () => goTo(state.pageIndex + 1),
    setPageSize: (size: number) => setState({ pageIndex: 0, pageSize: size }),
  }
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc" | null

interface SortState {
  id: string
  dir: SortDir
}

// ─── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode
  title?: string
  description?: string
  action?: React.ReactNode
}

function DefaultEmptyState({ icon, title = "Tidak ada data", description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      {icon && <div className="text-fin-text-muted">{icon}</div>}
      <p className="text-sm font-medium text-fin-text-secondary">{title}</p>
      {description && <p className="text-xs text-fin-text-muted max-w-xs">{description}</p>}
      {action}
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <TableRow>
      {Array.from({ length: colCount }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 w-full max-w-[140px] animate-pulse rounded bg-fin-subtle" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ─── DataTable Props ──────────────────────────────────────────────────────────

interface DataTableProps<TRow> {
  /** Data baris */
  data: TRow[]
  /** Definisi kolom */
  columns: ColumnDef<TRow>[]
  /** Sedang loading — tampilkan skeleton */
  loading?: boolean
  /** Jumlah baris skeleton saat loading */
  skeletonRows?: number
  /** Empty state kustom */
  emptyState?: EmptyStateProps
  /** Aktifkan pagination client-side */
  pagination?: boolean
  /** Ukuran halaman awal */
  defaultPageSize?: number
  /** Opsi ukuran halaman */
  pageSizeOptions?: number[]
  /** Header tabel sticky */
  stickyHeader?: boolean
  /** Tinggi container saat sticky header (e.g. "500px", "60vh") */
  maxHeight?: string
  /** Class container */
  className?: string
  /** Callback saat row diklik */
  onRowClick?: (row: TRow, rowIndex: number) => void
  /** Kunci row unik — untuk stable key */
  rowKey?: (row: TRow, index: number) => string | number
}

// ─── DataTable ────────────────────────────────────────────────────────────────

/**
 * DataTable — tabel generik dengan sticky header, sorting, pagination, empty state.
 *
 * Contoh:
 *   const columns: ColumnDef<SP2D>[] = [
 *     { id: "nomor", header: "No. SP2D", cell: (r) => r.nomor_sp2d, sortable: true, sortAccessor: (r) => r.nomor_sp2d },
 *     { id: "nilai", header: "Nilai", cell: (r) => formatRupiah(r.nilai), headerClassName: "text-right", cellClassName: "text-right" },
 *   ]
 *   <DataTable data={rows} columns={columns} loading={isLoading} pagination stickyHeader maxHeight="60vh" />
 */
function DataTable<TRow>({
  data,
  columns,
  loading = false,
  skeletonRows = 5,
  emptyState,
  pagination = false,
  defaultPageSize = 10,
  pageSizeOptions = [10, 25, 50, 100],
  stickyHeader = false,
  maxHeight,
  className,
  onRowClick,
  rowKey,
}: DataTableProps<TRow>) {
  const [sort, setSort] = React.useState<SortState>({ id: "", dir: null })
  const pager = usePagination(data.length, defaultPageSize)

  // Sort
  const sortedData = React.useMemo(() => {
    if (!sort.id || !sort.dir) return data
    const col = columns.find((c) => c.id === sort.id)
    if (!col?.sortAccessor) return data
    return [...data].sort((a, b) => {
      const va = col.sortAccessor!(a) ?? ""
      const vb = col.sortAccessor!(b) ?? ""
      const cmp = va < vb ? -1 : va > vb ? 1 : 0
      return sort.dir === "asc" ? cmp : -cmp
    })
  }, [data, sort, columns])

  // Paginate
  const pagedData = React.useMemo(() => {
    if (!pagination) return sortedData
    const start = pager.pageIndex * pager.pageSize
    return sortedData.slice(start, start + pager.pageSize)
  }, [sortedData, pagination, pager.pageIndex, pager.pageSize])

  const handleSort = (colId: string) => {
    setSort((prev) => {
      if (prev.id !== colId) return { id: colId, dir: "asc" }
      if (prev.dir === "asc") return { id: colId, dir: "desc" }
      return { id: "", dir: null }
    })
    // Reset pagination on sort
    if (pagination) pager.goTo(0)
  }

  const SortIcon = ({ colId }: { colId: string }) => {
    if (sort.id !== colId || !sort.dir)
      return <ChevronsUpDown className="size-3.5 text-fin-text-muted" />
    return sort.dir === "asc"
      ? <ChevronUp className="size-3.5 text-ds-accent" />
      : <ChevronDown className="size-3.5 text-ds-accent" />
  }

  const isEmpty = !loading && pagedData.length === 0

  return (
    <div data-slot="data-table" className={cn("flex flex-col gap-0", className)}>
      {/* Scrollable table area */}
      <div
        className={cn(
          "rounded-lg border border-fin-border overflow-hidden",
          stickyHeader && "overflow-y-auto",
        )}
        style={stickyHeader && maxHeight ? { maxHeight } : undefined}
      >
        <Table>
          <TableHeader
            className={cn(stickyHeader && "sticky top-0 z-10")}
          >
            <TableRow className="bg-fin-page hover:bg-fin-page border-b border-fin-border">
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  className={cn(
                    "text-micro font-bold uppercase tracking-wide text-fin-text-muted whitespace-nowrap",
                    "bg-fin-page",
                    col.sortable && "cursor-pointer select-none",
                    col.headerClassName
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => handleSort(col.id) : undefined}
                >
                  <span className="flex items-center gap-1">
                    {col.header}
                    {col.sortable && <SortIcon colId={col.id} />}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading
              ? Array.from({ length: skeletonRows }).map((_, i) => (
                  <SkeletonRow key={i} colCount={columns.length} />
                ))
              : isEmpty
              ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="p-0">
                    <DefaultEmptyState {...emptyState} />
                  </TableCell>
                </TableRow>
              )
              : pagedData.map((row, rowIndex) => (
                <TableRow
                  key={rowKey ? rowKey(row, rowIndex) : rowIndex}
                  onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                  className={cn(
                    "border-b border-fin-border/50 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-fin-subtle",
                  )}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.id}
                      className={cn(
                        "text-sm text-fin-text-primary",
                        col.cellClassName
                      )}
                    >
                      {col.cell(row, rowIndex)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            }
          </TableBody>
        </Table>
      </div>

      {/* Pagination controls */}
      {pagination && !loading && (
        <div className="flex items-center justify-between gap-4 pt-3">
          {/* Row count info */}
          <p className="text-xs text-fin-text-muted">
            {data.length === 0
              ? "Tidak ada data"
              : `${pager.pageIndex * pager.pageSize + 1}–${Math.min(
                  (pager.pageIndex + 1) * pager.pageSize,
                  data.length
                )} dari ${data.length} baris`}
          </p>

          <div className="flex items-center gap-3">
            {/* Page size selector */}
            <div className="flex items-center gap-1.5 text-xs text-fin-text-muted">
              <span>Tampilkan</span>
              <select
                value={pager.pageSize}
                onChange={(e) => pager.setPageSize(Number(e.target.value))}
                className="h-7 rounded-md border border-fin-border bg-fin-page px-1.5 text-xs text-fin-text-primary outline-none focus:border-ds-focus-ring/60 cursor-pointer"
              >
                {pageSizeOptions.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <span>baris</span>
            </div>

            {/* Page nav */}
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={pager.prev}
                disabled={!pager.canPrev}
                className="h-7 w-7 p-0"
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <span className="min-w-[5rem] text-center text-xs text-fin-text-secondary">
                {pager.pageIndex + 1} / {pager.pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={pager.next}
                disabled={!pager.canNext}
                className="h-7 w-7 p-0"
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { DataTable }
export type { DataTableProps, EmptyStateProps }
