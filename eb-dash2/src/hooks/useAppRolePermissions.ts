import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import type { AppRolePermission } from '@/types/apps'

async function fetchRolePermissions(appSlug: string): Promise<Map<string, AppRolePermission>> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase
    .from('app_role_permissions')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('app_slug', appSlug)

  if (error) throw error

  return new Map((data ?? []).map((r: AppRolePermission) => [r.role, r]))
}

export function useAppRolePermissions(appSlug: string) {
  return useQuery({
    queryKey: ['app-role-permissions', appSlug],
    queryFn: () => fetchRolePermissions(appSlug),
    enabled: !!appSlug,
  })
}

export function useUpdateAppRolePermission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      appSlug,
      role,
      canView,
    }: {
      appSlug: string
      role: string
      canView: boolean
    }) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { data: existing, error: findError } = await supabase
        .from('app_role_permissions')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('app_slug', appSlug)
        .eq('role', role)
        .maybeSingle()

      if (findError) throw findError

      if (existing?.id) {
        const { error } = await supabase
          .from('app_role_permissions')
          .update({ can_view: canView })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('app_role_permissions').insert({
          workspace_id: workspaceId,
          app_slug: appSlug,
          role,
          can_view: canView,
        })
        if (error) throw error
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app-role-permissions', variables.appSlug] })
    },
  })
}
