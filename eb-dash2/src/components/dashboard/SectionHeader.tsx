import { cn } from '@/lib/utils'

interface SectionHeaderProps {
  title: string
  description?: string
  badge?: React.ReactNode
  className?: string
}

export function SectionHeader({ title, description, badge, className }: SectionHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex items-center gap-3">
        <div className="w-0.5 h-5 rounded-full bg-empire-primary" />
        <div>
          <h3 className="text-sm font-semibold tracking-tight text-empire-void text-balance">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-empire-muted leading-relaxed text-balance">{description}</p>
          )}
        </div>
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
  )
}
