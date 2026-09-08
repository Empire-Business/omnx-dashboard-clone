import { useMemo } from 'react'
import type { OppRow, RevenueRow } from './useTrafego'
import { buildPaymentDateMap, countUniqueMqls, faturamentoDaVenda } from './useTrafego'
import { tsToSPDate } from '@/lib/utils/dates'

// ─── Types ────────────────────────────────────────────────────

export interface CohortRow {
  cohort_mes: string        // 'YYYY-MM-DD' (first day of month)
  cohort_label: string      // 'Jan/26'
  leads: OppRow[]
  leads_count: number
  mqls: number
  mqls_pct: number          // % of leads
  conectados: number
  conectados_pct: number    // % of mqls
  agendados: number
  agendados_pct: number     // % of mqls
  reunioes: number
  reunioes_pct: number      // % of agendados
  fechados: number
  fechados_pct: number      // % of reunioes
  // Lista por tras do numero de "Fechados" — mesma regua do numero (data_pagamento_entrada).
  // Sem isto o modal listava por data_fechado e divergia da celula.
  fechados_leads?: OppRow[]
  faturamento: number
}

export interface CohortData {
  rows: CohortRow[]
  avgConectados: number
  avgAgendados: number
  avgReuniao: number
  avgFechados: number
}

// ─── Helpers ─────────────────────────────────────────────────

function formatCohortLabel(dateStr: string): string {
  // dateStr é sempre 'YYYY-MM-DD' (primeiro dia do mês gerado por startOfMonth).
  // new Date('YYYY-MM-DD') interpreta como midnight UTC → shift -3h em SP → mês errado.
  // Construtor com (year, month, day) usa horário local, sem ambiguidade de timezone.
  const [year, month] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, 1)
  return d.toLocaleDateString('pt-BR', {
    month: 'short',
    year: '2-digit',
  }).replace('.', '').replace(' ', '/')
}

function startOfMonth(dateStr: string): string {
  // data_lead_recebido é TIMESTAMPTZ — converter para data em SP antes de extrair mês.
  // Ex: '2026-03-01T00:30:00Z' = 28/fev às 21:30 SP → pertence a fevereiro.
  const spDate = tsToSPDate(dateStr)
  return `${spDate.slice(0, 7)}-01`
}

// ─── Hook ─────────────────────────────────────────────────────

export function useCohort(
  opps: OppRow[],
  revenueRows: RevenueRow[],
  startDate: string,
  endDate: string,
): CohortData {
  return useMemo(() => {
    if (!opps.length) {
      return { rows: [], avgConectados: 0, avgAgendados: 0, avgReuniao: 0, avgFechados: 0 }
    }

    // Build revenue map: opp_id -> faturamento
    const revMap = new Map<string, number>()
    for (const r of revenueRows) {
      revMap.set(r.oportunidade_id, (revMap.get(r.oportunidade_id) ?? 0) + faturamentoDaVenda(r))
    }

    // Mapa de pagamento: só opps com data_pagamento_entrada preenchida contam como "fechados"
    const paymentDateMap = buildPaymentDateMap(revenueRows)

    // Group opps by cohort month — usa data_lead_recebido, a mesma régua do
    // filtro de período (filterByLeadDate). Fallback para contatos.date_created
    // quando ela é nula. A precedência era a inversa; com o filtro passando a
    // recortar por data do lead, manter o agrupamento por data do contato
    // colocaria um lead filtrado como "julho" na linha de cohort de outro mês.
    const byCohort = new Map<string, OppRow[]>()

    for (const opp of opps) {
      const dateStr = opp.data_lead_recebido ?? opp.contatos?.date_created
      if (!dateStr) {
        continue
      }
      const cohortKey = startOfMonth(dateStr)
      const existing = byCohort.get(cohortKey) ?? []
      existing.push(opp)
      byCohort.set(cohortKey, existing)
    }

    const rows: CohortRow[] = []

    for (const [cohort_mes, cohortOpps] of byCohort.entries()) {
      const leads_count = cohortOpps.length
      const mqls = countUniqueMqls(cohortOpps)
      const conectados = cohortOpps.filter((o) => !!o.data_conectado).length
      const agendados  = cohortOpps.filter((o) => !!o.data_agendamento_reuniao).length
      const reunioes   = cohortOpps.filter((o) => !!o.data_realizacao_vendas).length
      const fechados_leads = cohortOpps.filter((o) => paymentDateMap.has(o.id))
      const fechados   = fechados_leads.length
      const faturamento = cohortOpps.reduce((sum, o) => sum + (revMap.get(o.id) ?? 0), 0)

      rows.push({
        cohort_mes,
        cohort_label: formatCohortLabel(cohort_mes),
        leads: cohortOpps,
        leads_count,
        mqls,
        mqls_pct: leads_count > 0 ? Math.round((mqls / leads_count) * 100) : 0,
        conectados,
        conectados_pct: leads_count > 0 ? Math.round((conectados / leads_count) * 100) : 0,
        agendados,
        agendados_pct: mqls > 0 ? Math.round((agendados / mqls) * 100) : 0,
        reunioes,
        reunioes_pct: agendados > 0 ? Math.round((reunioes / agendados) * 100) : 0,
        fechados,
        fechados_pct: reunioes > 0 ? Math.round((fechados / reunioes) * 100) : 0,
        fechados_leads,
        faturamento,
      })
    }

    // Sort by cohort descending (most recent first)
    rows.sort((a, b) => b.cohort_mes.localeCompare(a.cohort_mes))

    // Safety net: garantir que só aparecem meses dentro do período selecionado
    const startMonth = `${startDate.slice(0, 7)}-01`
    const endMonth = `${endDate.slice(0, 7)}-01`
    const boundedRows = rows.filter(r => r.cohort_mes >= startMonth && r.cohort_mes <= endMonth)

    // Compute averages for color coding
    const nonEmpty = boundedRows.filter((r) => r.leads_count > 0)
    const avg = (fn: (r: CohortRow) => number) =>
      nonEmpty.length > 0 ? nonEmpty.reduce((s, r) => s + fn(r), 0) / nonEmpty.length : 0


    return {
      rows: boundedRows,
      avgConectados: avg((r) => r.conectados_pct),
      avgAgendados: avg((r) => r.agendados_pct),
      avgReuniao: avg((r) => r.reunioes_pct),
      avgFechados: avg((r) => r.fechados_pct),
    }
  }, [opps, revenueRows, startDate, endDate])
}
