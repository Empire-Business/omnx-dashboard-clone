import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface PageTab {
  label: string
  value: string
  href?: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  icon?: LucideIcon
}

interface PageTabsProps {
  tabs: PageTab[]
  variant?: 'pill' | 'underline'
  className?: string
}

export function PageTabs({ tabs, variant = 'pill', className }: PageTabsProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1 overflow-x-auto scrollbar-hide',
        variant === 'underline' && 'border-b border-empire-border',
        className
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const Comp = tab.href ? 'a' : 'button'
        const Icon = tab.icon
        return (
          <Comp
            key={tab.value}
            role="tab"
            aria-selected={tab.active}
            aria-disabled={tab.disabled}
            href={tab.href}
            onClick={tab.onClick}
            disabled={tab.disabled}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-2 px-3 py-1.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
              variant === 'pill' &&
                'rounded-lg',
              variant === 'pill' && tab.active
                ? 'bg-empire-primary/10 text-empire-primary'
                : 'text-empire-muted hover:bg-empire-elevated hover:text-empire-void',
              variant === 'underline' && 'rounded-t-lg border-b-2 border-transparent pb-2.5 pt-1.5',
              variant === 'underline' && tab.active
                ? 'border-empire-primary text-empire-void'
                : 'text-empire-muted hover:text-empire-void',
              tab.disabled && 'pointer-events-none opacity-50'
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            {tab.label}
          </Comp>
        )
      })}
    </div>
  )
}
