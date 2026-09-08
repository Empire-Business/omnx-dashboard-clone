import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GhlPapel } from '@/types/users'
import { PAPEL_CONFIG } from '@/types/users'

const PAPEIS: GhlPapel[] = ['sdr', 'closer', 'social_seller', 'gestor', 'sistema']

interface PapelSelectorProps {
  value: GhlPapel[]
  onChange: (papeis: GhlPapel[]) => void
  disabled?: boolean
}

export function PapelSelector({ value, onChange, disabled }: PapelSelectorProps) {
  const toggle = (papel: GhlPapel) => {
    if (disabled) return
    const next = value.includes(papel)
      ? value.filter(p => p !== papel)
      : [...value, papel]
    onChange(next)
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {PAPEIS.map(papel => {
        const cfg = PAPEL_CONFIG[papel]
        const selected = value.includes(papel)
        return (
          <button
            key={papel}
            type="button"
            onClick={() => toggle(papel)}
            disabled={disabled}
            title={cfg.label}
            className={cn(
              'inline-flex items-center gap-1 rounded-[4px] px-2 py-0.5 text-[11px] font-semibold transition-all',
              'border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
              disabled && 'cursor-default opacity-70'
            )}
            style={{
              color: selected ? cfg.color : 'var(--empire-subtle)',
              background: selected ? cfg.bg : 'transparent',
              borderColor: selected ? cfg.color : 'var(--empire-border)',
            }}
          >
            {selected && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}
