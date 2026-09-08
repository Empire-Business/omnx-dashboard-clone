import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Pencil, Check } from 'lucide-react'
import type { IdealDiaResult, CostMqlPoint } from '@/hooks/useTrafego'

// ─── Mini SVG Line Chart ──────────────────────────────────────

function MiniLineChart({
  series,
  metaLineValue,
}: {
  series: CostMqlPoint[]
  metaLineValue: number
}) {
  const W = 280
  const H = 80
  const PAD = 4

  const validSeries = series.filter((p) => p.costPerMql > 0)
  if (!validSeries.length) return null

  const maxVal = Math.max(...series.map((p) => p.costPerMql), metaLineValue || 0, 1)

  const toX = (i: number) =>
    PAD + (i / Math.max(series.length - 1, 1)) * (W - PAD * 2)
  const toY = (v: number) =>
    H - PAD - (v / maxVal) * (H - PAD * 2)

  const points = series
    .map((p, i) => {
      const y = p.costPerMql > 0 ? toY(p.costPerMql) : null
      return y !== null ? `${toX(i).toFixed(1)},${y.toFixed(1)}` : null
    })
    .filter(Boolean)
    .join(' ')

  const metaY = toY(metaLineValue)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: `${H}px` }}>
      {/* Meta dashed line */}
      {metaLineValue > 0 && (
        <line
          x1={PAD}
          y1={metaY}
          x2={W - PAD}
          y2={metaY}
          stroke="var(--empire-primary)"
          strokeOpacity="0.6"
          strokeWidth="1"
          strokeDasharray="4,3"
        />
      )}
      {/* Actual polyline */}
      {points && (
        <polyline
          points={points}
          fill="none"
          stroke="var(--empire-void)"
          strokeOpacity="0.5"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

// ─── Main Component ───────────────────────────────────────────

interface Props {
  label: string
  atual: number
  meta: number
  formatValue: (v: number) => string
  lowerIsBetter?: boolean
  idealDia?: IdealDiaResult
  series?: CostMqlPoint[]
  metaLineValue?: number
  loading?: boolean
  onEditMeta?: (v: number) => void
}

export function MetaProgressCard({
  label,
  atual,
  meta,
  formatValue,
  lowerIsBetter,
  idealDia,
  series,
  metaLineValue,
  loading,
  onEditMeta,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')

  const pct = meta > 0 ? Math.round((atual / meta) * 100) : 0
  const isGood = lowerIsBetter ? atual <= meta : atual >= meta
  const barColor = isGood ? 'bg-empire-success' : 'bg-empire-warning'
  const pctColor = isGood ? 'text-empire-success' : 'text-empire-warning'

  const handleEdit = () => {
    setInputVal(String(Math.round(meta)))
    setEditing(true)
  }

  const handleSave = () => {
    const val = parseFloat(inputVal.replace(',', '.'))
    if (!isNaN(val) && val > 0) {
      onEditMeta?.(val)
    }
    setEditing(false)
  }

  if (loading) {
    return <Skeleton className="h-32 w-full rounded-xl" />
  }

  return (
    <div className="space-y-3 rounded-xl border border-empire-border bg-empire-surface p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-empire-subtle">
          {label}
        </span>
        {onEditMeta && (
          <button
            onClick={handleEdit}
            className="flex h-6 w-6 items-center justify-center rounded text-empire-subtle transition-colors hover:bg-empire-elevated hover:text-empire-void"
            title="Editar meta"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Values row */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-[1.75rem] font-bold leading-none text-empire-void">{formatValue(atual)}</span>
        <div className="flex items-center gap-2">
          {editing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                  if (e.key === 'Escape') setEditing(false)
                }}
                onBlur={handleSave}
                autoFocus
                className="h-7 w-24 rounded border border-empire-border bg-empire-elevated px-2 text-xs text-empire-void focus:border-empire-primary focus:outline-none"
              />
              <button
                onClick={handleSave}
                className="text-empire-primary transition-colors hover:text-empire-primary-hover"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-empire-muted">
              Meta: {meta > 0 ? formatValue(meta) : <em className="opacity-50">não definida</em>}
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {meta > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-empire-border">
            <div
              className={cn('h-full rounded-full transition-all duration-500', barColor)}
              style={{ width: `${Math.min(pct, 100)}%` }}
            />
          </div>
          <span className={cn('text-xs font-medium', pctColor)}>{pct}%</span>
        </div>
      )}

      {/* Ideal-dia row */}
      {idealDia && meta > 0 && (
        <div className="text-xs leading-relaxed text-empire-muted">
          Ideal hoje:{' '}
          <span className="font-medium text-empire-void">{idealDia.idealAcumulado}</span>
          {' · '}Atual:{' '}
          <span className="font-medium text-empire-void">{idealDia.atual}</span>
          {' · '}
          <span
            className={cn(
              'font-semibold',
              idealDia.delta >= 0 ? 'text-empire-success' : 'text-empire-warning'
            )}
          >
            {idealDia.delta >= 0 ? '+' : ''}
            {idealDia.delta}
          </span>
        </div>
      )}

      {/* Mini chart */}
      {series && series.length > 1 && (
        <div className="border-t border-empire-border pt-1">
          <MiniLineChart series={series} metaLineValue={metaLineValue ?? 0} />
        </div>
      )}
    </div>
  )
}
