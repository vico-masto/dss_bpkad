import * as React from "react"
import { cn } from "@/lib/utils"

interface FormFieldProps {
  /** Label di atas input */
  label?: React.ReactNode
  /** Nama field — untuk htmlFor otomatis */
  htmlFor?: string
  /** Tandai sebagai wajib diisi */
  required?: boolean
  /** Pesan error — merah, muncul di bawah */
  error?: React.ReactNode
  /** Teks bantuan — abu, muncul di bawah (tidak muncul jika ada error) */
  hint?: React.ReactNode
  /** Input / select / komponen di dalam */
  children: React.ReactNode
  /** Class tambahan untuk wrapper */
  className?: string
}

/**
 * FormField — wrapper standar label + input + error + hint.
 *
 * Contoh:
 *   <FormField label="Nama Rekening" required error={errors.nama?.message}>
 *     <Input id="nama" {...register("nama")} aria-invalid={!!errors.nama} />
 *   </FormField>
 */
function FormField({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
  className,
}: FormFieldProps) {
  return (
    <div data-slot="form-field" className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="text-micro font-bold uppercase tracking-wide text-fin-text-muted leading-none"
        >
          {label}
          {required && (
            <span className="ml-0.5 text-fin-expense" aria-hidden>
              *
            </span>
          )}
        </label>
      )}

      {children}

      {error ? (
        <p
          role="alert"
          className="flex items-center gap-1 text-xs text-fin-expense leading-none"
        >
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fin-text-muted leading-snug">{hint}</p>
      ) : null}
    </div>
  )
}

export { FormField }
export type { FormFieldProps }
