import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

/**
 * Input primitif — gunakan langsung atau via <InputField> untuk label+error.
 *
 * Height standar: h-input (40px via --height-input).
 * Focus ring standar: ring-ds-focus-ring/20 + border-ds-focus-ring.
 */
const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <InputPrimitive
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          // Layout
          "flex h-input w-full min-w-0 px-3 py-2",
          // Shape & border
          "rounded-lg border border-fin-border bg-fin-page",
          // Typography
          "text-sm text-fin-text-primary",
          "placeholder:text-fin-text-muted/50",
          // Transitions
          "transition-all duration-150 outline-none",
          // Focus — single consistent focus ring
          "focus:border-ds-focus-ring/60 focus:ring-2 focus:ring-ds-focus-ring/15",
          // States
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-fin-subtle/50 disabled:opacity-50",
          "aria-invalid:border-fin-expense aria-invalid:ring-2 aria-invalid:ring-fin-expense/20",
          className
        )}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
