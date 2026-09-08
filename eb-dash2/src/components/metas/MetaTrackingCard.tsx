import { useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { IdealDiaResult, CostMqlIdealDia, CostMqlPoint } from '@/hooks/useTrafego'
import type { Meta } from '@/hooks/useMetas'
import { fmtDate } from '@/lib/utils/dates'

// ─── Helpers ─────────────────────────────────────────────────

function fmtCurrencyCompact(value: number): string {
  if (value >= 1_000_000) return `R$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `R$${(value / 1_000).toFixed(1)}k`
  return `R$${Math.round(value)}`
}

function fmtCurrency(value: number): string {
  return value.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

// ─── MiniBarChart (MQLs diários) ─────────────────────────────

function MiniBarChart({ series, metaValue }: { series: CostMqlPoint[]; metaValue: number }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (series.length < 2) return null

  const daily = series.map((point, index) =>
    index === 0 ? point.cumMqls : Math.max(0, point.cumMqls - series[index - 1].cumMqls),
  )

  const periodDays = series.length
  const idealPerDay = periodDays > 0 ? metaValue / periodDays : 0
  const maxVal = Math.max(...daily, idealPerDay * 1.5, 1)

  const W = 600
  const H = 80
  const PT = 6
  const PB = 18
  const plotH = H - PT - PB
  const barW = Math.max(1, (W / series.length) * 0.7)
  const barGap = W / series.length

  const toX = (index: number) => index * barGap + barGap / 2
  const toY = (value: number) => PT + plotH - (value / maxVal) * plotH
  const toH = (value: number) => Math.max(1, (value / maxVal) * plotH)
  const idealY = toY(idealPerDay)

  const xIndices: number[] = []
  const step = Math.max(1, Math.floor((series.length - 1) / 3))
  for (let i = 0; i < series.length; i += step) xIndices.push(i)
  if (!xIndices.includes(series.length - 1)) xIndices.push(series.length - 1)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: '80px' }}
        onMouseLeave={() => setHoveredIdx(null)}
      >
        {idealPerDay > 0 && (
          <line
            x1={0}
            y1={idealY}
            x2={W}
            y2={idealY}
            stroke="var(--empire-primary)"
            strokeOpacity="0.6"
            strokeWidth="1.5"
            strokeDasharray="5,3"
          />
        )}

        {daily.map((value, index) => {
          const isHovered = hoveredIdx === index
          const isGood = value >= idealPerDay
          const color = isGood ? 'var(--empire-success)' : 'var(--empire-warning)'
          const opacity = isHovered || hoveredIdx === null ? 0.75 : 0.4

          return (
            <rect
              key={index}
              x={toX(index) - barW / 2}
              y={toY(value)}
              width={barW}
              height={toH(value)}
              fill={color}
              fillOpacity={opacity}
              rx="1"
              className="cursor-default transition-all duration-100"
              onMouseEnter={() => setHoveredIdx(index)}
            />
          )
        })}

        <line x1={0} y1={PT + plotH} x2={W} y2={PT + plotH} stroke="var(--empire-border-strong)" strokeWidth="1" />

        {xIndices.map((idx) => {
          const date = series[idx]?.date
          if (!date) return null
          const parts = date.split('-')
          const label = parts.length === 3 ? `${parts[2]}/${parts[1]}` : date
          return (
            <text key={idx} x={toX(idx)} y={H - 3} textAnchor="middle" fontSize="9" fill="var(--empire-subtle)">
              {label}
            </text>
          )
        })}
      </svg>

      {hoveredIdx !== null && (
        <div
          className="pointer-events-none absolute top-0.5 z-10 whitespace-nowrap rounded border border-empire-border bg-empire-surface px-1.5 py-0.5 text-[10px] shadow-sm"
          style={{
            left: `${(hoveredIdx / series.length) * 100}%`,
            transform: 'translateX(-50%)',
          }}
        >
          <span className="font-semibold text-empire-void">{daily[hoveredIdx]} MQL</span>
          <span className="ml-1 text-empire-muted">
            {(() => {
              const date = series[hoveredIdx]?.date
              if (!date) return ''
              const parts = date.split('-')
              return parts.length === 3 ? `${parts[2]}/${parts[1]}` : date
            })()}
          </span>
        </div>
      )}

      <div className="mt-1 flex items-center gap-3 text-[11px] text-empire-subtle">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-empire-success/70" />
          Acima
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm bg-empire-warning/70" />
          Abaixo
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-px w-3 border-t-[1.5px] border-dashed border-empire-primary/60" />
          Ideal/dia
        </span>
      </div>
    </div>
  )
}

// ─── CostInfoBox ─────────────────────────────────────────────

function CostInfoBox({
  label,
  value,
  footer,
  tone = 'default',
}: {
  label: string
  value: string
  footer?: string
  tone?: 'default' | 'good' | 'warning'
}) {
  const boxClass =
    tone === 'good'
      ? 'border-empire-success/25 bg-empire-success-soft'
      : tone === 'warning'
        ? 'border-empire-warning/25 bg-empire-warning-soft'
        : 'border-empire-border bg-empire-elevated'

  return (
    <div className={cn('rounded-lg border px-3 py-2', boxClass)}>
      <p className="text-[11px] uppercase tracking-wider text-empire-subtle">{label}</p>
      <p className="mt-0.5 text-base font-bold leading-tight text-empire-void">{value}</p>
      {footer && <p className="mt-0.5 text-[11px] text-empire-subtle">{footer}</p>}
    </div>
  )
}

// ─── Props ───────────────────────────────────────────────────

interface Props {
  // MQL section
  mqlCount: number
  mqlMeta: Meta | null
  idealDia: IdealDiaResult | undefined
  mqlSeries: CostMqlPoint[]
  // Cost section
  custoPorMql: number
  totalSpend: number
  costMeta: Meta | null
  idealCost: CostMqlIdealDia | null
  // Shared
  loading?: boolean
  filterStartDate: string
  filterEndDate: string
}

// ─── Main Component ──────────────────────────────────────────

export function MetaTrackingCard({
  mqlCount,
  mqlMeta,
  idealDia,
  mqlSeries,
  custoPorMql,
  totalSpend,
  costMeta,
  idealCost,
  loading,
  filterStartDate,
  filterEndDate,
}: Props) {
  if (loading) return <Skeleton className="h-[320px] w-full rounded-lg" />

  const mqlMetaValue = mqlMeta?.valor ?? 0
  const costMetaValue = costMeta?.valor ?? 0

  // MQL progress
  const faltam = Math.max(0, mqlMetaValue - mqlCount)
  const pct = idealDia?.pctOfMeta ?? (mqlMetaValue > 0 ? Math.round((mqlCount / mqlMetaValue) * 100) : 0)
  const daysElapsed = idealDia?.daysElapsed ?? 0
  const daysRemaining = idealDia?.daysRemaining ?? 0
  const ritmoAtual = daysElapsed > 0 ? (mqlCount / daysElapsed).toFixed(1) : '—'
  const idealDiaFaltam = faltam === 0 ? null : daysRemaining > 0 ? (faltam / daysRemaining).toFixed(1) : '—'
  const progressTone = pct >= 100 ? 'good' : pct >= 70 ? 'warning' : 'danger'

  // Cost status
  const costIsGood = costMetaValue > 0 ? custoPorMql <= costMetaValue : true
  const costTone = costIsGood ? 'good' : 'warning'
  const costStatusLabel = custoPorMql === 0 ? '—' : costIsGood ? 'Dentro da meta' : 'Acima da meta'

  // Date mismatch
  const primaryMeta = mqlMeta ?? costMeta
  const hasDifferentDateFilter =
    !!primaryMeta && (primaryMeta.periodo_inicio !== filterStartDate || primaryMeta.periodo_fim !== filterEndDate)

  return (
    <div className="space-y-3 rounded-lg border border-empire-border bg-empire-surface p-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-0.5 rounded-full bg-empire-primary" />
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-empire-subtle">
            Acompanhamento de Metas
          </h3>
        </div>
        {primaryMeta && (
          <p className="text-[10px] text-empire-subtle">
            {fmtDate(primaryMeta.periodo_inicio)} — {fmtDate(primaryMeta.periodo_fim)}
          </p>
        )}
      </div>

      {hasDifferentDateFilter && (
        <div className="rounded border border-empire-warning/30 bg-empire-warning-soft px-3 py-1.5 text-[10px] text-empire-warning">
          Este card usa a vigência da meta salva. O filtro de data da tela não altera este cálculo.
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="flex flex-col lg:flex-row">
        {/* ── LEFT: MQLs ── */}
        <div className="flex-1 space-y-3 pb-3 lg:pb-0 lg:pr-5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-empire-subtle">MQLs</p>

          {/* Hero percentage */}
          {mqlMetaValue > 0 ? (
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span
                  className={cn(
                    'text-4xl font-bold tabular-nums leading-none',
                    progressTone === 'good' && 'text-empire-success',
                    progressTone === 'warning' && 'text-empire-warning',
                    progressTone === 'danger' && 'text-empire-danger',
                  )}
                >
                  {pct}%
                </span>
                <span className="text-xs text-empire-subtle">da meta</span>
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-lg font-bold tabular-nums text-empire-void">{mqlCount}</span>
                <span className="text-xs text-empire-subtle">/ {Math.round(mqlMetaValue)}</span>
              </div>

              {/* Progress bar */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-empire-elevated">
                <div
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-full transition-[width] duration-500',
                    progressTone === 'good' && 'bg-empire-success',
                    progressTone === 'warning' && 'bg-empire-warning',
                    progressTone === 'danger' && 'bg-empire-danger',
                  )}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-baseline gap-2 py-1">
              <span className="text-3xl font-bold tabular-nums text-empire-void">{mqlCount}</span>
              <span className="text-xs text-empire-subtle">MQLs no período</span>
            </div>
          )}

          {/* Info boxes */}
          {mqlMetaValue > 0 && (
            <div className="grid grid-cols-3 gap-1.5">
              <div
                className={cn(
                  'rounded border px-2 py-1.5 text-center',
                  faltam === 0
                    ? 'border-empire-success/30 bg-empire-success-soft'
                    : 'border-empire-border bg-empire-elevated',
                )}
              >
                <p className="text-[11px] uppercase tracking-wider text-empire-subtle">Faltam</p>
                <p
                  className={cn(
                    'text-base font-bold leading-tight tabular-nums',
                    faltam === 0 ? 'text-empire-success' : 'text-empire-void',
                  )}
                >
                  {faltam === 0 ? '0' : faltam}
                </p>
              </div>

              <div className="rounded border border-empire-border bg-empire-elevated px-2 py-1.5 text-center">
                <p className="text-[11px] uppercase tracking-wider text-empire-subtle">Ritmo</p>
                <p className="text-base font-bold leading-tight tabular-nums text-empire-void">{ritmoAtual}</p>
                <p className="text-[11px] text-empire-subtle">/dia</p>
              </div>

              <div
                className={cn(
                  'rounded border px-2 py-1.5 text-center',
                  faltam === 0
                    ? 'border-empire-success/30 bg-empire-success-soft'
                    : 'border-empire-border bg-empire-elevated',
                )}
              >
                <p className="text-[11px] uppercase tracking-wider text-empire-subtle">Ideal</p>
                <p
                  className={cn(
                    'text-base font-bold leading-tight tabular-nums',
                    faltam === 0 ? 'text-empire-success' : 'text-empire-void',
                  )}
                >
                  {faltam === 0 ? 'Meta!' : (idealDiaFaltam ?? '—')}
                </p>
                {faltam > 0 && <p className="text-[11px] text-empire-subtle">/dia restante</p>}
              </div>
            </div>
          )}

          {/* MiniBarChart */}
          {mqlSeries.length > 1 && mqlMetaValue > 0 && (
            <div className="border-t border-empire-border pt-2">
              <MiniBarChart series={mqlSeries} metaValue={mqlMetaValue} />
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div className="border-t border-empire-border lg:border-t-0 lg:border-l" />

        {/* ── RIGHT: Custo por MQL ── */}
        <div className="flex-1 space-y-3 pt-3 lg:pt-0 lg:pl-5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-empire-subtle">Custo por MQL</p>
            {custoPorMql > 0 && (
              <span className={cn('flex items-center gap-1 text-[10px] font-medium', costTone === 'good' ? 'text-empire-success' : 'text-empire-warning')}>
                <span className={cn('inline-block h-1.5 w-1.5 rounded-full', costTone === 'good' ? 'bg-empire-success' : 'bg-empire-warning')} />
                {costStatusLabel}
              </span>
            )}
          </div>

          {/* Hero cost per MQL */}
          <div>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'text-3xl font-bold tabular-nums leading-none',
                  costTone === 'good' ? 'text-empire-success' : 'text-empire-warning',
                )}
              >
                {custoPorMql > 0 ? fmtCurrency(custoPorMql) : '—'}
              </span>
              <span className="text-xs text-empire-subtle">realizado</span>
            </div>
            {costMetaValue > 0 && (
              <p className="mt-1 text-xs text-empire-subtle">
                Meta: <span className="font-semibold text-empire-void">{fmtCurrency(costMetaValue)}</span>
              </p>
            )}
          </div>

          {/* Investimento ideal acumulado vs realizado */}
          {idealCost ? (
            <div className="space-y-2">
              <div className="rounded border border-empire-border bg-empire-elevated px-3 py-2">
                <p className="mb-1.5 text-[11px] uppercase tracking-wider text-empire-subtle">Investimento</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-[11px] text-empire-subtle">Ideal acumulado</p>
                    <p className="text-base font-bold tabular-nums text-empire-void">{fmtCurrency(idealCost.idealBudgetAcumulado)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-empire-subtle">Realizado</p>
                    <p className="text-base font-bold tabular-nums text-empire-void">{fmtCurrency(totalSpend)}</p>
                  </div>
                </div>
                <p
                  className={cn(
                    'mt-1 text-[10px]',
                    idealCost.delta <= 0 ? 'text-empire-success' : 'text-empire-warning',
                  )}
                >
                  {idealCost.delta >= 0 ? '+' : ''}{fmtCurrencyCompact(Math.abs(idealCost.delta)).replace('R$', 'R$ ')}{' '}
                  {idealCost.delta >= 0 ? 'acima do ideal' : 'abaixo do ideal'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <CostInfoBox
                  label="Custo/MQL real"
                  value={custoPorMql > 0 ? fmtCurrency(custoPorMql) : '—'}
                  footer={`${totalSpend > 0 ? fmtCurrencyCompact(totalSpend) : 'R$ 0'} invest.`}
                  tone={costIsGood ? 'good' : 'warning'}
                />
                <CostInfoBox
                  label="Custo/MQL ideal"
                  value={idealCost.costPerMqlIdeal > 0 ? fmtCurrency(idealCost.costPerMqlIdeal) : '—'}
                  footer={idealCost.costPerMqlIdeal > 0 ? 'daqui pra frente' : 'meta atingida'}
                  tone={idealCost.onTrack ? 'good' : 'warning'}
                />
              </div>
            </div>
          ) : costMetaValue > 0 ? (
            <div className="rounded border border-empire-warning/25 bg-empire-warning-soft px-3 py-1.5 text-[10px] text-empire-warning">
              Para calcular o ideal de custo, crie uma meta de MQL com o mesmo período desta meta.
            </div>
          ) : (
            <div className="rounded border border-empire-border bg-empire-elevated px-3 py-2">
              <p className="text-xs text-empire-subtle">Meta de custo/MQL não definida</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
