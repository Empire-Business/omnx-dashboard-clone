import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { extractErrorMessage } from '@/lib/errors'
import type { GhlStageMapping, GhlSystemStage } from '@/types/ghl-config'

const QUERY_KEY = 'ghl-stage-mappings'

async function fetchGhlStageMappings(): Promise<GhlStageMapping[]> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase
    .from('ghl_stage_mappings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('ghl_stage_name', { ascending: true })

  if (error) throw error

  return (data ?? []) as GhlStageMapping[]
}

export interface SaveStageMappingsInput {
  mappings: Array<{
    ghl_pipeline_id: string
    ghl_stage_id: string
    ghl_stage_name: string | null
    system_stage: GhlSystemStage | null
  }>
}

async function saveStageMappings(input: SaveStageMappingsInput): Promise<void> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const rows = input.mappings.map((m) => ({
    workspace_id: workspaceId,
    ghl_pipeline_id: m.ghl_pipeline_id,
    ghl_stage_id: m.ghl_stage_id,
    ghl_stage_name: m.ghl_stage_name,
    system_stage: m.system_stage,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('ghl_stage_mappings').upsert(rows, {
    onConflict: 'workspace_id, ghl_pipeline_id, ghl_stage_id',
  })

  if (error) throw error
}

export function useGhlStageMappings() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchGhlStageMappings,
  })
}

export function useSaveGhlStageMappings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveStageMappings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      toast.success('Mapeamento de stages salvo')
    },
    onError: (err) => {
      toast.error(extractErrorMessage(err, 'Erro ao salvar mapeamento de stages'))
    },
  })
}
