import { useState } from 'react'
import { cn } from '@/lib/utils'
import { buildLabelColorMap } from '@/lib/utils/colors'

const LEGEND_COLLAPSED_MAX = 2

interface DonutChartProps {
  data: { reason: string; count: number; previewUrl?: string; code?: string }[]
  title: string
  note?: string
  onSliceClick?: (reason: string) => void
  /** Quando fornecido, formata o valor numérico nos rótulos (ex: moeda). Afeta centro do donut e legenda. */
  valueFormatter?: (v: number) => string
}

export function DonutChart({ data, title, note, onSliceClick, valueFormatter }: DonutChartProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const [legendExpanded, setLegendExpanded] = useState(false)
  const total = data.reduce((s, d) => s + d.count, 0)

  if (!total) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-surface p-5 h-full">
        <h4 className="text-sm font-semibold text-empire-void mb-4">{title}</h4>
        <div className="flex flex-col items-center py-6">
          <div className="h-20 w-20 rounded-full border-2 border-dashed border-empire-border flex items-center justify-center mb-3">
            <span className="text-xs text-empire-subtle">0</span>
          </div>
          <p className="text-xs text-empire-subtle">Sem dados no periodo.</p>
        </div>
      </div>
    )
  }

  const size = 160
  const cx = size / 2
  const cy = size / 2
  const outerR = 72
  const innerR = 44

  const anyHasPreview = data.some((d) => d.previewUrl)

  // Cor por rótulo (não por posição da fatia): a mesma origem/canal mantém a
  // cor entre este donut, as barras e o gráfico de linhas.
  const colorMap = buildLabelColorMap(data.map((d) => d.reason))

  // Build arc paths for donut
  const slices = data.slice(0, 12).reduce<{
    angle: number
    items: {
      d: string
      color: string
      label: string
      count: number
      pct: number
      previewUrl?: string
      code?: string
    }[]
  }>(
    (acc, item) => {
      const frac = item.count / total
      const angle = frac * 2 * Math.PI
      const startAngle = acc.angle
      const endAngle = startAngle + angle

      const ox1 = cx + outerR * Math.cos(startAngle)
      const oy1 = cy + outerR * Math.sin(startAngle)
      const ox2 = cx + outerR * Math.cos(endAngle)
      const oy2 = cy + outerR * Math.sin(endAngle)

      const ix1 = cx + innerR * Math.cos(endAngle)
      const iy1 = cy + innerR * Math.sin(endAngle)
      const ix2 = cx + innerR * Math.cos(startAngle)
      const iy2 = cy + innerR * Math.sin(startAngle)

      const largeArc = frac > 0.5 ? 1 : 0

      const d =
        data.length === 1
          ? [
              `M${cx + outerR},${cy}`,
              `A${outerR},${outerR} 0 1,1 ${cx - outerR},${cy}`,
              `A${outerR},${outerR} 0 1,1 ${cx + outerR},${cy}`,
              `M${cx + innerR},${cy}`,
              `A${innerR},${innerR} 0 1,0 ${cx - innerR},${cy}`,
              `A${innerR},${innerR} 0 1,0 ${cx + innerR},${cy}`,
              'Z',
            ].join(' ')
          : [
              `M${ox1.toFixed(2)},${oy1.toFixed(2)}`,
              `A${outerR},${outerR} 0 ${largeArc},1 ${ox2.toFixed(2)},${oy2.toFixed(2)}`,
              `L${ix1.toFixed(2)},${iy1.toFixed(2)}`,
              `A${innerR},${innerR} 0 ${largeArc},0 ${ix2.toFixed(2)},${iy2.toFixed(2)}`,
              'Z',
            ].join(' ')

      acc.items.push({
        d,
        color: colorMap.get(item.reason) ?? 'var(--series-1)',
        label: item.reason,
        count: item.count,
        pct: Math.round(frac * 100),
        previewUrl: item.previewUrl,
        code: item.code,
      })
      acc.angle = endAngle
      return acc
    },
    { angle: -Math.PI / 2, items: [] },
  ).items

  const hasMore = slices.length > LEGEND_COLLAPSED_MAX
  const visibleSlices = legendExpanded ? slices : slices.slice(0, LEGEND_COLLAPSED_MAX)

  const handleClick = (s: { label: string; previewUrl?: string }) => {
    if (s.previewUrl) {
      window.open(s.previewUrl, '_blank', 'noopener,noreferrer')
    } else {
      onSliceClick?.(s.label)
    }
  }

  const isItemClickable = (s: { previewUrl?: string }) => !!s.previewUrl || !!onSliceClick

  return (
    <div className={cn(
      'rounded-xl border border-empire-border bg-empire-surface p-5 flex flex-col transition-all duration-300',
      legendExpanded ? 'flex-1' : 'h-[18rem]'
    )}>
      <div className="flex items-baseline justify-between mb-1">
        <h4 className="text-sm font-semibold text-empire-void">{title}</h4>
        <span className="font-mono text-xs font-semibold tabular-nums text-empire-subtle whitespace-nowrap shrink-0">{valueFormatter ? valueFormatter(total) : total} total</span>
      </div>
      {note && (
        <p className="mb-3 text-[10px] text-empire-subtle leading-snug">{note}</p>
      )}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:gap-5 flex-1 min-h-0">
        {/* Donut */}
        <div className="relative shrink-0 h-40 w-40">
          <svg
            viewBox={`0 0 ${size} ${size}`}
            className="w-full h-auto"
          >
            {slices.map((s, i) => (
              <path
                key={i}
                d={s.d}
                fill={s.color}
                fillRule="evenodd"
                stroke="var(--empire-surface)"
                strokeWidth="2"
                style={{
                  opacity: hovered === null || hovered === i ? 1 : 0.3,
                  transition: 'opacity 0.12s ease',
                  cursor: isItemClickable(s) ? 'pointer' : 'default',
                }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onTouchStart={() => setHovered(i)}
                onTouchEnd={() => setTimeout(() => setHovered(null), 1200)}
                onClick={() => handleClick(s)}
              />
            ))}
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none px-2">
            {hovered !== null ? (
              <>
                <span className={cn('font-mono font-bold text-empire-void leading-none tabular-nums text-center', valueFormatter ? 'text-xs' : 'text-lg')}>
                  {valueFormatter ? valueFormatter(slices[hovered].count) : slices[hovered].count}
                </span>
                <span className="font-mono text-[10px] text-empire-subtle mt-0.5 tabular-nums">
                  {slices[hovered].pct}%
                </span>
              </>
            ) : (
              <>
                <span className={cn('font-mono font-bold text-empire-void leading-none tabular-nums text-center', valueFormatter ? 'text-xs' : 'text-lg')}>{valueFormatter ? valueFormatter(total) : total}</span>
                <span className="font-mono text-[10px] text-empire-subtle mt-0.5">total</span>
              </>
            )}
          </div>
        </div>

        {/* Legend — button always visible outside scroll area */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className={cn('flex-1 min-w-0', !legendExpanded && 'max-h-[6.5rem] overflow-y-auto')}>
            <ul className="space-y-1">
              {visibleSlices.map((s, i) => (
                <li
                  key={i}
                  className={cn(
                    'flex items-start gap-2 min-w-0 rounded-md px-2 py-1.5 -mx-2 transition-colors',
                    isItemClickable(s) && 'cursor-pointer hover:bg-empire-elevated',
                    hovered === i && 'bg-empire-elevated',
                  )}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleClick(s)}
                >
                  <span
                    className={cn('h-2.5 w-2.5 rounded-sm shrink-0', valueFormatter && 'mt-0.5')}
                    style={{ backgroundColor: s.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-xs text-empire-void leading-snug break-words"
                      title={s.label}
                      style={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {s.code ? (
                        <span className="font-mono font-semibold tabular-nums text-empire-primary">{s.code}</span>
                      ) : s.label}
                    </p>
                    {valueFormatter ? (
                      <p className="font-mono text-[10px] tabular-nums text-empire-subtle leading-tight mt-0.5 whitespace-nowrap">
                        {valueFormatter(s.count)} · {s.pct}%
                      </p>
                    ) : (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className="font-mono text-xs font-bold tabular-nums text-empire-void">{s.count}</span>
                        <span className="font-mono text-[10px] tabular-nums text-empire-subtle">{s.pct}%</span>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {hasMore && (
            <button
              type="button"
              onClick={() => setLegendExpanded((v) => !v)}
              className="shrink-0 text-xs font-medium text-empire-primary underline hover:opacity-70 cursor-pointer bg-transparent border-0 p-0 mt-1.5"
            >
              {legendExpanded
                ? '− recolher'
                : `+ ver mais (${slices.length - LEGEND_COLLAPSED_MAX})`}
            </button>
          )}
        </div>
      </div>

      {(anyHasPreview || !!onSliceClick) && (
        <p className="mt-3 text-[10px] text-empire-subtle text-center">
          {anyHasPreview ? 'Clique para abrir o anúncio no Meta' : 'Clique para ver os leads'}
        </p>
      )}
    </div>
  )
}
