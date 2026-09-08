import { useState, useMemo } from 'react'
import {
  computeMetaKpis,
  applyMqlFilter,
  applyAttributionFilters,
  buildPaymentDateMap,
} from '@/hooks/useTrafego'
import type { OppRow } from '@/hooks/useTrafego'
import { useCohort } from '@/hooks/useCohort'
import { computeProducao } from '@/hooks/useProducao'
import { LeadListModal } from '@/components/leads/LeadCard'
import {
  SectionHeader,
  CohortMatrix,
  ProdutividadeMatrix,
} from '@/components/dashboard'
import { AlertTriangle } from 'lucide-react'
import type { TrafegoSharedProps } from '../DashboardPage'

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
  producaoOppsRaw,
  producaoRevenueRows,
}: TrafegoSharedProps) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false,
    title: '',
    leads: [],
  })

  // ── Computed ─────────────────────────────────────────────
  const filteredOpps = useMemo(() => applyMqlFilter(opps, filters.mqlFilter), [opps, filters.mqlFilter])
  const filteredOppIds = useMemo(() => new Set(filteredOpps.map((o) => o.id)), [filteredOpps])
  const filteredRevenueRows = useMemo(
    () => revenueRows.filter((r) => filteredOppIds.has(r.oportunidade_id)),
    [revenueRows, filteredOppIds],
  )
  const paymentDateMap = useMemo(() => buildPaymentDateMap(filteredRevenueRows), [filteredRevenueRows])

  // Cohort
  const { rows: cohortRows, avgConectados, avgAgendados, avgReuniao, avgFechados } = useCohort(
    filteredOpps,
    filteredRevenueRows,
    filters.startDate,
    filters.endDate,
  )

  const cohortTotals = useMemo(
    () => ({
      leads: cohortRows.reduce((s, r) => s + r.leads_count, 0),
      mqls: cohortRows.reduce((s, r) => s + r.mqls, 0),
      conectados: cohortRows.reduce((s, r) => s + r.conectados, 0),
      agendados: cohortRows.reduce((s, r) => s + r.agendados, 0),
      reunioes: cohortRows.reduce((s, r) => s + r.reunioes, 0),
      fechados: cohortRows.reduce((s, r) => s + r.fechados, 0),
      faturamento: cohortRows.reduce((s, r) => s + r.faturamento, 0),
    }),
    [cohortRows],
  )

  const metaKpis = useMemo(() => computeMetaKpis(metaRows, accountDailyRows), [metaRows, accountDailyRows])

  // Produtividade
  const producaoOpps = useMemo(
    () => applyAttributionFilters(applyMqlFilter(producaoOppsRaw, filters.mqlFilter), filters.sdrs, filters.closers),
    [producaoOppsRaw, filters.mqlFilter, filters.sdrs, filters.closers],
  )
  const { rows: producaoRows, totals: producaoTotals } = useMemo(
    () => computeProducao(producaoOpps, producaoRevenueRows, filters.startDate, filters.endDate),
    [producaoOpps, producaoRevenueRows, filters.startDate, filters.endDate],
  )

  // ── Helpers ──────────────────────────────────────────────
  const openModal = (title: string, leads: OppRow[]) => {
    setModal({ open: true, title, leads })
  }

  // ── Error ────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Cohort Matrix */}
      {activePanel === 'cohort' && (
        <div>
          <SectionHeader
            title="Matriz Cohort"
            description="Cada linha = grupo de leads pelo mes de entrada. Clique numa celula para ver os leads."
          />
          <div className="mt-3">
            <CohortMatrix
              rows={cohortRows}
              avgConectados={avgConectados}
              avgAgendados={avgAgendados}
              avgReuniao={avgReuniao}
              avgFechados={avgFechados}
              totals={cohortTotals}
              metaSpend={metaKpis.spend}
              loading={loading}
              paymentDateMap={paymentDateMap}
              onOpenModal={openModal}
            />
          </div>
        </div>
      )}

      {/* Produtividade Matrix */}
      {activePanel === 'produtividade' && (
        <div>
          <SectionHeader
            title="Tabela de Produtividade"
            description="Eventos agrupados pelo mes em que ocorreram. Clique numa celula para ver os leads."
          />
          <div className="mt-3">
            <ProdutividadeMatrix
              rows={producaoRows}
              totals={producaoTotals}
              loading={loading}
              error={null}
              onOpenModal={openModal}
            />
          </div>
        </div>
      )}

      {/* Lead List Modal */}
      <LeadListModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
