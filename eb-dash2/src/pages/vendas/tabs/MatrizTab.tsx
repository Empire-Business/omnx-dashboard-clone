import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import { buildPaymentDateMap, isMqlByTag, isVendaExterna, caixaRecebidoAcumulado, faturamentoDaVenda } from '@/hooks/useTrafego'
import { useVendasCohort } from '@/hooks/useVendasCohort'
import { useCloserProdutividade } from '@/hooks/useCloserProdutividade'
import type { RecuperacaoMode } from '@/lib/constants'
import type { CloserMesSubRow, CloserProdutividadeDimensionFilters } from '@/hooks/useCloserProdutividade'
import { LeadListModal } from '@/components/leads/LeadCard'
import { SectionHeader } from '@/components/dashboard'
import { AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react'

// ─── Helpers ─────────────────────────────────────────────────

function fmtCurrencyCompact(v: number) {
  if (v === 0) return '\u2014'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v)
}

function cellColor(pct: number, avg: number): string {
  if (avg === 0) return ''
  const diff = pct - avg
  if (diff < -20) return 'bg-empire-danger-soft text-empire-danger'
  if (diff < -10) return 'bg-empire-warning-soft text-empire-warning'
  if (diff > 10) return 'bg-empire-success-soft text-empire-success'
  return ''
}

// Calcula breakdown de closers a partir dos leads do cohort (client-side, sem nova query)
function computeCloserBreakdown(
  leads: OppRow[],
  paymentDateMap: Map<string, string>,
  revenueMap: Map<string, { faturado: number; entrada: number }>,
): CloserMesSubRow[] {
  const byCloser = new Map<string, { reunioes: number; fechados: number; faturamento: number; caixa: number }>()
  for (const opp of leads) {
    const closer = opp.vendedor_closer?.replace(/\s+/g, ' ').trim()
    if (!closer) continue
    const entry = byCloser.get(closer) ?? { reunioes: 0, fechados: 0, faturamento: 0, caixa: 0 }
    if (opp.data_realizacao_vendas) entry.reunioes++
    if (paymentDateMap.has(opp.id)) {
      entry.fechados++
      const rev = revenueMap.get(opp.id)
      entry.faturamento += rev?.faturado ?? 0
      entry.caixa += rev?.entrada ?? 0
    }
    byCloser.set(closer, entry)
  }
  return [...byCloser.entries()]
    .map(([closer, d]) => ({
      closer,
      reunioes: d.reunioes,
      fechados: d.fechados,
      conversao_pct: d.reunioes > 0 ? Math.round((d.fechados / d.reunioes) * 100) : 0,
      faturamento: d.faturamento,
      caixa: d.caixa,
    }))
    .filter((r) => r.reunioes > 0 || r.fechados > 0)
    .sort((a, b) => b.fechados - a.fechados || b.reunioes - a.reunioes)
}

// ─── CloserSubTable ───────────────────────────────────────────

function CloserSubTable({ closerRows }: { closerRows: CloserMesSubRow[] }) {
  if (closerRows.length === 0) {
    return (
      <div className="px-8 py-3 text-[11px] text-empire-subtle italic">
        Nenhum closer com reunião ou fechamento neste período.
      </div>
    )
  }
  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-empire-border/60">
          <th className="pl-10 pr-4 py-2 text-left text-[11px] font-semibold tracking-wider uppercase text-empire-subtle">
            Closer
          </th>
          <th className="px-4 py-2 text-center text-[11px] font-semibold tracking-wider uppercase text-empire-subtle">
            Reuniões
          </th>
          <th className="px-4 py-2 text-center text-[11px] font-semibold tracking-wider uppercase text-empire-subtle">
            Fechados
          </th>
          <th className="px-4 py-2 text-center text-[11px] font-semibold tracking-wider uppercase text-empire-subtle">
            Tax. Conv.
          </th>
          <th className="px-4 py-2 text-center text-[11px] font-semibold tracking-wider uppercase text-empire-subtle">
            Faturamento
          </th>
        </tr>
      </thead>
      <tbody>
        {closerRows.map((r) => (
          <tr key={r.closer} className="border-b border-empire-border/40 last:border-0">
            <td className="pl-10 pr-4 py-2 text-xs font-medium text-empire-void whitespace-nowrap">
              {r.closer}
            </td>
            <td className="px-4 py-2 text-center text-xs text-empire-void tabular-nums">
              {r.reunioes}
            </td>
            <td className="px-4 py-2 text-center text-xs font-semibold text-empire-void tabular-nums">
              {r.fechados}
            </td>
            <td className="px-4 py-2 text-center text-xs tabular-nums">
              {r.reunioes > 0 ? (
                <span className={cn(
                  'font-semibold',
                  r.conversao_pct >= 40 ? 'text-empire-success' :
                  r.conversao_pct >= 20 ? 'text-empire-warning' : 'text-empire-danger',
                )}>
                  {r.conversao_pct}%
                </span>
              ) : (
                <span className="text-empire-subtle">&mdash;</span>
              )}
            </td>
            <td className="px-4 py-2 text-center text-xs font-semibold text-empire-void whitespace-nowrap tabular-nums">
              {fmtCurrencyCompact(r.faturamento)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ─── CohortCell ──────────────────────────────────────────────

function CohortCell({
  value,
  pct,
  avg,
  onClick,
}: {
  value: number
  pct: number
  avg: number
  onClick: () => void
}) {
  return (
    <td
      className={cn(
        'px-4 py-3.5 text-center cursor-pointer transition-colors hover:brightness-95',
        cellColor(pct, avg),
      )}
      onClick={onClick}
    >
      <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{value}</div>
      <div className="text-[10px] font-medium text-empire-subtle mt-0.5 tabular-nums">{pct}%</div>
    </td>
  )
}

// ─── ProdCell (célula da tabela Produtividade) ───────────────

function ProdCell({
  value,
  onClick,
}: {
  value: number
  onClick?: () => void
}) {
  return (
    <td
      className={cn('px-4 py-3.5 text-center', onClick && value > 0 && 'cursor-pointer hover:bg-empire-elevated transition-colors')}
      onClick={onClick && value > 0 ? onClick : undefined}
    >
      <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{value}</div>
    </td>
  )
}

// ─── Header column style ─────────────────────────────────────
const thBase = 'px-4 py-3 text-[10px] font-semibold tracking-wider uppercase text-empire-subtle'

// ─── Props ───────────────────────────────────────────────────

interface MatrizTabProps {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  loading: boolean
  activePanel: 'cohort' | 'produtividade'
  startDate: string
  endDate: string
  dimensionFilters?: CloserProdutividadeDimensionFilters
  /** Filtro de Recuperação da página — mesma régua das demais abas. */
  recuperacaoMode?: RecuperacaoMode
}

// ─── Main component ──────────────────────────────────────────

export function MatrizTab({ opps, revenueRows, loading, activePanel, startDate, endDate, dimensionFilters, recuperacaoMode = 'exclude_recuperacao' }: MatrizTabProps) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false,
    title: '',
    leads: [],
  })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  function toggleExpand(key: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const isProdutividade = activePanel === 'produtividade'

  const cohort = useVendasCohort(opps, revenueRows, startDate, endDate)
  const { rowsByMonth, loading: prodLoading, error: prodError } =
    useCloserProdutividade(startDate, endDate, isProdutividade, dimensionFilters, recuperacaoMode)

  // ── Computed ──
  const paymentDateMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])

  const revenueMap = useMemo(() => {
    const m = new Map<string, { faturado: number; entrada: number }>()
    for (const r of revenueRows) {
      const e = m.get(r.oportunidade_id) ?? { faturado: 0, entrada: 0 }
      e.faturado += faturamentoDaVenda(r)
      e.entrada += caixaRecebidoAcumulado(r)
      m.set(r.oportunidade_id, e)
    }
    return m
  }, [revenueRows])

  const totals = useMemo(() => ({
    leads: opps.length,
    mqls: opps.filter((o) => isMqlByTag(o.contatos)).length,
    agendados: opps.filter((o) => !!o.data_agendamento_vendas).length,
    reunioes: opps.filter((o) => !!o.data_realizacao_vendas).length,
    fechados: opps.filter((o) => paymentDateMap.has(o.id)).length,
  }), [opps, paymentDateMap])

  const isLoading = loading || (isProdutividade && prodLoading)

  // Totais para rodapé Produtividade
  const prodTotais = useMemo(() => ({
    reunioes: rowsByMonth.reduce((s, r) => s + r.reunioes, 0),
    fechados: rowsByMonth.reduce((s, r) => s + r.fechados, 0),
  }), [rowsByMonth])

  // V. Externa por mês em Produtividade (agrupado por mês de data_pagamento_entrada)
  const prodVendasExternasByMes = useMemo(() => {
    const oppMap = new Map(opps.map(o => [o.id, o]))
    const map = new Map<string, number>()
    for (const rev of revenueRows) {
      if (!rev.data_pagamento_entrada) continue
      const opp = oppMap.get(rev.oportunidade_id)
      if (!opp || !isVendaExterna(opp)) continue
      const mes = (rev.data_pagamento_entrada as string).slice(0, 7)
      map.set(mes, (map.get(mes) ?? 0) + 1)
    }
    return map
  }, [opps, revenueRows])

  // Leads pagos por mês (para modal clicável em Produtividade)
  const prodPaidLeadsByMes = useMemo(() => {
    const oppMap = new Map(opps.map(o => [o.id, o]))
    const map = new Map<string, { internos: OppRow[]; externos: OppRow[] }>()
    for (const rev of revenueRows) {
      if (!rev.data_pagamento_entrada) continue
      const opp = oppMap.get(rev.oportunidade_id)
      if (!opp) continue
      const mes = (rev.data_pagamento_entrada as string).slice(0, 7)
      const entry = map.get(mes) ?? { internos: [], externos: [] }
      if (isVendaExterna(opp)) entry.externos.push(opp)
      else entry.internos.push(opp)
      map.set(mes, entry)
    }
    return map
  }, [opps, revenueRows])

  // ── Render ──
  return (
    <div className="space-y-5">
      {/* ── Loading skeleton ── */}
      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── COHORT MODE ── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {!isLoading && !isProdutividade && (
        <div>
          <SectionHeader
            title="Matriz Cohort — Vendas"
            description=""
          />

          <div className="mt-3 space-y-3">
            {/* Legend */}
            <div className="flex items-center gap-4 text-[10px] text-empire-subtle">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-empire-success-soft" /> Acima da media
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-empire-warning-soft" /> Levemente abaixo
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-empire-danger-soft" /> Muito abaixo
              </span>
            </div>

            {cohort.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
                <table className="w-full min-w-[660px]">
                  <thead>
                    <tr className="border-b-2 border-empire-border bg-empire-elevated">
                      {['Cohort', 'Leads', 'MQLs', 'Agend. Vendas', 'Reunioes', 'No-shows', 'Negociacao', 'Fechados', 'Tax. Conv.', 'V. Externa', 'Faturamento', 'Caixa'].map((h, i) => (
                        <th
                          key={h}
                          className={cn(
                            thBase,
                            i === 0 ? 'text-left min-w-[120px] sticky left-0 bg-empire-elevated z-10' : 'text-center min-w-[90px]',
                            (h === 'Faturamento' || h === 'Caixa') && 'min-w-[100px]',
                            h === 'Tax. Conv.' && 'min-w-[80px]',
                          )}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohort.rows.map((row) => {
                      const isExpanded = expandedRows.has(row.cohort_mes)
                      const closerBreakdown = isExpanded
                        ? computeCloserBreakdown(row.leads, paymentDateMap, revenueMap)
                        : []
                      const fechadosInternos = row.leads.filter(o => paymentDateMap.has(o.id) && !isVendaExterna(o)).length
                      const vendasExternasCnt = row.leads.filter(o => paymentDateMap.has(o.id) && isVendaExterna(o)).length
                      const fechadosPct = row.reunioes > 0 ? Math.round((fechadosInternos / row.reunioes) * 100) : 0
                      return (
                        <>
                          <tr
                            key={row.cohort_mes}
                            className="border-b border-empire-border hover:bg-empire-elevated/40 transition-colors"
                          >
                            <td className="px-4 py-3.5 font-semibold text-empire-void whitespace-nowrap text-sm sticky left-0 bg-empire-surface z-10">
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => toggleExpand(row.cohort_mes)}
                                  className="shrink-0 text-empire-subtle hover:text-empire-void transition-colors"
                                  title={isExpanded ? 'Recolher closers' : 'Ver por closer'}
                                >
                                  {isExpanded
                                    ? <ChevronDown size={14} />
                                    : <ChevronRight size={14} />
                                  }
                                </button>
                                {row.cohort_label}
                              </div>
                            </td>
                            <td
                              className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                              onClick={() =>
                                setModal({ open: true, title: `Leads \u2014 ${row.cohort_label}`, leads: row.leads })
                              }
                            >
                              <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{row.leads_count}</div>
                            </td>
                            <td className="px-4 py-3.5 text-center">
                              <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{row.mqls}</div>
                              <div className="text-[10px] font-medium text-empire-subtle mt-0.5 tabular-nums">{row.mqls_pct}%</div>
                            </td>
                            <CohortCell
                              value={row.agendados_vendas}
                              pct={row.agendados_vendas_pct}
                              avg={cohort.avgAgendadosVendas}
                              onClick={() =>
                                setModal({
                                  open: true,
                                  title: `Agendados Vendas \u2014 ${row.cohort_label}`,
                                  leads: row.leads.filter((o) => !!o.data_agendamento_vendas),
                                })
                              }
                            />
                            <CohortCell
                              value={row.reunioes}
                              pct={row.reunioes_pct}
                              avg={cohort.avgReunioes}
                              onClick={() =>
                                setModal({
                                  open: true,
                                  title: `Reunioes \u2014 ${row.cohort_label}`,
                                  leads: row.leads.filter((o) => !!o.data_realizacao_vendas),
                                })
                              }
                            />
                            <CohortCell
                              value={row.no_shows}
                              pct={row.no_shows_pct}
                              avg={cohort.avgNoShows}
                              onClick={() =>
                                setModal({
                                  open: true,
                                  title: `No-shows \u2014 ${row.cohort_label}`,
                                  leads: row.leads.filter((o) => !!o.data_no_show_vendas && !o.data_realizacao_vendas),
                                })
                              }
                            />
                            <CohortCell
                              value={row.negociacao}
                              pct={row.negociacao_pct}
                              avg={cohort.avgNegociacao}
                              onClick={() =>
                                setModal({
                                  open: true,
                                  title: `Negociacao \u2014 ${row.cohort_label}`,
                                  leads: row.leads.filter((o) => !!o.data_negociacao),
                                })
                              }
                            />
                            <CohortCell
                              value={fechadosInternos}
                              pct={fechadosPct}
                              avg={cohort.avgFechados}
                              onClick={() =>
                                setModal({
                                  open: true,
                                  title: `Fechados \u2014 ${row.cohort_label}`,
                                  leads: row.leads.filter((o) => paymentDateMap.has(o.id) && !isVendaExterna(o)),
                                })
                              }
                            />
                            {/* Tax. Conv. */}
                            <td className="px-4 py-3.5 text-center">
                              <div className={cn(
                                'text-sm font-bold tabular-nums',
                                row.reunioes > 0 && fechadosPct >= 40 ? 'text-empire-success' :
                                row.reunioes > 0 && fechadosPct >= 20 ? 'text-empire-warning' :
                                row.reunioes > 0 ? 'text-empire-danger' : 'text-empire-subtle',
                              )}>
                                {row.reunioes > 0 ? `${fechadosPct}%` : '\u2014'}
                              </div>
                            </td>
                            {/* V. Externa */}
                            <td className="px-4 py-3.5 text-center">
                              {vendasExternasCnt > 0 ? (
                                <button
                                  className="text-sm font-bold text-empire-void hover:underline tabular-nums"
                                  onClick={() => setModal({ open: true, title: `Vendas Externas \u2014 ${row.cohort_label}`, leads: row.leads.filter(o => paymentDateMap.has(o.id) && isVendaExterna(o)) })}
                                >
                                  {vendasExternasCnt}
                                </button>
                              ) : (
                                <span className="text-sm text-empire-subtle">0</span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold text-empire-void whitespace-nowrap text-sm">
                              {fmtCurrencyCompact(row.faturamento)}
                            </td>
                            <td className="px-4 py-3.5 text-center font-semibold text-empire-void whitespace-nowrap text-sm">
                              {fmtCurrencyCompact(row.caixa)}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${row.cohort_mes}-closers`} className="border-b border-empire-border">
                              <td colSpan={12} className="px-0 py-0 bg-empire-elevated/50">
                                <CloserSubTable closerRows={closerBreakdown} />
                              </td>
                            </tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>

                  {/* Footer: Average row */}
                  <tfoot className="border-t-2 border-empire-border bg-empire-elevated">
                    <tr>
                      <td className="px-4 py-2.5 text-[10px] font-semibold text-empire-subtle uppercase tracking-wider sticky left-0 bg-empire-elevated z-10">
                        Media
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                        {cohort.rows.length > 0 ? Math.round(totals.leads / cohort.rows.length) : 0}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                        {cohort.rows.length > 0 ? Math.round(totals.mqls / cohort.rows.length) : 0}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                        {Math.round(cohort.avgAgendadosVendas)}%
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                        {Math.round(cohort.avgReunioes)}%
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                        {Math.round(cohort.avgNoShows)}%
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                        {Math.round(cohort.avgNegociacao)}%
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                        {Math.round(cohort.avgFechados)}%
                      </td>
                      {/* Tax. Conv. média */}
                      <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                        {Math.round(cohort.avgFechados)}%
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                        {cohort.rows.reduce((s, r) => s + r.leads.filter(o => paymentDateMap.has(o.id) && isVendaExterna(o)).length, 0)}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-semibold text-empire-void">
                        {fmtCurrencyCompact(cohort.rows.reduce((s, r) => s + r.faturamento, 0))}
                      </td>
                      <td className="px-4 py-2.5 text-center text-xs font-semibold text-empire-void">
                        {fmtCurrencyCompact(cohort.rows.reduce((s, r) => s + r.caixa, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="rounded-xl border border-empire-border bg-empire-elevated p-8 text-center">
                <p className="text-sm text-empire-subtle">Sem dados de cohort no periodo.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════ */}
      {/* ── PRODUTIVIDADE MODE ── */}
      {/* ══════════════════════════════════════════════════════════ */}
      {!isLoading && isProdutividade && (
        prodError ? (
          <div className="flex items-center gap-3 rounded-xl border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {prodError}
          </div>
        ) : (
          <div>
            <SectionHeader
              title="Matriz Produtividade — Vendas"
              description="Cada coluna conta a data do próprio evento; Leads e MQLs usam a data de geração, sem funil encadeado."
            />

            <div className="mt-3 space-y-3">
              {rowsByMonth.length > 0 ? (
                <div className="overflow-x-auto rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
                  <table className="w-full min-w-[640px]">
                    <thead>
                      <tr className="border-b-2 border-empire-border bg-empire-elevated">
                        {['Período', 'Leads', 'MQLs', 'Agend. Vendas', 'Reuniões', 'No-shows', 'Negociação', 'Fechados', 'Tax. Conv.', 'V. Externa', 'Faturamento', 'Caixa'].map((h, i) => (
                          <th
                            key={h}
                            className={cn(
                              thBase,
                              i === 0 ? 'text-left min-w-[120px] sticky left-0 bg-empire-elevated z-10' : 'text-center min-w-[90px]',
                              (h === 'Faturamento' || h === 'Caixa') && 'min-w-[100px]',
                              h === 'Tax. Conv.' && 'min-w-[80px]',
                            )}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowsByMonth.map((row) => {
                        const isExpanded = expandedRows.has(row.mes)
                        return (
                          <>
                            <tr key={row.mes} className="border-b border-empire-border hover:bg-empire-elevated/40 transition-colors">
                              <td className="px-4 py-3.5 font-semibold text-empire-void whitespace-nowrap text-sm sticky left-0 bg-empire-surface z-10">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => toggleExpand(row.mes)}
                                    className="shrink-0 text-empire-subtle hover:text-empire-void transition-colors"
                                    title={isExpanded ? 'Recolher closers' : 'Ver por closer'}
                                  >
                                    {isExpanded
                                      ? <ChevronDown size={14} />
                                      : <ChevronRight size={14} />
                                    }
                                  </button>
                                  {row.mes_label}
                                </div>
                              </td>
                              <ProdCell value={row.leads_count} />
                              <ProdCell value={row.mqls} />
                              <ProdCell value={row.agendados_vendas} />
                              <ProdCell value={row.reunioes} />
                              <ProdCell value={row.no_shows} />
                              <ProdCell value={row.negociacao} />
                              {(() => {
                                const ext = prodVendasExternasByMes.get(row.mes.slice(0, 7)) ?? 0
                                const fechadosInternos = row.fechados - ext
                                const taxaConv = row.reunioes > 0 ? Math.round((fechadosInternos / row.reunioes) * 100) : 0
                                return (
                                  <>
                                    <ProdCell
                                      value={fechadosInternos}
                                      onClick={() => setModal({ open: true, title: `Fechados — ${row.mes_label}`, leads: prodPaidLeadsByMes.get(row.mes.slice(0, 7))?.internos ?? [] })}
                                    />
                                    {/* Tax. Conv. */}
                                    <td className="px-4 py-3.5 text-center">
                                      <div className={cn(
                                        'text-sm font-bold tabular-nums',
                                        row.reunioes > 0 && taxaConv >= 40 ? 'text-empire-success' :
                                        row.reunioes > 0 && taxaConv >= 20 ? 'text-empire-warning' :
                                        row.reunioes > 0 ? 'text-empire-danger' : 'text-empire-subtle',
                                      )}>
                                        {row.reunioes > 0 ? `${taxaConv}%` : '\u2014'}
                                      </div>
                                    </td>
                                  </>
                                )
                              })()}
                              {/* V. Externa */}
                              <td className="px-4 py-3.5 text-center">
                                {(() => {
                                  const cnt = prodVendasExternasByMes.get(row.mes.slice(0, 7)) ?? 0
                                  const externos = prodPaidLeadsByMes.get(row.mes.slice(0, 7))?.externos ?? []
                                  return cnt > 0 ? (
                                    <button
                                      className="text-sm font-bold text-empire-void hover:underline tabular-nums"
                                      onClick={() => setModal({ open: true, title: `Vendas Externas — ${row.mes_label}`, leads: externos })}
                                    >
                                      {cnt}
                                    </button>
                                  ) : (
                                    <span className="text-sm text-empire-subtle">0</span>
                                  )
                                })()}
                              </td>
                              <td className="px-4 py-3.5 text-center font-semibold text-empire-void whitespace-nowrap text-sm">
                                {fmtCurrencyCompact(row.faturamento)}
                              </td>
                              <td className="px-4 py-3.5 text-center font-semibold text-empire-void whitespace-nowrap text-sm">
                                {fmtCurrencyCompact(row.caixa)}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${row.mes}-closers`} className="border-b border-empire-border">
                                <td colSpan={12} className="px-0 py-0 bg-empire-elevated/50">
                                  <CloserSubTable closerRows={row.closerRows} />
                                </td>
                              </tr>
                            )}
                          </>
                        )
                      })}
                    </tbody>

                    {/* Footer: totais */}
                    <tfoot className="border-t-2 border-empire-border bg-empire-elevated">
                      <tr>
                        <td className="px-4 py-2.5 text-[10px] font-semibold text-empire-subtle uppercase tracking-wider sticky left-0 bg-empire-elevated z-10">
                          Total
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {rowsByMonth.reduce((s, r) => s + r.leads_count, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {rowsByMonth.reduce((s, r) => s + r.mqls, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {rowsByMonth.reduce((s, r) => s + r.agendados_vendas, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {rowsByMonth.reduce((s, r) => s + r.reunioes, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {rowsByMonth.reduce((s, r) => s + r.no_shows, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {rowsByMonth.reduce((s, r) => s + r.negociacao, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {rowsByMonth.reduce((s, r) => s + r.fechados - (prodVendasExternasByMes.get(r.mes.slice(0, 7)) ?? 0), 0)}
                        </td>
                        {/* Tax. Conv. total */}
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {(() => {
                            const fechadosInternos = rowsByMonth.reduce((s, r) => s + r.fechados - (prodVendasExternasByMes.get(r.mes.slice(0, 7)) ?? 0), 0)
                            return prodTotais.reunioes > 0
                              ? `${Math.round((fechadosInternos / prodTotais.reunioes) * 100)}%`
                              : '\u2014'
                          })()}
                        </td>
                        {/* V. Externa total */}
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {[...prodVendasExternasByMes.values()].reduce((s, v) => s + v, 0)}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {fmtCurrencyCompact(rowsByMonth.reduce((s, r) => s + r.faturamento, 0))}
                        </td>
                        <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">
                          {fmtCurrencyCompact(rowsByMonth.reduce((s, r) => s + r.caixa, 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ) : (
                <div className="rounded-xl border border-empire-border bg-empire-elevated p-8 text-center">
                  <p className="text-sm text-empire-subtle">Sem atividade registrada no periodo.</p>
                </div>
              )}

              <p className="text-[10px] text-empire-subtle">
                Cada linha mostra contagens independentes pelo mês do próprio evento. Leads/MQLs usam a data de geração; agendamentos, reuniões, no-shows, negociações e fechamentos usam suas próprias datas.
              </p>
            </div>
          </div>
        )
      )}

      {/* Lead List Modal */}
      <LeadListModal
        open={modal.open}
        onClose={() => setModal({ open: false, title: '', leads: [] })}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
