"use client"

import * as React from "react"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"

interface SearchInputProps
  extends Omit<React.ComponentProps<"input">, "onChange" | "value"> {
  /** Nilai saat ini */
  value?: string
  /** Callback setelah debounce (default 300ms) */
  onSearch?: (value: string) => void
  /** Callback saat input berubah (tanpa debounce) */
  onValueChange?: (value: string) => void
  /** Debounce dalam millisecond, default 300 */
  debounceMs?: number
  /** Tampilkan tombol clear saat ada isi */
  clearable?: boolean
  className?: string
  containerClassName?: string
}

function SearchInput({
  value: controlledValue,
  onSearch,
  onValueChange,
  debounceMs = 300,
  clearable = true,
  className,
  containerClassName,
  placeholder = "Cari...",
  ...props
}: SearchInputProps) {
  const [internalValue, setInternalValue] = React.useState(controlledValue ?? "")
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const value = controlledValue !== undefined ? controlledValue : internalValue

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value
    if (controlledValue === undefined) setInternalValue(newVal)
    onValueChange?.(newVal)

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onSearch?.(newVal)
    }, debounceMs)
  }

  const handleClear = () => {
    if (controlledValue === undefined) setInternalValue("")
    onValueChange?.("")
    onSearch?.("")
  }

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  return (
    <div className={cn("relative flex items-center", containerClassName)}>
      {/* Search icon */}
      <Search
        size={14}
        className="pointer-events-none absolute left-3 text-fin-text-muted shrink-0"
      />

      <Input
        {...props}
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn("pl-8", clearable && value ? "pr-8" : "pr-3", className)}
      />

      {/* Clear button */}
      {clearable && value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 flex items-center justify-center rounded-lg p-0.5 text-fin-text-muted transition-colors hover:bg-fin-subtle hover:text-fin-text-primary"
          aria-label="Hapus pencarian"
        >
          <X size={13} />
        </button>
      )}
    </div>
  )
}

export { SearchInput }
export type { SearchInputProps }
