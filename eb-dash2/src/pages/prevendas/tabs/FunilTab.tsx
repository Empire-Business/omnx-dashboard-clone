import { useState, useMemo, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadListModal } from '@/components/leads/LeadCard'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import {
  buildCampaignFunnelMap,
  buildRevenueMap,
  buildPaymentDateMap,
  isMqlByTag,
} from '@/hooks/useTrafego'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import { fmtDate } from '@/lib/utils/dates'
import { BarChart3, TrendingUp, TrendingDown, Calendar } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  startDate: string
  endDate: string
  loading: boolean
}

interface DailyPoint {
  date: string
  count: number
}

interface FunnelRow {
  funil: string
  leads: OppRow[]
  leads_count: number
  mqls: number
  conectados: number
  agendados: number
  reunioes: number
  fechados: number
  faturamento: number
  taxaAgendamento: number
  leadsSeries: DailyPoint[]
  agendamentosSeries: DailyPoint[]
}

// ─── Helpers ───────────────────────────────────────────────────

function hashHue(name: string): number {
  return name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
}

function fmtCurrencyCompact(value: number): string {
  if (value <= 0) return 'R$ 0'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

function getFunnelForOpp(
  opp: OppRow,
  campaignFunnelMap: Map<string, string[]>,
): string {
  const code = opp.contatos?.utm_campaign
  if (code == null) return 'Sem funil'
  const funnels = campaignFunnelMap.get(String(code))
  if (!funnels || funnels.length === 0) return 'Sem funil'
  return funnels[0]
}

function computeDailySeries(
  opps: OppRow[],
  getDate: (o: OppRow) => string | null | undefined,
  startDate: string,
  endDate: string,
): DailyPoint[] {
  const byDate = new Map<string, number>()
  for (const o of opps) {
    const d = getDate(o)
    if (!d) continue
    const key = d.slice(0, 10)
    byDate.set(key, (byDate.get(key) ?? 0) + 1)
  }

  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59`)
  const result: DailyPoint[] = []
  const cur = new Date(start)
  while (cur <= end) {
    const dateStr = cur.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    result.push({ date: dateStr, count: byDate.get(dateStr) ?? 0 })
    cur.setDate(cur.getDate() + 1)
  }
  return result
}

// ─── Sparkline ─────────────────────────────────────────────────

function FunnelSparkline({ series }: { series: DailyPoint[] }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!series.length) return null

  const W = 400
  const H = 100
  const LABEL_H = 18
  const maxVal = Math.max(...series.map((s) => s.count), 1)
  const barW = Math.max(1, W / series.length - 0.5)

  const labelIdxs =
    series.length <= 1
      ? [0]
      : [0, Math.floor(series.length / 3), Math.floor((2 * series.length) / 3), series.length - 1]
          .filter((v, i, arr) => arr.indexOf(v) === i)

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H + LABEL_H}`} className="w-full" style={{ height: `${H + LABEL_H}px` }}>
        <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5} stroke="rgba(0,0,0,0.08)" strokeWidth="0.5" />
        {series.map((p, i) => {
          const x = (i / series.length) * W
          const barH = Math.max(p.count > 0 ? 2 : 0, (p.count / maxVal) * H)
          const y = H - barH
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                fill="rgba(16,185,129,0.65)"
                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                opacity={hoveredIdx === null || hoveredIdx === i ? 1 : 0.5}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            </g>
          )
        })}
        {labelIdxs.map((idx) => (
          <text
            key={idx}
            x={(idx / series.length) * W + barW / 2}
            y={H + LABEL_H - 2}
            fontSize="9"
            fill="rgba(0,0,0,0.4)"
            textAnchor="middle"
          >
            {series[idx].date.slice(5).split('-').reverse().join('/')}
          </text>
        ))}
      </svg>
      {hoveredIdx !== null && (() => {
        const p = series[hoveredIdx]
        const xPct = ((hoveredIdx + 0.5) / series.length) * 100
        return (
          <div
            className="absolute z-10 bg-empire-primary text-white text-xs rounded px-2 py-1 pointer-events-none -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${xPct}%`, bottom: 'calc(100% + 8px)' }}
          >
            <div className="font-mono">{p.date.slice(5).split('-').reverse().join('/')}</div>
            <div>{p.count}</div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Mini Funnel ───────────────────────────────────────────────

function MiniFunnel({
  steps,
  onClick,
}: {
  steps: { key: string; label: string; count: number }[]
  onClick: (key: string) => void
}) {
  const total = steps[0]?.count ?? 1
  return (
    <div className="space-y-px min-w-[140px]">
      {steps.map((step) => {
        const pct = total > 0 ? Math.round((step.count / total) * 100) : 0
        const widthPct = Math.max(pct, 10)
        return (
          <button
            key={step.key}
            onClick={() => onClick(step.key)}
            className="w-full flex items-center gap-1.5 rounded px-1 py-0.5 hover:bg-empire-elevated transition-colors text-left"
            title={step.label}
          >
            <div className="flex-1 h-4 bg-empire-border rounded overflow-hidden">
              <div
                className="h-full rounded transition-all"
                style={{ width: `${widthPct}%`, background: 'var(--empire-primary)', opacity: 0.35 }}
              />
            </div>
            <span className="shrink-0 flex items-baseline gap-0.5 text-right">
              <span className="text-[10px] font-mono font-medium text-empire-void">{step.count}</span>
              {pct < 100 && pct > 0 && <span className="text-[11px] text-empire-subtle">({pct}%)</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ─── Highlight Chart ───────────────────────────────────────────

type HighlightMetric = { key: string; label: string; color: string }

const HIGHLIGHT_METRICS: HighlightMetric[] = [
  { key: 'leads', label: 'Leads', color: 'rgba(59,130,246,0.82)' },
  { key: 'agendados', label: 'Agendados', color: 'color-mix(in srgb, var(--empire-success) 82%, transparent)' },
  { key: 'fechados', label: 'Fechados', color: 'rgba(139,92,246,0.82)' },
]

function FunnelHighlightChart({
  rows,
  paymentMap,
  onBarClick,
}: {
  rows: FunnelRow[]
  paymentMap: Map<string, string>
  onBarClick: (title: string, leads: OppRow[]) => void
}) {
  const [hovered, setHovered] = useState<{ funil: string; metric: string } | null>(null)

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-surface p-6 text-sm text-empire-subtle">
        Sem dados suficientes para montar o comparativo por funil.
      </div>
    )
  }

  const maxByMetric = Object.fromEntries(
    HIGHLIGHT_METRICS.map((m) => [m.key, Math.max(...rows.map((r) => {
      if (m.key === 'leads') return r.leads_count
      if (m.key === 'agendados') return r.agendados
      return r.fechados
    }), 1)]),
  ) as Record<string, number>

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-5 w-0.5 rounded-full" />
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-empire-subtle">Destaque</p>
            <h3 className="text-sm font-semibold text-empire-void">Comparativo rápido por funil</h3>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {HIGHLIGHT_METRICS.map((metric) => (
            <span
              key={metric.key}
              className="inline-flex items-center gap-2 rounded-full border border-empire-border bg-empire-elevated px-3 py-1 text-[11px] font-medium text-empire-subtle"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: metric.color }} />
              {metric.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative w-full">
        <div className="flex w-full gap-2">
          {rows.map((row) => (
            <div key={row.funil} className="flex flex-1 min-w-0 flex-col">
              <div className="flex gap-1 mb-1">
                {HIGHLIGHT_METRICS.map((metric) => {
                  const val =
                    metric.key === 'leads'
                      ? row.leads_count
                      : metric.key === 'agendados'
                        ? row.agendados
                        : row.fechados
                  return (
                    <div key={metric.key} className="flex flex-1 justify-center">
                      <span className="text-[11px] font-bold leading-none text-empire-void">
                        {val > 0 ? val : ''}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div className="flex h-[150px] items-end gap-1 rounded-t-lg bg-empire-elevated/50 px-1.5 pt-1">
                {HIGHLIGHT_METRICS.map((metric) => {
                  const val =
                    metric.key === 'leads'
                      ? row.leads_count
                      : metric.key === 'agendados'
                        ? row.agendados
                        : row.fechados
                  const pct = val > 0 ? Math.max((val / maxByMetric[metric.key]) * 100, 5) : 0
                  const isHov = hovered?.funil === row.funil && hovered?.metric === metric.key
                  const leads =
                    metric.key === 'leads'
                      ? row.leads
                      : metric.key === 'agendados'
                        ? row.leads.filter((o) => o.data_agendamento_reuniao)
                        : row.leads.filter((o) => paymentMap.has(o.id))
                  return (
                    <button
                      key={metric.key}
                      type="button"
                      onClick={() => onBarClick(`${row.funil} — ${metric.label}`, leads)}
                      onMouseEnter={() => setHovered({ funil: row.funil, metric: metric.key })}
                      onMouseLeave={() => setHovered((current) =>
                        current?.funil === row.funil && current.metric === metric.key ? null : current
                      )}
                      className="flex-1 cursor-pointer rounded-t-sm transition-opacity hover:opacity-75"
                      style={{
                        height: `${pct}%`,
                        minHeight: val > 0 ? '6px' : '0px',
                        background: metric.color,
                        boxShadow: isHov ? `0 6px 16px ${metric.color.replace('0.82', '0.3')}` : 'none',
                      }}
                      title={`${row.funil} — ${metric.label}: ${val}`}
                    />
                  )
                })}
              </div>

              <div className="h-px w-full bg-empire-border" />
              <div
                className="mt-1.5 truncate text-center text-[10px] font-semibold text-empire-void px-0.5"
                title={row.funil}
              >
                {row.funil}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────

export function FunilTab({
  opps,
  revenueRows,
  startDate,
  endDate,
  loading,
}: Props) {
  const [campaignFunnelMap, setCampaignFunnelMap] = useState<Map<string, string[]>>(new Map())
  const [mapLoading, setMapLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false,
    title: '',
    leads: [],
  })
  const [seriesMetric, setSeriesMetric] = useState<'leads' | 'agendamentos'>('agendamentos')

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const wid = await getWorkspaceId()
      if (cancelled || !wid) return
      const res = await supabase.from('utm_campaigns').select('utm_campaign, funnels').eq('workspace_id', wid)
      if (cancelled) return
      if (!res.error) {
        setCampaignFunnelMap(
          buildCampaignFunnelMap(
            (res.data ?? []) as { utm_campaign: string | number | null; funnels: unknown }[],
          ),
        )
      }
      if (!cancelled) setMapLoading(false)
    })()

    return () => { cancelled = true }
  }, [])

  const paymentMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])
  const revenueMap = useMemo(() => buildRevenueMap(revenueRows), [revenueRows])

  const rows = useMemo((): FunnelRow[] => {
    const grouped = new Map<string, OppRow[]>()
    for (const opp of opps) {
      const funil = getFunnelForOpp(opp, campaignFunnelMap)
      const list = grouped.get(funil) ?? []
      list.push(opp)
      grouped.set(funil, list)
    }

    const result: FunnelRow[] = []
    for (const [funil, leads] of grouped.entries()) {
      const agendados = leads.filter((o) => o.data_agendamento_reuniao)
      result.push({
        funil,
        leads,
        leads_count: leads.length,
        mqls: leads.filter((o) => isMqlByTag(o.contatos)).length,
        conectados: leads.filter((o) => o.data_conectado).length,
        agendados: agendados.length,
        reunioes: leads.filter((o) => o.data_realizacao_vendas).length,
        fechados: leads.filter((o) => paymentMap.has(o.id)).length,
        faturamento: leads.reduce((sum, o) => sum + (revenueMap.get(o.id)?.faturamento ?? 0), 0),
        taxaAgendamento: leads.length > 0 ? Math.round((agendados.length / leads.length) * 100) : 0,
        leadsSeries: computeDailySeries(leads, (o) => o.data_lead_recebido, startDate, endDate),
        agendamentosSeries: computeDailySeries(
          leads,
          (o) => o.data_agendamento_reuniao,
          startDate,
          endDate,
        ),
      })
    }

    return result.sort((a, b) => b.leads_count - a.leads_count)
  }, [opps, campaignFunnelMap, paymentMap, revenueMap, startDate, endDate])

  const consolidado = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        leads: acc.leads + row.leads_count,
        mqls: acc.mqls + row.mqls,
        conectados: acc.conectados + row.conectados,
        agendados: acc.agendados + row.agendados,
        reunioes: acc.reunioes + row.reunioes,
        fechados: acc.fechados + row.fechados,
        faturamento: acc.faturamento + row.faturamento,
      }),
      { leads: 0, mqls: 0, conectados: 0, agendados: 0, reunioes: 0, fechados: 0, faturamento: 0 },
    )
  }, [rows])

  const openModal = (title: string, leads: OppRow[]) => setModal({ open: true, title, leads })

  if (loading || mapLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const bestTaxaAgend = rows.length ? Math.max(...rows.map((r) => r.taxaAgendamento)) : 0
  const worstTaxaAgend = rows.length ? Math.min(...rows.map((r) => r.taxaAgendamento)) : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-5 w-5 text-empire-primary" />
          <div>
            <h2 className="text-lg font-semibold text-empire-void">Acompanhamento por Funil</h2>
            <p className="text-xs text-empire-subtle">
              {rows.length} funis · {consolidado.leads} leads no período
            </p>
          </div>
        </div>
      </div>

      {/* KPIs consolidados */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {[
          { label: 'Leads', value: consolidado.leads, color: '#3B82F6' },
          { label: 'MQLs', value: consolidado.mqls, color: '#C9A240' },
          { label: 'Conectados', value: consolidado.conectados, color: '#06B6D4' },
          { label: 'Agendados', value: consolidado.agendados, color: '#10B981' },
          { label: 'Reuniões', value: consolidado.reunioes, color: '#6366F1' },
          { label: 'Fechados', value: consolidado.fechados, color: '#8B5CF6' },
          { label: 'Faturamento', value: fmtCurrencyCompact(consolidado.faturamento), color: 'var(--empire-success)' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl p-3 border border-empire-border"
            style={{ background: `${item.color}08`, borderTop: `2px solid ${item.color}` }}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-empire-subtle mb-1">
              {item.label}
            </p>
            <p className="text-xl font-bold leading-tight">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Highlight chart */}
      <FunnelHighlightChart
        rows={rows}
        paymentMap={paymentMap}
        onBarClick={openModal}
      />

      {/* Tabela por funil */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-0.5 h-5 rounded-full" />
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-empire-subtle">Performance</p>
            <h3 className="text-sm font-semibold text-empire-void">Funil por funil</h3>
          </div>
        </div>

        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 rounded-xl overflow-hidden border border-empire-border">
          <table className="w-full min-w-[640px] text-sm">
            <thead style={{ borderBottom: '1px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
              <tr>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Funil</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Leads</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">MQLs</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Conectados</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Agendados</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Taxa Agend.</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Reuniões</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Fechados</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Faturamento</th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Mini funil</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const hue = hashHue(row.funil)
                const isBest = row.taxaAgendamento === bestTaxaAgend && bestTaxaAgend > 0
                const isWorst = row.taxaAgendamento === worstTaxaAgend && bestTaxaAgend !== worstTaxaAgend
                return (
                  <tr
                    key={row.funil}
                    className="transition-colors hover:bg-empire-elevated"
                    style={{ borderBottom: '1px solid var(--empire-border)' }}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold text-white"
                          style={{ background: `hsl(${hue}, 52%, 40%)` }}
                        >
                          {row.funil.charAt(0).toUpperCase()}
                        </span>
                        <span className="font-medium text-empire-void">{row.funil}</span>
                      </div>
                    </td>
                    <td
                      className="px-4 py-3 text-right cursor-pointer hover:text-empire-primary"
                      onClick={() => openModal(`Leads — ${row.funil}`, row.leads)}
                    >
                      {row.leads_count}
                    </td>
                    <td
                      className="px-4 py-3 text-right cursor-pointer hover:text-empire-primary"
                      onClick={() => openModal(`MQLs — ${row.funil}`, row.leads.filter((o) => isMqlByTag(o.contatos)))}
                    >
                      {row.mqls}
                    </td>
                    <td
                      className="px-4 py-3 text-right cursor-pointer hover:text-empire-primary"
                      onClick={() => openModal(`Conectados — ${row.funil}`, row.leads.filter((o) => o.data_conectado))}
                    >
                      {row.conectados}
                    </td>
                    <td
                      className="px-4 py-3 text-right cursor-pointer hover:text-empire-primary"
                      onClick={() => openModal(`Agendados — ${row.funil}`, row.leads.filter((o) => o.data_agendamento_reuniao))}
                    >
                      {row.agendados}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          'text-xs font-medium px-1.5 py-0.5 rounded',
                          isBest && 'bg-empire-success/10 text-empire-success',
                          isWorst && 'bg-empire-danger/10 text-empire-danger',
                        )}
                      >
                        {row.taxaAgendamento}%
                        {isBest && <TrendingUp className="inline h-3 w-3 ml-1" />}
                        {isWorst && <TrendingDown className="inline h-3 w-3 ml-1" />}
                      </span>
                    </td>
                    <td
                      className="px-4 py-3 text-right cursor-pointer hover:text-empire-primary"
                      onClick={() => openModal(`Reuniões — ${row.funil}`, row.leads.filter((o) => o.data_realizacao_vendas))}
                    >
                      {row.reunioes}
                    </td>
                    <td
                      className="px-4 py-3 text-right cursor-pointer hover:text-empire-primary"
                      onClick={() => openModal(`Fechados — ${row.funil}`, row.leads.filter((o) => paymentMap.has(o.id)))}
                    >
                      {row.fechados}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {row.faturamento > 0 ? fmtCurrencyCompact(row.faturamento) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <MiniFunnel
                        steps={[
                          { key: 'leads', label: 'Leads', count: row.leads_count },
                          { key: 'mqls', label: 'MQLs', count: row.mqls },
                          { key: 'conectados', label: 'Conectados', count: row.conectados },
                          { key: 'agendados', label: 'Agendados', count: row.agendados },
                          { key: 'reunioes', label: 'Reuniões', count: row.reunioes },
                          { key: 'fechados', label: 'Fechados', count: row.fechados },
                        ]}
                        onClick={(key) => {
                          const leads = (() => {
                            switch (key) {
                              case 'leads': return row.leads
                              case 'mqls': return row.leads.filter((o) => isMqlByTag(o.contatos))
                              case 'conectados': return row.leads.filter((o) => o.data_conectado)
                              case 'agendados': return row.leads.filter((o) => o.data_agendamento_reuniao)
                              case 'reunioes': return row.leads.filter((o) => o.data_realizacao_vendas)
                              case 'fechados': return row.leads.filter((o) => paymentMap.has(o.id))
                              default: return []
                            }
                          })()
                          openModal(`${row.funil} — ${key}`, leads)
                        }}
                      />
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-sm text-empire-subtle">
                    Nenhum lead com funil identificado no período selecionado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Evolução diária por funil */}
      {rows.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-empire-subtle" />
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-empire-subtle">Histórico</p>
                <h3 className="text-sm font-semibold text-empire-void">Evolução diária por funil</h3>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSeriesMetric('agendamentos')}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                  seriesMetric === 'agendamentos'
                    ? 'border-empire-success/40 bg-empire-success/10 text-empire-success'
                    : 'border-empire-border bg-empire-surface text-empire-muted hover:text-empire-void'
                )}
              >
                Agendamentos
              </button>
              <button
                onClick={() => setSeriesMetric('leads')}
                className={cn(
                  'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                  seriesMetric === 'leads'
                    ? 'border-empire-info/40 bg-empire-info/10 text-empire-info'
                    : 'border-empire-border bg-empire-surface text-empire-muted hover:text-empire-void'
                )}
              >
                Leads
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <div key={`${row.funil}-${seriesMetric}`} className="rounded-xl border border-empire-border bg-empire-surface p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-empire-void truncate" title={row.funil}>
                    {row.funil}
                  </p>
                  <span className="text-[10px] text-empire-muted shrink-0">
                    {seriesMetric === 'agendamentos' ? row.agendados : row.leads_count}{' '}
                    {seriesMetric === 'agendamentos' ? 'agend.' : 'leads'}
                  </span>
                </div>
                <FunnelSparkline
                  series={seriesMetric === 'agendamentos' ? row.agendamentosSeries : row.leadsSeries}
                />
                <p className="text-[10px] text-empire-subtle">
                  {fmtDate(startDate)} – {fmtDate(endDate)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-empire-subtle">
        Agrupamento por funil baseado no mapeamento de campanhas (utm_campaigns.funnels). Leads sem funil identificado aparecem em “Sem funil”.
      </p>

      <LeadListModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
