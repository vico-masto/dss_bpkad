'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from './ui/input';
import { formatNumber, parseNumber } from '@/lib/utils';

interface NumericInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: number;
  onValueChange: (value: number) => void;
}

export function NumericInput({ value, onValueChange, className, ...props }: NumericInputProps) {
  const [displayValue, setDisplayValue] = useState(formatNumber(value));
  const isInternalUpdate = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isInternalUpdate.current) {
      setDisplayValue(formatNumber(value));
    }
    isInternalUpdate.current = false;
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const input = e.target;
    const selectionStart = input.selectionStart || 0;
    
    // Calculate how many digits were before the cursor
    const beforeCursor = rawValue.substring(0, selectionStart);
    const digitsBefore = beforeCursor.replace(/[^\d]/g, '').length;
    const hasCommaBefore = beforeCursor.includes(',');

    // Allow empty or just minus sign
    if (rawValue === '' || rawValue === '-') {
      setDisplayValue(rawValue);
      onValueChange(0);
      return;
    }

    const numeric = parseNumber(rawValue);

    // formatNumber sekarang menghasilkan "1.000.000,00" (minimumFractionDigits=2).
    // Saat user sedang mengetik bagian desimal, kita hanya perlu bagian integer-nya
    // agar tidak muncul "1.000.000,00,5" (dua koma). Ambil bagian sebelum koma pertama.
    const intFormatted = (v: number) => formatNumber(v).split(',')[0];

    let formatted: string;
    if (rawValue.endsWith(',')) {
      // User baru ketik koma — tampilkan integer tanpa desimal + koma menggantung
      formatted = intFormatted(numeric) + ',';
    } else if (rawValue.includes(',') && rawValue.split(',')[1].length <= 2) {
      // User sedang mengetik 1–2 digit desimal — pertahankan desimal apa adanya
      const [intPart, decPart] = rawValue.split(',');
      formatted = intFormatted(parseNumber(intPart)) + ',' + decPart;
    } else {
      // Tidak ada koma atau sudah selesai — format penuh dengan 2 desimal
      formatted = formatNumber(numeric);
    }

    isInternalUpdate.current = true;
    setDisplayValue(formatted);
    onValueChange(numeric);

    // Restore cursor position
    setTimeout(() => {
      if (!inputRef.current) return;
      let newPos = 0;
      let digitsFound = 0;
      let commaFound = false;

      for (let i = 0; i < formatted.length; i++) {
        if (formatted[i] === ',') {
          commaFound = true;
        }
        
        if (/[\d]/.test(formatted[i])) {
          digitsFound++;
        }

        if (digitsFound === digitsBefore) {
          // If we had a comma before, we MUST wait until we pass the comma in the new formatted string
          if (!hasCommaBefore || (hasCommaBefore && commaFound)) {
            newPos = i + 1;
            break;
          }
        }
      }
      inputRef.current.setSelectionRange(newPos, newPos);
    }, 0);
  };

  const handleBlur = () => {
    setDisplayValue(formatNumber(value));
  };

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      className={className}
      value={displayValue}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}
