import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const skeletonVariants = cva(
  'animate-pulse bg-empire-elevated relative overflow-hidden',
  {
    variants: {
      variant: {
        default: 'rounded-lg',
        circle: 'rounded-full',
        text: 'rounded-md h-4 w-full',
        avatar: 'rounded-full h-10 w-10',
        card: 'rounded-xl h-32 w-full',
        button: 'rounded-lg h-9 w-24',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface SkeletonProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof skeletonVariants> {
  shimmer?: boolean
}

function Skeleton({ className, variant, shimmer = true, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(skeletonVariants({ variant }), className)}
      {...props}
    >
      {shimmer && (
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-empire-surface/40 to-transparent" />
      )}
    </div>
  )
}

export { Skeleton }
