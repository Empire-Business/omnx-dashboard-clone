import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import type { GhlAiMappingTarget, GhlDiscoveryResult, GhlMappingAssistantInput, GhlMappingProposalResponse } from '@/types/ghl-config'

export interface AiGhlMappingInput {
  userDescription: string
  discoveryResult: GhlDiscoveryResult
  target: GhlAiMappingTarget
}

async function analyzeMappings(input: AiGhlMappingInput): Promise<GhlMappingProposalResponse> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const body: GhlMappingAssistantInput = {
    workspace_id: workspaceId,
    user_description: input.userDescription,
    discovery_result: input.discoveryResult,
    target: input.target,
  }

  const { data, error } = await supabase.functions.invoke('ai-ghl-mapping', {
    method: 'POST',
    body,
  })

  if (error) {
    const response = 'context' in error && error.context instanceof Response
      ? error.context
      : null
    const payload = response
      ? await response.clone().json().catch(() => null) as { error?: unknown } | null
      : null
    const message = typeof payload?.error === 'string'
      ? payload.error
      : 'Não foi possível acessar o assistente de mapeamento. Tente novamente.'
    throw new Error(message)
  }

  return data as GhlMappingProposalResponse
}

export function useAiGhlMapping() {
  return useMutation({
    mutationFn: analyzeMappings,
    onSuccess: () => {
      toast.success('Proposta de mapeamento gerada com IA')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao analisar mapeamento com IA'
      toast.error(message)
    },
  })
}
