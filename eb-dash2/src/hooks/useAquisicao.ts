import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllPages, fetchAllPagesByTimeCursor } from '@/lib/supabase/paginate'
import { applyRecuperacaoFilter, type RecuperacaoMode } from '@/lib/constants'
import { spToday, spDaysAgo, toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { getWorkspaceId } from '@/lib/workspace'

import type { OppRow, MetaRow, MetaAccountDailyRow, RevenueRow, ChannelOption } from './useTrafego'
import { parseTags, isMqlByTag, resolveSdrName, resolveCloserName, buildCampaignFunnelMap, buildCampaignNameMap, filterByLeadDate, isVendaExterna } from './useTrafego'
import { isFilterActive, applyFilterValue, normalizeAttribution, withSemAtribuicao } from '@/types/filters'
import type { FilterValues } from '@/types/filters'

export { spToday, spDaysAgo }
export { isMqlByTag, parseTags }

// ─── Types ────────────────────────────────────────────────────

export interface AquisicaoFilters {
  startDate: string        // YYYY-MM-DD SP
  endDate: string          // YYYY-MM-DD SP
  origin: FilterValues     // utm_origins.id or '__unknown__' in include/exclude
  subCategory: FilterValues // utm_source from assignments filtered by origin
  channel: FilterValues    // utm_source (from utm_sources OR utm_sources_plain)
  medium: FilterValues     // utm_medium from utm_mediums
  mqlFilter: 'all' | 'mql'
  funilTags: FilterValues  // funnel names (from funnels table)
  campanhas: FilterValues  // campaign names (from utm_campaigns.nome)
  sdrs: FilterValues       // pré-vendedor: oportunidades.sdr_name (fallback contatos.owner_name)
  closers: FilterValues    // oportunidades.vendedor_closer (vazio = SEM_ATRIBUICAO)
}

export interface OriginOption {
  id: string
  nome: string
}

export interface SubCategoryOption {
  utm_source: string
  nome: string  // friendly name from utm_sources or utm_sources_plain, fallback to utm_source
}

export interface AquisicaoFilterOptions {
  origins: OriginOption[]
  allAssignments: { utm_source: string; origin_id: string }[]
  allChannels: ChannelOption[]  // merged from utm_sources + utm_sources_plain
  paidSourcesSet: Set<string>  // utm_source values that are paid (from utm_sources)
  sourcePublicCode: Map<string, string>  // utm_source -> public_code
  sdrs: string[]
  closers: string[]
}

export interface AquisicaoData {
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
  filterOptions: AquisicaoFilterOptions
  funnelNames: string[]
  campaignFunnelMap: Map<string, string[]>
  campaignNameMap: Map<string, string>
  mediumNameMap: Map<string, string>
  loading: boolean
  error: string | null
  hasPaidTraffic: boolean
}

// ─── OPP_SELECT ───────────────────────────────────────────────

const OPP_SELECT = `
  id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
  pipeline_stage_id,
  lost_reason, vendedor_closer, status, sdr_name,
  data_lead_recebido, data_conectado, data_qualificado,
  data_no_show, data_agendamento_reuniao,
  data_realizacao_vendas, data_fechado,
  data_perdido, data_perdido_vendas, data_negociacao,
  data_no_show_vendas, data_agendamento_vendas,
  appointment_status,
  data_pendencias_preenchimento,
  resumo_ia, percepcao_closer,
  agendamento_origem,
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

// ─── Main hook ────────────────────────────────────────────────

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

/** Resultado do dataset principal de Aquisição — cacheado pelo TanStack Query. */
interface AquisicaoQueryResult {
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
}

const EMPTY_AQUISICAO_RESULT: AquisicaoQueryResult = {
  opps: [],
  metaRows: [],
  accountDailyRows: [],
  revenueRows: [],
}

function messageOfAquisicao(err: unknown): string {
  if (err instanceof Error) return err.message
  return (err as { message?: string })?.message ?? JSON.stringify(err)
}

export function useAquisicao(filters: AquisicaoFilters, recuperacaoMode: RecuperacaoMode = 'exclude_recuperacao'): AquisicaoData {
  const [filterOptions, setFilterOptions] = useState<AquisicaoFilterOptions>({
    origins: [],
    allAssignments: [],
    allChannels: [],
    paidSourcesSet: new Set(),
    sourcePublicCode: new Map(),
    sdrs: [],
    closers: [],
  })
  const [funnelNames, setFunnelNames] = useState<string[]>([])
  const [campaignFunnelMap, setCampaignFunnelMap] = useState<Map<string, string[]>>(new Map())
  const [campaignNameMap, setCampaignNameMap] = useState<Map<string, string>>(new Map())
  const [campaignPageCodeMap, setCampaignPageCodeMap] = useState<Map<string, string>>(new Map())
  const [mediumNameMap, setMediumNameMap] = useState<Map<string, string>>(new Map())

  // Refs to avoid stale closures in the data-loading effect
  const filterOptionsRef = useRef<AquisicaoFilterOptions>(filterOptions)
  filterOptionsRef.current = filterOptions
  const campaignFunnelMapRef = useRef<Map<string, string[]>>(campaignFunnelMap)
  campaignFunnelMapRef.current = campaignFunnelMap
  const campaignNameMapRef = useRef<Map<string, string>>(campaignNameMap)
  campaignNameMapRef.current = campaignNameMap
  const campaignPageCodeMapRef = useRef<Map<string, string>>(campaignPageCodeMap)
  campaignPageCodeMapRef.current = campaignPageCodeMap

  // ── Phase 0: Load filter options once (no date dependency) ──
  useEffect(() => {
    let cancelled = false

    async function loadFilterOptions() {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) {
          console.warn('[useAquisicao] No workspace found')
          return
        }

        const [originsRes, assignmentsRes, paidSourcesRes, plainSourcesRes, funnelsRes, mediumsRes, campaignsRes, sdrUsersRes, closerUsersRes] = await Promise.all([
          supabase
            .from('utm_origins')
            .select('id, nome')
            .eq('workspace_id', wid)
            .order('nome'),
          supabase
            .from('utm_source_origin_assignments')
            .select('utm_source, origin_id')
            .eq('workspace_id', wid),
          supabase
            .from('utm_sources')
            .select('nome, slug, utm_source, public_code')
            .eq('workspace_id', wid),
          supabase
            .from('utm_sources_plain')
            .select('nome, slug, utm_source')
            .eq('workspace_id', wid),
          supabase
            .from('funnels')
            .select('nome')
            .eq('workspace_id', wid),
          supabase
            .from('utm_mediums')
            .select('nome, utm_medium')
            .eq('workspace_id', wid),
          supabase
            .from('utm_campaigns')
            .select('nome, utm_campaign, funnels, page_code')
            .eq('workspace_id', wid),
          // Pré-vendedor (SDR) e Closer — mesma fonte canônica das demais abas.
          supabase.from('ghl_users').select('nome').contains('papeis', ['sdr']).eq('deleted', false).eq('workspace_id', wid).order('nome'),
          supabase.from('ghl_users').select('nome').contains('papeis', ['closer']).eq('deleted', false).eq('workspace_id', wid).order('nome'),
        ])

        if (cancelled) return

        if (originsRes.error) throw originsRes.error
        if (assignmentsRes.error) throw assignmentsRes.error
        if (paidSourcesRes.error) throw paidSourcesRes.error
        if (plainSourcesRes.error) throw plainSourcesRes.error
        if (funnelsRes.error) throw funnelsRes.error

        // Funnels
        const loadedFunnelNames = (funnelsRes.data ?? []).map((f: { nome: string }) => f.nome).filter(Boolean)
        setFunnelNames(loadedFunnelNames)

        // Campaign → funnel map (nova lógica: utm_campaign → funnels)
        setCampaignFunnelMap(
          buildCampaignFunnelMap(
            (campaignsRes.data ?? []) as { utm_campaign: string | number | null; funnels: unknown }[]
          )
        )
        setCampaignNameMap(
          buildCampaignNameMap(
            (campaignsRes.data ?? []) as { utm_campaign: string | number | null; nome: string | null }[]
          )
        )
        // nome → page_code (para casar campanhas [cp] com ad_name do Meta,
        // mesmo critério do filtro cpTags em useTrafego)
        setCampaignPageCodeMap(
          new Map(
            ((campaignsRes.data ?? []) as { nome: string | null; page_code: string | null }[])
              .filter((c) => c.nome && c.page_code)
              .map((c) => [c.nome!, c.page_code!])
          )
        )

        // Origins — append "Desconhecido" sentinel
        const origins: OriginOption[] = [
          ...((originsRes.data ?? []) as OriginOption[]),
          { id: '__unknown__', nome: 'Desconhecido' },
          { id: '__venda_direta__', nome: 'Venda Direta' },
        ]

        // Assignments
        const allAssignments = (assignmentsRes.data ?? []) as { utm_source: string; origin_id: string }[]

        // Paid sources (from utm_sources — have public_code)
        const paidData = (paidSourcesRes.data ?? []) as {
          nome: string
          slug: string
          utm_source: string
          public_code: string | null
        }[]
        const paidSourcesSet = new Set(paidData.map((s) => s.utm_source).filter(Boolean))

        // Source → public_code map
        const sourcePublicCode = new Map(
          paidData
            .filter((s) => s.utm_source && s.public_code)
            .map((s) => [s.utm_source, s.public_code!])
        )

        // Organic sources (from utm_sources_plain — no public_code)
        const plainData = (plainSourcesRes.data ?? []) as {
          nome: string
          slug: string
          utm_source: string
        }[]

        // Merge paid + organic into allChannels, deduplicate by slug, sorted by nome
        const channelMap = new Map<string, ChannelOption>()
        for (const s of paidData) {
          if (s.utm_source) {
            channelMap.set(s.utm_source, {
              nome: s.nome || s.utm_source,
              slug: s.utm_source,
              publicCode: s.public_code,
            })
          }
        }
        for (const s of plainData) {
          if (s.utm_source && !channelMap.has(s.utm_source)) {
            channelMap.set(s.utm_source, {
              nome: s.nome || s.utm_source,
              slug: s.utm_source,
            })
          }
        }
        const allChannels = Array.from(channelMap.values()).sort((a, b) =>
          a.nome.localeCompare(b.nome)
        )

        const sdrs = withSemAtribuicao([
          'SDR IA',
          ...((sdrUsersRes.data ?? []).map((r: { nome: string }) => r.nome).filter(Boolean) as string[]),
        ])
        const closers = withSemAtribuicao([
          ...new Set((closerUsersRes.data ?? []).map((r: { nome: string }) => r.nome).filter(Boolean)),
        ] as string[])

        const opts: AquisicaoFilterOptions = {
          origins,
          allAssignments,
          allChannels,
          paidSourcesSet,
          sourcePublicCode,
          sdrs,
          closers,
        }

        setFilterOptions(opts)
        filterOptionsRef.current = opts

        const rawMediums = (mediumsRes.data ?? []) as { nome: string; utm_medium: number | null }[]
        const builtMediumMap = new Map<string, string>()
        for (const m of rawMediums) {
          if (m.utm_medium != null) {
            builtMediumMap.set(String(m.utm_medium), m.nome)
          }
        }
        setMediumNameMap(builtMediumMap)
      } catch (err) {
        if (!cancelled) console.error('[useAquisicao] filterOptions error', err)
      }
    }

    void loadFilterOptions()
    return () => { cancelled = true }
  }, [])

  // ── hasPaidTraffic: does the current filter include paid traffic? ──
  // Referência estável dos filtros que disparam fetch/recompute (compara por conteúdo)
  const filtersStable = useDeepCompareValue(
    filters,
    JSON.stringify({
      s: filters.startDate,
      e: filters.endDate,
      o: filters.origin,
      sc: filters.subCategory,
      c: filters.channel,
      m: filters.medium,
      mql: filters.mqlFilter,
      ft: filters.funilTags,
      cp: filters.campanhas,
      sdr: filters.sdrs,
      cl: filters.closers,
    }),
  )

  const hasPaidTraffic = useMemo(() => {
    const filters = filtersStable
    const { paidSourcesSet, allAssignments } = filterOptions
    if (!isFilterActive(filters.origin) && !isFilterActive(filters.subCategory) && !isFilterActive(filters.channel)) return true

    if (isFilterActive(filters.channel)) {
      return filters.channel.include.some((c) => paidSourcesSet.has(c)) || filters.channel.include.length === 0
    }
    if (isFilterActive(filters.subCategory)) {
      return filters.subCategory.include.some((c) => paidSourcesSet.has(c)) || filters.subCategory.include.length === 0
    }
    if (isFilterActive(filters.origin)) {
      // Sentinelas não-pagas: Desconhecido e Venda Direta. Se o include só tem elas, não há tráfego pago.
      const onlyNonPaid = filters.origin.include.length > 0 && filters.origin.include.every((id) => id === '__unknown__' || id === '__venda_direta__') && filters.origin.exclude.length === 0
      if (onlyNonPaid) return false
      const knownOriginIds = filters.origin.include.filter((id) => id !== '__unknown__' && id !== '__venda_direta__')
      return knownOriginIds.some((originId) => {
        const assignments = allAssignments.filter((a) => a.origin_id === originId)
        return assignments.some((a) => paidSourcesSet.has(a.utm_source))
      })
    }
    return true
  }, [filtersStable, filterOptions])

  // ── Phase 1: dataset principal, cacheado pelo TanStack Query ──
  // Era um useEffect cru: sair da aba e voltar refazia tudo. Agora o resultado
  // fica válido por `staleTime` (5 min, main.tsx).
  const dataQuery = useQuery({
    queryKey: ['aquisicao', 'dataset', filtersStable, recuperacaoMode],
    queryFn: async (): Promise<AquisicaoQueryResult> => {
      const filters = filtersStable
      {
        const wid = await getWorkspaceId()
        if (!wid) {
          console.warn('[useAquisicao] No workspace found')
          return EMPTY_AQUISICAO_RESULT
        }

        const startISO = toSPISOStart(filters.startDate)
        const endISO = toSPISOEnd(filters.endDate)
        const opts = filterOptionsRef.current

        // ── 1a: Meta Ads — only if paid traffic is in the filter ──
        let allMetaRows: MetaRow[] = []
        let allAccountDailyRows: MetaAccountDailyRow[] = []
        // Compute hasPaidTraffic locally to avoid stale closure
        const localHasPaid = (() => {
          if (!isFilterActive(filters.origin) && !isFilterActive(filters.subCategory) && !isFilterActive(filters.channel)) return true
          if (isFilterActive(filters.channel)) return filters.channel.include.some((c) => opts.paidSourcesSet.has(c)) || filters.channel.include.length === 0
          if (isFilterActive(filters.subCategory)) return filters.subCategory.include.some((c) => opts.paidSourcesSet.has(c)) || filters.subCategory.include.length === 0
          if (isFilterActive(filters.origin)) {
            const onlyNonPaid = filters.origin.include.length > 0 && filters.origin.include.every((id) => id === '__unknown__' || id === '__venda_direta__') && filters.origin.exclude.length === 0
            if (onlyNonPaid) return false
            const knownOriginIds = filters.origin.include.filter((id) => id !== '__unknown__' && id !== '__venda_direta__')
            return knownOriginIds.some((originId) => {
              const assignments = opts.allAssignments.filter((a) => a.origin_id === originId)
              return assignments.some((a) => opts.paidSourcesSet.has(a.utm_source))
            })
          }
          return true
        })()

        if (localHasPaid) {
          const META_PAGE_SIZE = 1000
          allMetaRows = await fetchAllPages<MetaRow>(
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

          // Total oficial de investimento (level=account da Meta) — só válido
          // sem filtro de campanha ativo (level=account não quebra por
          // campanha). Ver mesmo padrão em useTrafego.ts.
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
        }

        // ── 1b: Oportunidades with pagination — ALL traffic, no paid-only filter ──
        const PAGE_SIZE = 1000
        // Cursor por data, não OFFSET: com o select gordo (join de ~25 colunas de
        // contatos), as páginas a partir de ~4.000 linhas estouravam o
        // statement_timeout e o PostgREST devolvia 500.
        const allRows = await fetchAllPagesByTimeCursor<OppRow>(
          (cursor) => {
            let q = supabase
              .from('oportunidades')
              .select(OPP_SELECT)
              .eq('workspace_id', wid)
              .gte('data_lead_recebido', cursor ?? startISO)
              .lte('data_lead_recebido', endISO)
            q = applyRecuperacaoFilter(q, recuperacaoMode)
            return q
              .order('data_lead_recebido', { ascending: true })
              .order('id', { ascending: true }) as never
          },
          { pageSize: PAGE_SIZE, getTime: (r) => r.data_lead_recebido },
        )

        // ── 1c: Client-side filtering by origin/subCategory/channel ──
        let rows = allRows

        if (isFilterActive(filters.origin)) {
          const includeUnknown = filters.origin.include.includes('__unknown__')
          const excludeUnknown = filters.origin.exclude.includes('__unknown__')
          const includeVendaDireta = filters.origin.include.includes('__venda_direta__')
          const excludeVendaDireta = filters.origin.exclude.includes('__venda_direta__')
          // knownIncludes/Excludes = origens reais (utm_source); sentinelas tratadas à parte.
          const knownIncludes = filters.origin.include.filter((id) => id !== '__unknown__' && id !== '__venda_direta__')
          const knownExcludes = filters.origin.exclude.filter((id) => id !== '__unknown__' && id !== '__venda_direta__')
          const includeSourceSet = new Set(opts.allAssignments.filter((a) => knownIncludes.includes(a.origin_id)).map((a) => a.utm_source))
          const excludeSourceSet = new Set(opts.allAssignments.filter((a) => knownExcludes.includes(a.origin_id)).map((a) => a.utm_source))
          rows = rows.filter((r) => {
            // "Venda Direta" é uma origem própria (independe do utm_source), como "Desconhecido".
            if (isVendaExterna(r)) {
              if (excludeVendaDireta) return false
              if (filters.origin.include.length > 0) return includeVendaDireta
              return true
            }
            const src = r.contatos?.utm_source
            const isUnknown = !src || src.trim() === ''
            if (isUnknown) {
              if (excludeUnknown) return false
              if (filters.origin.include.length > 0) return includeUnknown
              return true
            }
            if (excludeSourceSet.has(src)) return false
            if (knownIncludes.length > 0) return includeSourceSet.has(src)
            return true
          })
        }

        if (isFilterActive(filters.subCategory)) {
          rows = rows.filter((r) => applyFilterValue(r.contatos?.utm_source, filters.subCategory))
        }

        if (isFilterActive(filters.channel)) {
          rows = rows.filter((r) => applyFilterValue(r.contatos?.utm_source, filters.channel))
        }

        if (isFilterActive(filters.medium)) {
          rows = rows.filter((r) => applyFilterValue(r.contatos?.utm_medium, filters.medium))
        }

        if (isFilterActive(filters.funilTags)) {
          const funnelMap = campaignFunnelMapRef.current
          const nameMap = campaignNameMapRef.current
          const { include, exclude } = filters.funilTags
          rows = rows.filter((r) => {
            const code = r.contatos?.utm_campaign != null ? String(r.contatos.utm_campaign) : ''
            const campaignName = nameMap.get(code) ?? ''
            const contactTags = parseTags(r.contatos?.tags)
            // [cp] campaigns: só conta se o contato tem a tag correspondente
            const isCpCampaign = campaignName.toLowerCase().startsWith('[cp]')
            const cpTagPresent = isCpCampaign
              ? contactTags.some((t) => t.toLowerCase() === campaignName.toLowerCase())
              : true
            const funnels = cpTagPresent ? (funnelMap.get(code) ?? []) : []
            if (exclude.length > 0 && funnels.length > 0 && funnels.every((f) => exclude.includes(f))) return false
            if (include.length > 0 && !funnels.some((f) => include.includes(f))) return false
            return true
          })
        }

        if (isFilterActive(filters.campanhas)) {
          const nameMap = campaignNameMapRef.current
          rows = rows.filter((r) => {
            const code = r.contatos?.utm_campaign != null ? String(r.contatos.utm_campaign) : ''
            const campaignNameFromUtm = nameMap.get(code) ?? ''
            const contactTags = parseTags(r.contatos?.tags)
            const { include, exclude } = filters.campanhas

            const matchesCampaign = (name: string): boolean => {
              // Campanhas [cp] são rastreadas por TAG no contato (igual ao GHL)
              if (name.toLowerCase().startsWith('[cp]')) {
                return contactTags.some((t) => t.toLowerCase() === name.toLowerCase())
              }
              // Demais campanhas: mapeamento via utm_campaign
              return campaignNameFromUtm.toLowerCase() === name.toLowerCase()
            }

            if (exclude.length > 0 && exclude.some((n) => matchesCampaign(n))) return false
            if (include.length > 0) return include.some((n) => matchesCampaign(n))
            return true
          })
        }

        // Filtro por data de criação do contato (lógica GHL)
        rows = filterByLeadDate(rows, filters.startDate, filters.endDate)

        // MQL filter
        if (filters.mqlFilter === 'mql') {
          rows = rows.filter((r) => isMqlByTag(r.contatos))
        }

        if (isFilterActive(filters.sdrs)) {
          rows = rows.filter((r) => applyFilterValue(normalizeAttribution(resolveSdrName(r)), filters.sdrs))
        }
        if (isFilterActive(filters.closers)) {
          rows = rows.filter((r) => applyFilterValue(normalizeAttribution(resolveCloserName(r)), filters.closers))
        }

        // Safeguard: deduplicar por opp.id (proteção contra edge cases de paginação)
        const seenIds = new Set<string>()
        rows = rows.filter((r) => {
          if (seenIds.has(r.id)) return false
          seenIds.add(r.id)
          return true
        })

        // ── 1d: Revenue (same cohort pattern as useTrafego) ──
        const filteredOppIdsSet = new Set(rows.map((o) => o.id))
        let filteredRevenue: RevenueRow[] = []
        if (filteredOppIdsSet.size > 0) {
          const REV_PAGE_SIZE = 1000
          const allRevRows = await fetchAllPages<RevenueRow>(
            () =>
              supabase
                .from('vendas_fechamento')
                .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada')
                .eq('workspace_id', wid)
                .gte('data_pagamento_entrada', startISO)
                .order('oportunidade_id', { ascending: true }) as unknown as {
                range(f: number, t: number): PromiseLike<{ data: RevenueRow[] | null; error: unknown | null }>
              },
            { pageSize: REV_PAGE_SIZE },
          )
          filteredRevenue = allRevRows.filter((r) => filteredOppIdsSet.has(r.oportunidade_id))
        }

        // ── 1e: Filter metaRows based on current filter context ──
        let finalMetaRows = allMetaRows

        // Filtro de campanha nas linhas do Meta (mesmo critério do useTrafego):
        // campanhas normais casam por campaign_name; campanhas [cp] casam por
        // page_code no ad_name. Sem isso, o investimento somava o gasto de
        // TODAS as campanhas do período mesmo com filtro ativo.
        if (isFilterActive(filters.campanhas)) {
          const pageCodeMap = campaignPageCodeMapRef.current
          const { include, exclude } = filters.campanhas
          const matchesMeta = (r: MetaRow, name: string): boolean => {
            if (name.toLowerCase().startsWith('[cp]')) {
              const pc = pageCodeMap.get(name)
              return pc != null && r.ad_name != null && r.ad_name.includes(pc)
            }
            return (r.campaign_name ?? '').toLowerCase() === name.toLowerCase()
          }
          finalMetaRows = finalMetaRows.filter((r) => {
            if (exclude.length > 0 && exclude.some((n) => matchesMeta(r, n))) return false
            if (include.length > 0) return include.some((n) => matchesMeta(r, n))
            return true
          })
        }

        if (isFilterActive(filters.channel) && filters.channel.include.length > 0) {
          const publicCodes = filters.channel.include.map((c) => opts.sourcePublicCode.get(c)).filter(Boolean) as string[]
          if (publicCodes.length > 0) {
            finalMetaRows = finalMetaRows.filter(
              (r) => r.ad_name != null && publicCodes.some((pc) => r.ad_name!.includes(pc))
            )
          }
        } else if (isFilterActive(filters.subCategory) && filters.subCategory.include.length > 0) {
          const publicCodes = filters.subCategory.include.map((c) => opts.sourcePublicCode.get(c)).filter(Boolean) as string[]
          if (publicCodes.length > 0) {
            finalMetaRows = finalMetaRows.filter(
              (r) => r.ad_name != null && publicCodes.some((pc) => r.ad_name!.includes(pc))
            )
          }
        }

        // If the filter is purely organic (no paid sources), clear meta rows
        if (!localHasPaid) {
          finalMetaRows = []
        }

        return {
          opps: rows,
          metaRows: finalMetaRows,
          accountDailyRows: allAccountDailyRows,
          revenueRows: filteredRevenue,
        }
      }
    },
  })

  const data = dataQuery.data ?? EMPTY_AQUISICAO_RESULT

  return {
    opps: data.opps,
    metaRows: data.metaRows,
    accountDailyRows: data.accountDailyRows,
    revenueRows: data.revenueRows,
    filterOptions,
    funnelNames,
    campaignFunnelMap,
    campaignNameMap,
    mediumNameMap,
    loading: dataQuery.isPending,
    error: dataQuery.error ? messageOfAquisicao(dataQuery.error) : null,
    hasPaidTraffic,
  }
}
