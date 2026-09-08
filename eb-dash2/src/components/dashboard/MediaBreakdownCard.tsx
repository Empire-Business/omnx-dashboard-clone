import { cn } from '@/lib/utils'
import { buildLabelColorMap } from '@/lib/utils/colors'
import type { OppRow } from '@/hooks/useTrafego'

export interface MediaBreakdownRow {
  reason: string
  count: number
  leads: OppRow[]
}

export interface MediaBreakdownCardProps {
  title: string
  subtitle?: string
  data: MediaBreakdownRow[]
  valueFormatter?: (v: number) => string
  onRowClick?: (reason: string, leads: OppRow[]) => void
  /** Seletor opcional de origem (ex.: "instagram", "Tráfego Pago") */
  origins?: string[]
  selectedOrigin?: string
  onOriginChange?: (origin: string) => void
  emptyMsg?: string
}

export const ALL_ORIGINS = '__all__'

export function MediaBreakdownCard({
  title,
  subtitle,
  data,
  valueFormatter,
  onRowClick,
  origins,
  selectedOrigin = ALL_ORIGINS,
  onOriginChange,
  emptyMsg,
}: MediaBreakdownCardProps) {
  const format = (v: number) => (valueFormatter ? valueFormatter(v) : String(Math.round(v)))

  const rows = [...data].sort((a, b) => b.count - a.count)
  const total = rows.reduce((acc, r) => acc + r.count, 0)
  const max = Math.max(...rows.map((r) => r.count), 1)
  // Cor por rótulo de mídia, consistente com os demais gráficos.
  const colorMap = buildLabelColorMap(rows.map((r) => r.reason))

  return (
    <div className="w-full rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-empire-border">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-empire-void">{title}</h4>
            <p className="text-xs text-empire-subtle mt-0.5">
              {subtitle ?? 'De onde o lead veio dentro do canal (bio, direct, stories…)'}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {origins && origins.length > 0 && onOriginChange && (
              <select
                value={selectedOrigin}
                onChange={(e) => onOriginChange(e.target.value)}
                className="rounded-lg border border-empire-border bg-empire-elevated px-2.5 py-1.5 text-[11px] font-medium text-empire-void cursor-pointer max-w-[180px]"
              >
                <option value={ALL_ORIGINS}>Todas as origens</option>
                {origins.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            )}
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-empire-subtle">Total</p>
              <p className="font-mono text-sm font-bold text-empire-void">{format(total)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Rows */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <p className="text-sm text-empire-subtle">{emptyMsg ?? 'Sem dados de mídia no período.'}</p>
        </div>
      ) : (
        <div className="divide-y divide-empire-border">
          {rows.map((r) => {
            const pct = total > 0 ? (r.count / total) * 100 : 0
            const width = (r.count / max) * 100
            const color = colorMap.get(r.reason) ?? 'var(--series-1)'
            return (
              <button
                key={r.reason}
                onClick={() => onRowClick?.(r.reason, r.leads)}
                disabled={!onRowClick}
                className={cn(
                  'w-full text-left px-4 sm:px-6 py-2.5 transition-colors',
                  onRowClick ? 'cursor-pointer hover:bg-empire-elevated/60' : 'cursor-default',
                )}
              >
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    <span className="text-xs font-medium text-empire-void truncate">{r.reason}</span>
                  </span>
                  <span className="flex items-baseline gap-2 shrink-0">
                    <span className="font-mono text-xs font-bold text-empire-void">{format(r.count)}</span>
                    <span className="font-mono text-[10px] text-empire-subtle">{pct.toFixed(1)}%</span>
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-empire-elevated overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${width}%`, backgroundColor: color, transition: 'width 250ms ease' }}
                  />
                </div>
              </button>
            )
          })}
        </div>
      )}

      <div className="px-4 sm:px-6 py-3 border-t border-empire-border bg-empire-elevated/50">
        <p className="text-[11px] text-empire-subtle text-center">
          {rows.length} mídias no período{onRowClick ? ' · clique numa linha para ver os leads' : ''}
        </p>
      </div>
    </div>
  )
}
