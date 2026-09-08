import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  variant?: 'default' | 'glowing'
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant = 'default', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // input-text recipe: bg branco, borda #E4E4E4, 16px/1.5/400, radius 24px, foco borda+ring #820AD1
          'flex h-11 w-full px-4 py-2 text-base font-body transition-colors',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-none focus-visible:ring-2',
          'bg-empire-surface border border-empire-border',
          'text-empire-void placeholder:text-empire-subtle',
          'focus-visible:border-empire-primary focus-visible:bg-empire-surface',
          'rounded-md',
          variant === 'glowing' ? 'focus-visible:ring-empire-primary/50' : 'focus-visible:ring-empire-primary/30',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
