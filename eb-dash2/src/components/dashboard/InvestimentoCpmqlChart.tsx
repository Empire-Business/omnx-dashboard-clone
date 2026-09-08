import { useState, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────
export interface DailyPoint {
  date: string
  spend: number
  mqls: number
  cpmql: number
  ma7cpmql: number | null
}

interface Props {
  data: DailyPoint[]
  loading?: boolean
}

// ─── Layout constants ─────────────────────────────────────────
const VB_W = 1000
const VB_H = 300
const ML = 74
const MR = 70
const MT = 20
const MB = 48
const PW = VB_W - ML - MR   // 856
const PH = VB_H - MT - MB   // 232

// ─── Empire token palette ─────────────────────────────────────
const C_INK    = 'var(--empire-void)'
const C_STEEL  = 'var(--empire-subtle)'
const C_GHOST  = 'var(--empire-border)'
const C_EMPIRE = 'var(--empire-muted)'   // barras de investimento — tom discreto
const C_GOLD   = 'var(--empire-primary)' // linha CPMQL diário
const C_GOLD_DARK = 'var(--empire-primary)' // labels do eixo CPMQL
const C_RED    = 'var(--empire-danger)'  // dots CPMQL (incluindo zero)
const C_BLUE   = 'var(--chart-3)'       // linha MA7 — tom distinto do primário nos dois modos

// ─── Pure helpers ─────────────────────────────────────────────
function niceMax(v: number): number {
  if (v <= 0) return 100
  const ticks = 5
  const raw = v * 1.2
  const step = Math.pow(10, Math.floor(Math.log10(raw / ticks)))
  return Math.ceil(raw / step) * step
}

function formatCurrency(v: number): string {
  if (v >= 1_000_000) return `R$${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `R$${(v / 1_000).toFixed(0)}k`
  return `R$${v.toFixed(0)}`
}

function formatCurrencyFull(v: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v)
}

function fmtDateLabel(d: string): string {
  const [, m, day] = d.split('-')
  const months = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
  return `${Number(day)}/${months[Number(m) - 1]}`
}

function pearsonCorrelation(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, denX = 0, denY = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX
    const dy = ys[i] - meanY
    num += dx * dy
    denX += dx * dx
    denY += dy * dy
  }
  const den = Math.sqrt(denX * denY)
  return den === 0 ? null : num / den
}

function xCenter(i: number, barGap: number): number {
  return ML + i * barGap + barGap / 2
}

// ─── Skeleton ─────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="h-5 w-48 animate-pulse rounded bg-empire-border" />
        <div className="flex gap-2">
          {[80, 72, 64].map((w) => (
            <div key={w} className="h-6 animate-pulse rounded-full bg-empire-border" style={{ width: w }} />
          ))}
        </div>
      </div>
      <div className="h-[200px] animate-pulse rounded-lg bg-empire-elevated" />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────
export function InvestimentoCpmqlChart({ data, loading }: Props) {
  // All hooks before any conditional returns
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const svgX = ((e.clientX - rect.left) / rect.width) * VB_W
    const barGap = PW / data.length
    const n = barGap > 0 ? Math.round(PW / barGap) : 0
    if (n === 0) return
    const rawIdx = Math.floor((svgX - ML) / barGap)
    setHoveredIdx(Math.max(0, Math.min(n - 1, rawIdx)))
  }, [data])

  const handleMouseLeave = useCallback(() => setHoveredIdx(null), [])

  // Early returns after all hooks
  if (loading) return <ChartSkeleton />
  if (!data.length) return null

  // ── Aggregates ─────────────────────────────────────────────
  const N = data.length
  const barGap = PW / N

  const totalSpend = data.reduce((s, d) => s + d.spend, 0)
  const totalMqls = data.reduce((s, d) => s + d.mqls, 0)
  const avgCpmql = totalSpend > 0 && totalMqls > 0 ? totalSpend / totalMqls : 0

  const validCpmql = data.filter((d) => d.cpmql > 0)
  const half = Math.floor(validCpmql.length / 2)
  const firstHalfAvg = half > 0 ? validCpmql.slice(0, half).reduce((s, d) => s + d.cpmql, 0) / half : 0
  const secondHalfAvg = half > 0 ? validCpmql.slice(half).reduce((s, d) => s + d.cpmql, 0) / (validCpmql.length - half) : 0
  const trendPct = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100 : 0

  const corrPts = data.filter((d) => d.spend > 0 && d.cpmql > 0)
  const correlation = pearsonCorrelation(corrPts.map((d) => d.spend), corrPts.map((d) => d.cpmql))

  // ── Y scales — ambos os eixos compartilham o mesmo domínio ──
  const spendMax = niceMax(Math.max(...data.map((d) => d.spend), 1))
  const cpmqlMax = niceMax(
    Math.max(
      ...data.map((d) => d.cpmql).filter((v) => v > 0),
      ...data.map((d) => d.ma7cpmql ?? 0).filter((v) => v > 0),
      1,
    ),
  )
  const sharedMax = Math.max(spendMax, cpmqlMax)
  const TICKS = 5
  const leftTicks = Array.from({ length: TICKS + 1 }, (_, i) => (sharedMax / TICKS) * i)
  const rightTicks = Array.from({ length: TICKS + 1 }, (_, i) => (sharedMax / TICKS) * i)

  const yLeft  = (v: number) => MT + PH - (v / sharedMax) * PH
  const yRight = (v: number) => MT + PH - (v / sharedMax) * PH

  // ── X axis ─────────────────────────────────────────────────
  const barW = Math.max(2, Math.min(20, (barGap - (N > 30 ? 1 : 2)) * 0.7))
  const xBar = (i: number) => ML + i * barGap + (barGap - barW) / 2
  const labelStep = Math.max(1, Math.ceil(N / 10))

  // ── Polylines ──────────────────────────────────────────────
  const polyStr = (pts: [number, number][]) =>
    pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')

  const cpmqlLine: [number, number][] = data
    .map((d, i) => d.cpmql > 0 ? [xCenter(i, barGap), yRight(d.cpmql)] as [number, number] : null)
    .filter((p): p is [number, number] => p !== null)

  const ma7Line: [number, number][] = data
    .map((d, i) => d.ma7cpmql != null && d.ma7cpmql > 0 ? [xCenter(i, barGap), yRight(d.ma7cpmql)] as [number, number] : null)
    .filter((p): p is [number, number] => p !== null)

  // ── Tooltip ────────────────────────────────────────────────
  const hovered = hoveredIdx !== null ? data[hoveredIdx] : null
  const tooltipPct = hoveredIdx !== null ? ((xCenter(hoveredIdx, barGap) - ML) / PW) * 100 : null

  // ── Correlation ────────────────────────────────────────────
  let corrLabel = 'Dados insuficientes para correlação'
  let corrDot = C_STEEL
  if (correlation !== null) {
    if (correlation > 0.35) {
      corrLabel = `Correlação positiva: mais investimento → CPMQL mais alto (r=${correlation.toFixed(2)})`
      corrDot = 'var(--empire-danger)'
    } else if (correlation < -0.35) {
      corrLabel = `Correlação negativa: mais investimento → CPMQL mais baixo (r=${correlation.toFixed(2)})`
      corrDot = 'var(--empire-success)'
    } else {
      corrLabel = `Sem correlação clara entre investimento e CPMQL (r=${correlation.toFixed(2)})`
      corrDot = C_STEEL
    }
  }

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-4 sm:p-5 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-empire-void">
              Investimento × CPMQL ao longo do tempo
            </h3>
            <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-empire-subtle">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: corrDot }}
              />
              {corrLabel}
            </p>
          </div>

          {/* Summary chips */}
          <div className="flex flex-wrap gap-2">
            <div className="rounded-full border border-empire-border bg-empire-elevated px-3 py-1 text-[10px]">
              <span className="text-empire-subtle">Total investido </span>
              <span className="font-mono font-semibold text-empire-void">{formatCurrencyFull(totalSpend)}</span>
            </div>
            <div className="rounded-full border border-empire-border bg-empire-elevated px-3 py-1 text-[10px]">
              <span className="text-empire-subtle">CPMQL médio </span>
              <span className="font-mono font-semibold text-empire-void">
                {avgCpmql > 0 ? formatCurrencyFull(avgCpmql) : '—'}
              </span>
            </div>
            {validCpmql.length >= 4 && (
              <div
                className={cn(
                  'flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-medium',
                  trendPct > 5
                    ? 'border-empire-danger/20 bg-empire-danger-soft text-empire-danger'
                    : trendPct < -5
                      ? 'border-empire-success/20 bg-empire-success-soft text-empire-success'
                      : 'border-empire-border bg-empire-elevated text-empire-subtle',
                )}
              >
                {trendPct > 5 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : trendPct < -5 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                <span className="ml-0.5 font-mono">
                  CPMQL {trendPct > 0 ? '+' : ''}{trendPct.toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'crosshair' }}
        >
          {/* Horizontal grid lines */}
          {leftTicks.map((v) => (
            <line
              key={v}
              x1={ML} x2={ML + PW}
              y1={yLeft(v)} y2={yLeft(v)}
              stroke={C_GHOST}
              strokeWidth="1"
            />
          ))}

          {/* Y left labels — Investimento */}
          {leftTicks.map((v) => (
            <text
              key={v}
              x={ML - 6} y={yLeft(v) + 4}
              textAnchor="end" fontSize="10"
              fill={C_STEEL}
            >
              {formatCurrency(v)}
            </text>
          ))}

          {/* Y left title */}
          <text
            x={11} y={MT + PH / 2}
            textAnchor="middle" fontSize="9"
            fill={C_STEEL}
            opacity="0.7"
            transform={`rotate(-90, 11, ${MT + PH / 2})`}
          >
            Investimento (R$)
          </text>

          {/* Y right labels — CPMQL */}
          {rightTicks.map((v) => (
            <text
              key={v}
              x={ML + PW + 6} y={yRight(v) + 4}
              textAnchor="start" fontSize="10"
              fill={C_GOLD_DARK}
            >
              {formatCurrency(v)}
            </text>
          ))}

          {/* Y right title */}
          <text
            x={VB_W - 9} y={MT + PH / 2}
            textAnchor="middle" fontSize="9"
            fill={C_GOLD_DARK}
            transform={`rotate(90, ${VB_W - 9}, ${MT + PH / 2})`}
          >
            CPMQL (R$/MQL)
          </text>

          {/* Bars — Investimento */}
          {data.map((d, i) => {
            const h = d.spend > 0 ? (d.spend / sharedMax) * PH : 0
            return (
              <rect
                key={d.date}
                x={xBar(i)} y={MT + PH - h}
                width={barW} height={h}
                fill={C_EMPIRE}
                opacity={hoveredIdx === null ? 0.5 : hoveredIdx === i ? 0.8 : 0.15}
                rx="1.5"
              />
            )
          })}


          {/* MA7 dashed line — chart-3, claramente distinta da linha CPMQL primária */}
          {ma7Line.length > 1 && (
            <polyline
              points={polyStr(ma7Line)}
              fill="none"
              stroke={C_BLUE}
              strokeWidth="4"
              strokeDasharray="5 3"
              strokeLinejoin="round"
              opacity="0.85"
            />
          )}

          {/* CPMQL solid line */}
          {cpmqlLine.length > 1 && (
            <polyline
              points={polyStr(cpmqlLine)}
              fill="none"
              stroke={C_GOLD}
              strokeWidth="4.5"
              strokeLinejoin="round"
            />
          )}

          {/* CPMQL dots — vermelho, inclusive quando cpmql=0 */}
          {data.map((d, i) => {
            const cy = d.cpmql > 0 ? yRight(d.cpmql) : MT + PH
            const isHovered = hoveredIdx === i
            return (
              <circle
                key={d.date}
                cx={xCenter(i, barGap)} cy={cy}
                r={isHovered ? 5 : 3}
                fill={C_RED}
                stroke="var(--empire-surface)" strokeWidth="1.5"
                opacity={hoveredIdx === null ? 0.85 : isHovered ? 1 : 0.25}
              />
            )
          })}

          {/* Hover vertical guide */}
          {hoveredIdx !== null && (
            <line
              x1={xCenter(hoveredIdx, barGap)} x2={xCenter(hoveredIdx, barGap)}
              y1={MT} y2={MT + PH}
              stroke={C_INK}
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.15"
            />
          )}

          {/* X axis baseline */}
          <line
            x1={ML} x2={ML + PW}
            y1={MT + PH} y2={MT + PH}
            stroke={C_GHOST} strokeWidth="1"
          />

          {/* X axis labels */}
          {data.map((d, i) =>
            i % labelStep === 0 ? (
              <text
                key={d.date}
                x={xCenter(i, barGap)} y={MT + PH + 15}
                textAnchor="middle" fontSize="9.5"
                fill={C_STEEL}
                opacity="0.7"
              >
                {fmtDateLabel(d.date)}
              </text>
            ) : null,
          )}
        </svg>

        {/* Legend */}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4 text-[10px] text-empire-subtle">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-3.5 rounded-sm" style={{ background: C_EMPIRE, opacity: 0.5 }} />
            <span>Investimento diário</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 rounded" style={{ background: C_GOLD }} />
            <div className="h-2 w-2 rounded-full" style={{ background: C_RED }} />
            <span>CPMQL diário</span>
          </div>
          {ma7Line.length > 1 && (
            <div className="flex items-center gap-1.5">
              <svg width="16" height="6">
                <line x1="0" y1="3" x2="16" y2="3" stroke={C_BLUE} strokeWidth="3" strokeDasharray="5 3" opacity="0.85" />
              </svg>
              <span>Média móvel 7d (CPMQL)</span>
            </div>
          )}
        </div>

        {/* Floating tooltip */}
        {hovered && tooltipPct !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-1 rounded-lg border border-empire-border bg-empire-surface px-3 py-2 shadow-md"
            style={{
              left: `${tooltipPct}%`,
              marginLeft: tooltipPct < 15 ? '60px' : tooltipPct > 85 ? '-60px' : '0px',
            }}
          >
            <p className="mb-1.5 text-[10px] font-semibold text-empire-void">
              {fmtDateLabel(hovered.date)}
            </p>
            <div className="space-y-1 text-[10px]">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 shrink-0 rounded-sm" style={{ background: C_EMPIRE }} />
                <span className="text-empire-subtle">Investimento</span>
                <span className="font-mono ml-auto pl-4 font-semibold text-empire-void">
                  {formatCurrencyFull(hovered.spend)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: C_RED }} />
                <span className="text-empire-subtle">MQLs</span>
                <span className="font-mono ml-auto pl-4 font-semibold text-empire-void">{hovered.mqls}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 shrink-0 rounded-full" style={{ background: C_RED }} />
                <span className="text-empire-subtle">CPMQL</span>
                <span className="font-mono ml-auto pl-4 font-semibold text-empire-void">
                  {hovered.cpmql > 0 ? formatCurrencyFull(hovered.cpmql) : '—'}
                </span>
              </div>
              {hovered.ma7cpmql != null && hovered.ma7cpmql > 0 && (
                <div className="flex items-center gap-2">
                  <svg width="8" height="6" className="shrink-0">
                    <line x1="0" y1="3" x2="8" y2="3" stroke={C_BLUE} strokeWidth="2" strokeDasharray="5 3" opacity="0.8" />
                  </svg>
                  <span className="text-empire-subtle">MA7 CPMQL</span>
                  <span className="font-mono ml-auto pl-4 font-semibold text-empire-void">
                    {formatCurrencyFull(hovered.ma7cpmql)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
