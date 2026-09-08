import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

// Fase 5 (Agency UI) — docs/PLANO-MULTI-TENANT-AGENCY.md secao 8.
// Hooks para a area /agency/*, visivel SOMENTE para quem tem linha ativa em
// agency_members (guardado por AgencyRoute). Nunca exibido no modo
// single-tenant padrao — ver docs/SINGLE-TENANT-LOCK.md.

export interface MyAgencyRow {
  agency_id: string
  role: string
  agency: {
    id: string
    name: string
    ghl_agency_company_id: string | null
  } | null
}

const MY_AGENCIES_KEY = 'my-agencies'
const AGENCY_WORKSPACES_KEY = 'agency-workspaces'

async function fetchMyAgencies(): Promise<MyAgencyRow[]> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData.user?.id
  if (!userId) return []

  const { data, error } = await supabase
    .from('agency_members')
    .select('agency_id, role, agency:agencies(id, name, ghl_agency_company_id)')
    .eq('user_id', userId)
    .eq('is_active', true)

  if (error) throw error
  return (data ?? []) as unknown as MyAgencyRow[]
}

export function useMyAgencies() {
  return useQuery({
    queryKey: [MY_AGENCIES_KEY],
    queryFn: fetchMyAgencies,
  })
}

export type AgencyWorkspaceStatus = 'active' | 'suspended' | 'pending'

export interface AgencyWorkspaceRow {
  id: string
  workspace_id: string
  status: AgencyWorkspaceStatus
  provisioning_mode: string
  ghl_location_id: string | null
  created_at: string
  workspace: {
    name: string
  } | null
}

async function fetchAgencyWorkspaces(agencyId: string): Promise<AgencyWorkspaceRow[]> {
  const { data, error } = await supabase
    .from('agency_workspaces')
    .select(
      'id, workspace_id, status, provisioning_mode, ghl_location_id, created_at, workspace:workspaces(name)'
    )
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as unknown as AgencyWorkspaceRow[]
}

export function useAgencyWorkspaces(agencyId: string | undefined) {
  return useQuery({
    queryKey: [AGENCY_WORKSPACES_KEY, agencyId],
    queryFn: () => fetchAgencyWorkspaces(agencyId as string),
    enabled: !!agencyId,
  })
}

async function suspendAgencyWorkspace(agencyWorkspaceId: string): Promise<void> {
  const { error } = await supabase.rpc('suspend_agency_workspace', {
    p_agency_workspace_id: agencyWorkspaceId,
  })
  if (error) throw error
}

export function useSuspendAgencyWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: suspendAgencyWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AGENCY_WORKSPACES_KEY] })
      toast.success('Sub-conta suspensa com sucesso')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao suspender a sub-conta'
      toast.error(message)
    },
  })
}

async function reactivateAgencyWorkspace(agencyWorkspaceId: string): Promise<void> {
  // A confirmacao humana ja aconteceu na UI (secao 3.6 do plano-mae) antes de
  // chamar esta mutation — aqui sempre enviamos p_confirmed=true.
  const { error } = await supabase.rpc('reactivate_agency_workspace', {
    p_agency_workspace_id: agencyWorkspaceId,
    p_confirmed: true,
  })
  if (error) throw error
}

export function useReactivateAgencyWorkspace() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: reactivateAgencyWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [AGENCY_WORKSPACES_KEY] })
      toast.success('Sub-conta reativada com sucesso')
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Erro ao reativar a sub-conta'
      toast.error(message)
    },
  })
}
