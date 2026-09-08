import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { OppRow } from '@/hooks/useTrafego'
import {
  computeMetaKpis,
  applyMqlFilter,
  applyAttributionFilters,
  buildPaymentDateMap,
  filterUniqueMqls,
} from '@/hooks/useTrafego'
import { useCohort } from '@/hooks/useCohort'
import type { CohortRow } from '@/hooks/useCohort'
import { computeProducao } from '@/hooks/useProducao'
import type { ProducaoRow } from '@/hooks/useProducao'
import { LeadListModal } from '@/components/leads/LeadCard'
import { SectionHeader } from '@/components/dashboard'
import { AlertTriangle } from 'lucide-react'
import type { AquisicaoSharedProps } from '../AquisicaoPage'

// ─── Formatting helpers ───────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}
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

// ─── Cohort Cell ──────────────────────────────────────────────

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
        cellColor(pct, avg)
      )}
      onClick={onClick}
    >
      <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{value}</div>
      <div className="text-[10px] font-medium text-empire-subtle mt-0.5 tabular-nums">{pct}%</div>
    </td>
  )
}

// ─── Header column style ─────────────────────────────────────
const thBase = 'px-4 py-3 text-[10px] font-semibold tracking-wider uppercase text-empire-subtle'

// ─── Main Component ───────────────────────────────────────────

export function MatrizTab({
  filters,
  activePanel,
  opps,
  metaRows,
  accountDailyRows,
  revenueRows,
  loading,
  error,
  hasPaidTraffic,
  producaoOppsRaw,
  producaoRevenueRows,
  producaoLoading,
}: AquisicaoSharedProps) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false, title: '', leads: [],
  })

  // ── Payment date maps ──
  const paymentDateMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])

  // ── Cohort data ──
  const { rows: cohortRows, avgConectados, avgAgendados, avgReuniao, avgFechados } =
    useCohort(opps, revenueRows, filters.startDate, filters.endDate)

  const cohortTotals = useMemo(() => ({
    leads: cohortRows.reduce((s, r) => s + r.leads_count, 0),
    mqls: cohortRows.reduce((s, r) => s + r.mqls, 0),
    conectados: cohortRows.reduce((s, r) => s + r.conectados, 0),
    agendados: cohortRows.reduce((s, r) => s + r.agendados, 0),
    reunioes: cohortRows.reduce((s, r) => s + r.reunioes, 0),
    fechados: cohortRows.reduce((s, r) => s + r.fechados, 0),
    faturamento: cohortRows.reduce((s, r) => s + r.faturamento, 0),
  }), [cohortRows])

  // ── Produtividade: MQL + atribuição filter + compute table ──
  const producaoOpps = useMemo(
    () => applyAttributionFilters(applyMqlFilter(producaoOppsRaw, filters.mqlFilter), filters.sdrs, filters.closers),
    [producaoOppsRaw, filters.mqlFilter, filters.sdrs, filters.closers],
  )
  const { rows: producaoRows, totals: producaoTotals } = useMemo(
    () => computeProducao(producaoOpps, producaoRevenueRows, filters.startDate, filters.endDate),
    [producaoOpps, producaoRevenueRows, filters.startDate, filters.endDate],
  )

  // ── Meta KPIs (for cost/item) ──
  const metaKpis = useMemo(() => computeMetaKpis(metaRows, accountDailyRows), [metaRows, accountDailyRows])

  // ── Helpers ──
  const openModal = (title: string, leads: OppRow[]) => {
    setModal({ open: true, title, leads })
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Matriz Cohort ── */}
      {activePanel === 'cohort' && (
      <div>
        <SectionHeader
          title="Matriz Cohort"
          description="Cada linha = grupo de leads pelo mes de entrada. Clique numa celula para ver os leads."
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

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-64 w-full rounded-xl" />
            </div>
          ) : !cohortRows.length ? (
            <div className="rounded-xl border border-empire-border bg-empire-elevated p-8 text-center">
              <p className="text-sm text-empire-subtle">Sem dados de cohort no periodo.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="border-b-2 border-empire-border bg-empire-elevated">
                    <th className={cn(thBase, 'text-left min-w-[110px] sticky left-0 bg-empire-elevated z-10')}>Cohort</th>
                    <th className={cn(thBase, 'text-center min-w-[90px]')}>Leads</th>
                    <th className={cn(thBase, 'text-center min-w-[90px]')}>MQLs</th>
                    <th className={cn(thBase, 'text-center min-w-[100px]')}>Conectados</th>
                    <th className={cn(thBase, 'text-center min-w-[100px]')}>Agendados</th>
                    <th className={cn(thBase, 'text-center min-w-[90px]')}>Reunioes</th>
                    <th className={cn(thBase, 'text-center min-w-[90px]')}>Fechados</th>
                    <th className={cn(thBase, 'text-center min-w-[110px]')}>Faturamento</th>
                  </tr>
                </thead>
                <tbody>
                  {cohortRows.map((row: CohortRow) => (
                    <tr key={row.cohort_mes} className="border-b border-empire-border hover:bg-empire-elevated/40 transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-empire-void whitespace-nowrap text-sm sticky left-0 bg-empire-surface z-10">
                        {row.cohort_label}
                      </td>

                      {/* Leads */}
                      <td
                        className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                        onClick={() => openModal(`Leads \u2014 ${row.cohort_label}`, row.leads)}
                      >
                        <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{row.leads_count}</div>
                      </td>

                      {/* MQLs */}
                      <CohortCell
                        value={row.mqls}
                        pct={row.mqls_pct}
                        avg={0}
                        onClick={() => openModal(`MQLs \u2014 ${row.cohort_label}`, filterUniqueMqls(row.leads))}
                      />

                      {/* Conectados */}
                      <CohortCell
                        value={row.conectados}
                        pct={row.conectados_pct}
                        avg={avgConectados}
                        onClick={() => openModal(`Conectados \u2014 ${row.cohort_label}`, row.leads.filter((o) => !!o.data_conectado))}
                      />

                      {/* Agendados */}
                      <CohortCell
                        value={row.agendados}
                        pct={row.agendados_pct}
                        avg={avgAgendados}
                        onClick={() => openModal(`Agendados \u2014 ${row.cohort_label}`, row.leads.filter((o) => !!o.data_agendamento_reuniao))}
                      />

                      {/* Reunioes */}
                      <CohortCell
                        value={row.reunioes}
                        pct={row.reunioes_pct}
                        avg={avgReuniao}
                        onClick={() => openModal(`Reunioes \u2014 ${row.cohort_label}`, row.leads.filter((o) => !!o.data_realizacao_vendas))}
                      />

                      {/* Fechados */}
                      <CohortCell
                        value={row.fechados}
                        pct={row.fechados_pct}
                        avg={avgFechados}
                        onClick={() => openModal(`Fechados \u2014 ${row.cohort_label}`, row.leads.filter((o) => paymentDateMap.has(o.id)))}
                      />

                      {/* Faturamento */}
                      <td className="px-4 py-3.5 text-center font-semibold text-empire-void whitespace-nowrap text-sm">
                        {fmtCurrencyCompact(row.faturamento)}
                      </td>
                    </tr>
                  ))}
                </tbody>

                {/* Footer: Medias + Custo por etapa */}
                <tfoot className="border-t-2 border-empire-border bg-empire-elevated">
                  {/* Linha de medias */}
                  <tr className="border-b border-empire-border">
                    <td className="px-4 py-2.5 text-[10px] font-semibold text-empire-subtle uppercase tracking-wider sticky left-0 bg-empire-elevated z-10">Media %</td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">{Math.round(avgConectados)}%</td>
                    <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">{Math.round(avgAgendados)}%</td>
                    <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">{Math.round(avgReuniao)}%</td>
                    <td className="px-4 py-2.5 text-center text-xs font-medium text-empire-subtle">{Math.round(avgFechados)}%</td>
                    <td className="px-4 py-2.5" />
                  </tr>
                  {/* Linha de custo por etapa (so exibe se ha investimento) */}
                  {hasPaidTraffic && metaKpis.spend > 0 && (
                    <tr>
                      <td className="px-4 py-2.5 sticky left-0 bg-empire-elevated z-10">
                        <div className="text-[10px] font-semibold text-empire-subtle uppercase tracking-wider">
                          Custo/item
                        </div>
                        <div className="text-[11px] font-normal text-empire-subtle/50 mt-0.5">
                          invest. / etapa
                        </div>
                      </td>
                      {[
                        { v: cohortTotals.leads, suffix: '/ lead' },
                        { v: cohortTotals.mqls, suffix: '/ MQL' },
                        { v: cohortTotals.conectados, suffix: '/ conect.' },
                        { v: cohortTotals.agendados, suffix: '/ agend.' },
                        { v: cohortTotals.reunioes, suffix: '/ reuniao' },
                        { v: cohortTotals.fechados, suffix: '/ fechado' },
                      ].map((col, i) => (
                        <td key={i} className="px-4 py-2.5 text-center">
                          <div className="text-xs font-semibold text-empire-void">
                            {col.v > 0 ? fmtCurrency(metaKpis.spend / col.v) : '\u2014'}
                          </div>
                          <div className="text-[11px] text-empire-subtle">{col.suffix}</div>
                        </td>
                      ))}
                      <td className="px-4 py-2.5" />
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
      )} {/* fim activePanel === 'cohort' */}

      {/* ── Matriz Produtividade ── */}
      {activePanel === 'produtividade' && (
        <div>
          <SectionHeader
            title="Tabela de Produtividade"
            description="Eventos agrupados pelo mes em que ocorreram. Clique numa celula para ver os leads."
          />

          <div className="mt-3">
            {producaoLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full rounded-xl" />
              </div>
            ) : !producaoRows.length ? (
              <div className="rounded-xl border border-empire-border bg-empire-elevated p-8 text-center">
                <p className="text-sm text-empire-subtle">Nenhum evento encontrado no periodo.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
                <table className="w-full min-w-[560px]">
                  <thead>
                    <tr className="border-b-2 border-empire-border bg-empire-elevated">
                      <th className={cn(thBase, 'text-left min-w-[110px] sticky left-0 bg-empire-elevated z-10')}>Mes</th>
                      <th className={cn(thBase, 'text-center min-w-[100px]')}>Conectados</th>
                      <th className={cn(thBase, 'text-center min-w-[100px]')}>Agendados</th>
                      <th className={cn(thBase, 'text-center min-w-[90px]')}>Reunioes</th>
                      <th className={cn(thBase, 'text-center min-w-[90px]')}>Fechados</th>
                      <th className={cn(thBase, 'text-center min-w-[110px]')}>Faturamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {producaoRows.map((row: ProducaoRow) => (
                      <tr
                        key={row.mes}
                        className="border-b border-empire-border hover:bg-empire-elevated/40 transition-colors"
                      >
                        <td className="px-4 py-3.5 font-semibold text-empire-void whitespace-nowrap text-sm sticky left-0 bg-empire-surface z-10">
                          {row.mes_label}
                        </td>

                        {/* Conectados */}
                        <td
                          className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                          onClick={() => openModal(`Conectados \u2014 ${row.mes_label}`, row.leads_conectados)}
                        >
                          <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{row.conectados}</div>
                          {row.conectados === 0 && (
                            <div className="text-[10px] text-empire-subtle">\u2014</div>
                          )}
                        </td>

                        {/* Agendados */}
                        <td
                          className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                          onClick={() => openModal(`Agendados \u2014 ${row.mes_label}`, row.leads_agendados)}
                        >
                          <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{row.agendados}</div>
                          {row.mqls > 0 && (
                            <div className="text-[10px] font-medium text-empire-subtle mt-0.5 tabular-nums">
                              {Math.round((row.agendados / row.mqls) * 100)}%
                            </div>
                          )}
                        </td>

                        {/* Reunioes */}
                        <td
                          className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                          onClick={() => openModal(`Reunioes \u2014 ${row.mes_label}`, row.leads_reunioes)}
                        >
                          <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{row.reunioes}</div>
                          {row.agendados > 0 && (
                            <div className="text-[10px] font-medium text-empire-subtle mt-0.5 tabular-nums">
                              {Math.round((row.reunioes / row.agendados) * 100)}%
                            </div>
                          )}
                        </td>

                        {/* Fechados */}
                        <td
                          className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                          onClick={() => openModal(`Fechados \u2014 ${row.mes_label}`, row.leads_fechados)}
                        >
                          <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">{row.fechados}</div>
                          {row.reunioes > 0 && (
                            <div className="text-[10px] font-medium text-empire-subtle mt-0.5 tabular-nums">
                              {Math.round((row.fechados / row.reunioes) * 100)}%
                            </div>
                          )}
                        </td>

                        {/* Faturamento */}
                        <td className="px-4 py-3.5 text-center font-semibold text-empire-void whitespace-nowrap text-sm">
                          {fmtCurrencyCompact(row.faturamento)}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Footer: totais + custo por etapa */}
                  <tfoot className="border-t-2 border-empire-border bg-empire-elevated">
                    {/* Linha custo por etapa (so se ha investimento) */}
                    {hasPaidTraffic && metaKpis.spend > 0 && (
                      <tr>
                        <td className="px-4 py-2.5 sticky left-0 bg-empire-elevated z-10">
                          <div className="text-[10px] font-semibold text-empire-subtle uppercase tracking-wider">
                            Custo/item
                          </div>
                          <div className="text-[11px] font-normal text-empire-subtle/50 mt-0.5">
                            invest. / etapa
                          </div>
                        </td>
                        {[
                          { v: producaoTotals.conectados, suffix: '/ conectado' },
                          { v: producaoTotals.agendados, suffix: '/ agendado' },
                          { v: producaoTotals.reunioes, suffix: '/ reuniao' },
                          { v: producaoTotals.fechados, suffix: '/ fechado' },
                        ].map((col, i) => (
                          <td key={i} className="px-4 py-2.5 text-center">
                            <div className="text-xs font-semibold text-empire-void">
                              {col.v > 0 ? fmtCurrency(metaKpis.spend / col.v) : '\u2014'}
                            </div>
                            <div className="text-[11px] text-empire-subtle">{col.suffix}</div>
                          </td>
                        ))}
                        <td className="px-4 py-2.5" />
                      </tr>
                    )}
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      )} {/* fim activePanel === 'produtividade' */}

      {/* ── Lead List Modal ── */}
      <LeadListModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
