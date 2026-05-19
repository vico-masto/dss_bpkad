import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Formats a number or string into Indonesian Currency (IDR)
 * Example: 1000000 -> Rp 1.000.000
 */
export function formatCurrency(value: number | string) {
  if (value === null || value === undefined || value === '') return 'Rp 0';
  
  const numericValue = parseNumber(value);

  if (isNaN(numericValue) || typeof numericValue !== 'number') return 'Rp 0';
  
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

export function formatNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return '0';
  if (value === '-') return '-';
  
  const numericValue = parseNumber(value);

  if (isNaN(numericValue) || typeof numericValue !== 'number') return '0';
  return new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericValue);
}

/**
 * Parses a formatted string back into a raw number
 * Example: "1.000,50" -> 1000.5
 */
export function parseNumber(value: string | number | null | undefined): any {
  if (value === null || value === undefined || value === '') return 0;
  if (value === '-') return '-';
  if (typeof value === 'number') return value;
  
  const str = value.toString().trim();
  
  // Detect if it's already in DB format (e.g. "1000.50")
  // Rule: DB format uses dot as decimal and has NO thousand separators.
  // ID format uses comma as decimal and dot as thousand separator.
  
  const hasComma = str.includes(',');
  const hasMultipleDots = (str.match(/\./g) || []).length > 1;
  const hasDot = str.includes('.');
  
  // If it has a comma or multiple dots, it's definitely Indonesian format
  if (hasComma || hasMultipleDots) {
    const cleanValue = str.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
    return parseFloat(cleanValue) || 0;
  }

  // If it has only one dot and no comma
  if (hasDot) {
    const parts = str.split('.');
    // If the part after dot is NOT exactly 3 digits, it's likely a DB decimal (e.g. .5, .50, .5000)
    // Or if the string is very short (e.g. "0.5")
    if (parts[1].length !== 3 || str.startsWith('0.')) {
      return parseFloat(str) || 0;
    } else {
      // It's like "1.000" or "10.000" - treat as Indonesian thousand separator
      return parseFloat(str.replace(/\./g, '')) || 0;
    }
  }

  // No dots, no commas - standard integer string
  return parseFloat(str.replace(/[^\d.-]/g, '')) || 0;
}

/**
 * Compact currency formatting (e.g., 1.2B instead of 1.200.000.000)
 */
export function formatCurrencyCompact(value: number | string) {
  const num = parseNumber(value);
  if (num === 0) return 'Rp 0';

  const absNum = Math.abs(num);
  let formatted = '';
  let suffix = '';

  if (absNum >= 1.0e+12) {
    formatted = (absNum / 1.0e+12).toFixed(2);
    suffix = ' T';
  } else if (absNum >= 1.0e+9) {
    formatted = (absNum / 1.0e+9).toFixed(2);
    suffix = ' M';
  } else if (absNum >= 1.0e+6) {
    formatted = (absNum / 1.0e+6).toFixed(2);
    suffix = ' Jt';
  } else {
    return formatCurrency(num);
  }

  // Remove trailing .00
  formatted = formatted.replace(/\.00$/, '');
  
  return `Rp ${formatted}${suffix}`;
}
