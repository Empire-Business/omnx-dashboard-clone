import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import type { GhlIntegrationSettings, GhlIntegrationSettingsInput } from '@/types/ghl-config'

const QUERY_KEY = 'ghl-integration-settings'

async function fetchGhlIntegrationSettings(): Promise<GhlIntegrationSettings | null> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase
    .from('ghl_integration_settings')
    .select('id, workspace_id, ghl_location_id, webhook_secret, webhook_url, is_active, created_at, updated_at')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (error) throw error

  return (data as GhlIntegrationSettings | null) ?? null
}

async function upsertGhlIntegrationSettings(input: GhlIntegrationSettingsInput): Promise<GhlIntegrationSettings> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data: existing, error: findError } = await supabase
    .from('ghl_integration_settings')
    .select('id')
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (findError) throw findError

  const payload = {
    workspace_id: workspaceId,
    ghl_location_id: input.ghl_location_id,
    webhook_secret: input.webhook_secret ?? null,
    webhook_url: input.webhook_url ?? null,
    is_active: input.is_active ?? true,
    updated_at: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data, error } = await supabase
      .from('ghl_integration_settings')
      .update(payload)
      .eq('id', existing.id)
      .select('id, workspace_id, ghl_location_id, webhook_secret, webhook_url, is_active, created_at, updated_at')
      .single()

    if (error) throw error
    return data as GhlIntegrationSettings
  }

  const { data, error } = await supabase
    .from('ghl_integration_settings')
    .insert(payload)
    .select('id, workspace_id, ghl_location_id, webhook_secret, webhook_url, is_active, created_at, updated_at')
    .single()

  if (error) throw error
  return data as GhlIntegrationSettings
}

export function useGhlIntegrationSettings() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchGhlIntegrationSettings,
  })
}

export function useSaveGhlIntegrationSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: upsertGhlIntegrationSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
      toast.success('Configuração GHL salva')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao salvar configuração GHL'
      toast.error(message)
    },
  })
}
