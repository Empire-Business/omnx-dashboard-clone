import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { applyRecuperacaoFilter, RECUPERACAO_MODE_DEFAULT, type RecuperacaoMode, type RecuperacaoQueryLike } from '@/lib/constants'
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import type { OppRow, RevenueRow, TrafegoFilters } from './useTrafego'
import { parseTags, buildPaymentDateMap, filterUniqueMqls, faturamentoDaVenda } from './useTrafego'
import { isFilterActive } from '@/types/filters'

// ─── Types ────────────────────────────────────────────────────

export interface ProducaoRow {
  mes: string             // 'YYYY-MM-DD' (primeiro dia do mês de produção)
  mes_label: string       // 'Mar/26'
  leads_gerados: OppRow[]
  leads_mqls: OppRow[]
  leads_conectados: OppRow[]
  leads_agendados: OppRow[]
  leads_reunioes: OppRow[]
  leads_fechados: OppRow[]
  leads: number
  mqls: number
  conectados: number
  agendados: number
  reunioes: number
  fechados: number
  faturamento: number
}

export interface ProducaoTotals {
  leads: number
  mqls: number
  conectados: number
  agendados: number
  reunioes: number
  fechados: number
  faturamento: number
}

export interface ProducaoResult {
  rows: ProducaoRow[]
  totals: ProducaoTotals
}

export interface ProducaoData {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  loading: boolean
  error: string | null
}

// ─── Helpers ─────────────────────────────────────────────────

function formatMesLabel(mes: string): string {
  // mes é sempre 'YYYY-MM-DD' (primeiro dia do mês)
  const [year, month] = mes.split('-').map(Number)
  const d = new Date(year, month - 1, 1)
  return d
    .toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
    .replace('.', '')
    .replace(' ', '/')
}

function isDateInRange(dateStr: string | null | undefined, startDate: string, endDate: string): boolean {
  return !!dateStr && dateStr >= startDate && dateStr <= endDate
}

// ─── Compute (função pura, sem hook) ─────────────────────────

/**
 * Dado um array de oportunidades e receitas, constrói a tabela de
 * Produtividade: cada linha é um MÊS, e cada coluna conta eventos que
 * ACONTECERAM naquele mês (independente de quando o lead foi gerado).
 *
 * Diferença fundamental em relação ao Cohort:
 * - Cohort: agrupa por data_lead_recebido (quando o lead entrou)
 * - Produtividade: agrupa por data do evento (quando cada etapa aconteceu)
 */
export function computeProducao(
  opps: OppRow[],
  revenueRows: RevenueRow[],
  startDate: string,
  endDate: string,
): ProducaoResult {
  // Mapa de receita por oportunidade
  const revMap = new Map<string, number>()
  for (const r of revenueRows) {
    revMap.set(r.oportunidade_id, (revMap.get(r.oportunidade_id) ?? 0) + faturamentoDaVenda(r))
  }

  // Mapa de pagamento: critério de "fechado" = data_pagamento_entrada preenchida
  const paymentDateMap = buildPaymentDateMap(revenueRows)

  // Gera lista de meses entre startDate e endDate
  const months: string[] = []
  let [y, m] = startDate.slice(0, 7).split('-').map(Number)
  const [endY, endM] = endDate.slice(0, 7).split('-').map(Number)
  while (y < endY || (y === endY && m <= endM)) {
    months.push(`${y}-${String(m).padStart(2, '0')}-01`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }

  const rows: ProducaoRow[] = months.map((mes) => {
    const prefix = mes.slice(0, 7) // 'YYYY-MM'

    // Cada coluna filtra independentemente pelo campo de data do próprio evento
    const leads_gerados = opps.filter((o) => {
      const leadDate = o.data_lead_recebido?.slice(0, 10) ?? null
      return leadDate ? leadDate.startsWith(prefix) : false
    })
    // Unico por contato — MQL e tag do contato, nao da oportunidade.
    const leads_mqls = filterUniqueMqls(leads_gerados)
    const leads_conectados = opps.filter((o) => o.data_conectado?.startsWith(prefix) ?? false)
    const leads_agendados = opps.filter(
      (o) => o.data_agendamento_reuniao?.startsWith(prefix) ?? false,
    )
    const leads_reunioes = opps.filter(
      (o) => o.data_realizacao_vendas?.startsWith(prefix) ?? false,
    )
    // Fechados = opps cuja data_pagamento_entrada cai neste mês (não data_fechado)
    const leads_fechados = opps.filter((o) => {
      const payDate = paymentDateMap.get(o.id)
      return payDate ? payDate.startsWith(prefix) : false
    })
    const faturamento = leads_fechados.reduce((s, o) => s + (revMap.get(o.id) ?? 0), 0)

    return {
      mes,
      mes_label: formatMesLabel(mes),
      leads_gerados,
      leads_mqls,
      leads_conectados,
      leads_agendados,
      leads_reunioes,
      leads_fechados,
      leads: leads_gerados.length,
      mqls: leads_mqls.length,
      conectados: leads_conectados.length,
      agendados: leads_agendados.length,
      reunioes: leads_reunioes.length,
      fechados: leads_fechados.length,
      faturamento,
    }
  })

  // Mais recente primeiro
  rows.sort((a, b) => b.mes.localeCompare(a.mes))

  const totals = rows.reduce<ProducaoTotals>(
    (acc, r) => ({
      leads: acc.leads + r.leads,
      mqls: acc.mqls + r.mqls,
      conectados: acc.conectados + r.conectados,
      agendados: acc.agendados + r.agendados,
      reunioes: acc.reunioes + r.reunioes,
      fechados: acc.fechados + r.fechados,
      faturamento: acc.faturamento + r.faturamento,
    }),
    { leads: 0, mqls: 0, conectados: 0, agendados: 0, reunioes: 0, fechados: 0, faturamento: 0 },
  )

  return { rows, totals }
}

// ─── OPP_SELECT (idêntico ao useTrafego) ─────────────────────

const OPP_SELECT = `
  id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
  lost_reason, vendedor_closer, status, sdr_name,
  data_lead_recebido, data_conectado, data_qualificado,
  data_no_show, data_agendamento_reuniao,
  data_realizacao_vendas, data_fechado,
  data_perdido, data_perdido_vendas, data_negociacao,
  data_no_show_vendas, data_agendamento_vendas,
  data_pendencias_preenchimento,
  resumo_ia, percepcao_closer,
  contatos!inner(
    ghl_id, nome, email, telefone,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    fbclid, gclid,
    tt_source, tt_campaign, tt_medium, tt_term, tt_content,
    owner_name, owner_email, date_created, print_instagram,
    como_nos_conheceu, faturamento_anual, perfil_inteligente,
    tags,
    workspace_id
  )
`

// Entrada utm_campaigns necessária para filtros de funil/cp
interface UtmCampaignEntry {
  nome: string
  utm_campaign: string
  funnels: unknown
  page_code: string | null
}

// ─── Hook principal ───────────────────────────────────────────

/**
 * Retorna uma referência estável para `value` que só muda quando `serialized`
 * muda — evita refetch quando o caller recria o objeto a cada render com o
 * mesmo conteúdo.
 */
function useDeepCompareValue<T>(value: T, serialized: string): T {
  const [stable, setStable] = useState<{ json: string; value: T }>({ json: serialized, value })
  if (stable.json !== serialized) {
    setStable({ json: serialized, value })
  }
  return stable.value
}

/**
 * Busca oportunidades do pipeline relevante e mantém no dataset de produtividade
 * qualquer lead que tenha sinal no período:
 * - geração do lead no período (para métricas informativas, como MQL)
 * - OU algum evento operacional no período
 * - OU pagamento confirmado no período
 *
 * Assim, os eventos deixam de ser limitados por `data_lead_recebido`.
 *
 * @param filters  - Mesmos filtros do Painel Cohort (datas, canal, funil, etc.)
 * @param enabled  - Quando false, não faz nenhuma requisição (lazy loading)
 * @param recuperacaoMode - Mesmo filtro de Recuperação das outras abas (preferência da conta)
 */
export function useProducao(
  filters: TrafegoFilters,
  enabled: boolean,
  recuperacaoMode: RecuperacaoMode = RECUPERACAO_MODE_DEFAULT,
): ProducaoData {
  const [opps, setOpps] = useState<OppRow[]>([])
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Referência estável dos filtros que disparam o fetch (compara por conteúdo)
  const filtersStable = useDeepCompareValue(
    filters,
    JSON.stringify({
      s: filters.startDate,
      e: filters.endDate,
      ch: filters.channels,
      ft: filters.funilTags,
      ct: filters.cpTags,
      ad: filters.ads,
      ca: filters.campaigns,
    }),
  )

  useEffect(() => {
    if (!enabled) return

    const filters = filtersStable
    let cancelled = false
    setLoading(true)
    setError(null)

    async function loadData() {
      try {
        const wid = await getWorkspaceId()
        if (!wid) {
          console.warn('[useProducao] No workspace found')
          return
        }

        const { startDate, endDate } = filters

        // ── Busca utm_sources e utm_campaigns ──
        const [sourcesRes, campaignsRes] = await Promise.all([
          supabase.from('utm_sources').select('utm_source, public_code').eq('workspace_id', wid),
          supabase.from('utm_campaigns').select('nome, utm_campaign, funnels, page_code').eq('workspace_id', wid),
        ])
        if (cancelled) return
        if (sourcesRes.error) throw sourcesRes.error
        if (campaignsRes.error) throw campaignsRes.error

        const sourcesData = (sourcesRes.data ?? []) as {
          utm_source: string
          public_code: string | null
        }[]
        const utmCampaigns = (campaignsRes.data ?? []) as UtmCampaignEntry[]
        const pagoSources = sourcesData.map((s) => s.utm_source).filter(Boolean)

        const startISO = toSPISOStart(startDate)
        const endISO = toSPISOEnd(endDate)

        const PAGE_SIZE = 1000
        let allRows: OppRow[] = []
        let page = 0
        while (true) {
          const baseQuery = supabase
            .from('oportunidades')
            .select(OPP_SELECT)
            .eq('workspace_id', wid)
          const res = await (
            applyRecuperacaoFilter(
              baseQuery as unknown as RecuperacaoQueryLike,
              recuperacaoMode,
            ) as unknown as typeof baseQuery
          )
            .order('id', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          if (cancelled) return
          if (res.error) throw res.error
          const pageRows = (res.data ?? []) as unknown as OppRow[]
          allRows = allRows.concat(pageRows)
          if (pageRows.length < PAGE_SIZE) break
          page++
        }

        // ── Filtro de tráfego pago (utm_source registrado) ──
        let dimensionRows = allRows
        if (pagoSources.length > 0) {
          const pagoSet = new Set(pagoSources)
          dimensionRows = dimensionRows.filter((r) => {
            const src = r.contatos?.utm_source
            return src != null && src !== '' && pagoSet.has(src)
          })
        }

        // ── Filtros dimensionais (canal, funil, campanha [cp], anúncio, campanha Meta) ──
        if (isFilterActive(filters.channels)) {
          dimensionRows = dimensionRows.filter((r) => {
            const src = r.contatos?.utm_source ?? ''
            if (filters.channels.exclude.includes(src)) return false
            if (filters.channels.include.length > 0) return filters.channels.include.includes(src)
            return true
          })
        }

        if (isFilterActive(filters.funilTags)) {
          const includeCodes = filters.funilTags.include.length > 0
            ? new Set(utmCampaigns.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.include.includes(f))).map((c) => String(c.utm_campaign)))
            : null
          const excludeCodes = filters.funilTags.exclude.length > 0
            ? new Set(utmCampaigns.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.exclude.includes(f))).map((c) => String(c.utm_campaign)))
            : null
          if (includeCodes !== null && includeCodes.size === 0) {
            dimensionRows = []
          } else {
            dimensionRows = dimensionRows.filter((r) => {
              const uc = r.contatos?.utm_campaign
              const code = uc != null ? String(uc) : ''
              if (excludeCodes && excludeCodes.has(code)) return false
              if (includeCodes !== null) return includeCodes.has(code)
              return true
            })
          }
        }

        if (isFilterActive(filters.cpTags)) {
          const includeCodes = filters.cpTags.include.length > 0
            ? new Set(utmCampaigns.filter((c) => filters.cpTags.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          const excludeCodes = filters.cpTags.exclude.length > 0
            ? new Set(utmCampaigns.filter((c) => filters.cpTags.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          if (includeCodes !== null && includeCodes.size === 0) {
            dimensionRows = []
          } else {
            dimensionRows = dimensionRows.filter((r) => {
              const uc = r.contatos?.utm_campaign
              const code = uc != null ? String(uc) : ''
              if (excludeCodes && excludeCodes.has(code)) return false
              if (includeCodes !== null) return includeCodes.has(code)
              return true
            })
          }
        }

        if (isFilterActive(filters.ads)) {
          dimensionRows = dimensionRows.filter((r) => {
            const term = r.contatos?.utm_term ?? ''
            if (filters.ads.exclude.includes(term)) return false
            if (filters.ads.include.length > 0) return filters.ads.include.includes(term)
            return true
          })
        }

        if (isFilterActive(filters.campaigns)) {
          const includeCodes = filters.campaigns.include.length > 0
            ? new Set(utmCampaigns.filter((c) => filters.campaigns.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          const excludeCodes = filters.campaigns.exclude.length > 0
            ? new Set(utmCampaigns.filter((c) => filters.campaigns.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          if (includeCodes !== null && includeCodes.size === 0) {
            dimensionRows = []
          } else {
            dimensionRows = dimensionRows.filter((r) => {
              const uc = r.contatos?.utm_campaign
              const code = uc != null ? String(uc) : ''
              if (excludeCodes && excludeCodes.has(code)) return false
              if (includeCodes !== null) return includeCodes.has(code)
              return true
            })
          }
        }

        // ── Busca receita para as oportunidades filtradas dimensionalmente ──
        const oppIdsSet = new Set(dimensionRows.map((o) => o.id))
        let filteredRevenue: RevenueRow[] = []
        if (oppIdsSet.size > 0) {
          // Paginado (.range): a receita do período pode passar de 1000 linhas (§4.6).
          let revPage = 0
          const revAcc: RevenueRow[] = []
          while (true) {
            const revRes = await supabase
              .from('vendas_fechamento')
              .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada')
              .eq('workspace_id', wid)
              .gte('data_pagamento_entrada', startISO)
              .lte('data_pagamento_entrada', endISO)
              .order('id')
              .range(revPage * PAGE_SIZE, (revPage + 1) * PAGE_SIZE - 1)
            if (cancelled) return
            if (revRes.error) throw revRes.error
            const batch = (revRes.data ?? []) as RevenueRow[]
            revAcc.push(...batch)
            if (batch.length < PAGE_SIZE) break
            revPage++
          }
          filteredRevenue = revAcc.filter((r) => oppIdsSet.has(r.oportunidade_id))
        }

        const paymentDateMap = buildPaymentDateMap(filteredRevenue)
        const rows = dimensionRows.filter((row) => {
          const leadDate = row.data_lead_recebido?.slice(0, 10) ?? null
          const payDate = paymentDateMap.get(row.id) ?? null
          return (
            isDateInRange(leadDate, startDate, endDate) ||
            isDateInRange(row.data_conectado, startDate, endDate) ||
            isDateInRange(row.data_agendamento_reuniao, startDate, endDate) ||
            isDateInRange(row.data_realizacao_vendas, startDate, endDate) ||
            isDateInRange(payDate, startDate, endDate)
          )
        })

        setOpps(rows)
        setRevenueRows(filteredRevenue)
      } catch (err) {
        if (!cancelled) {
          console.error('[useProducao] error', err)
          setError(err instanceof Error ? err.message : 'Erro ao carregar dados de produtividade')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [enabled, filtersStable, recuperacaoMode])

  return { opps, revenueRows, loading, error }
}
