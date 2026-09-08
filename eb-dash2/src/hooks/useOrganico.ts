import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllPages, fetchAllPagesByTimeCursor } from '@/lib/supabase/paginate'
import { applyRecuperacaoFilter, RECUPERACAO_MODE_DEFAULT, type RecuperacaoMode, type RecuperacaoQueryLike } from '@/lib/constants'
import { spToday, spDaysAgo, toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { getWorkspaceId } from '@/lib/workspace'

import type { OppRow, RevenueRow, ChannelOption } from './useTrafego'
import { parseTags, isMqlByTag, resolveSdrName, resolveCloserName, buildCampaignFunnelMap, buildCampaignNameMap, filterByLeadDate } from './useTrafego'
import { isFilterActive, applyFilterValue, normalizeAttribution, withSemAtribuicao } from '@/types/filters'
import type { FilterValues } from '@/types/filters'

export { spToday, spDaysAgo }
export { isMqlByTag, parseTags }

// ─── Types ────────────────────────────────────────────────────

export interface OrganicoFilters {
  startDate: string        // YYYY-MM-DD SP
  endDate: string          // YYYY-MM-DD SP
  origin: FilterValues     // utm_origins.id or '__unknown__' in include/exclude
  subCategory: FilterValues // utm_source from assignments filtered by origin
  channel: FilterValues    // utm_source from utm_sources_plain
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
  nome: string
}

export interface OrganicoFilterOptions {
  origins: OriginOption[]
  allAssignments: { utm_source: string; origin_id: string }[]
  allChannels: ChannelOption[]  // only from utm_sources_plain
  paidSourcesSet: Set<string>   // always empty for organic
  sourcePublicCode: Map<string, string>  // always empty for organic
  organicSourceSet: Set<string> // utm_source values from utm_sources_plain
  sdrs: string[]
  closers: string[]
}

export interface OrganicoData {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  filterOptions: OrganicoFilterOptions
  funnelNames: string[]
  campaignFunnelMap: Map<string, string[]>
  campaignNameMap: Map<string, string>
  organicSourceSet: Set<string>
  mediumNameMap: Map<string, string>  // code (string) → nome amigável
  loading: boolean
  error: string | null
}

// ─── OPP_SELECT ───────────────────────────────────────────────

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
  contatos(
    ghl_id, nome, email, telefone,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    fbclid, gclid,
    tt_source, tt_campaign, tt_medium, tt_term, tt_content,
    owner_name, owner_email, date_created, print_instagram,
    como_nos_conheceu, faturamento_anual, perfil_inteligente,
    tags
  )
`

// ─── Main hook ────────────────────────────────────────────────

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

/** Resultado do dataset principal do Orgânico — cacheado pelo TanStack Query. */
interface OrganicoQueryResult {
  opps: OppRow[]
  revenueRows: RevenueRow[]
}

const EMPTY_ORGANICO_RESULT: OrganicoQueryResult = { opps: [], revenueRows: [] }

function messageOfOrganico(err: unknown): string {
  if (err instanceof Error) return err.message
  return (err as { message?: string })?.message ?? JSON.stringify(err)
}

export function useOrganico(
  filters: OrganicoFilters,
  recuperacaoMode: RecuperacaoMode = RECUPERACAO_MODE_DEFAULT,
): OrganicoData {
  const [filterOptions, setFilterOptions] = useState<OrganicoFilterOptions>({
    origins: [],
    allAssignments: [],
    allChannels: [],
    paidSourcesSet: new Set(),
    sourcePublicCode: new Map(),
    organicSourceSet: new Set(),
    sdrs: [],
    closers: [],
  })
  const [funnelNames, setFunnelNames] = useState<string[]>([])
  const [campaignFunnelMap, setCampaignFunnelMap] = useState<Map<string, string[]>>(new Map())
  const [campaignNameMap, setCampaignNameMap] = useState<Map<string, string>>(new Map())
  const [mediumNameMap, setMediumNameMap] = useState<Map<string, string>>(new Map())
  const [optionsReady, setOptionsReady] = useState(false)

  const filterOptionsRef = useRef<OrganicoFilterOptions>(filterOptions)
  filterOptionsRef.current = filterOptions
  const campaignFunnelMapRef = useRef<Map<string, string[]>>(campaignFunnelMap)
  campaignFunnelMapRef.current = campaignFunnelMap
  const campaignNameMapRef = useRef<Map<string, string>>(campaignNameMap)
  campaignNameMapRef.current = campaignNameMap

  // ── Phase 0: Load filter options once ──
  useEffect(() => {
    let cancelled = false

    async function loadFilterOptions() {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) {
          console.warn('[useOrganico] No workspace found')
          return
        }

        const [originsRes, assignmentsRes, plainSourcesRes, funnelsRes, mediumsRes, campaignsRes, sdrUsersRes, closerUsersRes] = await Promise.all([
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
            .select('nome, utm_campaign, funnels')
            .eq('workspace_id', wid),
          // Pré-vendedor (SDR) e Closer — mesma fonte canônica das demais abas.
          supabase.from('ghl_users').select('nome').contains('papeis', ['sdr']).eq('deleted', false).eq('workspace_id', wid).order('nome'),
          supabase.from('ghl_users').select('nome').contains('papeis', ['closer']).eq('deleted', false).eq('workspace_id', wid).order('nome'),
        ])

        if (cancelled) return

        if (originsRes.error) throw originsRes.error
        if (assignmentsRes.error) throw assignmentsRes.error
        if (plainSourcesRes.error) throw plainSourcesRes.error
        if (funnelsRes.error) throw funnelsRes.error
        if (mediumsRes.error) throw mediumsRes.error

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

        const origins: OriginOption[] = [
          ...((originsRes.data ?? []) as OriginOption[]),
          { id: '__unknown__', nome: 'Desconhecido' },
        ]

        const allAssignments = (assignmentsRes.data ?? []) as { utm_source: string; origin_id: string }[]

        const plainData = (plainSourcesRes.data ?? []) as {
          nome: string
          slug: string
          utm_source: string
        }[]

        // organicSourceSet: all utm_source values from utm_sources_plain
        const organicSourceSet = new Set(plainData.map((s) => s.utm_source).filter(Boolean))

        // allChannels: only organic channels
        const channelMap = new Map<string, ChannelOption>()
        for (const s of plainData) {
          if (s.utm_source) {
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

        const opts: OrganicoFilterOptions = {
          origins,
          allAssignments,
          allChannels,
          paidSourcesSet: new Set(),
          sourcePublicCode: new Map(),
          organicSourceSet,
          sdrs,
          closers,
        }

        // mediumNameMap: código numérico (como string) → nome amigável
        const rawMediums = (mediumsRes.data ?? []) as { nome: string; utm_medium: number | null }[]
        const builtMediumMap = new Map<string, string>()
        for (const m of rawMediums) {
          if (m.utm_medium != null) {
            builtMediumMap.set(String(m.utm_medium), m.nome)
          }
        }
        setMediumNameMap(builtMediumMap)

        setFilterOptions(opts)
        filterOptionsRef.current = opts
        setOptionsReady(true)
      } catch (err) {
        if (!cancelled) console.error('[useOrganico] filterOptions error', err)
      }
    }

    void loadFilterOptions()
    return () => { cancelled = true }
  }, [])

  // ── Phase 1: Load main data when filters change ──
  // Referência estável dos filtros que disparam o fetch (compara por conteúdo)
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

  // Dataset principal cacheado — `enabled` espera a Phase 0 (opções) terminar,
  // que é o que o `if (!optionsReady) return` fazia no useEffect antigo.
  const dataQuery = useQuery({
    queryKey: ['organico', 'dataset', filtersStable, recuperacaoMode],
    enabled: optionsReady,
    queryFn: async (): Promise<OrganicoQueryResult> => {
      const filters = filtersStable
      {
        const wid = await getWorkspaceId()
        if (!wid) {
          console.warn('[useOrganico] No workspace found')
          return EMPTY_ORGANICO_RESULT
        }
        const startISO = toSPISOStart(filters.startDate)
        const endISO = toSPISOEnd(filters.endDate)
        const opts = filterOptionsRef.current

        // ── 1a: Oportunidades with pagination ──
        const PAGE_SIZE = 1000
        // Cursor por data (não OFFSET): páginas profundas com este select
        // estouravam o statement_timeout — 500 no PostgREST.
        const allRows = await fetchAllPagesByTimeCursor<OppRow>(
          (cursor) =>
            (() => {
              const base = supabase
                .from('oportunidades')
                .select(OPP_SELECT)
                .eq('workspace_id', wid)
                .gte('data_lead_recebido', cursor ?? startISO)
                .lte('data_lead_recebido', endISO)
              return (
                applyRecuperacaoFilter(base as unknown as RecuperacaoQueryLike, recuperacaoMode) as unknown as typeof base
              )
                .order('data_lead_recebido', { ascending: true })
                .order('id', { ascending: true }) as never
            })(),
          { pageSize: PAGE_SIZE, getTime: (r) => r.data_lead_recebido },
        )

        // ── 1b: Filter — only organic leads ──
        let rows = allRows.filter((r) => {
          const src = r.contatos?.utm_source
          return src != null && src !== '' && opts.organicSourceSet.has(src)
        })

        // ── 1c: Client-side filtering by origin/subCategory/channel ──
        if (isFilterActive(filters.origin)) {
          const includeUnknown = filters.origin.include.includes('__unknown__')
          const knownIncludes = filters.origin.include.filter((id) => id !== '__unknown__')
          const knownExcludes = filters.origin.exclude.filter((id) => id !== '__unknown__')
          const excludeUnknown = filters.origin.exclude.includes('__unknown__')
          const includeSourceSet = new Set(opts.allAssignments.filter((a) => knownIncludes.includes(a.origin_id)).map((a) => a.utm_source))
          const excludeSourceSet = new Set(opts.allAssignments.filter((a) => knownExcludes.includes(a.origin_id)).map((a) => a.utm_source))
          rows = rows.filter((r) => {
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
              if (name.toLowerCase().startsWith('[cp]')) {
                return contactTags.some((t) => t.toLowerCase() === name.toLowerCase())
              }
              return campaignNameFromUtm.toLowerCase() === name.toLowerCase()
            }

            if (exclude.length > 0 && exclude.some((n) => matchesCampaign(n))) return false
            if (include.length > 0) return include.some((n) => matchesCampaign(n))
            return true
          })
        }

        // Filtro por data de criação do contato (lógica GHL)
        rows = filterByLeadDate(rows, filters.startDate, filters.endDate)

        if (filters.mqlFilter === 'mql') {
          rows = rows.filter((r) => isMqlByTag(r.contatos))
        }

        if (isFilterActive(filters.sdrs)) {
          rows = rows.filter((r) => applyFilterValue(normalizeAttribution(resolveSdrName(r)), filters.sdrs))
        }
        if (isFilterActive(filters.closers)) {
          rows = rows.filter((r) => applyFilterValue(normalizeAttribution(resolveCloserName(r)), filters.closers))
        }

        // Safeguard: deduplicar por opp.id
        const seenIds = new Set<string>()
        rows = rows.filter((r) => {
          if (seenIds.has(r.id)) return false
          seenIds.add(r.id)
          return true
        })

        // ── 1d: Revenue ──
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

        return { opps: rows, revenueRows: filteredRevenue }
      }
    },
  })

  const data = dataQuery.data ?? EMPTY_ORGANICO_RESULT

  return {
    opps: data.opps,
    revenueRows: data.revenueRows,
    filterOptions,
    funnelNames,
    campaignFunnelMap,
    campaignNameMap,
    organicSourceSet: filterOptions.organicSourceSet,
    mediumNameMap,
    // `optionsReady` falso = Phase 0 ainda rodando: a query está desabilitada e
    // `isPending` seria true para sempre. Tratamos como carregando, que é o certo.
    loading: !optionsReady || dataQuery.isPending,
    error: dataQuery.error ? messageOfOrganico(dataQuery.error) : null,
  }
}
