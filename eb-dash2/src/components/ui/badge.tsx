/* eslint-disable react-refresh/only-export-components -- arquivo exporta Provider+hook/variantes por padrão de projeto */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  // badge-default: bg #3E1874, texto #777777, borda #E4E4E4, radius 9999px, padding 0.5rem (recipe)
  'inline-flex items-center gap-1 rounded-full border font-sans text-[11px] font-medium px-2.5 py-1 transition-colors focus:outline-none focus:ring-2 focus:ring-empire-primary/50 focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-empire-border bg-empire-elevated text-empire-void',
        secondary:
          'border-empire-border bg-empire-elevated text-empire-muted',
        outline:
          'border-empire-border bg-transparent text-empire-muted',
        gold:
          'border-transparent bg-empire-primary text-empire-primary-foreground',
        success:
          'border-transparent bg-empire-success text-white',
        warning:
          'border-empire-warning/30 bg-empire-warning-soft text-empire-warning',
        destructive:
          'border-transparent bg-empire-danger text-white',
        info:
          'border-empire-info/30 bg-empire-info-soft text-empire-info',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
