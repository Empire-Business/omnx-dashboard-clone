import { cn } from '@/lib/utils'
import { GOAL_AREA_META, GOAL_STATUS_META, formatGoalDelta, formatGoalValue } from '@/lib/goals/catalog'
import type {
  GoalDefinition,
  GoalMetricDefinition,
  GoalPerformanceResult,
  GoalVersion,
} from '@/lib/goals/types'
import { fmtDate } from '@/lib/utils/dates'
import { Pencil, TrendingDown, TrendingUp } from 'lucide-react'

function GoalMiniChart({
  points,
  target,
}: {
  points: GoalPerformanceResult['series']
  target: number
}) {
  if (points.length < 2) return null

  const width = 360
  const height = 120
  const padding = 8
  const values = points.map((point) => point.cumulativeActual ?? point.actual)
  const maxValue = Math.max(...values, target, 1)

  const polyline = points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2)
      const rawValue = point.cumulativeActual ?? point.actual
      const y = height - padding - (rawValue / maxValue) * (height - padding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  const targetY = height - padding - (target / maxValue) * (height - padding * 2)

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[120px] w-full">
      <line
        x1={padding}
        y1={targetY}
        x2={width - padding}
        y2={targetY}
        stroke="color-mix(in srgb, var(--empire-warning) 50%, transparent)"
        strokeDasharray="4,4"
        strokeWidth="1"
      />
      <polyline
        points={polyline}
        fill="none"
        stroke="color-mix(in srgb, var(--empire-void) 82%, transparent)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface Props {
  metric: GoalMetricDefinition
  definition: GoalDefinition
  version: GoalVersion
  performance?: GoalPerformanceResult | null
  onEdit?: () => void
}

export function GoalPerformanceCard({
  metric,
  definition,
  version,
  performance,
  onEdit,
}: Props) {
  const areaMeta = GOAL_AREA_META[metric.area_key]
  const statusMeta = GOAL_STATUS_META[performance?.status ?? 'no_data']
  const actualLabel = formatGoalValue(performance?.actualValue, metric.unit)
  const targetLabel = formatGoalValue(version.target_value, metric.unit)
  const deltaLabel = formatGoalDelta(performance?.delta, metric.target_direction, metric.unit)
  const deltaIsBad = performance?.status === 'off_track'

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-empire-border bg-empire-surface p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="absolute inset-x-0 top-0 h-[3px]" style={{ background: 'var(--empire-primary)' }} />

      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-empire-primary">
                {areaMeta.label}
              </span>
              <span
                className={cn(
                  'rounded-[var(--radius-sm)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]',
                  statusMeta.className
                )}
              >
                {statusMeta.label}
              </span>
            </div>

            <div>
              <h3 className="font-display text-[1.75rem] font-semibold leading-[1.1] text-empire-void">
                {metric.metric_name}
              </h3>
              <p className="mt-1 text-xs text-empire-subtle">
                {definition.scope_label} · {fmtDate(version.period_start)} a {fmtDate(version.period_end)}
              </p>
            </div>
          </div>

          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-empire-border px-3 py-2 text-xs font-medium text-empire-subtle transition-all hover:bg-empire-elevated hover:text-empire-void"
              title="Editar meta"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-[1.4fr,1fr]">
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-empire-border bg-empire-elevated px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-empire-subtle">Atual</p>
                <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-empire-void">{actualLabel}</p>
              </div>
              <div className="rounded-lg border border-empire-border bg-empire-elevated px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-empire-subtle">Meta</p>
                <p className="mt-2 font-display text-[2rem] font-semibold leading-none text-empire-void">{targetLabel}</p>
              </div>
              <div className="rounded-lg border border-empire-border bg-empire-elevated px-4 py-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-empire-subtle">Delta</p>
                <p
                  className={cn(
                    'mt-2 flex items-center gap-2 font-display text-[2rem] font-semibold leading-none',
                    deltaIsBad
                      ? 'text-empire-danger'
                      : 'text-[var(--empire-success)]'
                  )}
                >
                  {deltaIsBad ? (
                    <TrendingDown className="h-4 w-4" />
                  ) : (
                    <TrendingUp className="h-4 w-4" />
                  )}
                  <span>{deltaLabel}</span>
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-empire-border px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-empire-subtle">Ideal hoje</p>
                <p className="mt-2 text-base font-semibold text-empire-void">
                  {formatGoalValue(performance?.idealValue, metric.unit)}
                </p>
              </div>
              <div className="rounded-lg border border-empire-border px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-empire-subtle">Ideal/dia</p>
                <p className="mt-2 text-base font-semibold text-empire-void">
                  {formatGoalValue(performance?.idealDailyValue, metric.unit)}
                </p>
              </div>
              <div className="rounded-lg border border-empire-border px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.14em] text-empire-subtle">Projeção</p>
                <p className="mt-2 text-base font-semibold text-empire-void">
                  {formatGoalValue(performance?.projectionValue, metric.unit)}
                </p>
              </div>
            </div>

            {performance?.warning && (
              <div className="rounded-lg border border-empire-warning/24 bg-empire-warning/8 px-4 py-3 text-sm text-[var(--empire-warning)]">
                {performance.warning}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-empire-border bg-empire-elevated p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.16em] text-empire-primary">
                  Trajetória
                </p>
                <p className="mt-1 text-sm font-medium text-empire-void">
                  {performance?.progressPct != null
                    ? `${performance.progressPct.toFixed(1)}% da meta`
                    : 'Sem progressão acumulada'}
                </p>
              </div>
            </div>
            <div className="mt-4">
              <GoalMiniChart points={performance?.series ?? []} target={version.target_value} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
