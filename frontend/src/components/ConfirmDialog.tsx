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
import { AlertCircle, CheckCircle2, Info, Loader2, HelpCircle } from "lucide-react";
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
        return {
          icon: <AlertCircle className="w-6 h-6 text-red-600" />,
          bg: "bg-red-50",
          button: "bg-red-600 hover:bg-red-700 text-white",
          border: "border-red-100"
        };
      case 'success':
        return {
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />,
          bg: "bg-emerald-50",
          button: "bg-emerald-600 hover:bg-emerald-700 text-white",
          border: "border-emerald-100"
        };
      case 'info':
        return {
          icon: <Info className="w-6 h-6 text-blue-600" />,
          bg: "bg-blue-50",
          button: "bg-blue-600 hover:bg-blue-700 text-white",
          border: "border-blue-100"
        };
      case 'question':
        return {
          icon: <HelpCircle className="w-6 h-6 text-indigo-600" />,
          bg: "bg-indigo-50",
          button: "bg-indigo-600 hover:bg-indigo-700 text-white",
          border: "border-indigo-100"
        };
      default: // warning
        return {
          icon: <AlertCircle className="w-6 h-6 text-amber-600" />,
          bg: "bg-amber-50",
          button: "bg-amber-600 hover:bg-amber-700 text-white",
          border: "border-amber-100"
        };
    }
  };

  const styles = getStyles();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isLoading && onClose()}>
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-none rounded-[28px] shadow-2xl bg-fin-surface">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", styles.bg)}>
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
            onClick={onConfirm}
            disabled={isLoading}
            className={cn("h-10 px-6 text-sm font-bold rounded-xl shadow-lg transition-all active:scale-95", styles.button)}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                <span>Memproses...</span>
              </div>
            ) : confirmText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
