import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

type KpiVariant = 'default' | 'success' | 'warning' | 'danger' | 'highlight' | 'info'

interface KpiCardProps {
  label: string
  value: string
  icon: React.ElementType
  loading: boolean
  variant?: KpiVariant
  delta?: { value: string; positive: boolean }
  subValue?: string
  subText?: string
  onClick?: () => void
  className?: string
}

const variantStyles: Record<
  KpiVariant,
  { card: string; icon: string; value: string; accent: string }
> = {
  default: {
    card: 'bg-empire-surface border-empire-border',
    icon: 'text-empire-subtle',
    value: 'text-empire-void',
    accent: 'bg-empire-border',
  },
  highlight: {
    card: 'bg-empire-surface border-empire-primary/15',
    icon: 'text-empire-primary',
    value: 'text-empire-primary',
    accent: 'bg-empire-primary',
  },
  success: {
    card: 'bg-empire-surface border-empire-border',
    icon: 'text-empire-success',
    value: 'text-empire-success',
    accent: 'bg-empire-success',
  },
  warning: {
    card: 'bg-empire-surface border-empire-border',
    icon: 'text-empire-warning',
    value: 'text-empire-warning',
    accent: 'bg-empire-warning',
  },
  danger: {
    card: 'bg-empire-surface border-empire-border',
    icon: 'text-empire-danger',
    value: 'text-empire-danger',
    accent: 'bg-empire-danger',
  },
  info: {
    card: 'bg-empire-surface border-empire-border',
    icon: 'text-empire-info',
    value: 'text-empire-info',
    accent: 'bg-empire-info',
  },
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  loading,
  variant = 'default',
  delta,
  subValue,
  subText,
  onClick,
  className,
}: KpiCardProps) {
  const styles = variantStyles[variant]

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-lg border px-3.5 py-3 transition-all duration-150',
        styles.card,
        'hover:shadow-sm hover:-translate-y-px',
        onClick && 'cursor-pointer',
        className,
      )}
      onClick={onClick}
    >
      {/* Top accent line */}
      <div className={cn('absolute top-0 left-0 right-0 h-[2px]', styles.accent)} />

      {/* Label + icon row */}
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', styles.icon)} />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-empire-subtle leading-none">
          {label}
        </span>
      </div>

      {/* Value */}
      {loading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span
            className={cn(
              'font-mono text-xl font-bold leading-none tracking-tight tabular-nums',
              styles.value,
            )}
          >
            {value}
          </span>
          {delta && (
            <span
              className={cn(
                'inline-flex items-center rounded px-1 py-px text-xs font-bold leading-none',
                delta.positive
                  ? 'bg-empire-success/10 text-empire-success'
                  : 'bg-empire-danger/10 text-empire-danger',
              )}
            >
              {delta.positive ? '+' : ''}
              {delta.value}
            </span>
          )}
        </div>
      )}

      {/* Sub-values */}
      {subValue && !loading && (
        <p className="mt-1.5 text-[11px] text-empire-muted leading-tight">
          {subValue}
        </p>
      )}
      {subText && !loading && (
        <p className="mt-px text-[11px] text-empire-subtle leading-tight">{subText}</p>
      )}
    </div>
  )
}
