import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { applyRecuperacaoFilter, type RecuperacaoMode } from '@/lib/constants'
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'

import { fetchAllPagesByCursor } from '@/lib/supabase/paginate'
import { extractErrorMessage } from '@/lib/errors'
import { parseTags, isVendaExterna } from './useTrafego'
import { VENDA_DIRETA_CANAL } from './usePreVendas'
import type { OppRow, RevenueRow } from './useTrafego'
import type { PreVendasFilters } from './usePreVendas'
import { buildPaymentDateMap } from './useTrafego'
import { isFilterActive } from '@/types/filters'

// ─── OPP_SELECT (idêntico ao usePreVendas) ──────────────────

const OPP_SELECT = `
  id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
  lost_reason, vendedor_closer, status, sdr_name,
  data_lead_recebido, data_conectado, data_qualificado,
  data_no_show, data_agendamento_reuniao,
  data_realizacao_vendas, data_fechado,
  data_perdido, data_perdido_vendas, data_negociacao,
  data_no_show_vendas, data_agendamento_vendas,
  appointment_status,
  data_pendencias_preenchimento,
  resumo_ia, percepcao_closer,
  contatos(
    ghl_id, nome, email, telefone,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    fbclid, gclid,
    tt_source, tt_campaign, tt_medium, tt_term, tt_content,
    owner_name, owner_email, date_created, print_instagram,
    como_nos_conheceu, faturamento_anual, perfil_inteligente,
    tags, contact_source,
    workspace_id
  )
`

interface UtmCampaignEntry {
  nome: string
  utm_campaign: string
  funnels: unknown
}

export interface PreVendasProducaoData {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  loading: boolean
  error: string | null
}

function isDateInRange(dateStr: string | null | undefined, startDate: string, endDate: string): boolean {
  return !!dateStr && dateStr >= startDate && dateStr <= endDate
}

// ─── Hook ────────────────────────────────────────────────────

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
 * - geração do lead no período (uso apenas informativo)
 * - OU algum evento operacional no período
 * - OU pagamento confirmado no período
 *
 * @param filters       Filtros de Pré-Vendas (datas, sdr, closer, canal, funil, campanha)
 * @param pipelineMode  'exclude_recuperacao' para Pré-Vendas, 'only_recuperacao' para Recuperação
 * @param enabled       Quando false, não faz nenhuma requisição (lazy loading)
 */
export function usePreVendasProducao(
  filters: PreVendasFilters,
  pipelineMode: RecuperacaoMode,
  enabled: boolean,
): PreVendasProducaoData {
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
      sd: filters.sdrs,
      cl: filters.closers,
      ca: filters.canais,
      me: filters.mediums,
      ft: filters.funilTags,
      cp: filters.campanhas,
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
          console.warn('[usePreVendasProducao] No workspace found')
          return
        }

        const { startDate, endDate } = filters

        // Buscar utm_campaigns para filtros de funil/campanha
        const campaignsRes = await supabase
          .from('utm_campaigns')
          .select('nome, utm_campaign, funnels')
          .eq('workspace_id', wid)
        if (cancelled) return
        if (campaignsRes.error) throw campaignsRes.error
        const utmCampaigns = (campaignsRes.data ?? []) as UtmCampaignEntry[]

        const startISO = toSPISOStart(startDate)
        const endISO = toSPISOEnd(endDate)

        // Paginação por CURSOR, não por OFFSET.
        //
        // Com `.range()` cada página fica mais cara que a anterior — para entregar
        // a linha 5.000 o Postgres monta as 5.000 antes e descarta. Com o join de
        // ~25 colunas de contatos deste select, as páginas profundas passavam do
        // statement_timeout e o PostgREST devolvia 500: era a origem do "Erro ao
        // carregar dados de produtividade" (log do Postgres: "canceling statement
        // due to statement timeout", em série, nos offsets 2000/3000/4000/5000).
        const allRows = await fetchAllPagesByCursor<OppRow>(
          (cursor) => {
            let q = supabase
              .from('oportunidades')
              .select(OPP_SELECT)
              .eq('workspace_id', wid)
            q = applyRecuperacaoFilter(q, pipelineMode)
            // Na 1ª página não existe cursor e o filtro tem de ficar de fora:
            // `.gt('id', '')` vira `id=gt.` na URL e o PostgREST devolve 400,
            // porque string vazia não é uuid válido.
            if (cursor !== null) q = q.gt('id', cursor)
            return q
              .order('id', { ascending: true }) as unknown as { limit(n: number): PromiseLike<{ data: OppRow[] | null; error: unknown | null }> }
          },
        )
        if (cancelled) return

        // Filtros client-side (mesmo padrão do usePreVendas)
        const getEffectiveSdrPP = (r: OppRow) =>
          parseTags(r.contatos?.tags).some((t) => t.toLowerCase() === '[cp] sdr ia')
            ? 'SDR IA'
            : (r.sdr_name || r.contatos?.owner_name || '')

        let dimensionRows = allRows
        if (isFilterActive(filters.sdrs)) {
          dimensionRows = dimensionRows.filter((r) => {
            const sdr = getEffectiveSdrPP(r)
            if (filters.sdrs.exclude.includes(sdr)) return false
            if (filters.sdrs.include.length > 0) return filters.sdrs.include.includes(sdr)
            return true
          })
        }
        if (isFilterActive(filters.closers)) {
          dimensionRows = dimensionRows.filter((r) => {
            const closer = (r.vendedor_closer ?? '').replace(/\s+/g, ' ').trim()
            if (filters.closers.exclude.includes(closer)) return false
            if (filters.closers.include.length > 0) return filters.closers.include.includes(closer)
            return true
          })
        }
        if (isFilterActive(filters.canais)) {
          dimensionRows = dimensionRows.filter((r) => {
            // Venda direta é um "canal" próprio (fora do funil), independe do utm_source.
            const src = isVendaExterna(r) ? VENDA_DIRETA_CANAL : (r.contatos?.utm_source ?? '')
            if (filters.canais.exclude.includes(src)) return false
            if (filters.canais.include.length > 0) return filters.canais.include.includes(src)
            return true
          })
        }
        if (isFilterActive(filters.mediums)) {
          dimensionRows = dimensionRows.filter((r) => {
            const medium = r.contatos?.utm_medium ?? ''
            if (filters.mediums.exclude.includes(medium)) return false
            if (filters.mediums.include.length > 0) return filters.mediums.include.includes(medium)
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
        if (isFilterActive(filters.campanhas)) {
          const includeCodes = filters.campanhas.include.length > 0
            ? new Set(utmCampaigns.filter((c) => filters.campanhas.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          const excludeCodes = filters.campanhas.exclude.length > 0
            ? new Set(utmCampaigns.filter((c) => filters.campanhas.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
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

        // Buscar receita para as oportunidades filtradas dimensionalmente
        const oppIdsSet = new Set(dimensionRows.map((o) => o.id))
        let filteredRevenue: RevenueRow[] = []
        if (oppIdsSet.size > 0) {
          const REV_PAGE_SIZE = 1000
          let allRevRows: RevenueRow[] = []
          let revPage = 0
          while (true) {
            const revRes = await supabase
              .from('vendas_fechamento')
              .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada')
              .eq('workspace_id', wid)
              .gte('data_pagamento_entrada', startISO)
              .lte('data_pagamento_entrada', endISO)
              .order('oportunidade_id', { ascending: true })
              .range(revPage * REV_PAGE_SIZE, (revPage + 1) * REV_PAGE_SIZE - 1)
            if (cancelled) return
            if (revRes.error) throw revRes.error
            allRevRows = allRevRows.concat((revRes.data ?? []) as RevenueRow[])
            if ((revRes.data?.length ?? 0) < REV_PAGE_SIZE) break
            revPage++
          }
          filteredRevenue = allRevRows.filter((r) => oppIdsSet.has(r.oportunidade_id))
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
          console.error('[usePreVendasProducao] error', err)
          // Erro do PostgREST é objeto simples ({ message, details, hint, code }),
          // não um Error: o `instanceof` caía no texto genérico e escondia a causa
          // (foi o que atrasou o diagnóstico do timeout de paginação por OFFSET).
          setError(extractErrorMessage(err, 'Erro ao carregar dados de produtividade'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => {
      cancelled = true
    }
  }, [enabled, filtersStable, pipelineMode])

  return { opps, revenueRows, loading, error }
}
