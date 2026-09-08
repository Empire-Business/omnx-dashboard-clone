import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { buildLabelColorMap } from '@/lib/utils/colors'
import type { OppRow } from '@/hooks/useTrafego'

export interface PerformanceOriginChartProps {
  title: string
  salesData: { reason: string; count: number; leads: OppRow[] }[]
  mqlsData: { reason: string; count: number; leads: OppRow[] }[]
  reunioesData: { reason: string; count: number; leads: OppRow[] }[]
  metric: 'count' | 'faturamento' | 'caixa' | 'mqls' | 'reunioes'
  onMetricChange: (m: 'count' | 'faturamento' | 'caixa' | 'mqls' | 'reunioes') => void
  onBarClick?: (origin: string, leads: OppRow[], metricLabel: string) => void
  valueFormatter?: (v: number) => string
  emptyMsg?: string
}

type MetricType = 'count' | 'faturamento' | 'caixa' | 'mqls' | 'reunioes'

const METRIC_LABELS: Record<MetricType, string> = {
  count: 'Nº Vendas',
  faturamento: 'Faturamento',
  caixa: 'Caixa',
  mqls: 'MQLs',
  reunioes: 'Reuniões',
}

const SVG_W = 900
const PADDING_LEFT = 72
const PADDING_RIGHT = 24
const PADDING_TOP = 16

export function PerformanceOriginChart({
  title,
  salesData,
  mqlsData,
  reunioesData,
  metric,
  onMetricChange,
  onBarClick,
  valueFormatter,
  emptyMsg,
}: PerformanceOriginChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null)

  const allOrigins = useMemo(() => {
    const salesOrigins = new Set(salesData.map((d) => d.reason))
    const mqlOrigins = new Set(mqlsData.map((d) => d.reason))
    const reunioesOrigins = new Set(reunioesData.map((d) => d.reason))
    return [...new Set([...salesOrigins, ...mqlOrigins, ...reunioesOrigins])].sort((a, b) => a.localeCompare(b))
  }, [salesData, mqlsData, reunioesData])

  const salesMap = useMemo(
    () => new Map(salesData.map((d) => [d.reason, d])),
    [salesData]
  )

  const mqlMap = useMemo(
    () => new Map(mqlsData.map((d) => [d.reason, d])),
    [mqlsData]
  )

  const reunioesMap = useMemo(
    () => new Map(reunioesData.map((d) => [d.reason, d])),
    [reunioesData]
  )

  function formatValue(v: number): string {
    if (valueFormatter) return valueFormatter(v)
    return String(Math.round(v))
  }

  const getMetricValue = (origin: string): number => {
    switch (metric) {
      case 'count':
      case 'faturamento':
      case 'caixa':
        return salesMap.get(origin)?.count ?? 0
      case 'mqls':
        return mqlMap.get(origin)?.count ?? 0
      case 'reunioes':
        return reunioesMap.get(origin)?.count ?? 0
    }
  }

  const getMetricLeads = (origin: string): OppRow[] => {
    switch (metric) {
      case 'count':
      case 'faturamento':
      case 'caixa':
        return salesMap.get(origin)?.leads ?? []
      case 'mqls':
        return mqlMap.get(origin)?.leads ?? []
      case 'reunioes':
        return reunioesMap.get(origin)?.leads ?? []
    }
  }

  const metricLabel = METRIC_LABELS[metric]

  if (allOrigins.length === 0) {
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

  // Cor por origem, igual à usada nos donuts e no gráfico de linhas.
  const colorMap = buildLabelColorMap(allOrigins)
  const allValues = allOrigins.map((o) => getMetricValue(o))
  const maxValue = Math.max(...allValues, 1)

  const barCount = allOrigins.length
  const isRotated = barCount > 8
  const PADDING_BOTTOM = isRotated ? 110 : 60
  const SVG_H = isRotated ? 340 : 300

  const chartInnerW = SVG_W - PADDING_LEFT - PADDING_RIGHT
  const chartInnerH = SVG_H - PADDING_TOP - PADDING_BOTTOM
  const barGap = Math.min(16, (chartInnerW * 0.08) / barCount)
  const totalGapWidth = barGap * (barCount - 1)
  const barW = Math.max(48, (chartInnerW - totalGapWidth) / barCount)

  const niceMax = Math.ceil(maxValue / getNiceScale(maxValue)) * getNiceScale(maxValue)
  const tickCount = 5

  const ticks = Array.from(
    { length: tickCount + 1 },
    (_, i) => Math.round((niceMax / tickCount) * i)
  )

  const hoveredOrigin = hoveredIndex !== null ? allOrigins[hoveredIndex] : null
  const hoveredValue = hoveredOrigin ? getMetricValue(hoveredOrigin) : null

  const getBarX = (i: number) => PADDING_LEFT + i * (barW + barGap) + barGap / 2

  return (
    <div className="w-full rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
      {/* Header */}
      <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-empire-border">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-empire-void">{title}</h4>
            <p className="text-xs text-empire-subtle mt-0.5">
              Selecione a métrica para visualizar
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

      {/* Chart */}
      <div className="relative px-4 pt-3">
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full"
          style={{ height: 'auto', overflow: 'visible' }}
        >
          {/* Grid lines + Y-axis ticks */}
          {ticks.map((tick) => {
            const y = PADDING_TOP + chartInnerH - (tick / niceMax) * chartInnerH
            return (
              <g key={`tick-${tick}`}>
                <line
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={SVG_W - PADDING_RIGHT}
                  y2={y}
                  stroke="var(--empire-border)"
                  strokeWidth="1"
                  strokeDasharray={tick === 0 ? 'none' : '4,4'}
                />
                <text
                  x={PADDING_LEFT - 8}
                  y={y + 4}
                  textAnchor="end"
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-mono)',
                    fill: 'var(--empire-subtle)',
                  }}
                >
                  {formatValue(tick)}
                </text>
              </g>
            )
          })}

          {/* Y-axis left label */}
          <text
            x={18}
            y={PADDING_TOP + chartInnerH / 2}
            textAnchor="middle"
            transform={`rotate(-90, 18, ${PADDING_TOP + chartInnerH / 2})`}
            style={{
              fontSize: '9px',
              fontFamily: 'var(--font-mono)',
              fill: 'var(--empire-subtle)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            {metricLabel}
          </text>

          {/* Y-axis left line */}
          <line
            x1={PADDING_LEFT}
            y1={PADDING_TOP}
            x2={PADDING_LEFT}
            y2={PADDING_TOP + chartInnerH}
            stroke="var(--empire-border)"
            strokeWidth="1.5"
          />

          {/* Bars */}
          {allOrigins.map((origin, i) => {
            const value = getMetricValue(origin)
            const barHeight = Math.max((value / niceMax) * chartInnerH, 6)
            const barX = getBarX(i)
            const y = PADDING_TOP + chartInnerH - barHeight
            const color = colorMap.get(origin) ?? 'var(--series-1)'
            const isHovered = hoveredIndex === i

            const pointX = barX + barW / 2

            return (
              <g
                key={origin}
                onMouseEnter={() => {
                  setHoveredIndex(i)
                  setTooltipPos({ x: pointX, y: PADDING_TOP })
                }}
                onMouseLeave={() => {
                  setHoveredIndex(null)
                  setTooltipPos(null)
                }}
                onClick={() => {
                  if (onBarClick) {
                    onBarClick(origin, getMetricLeads(origin), metricLabel)
                  }
                }}
                className={onBarClick ? 'cursor-pointer' : 'cursor-default'}
              >
                {/* Bar */}
                <rect
                  x={barX}
                  y={y}
                  width={barW}
                  height={barHeight}
                  fill={color}
                  opacity={hoveredIndex === null ? 0.85 : isHovered ? 1 : 0.3}
                  rx="4"
                  style={{ transition: 'opacity 200ms ease' }}
                />

                {/* Value label above bar */}
                {value > 0 && (
                  <text
                    x={pointX}
                    y={y - 8}
                    textAnchor="middle"
                    style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      fill: isHovered ? 'var(--empire-void)' : 'var(--empire-subtle)',
                      fontWeight: 700,
                      opacity: hoveredIndex === null ? 0.7 : isHovered ? 1 : 0.3,
                    }}
                  >
                    {formatValue(value)}
                  </text>
                )}

                {/* X-axis label */}
                <text
                  x={pointX}
                  y={PADDING_TOP + chartInnerH + 14}
                  textAnchor={isRotated ? 'end' : 'middle'}
                  transform={
                    isRotated
                      ? `rotate(-45, ${pointX}, ${PADDING_TOP + chartInnerH + 14})`
                      : undefined
                  }
                  style={{
                    fontSize: '10px',
                    fontFamily: 'var(--font-body)',
                    fill: isHovered ? 'var(--empire-void)' : 'var(--empire-subtle)',
                    fontWeight: isHovered ? 600 : 500,
                  }}
                >
                  {isRotated ? origin : origin.length > 14 ? origin.slice(0, 14) + '…' : origin}
                </text>
              </g>
            )
          })}
        </svg>

        {/* Tooltip */}
        {hoveredIndex !== null && hoveredOrigin && tooltipPos && (
          <div
            className="absolute pointer-events-none z-10 rounded-lg shadow-lg border border-empire-border-strong bg-empire-void"
            style={{
              left: `${(tooltipPos.x / SVG_W) * 100}%`,
              top: 0,
              transform: 'translate(-50%, -100%)',
              minWidth: '140px',
            }}
          >
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-empire-surface mb-1.5">{hoveredOrigin}</p>
              <div className="flex items-center justify-between gap-4">
                <span className="text-[11px] text-empire-subtle">{metricLabel}</span>
                <span className="font-mono text-[11px] font-bold text-empire-surface">
                  {formatValue(hoveredValue ?? 0)}
                </span>
              </div>
            </div>
            {/* Arrow */}
            <div
              className="absolute w-2 h-2 rotate-45 -bottom-1 left-1/2 -translate-x-1/2 bg-empire-void"
            />
          </div>
        )}
      </div>

      {/* Footer legend */}
      <div className="px-4 sm:px-6 py-3 border-t border-empire-border bg-empire-elevated/50">
        <div className="flex items-center justify-center gap-1">
          <span className="text-[11px] text-empire-subtle">
            {allOrigins.length} origens no período · {onBarClick ? 'clique numa barra para ver os leads' : 'posicione o mouse sobre as barras para detalhes'}
          </span>
        </div>
      </div>
    </div>
  )
}

function getNiceScale(max: number): number {
  if (max <= 10) return 5
  if (max <= 50) return 10
  if (max <= 100) return 20
  if (max <= 500) return 50
  if (max <= 1000) return 100
  if (max <= 5000) return 500
  if (max <= 10000) return 1000
  return 5000
}
