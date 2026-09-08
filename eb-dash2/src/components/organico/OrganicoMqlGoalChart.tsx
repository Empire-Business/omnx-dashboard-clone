/**
 * OrganicoMqlGoalChart — Gráfico de MQLs orgânicos vs meta.
 *
 * Duas linhas SVG:
 *   - Linha info (token --empire-info): MQLs reais acumulados por dia
 *   - Linha warning tracejada (token --empire-warning): ramp ideal linear (0 → meta no fim do período)
 *
 * Features:
 *   - Hover tooltip interativo com crosshair
 *   - Eixo Y com escala de valores
 *   - Gráfico grande (300px) com respiração
 *   - Responde ao filtro de canal
 */
import { useCallback, useMemo, useRef, useState } from 'react'
import { TrendingUp, Target } from 'lucide-react'
import { isMqlByTag } from '@/hooks/useTrafego'
import type { OppRow } from '@/hooks/useTrafego'
import { spToday } from '@/lib/utils/dates'

interface OrganicoMqlGoalChartProps {
  opps: OppRow[]
  startDate: string
  endDate: string
  targetValue: number | null
  channelLabel?: string
  loading: boolean
}

interface DayPoint {
  date: string
  label: string   // DD/MM
  actual: number  // diário
  cumulative: number
  ideal: number
}

interface TooltipData {
  x: number
  y: number
  point: DayPoint
  idx: number
}

function buildDateRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cursor = new Date(`${start}T00:00:00`)
  const endD = new Date(`${end}T00:00:00`)
  while (cursor <= endD) {
    dates.push(cursor.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }))
    cursor.setDate(cursor.getDate() + 1)
  }
  return dates
}

function formatDate(d: string): string {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

function niceMax(v: number): number {
  if (v <= 0) return 10
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const nice = [1, 2, 2.5, 5, 10]
  for (const n of nice) {
    const candidate = Math.ceil(v / (n * mag)) * n * mag
    if (candidate >= v) return candidate
  }
  return Math.ceil(v * 1.2)
}

// Smooth bezier path through points
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1]
    const curr = pts[i]
    const cpx = (prev.x + curr.x) / 2
    d += ` C ${cpx.toFixed(1)} ${prev.y.toFixed(1)}, ${cpx.toFixed(1)} ${curr.y.toFixed(1)}, ${curr.x.toFixed(1)} ${curr.y.toFixed(1)}`
  }
  return d
}

const W = 700
const H = 420
const PAD = { top: 36, right: 44, bottom: 56, left: 62 }

function ChartSvg({
  series,
  todayIdx,
  targetValue,
  onHover,
  onLeave,
  hovered,
}: {
  series: DayPoint[]
  todayIdx: number
  targetValue: number
  onHover: (data: TooltipData | null) => void
  onLeave: () => void
  hovered: TooltipData | null
}) {
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const rawMax = Math.max(targetValue, ...series.map((p) => p.cumulative), 1)
  const maxY = niceMax(rawMax)

  const xOf = useCallback((idx: number) => PAD.left + (idx / Math.max(series.length - 1, 1)) * chartW, [series.length, chartW])
  const yOf = useCallback((v: number) => PAD.top + chartH - (v / maxY) * chartH, [chartH, maxY])

  const actualPoints = series.map((p, i) => ({ x: xOf(i), y: yOf(p.cumulative) }))
  const idealPoints = series.map((p, i) => ({ x: xOf(i), y: yOf(p.ideal) }))

  // Y-axis ticks — 6 linhas para mais granularidade
  const yTicks = 6
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) => Math.round((i / yTicks) * maxY))

  // X-axis: até 9 labels
  const xLabelCount = Math.min(9, series.length)
  const xLabelIdxs =
    xLabelCount <= 1
      ? [0]
      : Array.from({ length: xLabelCount }, (_, i) =>
          Math.round((i / (xLabelCount - 1)) * (series.length - 1))
        )

  // Área sob a linha real (gradient)
  const areaPath =
    actualPoints.length > 0
      ? `${smoothPath(actualPoints)} L ${actualPoints[actualPoints.length - 1].x.toFixed(1)} ${(PAD.top + chartH).toFixed(1)} L ${actualPoints[0].x.toFixed(1)} ${(PAD.top + chartH).toFixed(1)} Z`
      : ''

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect()
      const svgX = ((e.clientX - rect.left) / rect.width) * W
      const relX = svgX - PAD.left
      const pct = relX / chartW
      const idx = Math.round(Math.min(Math.max(pct, 0), 1) * (series.length - 1))
      if (idx < 0 || idx >= series.length) return
      const pt = series[idx]
      onHover({ x: xOf(idx), y: yOf(pt.cumulative), point: pt, idx })
    },
    [series, chartW, onHover, xOf, yOf]
  )

  const gradientId = 'orgGoalGrad'
  const clipId = 'orgGoalClip'

  const lastIdx = series.length - 1
  const hasToday = todayIdx >= 0 && todayIdx < series.length

  // Valor cumulativo no fim do período (barra de progresso)
  const lastCumulative = series[lastIdx]?.cumulative ?? 0
  // Só mostrar label de "hoje" se não for o último dia (evita duplicar com o endpoint label)
  const showTodayValueLabel = hasToday && todayIdx !== lastIdx && todayIdx > 1

  const targetY = yOf(targetValue)

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full cursor-crosshair select-none"
      style={{ height: H, display: 'block' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={onLeave}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--empire-info)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--empire-info)" stopOpacity="0.02" />
        </linearGradient>
        <clipPath id={clipId}>
          <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
        </clipPath>
      </defs>

      {/* Y-axis gridlines + labels */}
      {yTickValues.map((v) => {
        const y = yOf(v)
        return (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={PAD.left + chartW}
              y1={y}
              y2={y}
              stroke="color-mix(in srgb, var(--empire-void) 6.5%, transparent)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 10}
              y={y + 4}
              textAnchor="end"
              fontSize={11}
              fill="color-mix(in srgb, var(--empire-void) 38%, transparent)"
              fontFamily="inherit"
            >
              {v}
            </text>
          </g>
        )
      })}

      {/* ── Linha de referência da meta (horizontal) ── */}
      <line
        x1={PAD.left}
        x2={PAD.left + chartW}
        y1={targetY}
        y2={targetY}
        stroke="color-mix(in srgb, var(--empire-warning) 28%, transparent)"
        strokeWidth={1.5}
        strokeDasharray="6 4"
        clipPath={`url(#${clipId})`}
      />
      {/* Label da meta — canto direito, acima da linha */}
      <text
        x={PAD.left + chartW - 4}
        y={targetY - 6}
        textAnchor="end"
        fontSize={10.5}
        fill="color-mix(in srgb, var(--empire-warning) 80%, transparent)"
        fontWeight="700"
        fontFamily="inherit"
      >
        meta: {targetValue}
      </text>

      {/* Marcador "Hoje" */}
      {hasToday && (
        <>
          <line
            x1={xOf(todayIdx)}
            x2={xOf(todayIdx)}
            y1={PAD.top}
            y2={PAD.top + chartH}
            stroke="color-mix(in srgb, var(--empire-warning) 35%, transparent)"
            strokeWidth={1.5}
            strokeDasharray="5 3"
          />
          <text
            x={xOf(todayIdx)}
            y={PAD.top - 12}
            textAnchor="middle"
            fontSize={10}
            fill="color-mix(in srgb, var(--empire-warning) 85%, transparent)"
            fontWeight="700"
            fontFamily="inherit"
          >
            hoje
          </text>
        </>
      )}

      {/* Área sob a linha real */}
      {areaPath && (
        <path d={areaPath} fill={`url(#${gradientId})`} clipPath={`url(#${clipId})`} />
      )}

      {/* Linha ideal (tracejada dourada) */}
      {series.length > 0 && (
        <path
          d={smoothPath(idealPoints)}
          fill="none"
          stroke="color-mix(in srgb, var(--empire-warning) 65%, transparent)"
          strokeWidth={2.5}
          strokeDasharray="7 5"
          clipPath={`url(#${clipId})`}
        />
      )}

      {/* Linha real (azul sólida) */}
      {series.length > 0 && (
        <path
          d={smoothPath(actualPoints)}
          fill="none"
          stroke="var(--empire-info)"
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${clipId})`}
        />
      )}

      {/* Dot no início (hollow) */}
      {actualPoints.length > 0 && (
        <circle
          cx={actualPoints[0].x}
          cy={actualPoints[0].y}
          r={4.5}
          fill="var(--empire-elevated)"
          stroke="var(--empire-info)"
          strokeWidth={2.5}
        />
      )}

      {/* Dot + ring no "hoje" */}
      {hasToday && (
        <>
          <circle
            cx={xOf(todayIdx)}
            cy={yOf(series[todayIdx].cumulative)}
            r={9}
            fill="none"
            stroke="color-mix(in srgb, var(--empire-info) 15%, transparent)"
            strokeWidth={2}
          />
          <circle
            cx={xOf(todayIdx)}
            cy={yOf(series[todayIdx].cumulative)}
            r={5}
            fill="var(--empire-elevated)"
            stroke="var(--empire-info)"
            strokeWidth={2.5}
          />
          {/* Valor cumulativo em "hoje" */}
          {showTodayValueLabel && (
            <text
              x={todayIdx > series.length * 0.65 ? xOf(todayIdx) - 13 : xOf(todayIdx) + 13}
              y={yOf(series[todayIdx].cumulative) - 10}
              textAnchor={todayIdx > series.length * 0.65 ? 'end' : 'start'}
              fontSize={12}
              fill="var(--empire-info)"
              fontWeight="700"
              fontFamily="inherit"
            >
              {series[todayIdx].cumulative}
            </text>
          )}
        </>
      )}

      {/* Dot + label no último ponto real */}
      {actualPoints.length > 0 && (
        <>
          <circle
            cx={actualPoints[lastIdx].x}
            cy={actualPoints[lastIdx].y}
            r={4.5}
            fill="var(--empire-elevated)"
            stroke="var(--empire-info)"
            strokeWidth={2.5}
          />
          {/* Valor do último ponto — mostra sempre */}
          <text
            x={actualPoints[lastIdx].x}
            y={actualPoints[lastIdx].y - 12}
            textAnchor="middle"
            fontSize={12}
            fill="var(--empire-info)"
            fontWeight="700"
            fontFamily="inherit"
          >
            {lastCumulative}
          </text>
        </>
      )}

      {/* Dot no fim da linha ideal */}
      {idealPoints.length > 0 && (
        <circle
          cx={idealPoints[lastIdx].x}
          cy={idealPoints[lastIdx].y}
          r={4}
          fill="var(--empire-elevated)"
          stroke="color-mix(in srgb, var(--empire-warning) 85%, transparent)"
          strokeWidth={2}
        />
      )}

      {/* Crosshair + dots de hover */}
      {hovered && (
        <>
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={PAD.top}
            y2={PAD.top + chartH}
            stroke="color-mix(in srgb, var(--empire-info) 25%, transparent)"
            strokeWidth={1}
            strokeDasharray="3 2"
          />
          <circle
            cx={hovered.x}
            cy={yOf(hovered.point.cumulative)}
            r={5.5}
            fill="var(--empire-elevated)"
            stroke="var(--empire-info)"
            strokeWidth={2.5}
          />
          <circle
            cx={hovered.x}
            cy={yOf(hovered.point.ideal)}
            r={4.5}
            fill="var(--empire-elevated)"
            stroke="color-mix(in srgb, var(--empire-warning) 85%, transparent)"
            strokeWidth={2}
          />
        </>
      )}

      {/* Eixo X */}
      {xLabelIdxs.map((idx) => {
        const pt = series[idx]
        if (!pt) return null
        return (
          <text
            key={idx}
            x={xOf(idx)}
            y={H - 20}
            textAnchor="middle"
            fontSize={11}
            fill="color-mix(in srgb, var(--empire-void) 42%, transparent)"
            fontFamily="inherit"
          >
            {pt.label}
          </text>
        )
      })}

      {/* Borda inferior do gráfico */}
      <line
        x1={PAD.left}
        x2={PAD.left + chartW}
        y1={PAD.top + chartH}
        y2={PAD.top + chartH}
        stroke="color-mix(in srgb, var(--empire-void) 12%, transparent)"
        strokeWidth={1}
      />
    </svg>
  )
}

export function OrganicoMqlGoalChart({
  opps,
  startDate,
  endDate,
  targetValue,
  channelLabel,
  loading,
}: OrganicoMqlGoalChartProps) {
  const today = spToday()
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)

  const { series, totalReal, daysElapsed, daysRemaining, totalDays, todayIdx } = useMemo(() => {
    const dates = buildDateRange(startDate, endDate)
    const mqlOpps = opps.filter((o) => isMqlByTag(o.contatos))

    const byDate = new Map<string, number>()
    for (const opp of mqlOpps) {
      if (!opp.data_lead_recebido) continue
      const day = opp.data_lead_recebido.slice(0, 10)
      byDate.set(day, (byDate.get(day) ?? 0) + 1)
    }

    const total = dates.length
    const series: DayPoint[] = []
    let cumulativeActual = 0
    for (const [i, date] of dates.entries()) {
      const dailyActual = byDate.get(date) ?? 0
      cumulativeActual += dailyActual
      const idealTarget = targetValue ?? 0
      series.push({
        date,
        label: formatDate(date),
        actual: dailyActual,
        cumulative: cumulativeActual,
        ideal: Math.round(idealTarget * ((i + 1) / Math.max(total, 1)) * 10) / 10,
      })
    }

    const todayStr = today <= endDate ? today : endDate
    const tIdx = dates.findIndex((d) => d >= todayStr)
    const daysElapsed = tIdx >= 0 ? tIdx + 1 : total
    const daysRemaining = Math.max(0, total - daysElapsed)

    return { series, totalReal: cumulativeActual, daysElapsed, daysRemaining, totalDays: total, todayIdx: tIdx }
  }, [opps, startDate, endDate, targetValue, today])

  const pctAtingido = targetValue && targetValue > 0
    ? Math.min(999, Math.round((totalReal / targetValue) * 100))
    : null

  const neededPerDay = targetValue && daysRemaining > 0
    ? Math.ceil(Math.max(0, targetValue - totalReal) / daysRemaining)
    : null

  const statusColor =
    pctAtingido == null ? 'var(--empire-subtle)'
    : pctAtingido >= 100 ? 'var(--empire-success)'
    : pctAtingido >= 70  ? 'var(--empire-warning)'
    : 'var(--empire-danger)'

  // Loading skeleton
  if (loading) {
    return (
      <div
        className="animate-pulse rounded-2xl p-6"
        style={{ background: 'var(--empire-elevated)', border: '1px solid var(--empire-border)' }}
      >
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-empire-void/[0.08]" />
            <div className="h-5 w-64 rounded bg-empire-void/[0.08]" />
          </div>
          <div className="flex gap-3">
            <div className="h-4 w-16 rounded bg-empire-void/[0.06]" />
            <div className="h-4 w-20 rounded bg-empire-void/[0.06]" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-empire-void/[0.05]" />
          ))}
        </div>
        <div className="h-[420px] rounded-xl bg-empire-void/[0.04]" />
      </div>
    )
  }

  const scopeLabel = channelLabel ?? 'Todos os canais'

  return (
    <div
      className="rounded-2xl p-6"
      style={{ background: 'var(--empire-elevated)', border: '1px solid var(--empire-border)' }}
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <p className="section-label mb-1">Progresso de Metas</p>
          <h3 className="text-lg font-semibold text-empire-void leading-tight">
            MQLs Orgânicos vs Meta
          </h3>
          <p className="text-sm text-empire-subtle mt-0.5">{scopeLabel}</p>
        </div>
        {/* Legenda */}
        <div className="flex items-center gap-5 text-xs text-empire-subtle pt-1">
          <span className="flex items-center gap-2">
            <span className="inline-block w-8 h-[2.5px] bg-empire-info rounded-full" />
            <span className="font-medium">Real acumulado</span>
          </span>
          <span className="flex items-center gap-2">
            <svg width="28" height="2" viewBox="0 0 28 2">
              <line x1="0" y1="1" x2="28" y2="1" stroke="color-mix(in srgb, var(--empire-warning) 75%, transparent)" strokeWidth="2" strokeDasharray="6 4" />
            </svg>
            <span className="font-medium">Meta ideal</span>
          </span>
        </div>
      </div>

      {/* KPI chips */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {/* Total Real */}
        <div
          className="rounded-xl px-4 py-3.5"
          style={{ background: 'color-mix(in srgb, var(--empire-info) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--empire-info) 18%, transparent)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-empire-info mb-1">
            Total Real
          </p>
          <p className="text-2xl font-bold text-empire-info leading-none mb-1">{totalReal}</p>
          <p className="text-[11px] text-empire-info/55">MQLs no período</p>
        </div>

        {/* Meta */}
        <div
          className="rounded-xl px-4 py-3.5"
          style={{ background: 'color-mix(in srgb, var(--empire-warning) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--empire-warning) 22%, transparent)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-empire-primary mb-1">
            Meta
          </p>
          <p className="text-2xl font-bold text-empire-primary leading-none mb-1">
            {targetValue != null ? targetValue : '—'}
          </p>
          <p className="text-[11px] text-empire-warning/55">
            {targetValue ? `alvo em ${totalDays} dias` : 'Sem meta cadastrada'}
          </p>
        </div>

        {/* % Atingido */}
        <div
          className="rounded-xl px-4 py-3.5"
          style={{
            background: pctAtingido == null
              ? 'color-mix(in srgb, var(--empire-void) 4%, transparent)'
              : pctAtingido >= 100
                ? 'color-mix(in srgb, var(--empire-success) 8%, transparent)'
                : pctAtingido >= 70
                  ? 'color-mix(in srgb, var(--empire-warning) 8%, transparent)'
                  : 'color-mix(in srgb, var(--empire-danger) 7%, transparent)',
            border: '1px solid color-mix(in srgb, var(--empire-void) 9%, transparent)',
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] mb-1" style={{ color: statusColor }}>
            % Atingido
          </p>
          <p className="text-2xl font-bold leading-none mb-1" style={{ color: statusColor }}>
            {pctAtingido != null ? `${pctAtingido}%` : '—'}
          </p>
          <p className="text-[11px] text-empire-subtle">
            {pctAtingido == null
              ? 'Sem meta'
              : pctAtingido >= 100
                ? 'Meta batida!'
                : `faltam ${Math.max(0, (targetValue ?? 0) - totalReal)} MQLs`}
          </p>
        </div>

        {/* Ideal/dia recalculado */}
        <div
          className="rounded-xl px-4 py-3.5"
          style={{ background: 'color-mix(in srgb, var(--empire-void) 4%, transparent)', border: '1px solid color-mix(in srgb, var(--empire-void) 9%, transparent)' }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-empire-subtle mb-1">
            Ideal/dia
          </p>
          <p className="text-2xl font-bold text-empire-void leading-none mb-1">
            {neededPerDay != null ? neededPerDay : '—'}
          </p>
          <p className="text-[11px] text-empire-subtle">
            {neededPerDay != null
              ? `para ${daysRemaining}d restantes`
              : targetValue
                ? daysRemaining === 0 ? 'Período encerrado' : '—'
                : 'Sem meta'}
          </p>
        </div>
      </div>

      {/* Gráfico ou CTA sem meta */}
      {targetValue == null || targetValue === 0 ? (
        <div
          className="flex flex-col items-center justify-center gap-4 rounded-xl py-16"
          style={{ background: 'color-mix(in srgb, var(--empire-void) 2.5%, transparent)', border: '1.5px dashed color-mix(in srgb, var(--empire-void) 12%, transparent)' }}
        >
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: 'color-mix(in srgb, var(--empire-void) 6%, transparent)' }}
          >
            <Target size={24} className="text-empire-subtle" />
          </div>
          <div className="text-center max-w-sm">
            <p className="text-sm font-medium text-empire-void mb-1">
              Nenhuma meta cadastrada
            </p>
            <p className="text-xs text-empire-subtle">
              Acesse a aba <span className="font-medium text-empire-void">Metas</span> e cadastre em{' '}
              <span className="font-medium text-empire-void">Orgânico → MQLs Orgânicos</span>. Você pode
              definir metas por canal individual ou uma meta global.
            </p>
          </div>
        </div>
      ) : series.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-sm text-empire-subtle">
          Sem dados para o período selecionado.
        </div>
      ) : (
        <div className="relative" ref={chartRef}>
          {/* Tooltip */}
          {tooltip && (
            <div
              className="pointer-events-none absolute z-10 rounded-lg px-3 py-2.5 text-xs shadow-lg"
              style={{
                background: 'color-mix(in srgb, var(--empire-void) 92%, transparent)',
                backdropFilter: 'blur(6px)',
                border: '1px solid color-mix(in srgb, var(--empire-surface) 8%, transparent)',
                color: 'var(--empire-surface)',
                left: `calc(${(tooltip.x / 700) * 100}% + 8px)`,
                top: 8,
                transform: tooltip.idx > series.length * 0.7 ? 'translateX(calc(-100% - 16px))' : 'none',
                minWidth: 130,
              }}
            >
              <p className="font-semibold mb-1.5 text-empire-surface/70">{tooltip.point.label}</p>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-empire-info" />
                    Real acumulado
                  </span>
                  <span className="font-bold text-empire-surface">{tooltip.point.cumulative}</span>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-empire-warning/90" />
                    Meta ideal
                  </span>
                  <span className="font-bold text-empire-warning/90">{Math.round(tooltip.point.ideal)}</span>
                </div>
                {tooltip.point.actual > 0 && (
                  <div className="flex items-center justify-between gap-4 pt-0.5 border-t border-empire-surface/10 mt-0.5">
                    <span className="text-empire-surface/50">No dia</span>
                    <span className="font-medium text-empire-surface/70">+{tooltip.point.actual}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <ChartSvg
            series={series}
            todayIdx={todayIdx}
            targetValue={targetValue}
            onHover={setTooltip}
            onLeave={() => setTooltip(null)}
            hovered={tooltip}
          />
        </div>
      )}

      {/* Rodapé */}
      {targetValue != null && targetValue > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-empire-subtle">
          <span className="flex items-center gap-1.5">
            <TrendingUp size={12} />
            {daysElapsed} de {totalDays} dias decorridos
          </span>
          {daysRemaining > 0 && <span>· {daysRemaining} dias restantes</span>}
          {neededPerDay != null && neededPerDay > 0 && (
            <span>· ritmo necessário: <strong className="text-empire-void">{neededPerDay} MQL/dia</strong></span>
          )}
        </div>
      )}
    </div>
  )
}
