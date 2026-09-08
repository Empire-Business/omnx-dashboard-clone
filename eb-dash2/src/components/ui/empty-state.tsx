import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-empire-border bg-empire-elevated">
        <Icon className="h-7 w-7 text-empire-subtle" />
      </div>
      <p className="text-sm font-semibold text-empire-void">{title}</p>
      {description && (
        <p className="mt-1 max-w-xs text-xs text-empire-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
