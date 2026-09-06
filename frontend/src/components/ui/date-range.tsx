'use client';

import { Calendar } from 'lucide-react';
import { Input } from './input';
import { cn } from '@/lib/utils';

interface DateRangeProps {
  startDate: string;
  endDate: string;
  onChangeStart: (value: string) => void;
  onChangeEnd: (value: string) => void;
  label?: string;
  separator?: string;
  variant?: 'default' | 'danger' | 'compact';
  showIcon?: boolean;
  className?: string;
}

const DateRange = ({
  startDate,
  endDate,
  onChangeStart,
  onChangeEnd,
  label = 'Rentang Tanggal',
  separator = 's/d',
  variant = 'default',
  showIcon = true,
  className,
}: DateRangeProps) => {
  const inputClass = cn(
    'text-xs font-semibold',
    variant === 'danger' &&
      'focus:ring-amber-500/20 focus:border-amber-500/50',
  );

  if (variant === 'compact') {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <Input
          type="date"
          className={inputClass}
          value={startDate}
          onChange={(e) => onChangeStart(e.target.value)}
        />
        <span className="text-xs font-bold text-fin-text-muted shrink-0">
          {separator}
        </span>
        <Input
          type="date"
          className={inputClass}
          value={endDate}
          onChange={(e) => onChangeEnd(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      <label className="text-[10px] font-bold text-fin-text-muted uppercase tracking-wider flex items-center gap-1.5 ml-1">
        {showIcon && <Calendar size={12} className="text-[#2E90FA]" />}
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          type="date"
          className={inputClass}
          value={startDate}
          onChange={(e) => onChangeStart(e.target.value)}
        />
        <span className="text-xs font-bold text-fin-text-muted shrink-0">
          {separator}
        </span>
        <Input
          type="date"
          className={inputClass}
          value={endDate}
          onChange={(e) => onChangeEnd(e.target.value)}
        />
      </div>
    </div>
  );
};

export { DateRange };
