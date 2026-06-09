'use client';

import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

interface LogoutConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  user?: any;
}

export function LogoutConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  user,
}: LogoutConfirmDialogProps) {
  const initial = user?.username ? user.username.charAt(0).toUpperCase() : 'U';
  const displayName = user?.username
    ? user.username.charAt(0).toUpperCase() + user.username.slice(1)
    : 'Administrator';
  const role = user?.role || 'Operator';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="sm:max-w-[320px] p-0 overflow-hidden border border-fin-border rounded-2xl shadow-xl bg-fin-surface gap-0">

        {/* ── Header ── */}
        <div className="px-5 pt-5 pb-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0 mt-0.5">
            <LogOut size={16} className="text-red-500" strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-fin-text-primary leading-snug">Keluar dari Sistem?</h2>
            <p className="text-[12px] text-fin-text-muted mt-0.5">Sesi aktif Anda akan diakhiri.</p>
          </div>
        </div>

        {/* ── Divider ── */}
        <div className="h-px bg-fin-border mx-5" />

        {/* ── Info pengguna ── */}
        <div className="px-5 py-3.5 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-600 to-slate-800 flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-[13px]">{initial}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-fin-text-primary truncate leading-tight">{displayName}</p>
            <p className="text-[11px] text-fin-text-muted capitalize leading-tight">{role}</p>
          </div>
          <span className="flex items-center gap-1 text-[10px] font-medium text-green-600 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            Aktif
          </span>
        </div>

        {/* ── Footer tombol ── */}
        <div className="px-5 pb-5 flex gap-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 h-9 rounded-xl text-[13px] font-semibold border-fin-border text-fin-text-secondary hover:bg-fin-page"
          >
            Batal
          </Button>
          <Button
            onClick={onConfirm}
            loading={isLoading}
            className="flex-1 h-9 rounded-xl text-[13px] font-bold gap-1.5 bg-red-500 hover:bg-red-600 text-white border-none shadow-sm"
          >
            <LogOut size={13} />
            Ya, Keluar
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
