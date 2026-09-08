import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { fetchAllPages } from '@/lib/supabase/paginate'
import { getWorkspaceId } from '@/lib/workspace'
import { toast } from 'sonner'
import type { CreativeFormInput, NotionCreative } from '@/types/creatives'

// ─── Types ─────────────────────────────────────────────────────

export type CreativeType = 'copy' | 'imagem' | 'video' | 'hook' | 'cta'
export type CreativeMvpStatus = 'testando' | 'aprovado' | 'reprovado'
export type CreativeSource = 'notion' | 'native' | 'import'

export type { NotionCreative }

export interface CreativeMetric {
  creative_code: string | null
  total_spend: number | null
  total_impressions: number | null
  total_clicks: number | null
  leads_meta: number | null
  leads_crm: number | null
  mql_count: number | null
  sales_count: number | null
  revenue: number | null
  cpl_meta: number | null
  cpl_crm: number | null
  cpmql: number | null
  cpv: number | null
  roas: number | null
}

export interface AdCampaign {
  id: string
  code: string
  objective_name: string | null
  page_name: string | null
}

export interface UpdateCreativeInput {
  creative_type?: CreativeType | null
  mvp_status?: CreativeMvpStatus | null
  learning?: string | null
  campaign_id?: string | null
  assigned_to?: string | null
}

// ─── Hooks ─────────────────────────────────────────────────────

// Paginado de propósito. Sem `.range()`, o PostgREST devolve no máximo 1000 linhas
// SEM erro e SEM aviso (ver CLAUDE.md, "LIMITE CRÍTICO: max_rows = 1000"), e a base de
// criativos da Empire já passou disso. O sintoma reportado na reunião de 2026-08-28
// (BUG-02/BUG-03) era exatamente esse: Biblioteca travada em "1000 registros" e Kanban
// vazio — o cron do Notion reescreve os ~1.2k registros 2x/dia e o trigger
// `trigger_notion_creatives_updated_at` carimba `updated_at = now()` em todos, então os
// criativos nativos (parados há semanas) caíam para fora da janela dos 1000 primeiros.
// O desempate por `id` é obrigatório: sem ele o corte entre páginas é indefinido.
export function useCriativosList(databaseType?: 'paid' | 'organic') {
  return useQuery({
    queryKey: ['criativos', 'list', databaseType ?? 'all'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      return await fetchAllPages<NotionCreative>(() => {
        let query = supabase
          .from('notion_creatives')
          .select('*')
          .eq('workspace_id', workspaceId)

        if (databaseType) {
          query = query.eq('database_type', databaseType)
        }

        return query
          .order('updated_at', { ascending: false })
          .order('id', { ascending: true })
      })
    },
  })
}

export interface CriativosMetricFilters {
  campaigns?: string[]
  adsets?: string[]
  ads?: string[]
  channels?: string[]
  funilTags?: string[]
  cpTags?: string[]
}

export function useCriativosMetrics(
  workspaceId: string | undefined,
  startDate: string,
  endDate: string,
  creativeCodes: string[],
  extraFilters: CriativosMetricFilters = {}
) {
  return useQuery({
    queryKey: ['criativos', 'metrics', workspaceId, startDate, endDate, creativeCodes, extraFilters],
    queryFn: async () => {
      if (!workspaceId || creativeCodes.length === 0) return [] as CreativeMetric[]
      const { data, error } = await supabase.rpc('get_creative_metrics', {
        p_workspace_id: workspaceId,
        p_start_date: startDate,
        p_end_date: endDate,
        p_creative_id: null,
        p_campaign_names: extraFilters.campaigns?.length ? extraFilters.campaigns : null,
        p_adset_names: extraFilters.adsets?.length ? extraFilters.adsets : null,
        p_ad_names: extraFilters.ads?.length ? extraFilters.ads : null,
        p_channels: extraFilters.channels?.length ? extraFilters.channels : null,
        p_funil_tags: extraFilters.funilTags?.length ? extraFilters.funilTags : null,
        p_cp_tags: extraFilters.cpTags?.length ? extraFilters.cpTags : null,
      })
      if (error) throw error
      return (data ?? []) as CreativeMetric[]
    },
    enabled: !!workspaceId && creativeCodes.length > 0,
  })
}

export function useAdCampaigns() {
  return useQuery({
    queryKey: ['criativos', 'campaigns'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { data, error } = await supabase
        .from('ads_campaigns')
        .select('id, code, objective_name, page_name')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })

      if (error) throw error
      return (data ?? []) as AdCampaign[]
    },
  })
}

// MEL-01, reunião de 2026-08-28: o seletor "Campanha" do formulário lia `ads_campaigns` e
// vinha sempre vazio — as campanhas reais do time (Código da Audiência, Aplicação, BPO,
// Máfia Russa) não moram lá. Elas moram em `notion_creatives.objective`, que é onde o sync
// do Notion grava o campo "Objetivo" de lá. Então a lista de campanhas é a lista de valores
// distintos dessa coluna.
//
// Paginado porque `notion_creatives` já passa de 1000 linhas e o PostgREST corta em silêncio
// (CLAUDE.md, "LIMITE CRÍTICO: max_rows = 1000"). O DISTINCT é feito no cliente: o PostgREST
// não expõe `SELECT DISTINCT`, e o volume (~1,2 mil strings curtas) não justifica uma RPC.
export function useCreativeCampaigns() {
  return useQuery({
    queryKey: ['criativos', 'campanhas-objective'],
    queryFn: async () => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const rows = await fetchAllPages<{ id: string; objective: string | null }>(() =>
        supabase
          .from('notion_creatives')
          .select('id, objective')
          .eq('workspace_id', workspaceId)
          .not('objective', 'is', null)
          .order('id', { ascending: true }),
      )

      const unicos = new Set<string>()
      for (const row of rows) {
        const nome = row.objective?.trim()
        if (nome) unicos.add(nome)
      }

      return Array.from(unicos).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    },
  })
}

export function useUpdateCriativo() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateCreativeInput }) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { error } = await supabase
        .from('notion_creatives')
        .update({
          ...input,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('workspace_id', workspaceId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criativos', 'list'] })
      toast.success('Criativo atualizado')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    },
  })
}

export function useCreateCreative() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreativeFormInput) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { data: codeData, error: codeError } = await supabase.functions.invoke<{ code: string }>(
        'generate-creative-code',
        {
          body: { workspaceId, prefix: 'AN' },
        }
      )

      if (codeError) throw codeError
      if (!codeData?.code) throw new Error('Código do criativo não foi gerado')

      const { data: { user } } = await supabase.auth.getUser()

      // MEL-19, reunião de 2026-08-28: o criativo nascia sempre em 'ideia', mas o time
      // costuma cadastrar o criativo já pronto. Agora o status vem do formulário; 'ideia'
      // continua sendo o padrão quando o campo vier vazio.
      const { status: statusEscolhido, ...campos } = input

      const linha = {
        workspace_id: workspaceId,
        external_id: codeData.code,
        source: 'native',
        database_type: 'paid',
        created_by: user?.id ?? null,
        ...campos,
        status: statusEscolhido?.trim() ? statusEscolhido : 'ideia',
      }

      const { error } = await supabase.from('notion_creatives').insert(linha)

      if (error) throw error
      return codeData.code
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criativos', 'list'] })
      toast.success('Criativo criado')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao criar criativo')
    },
  })
}

export function useUpdateCreativeFull() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: CreativeFormInput }) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      // Status só vai no UPDATE se o formulário mandou algum — assim uma edição não
      // zera o status atual do criativo (MEL-19).
      const { status: statusEscolhido, ...campos } = input

      const patch = {
        ...campos,
        ...(statusEscolhido?.trim() ? { status: statusEscolhido } : {}),
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('notion_creatives')
        .update(patch)
        .eq('id', id)
        .eq('workspace_id', workspaceId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criativos', 'list'] })
      toast.success('Criativo atualizado')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar criativo')
    },
  })
}

export function useUpdateCreativeStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { error } = await supabase
        .from('notion_creatives')
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('workspace_id', workspaceId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criativos', 'list'] })
      toast.success('Status atualizado')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar status')
    },
  })
}

// BUG-06, reunião de 2026-08-28: mover vários cards de uma vez no Kanban.
// Não dá para reusar `useUpdateCreativeStatus` em laço — ela é por id e dispara um toast
// por chamada, então mover 10 cards viraria 10 UPDATEs e 10 toasts. Um `.in('id', ids)`
// resolve em uma query só, com o mesmo filtro de workspace.
export function useBulkUpdateCreativeStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { error } = await supabase
        .from('notion_creatives')
        .update({ status, updated_at: new Date().toISOString() })
        .in('id', ids)
        .eq('workspace_id', workspaceId)

      if (error) throw error
      return ids.length
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['criativos', 'list'] })
      toast.success(`${count} criativos movidos`)
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao mover criativos')
    },
  })
}

export interface UpdateCreativeApprovalInput {
  tags: string[]
  observations?: string | null
}

export function useUpdateCreativeApproval() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: UpdateCreativeApprovalInput }) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { error } = await supabase
        .from('notion_creatives')
        .update({
          tags: input.tags,
          observations: input.observations ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('workspace_id', workspaceId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['criativos', 'list'] })
      toast.success('Aprovação atualizada')
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar aprovação')
    },
  })
}
