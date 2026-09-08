import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllPages, fetchAllPagesByTimeCursor } from '@/lib/supabase/paginate'
import { applyRecuperacaoFilter, type RecuperacaoMode } from '@/lib/constants'
import {
  parseTags,
  computeFunnel,
  computeRevenueKpis,
  applyMqlFilter,
  filterByLeadDate,
  isVendaExterna,
} from './useTrafego'

// Valor sintético do filtro de Canal para vendas diretas (fora do funil).
export const VENDA_DIRETA_CANAL = '__venda_direta__'
import type { OppRow, MetaRow, MetaAccountDailyRow, RevenueRow } from './useTrafego'
import { spToday, spDaysAgo, toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { getWorkspaceId } from '@/lib/workspace'
import type { FilterValues } from '@/types/filters'
import { isFilterActive, applyFilterValue, normalizeAttribution, withSemAtribuicao } from '@/types/filters'

export { spToday, spDaysAgo }

// ─── Types ────────────────────────────────────────────────────

export interface PreVendasFilters {
  startDate: string       // YYYY-MM-DD São Paulo
  endDate: string
  sdrs: FilterValues      // oportunidades.sdr_name (inclui valor sintético "SDR IA")
  closers: FilterValues   // oportunidades.vendedor_closer
  canais: FilterValues    // utm_source
  mediums: FilterValues   // utm_medium
  funilTags: FilterValues // funnels.nome
  campanhas: FilterValues // utm_campaigns.nome
  modoMql: 'todos' | 'mql'
}

export interface PreVendasFilterOptions {
  sdrs: string[]
  closers: string[]
  canais: { value: string; label: string }[]
  mediums: { value: string; label: string }[]
  funilTags: string[]
  campanhas: string[]
}

export interface PreVendasData {
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
  filterOptions: PreVendasFilterOptions
  loading: boolean
  error: string | null
}

export interface PreVendasDataset {
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
}

// Internal: utm_campaigns cross-reference
interface UtmCampaignEntry {
  nome: string
  utm_campaign: string
  funnels: unknown
}

// ─── Hook ─────────────────────────────────────────────────────

export async function loadPreVendasDataset(filters: PreVendasFilters, pipelineMode: RecuperacaoMode = 'exclude_recuperacao'): Promise<PreVendasDataset> {
  const wid = await getWorkspaceId()
  if (!wid) throw new Error('Conta não encontrada')

  // endISO deixou de ser usado quando o filtro por date_created saiu daqui:
  // o recorte de periodo agora e feito por filterByLeadDate. startISO segue
  // servindo de piso para a busca de receita.
  const startISO = toSPISOStart(filters.startDate)

  // Pré-filtro amplo no banco (180d antes, 30d depois) para capturar
  // contatos cujo date_created está no período mas data_lead_recebido está fora
  const MS_DAY = 24 * 60 * 60 * 1000
  const bufferedStartISO = toSPISOStart(
    new Date(new Date(filters.startDate + 'T12:00:00-03:00').getTime() - 180 * MS_DAY)
      .toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  )
  const bufferedEndISO = toSPISOEnd(
    new Date(new Date(filters.endDate + 'T12:00:00-03:00').getTime() + 30 * MS_DAY)
      .toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  )

  const campaignsRes = await supabase
    .from('utm_campaigns')
    .select('nome, utm_campaign, funnels')
    .eq('workspace_id', wid)
  if (campaignsRes.error) throw campaignsRes.error

  const utmCampaigns = (campaignsRes.data ?? []) as UtmCampaignEntry[]
  const OPP_SELECT = `
    id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
    lost_reason, vendedor_closer, status, sdr_name,
    data_lead_recebido, data_conectado, data_qualificado,
    data_no_show, data_agendamento_reuniao, data_reuniao_agendada,
    data_realizacao_vendas, data_fechado,
    data_perdido, data_perdido_vendas, data_negociacao,
    data_no_show_vendas, data_agendamento_vendas,
    appointment_status,
    data_pendencias_preenchimento,
    data_auto_agendamento,
    resumo_ia, percepcao_closer,
    agendamento_origem, agendamento_por_user_id, agendamento_por_user_nome,
    agendamento_por_user_email, agendamento_calendar_id, agendamento_calendar_name,
    agendamento_assigned_user_id, agendamento_assigned_user_nome,
    contatos(
      ghl_id, nome, email, telefone,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content,
      fbclid, gclid,
      tt_source, tt_campaign, tt_medium, tt_term, tt_content,
      owner_name, owner_email, date_created,
      como_nos_conheceu, faturamento_anual, perfil_inteligente,
      tags, contact_source, print_instagram,
      workspace_id
    )
  `

  const PAGE_SIZE = 1000
  // Cursor por data (não OFFSET): páginas profundas com este select estouravam o
  // statement_timeout — 500 no PostgREST.
  let allOpps = await fetchAllPagesByTimeCursor<OppRow>(
    (cursor) => {
      let q = supabase
        .from('oportunidades')
        .select(OPP_SELECT)
        .eq('workspace_id', wid)
        .gte('data_lead_recebido', cursor ?? bufferedStartISO)
        .lte('data_lead_recebido', bufferedEndISO)
      q = applyRecuperacaoFilter(q, pipelineMode)
      return q
        .order('data_lead_recebido', { ascending: true })
        .order('id', { ascending: true }) as never
    },
    { pageSize: PAGE_SIZE, getTime: (r) => r.data_lead_recebido },
  )

  // Régua de período = data do lead, igual ao restante dos painéis.
  // Antes daqui saía um filtro próprio por contatos.date_created que, além de
  // usar a régua antiga (ver filterByLeadDate), comparava as datas como texto
  // ISO com offsets diferentes ('...+00:00' contra '...-03:00'), errando nas
  // bordas do período, e descartava lead sem date_created em vez de manter.
  allOpps = filterByLeadDate(allOpps, filters.startDate, filters.endDate)

  const META_PAGE_SIZE = 1000
  const allMetaRows = await fetchAllPages<MetaRow>(
    () =>
      supabase
        .from('meta_ads_insights')
        .select('spend, impressions, clicks, ctr, cpm, actions, campaign_name, adset_name, ad_name, date, landing_page_views, video_views, link_clicks, leads')
        .eq('workspace_id', wid)
        .gte('date', filters.startDate)
        .lte('date', filters.endDate)
        .order('date', { ascending: true })
        // desempate único: (date, ad_id) é UNIQUE — sem isso a paginação
        // por range é instável e pode pular/duplicar linhas no corte da página
        .order('ad_id', { ascending: true }),
    { pageSize: META_PAGE_SIZE },
  )

  // Total oficial de investimento (level=account da Meta) — só válido sem
  // filtro de campanha ativo (level=account não quebra por campanha). Ver
  // mesmo padrão em useTrafego.ts.
  let allAccountDailyRows: MetaAccountDailyRow[] = []
  if (!isFilterActive(filters.campanhas)) {
    allAccountDailyRows = await fetchAllPages<MetaAccountDailyRow>(
      () =>
        supabase
          .from('meta_ads_account_daily')
          .select('date, spend')
          .eq('workspace_id', wid)
          .gte('date', filters.startDate)
          .lte('date', filters.endDate)
          .order('date', { ascending: true }),
      { pageSize: META_PAGE_SIZE },
    )
  }

  const getEffectiveSdr = (row: OppRow) =>
    parseTags(row.contatos?.tags).some((t) => t.toLowerCase() === '[cp] sdr ia')
      ? 'SDR IA'
      : (row.sdr_name || row.contatos?.owner_name || '')

  let rows = allOpps
  if (isFilterActive(filters.sdrs)) {
    rows = rows.filter((row) => applyFilterValue(normalizeAttribution(getEffectiveSdr(row)), filters.sdrs))
  }
  if (isFilterActive(filters.closers)) {
    rows = rows.filter((row) => {
      const closer = (row.vendedor_closer ?? '').replace(/\s+/g, ' ').trim()
      return applyFilterValue(normalizeAttribution(closer), filters.closers)
    })
  }
  if (isFilterActive(filters.canais)) {
    rows = rows.filter((row) => {
      // Venda direta é um "canal" próprio (fora do funil), independe do utm_source.
      const src = isVendaExterna(row) ? VENDA_DIRETA_CANAL : (row.contatos?.utm_source ?? '')
      if (filters.canais.exclude.includes(src)) return false
      if (filters.canais.include.length > 0) return filters.canais.include.includes(src)
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
      rows = []
    } else {
      rows = rows.filter((row) => {
        const uc = row.contatos?.utm_campaign
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
      rows = []
    } else {
      rows = rows.filter((row) => {
        const uc = row.contatos?.utm_campaign
        const code = uc != null ? String(uc) : ''
        if (excludeCodes && excludeCodes.has(code)) return false
        if (includeCodes !== null) return includeCodes.has(code)
        return true
      })
    }
  }

  const oppIdsSet = new Set(rows.map((row) => row.id))
  let revenueRows: RevenueRow[] = []
  if (oppIdsSet.size > 0) {
    // Paginado (.range): a receita pode passar de 1000 linhas conforme o histórico cresce (§4.6).
    const revAcc = await fetchAllPages<RevenueRow>(
      () =>
        supabase
          .from('vendas_fechamento')
          .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada, link_gravacao_call_vendas, nome_contratante, produto_vendido, origem, op_link_do_contrato_assinado, data_da_assinatura_do_contrato, contrato_status')
          .eq('workspace_id', wid)
          .gte('data_pagamento_entrada', startISO)
          .order('id') as unknown as {
          range(f: number, t: number): PromiseLike<{ data: RevenueRow[] | null; error: unknown | null }>
        },
      { pageSize: PAGE_SIZE },
    )
    revenueRows = revAcc.filter((row) => oppIdsSet.has(row.oportunidade_id))
  }

  return {
    opps: rows,
    metaRows: allMetaRows,
    accountDailyRows: allAccountDailyRows,
    revenueRows,
  }
}

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

/** Resultado do dataset principal de Pré-Vendas — cacheado pelo TanStack Query. */
interface PreVendasQueryResult {
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
}

const EMPTY_PREVENDAS_RESULT: PreVendasQueryResult = {
  opps: [],
  metaRows: [],
  accountDailyRows: [],
  revenueRows: [],
}

function messageOfPreVendas(err: unknown): string {
  if (err instanceof Error) return err.message
  return (err as { message?: string })?.message ?? JSON.stringify(err)
}

export function usePreVendas(filters: PreVendasFilters, pipelineMode: RecuperacaoMode = 'exclude_recuperacao'): PreVendasData {
  const [filterOptions, setFilterOptions] = useState<PreVendasFilterOptions>({
    sdrs: [],
    closers: [],
    canais: [],
    mediums: [],
    funilTags: [],
    campanhas: [],
  })

  const utmCampaignsRef = useRef<UtmCampaignEntry[]>([])

  // Load filter options once
  useEffect(() => {
    let cancelled = false

    async function loadOptions() {
      try {
        const wid = await getWorkspaceId()
        if (!wid) {
          console.warn('[usePreVendas] No workspace found')
          return
        }

        // SDRs e closers cadastrados em ghl_users (fonte canônica)
        // Garante que SDRs sem leads ativos ainda apareçam no filtro
        const [sdrUsersRes, closerUsersRes, paidSourcesRes, plainSourcesRes, mediumsRes, funnelsRes, campaignsRes] = await Promise.all([
          supabase.from('ghl_users').select('nome').contains('papeis', ['sdr']).eq('deleted', false).eq('workspace_id', wid).order('nome'),
          supabase.from('ghl_users').select('nome').contains('papeis', ['closer']).eq('deleted', false).eq('workspace_id', wid),
          supabase.from('utm_sources').select('nome, utm_source').eq('workspace_id', wid),
          supabase.from('utm_sources_plain').select('nome, utm_source').eq('workspace_id', wid),
          supabase.from('utm_mediums').select('nome, utm_medium').eq('workspace_id', wid),
          supabase.from('funnels').select('nome').eq('workspace_id', wid),
          supabase.from('utm_campaigns').select('nome, utm_campaign, funnels').eq('workspace_id', wid),
        ])

        if (cancelled) return

        const sdrs = withSemAtribuicao([
          'SDR IA',
          ...((sdrUsersRes.data ?? []).map((r: { nome: string }) => r.nome).filter(Boolean) as string[]),
        ])

        const closers = withSemAtribuicao(
          [
            ...new Set(
              (closerUsersRes.data ?? []).map((r: { nome: string }) => r.nome).filter(Boolean)
            ),
          ].sort() as string[]
        )

        // Canais: paid (utm_sources) + organic (utm_sources_plain), deduplicated by utm_source
        // value = utm_source (código armazenado em contatos.utm_source)
        // label = nome (nome amigável para exibição)
        const channelMap = new Map<string, string>()
        for (const r of [
          ...((paidSourcesRes.data ?? []) as { nome: string; utm_source: string }[]),
          ...((plainSourcesRes.data ?? []) as { nome: string; utm_source: string }[]),
        ]) {
          if (r.utm_source && !channelMap.has(r.utm_source)) {
            channelMap.set(r.utm_source, r.nome || r.utm_source)
          }
        }
        const canais = [
          ...Array.from(channelMap.entries())
            .map(([utm_source, nome]) => ({ value: utm_source, label: nome }))
            .sort((a, b) => a.label.localeCompare(b.label)),
          { value: VENDA_DIRETA_CANAL, label: 'Venda Direta' },
        ]

        const mediums = ((mediumsRes.data ?? []) as { nome: string; utm_medium: number | string | null }[])
          .filter((r) => r.utm_medium != null)
          .map((r) => ({ value: String(r.utm_medium), label: r.nome || String(r.utm_medium) }))
          .sort((a, b) => a.label.localeCompare(b.label))

        const funilTags = (funnelsRes.data ?? [])
          .map((r: { nome: string }) => r.nome)
          .filter(Boolean)
          .sort() as string[]

        const utmCampaignsData = (campaignsRes.data ?? []) as UtmCampaignEntry[]
        utmCampaignsRef.current = utmCampaignsData
        const campanhas = utmCampaignsData.map((r) => r.nome).filter(Boolean).sort() as string[]

        setFilterOptions({ sdrs, closers, canais, mediums, funilTags, campanhas })
      } catch (err) {
        if (!cancelled) console.error('[usePreVendas] filterOptions error', err)
      }
    }

    void loadOptions()
    return () => { cancelled = true }
  }, [])

  // Load main data when date changes
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

  // Dataset principal cacheado pelo TanStack Query (staleTime de 5 min, main.tsx).
  // Antes era useEffect cru: trocar de aba e voltar refazia todas as buscas.
  const dataQuery = useQuery({
    queryKey: ['pre-vendas', 'dataset', filtersStable, pipelineMode],
    queryFn: async (): Promise<PreVendasQueryResult> => {
      const filters = filtersStable
      {
        const wid = await getWorkspaceId()
        if (!wid) throw new Error('Conta não encontrada')

        const startISO = toSPISOStart(filters.startDate)

        const MS_DAY = 24 * 60 * 60 * 1000
        const bufferedStartISO2 = toSPISOStart(
          new Date(new Date(filters.startDate + 'T12:00:00-03:00').getTime() - 180 * MS_DAY)
            .toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
        )
        const bufferedEndISO2 = toSPISOEnd(
          new Date(new Date(filters.endDate + 'T12:00:00-03:00').getTime() + 30 * MS_DAY)
            .toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
        )

        const OPP_SELECT = `
          id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
          lost_reason, vendedor_closer, status, sdr_name,
          data_lead_recebido, data_conectado, data_qualificado,
          data_no_show, data_agendamento_reuniao, data_reuniao_agendada,
          data_realizacao_vendas, data_fechado,
          data_perdido, data_perdido_vendas, data_negociacao,
          data_no_show_vendas, data_agendamento_vendas,
          appointment_status,
          data_pendencias_preenchimento,
          data_auto_agendamento,
          resumo_ia, percepcao_closer,
          agendamento_origem, agendamento_por_user_id, agendamento_por_user_nome,
          agendamento_por_user_email, agendamento_calendar_id, agendamento_calendar_name,
          agendamento_assigned_user_id, agendamento_assigned_user_nome,
          contatos(
            ghl_id, nome, email, telefone,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            fbclid, gclid,
            tt_source, tt_campaign, tt_medium, tt_term, tt_content,
            owner_name, owner_email, date_created,
            como_nos_conheceu, faturamento_anual, perfil_inteligente,
            tags, contact_source, print_instagram
          )
        `
        // PostgREST max_rows = 1000 no servidor — paginar para buscar todos
        // Buscar leads COM data_lead_recebido no período
        const PAGE_SIZE = 1000
        let allOpps = await fetchAllPagesByTimeCursor<OppRow>(
          (cursor) => {
            let q = supabase
              .from('oportunidades')
              .select(OPP_SELECT)
              .eq('workspace_id', wid)
              .gte('data_lead_recebido', cursor ?? bufferedStartISO2)
              .lte('data_lead_recebido', bufferedEndISO2)
            q = applyRecuperacaoFilter(q, pipelineMode)
            return q
              .order('data_lead_recebido', { ascending: true })
              .order('id', { ascending: true }) as never
          },
          { pageSize: PAGE_SIZE, getTime: (r) => r.data_lead_recebido },
        )

        // Régua de período = data do lead (mesmo filtro do dataset acima).
        allOpps = filterByLeadDate(allOpps, filters.startDate, filters.endDate)

        // Meta: paginar para buscar todos (PostgREST max_rows=1000)
        const META_PAGE_SIZE = 1000
        const allMetaRows = await fetchAllPages<MetaRow>(
          () =>
            supabase
              .from('meta_ads_insights')
              .select('spend, impressions, clicks, ctr, cpm, actions, campaign_name, adset_name, ad_name, date, landing_page_views, video_views, link_clicks, leads')
              .eq('workspace_id', wid)
              .gte('date', filters.startDate)
              .lte('date', filters.endDate)
              .order('date', { ascending: true })
              // desempate único: (date, ad_id) é UNIQUE — sem isso a paginação
              // por range é instável e pode pular/duplicar linhas no corte da página
              .order('ad_id', { ascending: true }),
          { pageSize: META_PAGE_SIZE },
        )

        const metaRes = { data: allMetaRows, error: null }

        // Total oficial de investimento (level=account da Meta) — só válido
        // sem filtro de campanha ativo. Ver mesmo padrão em useTrafego.ts.
        let accDailyRowsLocal: MetaAccountDailyRow[] = []
        if (!isFilterActive(filters.campanhas)) {
          accDailyRowsLocal = await fetchAllPages<MetaAccountDailyRow>(
            () =>
              supabase
                .from('meta_ads_account_daily')
                .select('date, spend')
                .eq('workspace_id', wid)
                .gte('date', filters.startDate)
                .lte('date', filters.endDate)
                .order('date', { ascending: true }),
            { pageSize: META_PAGE_SIZE },
          )
        }

        if (metaRes.error) throw metaRes.error

        let rows = allOpps

        // Client-side filters
        const getEffectiveSdrLocal = (r: OppRow) =>
          parseTags(r.contatos?.tags).some((t) => t.toLowerCase() === '[cp] sdr ia')
            ? 'SDR IA'
            : (r.sdr_name || r.contatos?.owner_name || '')

        if (isFilterActive(filters.sdrs)) {
          rows = rows.filter((r) => applyFilterValue(normalizeAttribution(getEffectiveSdrLocal(r)), filters.sdrs))
        }
        if (isFilterActive(filters.closers)) {
          rows = rows.filter((r) => {
            const closer = (r.vendedor_closer ?? '').replace(/\s+/g, ' ').trim()
            return applyFilterValue(normalizeAttribution(closer), filters.closers)
          })
        }
        if (isFilterActive(filters.canais)) {
          rows = rows.filter((r) => {
            const src = r.contatos?.utm_source ?? ''
            if (filters.canais.exclude.includes(src)) return false
            if (filters.canais.include.length > 0) return filters.canais.include.includes(src)
            return true
          })
        }
        if (isFilterActive(filters.mediums)) {
          rows = rows.filter((r) => {
            const medium = r.contatos?.utm_medium ?? ''
            if (filters.mediums.exclude.includes(medium)) return false
            if (filters.mediums.include.length > 0) return filters.mediums.include.includes(medium)
            return true
          })
        }
        if (isFilterActive(filters.funilTags)) {
          const utmCampaigns = utmCampaignsRef.current
          const includeCodes = filters.funilTags.include.length > 0
            ? new Set(utmCampaigns.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.include.includes(f))).map((c) => String(c.utm_campaign)))
            : null
          const excludeCodes = filters.funilTags.exclude.length > 0
            ? new Set(utmCampaigns.filter((c) => parseTags(c.funnels).some((f) => filters.funilTags.exclude.includes(f))).map((c) => String(c.utm_campaign)))
            : null
          if (includeCodes !== null && includeCodes.size === 0) {
            rows = []
          } else {
            rows = rows.filter((r) => {
              const uc = r.contatos?.utm_campaign
              const code = uc != null ? String(uc) : ''
              if (excludeCodes && excludeCodes.has(code)) return false
              if (includeCodes !== null) return includeCodes.has(code)
              return true
            })
          }
        }
        if (isFilterActive(filters.campanhas)) {
          const utmCampaigns = utmCampaignsRef.current
          const includeCodes = filters.campanhas.include.length > 0
            ? new Set(utmCampaigns.filter((c) => filters.campanhas.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          const excludeCodes = filters.campanhas.exclude.length > 0
            ? new Set(utmCampaigns.filter((c) => filters.campanhas.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
            : null
          if (includeCodes !== null && includeCodes.size === 0) {
            rows = []
          } else {
            rows = rows.filter((r) => {
              const uc = r.contatos?.utm_campaign
              const code = uc != null ? String(uc) : ''
              if (excludeCodes && excludeCodes.has(code)) return false
              if (includeCodes !== null) return includeCodes.has(code)
              return true
            })
          }
        }

        // Fetch revenue for these opps
        const oppIdsSet = new Set(rows.map((o) => o.id))
        let filteredRevenue: RevenueRow[] = []
        if (oppIdsSet.size > 0) {
          // Paginado (.range): sem upper bound, a receita pode passar de 1000 linhas (§4.6).
          const revAcc = await fetchAllPages<RevenueRow>(
            () =>
              supabase
                .from('vendas_fechamento')
                .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada, link_gravacao_call_vendas, nome_contratante, produto_vendido, origem, op_link_do_contrato_assinado, data_da_assinatura_do_contrato, contrato_status')
                .eq('workspace_id', wid)
                .gte('data_pagamento_entrada', startISO)
                // sem upper bound — captura receita registrada após o período do cohort
                .order('id') as unknown as {
                range(f: number, t: number): PromiseLike<{ data: RevenueRow[] | null; error: unknown | null }>
              },
            { pageSize: PAGE_SIZE },
          )
          filteredRevenue = revAcc.filter((r) => oppIdsSet.has(r.oportunidade_id))
        }

        // Filtro por data de criação do contato (lógica GHL)
        rows = filterByLeadDate(rows, filters.startDate, filters.endDate)

        // Safeguard: deduplicar por opp.id
        const seenIds = new Set<string>()
        rows = rows.filter((r) => {
          if (seenIds.has(r.id)) return false
          seenIds.add(r.id)
          return true
        })

        return {
          opps: rows,
          metaRows: (metaRes.data ?? []) as MetaRow[],
          accountDailyRows: accDailyRowsLocal,
          revenueRows: filteredRevenue,
        }
      }
    },
  })

  const data = dataQuery.data ?? EMPTY_PREVENDAS_RESULT

  return {
    opps: data.opps,
    metaRows: data.metaRows,
    accountDailyRows: data.accountDailyRows,
    revenueRows: data.revenueRows,
    filterOptions,
    loading: dataQuery.isPending,
    error: dataQuery.error ? messageOfPreVendas(dataQuery.error) : null,
  }
}

// ─── Re-exports for tabs ──────────────────────────────────────
export { computeFunnel, computeRevenueKpis, applyMqlFilter }
export type { OppRow, MetaRow, RevenueRow }
