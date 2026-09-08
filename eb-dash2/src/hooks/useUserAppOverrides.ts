import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import type { AppUserOverride } from '@/types/apps'

async function fetchUserOverridesForUser(userId: string): Promise<Map<string, AppUserOverride>> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase
    .from('app_user_overrides')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)

  if (error) throw error

  return new Map((data ?? []).map((r: AppUserOverride) => [r.app_slug, r]))
}

export function useUserAppOverrides(userId: string | undefined) {
  return useQuery({
    queryKey: ['user-app-overrides', userId],
    queryFn: () => fetchUserOverridesForUser(userId!),
    enabled: !!userId,
  })
}

export function useUpsertUserAppOverride() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      userId,
      appSlug,
      canView,
      existingOverride,
    }: {
      userId: string
      appSlug: string
      canView: boolean
      existingOverride: AppUserOverride | undefined
    }) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { data: { user } } = await supabase.auth.getUser()
      const grantedBy = user?.id ?? null

      if (existingOverride?.id) {
        const { error } = await supabase
          .from('app_user_overrides')
          .update({ can_view: canView, updated_at: new Date().toISOString() })
          .eq('id', existingOverride.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('app_user_overrides').insert({
          workspace_id: workspaceId,
          app_slug: appSlug,
          user_id: userId,
          can_view: canView,
          granted_by: grantedBy,
        })
        if (error) throw error
      }
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['user-app-overrides', variables.userId] })
    },
  })
}

export function useDeleteUserAppOverride() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ overrideId }: { overrideId: string; userId: string }) => {
      const { error } = await supabase
        .from('app_user_overrides')
        .delete()
        .eq('id', overrideId)
      if (error) throw error
    },
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['user-app-overrides', variables.userId] })
    },
  })
}
