import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import type { GhlDiscoveryResult } from '@/types/ghl-config'

export interface GhlDiscoveryInput {
  includePayload?: boolean
}

async function runDiscovery(input: GhlDiscoveryInput): Promise<GhlDiscoveryResult> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase.functions.invoke('discover-ghl-config', {
    method: 'POST',
    body: {
      workspace_id: workspaceId,
      include_payload: input.includePayload ?? false,
    },
  })

  if (error) throw error

  return data as GhlDiscoveryResult
}

export function useGhlDiscovery() {
  return useMutation({
    mutationFn: runDiscovery,
    onSuccess: (result) => {
      if (result.status === 'success') {
        toast.success('Busca concluída — campos, pipelines e stages encontrados')
      } else if (result.status === 'partial') {
        const essentialFound =
          result.contact_custom_fields.length +
            result.opportunity_custom_fields.length +
            result.pipelines.length >
          0
        const failedCount = result.errors?.length ?? 0
        if (essentialFound) {
          toast.warning('Busca concluída com avisos', {
            description: `Os dados essenciais foram encontrados, mas ${failedCount > 0 ? `${failedCount} parte(s) da conta` : 'uma parte da conta'} não pôde ser lida. Se estiver faltando algo, tente buscar novamente.`,
          })
        } else {
          toast.error('A busca não conseguiu ler os dados da conta GHL', {
            description: 'Verifique a conexão no Passo 1 e tente novamente.',
          })
        }
      } else {
        toast.error('A busca falhou', {
          description: 'Verifique a conexão no Passo 1 e tente novamente.',
        })
      }
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao buscar os campos no GHL'
      toast.error(message)
    },
  })
}
