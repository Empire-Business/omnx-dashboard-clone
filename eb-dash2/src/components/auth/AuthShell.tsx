import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme/ThemeToggle'

interface AuthShellProps {
  children: ReactNode
  className?: string
}

export function AuthShell({ children, className }: AuthShellProps) {
  return (
    <div
      className={cn(
        'relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8',
        'bg-empire-canvas',
        className
      )}
    >
      {/* Subtle theme-aware ambient background */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-empire-primary/[0.04] via-transparent to-empire-primary/[0.02]" />

      {/* Theme toggle */}
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      {/* Card wrapper */}
      <div className="relative z-10 w-full max-w-md animate-fade-in-up">
        {children}
      </div>
    </div>
  )
}
