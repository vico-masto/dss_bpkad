"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-white group-[.toaster]:text-slate-950 group-[.toaster]:border-slate-200 group-[.toaster]:shadow-lg group-[.toaster]:rounded-2xl",
          description: "group-[.toast]:text-slate-500",
          actionButton:
            "group-[.toast]:bg-slate-900 group-[.toast]:text-slate-50",
          cancelButton:
            "group-[.toast]:bg-slate-100 group-[.toast]:text-slate-500",
          success: "group-[.toast]:bg-emerald-50 group-[.toast]:text-emerald-600 group-[.toast]:border-emerald-100",
          error: "group-[.toast]:bg-rose-50 group-[.toast]:text-rose-600 group-[.toast]:border-rose-100",
          info: "group-[.toast]:bg-blue-50 group-[.toast]:text-blue-600 group-[.toast]:border-blue-100",
          warning: "group-[.toast]:bg-amber-50 group-[.toast]:text-amber-600 group-[.toast]:border-amber-100",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
