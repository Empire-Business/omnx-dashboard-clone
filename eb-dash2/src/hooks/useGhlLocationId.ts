import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

const QUERY_KEY = 'ghl-location-id'

async function fetchGhlLocationId(): Promise<string | null> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return null

  // RPC em vez de SELECT direto: a RLS de `ghl_integration_settings` só libera
  // leitura para owner/admin (a linha guarda o `webhook_secret`), então para
  // SDR/pré-vendedor — role `member` — a query voltava vazia e o link
  // "Abrir no CRM" sumia em silêncio justamente para quem mais precisa dele.
  // A RPC devolve só o location ID (identificador público, aparece na própria
  // URL do CRM) e continua fail-closed para quem não é do workspace.
  const { data, error } = await supabase.rpc('get_workspace_ghl_location_id', {
    p_workspace_id: workspaceId,
  })

  if (error) throw error
  return (data as string | null) ?? null
}

/**
 * Location ID do GHL do workspace atual (fonte: banco, multi-tenant).
 * Usado para montar links "Abrir no CRM" fora do `useLeads` — que já
 * busca o mesmo valor para a Lista de leads.
 */
export function useGhlLocationId() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchGhlLocationId,
    staleTime: 5 * 60 * 1000,
  })
}
