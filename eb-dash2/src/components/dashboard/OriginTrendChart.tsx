import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { OppRow } from '@/hooks/useTrafego'

export interface TrendPoint {
  date: string           // YYYY-MM-DD
  value: number
  leads: OppRow[]
}

export interface TrendSeries {
  key: string
  label: string
  color: string
  total: number
  /** Alinhado 1:1 com `dates` (mesmo índice = mesmo dia) */
  points: TrendPoint[]
}

export type OriginTrendMetric = 'count' | 'faturamento' | 'caixa' | 'mqls' | 'reunioes'

type Bucket = 'dia' | 'semana'

export interface OriginTrendChartProps {
  title: string
  subtitle?: string
  dates: string[]
  series: TrendSeries[]
  metric: OriginTrendMetric
  onMetricChange: (m: OriginTrendMetric) => void
  valueFormatter?: (v: number) => string
  onPointClick?: (seriesLabel: string, date: string, leads: OppRow[], metricLabel: string) => void
  emptyMsg?: string
}

const METRIC_LABELS: Record<OriginTrendMetric, string> = {
  count: 'Nº Vendas',
  faturamento: 'Faturamento',
  caixa: 'Caixa',
  mqls: 'MQLs',
  reunioes: 'Reuniões',
}

const SVG_W = 900
const SVG_H = 320
const PADDING_LEFT = 64
const PADDING_RIGHT = 20
const PADDING_TOP = 18
const PADDING_BOTTOM = 44

export function OriginTrendChart({
  title,
  subtitle,
  dates: rawDates,
  series: rawSeries,
  metric,
  onMetricChange,
  valueFormatter,
  onPointClick,
  emptyMsg,
}: OriginTrendChartProps) {
  // Set de séries ocultas (vazio = todas visíveis)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [bucketPref, setBucketPref] = useState<Bucket | null>(null)

  const metricLabel = METRIC_LABELS[metric]

  // Períodos longos com números pequenos viram serrote diário ilegível —
  // acima de 45 dias o padrão passa a ser semana (o usuário pode trocar).
  const bucket: Bucket = bucketPref ?? (rawDates.length > 45 ? 'semana' : 'dia')

  // Agregação do eixo conforme o bucket escolhido.
  // `partialDays` > 0 significa que o último ponto cobre uma semana incompleta —
  // sem esse aviso a linha "despenca" no fim e parece queda de performance.
  const { dates, series, partialDays } = useMemo(() => {
    if (bucket === 'dia') return { dates: rawDates, series: rawSeries, partialDays: 0 }

    const groups: number[][] = []
    for (let i = 0; i < rawDates.length; i += 7) {
      groups.push(Array.from({ length: Math.min(7, rawDates.length - i) }, (_, k) => i + k))
    }
    const dates = groups.map((g) => rawDates[g[0]])
    const series = rawSeries.map((s) => ({
      ...s,
      points: groups.map((g) => ({
        date: rawDates[g[0]],
        value: g.reduce((acc, i) => acc + (s.points[i]?.value ?? 0), 0),
        leads: g.flatMap((i) => s.points[i]?.leads ?? []),
      })),
    }))
    const lastLen = groups[groups.length - 1]?.length ?? 7
    return { dates, series, partialDays: lastLen < 7 ? lastLen : 0 }
  }, [bucket, rawDates, rawSeries])

  function formatValue(v: number): string {
    if (valueFormatter) return valueFormatter(v)
    return String(Math.round(v))
  }

  const visibleSeries = useMemo(
    () => series.filter((s) => !hidden.has(s.key)),
    [series, hidden],
  )

  const grandTotal = useMemo(
    () => visibleSeries.reduce((acc, s) => acc + s.total, 0),
    [visibleSeries],
  )

  const maxValue = useMemo(() => {
    let max = 0
    for (const s of visibleSeries) {
      for (const p of s.points) if (p.value > max) max = p.value
    }
    return Math.max(max, 1)
  }, [visibleSeries])

  const chartInnerW = SVG_W - PADDING_LEFT - PADDING_RIGHT
  const chartInnerH = SVG_H - PADDING_TOP - PADDING_BOTTOM

  const step = dates.length > 1 ? chartInnerW / (dates.length - 1) : 0
  const getX = (i: number) => (dates.length > 1 ? PADDING_LEFT + i * step : PADDING_LEFT + chartInnerW / 2)

  const niceStep = getNiceScale(maxValue)
  const niceMax = Math.max(Math.ceil(maxValue / niceStep) * niceStep, niceStep)
  // Escala enxuta no estilo Instagram: só 3 marcas (0, meio, topo)
  const tickCount = 2
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (niceMax / tickCount) * i)
  const getY = (v: number) => PADDING_TOP + chartInnerH - (v / niceMax) * chartInnerH

  // Rótulos do eixo X: no máximo ~8 datas, sempre incluindo a primeira e a última
  const xLabelIdx = useMemo(() => {
    const n = dates.length
    if (n === 0) return []
    const maxLabels = 5
    if (n <= maxLabels) return dates.map((_, i) => i)
    const stride = Math.ceil(n / maxLabels)
    const idx = new Set<number>()
    for (let i = 0; i < n; i += stride) idx.add(i)
    idx.add(n - 1)
    return [...idx].sort((a, b) => a - b)
  }, [dates])

  const toggleSeries = (key: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const isolateSeries = (key: string) => {
    setHidden(new Set(series.filter((s) => s.key !== key).map((s) => s.key)))
  }

  const showAll = () => setHidden(new Set())

  const hoveredRows = useMemo(() => {
    if (hoverIdx === null) return []
    return visibleSeries
      .map((s) => ({ series: s, point: s.points[hoverIdx] }))
      .filter((r) => r.point && r.point.value > 0)
      .sort((a, b) => b.point.value - a.point.value)
  }, [hoverIdx, visibleSeries])

  const hoveredTotal = hoveredRows.reduce((acc, r) => acc + r.point.value, 0)

  if (dates.length === 0 || series.length === 0) {
    return (
      <div className="w-full rounded-xl border border-empire-border bg-empire-surface p-6">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-base font-semibold text-empire-void">{title}</h4>
        </div>
        <div className="flex flex-col items-center justify-center py-16 rounded-lg bg-empire-elevated">
          <p className="text-sm text-empire-subtle">{emptyMsg ?? 'Sem dados no período.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-empire-border">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-empire-void">{title}</h4>
            <p className="text-xs text-empire-subtle mt-0.5">
              {subtitle ?? 'Evolução dia a dia — passe o mouse para ver o detalhe'}
            </p>
          </div>
          <div className="flex items-center gap-0.5 rounded-lg border border-empire-border bg-empire-elevated p-0.5 shrink-0 overflow-x-auto scrollbar-hide">
            {(['count', 'faturamento', 'caixa', 'mqls', 'reunioes'] as const).map((m) => (
              <button
                key={m}
                onClick={() => onMetricChange(m)}
                className={cn(
                  'px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-all cursor-pointer whitespace-nowrap',
                  metric === m
                    ? 'bg-empire-surface text-empire-void shadow-sm'
                    : 'text-empire-subtle hover:text-empire-void',
                )}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Total do período + granularidade */}
      <div className="px-4 sm:px-6 pt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-wide text-empire-subtle">
            Total no período{hidden.size > 0 ? ' (origens visíveis)' : ''}
          </span>
          <span className="font-mono text-lg font-bold text-empire-void">{formatValue(grandTotal)}</span>
          <span className="text-[11px] text-empire-subtle">· {metricLabel}</span>
        </div>
        <div className="flex items-center gap-0.5 rounded-lg border border-empire-border bg-empire-elevated p-0.5">
          {(['dia', 'semana'] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBucketPref(b)}
              className={cn(
                'px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer',
                bucket === b
                  ? 'bg-empire-surface text-empire-void shadow-sm'
                  : 'text-empire-subtle hover:text-empire-void',
              )}
            >
              {b === 'dia' ? 'Por dia' : 'Por semana'}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="relative px-2 sm:px-4 pt-2">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full"
          style={{ height: 'auto', overflow: 'visible' }}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <clipPath id="origin-trend-plot">
              <rect
                x={PADDING_LEFT - 4}
                y={PADDING_TOP - 8}
                width={chartInnerW + 8}
                height={chartInnerH + 12}
              />
            </clipPath>
          </defs>

          {/* Grid + Y ticks */}
          {ticks.map((tick, i) => {
            const y = getY(tick)
            return (
              <g key={`tick-${i}`}>
                <line
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={SVG_W - PADDING_RIGHT}
                  y2={y}
                  stroke="var(--empire-border)"
                  strokeWidth="1"
                />
                <text
                  x={PADDING_LEFT - 8}
                  y={y + 4}
                  textAnchor="end"
                  style={{ fontSize: '10px', fontFamily: 'var(--font-mono)', fill: 'var(--empire-subtle)' }}
                >
                  {formatValue(tick)}
                </text>
              </g>
            )
          })}

          {/* Linha vertical do hover */}
          {hoverIdx !== null && (
            <line
              x1={getX(hoverIdx)}
              y1={PADDING_TOP}
              x2={getX(hoverIdx)}
              y2={PADDING_TOP + chartInnerH}
              stroke="var(--empire-border-strong)"
              strokeWidth="1"
            />
          )}

          {/* Séries */}
          {visibleSeries.map((s) => {
            const d = buildSmoothPath(s.points.map((p, i) => [getX(i), getY(p.value)]))
            const dimmed = focusKey !== null && focusKey !== s.key
            return (
              <g key={s.key} clipPath="url(#origin-trend-plot)">
                <path
                  d={d}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={focusKey === s.key ? 3.5 : 2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  opacity={dimmed ? 0.15 : 0.95}
                  style={{ transition: 'opacity 150ms ease, stroke-width 150ms ease' }}
                />
                {/* Ponto único (período de 1 dia) fica invisível sem marcador */}
                {dates.length === 1 && (
                  <circle cx={getX(0)} cy={getY(s.points[0]?.value ?? 0)} r={4} fill={s.color} />
                )}
              </g>
            )
          })}

          {/* Marcadores no dia sob o cursor */}
          {hoverIdx !== null &&
            visibleSeries.map((s) => {
              const p = s.points[hoverIdx]
              if (!p || p.value <= 0) return null
              return (
                <circle
                  key={`hp-${s.key}`}
                  cx={getX(hoverIdx)}
                  cy={getY(p.value)}
                  r={4}
                  fill={s.color}
                  stroke="var(--empire-surface)"
                  strokeWidth={1.5}
                  className={onPointClick ? 'cursor-pointer' : undefined}
                  onClick={() => onPointClick?.(s.label, p.date, p.leads, metricLabel)}
                />
              )
            })}

          {/* Rótulos do eixo X */}
          {xLabelIdx.map((i) => (
            <text
              key={`xl-${i}`}
              x={getX(i)}
              y={PADDING_TOP + chartInnerH + 18}
              textAnchor={i === 0 ? 'start' : i === dates.length - 1 ? 'end' : 'middle'}
              style={{
                fontSize: '10px',
                fontFamily: 'var(--font-body)',
                fill: hoverIdx === i ? 'var(--empire-void)' : 'var(--empire-subtle)',
                fontWeight: hoverIdx === i ? 600 : 500,
              }}
            >
              {fmtDayLabel(dates[i])}
            </text>
          ))}

          {/* Faixas invisíveis de captura do mouse (uma por dia) */}
          {dates.map((date, i) => {
            const bandW = dates.length > 1 ? step : chartInnerW
            const x = dates.length > 1 ? getX(i) - bandW / 2 : PADDING_LEFT
            return (
              <rect
                key={`band-${date}`}
                x={Math.max(x, PADDING_LEFT)}
                y={PADDING_TOP}
                width={Math.max(bandW, 1)}
                height={chartInnerH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
            )
          })}
        </svg>

        {/* Tooltip */}
        {hoverIdx !== null && hoveredRows.length > 0 && (
          <div
            className="absolute pointer-events-none z-10 rounded-lg shadow-lg border border-empire-border-strong bg-empire-void"
            style={{
              left: `${(getX(hoverIdx) / SVG_W) * 100}%`,
              top: '12px',
              transform:
                getX(hoverIdx) / SVG_W > 0.6
                  ? 'translate(calc(-100% - 12px), 0)'
                  : 'translate(12px, 0)',
              minWidth: '190px',
              maxWidth: '280px',
            }}
          >
            <div className="px-3.5 py-3">
              <p className="text-xs font-semibold text-empire-surface mb-2">
                {bucket === 'semana'
                  ? `Semana de ${fmtFullDayLabel(dates[hoverIdx])}`
                  : fmtFullDayLabel(dates[hoverIdx])}
                {partialDays > 0 && hoverIdx === dates.length - 1 && (
                  <span className="font-normal text-empire-subtle">
                    {' '}· parcial ({partialDays} {partialDays === 1 ? 'dia' : 'dias'})
                  </span>
                )}
              </p>
              <div className="space-y-1">
                {hoveredRows.slice(0, 10).map((r) => (
                  <div key={r.series.key} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: r.series.color }}
                      />
                      <span className="text-[11px] text-empire-subtle truncate">{r.series.label}</span>
                    </span>
                    <span className="font-mono text-[11px] font-bold text-empire-surface shrink-0">
                      {formatValue(r.point.value)}
                    </span>
                  </div>
                ))}
                {hoveredRows.length > 10 && (
                  <p className="text-[10px] text-empire-subtle pt-0.5">
                    +{hoveredRows.length - 10} origens
                  </p>
                )}
              </div>
              <div className="mt-2 pt-2 border-t border-empire-border-strong flex items-center justify-between gap-4">
                <span className="text-[11px] text-empire-subtle">Total do dia</span>
                <span className="font-mono text-[11px] font-bold text-empire-surface">
                  {formatValue(hoveredTotal)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Legenda com totais */}
      <div className="px-4 sm:px-6 py-3 border-t border-empire-border bg-empire-elevated/50">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={showAll}
            className={cn(
              'px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer',
              hidden.size === 0
                ? 'border-empire-border-strong text-empire-void bg-empire-surface'
                : 'border-empire-border text-empire-subtle hover:text-empire-void',
            )}
          >
            Ver todas
          </button>
          {series.map((s) => {
            const isHidden = hidden.has(s.key)
            return (
              <button
                key={s.key}
                onClick={() => toggleSeries(s.key)}
                onDoubleClick={() => isolateSeries(s.key)}
                onMouseEnter={() => !isHidden && setFocusKey(s.key)}
                onMouseLeave={() => setFocusKey(null)}
                title="Clique para ocultar/mostrar · duplo clique para isolar"
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] border transition-all cursor-pointer',
                  isHidden
                    ? 'border-empire-border text-empire-subtle opacity-50'
                    : 'border-empire-border text-empire-void hover:border-empire-border-strong',
                )}
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: isHidden ? 'var(--empire-subtle)' : s.color }}
                />
                <span className="max-w-[140px] truncate">{s.label}</span>
                <span className="font-mono font-bold">{formatValue(s.total)}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[11px] text-empire-subtle">
          {series.length} origens · {dates.length} {bucket === 'dia' ? 'dias' : 'semanas'} · clique numa origem para ocultar, duplo clique para isolar
          {onPointClick ? ' · clique num ponto para ver os leads do dia' : ''}
        </p>
        {partialDays > 0 && (
          <p className="mt-1 text-[11px] text-empire-warning">
            A última semana do gráfico tem só {partialDays} {partialDays === 1 ? 'dia' : 'dias'} — a queda no fim da linha é do período incompleto, não de performance.
          </p>
        )}
      </div>
    </div>
  )
}

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "2026-07-01" → "1 de jul" (mesmo formato do gráfico do Instagram) */
function fmtDayLabel(date: string): string {
  const [, m, d] = date.split('-')
  return `${Number(d)} de ${MONTHS_SHORT[Number(m) - 1] ?? m}`
}

function fmtFullDayLabel(date: string): string {
  const [y, m, d] = date.split('-')
  return `${Number(d)} de ${MONTHS_SHORT[Number(m) - 1] ?? m} de ${y}`
}

/**
 * Curva suave MONOTÔNICA (Fritsch–Carlson).
 *
 * Por que não Catmull-Rom: com valores baixos (0, 1, 2 por dia) ela cria
 * ondas entre os pontos — o gráfico mostra picos e vales que não existem no
 * dado. A monotônica arredonda o traçado mas nunca ultrapassa os valores
 * reais nem inventa subida entre dois dias iguais.
 */
function buildSmoothPath(pts: [number, number][]): string {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M ${pts[0][0]} ${pts[0][1]}`
  if (n === 2) return `M ${pts[0][0]} ${pts[0][1]} L ${pts[1][0]} ${pts[1][1]}`

  // Inclinações das secantes
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1][0] - pts[i][0]
    dx.push(h)
    slope.push(h === 0 ? 0 : (pts[i + 1][1] - pts[i][1]) / h)
  }

  // Tangentes com o ajuste de Fritsch–Carlson (zera em extremos locais)
  const m: number[] = new Array(n)
  m[0] = slope[0]
  m[n - 1] = slope[n - 2]
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2
  }
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / slope[i]
    const b = m[i + 1] / slope[i]
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * slope[i]
      m[i + 1] = t * b * slope[i]
    }
  }

  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]
    const c1x = pts[i][0] + h / 3
    const c1y = pts[i][1] + (m[i] * h) / 3
    const c2x = pts[i + 1][0] - h / 3
    const c2y = pts[i + 1][1] - (m[i + 1] * h) / 3
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts[i + 1][0]} ${pts[i + 1][1]}`
  }
  return d
}

function getNiceScale(max: number): number {
  if (max <= 5) return 1
  if (max <= 10) return 2
  if (max <= 50) return 10
  if (max <= 100) return 20
  if (max <= 500) return 50
  if (max <= 1000) return 100
  if (max <= 5000) return 500
  if (max <= 10000) return 1000
  return 5000
}
