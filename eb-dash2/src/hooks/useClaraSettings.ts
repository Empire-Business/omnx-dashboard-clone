import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

export type ClaraSettings = {
  workspace_id: string
  is_enabled: boolean
  persistent_instructions: string
  business_context: string
  response_rules: string
  allowed_modules: string[]
  allowed_tools: string[]
  analysis_depth: 'concise' | 'standard' | 'detailed'
  max_response_tokens: number
  scheduled_report_instructions: string
  model_id: string
  updated_at: string
}

export type ClaraModel = { id: string; name: string; context_length: number | null; input_price: string | null; output_price: string | null; selectable: boolean }
type ApiResponse = { settings?: ClaraSettings | null; entries?: Array<{ id: string; changed_fields: string[]; created_at: string }>; models?: ClaraModel[]; error?: string }

async function call(action: 'get' | 'save' | 'history' | 'models', settings?: Partial<ClaraSettings>): Promise<ApiResponse> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')
  const { data, error } = await supabase.functions.invoke<ApiResponse>('clara-settings', { body: { action, workspace_id: workspaceId, settings } })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data ?? {}
}

export function useClaraSettings() {
  return useQuery({ queryKey: ['clara-settings'], queryFn: () => call('get') })
}

export function useSaveClaraSettings() {
  const client = useQueryClient()
  return useMutation({ mutationFn: (settings: Partial<ClaraSettings>) => call('save', settings), onSuccess: () => client.invalidateQueries({ queryKey: ['clara-settings'] }) })
}

export function useClaraSettingsHistory(enabled: boolean) {
  return useQuery({ queryKey: ['clara-settings-history'], queryFn: () => call('history'), enabled })
}

export function useClaraModels(enabled: boolean) {
  return useQuery({ queryKey: ['clara-models'], queryFn: () => call('models'), enabled, staleTime: 5 * 60_000 })
}
