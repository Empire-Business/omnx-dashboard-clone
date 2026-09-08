import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { extractErrorMessage } from '@/lib/errors'
import type { GhlPipelineMapping, GhlPipelineCategory } from '@/types/ghl-config'

const QUERY_KEY = 'ghl-pipeline-mappings'

async function fetchGhlPipelineMappings(): Promise<GhlPipelineMapping[]> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase
    .from('ghl_pipeline_mappings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('ghl_pipeline_name', { ascending: true })

  if (error) throw error

  return (data ?? []) as GhlPipelineMapping[]
}

export interface SavePipelineMappingsInput {
  mappings: Array<{
    ghl_pipeline_id: string
    ghl_pipeline_name: string | null
    system_category: GhlPipelineCategory | null
    is_excluded?: boolean
  }>
}

async function savePipelineMappings(input: SavePipelineMappingsInput): Promise<void> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const rows = input.mappings.map((m) => ({
    workspace_id: workspaceId,
    ghl_pipeline_id: m.ghl_pipeline_id,
    ghl_pipeline_name: m.ghl_pipeline_name,
    system_category: m.system_category,
    is_excluded: m.system_category === 'excluir' || (m.is_excluded ?? false),
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('ghl_pipeline_mappings').upsert(rows, {
    onConflict: 'workspace_id, ghl_pipeline_id',
  })

  if (error) throw error
}

export function useGhlPipelineMappings() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchGhlPipelineMappings,
  })
}

export function useSaveGhlPipelineMappings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: savePipelineMappings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      toast.success('Mapeamento de pipelines salvo')
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err, 'Erro ao salvar mapeamento de pipelines'))
    },
  })
}
