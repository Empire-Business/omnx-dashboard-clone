import { cn } from '@/lib/utils'
import type { RecuperacaoMode } from '@/lib/constants'

// Seletor de 3 estados para tratar os leads da pipeline "Recuperação"
// (leads antigos reativados). Usado em Vendas e Aquisição. A escolha é salva
// por conta via useDashboardPrefs. Default = "Sem recuperação" (comportamento histórico).

const OPTIONS: { value: RecuperacaoMode; label: string; tooltip: string }[] = [
  {
    value: 'exclude_recuperacao',
    label: 'Sem recuperação',
    tooltip: 'Mostra tudo, EXCETO os leads de Recuperação (leads antigos reativados). É o comportamento padrão do painel.',
  },
  {
    value: 'include_recuperacao',
    label: 'Com recuperação',
    tooltip: 'Mostra TUDO, incluindo os leads de Recuperação junto com os demais.',
  },
  {
    value: 'only_recuperacao',
    label: 'Só recuperação',
    tooltip: 'Mostra APENAS os leads de Recuperação (leads antigos reativados).',
  },
]

interface RecuperacaoFilterProps {
  value: RecuperacaoMode
  onChange: (mode: RecuperacaoMode) => void
  className?: string
}

export function RecuperacaoFilter({ value, onChange, className }: RecuperacaoFilterProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-xs font-medium text-empire-subtle">Recuperação:</span>
      <div className="flex items-center rounded-lg border border-empire-border p-0.5">
        {OPTIONS.map((opt) => (
          <div key={opt.value} className="relative group">
            <button
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={value === opt.value}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                value === opt.value
                  ? 'bg-empire-primary text-empire-primary-foreground shadow-sm'
                  : 'text-empire-subtle hover:text-empire-void',
              )}
            >
              {opt.label}
            </button>
            <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-64 -translate-x-1/2 rounded-lg border border-empire-border bg-empire-surface px-3 py-2 text-[11px] leading-relaxed text-empire-muted opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
              {opt.tooltip}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
