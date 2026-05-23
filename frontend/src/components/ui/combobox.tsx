"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ComboboxOption {
  value: string
  label: string
  disabled?: boolean
}

export interface ComboboxProps {
  options: ComboboxOption[]
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  className?: string
  disabled?: boolean
  size?: "sm" | "default" | "lg"
}

function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Pilih...",
  searchPlaceholder = "Cari...",
  emptyText = "Tidak ada hasil",
  className,
  disabled,
  size = "default",
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const containerRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)
  const [activeIndex, setActiveIndex] = React.useState(-1)

  const selectedOption = options.find((o) => o.value === value)

  const filtered = query.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase())
      )
    : options

  // Reset active index when filtered list changes
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveIndex(-1)
  }, [query])

  // Close on outside click
  React.useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery("")
      }
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [])

  function openDropdown() {
    if (disabled) return
    setOpen(true)
    setQuery("")
    setActiveIndex(-1)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function closeDropdown() {
    setOpen(false)
    setQuery("")
    setActiveIndex(-1)
  }

  function selectOption(option: ComboboxOption) {
    if (option.disabled) return
    onValueChange?.(option.value)
    closeDropdown()
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
      e.preventDefault()
      openDropdown()
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      closeDropdown()
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault()
      const opt = filtered[activeIndex]
      if (opt) selectOption(opt)
    }
  }

  // Scroll active item into view
  React.useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const el = listRef.current.querySelector<HTMLButtonElement>(
        `[data-index="${activeIndex}"]`
      )
      el?.scrollIntoView({ block: "nearest" })
    }
  }, [activeIndex])

  const triggerHeight =
    size === "sm" ? "h-8 text-xs" : size === "lg" ? "h-btn-lg" : "h-input"

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger ── */}
      <button
        type="button"
        onClick={openDropdown}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-1.5",
          "rounded-lg border border-fin-border bg-fin-page px-3",
          "text-sm text-fin-text-primary",
          "transition-all duration-150 outline-none select-none cursor-pointer",
          "focus-visible:border-ds-focus-ring/60 focus-visible:ring-2 focus-visible:ring-ds-focus-ring/15",
          "disabled:cursor-not-allowed disabled:opacity-50",
          triggerHeight,
          !selectedOption && "text-fin-text-muted/50",
          className
        )}
      >
        <span className="flex-1 text-left truncate">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDownIcon
          className={cn(
            "size-4 text-fin-text-muted shrink-0 transition-transform duration-150",
            open && "rotate-180"
          )}
        />
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div
          className={cn(
            "absolute left-0 z-50 mt-1 w-full min-w-36",
            "rounded-lg border border-fin-border bg-fin-surface",
            "shadow-lg ring-1 ring-fin-border/50",
            "overflow-hidden",
            "animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-100"
          )}
        >
          {/* Search */}
          <div className="flex items-center gap-2 border-b border-fin-border px-3 py-2">
            <SearchIcon className="size-3.5 text-fin-text-muted shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={searchPlaceholder}
              autoComplete="off"
              className={cn(
                "flex-1 bg-transparent text-sm text-fin-text-primary outline-none",
                "placeholder:text-fin-text-muted/50"
              )}
            />
            {query && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  setQuery("")
                  inputRef.current?.focus()
                }}
              >
                <XIcon className="size-3.5 text-fin-text-muted hover:text-fin-text-primary transition-colors" />
              </button>
            )}
          </div>

          {/* List */}
          <div ref={listRef} className="max-h-60 overflow-y-auto p-1" role="listbox">
            {filtered.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-fin-text-muted">
                {emptyText}
              </div>
            ) : (
              filtered.map((option, idx) => (
                <button
                  key={option.value != null && option.value !== '' ? option.value : `__opt_${idx}`}
                  type="button"
                  role="option"
                  data-index={idx}
                  disabled={option.disabled}
                  aria-selected={option.value === value}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    selectOption(option)
                  }}
                  onMouseEnter={() => setActiveIndex(idx)}
                  className={cn(
                    "relative flex w-full cursor-pointer items-center gap-1.5",
                    "rounded-lg py-1.5 pr-8 pl-2 text-left",
                    "text-sm text-fin-text-primary outline-none select-none",
                    "transition-colors",
                    "disabled:pointer-events-none disabled:opacity-50",
                    (option.value === value || activeIndex === idx) && "bg-fin-subtle"
                  )}
                >
                  <span className="flex-1 truncate">{option.label}</span>
                  {option.value === value && (
                    <CheckIcon className="absolute right-2 size-3.5 text-ds-accent shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export { Combobox }
