import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

export interface FeaturePermissionValue {
  canView: boolean
  canEdit: boolean
}

export function useAppFeatureRolePermissions(appSlug: string) {
  return useQuery({
    queryKey: ['app-feature-role-permissions', appSlug],
    queryFn: async () => {
      const wid = await getWorkspaceId()
      if (!wid) return new Map<string, FeaturePermissionValue>()

      const { data, error } = await supabase
        .from('app_feature_role_permissions')
        .select('feature_key, role, can_view, can_edit')
        .eq('workspace_id', wid)
        .eq('app_slug', appSlug)

      if (error) throw error

      const map = new Map<string, FeaturePermissionValue>()
      for (const row of data ?? []) {
        map.set(`${row.feature_key}:${row.role}`, {
          canView: row.can_view,
          canEdit: row.can_edit,
        })
      }
      return map
    },
  })
}

export function useAppFeatureUserOverrides(appSlug: string) {
  return useQuery({
    queryKey: ['app-feature-user-overrides', appSlug],
    queryFn: async () => {
      const wid = await getWorkspaceId()
      if (!wid) return new Map<string, FeaturePermissionValue>()

      const { data, error } = await supabase
        .from('app_feature_user_overrides')
        .select('feature_key, user_id, can_view, can_edit')
        .eq('workspace_id', wid)
        .eq('app_slug', appSlug)

      if (error) throw error

      const map = new Map<string, FeaturePermissionValue>()
      for (const row of data ?? []) {
        map.set(`${row.feature_key}:${row.user_id}`, {
          canView: row.can_view,
          canEdit: row.can_edit,
        })
      }
      return map
    },
  })
}

export function useUpdateAppFeatureRolePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      appSlug,
      featureKey,
      role,
      canView,
      canEdit,
    }: {
      appSlug: string
      featureKey: string
      role: string
      canView: boolean
      canEdit: boolean
    }) => {
      const wid = await getWorkspaceId()
      if (!wid) throw new Error('Conta não encontrada')

      const { error } = await supabase
        .from('app_feature_role_permissions')
        .upsert(
          {
            workspace_id: wid,
            app_slug: appSlug,
            feature_key: featureKey,
            role,
            can_view: canView,
            can_edit: canEdit,
          },
          { onConflict: 'workspace_id,app_slug,feature_key,role' }
        )

      if (error) throw error
    },
    onSuccess: (_, { appSlug }) => {
      void qc.invalidateQueries({ queryKey: ['app-feature-role-permissions', appSlug] })
    },
  })
}

export function useUpdateAppFeatureUserOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      appSlug,
      featureKey,
      userId,
      canView,
      canEdit,
    }: {
      appSlug: string
      featureKey: string
      userId: string
      canView: boolean
      canEdit: boolean
    }) => {
      const wid = await getWorkspaceId()
      if (!wid) throw new Error('Conta não encontrada')

      const { error } = await supabase
        .from('app_feature_user_overrides')
        .upsert(
          {
            workspace_id: wid,
            app_slug: appSlug,
            feature_key: featureKey,
            user_id: userId,
            can_view: canView,
            can_edit: canEdit,
          },
          { onConflict: 'workspace_id,app_slug,feature_key,user_id' }
        )

      if (error) throw error
    },
    onSuccess: (_, { appSlug }) => {
      void qc.invalidateQueries({ queryKey: ['app-feature-user-overrides', appSlug] })
    },
  })
}

export function useDeleteAppFeatureUserOverride() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      appSlug,
      featureKey,
      userId,
    }: {
      appSlug: string
      featureKey: string
      userId: string
    }) => {
      const wid = await getWorkspaceId()
      if (!wid) throw new Error('Conta não encontrada')

      const { error } = await supabase
        .from('app_feature_user_overrides')
        .delete()
        .eq('workspace_id', wid)
        .eq('app_slug', appSlug)
        .eq('feature_key', featureKey)
        .eq('user_id', userId)

      if (error) throw error
    },
    onSuccess: (_, { appSlug }) => {
      void qc.invalidateQueries({ queryKey: ['app-feature-user-overrides', appSlug] })
    },
  })
}
