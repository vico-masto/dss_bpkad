"use client";

import React from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, Info, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'success' | 'info' | 'question';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Konfirmasi",
  cancelText = "Batal",
  type = 'warning',
  isLoading = false
}: ConfirmDialogProps) {
  
  const getStyles = () => {
    switch (type) {
      case 'danger':
        return { icon: <AlertCircle className="w-6 h-6 text-fin-expense-text" />, bg: "bg-fin-expense-bg" };
      case 'success':
        return { icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />, bg: "bg-emerald-50" };
      case 'info':
        return { icon: <Info className="w-6 h-6 text-fin-info-text" />, bg: "bg-fin-info-bg" };
      case 'question':
        return { icon: <HelpCircle className="w-6 h-6 text-fin-info-text" />, bg: "bg-fin-info-bg" };
      default: // warning
        return { icon: <AlertCircle className="w-6 h-6 text-amber-600" />, bg: "bg-amber-50" };
    }
  };

  const getConfirmVariant = (): "primary" | "destructive" | "income" | "accent" => {
    switch (type) {
      case 'danger': return 'destructive';
      case 'success': return 'income';
      default: return 'primary';
    }
  };

  const styles = getStyles();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-none rounded-[28px] shadow-2xl bg-fin-surface">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", styles.bg)}>
              {styles.icon}
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-fin-text-primary leading-tight">{title}</h3>
              <p className="text-sm text-[#667085] leading-relaxed font-medium">
                {message}
              </p>
            </div>
          </div>
        </div>
        
        <div className="px-6 py-4 bg-fin-page border-t border-fin-border flex items-center justify-end gap-3">
          <Button 
            variant="ghost" 
            onClick={onClose}
            disabled={isLoading}
            className="h-10 px-4 text-sm font-bold text-fin-text-muted hover:bg-fin-surface rounded-xl"
          >
            {cancelText}
          </Button>
          <Button
            variant={getConfirmVariant()}
            loading={isLoading}
            onClick={onConfirm}
            className="h-10 px-6 rounded-xl"
          >
            {confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
