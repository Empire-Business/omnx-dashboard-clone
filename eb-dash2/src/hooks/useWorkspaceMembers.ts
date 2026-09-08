import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import type { WorkspaceMember } from '@/types/users'

async function fetchWorkspaceMembers(): Promise<WorkspaceMember[]> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase.rpc('get_workspace_members_with_profile', {
    p_workspace_id: workspaceId,
  })

  if (error) throw error
  return (data ?? []) as WorkspaceMember[]
}

export function useWorkspaceMembers() {
  return useQuery({
    queryKey: ['workspace-members'],
    queryFn: fetchWorkspaceMembers,
  })
}
