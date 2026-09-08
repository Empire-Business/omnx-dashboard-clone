import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { extractErrorMessage } from '@/lib/errors'
import { groupFieldMappingsByLogicalName } from '@/lib/ghl-mapping'
import type { GhlFieldMapping } from '@/types/ghl-config'

const QUERY_KEY = 'ghl-field-mappings'

async function fetchGhlFieldMappings(): Promise<GhlFieldMapping[]> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase
    .from('ghl_field_mappings')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('logical_name', { ascending: true })

  if (error) throw error

  return (data ?? []) as GhlFieldMapping[]
}

export interface SaveFieldMappingsInput {
  mappings: Array<{
    logical_name: string
    ghl_field_key: string | null
    ghl_field_id: string | null
    field_type: string | null
    variations?: string[]
    is_required?: boolean
    enabled?: boolean
  }>
}

async function saveFieldMappings(input: SaveFieldMappingsInput): Promise<void> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  // Defesa em profundidade: o upsert usa onConflict 'workspace_id, logical_name',
  // então o lote não pode ter logical_name repetido — agrupamos aqui mesmo que o
  // caller envie uma row por campo (vários campos GHL → mesmo logical_name).
  const grouped = groupFieldMappingsByLogicalName(input.mappings)

  const rows = grouped.map((m) => ({
    workspace_id: workspaceId,
    logical_name: m.logical_name,
    ghl_field_key: m.ghl_field_key,
    ghl_field_id: m.ghl_field_id,
    field_type: m.field_type,
    variations: m.variations ?? [],
    is_required: m.is_required ?? false,
    enabled: m.enabled ?? true,
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('ghl_field_mappings').upsert(rows, {
    onConflict: 'workspace_id, logical_name',
  })

  if (error) throw error
}

function fieldMappingErrorMessage(err: unknown): string {
  const raw = extractErrorMessage(err, '')
  if (/cannot affect row a second time|ON CONFLICT/i.test(raw)) {
    return 'Há campos duplicados no mapeamento. Rode a busca de campos novamente e salve de novo.'
  }
  return raw || 'Erro ao salvar mapeamento de campos'
}

export function useGhlFieldMappings() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchGhlFieldMappings,
  })
}

export function useSaveGhlFieldMappings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: saveFieldMappings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      toast.success('Mapeamento de campos salvo')
    },
    onError: (err) => {
      toast.error(fieldMappingErrorMessage(err))
    },
  })
}
