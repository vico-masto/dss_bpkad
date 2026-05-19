import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * DESIGN SYSTEM BUTTON
 *
 * Variant guide:
 *   primary     → navy (#101828) — aksi utama: Simpan, Konfirmasi, Cetak
 *   accent      → biru info (#2E90FA) — Generate, Auto-Match, aksi interaktif
 *   outline     → border tipis — Export, Refresh, aksi sekunder
 *   secondary   → abu subtle — aksi tersier
 *   ghost       → tanpa border — ikon kecil, tombol nav
 *   destructive → merah — Hapus, Batal Permanen
 *   income      → hijau — aksi positif/pendapatan
 *
 * Size guide:
 *   sm  → h-8  (32px) — compact, icon buttons, tabel action
 *   md  → h-10 (40px) — standard, filter bar
 *   lg  → h-11 (44px) — prominent CTA, header actions
 *
 * Props:
 *   loading     → tampilkan spinner, disable otomatis
 *   leftIcon    → ikon sebelum teks
 *   rightIcon   → ikon setelah teks
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center gap-1.5",
    "rounded-lg border border-transparent bg-clip-padding",
    "text-sm font-semibold whitespace-nowrap",
    "transition-all duration-150 outline-none select-none",
    "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Navy — tombol aksi utama (Simpan, Konfirmasi, Cetak) */
        primary:
          "bg-ds-primary text-ds-primary-fg hover:bg-ds-primary-hover shadow-sm",
        /** Biru — tombol interaktif (Generate, Auto-Match, aksi cerdas) */
        accent:
          "bg-ds-accent text-ds-accent-fg hover:bg-ds-accent-hover shadow-sm",
        /** Border tipis — aksi sekunder (Export, Refresh, Template) */
        outline:
          "border-fin-border bg-fin-surface text-fin-text-primary hover:bg-fin-page",
        /** Abu-abu subtle — aksi tersier */
        secondary:
          "bg-fin-subtle text-fin-text-primary hover:bg-fin-border",
        /** Tanpa background — ikon kecil, nav, sub-action */
        ghost:
          "hover:bg-fin-subtle text-fin-text-muted hover:text-fin-text-primary",
        /** Merah — aksi destruktif (Hapus, Reset Data) */
        destructive:
          "bg-fin-expense-bg text-fin-expense-text border-fin-expense/20 hover:bg-fin-expense/10",
        /** Hijau — aksi pendapatan / positif */
        income:
          "bg-fin-income text-white hover:bg-fin-income/90 shadow-sm",
        /** Link teks */
        link:
          "text-ds-accent underline-offset-4 hover:underline",
        /**
         * @deprecated Pakai `primary` atau `accent`.
         * Dipertahankan agar kode lama tidak pecah.
         */
        default:
          "bg-ds-primary text-ds-primary-fg hover:bg-ds-primary-hover shadow-sm",
      },
      size: {
        /** 32px — icon buttons, compact table actions */
        sm: "h-btn-sm gap-1 px-3 text-xs",
        /** 40px — standard, filter bar, default */
        md: "h-btn-md gap-1.5 px-4",
        /** 44px — prominent CTA, page header actions */
        lg: "h-btn-lg gap-2 px-5",
        /** Ikon persegi 32px */
        icon: "size-btn-sm p-0",
        /** Ikon persegi 28px */
        "icon-sm": "size-7 p-0",
        /** Ikon persegi 40px */
        "icon-md": "size-btn-md p-0",
        /**
         * @deprecated Pakai `sm`. Dipertahankan untuk backward-compat.
         */
        default: "h-btn-sm gap-1.5 px-3",
        /** @deprecated Pakai `sm`. */
        xs: "h-6 gap-1 px-2 text-xs",
        /** @deprecated Pakai `sm`. */
        lg_old: "h-9 gap-2 px-4",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

export interface ButtonProps
  extends ButtonPrimitive.Props,
    VariantProps<typeof buttonVariants> {
  /** Tampilkan spinner dan nonaktifkan tombol */
  loading?: boolean
  /** Ikon di kiri teks */
  leftIcon?: React.ReactNode
  /** Ikon di kanan teks */
  rightIcon?: React.ReactNode
}

function Button({
  className,
  variant,
  size,
  loading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-loading={loading || undefined}
      disabled={loading || disabled}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-3.5 animate-spin shrink-0" />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
