/* eslint-disable react-refresh/only-export-components -- arquivo exporta Provider+hook/variantes por padrão de projeto */
import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium font-sans transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-empire-canvas disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]',
  {
    variants: {
      variant: {
        // button-primary — bg #820AD1, texto branco, radius 12px (recipe)
        default:
          'bg-empire-primary text-empire-primary-foreground rounded-sm shadow-sm hover:bg-empire-primary-hover',
        // button-secondary — bg branco, texto preto, sem borda, radius 24px (recipe)
        secondary:
          'border-none bg-secondary text-secondary-foreground rounded-md hover:bg-empire-hover',
        // button-ghost — bg transparente, texto preto, borda transparente, radius 24px (recipe)
        ghost:
          'border border-transparent text-empire-void hover:bg-empire-hover rounded-md',
        // Destructive — usa o slot destructive (#D01D1C), nunca o accent da marca
        destructive:
          'border border-destructive bg-transparent text-destructive rounded-md hover:bg-destructive hover:text-destructive-foreground',
        // Empire gold CTA (alias para default — mantido por compatibilidade)
        gold:
          'bg-empire-primary text-empire-primary-foreground rounded-sm shadow-sm hover:bg-empire-primary-hover',
        // Outline — variante bordada (fora da receita padrão, usada em toolbars/filtros)
        outline:
          'border border-empire-border bg-empire-surface text-empire-primary rounded-md hover:bg-empire-primary/10 hover:border-empire-primary/30',
        // Link style
        link:
          'text-empire-primary underline-offset-4 hover:underline font-medium rounded-none',
        // Premium alias — mesmo que default
        premium:
          'bg-empire-primary text-empire-primary-foreground rounded-sm shadow-sm hover:bg-empire-primary-hover',
      },
      size: {
        // >=44px de altura para satisfazer o alvo de toque AA no caminho principal
        default: 'text-sm px-4 py-3',
        // Densa (toolbars/tabelas) — exceção documentada em docs/DESIGN-SYSTEM-NUBANK.md, >=24x24
        sm:      'text-sm px-3 py-2',
        lg:      'text-base px-7 py-4',
        xl:      'text-sm px-9 py-4 uppercase tracking-wide',
        icon:    'h-11 w-11 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
