import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { usePermissions } from '@/contexts/PermissionsContext'
import { parseTags } from './useTrafego'
import type { FilterValues } from '@/types/filters'
import { emptyFilter } from '@/types/filters'
import { PIPELINE_VENDAS_SQL_ID } from '@/lib/constants'

export interface SdrIaConfig {
  tags: FilterValues
  pipelines: FilterValues
  utmSource: FilterValues
  utmCampaign: FilterValues
}

/**
 * Reproduz o comportamento hardcoded que useAuditoriaIA.ts tinha antes da
 * config existir — usado como fallback caso o workspace ainda não tenha
 * uma linha em sdr_ia_config (não deveria acontecer após o backfill da
 * migration, mas evita quebrar se algo escapar).
 */
export function defaultSdrIaConfig(): SdrIaConfig {
  return {
    tags: emptyFilter(),
    pipelines: { include: [], exclude: [PIPELINE_VENDAS_SQL_ID] },
    utmSource: emptyFilter(),
    utmCampaign: emptyFilter(),
  }
}

function parseFilterValues(raw: unknown): FilterValues {
  if (
    raw &&
    typeof raw === 'object' &&
    Array.isArray((raw as { include?: unknown }).include) &&
    Array.isArray((raw as { exclude?: unknown }).exclude)
  ) {
    return {
      include: (raw as { include: string[] }).include,
      exclude: (raw as { exclude: string[] }).exclude,
    }
  }
  return emptyFilter()
}

interface ConfigRow {
  tags_filter: unknown
  pipelines_filter: unknown
  utm_source_filter: unknown
  utm_campaign_filter: unknown
}

export interface UseSdrIaConfigResult {
  config: SdrIaConfig
  loading: boolean
  error: string | null
  saving: boolean
  reload: () => void
  saveConfig: (config: SdrIaConfig) => Promise<void>
}

export function useSdrIaConfig(): UseSdrIaConfigResult {
  const [config, setConfig] = useState<SdrIaConfig>(defaultSdrIaConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { hasFeaturePermission } = usePermissions()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const wid = await getWorkspaceId()
      if (!wid) return

      const { data, error: err } = await supabase
        .from('sdr_ia_config')
        .select('tags_filter, pipelines_filter, utm_source_filter, utm_campaign_filter')
        .eq('workspace_id', wid)
        .maybeSingle()

      if (err) throw err

      if (data) {
        const row = data as unknown as ConfigRow
        setConfig({
          tags: parseFilterValues(row.tags_filter),
          pipelines: parseFilterValues(row.pipelines_filter),
          utmSource: parseFilterValues(row.utm_source_filter),
          utmCampaign: parseFilterValues(row.utm_campaign_filter),
        })
      } else {
        setConfig(defaultSdrIaConfig())
      }
    } catch (err) {
      console.error('[useSdrIaConfig]', err)
      setError(err instanceof Error ? err.message : 'Erro ao carregar configuração')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const saveConfig = async (next: SdrIaConfig): Promise<void> => {
    if (!hasFeaturePermission('sdr-ia', 'configuracao')) {
      throw new Error('Você não tem permissão para alterar essa configuração')
    }
    setSaving(true)
    try {
      const wid = await getWorkspaceId()
      if (!wid) throw new Error('Conta não encontrada')

      const { error: err } = await supabase.from('sdr_ia_config').upsert(
        {
          workspace_id: wid,
          tags_filter: next.tags,
          pipelines_filter: next.pipelines,
          utm_source_filter: next.utmSource,
          utm_campaign_filter: next.utmCampaign,
        },
        { onConflict: 'workspace_id' }
      )

      if (err) throw err
      setConfig(next)
    } finally {
      setSaving(false)
    }
  }

  return { config, loading, error, saving, reload: load, saveConfig }
}

async function fetchAllRows<T>(
  queryFn: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000
  let all: T[] = []
  let page = 0
  while (true) {
    const { data, error } = await queryFn(page * PAGE, (page + 1) * PAGE - 1)
    if (error) throw new Error(error.message)
    all = all.concat(data ?? [])
    if ((data?.length ?? 0) < PAGE) break
    page++
  }
  return all
}

export interface SdrIaFilterOptions {
  tags: string[]
  pipelines: { value: string; label: string }[]
  utmSources: string[]
  utmCampaigns: string[]
  loading: boolean
}

/**
 * Enumera valores reais existentes no workspace pra popular os
 * MultiSelectFilter da tela de Configuração — mesmo padrão anti-truncamento
 * de 1000 linhas (paginação via .range()) usado em useAllGhlTags/useLeads.
 */
export function useSdrIaFilterOptions(): SdrIaFilterOptions {
  const [tags, setTags] = useState<string[]>([])
  const [pipelines, setPipelines] = useState<{ value: string; label: string }[]>([])
  const [utmSources, setUtmSources] = useState<string[]>([])
  const [utmCampaigns, setUtmCampaigns] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const wid = await getWorkspaceId()
        if (!wid) return

        const [tagRows, pipeRows, sourceRows, campaignRows] = await Promise.all([
          fetchAllRows<{ tags: string | null }>((from, to) =>
            supabase
              .from('contatos')
              .select('tags')
              .eq('workspace_id', wid)
              .not('tags', 'is', null)
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows<{ pipeline_id: string | null; pipeline_name: string | null }>((from, to) =>
            supabase
              .from('oportunidades')
              .select('pipeline_id, pipeline_name')
              .eq('workspace_id', wid)
              .not('pipeline_id', 'is', null)
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows<{ utm_source: string | null }>((from, to) =>
            supabase
              .from('contatos')
              .select('utm_source')
              .eq('workspace_id', wid)
              .not('utm_source', 'is', null)
              .order('id', { ascending: true })
              .range(from, to)
          ),
          fetchAllRows<{ utm_campaign: string | null }>((from, to) =>
            supabase
              .from('contatos')
              .select('utm_campaign')
              .eq('workspace_id', wid)
              .not('utm_campaign', 'is', null)
              .order('id', { ascending: true })
              .range(from, to)
          ),
        ])

        if (cancelled) return

        const tagSet = new Set<string>()
        for (const row of tagRows) {
          for (const t of parseTags(row.tags)) {
            const trimmed = t.trim()
            if (trimmed) tagSet.add(trimmed)
          }
        }

        const pipeMap = new Map<string, string>()
        for (const row of pipeRows) {
          if (row.pipeline_id && !pipeMap.has(row.pipeline_id)) {
            pipeMap.set(row.pipeline_id, row.pipeline_name || row.pipeline_id)
          }
        }

        const sourceSet = new Set<string>()
        for (const row of sourceRows) {
          if (row.utm_source) sourceSet.add(row.utm_source)
        }

        const campaignSet = new Set<string>()
        for (const row of campaignRows) {
          if (row.utm_campaign) campaignSet.add(String(row.utm_campaign))
        }

        setTags([...tagSet].sort((a, b) => a.localeCompare(b, 'pt-BR')))
        setPipelines(
          [...pipeMap.entries()]
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
        )
        setUtmSources([...sourceSet].sort((a, b) => a.localeCompare(b, 'pt-BR')))
        setUtmCampaigns([...campaignSet].sort((a, b) => a.localeCompare(b, 'pt-BR')))
      } catch (err) {
        console.error('[useSdrIaFilterOptions]', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return { tags, pipelines, utmSources, utmCampaigns, loading }
}
