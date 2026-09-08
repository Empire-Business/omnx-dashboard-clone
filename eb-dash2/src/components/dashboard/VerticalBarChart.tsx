import { useState } from 'react'
import { cn } from '@/lib/utils'
import { buildLabelColorMap } from '@/lib/utils/colors'

export interface VerticalBarItem {
  label: string
  value: number
  sublabel?: string
}

interface VerticalBarChartProps {
  title: string
  data: VerticalBarItem[]
  emptyMsg?: string
  note?: string
}

const SVG_W = 600
const SVG_H = 120
const PADDING_LEFT = 32
const PADDING_BOTTOM = 8
const PADDING_TOP = 12
const PADDING_RIGHT = 8

export function VerticalBarChart({ title, data, emptyMsg, note }: VerticalBarChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (!data.length) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-surface p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-empire-void mb-3">{title}</h4>
        <div className="flex flex-col items-center justify-center py-6">
          <div className="h-10 w-10 rounded-full border-2 border-dashed border-empire-border flex items-center justify-center mb-2">
            <span className="text-xs text-empire-subtle">0</span>
          </div>
          <p className="text-xs text-empire-subtle">{emptyMsg ?? 'Sem dados no período.'}</p>
        </div>
      </div>
    )
  }

  const sorted = [...data].sort((a, b) => b.value - a.value)
  const MAX_BARS = 8
  const topBars = sorted.slice(0, MAX_BARS)
  const othersCount = sorted.length - MAX_BARS
  const othersSum = sorted.slice(MAX_BARS).reduce((s, d) => s + d.value, 0)
  const hasOthers = othersCount > 0

  const displayBars = hasOthers
    ? [...topBars, { label: `+${othersCount} outros`, value: othersSum / othersCount, sublabel: `${Math.round(othersSum / othersCount)}%` }]
    : topBars

  // Cor por rótulo, compartilhada com donuts e linhas — mesma origem, mesma cor.
  const colorMap = buildLabelColorMap(displayBars.map((d) => d.label))
  const maxValue = Math.max(...displayBars.map((d) => d.value), 1)
  const chartInnerW = SVG_W - PADDING_LEFT - PADDING_RIGHT
  const chartInnerH = SVG_H - PADDING_TOP - PADDING_BOTTOM
  const barCount = displayBars.length
  const barGap = Math.min(6, (chartInnerW * 0.05) / barCount)
  const totalGapWidth = barGap * (barCount - 1)
  const barW = Math.max(12, (chartInnerW - totalGapWidth) / barCount)

  const niceMax = Math.ceil(maxValue / 10) * 10 + 5
  const tickCount = 4
  const ticks = Array.from({ length: tickCount + 1 }, (_, i) => Math.round((niceMax / tickCount) * i))

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-4 shadow-sm">
      <div className="flex items-baseline justify-between mb-2">
        <h4 className="text-sm font-semibold text-empire-void">{title}</h4>
        {note && <span className="text-[10px] text-empire-subtle">{note}</span>}
      </div>

      <div className="relative" style={{ height: SVG_H }}>
        <svg
          viewBox={`0 0 ${SVG_W} ${SVG_H}`}
          preserveAspectRatio="xMidYMid meet"
          className="w-full"
          style={{ height: SVG_H, overflow: 'visible' }}
        >
          {ticks.map((tick) => {
            const y = PADDING_TOP + chartInnerH - (tick / niceMax) * chartInnerH
            return (
              <g key={tick}>
                <line
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={SVG_W - PADDING_RIGHT}
                  y2={y}
                  stroke="var(--empire-border)"
                  strokeWidth="0.75"
                  strokeDasharray={tick === 0 ? 'none' : '2,2'}
                />
                <text
                  x={PADDING_LEFT - 3}
                  y={y + 3.5}
                  textAnchor="end"
                  style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fill: 'var(--empire-subtle)' }}
                >
                  {tick}%
                </text>
              </g>
            )
          })}

          {displayBars.map((bar, i) => {
            const barHeight = Math.max((bar.value / niceMax) * chartInnerH, 2)
            const x = PADDING_LEFT + i * (barW + barGap)
            const y = PADDING_TOP + chartInnerH - barHeight
            const color = colorMap.get(bar.label) ?? 'var(--series-1)'
            const isOthers = bar.label.startsWith('+')
            const isHovered = hoveredIndex === i
            const showTooltip = isHovered && !isOthers

            return (
              <g
                key={bar.label}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                className="cursor-default"
              >
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barHeight}
                  fill={isOthers ? 'var(--empire-border)' : color}
                  opacity={hoveredIndex === null ? 0.85 : isHovered ? 1 : 0.3}
                  rx="2"
                  style={{ transition: 'opacity 150ms ease' }}
                />

                {showTooltip && (
                  <g>
                    <rect
                      x={x - 2}
                      y={y - 18}
                      width={barW + 4}
                      height={16}
                      rx="2"
                      fill="var(--empire-void)"
                      opacity="0.92"
                    />
                    <text
                      x={x + barW / 2}
                      y={y - 6}
                      textAnchor="middle"
                      style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', fontWeight: 600, fill: 'var(--empire-surface)' }}
                    >
                      {bar.value}%
                      {bar.sublabel && <tspan style={{ fontWeight: 400, opacity: 0.75 }}> ({bar.sublabel})</tspan>}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {displayBars.map((bar, i) => {
          const color = colorMap.get(bar.label) ?? 'var(--series-1)'
          const isOthers = bar.label.startsWith('+')
          const isHovered = hoveredIndex === i
          const barColor = isOthers ? 'var(--empire-border)' : color

          return (
            <div
              key={bar.label}
              className="flex items-center gap-1 cursor-default"
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{
                  backgroundColor: barColor,
                  opacity: hoveredIndex === null ? 1 : isHovered ? 1 : 0.4,
                  transition: 'opacity 150ms ease',
                }}
              />
              <span
                className={cn(
                  'text-[10px] whitespace-nowrap transition-colors duration-150',
                  isHovered ? 'text-empire-void font-semibold' : 'text-empire-subtle',
                )}
              >
                {bar.label}
              </span>
              <span className="font-mono text-[10px] text-empire-subtle tabular-nums">
                {bar.value}%
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
