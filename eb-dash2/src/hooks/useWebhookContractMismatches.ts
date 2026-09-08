import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

const QUERY_KEY = 'webhook-contract-mismatches'

export interface WebhookContractMismatch {
  id: string
  location_id: string | null
  missing_identifiers: string[]
  unknown_customdata_keys: string[]
  created_at: string
}

async function fetchPendingMismatches(): Promise<WebhookContractMismatch[]> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return []

  const { data, error } = await supabase
    .from('webhook_contract_mismatches')
    .select('id, location_id, missing_identifiers, unknown_customdata_keys, created_at')
    .eq('workspace_id', workspaceId)
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    // Mesmo padrão de useGhlMappingAlerts.ts: trata "tabela ausente" (projeto
    // atrasado em migrations) como "sem desvios" em vez de propagar erro —
    // evita retry infinito do TanStack Query num ambiente sem a migration
    // 20261006000002 aplicada ainda.
    if (error.code === 'PGRST205' || error.code === '42P01') return []
    throw error
  }
  return (data ?? []) as WebhookContractMismatch[]
}

/**
 * Vigilância do contrato de webhook (docs/CONTRATO-WEBHOOK-CRM.md §8):
 * lista eventos autenticados que chegaram fora do contrato (sem
 * contact_id/id, ou customData com chave fora do vocabulário fixo). O
 * evento em si sempre é gravado normalmente em webhooks_ghl — isto é só
 * observabilidade para o owner/admin revisar a configuração do CRM OMNX.
 */
export function useWebhookContractMismatches() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchPendingMismatches,
    staleTime: 1000 * 60 * 5,
  })
}

async function acknowledgeMismatches(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('webhook_contract_mismatches')
    .update({ acknowledged_at: new Date().toISOString() })
    .in('id', ids)

  if (error) throw error
}

export function useAcknowledgeWebhookContractMismatches() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: acknowledgeMismatches,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao marcar desvio como revisado'
      toast.error(message)
    },
  })
}
