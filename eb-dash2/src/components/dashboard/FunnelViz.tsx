import { cn } from '@/lib/utils'

export interface FunnelStep {
  label: string
  count: number
  stepPct: number | null   // conversao da etapa anterior
  totalPct: number         // % do primeiro passo
  onClick?: () => void
  cost?: string            // custo unitário formatado, ex: "R$ 1,2k"
}

interface FunnelVizProps {
  steps: FunnelStep[]
  loading?: boolean
}

// Paleta reduzida Empire: uma escala monocromática sutil com acento primário
const STAGE_COLORS = [
  'var(--empire-primary)',
  'var(--empire-muted)',
  'var(--empire-subtle)',
  'var(--empire-border-strong)',
  'var(--empire-void)',
  'var(--empire-primary)',
]

export function FunnelViz({ steps, loading }: FunnelVizProps) {
  if (loading) {
    return (
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[88px] min-w-[100px] flex-1 rounded-lg bg-empire-elevated animate-pulse"
          />
        ))}
      </div>
    )
  }

  const maxCount = Math.max(...steps.map((s) => s.count), 1)

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
      {steps.map((step, i) => {
        const barPct = Math.max(8, (step.count / maxCount) * 100)
        const stageColor = STAGE_COLORS[i % STAGE_COLORS.length]

        return (
          <button
            key={step.label}
            onClick={step.onClick}
            className={cn(
              'group relative flex min-w-[100px] flex-1 flex-col items-center justify-between rounded-lg border border-empire-border bg-empire-surface',
              'px-2 py-3 hover:border-empire-subtle/40 hover:shadow-sm transition-all cursor-pointer',
              step.cost ? 'h-[108px]' : 'h-[88px]',
            )}
          >
            {/* Label */}
            <span className="text-[11px] font-semibold text-empire-subtle uppercase tracking-wider leading-none text-center">
              {step.label}
            </span>

            {/* Count — hero element */}
            <span className="font-mono text-xl font-bold text-empire-void leading-none tabular-nums">
              {step.count}
            </span>

            {/* Custo unitário */}
            {step.cost && (
              <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: stageColor }}>
                {step.cost}
              </span>
            )}

            {/* Bar + percentages */}
            <div className="w-full space-y-1">
              {/* Proportional bar */}
              <div className="h-1 w-full rounded-full bg-empire-border overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${barPct}%`, backgroundColor: stageColor }}
                />
              </div>
              {/* Percentages row */}
              <div className="flex items-center justify-center gap-1.5">
                <span className="font-mono text-[11px] tabular-nums text-empire-subtle">
                  {step.totalPct}%
                </span>
                {step.stepPct !== null && (
                  <>
                    <span className="text-[11px] text-empire-border">/</span>
                    <span
                      className="font-mono text-[11px] font-semibold tabular-nums"
                      style={{ color: stageColor }}
                    >
                      {step.stepPct}%
                    </span>
                  </>
                )}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
