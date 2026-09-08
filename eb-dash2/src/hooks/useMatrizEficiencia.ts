import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import type { CohortRow } from './useCohort'
import type { OppRow, RevenueRow } from './useTrafego'
import {
  buildCampaignFunnelMap,
  buildCampaignNameMap,
  buildPaymentDateMap,
  countUniqueMqls,
  faturamentoDaVenda,
} from './useTrafego'

// ─── Tipos ──────────────────────────────────────────────────────

export type MatrizEficienciaDimensao = 'funil' | 'campanha'

export interface MatrizEficienciaData {
  funilRows: CohortRow[]
  campanhaRows: CohortRow[]
  avgConectados: number
  avgAgendados: number
  avgReuniao: number
  avgFechados: number
  loading: boolean
  error: string | null
}

const SEM_FUNIL = 'Sem funil'
const SEM_CAMPANHA = 'Sem campanha'

// ─── Helper: constrói uma linha CohortRow a partir de um grupo de opps ──
// Reaproveita exatamente a mesma fórmula de useCohort.ts (mqls_pct % de leads,
// conectados_pct % de leads, agendados_pct % de mqls, reunioes_pct % de agendados,
// fechados_pct % de reunioes) para que a coloração por desvio da média (cellColor)
// signifique a mesma coisa em toda a app.
function buildRow(
  key: string,
  label: string,
  groupOpps: OppRow[],
  revMap: Map<string, number>,
  paymentDateMap: Map<string, string>,
): CohortRow {
  const leads_count = groupOpps.length
  const mqls = countUniqueMqls(groupOpps)
  const conectados = groupOpps.filter((o) => !!o.data_conectado).length
  const agendados = groupOpps.filter((o) => !!o.data_agendamento_reuniao).length
  const reunioes = groupOpps.filter((o) => !!o.data_realizacao_vendas).length
  const fechados = groupOpps.filter((o) => paymentDateMap.has(o.id)).length
  const faturamento = groupOpps.reduce((sum, o) => sum + (revMap.get(o.id) ?? 0), 0)

  return {
    cohort_mes: key,
    cohort_label: label,
    leads: groupOpps,
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
    faturamento,
  }
}

/**
 * Matriz de Eficiência — agrupa os leads já filtrados pelo período (opps)
 * por funil (via contatos.utm_campaign → utm_campaigns.funnels, regra do
 * CLAUDE.md "Funis — Mapeamento via utm_campaign") e por campanha
 * (utm_campaigns.nome), comparando a eficiência de conversão entre eles.
 *
 * Só aparecem funis/campanhas com pelo menos 1 lead no período — porque as
 * linhas nascem dos opps já filtrados pela página chamadora, nunca de um
 * catálogo fixo. Isso implementa a regra "só dados != 0 no período" sem
 * filtro extra: um funil sem lead no período nunca gera uma linha.
 */
export function useMatrizEficiencia(opps: OppRow[], revenueRows: RevenueRow[]): MatrizEficienciaData {
  const [campaigns, setCampaigns] = useState<{ nome: string; utm_campaign: string; funnels: unknown }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const wid = await getWorkspaceId()
        if (!wid) throw new Error('Conta não encontrada')
        const res = await supabase
          .from('utm_campaigns')
          .select('nome, utm_campaign, funnels')
          .eq('workspace_id', wid)
        if (res.error) throw res.error
        if (!cancelled) setCampaigns((res.data ?? []) as { nome: string; utm_campaign: string; funnels: unknown }[])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao carregar campanhas')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  const campaignFunnelMap = useMemo(() => buildCampaignFunnelMap(campaigns), [campaigns])
  const campaignNameMap = useMemo(() => buildCampaignNameMap(campaigns), [campaigns])

  const result = useMemo(() => {
    const revMap = new Map<string, number>()
    for (const r of revenueRows) {
      revMap.set(r.oportunidade_id, (revMap.get(r.oportunidade_id) ?? 0) + faturamentoDaVenda(r))
    }
    const paymentDateMap = buildPaymentDateMap(revenueRows)

    // ── Agrupamento por funil (um lead pode entrar em mais de um funil) ──
    const byFunil = new Map<string, OppRow[]>()
    for (const opp of opps) {
      const code = opp.contatos?.utm_campaign != null ? String(opp.contatos.utm_campaign) : ''
      const funnels = campaignFunnelMap.get(code) ?? []
      const keys = funnels.length > 0 ? funnels : [SEM_FUNIL]
      for (const key of keys) {
        const existing = byFunil.get(key) ?? []
        existing.push(opp)
        byFunil.set(key, existing)
      }
    }
    const funilRows = Array.from(byFunil.entries())
      .map(([key, groupOpps]) => buildRow(key, key, groupOpps, revMap, paymentDateMap))
      .sort((a, b) => b.leads_count - a.leads_count)

    // ── Agrupamento por campanha ──
    const byCampanha = new Map<string, OppRow[]>()
    for (const opp of opps) {
      const code = opp.contatos?.utm_campaign != null ? String(opp.contatos.utm_campaign) : ''
      const nome = code ? (campaignNameMap.get(code) ?? code) : SEM_CAMPANHA
      const existing = byCampanha.get(nome) ?? []
      existing.push(opp)
      byCampanha.set(nome, existing)
    }
    const campanhaRows = Array.from(byCampanha.entries())
      .map(([key, groupOpps]) => buildRow(key, key, groupOpps, revMap, paymentDateMap))
      .sort((a, b) => b.leads_count - a.leads_count)

    // ── Médias para coloração por desvio (mesmo cálculo de useCohort.ts) ──
    const avg = (rows: CohortRow[], fn: (r: CohortRow) => number) => {
      const nonEmpty = rows.filter((r) => r.leads_count > 0)
      return nonEmpty.length > 0 ? nonEmpty.reduce((s, r) => s + fn(r), 0) / nonEmpty.length : 0
    }
    // Média combinada (funil + campanha) — usada nas duas tabelas, para consistência.
    const allRows = [...funilRows, ...campanhaRows]

    return {
      funilRows,
      campanhaRows,
      avgConectados: avg(allRows, (r) => r.conectados_pct),
      avgAgendados: avg(allRows, (r) => r.agendados_pct),
      avgReuniao: avg(allRows, (r) => r.reunioes_pct),
      avgFechados: avg(allRows, (r) => r.fechados_pct),
    }
  }, [opps, revenueRows, campaignFunnelMap, campaignNameMap])

  return { ...result, loading, error }
}
