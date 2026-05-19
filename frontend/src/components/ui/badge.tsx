import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-[10px] font-black uppercase tracking-wider whitespace-nowrap transition-all",
  {
    variants: {
      variant: {
        default: "bg-fin-subtle text-fin-text-primary",
        secondary: "bg-fin-page border-fin-border text-fin-text-secondary",
        destructive: "bg-fin-expense-bg text-fin-expense-text border-fin-expense/20",
        outline: "border-fin-border text-fin-text-muted",
        ghost: "hover:bg-fin-subtle text-fin-text-muted",
        link: "text-fin-info hover:underline",
        income: "bg-fin-income-bg text-fin-income-text border-fin-income/20",
        expense: "bg-fin-expense-bg text-fin-expense-text border-fin-expense/20",
        warning: "bg-fin-warning-bg text-fin-warning-text border-fin-warning/20",
        info: "bg-fin-info-bg text-fin-info-text border-fin-info/20",
        surplus: "bg-fin-surplus-bg text-fin-surplus-text border-fin-surplus/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
