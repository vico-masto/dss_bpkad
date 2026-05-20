import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-fin-border bg-fin-page px-2.5 py-2 text-sm text-fin-text-primary transition-all outline-none placeholder:text-fin-text-muted/30 focus:border-ds-focus-ring/50 disabled:cursor-not-allowed disabled:bg-fin-subtle/50 disabled:opacity-50 aria-invalid:border-fin-expense",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
