import { cn } from '@/lib/utils'

const TOOLTIPS = {
  cohort: 'Cohort agrupa leads pela data em que foram GERADOS. Responde: "O que aconteceu com os leads gerados nesse período?" Ideal para avaliar qualidade de aquisição e ROI de campanhas. Na aba Reuniões, o cohort é pela data da reunião agendada (não pela data de geração do lead).',
  produtividade: 'Produtividade conta o que ACONTECEU no período selecionado. Cada métrica usa a data do próprio evento e respeita apenas os filtros ativos. Leads/MQLs não podem limitar os números operacionais.',
} as const

interface CohortProdToggleProps {
  activePanel: 'cohort' | 'produtividade'
  setActivePanel: (panel: 'cohort' | 'produtividade') => void
  /** Visual variant — 'compact' for segmented control, 'card' for bordered card layout */
  variant?: 'compact' | 'card'
}

export function CohortProdToggle({ activePanel, setActivePanel, variant = 'compact' }: CohortProdToggleProps) {
  if (variant === 'card') {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-elevated p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-empire-void">Modo de visualização:</span>
          {(['cohort', 'produtividade'] as const).map((v) => (
            <div key={v} className="relative group">
              <button
                onClick={() => setActivePanel(v)}
                className={cn(
                  'rounded-lg border px-4 py-2 text-sm font-semibold transition-all',
                  activePanel === v
                    ? 'border-empire-primary bg-empire-primary/15 text-empire-primary shadow-sm'
                    : 'border-empire-border bg-empire-surface text-empire-subtle hover:border-empire-muted hover:text-empire-void',
                )}
              >
                {v === 'cohort' ? 'Cohort' : 'Produtividade'}
              </button>
              <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border border-empire-border bg-empire-surface px-3 py-2 text-[11px] leading-relaxed text-empire-muted opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
                {TOOLTIPS[v]}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // variant === 'compact' — segmented control (default)
  return (
    <div className="mr-2 flex items-center rounded-lg border border-empire-border p-0.5">
      {(['cohort', 'produtividade'] as const).map((v) => (
        <div key={v} className="relative group">
          <button
            onClick={() => setActivePanel(v)}
            className={cn(
              'rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
              activePanel === v
                ? 'bg-empire-primary text-empire-primary-foreground shadow-sm'
                : 'text-empire-subtle hover:text-empire-void',
            )}
          >
            {v === 'cohort' ? 'Cohort' : 'Produtividade'}
          </button>
          <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-72 -translate-x-1/2 rounded-lg border border-empire-border bg-empire-surface px-3 py-2 text-[11px] leading-relaxed text-empire-muted opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100">
            {TOOLTIPS[v]}
          </div>
        </div>
      ))}
    </div>
  )
}
