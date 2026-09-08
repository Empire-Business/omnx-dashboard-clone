import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DialogProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

function Dialog({ open, onClose, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-8">
      {/* Backdrop */}
      <div
        ref={overlayRef}
        className="absolute inset-0 animate-fade-in bg-empire-void/40 backdrop-blur-sm"
        onClick={onClose}
      />
      {children}
    </div>
  )
}

interface DialogContentProps {
  children: ReactNode
  className?: string
}

function DialogContent({ children, className }: DialogContentProps) {
  return (
    <div
      className={cn(
        'relative z-10 w-full max-w-lg animate-fade-in-up rounded-lg border border-empire-border bg-empire-surface shadow-xl',
        className
      )}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  )
}

interface DialogHeaderProps {
  children: ReactNode
  onClose?: () => void
  className?: string
}

function DialogHeader({ children, onClose, className }: DialogHeaderProps) {
  return (
    <div
      className={cn('flex items-start justify-between p-6 border-b border-empire-border', className)}
    >
      <div className="space-y-1 pr-4">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-empire-subtle transition-colors duration-200 hover:bg-empire-hover hover:text-empire-void focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  )
}

function DialogTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={cn('text-lg font-semibold text-empire-void', className)}
    >
      {children}
    </h2>
  )
}

function DialogDescription({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('text-sm text-empire-muted', className)}>
      {children}
    </p>
  )
}

function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn('flex items-center justify-end gap-3 p-6 border-t border-empire-border', className)}
    >
      {children}
    </div>
  )
}

function DialogBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-6 space-y-4', className)}>{children}</div>
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody }
