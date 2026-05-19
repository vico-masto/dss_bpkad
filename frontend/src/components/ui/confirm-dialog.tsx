'use client';

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info' | 'warning';
  isLoading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = "Ya, Lanjutkan",
  cancelText = "Batalkan",
  variant = 'info',
  isLoading = false
}: ConfirmDialogProps) {
  
  const iconMap = {
    danger: <Trash2 className="text-[#F04438]" size={24} />,
    warning: <AlertTriangle className="text-[#F79009]" size={24} />,
    info: <Info className="text-[#2E90FA]" size={24} />
  };

  const bgMap = {
    danger: "bg-[#FEF3F2] border-[#FEE4E2]",
    warning: "bg-[#FFFAEB] border-[#FEF0C7]",
    info: "bg-[#EFF8FF] border-[#D1E9FF]"
  };

  const btnMap = {
    danger: "bg-[#D92D20] hover:bg-[#B42318] shadow-[#D92D20]/20",
    warning: "bg-[#F79009] hover:bg-[#DC6803] shadow-[#F79009]/20",
    info: "bg-[#101828] hover:bg-[#1D2939] shadow-[#101828]/20"
  };

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !isLoading && !v && onClose()}>
      <DialogContent className="!fixed !left-1/2 !top-1/2 !-translate-x-1/2 !-translate-y-1/2 !max-w-[400px] !w-[90vw] rounded-[24px] p-0 overflow-hidden border-none shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="p-8 space-y-6">
          <div className="flex flex-col items-center text-center space-y-4">
             <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center border transition-all", bgMap[variant])}>
                {iconMap[variant]}
             </div>
             <div className="space-y-1">
                <DialogTitle className="text-xl font-bold text-[#101828]">{title}</DialogTitle>
                <DialogDescription className="text-sm text-[#475467] leading-relaxed">
                  {description}
                </DialogDescription>
             </div>
          </div>
        </div>

        <DialogFooter className="p-6 bg-[#F8F9FA] border-t border-[#E9ECEF] flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button 
            variant="ghost" 
            onClick={onClose} 
            disabled={isLoading}
            className="flex-1 h-12 text-[#98A2B3] font-bold hover:bg-white rounded-xl transition-all order-2 sm:order-1"
          >
            {cancelText}
          </Button>
          <Button 
            onClick={onConfirm} 
            disabled={isLoading}
            className={cn("flex-1 h-12 text-white rounded-xl font-bold text-sm shadow-lg transition-all order-1 sm:order-2", btnMap[variant])}
          >
            {isLoading ? <Loader2 className="animate-spin" size={18} /> : confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
