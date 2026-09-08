import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toSPISOStart, toSPISOEnd, tsToSPDate } from '@/lib/utils/dates'
import { applyRecuperacaoFilter } from '@/lib/constants'
import { countUniqueMqls } from './useTrafego'
import type { OppRow } from './useTrafego'
import type { CohortRow, CohortData } from './useCohort'

// ─── Helpers ─────────────────────────────────────────────────

function formatCohortLabel(dateStr: string): string {
  const [year, month] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, 1)
  return d
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('.', '')
    .replace(' ', '/')
}

function getMonthKey(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`
}

function generateMonthRange(startDate: string, endDate: string): string[] {
  const months: string[] = []
  const [sy, sm] = startDate.split('-').map(Number)
  const [ey, em] = endDate.split('-').map(Number)
  let y = sy
  let m = sm
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return months
}

// ─── Types (internal) ────────────────────────────────────────

interface EventOpp {
  id: string
  data_conectado: string | null
  data_agendamento_reuniao: string | null
  data_realizacao_vendas: string | null
  sdr_name: string | null
  contatos: { owner_name: string | null } | null
}

interface RevRow {
  oportunidade_id: string
  valor_faturado: number
  data_pagamento_entrada: string
}

interface PaidOppCheck {
  id: string
  sdr_name: string | null
}

// ─── Hook ────────────────────────────────────────────────────

/**
 * Retorna uma referência estável para `value` que só muda quando `serialized`
 * muda — evita refetch/recompute quando o caller recria o objeto a cada render
 * com o mesmo conteúdo.
 */
function useDeepCompareValue<T>(value: T, serialized: string): T {
  const [stable, setStable] = useState<{ json: string; value: T }>({ json: serialized, value })
  if (stable.json !== serialized) {
    setStable({ json: serialized, value })
  }
  return stable.value
}

/**
 * PRODUTIVIDADE MATRIX — cada coluna conta eventos que ACONTECERAM no mês,
 * respeitando apenas os filtros ativos do painel.
 *
 * Diferença:
 *   COHORT       → agrupa por mês de data_lead_recebido; conta eventos sem filtro de data
 *   PRODUTIVIDADE → cada coluna agrupa pelo mês do próprio evento
 *
 * Quando a UI precisar exibir "Leads/MQLs" em produtividade, esses números são apenas informativos.
 * Eles não podem limitar nenhuma etapa operacional.
 */
export function useProdutividadeMatrix(
  cohortOpps: OppRow[],
  startDate: string,
  endDate: string,
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao',
  sdrNames: Set<string>,
  enabled: boolean,
): CohortData & { loading: boolean; error: string | null } {
  const [eventOpps, setEventOpps] = useState<EventOpp[]>([])
  const [revByMonth, setRevByMonth] = useState<
    Map<string, { count: number; sum: number }>
  >(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Referência estável: só dispara o effect quando o CONTEÚDO do Set muda
  const stableSdrNames = useDeepCompareValue(sdrNames, JSON.stringify([...sdrNames].sort()))

  useEffect(() => {
    if (!enabled || !startDate || !endDate) {
      setEventOpps([])
      setRevByMonth(new Map())
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) throw new Error('Conta não encontrada')

        // ── Step 1: Opps do pipeline relevante ──
        // Em produtividade, a base não é limitada por data_lead_recebido.
        const allEvents: EventOpp[] = []
        const PAGE_SIZE = 1000
        let page = 0
        while (true) {
          let q = supabase
            .from('oportunidades')
            .select(
              'id, data_conectado, data_agendamento_reuniao, data_realizacao_vendas, sdr_name, contatos(owner_name)',
            )
            .eq('workspace_id', wid)
          q = applyRecuperacaoFilter(q, pipelineMode)
          const res = await q
            .order('id')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          if (cancelled) return
          if (res.error) throw res.error
          allEvents.push(...((res.data ?? []) as unknown as EventOpp[]))
          if ((res.data?.length ?? 0) < PAGE_SIZE) break
          page++
        }

        // ── Step 2: Revenue (data_pagamento_entrada in range) ──
        const startISO = toSPISOStart(startDate)
        const endISO = toSPISOEnd(endDate)

        const rawRevRows: RevRow[] = []
        {
          const REV_PAGE_SIZE = 1000
          let revPage = 0
          while (true) {
            const revRes = await supabase
              .from('vendas_fechamento')
              .select('oportunidade_id, valor_faturado, data_pagamento_entrada')
              .eq('workspace_id', wid)
              .gte('data_pagamento_entrada', startISO)
              .lte('data_pagamento_entrada', endISO)
              .order('oportunidade_id')
              .range(revPage * REV_PAGE_SIZE, (revPage + 1) * REV_PAGE_SIZE - 1)
            if (cancelled) return
            if (revRes.error) throw revRes.error
            rawRevRows.push(...((revRes.data ?? []) as RevRow[]))
            if ((revRes.data?.length ?? 0) < REV_PAGE_SIZE) break
            revPage++
          }
        }

        // Check pipeline + SDR for paid opps
        const paidOppIds = [
          ...new Set(rawRevRows.map((r) => r.oportunidade_id).filter(Boolean)),
        ]
        const validPaidSet = new Set<string>()

        if (paidOppIds.length > 0) {
          const BATCH = 100
          for (let i = 0; i < paidOppIds.length; i += BATCH) {
            const batch = paidOppIds.slice(i, i + BATCH)
            let q = supabase
              .from('oportunidades')
              .select('id, sdr_name')
              .in('id', batch)
            q = applyRecuperacaoFilter(q, pipelineMode)
            const res = await q
            if (cancelled) return
            if (res.error) throw res.error
            for (const r of (res.data ?? []) as unknown as PaidOppCheck[]) {
              const owner = r.sdr_name ?? ''
              if (stableSdrNames.size === 0 || stableSdrNames.has(owner)) {
                validPaidSet.add(r.id)
              }
            }
          }
        }

        // Group valid revenue by month
        const monthRev = new Map<string, { count: number; sum: number }>()
        for (const r of rawRevRows) {
          if (!validPaidSet.has(r.oportunidade_id)) continue
          const spDate = tsToSPDate(r.data_pagamento_entrada)
          const key = getMonthKey(spDate)
          const entry = monthRev.get(key) ?? { count: 0, sum: 0 }
          entry.count++
          entry.sum += r.valor_faturado ?? 0
          monthRev.set(key, entry)
        }

        if (!cancelled) {
          setEventOpps(allEvents)
          setRevByMonth(monthRev)
        }
      } catch (err) {
        console.error('[useProdutividadeMatrix] error', err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erro ao carregar')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [startDate, endDate, pipelineMode, stableSdrNames, enabled])

  return useMemo(() => {
    if (!enabled) {
      return {
        rows: [],
        avgConectados: 0,
        avgAgendados: 0,
        avgReuniao: 0,
        avgFechados: 0,
        loading,
        error,
      }
    }

    const months = generateMonthRange(startDate, endDate)

    // ── Leads received per month (from cohort opps, already SDR-filtered) ──
    const leadsByMonth = new Map<string, OppRow[]>()
    for (const opp of cohortOpps) {
      if (!opp.data_lead_recebido) continue
      const spDate = tsToSPDate(opp.data_lead_recebido)
      const key = getMonthKey(spDate)
      if (!leadsByMonth.has(key)) leadsByMonth.set(key, [])
      leadsByMonth.get(key)!.push(opp)
    }

    // ── Events per month (SDR-filtered) ──
    const conectadosByMonth = new Map<string, number>()
    const agendadosByMonth = new Map<string, number>()
    const reunioesByMonth = new Map<string, number>()

    for (const opp of eventOpps) {
      // SDR filter
      const owner = opp.sdr_name || opp.contatos?.owner_name || ''
      if (sdrNames.size > 0 && !sdrNames.has(owner)) continue

      if (
        opp.data_conectado &&
        opp.data_conectado >= startDate &&
        opp.data_conectado <= endDate
      ) {
        const key = getMonthKey(opp.data_conectado)
        conectadosByMonth.set(key, (conectadosByMonth.get(key) ?? 0) + 1)
      }
      if (
        opp.data_agendamento_reuniao &&
        opp.data_agendamento_reuniao >= startDate &&
        opp.data_agendamento_reuniao <= endDate
      ) {
        const key = getMonthKey(opp.data_agendamento_reuniao)
        agendadosByMonth.set(key, (agendadosByMonth.get(key) ?? 0) + 1)
      }
      if (
        opp.data_realizacao_vendas &&
        opp.data_realizacao_vendas >= startDate &&
        opp.data_realizacao_vendas <= endDate
      ) {
        const key = getMonthKey(opp.data_realizacao_vendas)
        reunioesByMonth.set(key, (reunioesByMonth.get(key) ?? 0) + 1)
      }
    }

    // ── Build matrix rows ──
    const rows: CohortRow[] = months
      .map((monthKey) => {
        const monthLeads = leadsByMonth.get(monthKey) ?? []
        const leads_count = monthLeads.length
        const mqls = countUniqueMqls(monthLeads)
        const conectados = conectadosByMonth.get(monthKey) ?? 0
        const agendados = agendadosByMonth.get(monthKey) ?? 0
        const reunioes = reunioesByMonth.get(monthKey) ?? 0
        const rev = revByMonth.get(monthKey) ?? { count: 0, sum: 0 }
        const fechados = rev.count
        const faturamento = rev.sum

        return {
          cohort_mes: monthKey,
          cohort_label: formatCohortLabel(monthKey),
          leads: monthLeads,
          leads_count,
          mqls,
          mqls_pct:
            leads_count > 0 ? Math.round((mqls / leads_count) * 100) : 0,
          conectados,
          conectados_pct:
            leads_count > 0
              ? Math.round((conectados / leads_count) * 100)
              : 0,
          agendados,
          agendados_pct:
            mqls > 0 ? Math.round((agendados / mqls) * 100) : 0,
          reunioes,
          reunioes_pct:
            agendados > 0 ? Math.round((reunioes / agendados) * 100) : 0,
          fechados,
          fechados_pct:
            reunioes > 0 ? Math.round((fechados / reunioes) * 100) : 0,
          faturamento,
        }
      })
      .sort((a, b) => b.cohort_mes.localeCompare(a.cohort_mes))

    // ── Compute averages for color coding ──
    const nonEmpty = rows.filter(
      (r) => r.leads_count > 0 || r.conectados > 0,
    )
    const avg = (fn: (r: CohortRow) => number) =>
      nonEmpty.length > 0
        ? nonEmpty.reduce((s, r) => s + fn(r), 0) / nonEmpty.length
        : 0

    return {
      rows,
      avgConectados: avg((r) => r.conectados_pct),
      avgAgendados: avg((r) => r.agendados_pct),
      avgReuniao: avg((r) => r.reunioes_pct),
      avgFechados: avg((r) => r.fechados_pct),
      loading,
      error,
    }
  }, [cohortOpps, eventOpps, revByMonth, startDate, endDate, sdrNames, enabled, loading, error])
}
