import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const cardVariants = cva(
  // card recipe: bg #FFFFFF, borda #E4E4E4, radius 32px, padding 0.75em
  'relative overflow-hidden rounded-lg border text-empire-void transition-all duration-200',
  {
    variants: {
      variant: {
        default:
          'glass-card border-empire-border bg-empire-surface shadow-sm',
        elevated:
          'glass-card border-empire-border bg-empire-surface shadow-md',
        interactive:
          'glass-card border-empire-border bg-empire-surface shadow-sm cursor-pointer hover:border-empire-border-strong hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] active:translate-y-0',
        accent:
          'border-empire-primary/20 shadow-sm bg-empire-primary/[0.03]',
        metric:
          'glass-card border-empire-border bg-empire-elevated',
        glass:
          'glass-card border-empire-border bg-empire-surface',
        glowing:
          'glass-card empire-glow-gold border-empire-primary/20 bg-empire-surface shadow-lg',
        dark:
          'glass-card border-empire-border bg-empire-surface shadow-md',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(cardVariants({ variant, className }))}
        {...props}
      >
        {children}
      </div>
    )
  }
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col space-y-1.5 p-6', className)}
    {...props}
  />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn('font-display text-lg font-semibold leading-tight text-empire-void', className)}
    {...props}
  />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-empire-muted', className)}
    {...props}
  />
))
CardDescription.displayName = 'CardDescription'

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center p-6 pt-0', className)}
    {...props}
  />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
