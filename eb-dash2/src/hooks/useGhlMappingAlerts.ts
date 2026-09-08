import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

const QUERY_KEY = 'ghl-mapping-alerts'

export interface GhlMappingAlert {
  id: string
  source: 'contact_custom_fields' | 'opportunity_custom_fields' | 'pipelines'
  previous_count: number
  current_count: number
  delta: number
  created_at: string
}

const SOURCE_LABELS: Record<GhlMappingAlert['source'], string> = {
  contact_custom_fields: 'campos de contato',
  opportunity_custom_fields: 'campos de oportunidade',
  pipelines: 'pipelines',
}

export function ghlMappingAlertSourceLabel(source: GhlMappingAlert['source']): string {
  return SOURCE_LABELS[source] ?? source
}

async function fetchPendingAlerts(): Promise<GhlMappingAlert[]> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) return []

  const { data, error } = await supabase
    .from('ghl_mapping_change_alerts')
    .select('id, source, previous_count, current_count, delta, created_at')
    .eq('workspace_id', workspaceId)
    .is('acknowledged_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    // A tabela é de uma feature (vigilância automática) ainda não promovida a
    // produção (migration 20260819000000, docs/GHL-MAPEAMENTO-VIGILANCIA.md) —
    // achado real do burn-in de 2026-07-14: sem essa checagem, o 404 fazia o
    // TanStack Query tentar de novo (retry padrão), poluindo o console. Trata
    // "tabela ausente" como "sem alertas" (banner só não aparece); qualquer
    // outro erro real continua propagando.
    if (error.code === 'PGRST205' || error.code === '42P01') return []
    throw error
  }
  return (data ?? []) as GhlMappingAlert[]
}

/**
 * Alertas pendentes de vigilância automática (cron diário compara a contagem
 * de campos/pipelines do GHL contra a última verificação). Diferente do banner
 * de "mudanças detectadas" do wizard (que só aparece após um discovery manual
 * na mesma sessão), este hook mostra alertas mesmo sem o usuário ter clicado
 * em nada — é a "vigilância" propriamente dita.
 */
export function useGhlMappingAlerts() {
  return useQuery({
    queryKey: [QUERY_KEY],
    queryFn: fetchPendingAlerts,
    staleTime: 1000 * 60 * 5,
  })
}

async function acknowledgeAlerts(ids: string[]): Promise<void> {
  const { error } = await supabase
    .from('ghl_mapping_change_alerts')
    .update({ acknowledged_at: new Date().toISOString() })
    .in('id', ids)

  if (error) throw error
}

export function useAcknowledgeGhlMappingAlerts() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: acknowledgeAlerts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao marcar alerta como revisado'
      toast.error(message)
    },
  })
}
