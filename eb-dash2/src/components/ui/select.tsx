import { useState, useRef, useEffect, useCallback, createContext, useContext, Children, isValidElement } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

// Resolve o rótulo amigável do SelectItem cujo `value` bate com o valor atual —
// necessário porque `value` pode chegar de fora (prop, ex: campo já mapeado
// carregado do banco) sem nunca passar por handleSelect/onClick.
function findLabelForValue(children: ReactNode, value: string): string | null {
  let found: string | null = null
  Children.forEach(children, (child) => {
    if (found !== null || !isValidElement(child)) return
    const props = child.props as { value?: string; children?: ReactNode }
    if (props.value === value) {
      found = typeof props.children === 'string' ? props.children : String(props.children ?? value)
    }
  })
  return found
}

// ─── Context ─────────────────────────────────────────────────

interface SelectContextValue {
  value: string
  open: boolean
  onSelect: (value: string) => void
  close: () => void
}

const SelectContext = createContext<SelectContextValue>({
  value: '',
  open: false,
  onSelect: () => {},
  close: () => {},
})

// ─── Select root ─────────────────────────────────────────────

interface SelectProps {
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  children?: ReactNode
  className?: string
  disabled?: boolean
}

function Select({ value, onValueChange, placeholder = 'Selecione...', children, className, disabled }: SelectProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    if (open) document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, close])

  const displayLabel = value ? (findLabelForValue(children, value) ?? '') : ''

  const handleSelect = useCallback((val: string) => {
    onValueChange(val)
    setOpen(false)
  }, [onValueChange])

  return (
    <SelectContext.Provider value={{ value, open, onSelect: handleSelect, close }}>
      <div ref={ref} className={cn('relative w-full', className)}>
        {/* Trigger */}
        <button
          type="button"
          onClick={() => !disabled && setOpen(o => !o)}
          disabled={disabled}
          className={cn(
            'flex w-full items-center justify-between px-3 py-2 text-sm min-h-[38px]',
            'bg-empire-surface border border-empire-border rounded-md',
            'text-empire-void placeholder:text-empire-subtle',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'transition-all duration-200 focus:outline-none focus-visible:border-empire-primary focus-visible:ring-2 focus-visible:ring-empire-primary/20',
            'hover:border-empire-primary/40',
            open && 'border-empire-primary ring-2 ring-empire-primary/20'
          )}
        >
          <span className={cn('truncate text-left', !value && 'text-empire-subtle')}>
            {value ? (displayLabel || value) : placeholder}
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 ml-2 text-empire-subtle transition-transform duration-200', open && 'rotate-180')}
          />
        </button>

        {/* Dropdown */}
        {open && (
          <div
            className="absolute z-50 mt-1 w-full min-w-[160px] overflow-hidden rounded-md border border-empire-border bg-empire-surface shadow-lg"
          >
            <div className="max-h-60 overflow-y-auto p-1">
              {children}
            </div>
          </div>
        )}
      </div>
    </SelectContext.Provider>
  )
}

// ─── SelectContent ────────────────────────────────────────────

function SelectContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}

// ─── SelectItem ───────────────────────────────────────────────

function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  const ctx = useContext(SelectContext)
  const selected = ctx.value === value

  return (
    <button
      type="button"
      onClick={() => ctx.onSelect(value)}
      className={cn(
        'flex w-full items-center gap-2 px-3 py-2 text-sm text-left rounded-md',
        'transition-colors duration-150',
        selected
          ? 'bg-empire-primary/10 text-empire-primary'
          : 'text-empire-void hover:bg-empire-hover'
      )}
    >
      <Check
        className={cn('h-4 w-4 shrink-0 text-empire-primary', selected ? 'opacity-100' : 'opacity-0')}
      />
      {children}
    </button>
  )
}

// ─── SelectValue (for external trigger pattern) ──────────────

function SelectValue({ placeholder }: { placeholder?: string }) {
  const { value } = useContext(SelectContext)
  return (
    <span className={cn(!value && 'text-empire-subtle')}>
      {value || placeholder || 'Selecione...'}
    </span>
  )
}

// ─── SelectTrigger (for external trigger pattern) ────────────

function SelectTrigger({ className, children }: { className?: string; children: ReactNode }) {
  const { open } = useContext(SelectContext)
  return (
    <div
      className={cn(
        'flex w-full items-center justify-between px-3 py-2 text-sm cursor-pointer transition-all duration-200',
        'bg-empire-surface border border-empire-border rounded-md',
        open && 'border-empire-primary ring-2 ring-empire-primary/20',
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn('h-4 w-4 shrink-0 ml-2 text-empire-subtle transition-transform duration-200', open && 'rotate-180')}
      />
    </div>
  )
}

export type { SelectProps }
export { Select, SelectContent, SelectItem, SelectValue, SelectTrigger }
