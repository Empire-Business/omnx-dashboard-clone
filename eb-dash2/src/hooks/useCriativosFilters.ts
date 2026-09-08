import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { withSemAtribuicao } from '@/types/filters'

export interface FilterValues {
  include: string[]
  exclude: string[]
}

export function emptyFilter(): FilterValues {
  return { include: [], exclude: [] }
}

export function isFilterActive(f: FilterValues): boolean {
  return f.include.length > 0 || f.exclude.length > 0
}

export interface CriativosFilters {
  startDate: string
  endDate: string
  campaigns: FilterValues
  adsets: FilterValues
  ads: FilterValues
  channels: FilterValues
  funilTags: FilterValues
  cpTags: FilterValues
  mqlFilter: 'all' | 'mql'
  sdrs: FilterValues       // pré-vendedor: oportunidades.sdr_name (fallback contatos.owner_name)
  closers: FilterValues    // oportunidades.vendedor_closer (vazio = SEM_ATRIBUICAO)
}

export interface ChannelOption {
  nome: string
  slug: string
  publicCode?: string | null
}

export interface FilterOptions {
  campaigns: string[]
  adsets: string[]
  ads: string[]
  channels: ChannelOption[]
  funilTags: string[]
  cpTags: string[]
  sdrs: string[]
  closers: string[]
}

export function useCriativosFilters(startDate: string, endDate: string) {
  const [options, setOptions] = useState<FilterOptions>({
    campaigns: [],
    adsets: [],
    ads: [],
    channels: [],
    funilTags: [],
    cpTags: [],
    sdrs: [],
    closers: [],
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) return

      const META_PAGE_SIZE = 1000
      let metaPage = 0
      let allMetaOptions: { campaign_name: string | null; adset_name: string | null; ad_name: string | null }[] = []

      while (true) {
        const res = await supabase
          .from('meta_ads_insights')
          .select('campaign_name, adset_name, ad_name')
          .eq('workspace_id', workspaceId)
          .not('campaign_name', 'is', null)
          .gte('date', startDate)
          .lte('date', endDate)
          // ordenação estável obrigatória para paginação por range
          .order('date', { ascending: true })
          .order('ad_id', { ascending: true })
          .range(metaPage * META_PAGE_SIZE, (metaPage + 1) * META_PAGE_SIZE - 1)

        if (cancelled) return
        if (res.error) throw res.error

        allMetaOptions = allMetaOptions.concat((res.data ?? []) as typeof allMetaOptions)
        if ((res.data?.length ?? 0) < META_PAGE_SIZE) break
        metaPage++
      }

      const [sourcesRes, funnelsRes, campaignsRes, sdrUsersRes, closerUsersRes] = await Promise.all([
        supabase.from('utm_sources').select('nome, utm_source, public_code').eq('workspace_id', workspaceId),
        supabase.from('funnels').select('nome').eq('workspace_id', workspaceId),
        supabase.from('utm_campaigns').select('nome, funnels').eq('workspace_id', workspaceId),
        // Pré-vendedor (SDR) e Closer — mesma fonte canônica das demais abas.
        supabase.from('ghl_users').select('nome').contains('papeis', ['sdr']).eq('deleted', false).eq('workspace_id', workspaceId).order('nome'),
        supabase.from('ghl_users').select('nome').contains('papeis', ['closer']).eq('deleted', false).eq('workspace_id', workspaceId).order('nome'),
      ])

      if (cancelled) return

      const campaigns = [...new Set(allMetaOptions.map((r) => r.campaign_name).filter(Boolean))] as string[]
      const adsets = [...new Set(allMetaOptions.map((r) => r.adset_name).filter(Boolean))] as string[]
      const ads = [...new Set(allMetaOptions.map((r) => r.ad_name).filter(Boolean))] as string[]

      const channels = ((sourcesRes.data ?? []) as { nome: string; utm_source: string; public_code: string | null }[])
        .filter((r) => r.utm_source)
        .map((r) => ({ nome: r.nome || r.utm_source, slug: r.utm_source, publicCode: r.public_code }))
        .sort((a, b) => a.nome.localeCompare(b.nome))

      const funilTags = ((funnelsRes.data ?? []) as { nome: string }[])
        .map((r) => r.nome)
        .filter(Boolean)
        .sort() as string[]

      const cpTags = ((campaignsRes.data ?? []) as { nome: string }[])
        .map((r) => r.nome)
        .filter(Boolean)
        .sort() as string[]

      const sdrs = withSemAtribuicao([
        'SDR IA',
        ...((sdrUsersRes.data ?? []).map((r: { nome: string }) => r.nome).filter(Boolean) as string[]),
      ])
      const closers = withSemAtribuicao([
        ...new Set((closerUsersRes.data ?? []).map((r: { nome: string }) => r.nome).filter(Boolean)),
      ] as string[])

      setOptions({
        campaigns: campaigns.sort(),
        adsets: adsets.sort(),
        ads: ads.sort(),
        channels,
        funilTags,
        cpTags,
        sdrs,
        closers,
      })
    }

    void load().catch((err) => console.error('[useCriativosFilters] error', err))
    return () => { cancelled = true }
  }, [startDate, endDate])

  return options
}
