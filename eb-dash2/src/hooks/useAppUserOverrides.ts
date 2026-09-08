import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import type { AppUserOverride } from '@/types/apps'

async function fetchUserOverrides(appSlug: string): Promise<Map<string, AppUserOverride>> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase
    .from('app_user_overrides')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('app_slug', appSlug)

  if (error) throw error

  return new Map((data ?? []).map((r: AppUserOverride) => [r.user_id, r]))
}

export function useAppUserOverrides(appSlug: string) {
  return useQuery({
    queryKey: ['app-user-overrides', appSlug],
    queryFn: () => fetchUserOverrides(appSlug),
    enabled: !!appSlug,
  })
}

export function useUpdateAppUserOverride() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      appSlug,
      userId,
      canView,
      hasOverride,
    }: {
      appSlug: string
      userId: string
      canView: boolean
      hasOverride: boolean
    }) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { data: { user } } = await supabase.auth.getUser()
      const grantedBy = user?.id ?? null

      if (!hasOverride) {
        const { error } = await supabase.from('app_user_overrides').insert({
          workspace_id: workspaceId,
          app_slug: appSlug,
          user_id: userId,
          can_view: canView,
          granted_by: grantedBy,
        })
        if (error) throw error
      } else {
        const { data: existing, error: findError } = await supabase
          .from('app_user_overrides')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('app_slug', appSlug)
          .eq('user_id', userId)
          .maybeSingle()

        if (findError) throw findError

        if (existing?.id) {
          const { error } = await supabase
            .from('app_user_overrides')
            .update({ can_view: canView, updated_at: new Date().toISOString() })
            .eq('id', existing.id)
          if (error) throw error
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['app-user-overrides', variables.appSlug] })
    },
  })
}
