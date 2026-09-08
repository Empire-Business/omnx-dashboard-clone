import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { PIPELINE_RECUPERACAO_ID } from '@/lib/constants'
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { fetchAllPagesByTimeCursor } from '@/lib/supabase/paginate'
import type { OppRow, MetaRow, RevenueRow } from './useTrafego'
import { parseTags } from './useTrafego'
import type { CriativosFilters } from './useCriativosFilters'
import { isFilterActive } from '@/types/filters'

export interface CreativeRankingData {
  opps: OppRow[]
  metaRows: MetaRow[]
  revenueRows: RevenueRow[]
  creativeMap: Map<string, string>
  creativeAdUrlMap: Map<string, string>
  publicNameMap: Map<string, string>
  loading: boolean
  error: string | null
}

export function useCreativeRankingData(
  filters: CriativosFilters,
  enabled: boolean = true,
): CreativeRankingData {
  const [opps, setOpps] = useState<OppRow[]>([])
  const [metaRows, setMetaRows] = useState<MetaRow[]>([])
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>([])
  const [creativeMap, setCreativeMap] = useState<Map<string, string>>(new Map())
  const [creativeAdUrlMap, setCreativeAdUrlMap] = useState<Map<string, string>>(new Map())
  const [publicNameMap, setPublicNameMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const utmCampaignsRef = useRef<{ nome: string; utm_campaign: string; funnels: unknown }[]>([])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    setLoading(true)
    setError(null)

    async function loadData() {
      try {
        const wid = await getWorkspaceId()
        if (cancelled || !wid) return

        const startISO = toSPISOStart(filters.startDate)
        const endISO = toSPISOEnd(filters.endDate)

        // Oportunidades no período (exclui recuperação)
        const OPP_SELECT = `
          id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
          lost_reason, vendedor_closer, status, sdr_name,
          data_lead_recebido, data_conectado, data_qualificado,
          data_no_show, data_agendamento_reuniao, data_reuniao_agendada,
          data_realizacao_vendas, data_fechado,
          data_perdido, data_perdido_vendas, data_negociacao,
          data_no_show_vendas, data_agendamento_vendas,
          data_pendencias_preenchimento,
          data_auto_agendamento,
          resumo_ia, percepcao_closer,
          contatos!inner(
            ghl_id, nome, email, telefone,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            fbclid, gclid,
            tt_source, tt_campaign, tt_medium, tt_term, tt_content,
            owner_name, owner_email, date_created, print_instagram,
            como_nos_conheceu, faturamento_anual, perfil_inteligente,
            tags, contact_source, workspace_id
          )
        `

        const PAGE_SIZE = 1000
        // Cursor por data (não OFFSET): páginas profundas com este select
        // estouravam o statement_timeout — 500 no PostgREST. O desempate por
        // `id` também estava faltando: sem ele o corte entre páginas era
        // indefinido e podia repetir ou perder linhas.
        const allOpps = await fetchAllPagesByTimeCursor<OppRow>(
          (cursor) =>
            supabase
              .from('oportunidades')
              .select(OPP_SELECT)
              .eq('workspace_id', wid)
              .gte('data_lead_recebido', cursor ?? startISO)
              .lte('data_lead_recebido', endISO)
              .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
              .order('data_lead_recebido', { ascending: true })
              .order('id', { ascending: true }) as never,
          { pageSize: PAGE_SIZE, getTime: (r) => r.data_lead_recebido },
        )
        if (cancelled) return

        // Meta ads
        const META_PAGE_SIZE = 1000
        let allMetaRows: MetaRow[] = []
        let metaPage = 0
        while (true) {
          const res = await supabase
            .from('meta_ads_insights')
            .select('spend, impressions, clicks, ctr, cpm, actions, campaign_name, adset_name, ad_name, date, landing_page_views, video_views, link_clicks, leads')
            .eq('workspace_id', wid)
            .gte('date', filters.startDate)
            .lte('date', filters.endDate)
            .order('date', { ascending: true })
            // desempate único: (date, ad_id) é UNIQUE — sem isso a paginação
            // por range é instável e pode pular/duplicar linhas no corte da página
            .order('ad_id', { ascending: true })
            .range(metaPage * META_PAGE_SIZE, (metaPage + 1) * META_PAGE_SIZE - 1)
          if (cancelled) return
          if (res.error) throw res.error
          allMetaRows = allMetaRows.concat((res.data ?? []) as MetaRow[])
          if ((res.data?.length ?? 0) < META_PAGE_SIZE) break
          metaPage++
        }

        // Revenue — vendas_fechamento não tem workspace_id direto, então
        // restringe pelo conjunto de oportunidades já isoladas por workspace
        // acima (allOpps), evitando misturar faturamento de outros workspaces.
        const oppIdsInWorkspace = new Set(allOpps.map((o) => o.id))
        const REV_PAGE_SIZE = 1000
        let allRevenueRowsRaw: RevenueRow[] = []
        let revPage = 0
        while (true) {
          const res = await supabase
            .from('vendas_fechamento')
            .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada, link_gravacao_call_vendas')
            .eq('workspace_id', wid)
            .gte('data_pagamento_entrada', startISO)
            .order('oportunidade_id', { ascending: true })
            .range(revPage * REV_PAGE_SIZE, (revPage + 1) * REV_PAGE_SIZE - 1)
          if (cancelled) return
          if (res.error) throw res.error
          allRevenueRowsRaw = allRevenueRowsRaw.concat((res.data ?? []) as RevenueRow[])
          if ((res.data?.length ?? 0) < REV_PAGE_SIZE) break
          revPage++
        }
        const allRevenueRows = allRevenueRowsRaw.filter((r) => oppIdsInWorkspace.has(r.oportunidade_id))

        // Dados auxiliares
        const [{ data: creativesData }, { data: permalinksData }, { data: sourcesData }, { data: campaignsData }] = await Promise.all([
          supabase.from('notion_creatives').select('external_id, name, final_asset_url').eq('workspace_id', wid),
          supabase.from('meta_ads_permalinks').select('creative_code, instagram_permalink_url, permalink_url').eq('workspace_id', wid).not('creative_code', 'is', null),
          supabase.from('utm_sources').select('nome, public_code').eq('workspace_id', wid),
          supabase.from('utm_campaigns').select('nome, utm_campaign, funnels').eq('workspace_id', wid),
        ])

        if (cancelled) return

        utmCampaignsRef.current = (campaignsData ?? []) as { nome: string; utm_campaign: string; funnels: unknown }[]

        const nameMap = new Map<string, string>()
        for (const c of (creativesData ?? []) as { external_id: string | null; name: string | null }[]) {
          if (c.external_id && c.name) nameMap.set(c.external_id, c.name)
        }

        const metaUrlMap = new Map<string, string>()
        for (const p of (permalinksData ?? []) as { creative_code: string | null; instagram_permalink_url: string | null; permalink_url: string | null }[]) {
          if (p.creative_code) {
            const url = p.instagram_permalink_url ?? p.permalink_url
            if (url) metaUrlMap.set(p.creative_code, url)
          }
        }
        const fallbackUrlMap = new Map<string, string>()
        for (const c of (creativesData ?? []) as { external_id: string | null; final_asset_url: string | null }[]) {
          if (c.external_id && c.final_asset_url) fallbackUrlMap.set(c.external_id, c.final_asset_url)
        }
        const urlMap = new Map<string, string>()
        const allCodes = new Set([...metaUrlMap.keys(), ...fallbackUrlMap.keys()])
        for (const code of allCodes) {
          const url = metaUrlMap.get(code) ?? fallbackUrlMap.get(code)
          if (url) urlMap.set(code, url)
        }

        const pubMap = new Map<string, string>()
        for (const s of (sourcesData ?? []) as { nome: string | null; public_code: string | null }[]) {
          if (s.public_code && s.nome) pubMap.set(s.public_code, s.nome)
        }

        if (cancelled) return
        setOpps(allOpps)
        setMetaRows(allMetaRows)
        setRevenueRows(allRevenueRows)
        setCreativeMap(nameMap)
        setCreativeAdUrlMap(urlMap)
        setPublicNameMap(pubMap)
      } catch (err) {
        if (!cancelled) {
          console.error('[useCreativeRankingData] error', err)
          setError(err instanceof Error ? err.message : 'Erro ao carregar ranking')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => { cancelled = true }
  }, [enabled, filters.startDate, filters.endDate])

  const filteredOpps = useMemo(() => {
    let rows = opps

    if (isFilterActive(filters.channels)) {
      rows = rows.filter((r) => {
        const src = r.contatos?.utm_source ?? ''
        if (filters.channels.exclude.includes(src)) return false
        if (filters.channels.include.length > 0) return filters.channels.include.includes(src)
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

    if (isFilterActive(filters.cpTags)) {
      const utmCampaigns = utmCampaignsRef.current
      const includeCodes = filters.cpTags.include.length > 0
        ? new Set(utmCampaigns.filter((c) => filters.cpTags.include.includes(c.nome)).map((c) => String(c.utm_campaign)))
        : null
      const excludeCodes = filters.cpTags.exclude.length > 0
        ? new Set(utmCampaigns.filter((c) => filters.cpTags.exclude.includes(c.nome)).map((c) => String(c.utm_campaign)))
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

    return rows
  }, [opps, filters.channels, filters.funilTags, filters.cpTags])

  const filteredMetaRows = useMemo(() => {
    let rows = metaRows

    if (isFilterActive(filters.campaigns)) {
      rows = rows.filter((r) => {
        const name = r.campaign_name ?? ''
        if (filters.campaigns.exclude.includes(name)) return false
        if (filters.campaigns.include.length > 0) return filters.campaigns.include.includes(name)
        return true
      })
    }

    if (isFilterActive(filters.adsets)) {
      rows = rows.filter((r) => {
        const name = r.adset_name ?? ''
        if (filters.adsets.exclude.includes(name)) return false
        if (filters.adsets.include.length > 0) return filters.adsets.include.includes(name)
        return true
      })
    }

    if (isFilterActive(filters.ads)) {
      rows = rows.filter((r) => {
        const name = r.ad_name ?? ''
        if (filters.ads.exclude.includes(name)) return false
        if (filters.ads.include.length > 0) return filters.ads.include.includes(name)
        return true
      })
    }

    return rows
  }, [metaRows, filters.campaigns, filters.adsets, filters.ads])

  return {
    opps: filteredOpps,
    metaRows: filteredMetaRows,
    revenueRows,
    creativeMap,
    creativeAdUrlMap,
    publicNameMap,
    loading,
    error,
  }
}
