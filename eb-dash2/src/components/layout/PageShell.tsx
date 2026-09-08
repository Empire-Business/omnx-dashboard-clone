import { cn } from '@/lib/utils'

interface PageShellProps {
  title?: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  actions?: React.ReactNode
  tabs?: React.ReactNode
  className?: string
  contentClassName?: string
}

export function PageShell({
  title,
  description,
  children,
  actions,
  tabs,
  className,
  contentClassName,
}: PageShellProps) {
  return (
    <div className={cn('space-y-6', className)}>
      {(title || description || actions || tabs) && (
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            {title && (
              <h1 className="font-display text-2xl font-semibold tracking-tight text-empire-void">
                {title}
              </h1>
            )}
            {description && (
              <p className="text-sm text-empire-muted">{description}</p>
            )}
            {tabs && <div className="pt-2">{tabs}</div>}
          </div>
          {actions && (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      <div className={cn(contentClassName)}>{children}</div>
    </div>
  )
}
