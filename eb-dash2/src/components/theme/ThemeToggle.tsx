import { useTheme } from 'next-themes'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ThemeToggleProps {
  variant?: 'icon' | 'segmented'
  className?: string
}

export function ThemeToggle({ variant = 'icon', className }: ThemeToggleProps) {
  const { theme, setTheme, resolvedTheme } = useTheme()
  // Evita hydration mismatch sem setState em effect (SPA: window só existe no cliente)
  const [mounted] = useState(() => typeof window !== 'undefined')

  if (!mounted) {
    return (
      <div className={cn('h-8 w-8 animate-pulse rounded-md bg-empire-elevated', className)} />
    )
  }

  if (variant === 'segmented') {
    const options = [
      { value: 'light', icon: Sun, label: 'Claro' },
      { value: 'dark', icon: Moon, label: 'Escuro' },
      { value: 'system', icon: Monitor, label: 'Sistema' },
    ] as const

    return (
      <div
        className={cn(
          'inline-flex items-center rounded-lg border border-empire-border bg-empire-elevated p-0.5',
          className
        )}
      >
        {options.map((opt) => {
          const Icon = opt.icon
          const active = theme === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                active
                  ? 'bg-empire-surface text-empire-void shadow-sm'
                  : 'text-empire-subtle hover:text-empire-void'
              )}
              title={opt.label}
              aria-label={opt.label}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{opt.label}</span>
            </button>
          )
        })}
      </div>
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-lg border border-empire-border',
        'bg-empire-surface text-empire-muted transition-all hover:text-empire-void hover:border-empire-border-strong',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
        className
      )}
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
