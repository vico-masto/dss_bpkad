'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from './ui/input';
import { formatNumber, parseNumber } from '@/lib/utils';

interface NumericInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  value: number;
  onValueChange: (value: number) => void;
}

export function NumericInput({ value, onValueChange, className, ...props }: NumericInputProps) {
  const [displayValue, setDisplayValue] = useState(value === 0 ? '' : formatNumber(value).split(',')[0]);
  const [isFocused, setIsFocused] = useState(false);
  const isInternalUpdate = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Format helper: only integer part with thousand separators (no decimals while typing)
  const intFormatted = (v: number) => formatNumber(v).split(',')[0];

  // Sync external value changes when not actively editing
  useEffect(() => {
    if (!isInternalUpdate.current && !isFocused) {
      setDisplayValue(value === 0 ? '' : intFormatted(value));
    }
    isInternalUpdate.current = false;
  }, [value, isFocused]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Select all so user can immediately type a new value
    setTimeout(() => {
      inputRef.current?.select();
    }, 0);
    props.onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    setDisplayValue(value === 0 ? '' : intFormatted(value));
    props.onBlur?.(e);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;

    // --- Step 1: Strip ALL dots (they are thousand-separator formatting chars only) ---
    // "1.234" → "1234", "1.234.567" → "1234567", "1.2345" → "12345"
    const stripped = rawValue.replace(/\./g, '');

    // --- Step 2: Keep only digits and one comma (decimal separator) ---
    const sanitized = stripped.replace(/[^\d,]/g, '');

    // Allow empty input
    if (sanitized === '' || sanitized === '-') {
      setDisplayValue('');
      onValueChange(0);
      return;
    }

    // --- Step 3: Parse the clean numeric value ---
    // Replace comma with dot for parseFloat (ID comma → JS decimal dot)
    const forParsing = sanitized.replace(',', '.');
    const numeric = parseFloat(forParsing) || 0;

    // --- Step 4: Build display string ---
    let formatted: string;
    if (sanitized.endsWith(',')) {
      // User just typed a comma — show integer + hanging comma
      formatted = intFormatted(Math.trunc(numeric)) + ',';
    } else if (sanitized.includes(',')) {
      // User is typing decimal digits — keep them raw
      const [intPart, decPart] = sanitized.split(',');
      const intNum = parseInt(intPart.replace(/[^\d]/g, ''), 10) || 0;
      formatted = intFormatted(intNum) + ',' + decPart.slice(0, 2);
    } else {
      // Pure integer — apply thousand separators
      formatted = intFormatted(numeric);
    }

    isInternalUpdate.current = true;
    setDisplayValue(formatted);
    onValueChange(numeric);

    // --- Step 5: Restore cursor position ---
    // Count digits in the *sanitized* (no-dot) string before cursor
    // Then map back to position in the *formatted* (with-dots) string
    setTimeout(() => {
      if (!inputRef.current) return;

      // Count how many numeric digits the user's cursor was after (in stripped input)
      const cursorInRaw = e.target.selectionStart ?? rawValue.length;
      const charsBeforeCursor = rawValue.substring(0, cursorInRaw).replace(/\./g, '');
      const digitsBeforeCursor = (charsBeforeCursor.match(/\d/g) || []).length;

      // Find corresponding position in the new formatted string
      let newPos = formatted.length; // default: end of string
      let digitsFound = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) digitsFound++;
        if (digitsFound === digitsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
      inputRef.current.setSelectionRange(newPos, newPos);
    }, 0);
  };

  return (
    <Input
      {...props}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      className={className}
      value={displayValue}
      placeholder="0"
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
    />
  );
}
