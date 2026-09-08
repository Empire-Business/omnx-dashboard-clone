import { useState, useMemo, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { LeadListModal } from '@/components/leads/LeadCard'
import { useSDRLeaderboard } from '@/hooks/useSDRLeaderboard'
import { useSDRProdutividade } from '@/hooks/useSDRProdutividade'
import type { SDRProdutividadeData, SDRProdutividadeRow } from '@/hooks/useSDRProdutividade'
import { useSDRHighlightChart } from '@/hooks/useSDRHighlightChart'
import { computeIdealDia, applyMqlFilter, parseTags } from '@/hooks/useTrafego'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import type { SDRRow } from '@/hooks/useSDRLeaderboard'
import {
  getActiveMeta,
  type Meta,
} from '@/hooks/useMetas'
import type { PreVendasFilters } from '@/hooks/usePreVendas'
import { loadPreVendasDataset } from '@/hooks/usePreVendas'
import { fmtDate, tsToSPDate } from '@/lib/utils/dates'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  filters: PreVendasFilters
  startDate: string
  endDate: string
  loading: boolean
  metas: Meta[]
  activePanel?: 'cohort' | 'produtividade'
  pipelineMode?: 'exclude_recuperacao' | 'only_recuperacao'
}

// ─── Helpers ─────────────────────────────────────────────────

function pctBadge(pct: number, best: number, worst: number) {
  if (pct === best && pct > 0) return 'bg-empire-success/10 text-empire-success'
  if (pct === worst && best !== worst) return 'bg-empire-danger/10 text-empire-danger'
  return ''
}

function fmtResponseTime(seconds: number): string {
  if (seconds <= 0) return '—'
  if (seconds < 60) return '< 1 min'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function responseTimeBadgeClass(seconds: number): string {
  if (seconds <= 0) return 'text-empire-subtle'
  if (seconds <= 900) return 'bg-empire-success/10 text-empire-success'   // ≤ 15 min → verde
  if (seconds <= 3600) return 'bg-empire-warning/10 text-empire-warning'  // 15-60 min → âmbar
  return 'bg-empire-danger/10 text-empire-danger'                   // > 60 min → vermelho
}

function noResponseBadgeClass(pct: number): string {
  if (pct <= 0) return 'text-empire-subtle'
  if (pct <= 10) return 'bg-empire-warning/10 text-empire-warning'        // ≤ 10% → âmbar
  return 'bg-empire-danger/10 text-empire-danger'                   // > 10% → vermelho
}

function filterOppsByMetaPeriod(opps: OppRow[], startDate: string, endDate: string): OppRow[] {
  return opps.filter((opp) => {
    if (!opp.data_lead_recebido) return false
    const leadDate = tsToSPDate(opp.data_lead_recebido)
    return leadDate >= startDate && leadDate <= endDate
  })
}

// ─── SDR Agendamentos series ──────────────────────────────────

function computeSDRAgendamentosSeries(
  opps: OppRow[],
  sdrName: string,
  startDate: string,
  endDate: string
): { date: string; count: number }[] {
  const sdrNameNorm = sdrName.trim()
  const filtered = opps.filter(
    (o) => (o.sdr_name || o.contatos?.owner_name || 'Sem SDR').trim() === sdrNameNorm && o.data_agendamento_reuniao
  )

  // data_agendamento_reuniao é DATE → string "YYYY-MM-DD", sem conversão de timezone
  const byDate = new Map<string, number>()
  for (const o of filtered) {
    const date = o.data_agendamento_reuniao!.slice(0, 10)
    byDate.set(date, (byDate.get(date) ?? 0) + 1)
  }

  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T23:59:59')
  const result: { date: string; count: number }[] = []

  const cur = new Date(start)
  while (cur <= end) {
    const dateStr = cur.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    result.push({ date: dateStr, count: byDate.get(dateStr) ?? 0 })
    cur.setDate(cur.getDate() + 1)
  }

  return result
}

// ─── SDR Sparkline ─────────────────────────────────────────────

function SDRSparkline({
  series,
  dailyIdeal,
}: {
  series: { date: string; count: number }[]
  dailyIdeal: number
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  if (!series.length) return null

  const W = 400
  const H = 120
  const LABEL_H = 20
  const maxVal = Math.max(...series.map((s) => s.count), dailyIdeal, 1)
  const barW = Math.max(1, W / series.length - 0.5)
  const idealY = dailyIdeal > 0 ? H - (dailyIdeal / maxVal) * H : null

  // Selecionar ~4 datas para exibir no eixo X
  const labelIdxs = series.length <= 1
    ? [0]
    : [0, Math.floor(series.length / 3), Math.floor(2 * series.length / 3), series.length - 1]
      .filter((v, i, arr) => arr.indexOf(v) === i)  // dedup

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H + LABEL_H}`} className="w-full" style={{ height: `${H + LABEL_H}px` }}>
        {/* Linha de base sutil para dias zero */}
        <line x1={0} y1={H - 0.5} x2={W} y2={H - 0.5}
          stroke="rgba(0,0,0,0.08)" strokeWidth="0.5" />

        {/* Barras */}
        {series.map((p, i) => {
          const x = (i / series.length) * W
          const barH = Math.max(p.count > 0 ? 2 : 0, (p.count / maxVal) * H)
          const y = H - barH
          const isAbove = dailyIdeal > 0 ? p.count >= dailyIdeal : true
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={barH}
                fill={isAbove ? 'rgba(16,185,129,0.65)' : 'rgba(245,158,11,0.65)'}
                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                opacity={hoveredIdx === null || hoveredIdx === i ? 1 : 0.5}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
            </g>
          )
        })}

        {/* Linha ideal/dia */}
        {idealY !== null && (
          <line
            x1={0} y1={idealY} x2={W} y2={idealY}
            stroke="rgba(201,151,58,0.9)"
            strokeWidth="1"
            strokeDasharray="3,2"
          />
        )}

        {/* Eixo X com datas */}
        {labelIdxs.map((idx) => (
          <text key={idx}
            x={(idx / series.length) * W + barW / 2}
            y={H + LABEL_H - 4}
            fontSize="9"
            fill="rgba(0,0,0,0.4)"
            textAnchor="middle">
            {series[idx].date.slice(5).split('-').reverse().join('/')}
          </text>
        ))}
      </svg>

      {/* Tooltip ao hover */}
      {hoveredIdx !== null && (() => {
        const p = series[hoveredIdx]
        const xPct = ((hoveredIdx + 0.5) / series.length) * 100
        return (
          <div
            className="absolute z-10 bg-empire-primary text-white text-xs rounded px-2 py-1 pointer-events-none -translate-x-1/2 whitespace-nowrap"
            style={{ left: `${xPct}%`, bottom: `calc(100% + 8px)` }}>
            <div className="font-mono">{p.date.slice(5).split('-').reverse().join('/')}</div>
            <div>{p.count} agend.</div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Inline Meta Editor cell ──────────────────────────────────

function MetaCell({
  displayMeta,
}: {
  displayMeta: Meta | null
}) {
  const value = displayMeta?.valor ?? 0

  return (
    <span className="text-xs text-empire-muted">
      {value > 0 ? Math.round(value) : '—'}
    </span>
  )
}

// ─── Section Header ───────────────────────────────────────────

function SectionHeader({ label, title }: { label?: string; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-0.5 h-5 rounded-full bg-empire-primary" />
      <div>
        {label && <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-empire-subtle">{label}</p>}
        <h3 className="text-sm font-semibold text-empire-void">{title}</h3>
      </div>
    </div>
  )
}

// ─── Rank Badge ────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border text-empire-primary">
        1
      </span>
    )
  if (rank === 2)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border">
        2
      </span>
    )
  if (rank === 3)
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold border">
        3
      </span>
    )
  return <span className="text-xs text-empire-subtle tabular-nums">{rank}</span>
}

// ─── SDR Avatar ─────────────────────────────────────────────────

function hashHue(name: string): number {
  return name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360
}

function SdrAvatar({ name }: { name: string }) {
  const hue = hashHue(name)
  return (
    <span
      className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold text-white select-none"
      style={{ background: `hsl(${hue}, 52%, 40%)` }}
      aria-hidden="true"
    >
      {name.charAt(0).toUpperCase()}
    </span>
  )
}

// ─── Mini Funnel ─────────────────────────────────────────────

function MiniFunnel({ steps, onClick }: { steps: { key: string; label: string; count: number }[]; onClick: (key: string) => void }) {
  const total = steps[0]?.count ?? 1
  return (
    <div className="space-y-px">
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

// ─── Leaderboard Table ────────────────────────────────────────

function LeaderboardTable({
  rows,
  metas,
  globalMeta,
  metaOpps,
  startDate,
  endDate,
  loadingMetaPeriods,
  onRowClick,
  onFechamentosClick,
}: {
  rows: SDRRow[]
  metas: Meta[]
  globalMeta: Meta | null
  metaOpps: OppRow[]
  startDate: string
  endDate: string
  loadingMetaPeriods: boolean
  onRowClick: (row: SDRRow) => void
  onFechamentosClick?: (row: SDRRow) => void
}) {
  if (!rows.length) return <p className="text-sm text-empire-muted">Sem dados de SDR no período.</p>

  const bestConexao = Math.max(...rows.map((r) => r.taxa_conexao))
  const worstConexao = Math.min(...rows.map((r) => r.taxa_conexao))
  const bestAgend = Math.max(...rows.map((r) => r.taxa_agendamento))
  const worstAgend = Math.min(...rows.map((r) => r.taxa_agendamento))

  return (
    <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 rounded-xl overflow-hidden border border-empire-border">
      <table className="w-full min-w-[640px] text-sm">
        <thead style={{ borderBottom: '1px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
          <tr>
            <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">#</th>
            <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">SDR</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Leads</th>
            <th className="hidden md:table-cell px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Conectados</th>
            <th className="hidden md:table-cell px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Taxa Conexão</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Agendados</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Taxa Agend.</th>
            <th className="hidden md:table-cell px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Ligações</th>
            <th className="hidden md:table-cell px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Msgs</th>
            <th className="hidden md:table-cell px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Tempo Médio de Resposta</th>
            <th className="hidden md:table-cell px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Última Resp.</th>
            <th className="hidden md:table-cell px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">% Sem Resp.</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Fechamentos</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Meta / Ideal</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const sdrNameNorm = row.sdr.trim()
            const rowMeta = getActiveMeta(metas, 'agendamentos_sdr', sdrNameNorm)
            const effectiveMeta = rowMeta ?? globalMeta
            const scopedMetaOpps = effectiveMeta
              ? filterOppsByMetaPeriod(metaOpps, effectiveMeta.periodo_inicio, effectiveMeta.periodo_fim)
              : []
            const atualAgendados = effectiveMeta
              ? scopedMetaOpps.filter((opp) =>
                  opp.sdr_name?.trim() === sdrNameNorm && !!opp.data_agendamento_reuniao
                ).length
              : row.agendados

            const ideal = effectiveMeta
              ? computeIdealDia({
                  startDate: effectiveMeta.periodo_inicio,
                  endDate: effectiveMeta.periodo_fim,
                  meta: effectiveMeta.valor,
                  atual: atualAgendados,
                })
              : null

            const pct = effectiveMeta && effectiveMeta.valor > 0
              ? Math.round((atualAgendados / effectiveMeta.valor) * 100)
              : 0
            const isGood = ideal ? ideal.delta >= 0 : effectiveMeta ? atualAgendados >= effectiveMeta.valor : true
            const hasDifferentDateFilter = !!effectiveMeta && (
              effectiveMeta.periodo_inicio !== startDate || effectiveMeta.periodo_fim !== endDate
            )

            return (
              <tr
                key={row.sdr}
                className={cn(
                  'cursor-pointer transition-colors hover:bg-empire-elevated',
                  row.is_ia && 'bg-blue-50/40'
                )}
                style={{ borderBottom: '1px solid var(--empire-border)' }}
                onClick={() => onRowClick(row)}
              >
                <td className="px-4 py-3"><RankBadge rank={i + 1} /></td>
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    {!row.is_ia && <SdrAvatar name={row.sdr} />}
                    <span>{row.sdr}</span>
                    {row.is_ia && (
                      <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-mono font-semibold text-blue-600 uppercase tracking-wide">
                        IA
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">{row.leads_count}</td>
                <td className="hidden md:table-cell px-4 py-3 text-right">{row.conectados}</td>
                <td className="hidden md:table-cell px-4 py-3 text-right">
                  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', pctBadge(row.taxa_conexao, bestConexao, worstConexao))}>
                    {row.taxa_conexao}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right">{row.agendados}</td>
                <td className="px-4 py-3 text-right">
                  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', pctBadge(row.taxa_agendamento, bestAgend, worstAgend))}>
                    {row.taxa_agendamento}%
                    {row.taxa_agendamento === bestAgend && row.taxa_agendamento > 0 && <TrendingUp className="inline h-3 w-3 ml-1" />}
                    {row.taxa_agendamento === worstAgend && bestAgend !== worstAgend && <TrendingDown className="inline h-3 w-3 ml-1" />}
                  </span>
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-right text-empire-muted">
                  {row.is_ia ? <span className="text-empire-subtle">—</span> : row.ligacoes}
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-right text-empire-muted">{row.mensagens}</td>
                <td className="hidden md:table-cell px-4 py-3 text-right">
                  {row.is_ia
                    ? <span className="text-xs text-empire-subtle">—</span>
                    : <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded',
                        responseTimeBadgeClass(row.avg_response_seconds))}>
                        {fmtResponseTime(row.avg_response_seconds)}
                      </span>}
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-right">
                  {row.is_ia
                    ? <span className="text-xs text-empire-subtle">—</span>
                    : <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded',
                        responseTimeBadgeClass(row.last_response_seconds))}>
                        {fmtResponseTime(row.last_response_seconds)}
                      </span>}
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-right">
                  <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded',
                    noResponseBadgeClass(row.pct_sem_resposta))}>
                    {row.pct_sem_resposta > 0 ? `${row.pct_sem_resposta}%` : '—'}
                  </span>
                </td>
                <td
                  className="px-4 py-3 text-right"
                  onClick={(e) => {
                    if (row.fechamentos > 0 && onFechamentosClick) {
                      e.stopPropagation()
                      onFechamentosClick(row)
                    }
                  }}
                >
                  {row.fechamentos > 0 ? (
                    <Badge variant="secondary" className="bg-empire-success/10 text-empire-success text-xs cursor-pointer hover:bg-empire-success/20 transition-colors">{row.fechamentos}</Badge>
                  ) : (
                    <span className="text-empire-muted">0</span>
                  )}
                </td>
                {/* Meta / Ideal column */}
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col items-end gap-1 min-w-[100px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-empire-subtle">meta:</span>
                      <MetaCell
                        displayMeta={effectiveMeta}
                      />
                    </div>
                    {effectiveMeta && (
                      <>
                        <div className="w-full h-1.5 bg-empire-border rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(pct, 100)}%`,
                              background: isGood
                                ? 'linear-gradient(90deg, var(--empire-success), var(--empire-success))'
                                : 'linear-gradient(90deg, var(--empire-warning), var(--empire-warning))',
                              opacity: 0.75,
                            }}
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="text-empire-subtle">
                            {loadingMetaPeriods ? '…' : `${pct}%`}
                          </span>
                          {ideal && (
                            <span
                              className={cn(
                                'font-semibold',
                                ideal.delta >= 0 ? 'text-[var(--empire-success)]' : 'text-empire-primary'
                              )}
                            >
                              {ideal.delta >= 0 ? '+' : ''}
                              {ideal.delta}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-empire-subtle">
                          {fmtDate(effectiveMeta.periodo_inicio)}-{fmtDate(effectiveMeta.periodo_fim).slice(0, 5)}
                        </div>
                        {hasDifferentDateFilter && (
                          <div className="text-[10px] text-empire-primary">vigência própria</div>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Comparative Funnel Grid ──────────────────────────────────

function ComparativeFunnels({
  rows,
  onCellClick,
}: {
  rows: SDRRow[]
  onCellClick: (sdr: string, stepKey: string) => void
}) {
  if (!rows.length) return null

  const STEPS = [
    { key: 'leads', label: 'Leads' },
    { key: 'conectados', label: 'Conect.' },
    { key: 'agendados', label: 'Agend.' },
    { key: 'reunioes', label: 'Reuniões' },
    { key: 'fechados', label: 'Fechados' },
  ]

  const getCount = (row: SDRRow, key: string) => {
    switch (key) {
      case 'leads': return row.leads_count
      case 'conectados': return row.conectados
      case 'agendados': return row.agendados
      case 'reunioes': return row.leads.filter((o) => o.data_realizacao_vendas).length
      case 'fechados': return row.fechamentos
      default: return 0
    }
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="min-w-max grid gap-4"
        style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(140px, 1fr))` }}
      >
        {rows.map((row) => (
          <div key={row.sdr} className="rounded-xl border border-empire-border bg-empire-surface p-3">
            <p className="text-xs font-semibold text-empire-void truncate mb-2" title={row.sdr}>
              {row.sdr}
            </p>
            <MiniFunnel
              steps={STEPS.map((s) => ({ key: s.key, label: s.label, count: getCount(row, s.key) }))}
              onClick={(key) => onCellClick(row.sdr, key)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sparklines Grid ──────────────────────────────────────────

function AgendamentosSparklines({
  rows,
  metas,
  globalMeta,
  metaOpps,
  startDate,
  endDate,
}: {
  rows: SDRRow[]
  metas: Meta[]
  globalMeta: Meta | null
  metaOpps: OppRow[]
  startDate: string
  endDate: string
}) {
  if (!rows.length) return null

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((row) => {
        const sdrNameNorm = row.sdr.trim()
        const rowMeta = getActiveMeta(metas, 'agendamentos_sdr', sdrNameNorm)
        const effectiveMeta = rowMeta ?? globalMeta
        // Período da série: usa vigência da meta se existir, senão usa o filtro global
        const seriesStart = effectiveMeta?.periodo_inicio ?? startDate
        const seriesEnd = effectiveMeta?.periodo_fim ?? endDate
        const scopedOpps = effectiveMeta
          ? filterOppsByMetaPeriod(metaOpps, seriesStart, seriesEnd)
          : metaOpps
        // Sempre computa a série — sem meta mostra barras do período atual sem linha ideal
        const series = computeSDRAgendamentosSeries(scopedOpps, row.sdr, seriesStart, seriesEnd)
        const ideal = effectiveMeta
          ? computeIdealDia({
              startDate: effectiveMeta.periodo_inicio,
              endDate: effectiveMeta.periodo_fim,
              meta: effectiveMeta.valor,
              atual: scopedOpps.filter((opp) =>
                opp.sdr_name?.trim() === sdrNameNorm && !!opp.data_agendamento_reuniao
              ).length,
            })
          : null
        const dailyIdeal = effectiveMeta && ideal ? effectiveMeta.valor / Math.max(ideal.periodDays, 1) : 0
        const pctMeta = effectiveMeta && effectiveMeta.valor > 0
          ? Math.round(((ideal?.atual ?? row.agendados) / effectiveMeta.valor) * 100)
          : 0

        return (
          <div key={row.sdr} className="rounded-xl border border-empire-border bg-empire-surface p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-empire-void truncate" title={row.sdr}>
                {row.sdr}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                {effectiveMeta && pctMeta > 0 && (
                  <span className={cn(
                    'text-[11px] font-mono px-1.5 py-0.5 rounded-full border',
                    pctMeta >= 100
                      ? 'bg-empire-success/10 text-empire-success border-empire-success/25'
                      : 'bg-empire-warning/10 text-empire-warning border-empire-warning/25'
                  )}>
                    {pctMeta}%
                  </span>
                )}
                <span className="text-[10px] text-empire-muted">
                  {ideal?.atual ?? row.agendados} agend.
                </span>
              </div>
            </div>
            <SDRSparkline series={series} dailyIdeal={dailyIdeal} />
            <div className="flex gap-3 mt-1 text-[10px] text-empire-subtle flex-wrap">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" />
                {dailyIdeal > 0 ? 'acima do ritmo' : 'agendamentos'}
              </span>
              {dailyIdeal > 0 && (
                <>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-sm flex-shrink-0" />
                    abaixo do ritmo
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-4 border-t border-dashed flex-shrink-0" />
                    ideal/dia
                  </span>
                </>
              )}
            </div>
            {effectiveMeta ? (
              <p className="text-[10px] text-empire-subtle">
                Meta: {Math.round(effectiveMeta.valor)} · Ideal/dia: {dailyIdeal.toFixed(1)} · {fmtDate(effectiveMeta.periodo_inicio)}-{fmtDate(effectiveMeta.periodo_fim).slice(0, 5)}
              </p>
            ) : (
              <p className="text-[10px] text-empire-subtle">Sem meta — exibindo período atual</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

import type { MetricKey as HighlightMetricKey } from '@/hooks/useSDRHighlightChart'

type MetricConfig = { key: HighlightMetricKey; label: string; shortLabel: string; color: string }

// Cohort: taxa de agendamento (% dos MQLs) + tempo médio para agendar desde o lead
const HIGHLIGHT_METRICS_COHORT: MetricConfig[] = [
  { key: 'bookingRate', label: 'Taxa de agendamento', shortLabel: 'Taxa', color: 'color-mix(in srgb, var(--empire-success) 82%, transparent)' },
  { key: 'avgBookingTime', label: 'Tempo médio de agendamento', shortLabel: 'Tempo', color: 'rgba(180,83,9,0.82)' },
  { key: 'contactAttempts', label: 'Tentativas de contato', shortLabel: 'Tentativas', color: 'rgba(21,94,117,0.82)' },
  { key: 'revenue', label: 'Faturamento', shortLabel: 'Faturamento', color: 'rgba(91,33,182,0.82)' },
]

// Produtividade: 4 barras — o que o SDR FEZ no período (independente de quando o lead entrou)
const HIGHLIGHT_METRICS_PROD: MetricConfig[] = [
  { key: 'agendamentos', label: 'Agendamentos no período', shortLabel: 'Agend.', color: 'color-mix(in srgb, var(--empire-success) 82%, transparent)' },
  { key: 'avgResponseTime', label: 'Tempo médio de resposta', shortLabel: 'Resp.', color: 'rgba(180,83,9,0.82)' },
  { key: 'contactAttempts', label: 'Tentativas de contato', shortLabel: 'Tentativas', color: 'rgba(21,94,117,0.82)' },
  { key: 'revenue', label: 'Faturamento', shortLabel: 'Faturamento', color: 'rgba(91,33,182,0.82)' },
]

function SDRHighlightChart({
  rows,
  loading,
  error,
  onBarClick,
  metricsConfig,
}: {
  rows: ReturnType<typeof useSDRHighlightChart>['rows']
  loading: boolean
  error: string | null
  onBarClick: (title: string, leads: OppRow[]) => void
  metricsConfig: MetricConfig[]
}) {
  const [hovered, setHovered] = useState<{ sdr: string; metric: HighlightMetricKey } | null>(null)

  if (loading) {
    return <Skeleton className="h-[360px] w-full rounded-xl" />
  }

  if (error) {
    return (
      <div className="rounded-xl border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
        Erro ao carregar gráfico de SDRs: {error}
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-surface p-6 text-sm text-empire-subtle">
        Sem dados suficientes para montar o gráfico de SDRs no período.
      </div>
    )
  }

  // Máximo por métrica (escala independente por coluna)
  const maxByMetric = Object.fromEntries(
    metricsConfig.map((m) => [
      m.key,
      Math.max(...rows.map((row) => row.metrics[m.key]?.value ?? 0), 1),
    ])
  ) as Record<HighlightMetricKey, number>

  const hoveredMetric = hovered
    ? rows.find((row) => row.sdr === hovered.sdr)?.metrics[hovered.metric]
    : null

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-5 w-0.5 rounded-full bg-empire-primary" />
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-empire-subtle">Destaque</p>
            <h3 className="text-sm font-semibold text-empire-void">Comparativo rápido por SDR</h3>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {metricsConfig.map((metric) => (
            <span
              key={metric.key}
              className="inline-flex items-center gap-2 rounded-full border border-empire-border bg-empire-elevated px-3 py-1 text-[11px] font-medium text-empire-subtle"
            >
              <span className="h-2.5 w-2.5 rounded-full" />
              {metric.label}
            </span>
          ))}
        </div>
      </div>

      <div className="relative w-full">
        {hovered && hoveredMetric && (
          <div className="pointer-events-none absolute right-0 top-0 z-10 max-w-[260px] rounded-2xl bg-[var(--empire-void)] px-3 py-2 text-xs text-white shadow-lg">
            <div className="font-semibold">{hovered.sdr}</div>
            <div className="mt-0.5">{metricsConfig.find((metric) => metric.key === hovered.metric)?.label}</div>
            <div className="mt-1 font-mono">{hoveredMetric.displayValue}</div>
            <div className="mt-1 text-white/80">{hoveredMetric.tooltipDetail}</div>
          </div>
        )}

        <div className="flex w-full gap-2">
          {rows.map((row) => (
            <div key={row.sdr} className="flex flex-1 min-w-0 flex-col">
              {/* Rótulos de valor — linha separada acima das barras */}
              <div className="flex gap-1 mb-1">
                {metricsConfig.map((metric) => {
                  const metricData = row.metrics[metric.key]
                  const val = metricData?.value ?? 0
                  return (
                    <div key={metric.key} className="flex flex-1 justify-center">
                      <span className="text-[11px] font-bold leading-none text-empire-void">
                        {val > 0 ? (metricData?.displayValue ?? '') : ''}
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Barras */}
              <div className="flex h-[150px] items-end gap-1 rounded-t-lg bg-empire-elevated/50 px-1.5 pt-1">
                {metricsConfig.map((metric) => {
                  const metricData = row.metrics[metric.key]
                  const val = metricData?.value ?? 0
                  const pct = val > 0
                    ? Math.max((val / maxByMetric[metric.key]) * 100, 5)
                    : 0
                  const isHov = hovered?.sdr === row.sdr && hovered?.metric === metric.key

                  return (
                    <button
                      key={metric.key}
                      type="button"
                      onClick={() => onBarClick(metricData?.modalTitle ?? metric.label, metricData?.leads ?? [])}
                      onMouseEnter={() => setHovered({ sdr: row.sdr, metric: metric.key })}
                      onMouseLeave={() => setHovered((current) =>
                        current?.sdr === row.sdr && current.metric === metric.key ? null : current
                      )}
                      className="flex-1 cursor-pointer rounded-t-sm transition-opacity hover:opacity-75"
                      style={{
                        height: `${pct}%`,
                        minHeight: val > 0 ? '6px' : '0px',
                        background: metric.color,
                        boxShadow: isHov
                          ? `0 6px 16px ${metric.color.replace('0.82', '0.3')}`
                          : 'none',
                      }}
                      title={`${row.sdr} — ${metric.label}: ${metricData?.displayValue ?? '—'}`}
                    />
                  )
                })}
              </div>

              {/* Linha de base */}
              <div className="h-px w-full bg-empire-border" />

              {/* Nome do SDR */}
              {row.sdr === 'SDR IA' ? (
                <div className="mt-1.5 flex justify-center px-0.5" title="SDR IA">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-blue-700">
                    ⚡ IA
                  </span>
                </div>
              ) : (
                <div
                  className="mt-1.5 truncate text-center text-[10px] font-semibold text-empire-void px-0.5"
                  title={row.sdr}
                >
                  {row.sdr.split(' ')[0]}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Produtividade View ───────────────────────────────────────

function ProdAgendamentosSparklines({
  rows,
  startDate,
  endDate,
}: {
  rows: SDRProdutividadeRow[]
  startDate: string
  endDate: string
}) {
  const activeRows = rows.filter((r) => r.agendados > 0)
  if (!activeRows.length) return null

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {activeRows.map((row) => (
        <div key={row.sdr} className="rounded-xl border border-empire-border bg-empire-surface p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-empire-void truncate" title={row.sdr}>{row.sdr}</p>
            <span className="text-[10px] text-empire-muted shrink-0">{row.agendados} agend.</span>
          </div>
          <SDRSparkline series={row.agendamentosSeries} dailyIdeal={0} />
          <p className="text-[10px] text-empire-subtle">
            {fmtDate(startDate)} – {fmtDate(endDate)}
          </p>
        </div>
      ))}
    </div>
  )
}

function ProdKpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-4 flex flex-col gap-1">
      <p className="text-xs font-mono tracking-[0.12em] uppercase text-empire-subtle">{label}</p>
      <p className="text-2xl font-bold text-empire-void leading-tight">{value}</p>
    </div>
  )
}

function ProdutividadeView({
  rows,
  consolidado,
  totalFechados,
  loading,
  error,
  chartRows,
  chartLoading,
  chartError,
  startDate,
  endDate,
  onOpenModal,
}: {
  rows: SDRProdutividadeData['rows']
  consolidado: SDRProdutividadeData['consolidado']
  totalFechados: number
  loading: boolean
  error: string | null
  chartRows: ReturnType<typeof useSDRHighlightChart>['rows']
  chartLoading: boolean
  chartError: string | null
  startDate: string
  endDate: string
  onOpenModal: (title: string, leads: OppRow[]) => void
}) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl p-4 text-sm border border-empire-danger/30 bg-empire-danger-soft">
        <AlertTriangle className="h-4 w-4 shrink-0 text-empire-danger" />
        <span className="text-empire-danger">{error}</span>
      </div>
    )
  }

  const bestConect = rows.length ? Math.max(...rows.map((r) => r.conectados)) : 0
  const bestAgend = rows.length ? Math.max(...rows.map((r) => r.agendados)) : 0

  // totalFechados vem direto de pagoOppIds.size no hook (todos os SDRs + SDR IA),
  // não depende de carregamento assíncrono do gráfico.

  return (
    <div className="space-y-6">
      <SDRHighlightChart
        rows={chartRows}
        loading={chartLoading}
        error={chartError}
        onBarClick={onOpenModal}
        metricsConfig={HIGHLIGHT_METRICS_PROD}
      />

      <div>
        <h3 className="text-sm font-semibold text-empire-void">Produtividade do Time</h3>
        <p className="text-xs text-empire-subtle mt-0.5">
          Cada etapa usa a data do próprio evento: Leads/MQLs pela geração; conectados, agendados, reuniões e fechamentos pelos eventos em si.
          <span className="ml-1 opacity-70">({consolidado.diasNoPeriodo} dias)</span>
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <ProdKpiCard label="Leads" value={consolidado.leads_count} />
        <ProdKpiCard label="MQLs" value={consolidado.mqls} />
        <ProdKpiCard label="Conectados" value={consolidado.conectados} />
        <ProdKpiCard label="Agendados" value={consolidado.agendados} />
        <ProdKpiCard label="Ligações" value={consolidado.ligacoes} />
        <ProdKpiCard label="Fechados" value={totalFechados} />
      </div>

      {/* Leaderboard */}
      {rows.length === 0 ? (
        <p className="text-sm text-empire-subtle">Sem atividade registrada no período.</p>
      ) : (
        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0 rounded-xl overflow-hidden border border-empire-border">
          <table className="w-full min-w-[480px] text-sm">
            <thead style={{ borderBottom: '1px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
              <tr>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">#</th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">SDR</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Leads</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">MQLs</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Conectados</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Agendados</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Reuniões</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Fechados</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Ligações</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Msgs</th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Pessoas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: SDRProdutividadeRow, i) => {
                const isBestConect = row.conectados === bestConect && bestConect > 0
                const isBestAgend = row.agendados === bestAgend && bestAgend > 0
                return (
                  <tr
                    key={row.sdr}
                    className="transition-colors hover:bg-empire-elevated border-b border-empire-border"
                  >
                    <td className="px-4 py-3 text-empire-subtle text-xs">{i + 1}</td>
                    <td className="px-4 py-3 font-medium text-empire-void">{row.sdr}</td>
                    <td className="px-4 py-3 text-right font-semibold">{row.leads_count}</td>
                    <td className="px-4 py-3 text-right font-semibold">{row.mqls}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('text-sm font-semibold px-1.5 py-0.5 rounded',
                        isBestConect && 'bg-empire-success/10 text-empire-success'
                      )}>
                        {row.conectados}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={cn('text-sm font-semibold px-1.5 py-0.5 rounded',
                        isBestAgend && 'bg-empire-success/10 text-empire-success'
                      )}>
                        {row.agendados}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold">{row.reunioes}</td>
                    <td className="px-4 py-3 text-right">
                      {row.fechados > 0
                        ? <span className="text-sm font-semibold text-[var(--empire-success)]">{row.fechados}</span>
                        : <span className="text-empire-subtle">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-right text-empire-subtle">{row.ligacoes || <span>—</span>}</td>
                    <td className="px-4 py-3 text-right text-empire-subtle">{row.mensagens || <span>—</span>}</td>
                    <td className="px-4 py-3 text-right text-empire-subtle">{row.pessoasContatadas || <span>—</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[10px] text-empire-subtle">
            Produtividade: eventos contados pelo momento em que aconteceram — conexões, agendamentos, reuniões e fechamentos confirmados. A data de entrada do lead não limita o ranking operacional.
          </p>
        </div>
      )}

      {/* Evolução de Agendamentos por dia */}
      {rows.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-0.5 h-5 rounded-full bg-empire-primary" />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-empire-subtle">Histórico</p>
              <h3 className="text-sm font-semibold text-empire-void">Evolução de Agendamentos</h3>
            </div>
          </div>
          <ProdAgendamentosSparklines rows={rows} startDate={startDate} endDate={endDate} />
        </div>
      )}
    </div>
  )
}

function ProdutividadeWrapper({
  startDate,
  endDate,
  pipelineMode,
  opps,
  revenueRows,
  filters,
  onOpenModal,
}: {
  startDate: string
  endDate: string
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao'
  opps: OppRow[]
  revenueRows: RevenueRow[]
  filters: PreVendasFilters
  onOpenModal: (title: string, leads: OppRow[]) => void
}) {
  const produtividade = useSDRProdutividade(startDate, endDate, pipelineMode, true)
  const orderedProdSdrs = useMemo(() => {
    const prod = produtividade.rows.map((row) => row.sdr)
    const hasIaLeads = opps.some((o) =>
      parseTags(o.contatos?.tags).some((t) => t.toLowerCase() === '[cp] sdr ia')
    )
    return hasIaLeads && !prod.includes('SDR IA') ? [...prod, 'SDR IA'] : prod
  }, [produtividade.rows, opps])
  const { rows: chartRows, loading: chartLoading, error: chartError } = useSDRHighlightChart({
    mode: 'produtividade',
    orderedSdrs: orderedProdSdrs,
    opps,
    revenueRows,
    filters,
    startDate,
    endDate,
    pipelineMode,
  })

  return (
    <ProdutividadeView
      rows={produtividade.rows}
      consolidado={produtividade.consolidado}
      totalFechados={produtividade.totalFechados}
      loading={produtividade.loading}
      error={produtividade.error}
      chartRows={chartRows}
      chartLoading={chartLoading}
      chartError={chartError}
      startDate={startDate}
      endDate={endDate}
      onOpenModal={onOpenModal}
    />
  )
}

// ─── Main component ───────────────────────────────────────────

export function SDRsTab({ opps, revenueRows, filters, startDate, endDate, loading, metas, activePanel = 'cohort', pipelineMode = 'exclude_recuperacao' }: Props) {
  const { rows } = useSDRLeaderboard(opps, startDate, endDate, revenueRows)
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false, title: '', leads: [],
  })
  const [metaPeriodOpps, setMetaPeriodOpps] = useState<OppRow[]>([])
  const [metaPeriodLoading, setMetaPeriodLoading] = useState(false)

  const openModal = (title: string, leads: OppRow[]) => setModal({ open: true, title, leads })
  const orderedCohortSdrs = useMemo(
    () => activePanel === 'cohort' ? rows.map((row) => row.sdr) : [],
    [activePanel, rows]
  )
  const { rows: highlightRows, loading: highlightLoading, error: highlightError } = useSDRHighlightChart({
    mode: 'cohort',
    orderedSdrs: orderedCohortSdrs,
    opps,
    revenueRows,
    filters,
    startDate,
    endDate,
    pipelineMode,
  })

  const globalMeta = useMemo(
    () => getActiveMeta(metas, 'agendamentos_sdr', 'global'),
    [metas]
  )

  const effectiveMetaRanges = useMemo(() => {
    const ranges = new Map<string, { startDate: string; endDate: string }>()

    const addRange = (meta: Meta | null) => {
      if (!meta) return
      const key = `${meta.periodo_inicio}|${meta.periodo_fim}`
      if (!ranges.has(key)) {
        ranges.set(key, { startDate: meta.periodo_inicio, endDate: meta.periodo_fim })
      }
    }

    addRange(globalMeta)
    rows.forEach((row) => {
      const rowMeta = getActiveMeta(metas, 'agendamentos_sdr', row.sdr.trim()) ?? globalMeta
      addRange(rowMeta)
    })

    return Array.from(ranges.values())
  }, [rows, metas, globalMeta])

  useEffect(() => {
    let cancelled = false

    if (!effectiveMetaRanges.length) {
      return () => { cancelled = true }
    }

    const minStartDate = effectiveMetaRanges.reduce(
      (min, range) => (range.startDate < min ? range.startDate : min),
      effectiveMetaRanges[0].startDate
    )
    const maxEndDate = effectiveMetaRanges.reduce(
      (max, range) => (range.endDate > max ? range.endDate : max),
      effectiveMetaRanges[0].endDate
    )

    void (async () => {
      setMetaPeriodLoading(true)
      try {
        const dataset = await loadPreVendasDataset({
          ...filters,
          startDate: minStartDate,
          endDate: maxEndDate,
        })
        if (cancelled) return
        setMetaPeriodOpps(applyMqlFilter(dataset.opps, filters.modoMql === 'mql' ? 'mql' : 'all'))
      } catch (err) {
        if (!cancelled) {
          console.error('[SDRsTab] metaPeriod load error', err)
          setMetaPeriodOpps(opps)
        }
      } finally {
        if (!cancelled) setMetaPeriodLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [
    effectiveMetaRanges,
    filters,
    opps,
  ])

  // Consolidado do time
  const effectiveMetaOpps = metaPeriodOpps.length > 0 ? metaPeriodOpps : opps
  const globalMetaOpps = globalMeta
    ? filterOppsByMetaPeriod(effectiveMetaOpps, globalMeta.periodo_inicio, globalMeta.periodo_fim)
    : effectiveMetaOpps
  const consolidado = useMemo(() => {
    const totalLeads = rows.reduce((sum, r) => sum + r.leads_count, 0)
    const totalConectados = rows.reduce((sum, r) => sum + r.conectados, 0)
    const totalAgendados = rows.reduce((sum, r) => sum + r.agendados, 0)
    const totalFechamentos = rows.reduce((sum, r) => sum + r.fechamentos, 0)
    const totalAgendadosMeta = globalMeta
      ? globalMetaOpps.filter((opp) => !!opp.data_agendamento_reuniao).length
      : totalAgendados
    const metaTotal = globalMeta ? globalMeta.valor * rows.length : 0
    const pctMeta = metaTotal > 0 ? Math.round((totalAgendadosMeta / metaTotal) * 100) : 0

    return {
      totalLeads,
      totalConectados,
      totalAgendados,
      totalAgendadosMeta,
      totalFechamentos,
      metaTotal,
      pctMeta,
    }
  }, [rows, globalMeta, globalMetaOpps])

  // Produtividade: busca eventos pelo momento em que aconteceram (não pela data de entrada do lead)
  if (activePanel === 'produtividade') {
    return (
      <>
        <ProdutividadeWrapper
          startDate={startDate}
          endDate={endDate}
          pipelineMode={pipelineMode}
          opps={opps}
          revenueRows={revenueRows}
          filters={filters}
          onOpenModal={openModal}
        />
        <LeadListModal
          open={modal.open}
          onClose={() => setModal((m) => ({ ...m, open: false }))}
          title={modal.title}
          leads={modal.leads}
        />
      </>
    )
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SDRHighlightChart
        rows={highlightRows}
        loading={highlightLoading}
        error={highlightError}
        onBarClick={openModal}
        metricsConfig={HIGHLIGHT_METRICS_COHORT}
      />

      {/* Resumo Consolidado */}
      {rows.length > 0 && (
        <div>
          <p className="text-[10px] font-mono tracking-[0.14em] uppercase text-empire-subtle mb-3">
            Progresso Consolidado — Time
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: 'Leads', value: consolidado.totalLeads, color: '#3B82F6', softBg: 'rgba(59,130,246,0.05)' },
              { label: 'Conectados', value: consolidado.totalConectados, color: '#06B6D4', softBg: 'rgba(6,182,212,0.05)' },
              { label: 'Agendados', value: consolidado.totalAgendados, color: '#10B981', softBg: 'rgba(16,185,129,0.05)' },
              { label: 'Fechamentos', value: consolidado.totalFechamentos, color: '#8B5CF6', softBg: 'rgba(139,92,246,0.05)' },
              {
                label: 'Meta',
                value: consolidado.metaTotal > 0 ? `${consolidado.pctMeta}%` : '—',
                color: consolidado.pctMeta >= 100 ? '#10B981' : 'var(--empire-primary)',
                softBg: consolidado.pctMeta >= 100 ? 'rgba(16,185,129,0.05)' : 'color-mix(in srgb, var(--empire-warning) 5%, transparent)',
              },
            ].map((item) => (
              <div key={item.label}
                className="rounded-xl p-3 border border-empire-border"
                style={{ background: item.softBg, borderTop: `2px solid ${item.color}` }}>
                <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-empire-subtle mb-1">{item.label}</p>
                <p className="text-2xl font-bold leading-tight">{item.value}</p>
              </div>
            ))}
          </div>
          {globalMeta && (
            <p className="mt-2 text-[10px] text-empire-subtle">
              Meta global: {fmtDate(globalMeta.periodo_inicio)} a {fmtDate(globalMeta.periodo_fim)}
              {globalMeta.periodo_inicio !== startDate || globalMeta.periodo_fim !== endDate ? ' · vigência própria' : ''}
            </p>
          )}
          {consolidado.metaTotal > 0 && (
            <div className="mt-3 h-2 bg-empire-border rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(consolidado.pctMeta, 100)}%`,
                  background: consolidado.pctMeta >= 100
                    ? 'linear-gradient(90deg, var(--empire-success), var(--empire-success))'
                    : 'linear-gradient(90deg, var(--empire-primary), var(--empire-warning))',
                  opacity: 0.8,
                }}
              />
            </div>
          )}
          {consolidado.metaTotal > 0 && (
            <p className="mt-1 text-[10px] text-empire-subtle">
              {consolidado.totalAgendadosMeta} de {Math.round(consolidado.metaTotal)} agendamentos
            </p>
          )}
        </div>
      )}

      {/* Leaderboard */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-0.5 h-5 rounded-full bg-empire-primary" />
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.14em] text-empire-subtle">Ranking</p>
              <h3 className="text-sm font-semibold text-empire-void">Leaderboard — SDRs</h3>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-empire-muted">Meta global:</span>
            <MetaCell
              displayMeta={globalMeta}
            />
            <span className="text-xs text-empire-muted">agendamentos</span>
          </div>
        </div>
        <LeaderboardTable
          rows={rows}
          metas={metas}
          globalMeta={globalMeta}
          metaOpps={effectiveMetaOpps}
          startDate={startDate}
          endDate={endDate}
          loadingMetaPeriods={metaPeriodLoading}
          onRowClick={(row) => openModal(`Leads de ${row.sdr}`, row.leads)}
          onFechamentosClick={(row) =>
            openModal(`Fechamentos — ${row.sdr}`, row.fechamentosLeads)
          }
        />
      </div>

      {/* Comparative funnels */}
      {rows.length > 0 && (
        <div>
          <SectionHeader label="Por SDR" title="Funil Comparativo" />
          <ComparativeFunnels
            rows={rows}
            onCellClick={(sdr, stepKey) => {
              const row = rows.find((r) => r.sdr === sdr)
              if (!row) return
              const leads = (() => {
                switch (stepKey) {
                  case 'leads': return row.leads
                  case 'conectados': return row.leads.filter((o) => o.data_conectado)
                  case 'agendados': return row.leads.filter((o) => o.data_agendamento_reuniao)
                  case 'reunioes': return row.leads.filter((o) => o.data_realizacao_vendas)
                  case 'fechados': return row.fechamentosLeads
                  default: return []
                }
              })()
              openModal(`${sdr} — ${stepKey}`, leads)
            }}
          />
          <p className="mt-2 text-[10px] text-empire-subtle text-center">
            Clique em uma barra para ver os leads desse estágio
          </p>
        </div>
      )}

      {/* Evolução de Agendamentos */}
      {rows.length > 0 && (
        <div>
          <SectionHeader label="Histórico" title="Evolução de Agendamentos" />
          <AgendamentosSparklines
            rows={rows}
            metas={metas}
            globalMeta={globalMeta}
            metaOpps={effectiveMetaOpps}
            startDate={startDate}
            endDate={endDate}
          />
        </div>
      )}

      <LeadListModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
