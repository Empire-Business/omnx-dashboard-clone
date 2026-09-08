import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { TrendingUp } from 'lucide-react'
import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'
import { buildTrendData, type TrendMetric } from '@/lib/relatorios/trendData'

interface TrendChartProps {
  rows: WeeklyReportRow[]
  loading: boolean
  metric: TrendMetric
  title?: string
}

const METRIC_LABELS: Record<string, string> = {
  leads: 'Leads',
  mqls: 'MQLs',
  conectados: 'Conectados',
  agendados: 'Agendados',
  reunioes: 'Reuniões',
  fechados: 'Fechados',
  faturamento_bruto: 'Faturamento',
  caixa_recebido: 'Caixa',
}

// Uma cor de série por métrica, mapeada aos tokens --chart-1..8 do design system
// (docs/DESIGN-SYSTEM-NUBANK.md). Cada gráfico exibe uma métrica por vez, então
// tokens de mesmo valor (chart-1=2, chart-4=5 no light) não colidem visualmente.
const METRIC_COLORS: Record<string, string> = {
  leads: 'var(--chart-1)',
  mqls: 'var(--chart-7)',
  conectados: 'var(--chart-3)',
  agendados: 'var(--chart-4)',
  reunioes: 'var(--chart-6)',
  fechados: 'var(--chart-8)',
  faturamento_bruto: 'var(--chart-5)',
  caixa_recebido: 'var(--chart-2)',
}

const SVG_W = 800
const SVG_H = 260
const PADDING = { top: 24, right: 16, bottom: 40, left: 56 }

function formatCurrencyCompact(value: number): string {
  if (value >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$${(value / 1_000).toFixed(0)}k`
  return `R$${value.toFixed(0)}`
}

export function TrendChart({ rows, loading, metric, title }: TrendChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const isCurrency = metric === 'faturamento_bruto' || metric === 'caixa_recebido'
  const label = title ?? METRIC_LABELS[metric] ?? metric
  const strokeColor = METRIC_COLORS[metric] ?? 'var(--chart-1)'

  // Dedup por semana + ordem cronológica ascendente: v_weekly_dashboard pode
  // devolver mais de um snapshot para o mesmo year_week (duplicatas legadas em
  // weekly_snapshots). Sem isso o eixo X repete labels e o React acusa keys
  // duplicadas. A chave de cada ponto é o week_start ISO (única e estável).
  const data = useMemo(() => buildTrendData(rows, metric), [rows, metric])

  if (!loading && data.length === 0) {
    return (
      <Card variant="glass">
        <CardContent>
          <EmptyState icon={TrendingUp} title="Sem dados para exibir" description="Nenhuma semana disponível para este indicador." />
        </CardContent>
      </Card>
    )
  }

  const chartW = SVG_W - PADDING.left - PADDING.right
  const chartH = SVG_H - PADDING.top - PADDING.bottom

  const maxValue = Math.max(...data.map((d) => d.value), 1)
  const niceMax = (() => {
    const pow10 = Math.pow(10, Math.floor(Math.log10(maxValue)))
    const ceil = Math.ceil(maxValue / pow10) * pow10
    return ceil === maxValue ? ceil + pow10 / 2 : ceil
  })()

  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => (niceMax / tickCount) * i)

  const getX = (i: number) => PADDING.left + (i / (data.length - 1 || 1)) * chartW
  const getY = (v: number) => PADDING.top + chartH - (v / niceMax) * chartH

  const pathD = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d.value)}`)
    .join(' ')

  const areaD = pathD + ` L ${getX(data.length - 1)} ${PADDING.top + chartH} L ${getX(0)} ${PADDING.top + chartH} Z`

  return (
    <Card variant="glass">
      <CardContent className="p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-sm font-semibold text-empire-void">{label}</h4>
          {!loading && data.length > 0 && (
            <span className="text-[11px] text-empire-subtle">{data.length} semanas</span>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center" style={{ height: SVG_H }}>
            <div className="animate-pulse w-full" style={{ height: SVG_H }}>
              <div className="h-full bg-gray-200 rounded" />
            </div>
          </div>
        ) : (
          <div className="relative" style={{ height: SVG_H }}>
            <svg
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              preserveAspectRatio="xMidYMid meet"
              className="w-full"
              style={{ height: SVG_H, overflow: 'visible' }}
            >
              {/* Grid lines */}
              {ticks.map((t) => {
                const y = getY(t)
                return (
                  <g key={t}>
                    <line
                      x1={PADDING.left}
                      y1={y}
                      x2={SVG_W - PADDING.right}
                      y2={y}
                      stroke="var(--empire-border)"
                      strokeWidth="0.75"
                      strokeDasharray={t === 0 ? 'none' : '2,2'}
                    />
                    <text
                      x={PADDING.left - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      style={{ fontSize: '10px', fontFamily: 'Inter, system-ui, sans-serif', fill: 'var(--empire-subtle)' }}
                    >
                      {isCurrency ? formatCurrencyCompact(t) : Math.round(t)}
                    </text>
                  </g>
                )
              })}

              {/* Area fill */}
              <path d={areaD} fill={strokeColor} opacity="0.06" />

              {/* Line */}
              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Points + hover interaction */}
              {data.map((d, i) => {
                const x = getX(i)
                const y = getY(d.value)
                const isHovered = hoveredIndex === i
                return (
                  <g
                    key={d.key}
                    onMouseEnter={() => setHoveredIndex(i)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    className="cursor-default"
                  >
                    {/* Invisible hover target */}
                    <rect x={x - (chartW / data.length / 2)} y={PADDING.top} width={chartW / data.length} height={chartH} fill="transparent" />

                    <circle
                      cx={x}
                      cy={y}
                      r={isHovered ? 5 : 3}
                      fill={isHovered ? strokeColor : 'var(--empire-surface)'}
                      stroke={strokeColor}
                      strokeWidth="2"
                      style={{ transition: 'all 150ms ease' }}
                    />

                    {isHovered && (
                      <g>
                        <rect
                          x={x - 36}
                          y={y - 32}
                          width={72}
                          height={24}
                          rx="4"
                          fill="var(--empire-void)"
                          opacity="0.92"
                        />
                        <text
                          x={x}
                          y={y - 14}
                          textAnchor="middle"
                          style={{ fontSize: '10px', fontFamily: 'Inter, system-ui, sans-serif', fontWeight: 600, fill: 'var(--empire-surface)' }}
                        >
                          {isCurrency ? formatCurrencyCompact(d.value) : d.value}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}

              {/* X-axis labels */}
              {data.map((d, i) => {
                const x = getX(i)
                return (
                  <text
                    key={`x-${d.key}`}
                    x={x}
                    y={SVG_H - PADDING.bottom + 18}
                    textAnchor="middle"
                    style={{ fontSize: '10px', fontFamily: 'Inter, system-ui, sans-serif', fill: 'var(--empire-subtle)' }}
                  >
                    {d.label}
                  </text>
                )
              })}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
