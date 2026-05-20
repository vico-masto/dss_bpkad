'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileSearch, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Column<T> {
  header: string;
  accessor: keyof T | ((item: T) => React.ReactNode);
  className?: string;
  isCurrency?: boolean;
  isStatus?: boolean;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
}

export function DataTable<T extends { id?: string | number }>({
  columns,
  data,
  isLoading,
  onRowClick,
  emptyMessage = "Tidak ada data ditemukan"
}: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm bg-white">
      <table className="w-full text-left border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-slate-50/80 backdrop-blur-md border-b border-slate-200">
            {columns.map((col, idx) => (
              <th 
                key={idx}
                className={cn(
                  "px-6 py-4 text-[10px] uppercase tracking-[0.2em] text-slate-500 font-black italic",
                  col.align === 'right' || col.isCurrency ? "text-right" : col.align === 'center' ? "text-center" : "text-left",
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 text-xs">
          <AnimatePresence mode="wait">
            {isLoading ? (
              // Skeleton Loader
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="animate-pulse">
                  {columns.map((_, j) => (
                    <td key={`cell-${j}`} className="px-6 py-5">
                      <div className="h-3 bg-slate-100 rounded-full w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              // Empty State
              <tr>
                <td colSpan={columns.length} className="py-32 text-center">
                  <div className="flex flex-col items-center gap-4 opacity-20">
                    <FileSearch size={64} />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">{emptyMessage}</p>
                  </div>
                </td>
              </tr>
            ) : (
              // Real Data
              data.map((item, rowIdx) => (
                <motion.tr
                  key={item.id || rowIdx}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: rowIdx * 0.05 }}
                  onClick={() => onRowClick?.(item)}
                  className={cn(
                    "hover:bg-slate-50/80 transition-colors group cursor-default",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((col, colIdx) => {
                    const content = typeof col.accessor === 'function' 
                      ? col.accessor(item) 
                      : (item[col.accessor] as React.ReactNode);

                    return (
                      <td 
                        key={colIdx}
                        className={cn(
                          "px-6 py-5 transition-all",
                          col.isCurrency ? "text-right tabular-nums font-black text-slate-900" : 
                          col.isStatus ? "text-center" : 
                          col.align === 'center' ? "text-center" : "text-left",
                          col.className
                        )}
                      >
                        {col.isStatus && typeof content === 'string' ? (
                          <span className={cn(
                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border",
                            content.toLowerCase().includes('aman') || content.toLowerCase().includes('selesai') || content.toLowerCase().includes('sukses')
                              ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                              : content.toLowerCase().includes('talangan') || content.toLowerCase().includes('proses') || content.toLowerCase().includes('pending')
                              ? "bg-amber-50 text-amber-600 border-amber-100"
                              : "bg-rose-50 text-rose-600 border-rose-100"
                          )}>
                            {content}
                          </span>
                        ) : col.isCurrency && typeof content === 'number' ? (
                          new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(content)
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </motion.tr>
              ))
            )}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
