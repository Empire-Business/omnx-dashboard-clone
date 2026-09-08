import { useMemo } from 'react'
import type { OppRow, RevenueRow } from './useTrafego'
import { buildPaymentDateMap, countUniqueMqls, caixaRecebidoAcumulado, faturamentoDaVenda } from './useTrafego'
import { tsToSPDate } from '@/lib/utils/dates'

// ─── Types ────────────────────────────────────────────────────

export interface VendasCohortRow {
  cohort_mes: string        // 'YYYY-MM-DD' (first day of month)
  cohort_label: string      // 'Jan/26'
  leads: OppRow[]
  leads_count: number
  mqls: number
  mqls_pct: number
  agendados_vendas: number
  agendados_vendas_pct: number   // % of leads
  reunioes: number
  reunioes_pct: number           // % of agendados_vendas
  no_shows: number
  no_shows_pct: number           // % of agendados_vendas
  negociacao: number
  negociacao_pct: number         // % of reunioes
  fechados: number
  fechados_pct: number           // % of reunioes
  faturamento: number
  caixa: number
}

export interface VendasCohortData {
  rows: VendasCohortRow[]
  avgAgendadosVendas: number
  avgReunioes: number
  avgNoShows: number
  avgNegociacao: number
  avgFechados: number
}

// ─── Helpers ─────────────────────────────────────────────────

function formatCohortLabel(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
  }).replace('.', '').replace(' ', '/')
}

function startOfMonth(dateStr: string): string {
  const spDate = tsToSPDate(dateStr)
  return `${spDate.slice(0, 7)}-01`
}

// ─── Hook ─────────────────────────────────────────────────────

export function useVendasCohort(
  opps: OppRow[],
  revenueRows: RevenueRow[],
  startDate: string,
  endDate: string,
): VendasCohortData {
  return useMemo(() => {
    const empty: VendasCohortData = {
      rows: [],
      avgAgendadosVendas: 0,
      avgReunioes: 0,
      avgNoShows: 0,
      avgNegociacao: 0,
      avgFechados: 0,
    }
    if (!opps.length) return empty

    // Revenue map: opp_id -> { faturado, entrada }
    const revMap = new Map<string, { faturado: number; entrada: number }>()
    for (const r of revenueRows) {
      const existing = revMap.get(r.oportunidade_id) ?? { faturado: 0, entrada: 0 }
      existing.faturado += faturamentoDaVenda(r)
      existing.entrada += caixaRecebidoAcumulado(r)
      revMap.set(r.oportunidade_id, existing)
    }

    const paymentDateMap = buildPaymentDateMap(revenueRows)

    // Group by cohort month — usa data_lead_recebido, a mesma régua do filtro
    // de período (filterByLeadDate), com fallback para contatos.date_created.
    // Ver comentário equivalente em useCohort.ts.
    const byCohort = new Map<string, OppRow[]>()
    for (const opp of opps) {
      const dateRef = opp.data_lead_recebido ?? opp.contatos?.date_created
      if (!dateRef) continue
      const cohortKey = startOfMonth(dateRef)
      const existing = byCohort.get(cohortKey) ?? []
      existing.push(opp)
      byCohort.set(cohortKey, existing)
    }

    const rows: VendasCohortRow[] = []

    for (const [cohort_mes, cohortOpps] of byCohort.entries()) {
      const leads_count = cohortOpps.length
      const mqls = countUniqueMqls(cohortOpps)
      const agendados_vendas = cohortOpps.filter((o) => !!o.data_agendamento_vendas).length
      const reunioes = cohortOpps.filter((o) => !!o.data_realizacao_vendas).length
      const no_shows = cohortOpps.filter((o) => !!o.data_no_show_vendas && !o.data_realizacao_vendas).length
      const negociacao = cohortOpps.filter((o) => !!o.data_negociacao).length
      const fechados = cohortOpps.filter((o) => paymentDateMap.has(o.id)).length
      const faturamento = cohortOpps.reduce((sum, o) => sum + (revMap.get(o.id)?.faturado ?? 0), 0)
      const caixa = cohortOpps.reduce((sum, o) => sum + (revMap.get(o.id)?.entrada ?? 0), 0)

      rows.push({
        cohort_mes,
        cohort_label: formatCohortLabel(cohort_mes),
        leads: cohortOpps,
        leads_count,
        mqls,
        mqls_pct: leads_count > 0 ? Math.round((mqls / leads_count) * 100) : 0,
        agendados_vendas,
        agendados_vendas_pct: leads_count > 0 ? Math.round((agendados_vendas / leads_count) * 100) : 0,
        reunioes,
        reunioes_pct: agendados_vendas > 0 ? Math.round((reunioes / agendados_vendas) * 100) : 0,
        no_shows,
        no_shows_pct: agendados_vendas > 0 ? Math.round((no_shows / agendados_vendas) * 100) : 0,
        negociacao,
        negociacao_pct: reunioes > 0 ? Math.round((negociacao / reunioes) * 100) : 0,
        fechados,
        fechados_pct: reunioes > 0 ? Math.round((fechados / reunioes) * 100) : 0,
        faturamento,
        caixa,
      })
    }

    // Sort descending
    rows.sort((a, b) => b.cohort_mes.localeCompare(a.cohort_mes))

    // Bound to period
    const startMonth = `${startDate.slice(0, 7)}-01`
    const endMonth = `${endDate.slice(0, 7)}-01`
    const boundedRows = rows.filter(r => r.cohort_mes >= startMonth && r.cohort_mes <= endMonth)

    // Averages for color coding
    const nonEmpty = boundedRows.filter((r) => r.leads_count > 0)
    const avg = (fn: (r: VendasCohortRow) => number) =>
      nonEmpty.length > 0 ? nonEmpty.reduce((s, r) => s + fn(r), 0) / nonEmpty.length : 0

    return {
      rows: boundedRows,
      avgAgendadosVendas: avg((r) => r.agendados_vendas_pct),
      avgReunioes: avg((r) => r.reunioes_pct),
      avgNoShows: avg((r) => r.no_shows_pct),
      avgNegociacao: avg((r) => r.negociacao_pct),
      avgFechados: avg((r) => r.fechados_pct),
    }
  }, [opps, revenueRows, startDate, endDate])
}
