import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { APP_CATALOG, type WorkspaceAppRecord } from '@/types/apps'

export interface WorkspaceAppListItem {
  slug: string
  label: string
  icon: string
  is_active: boolean
  record?: WorkspaceAppRecord
}

async function fetchWorkspaceApps(): Promise<WorkspaceAppListItem[]> {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) throw new Error('Conta não encontrada')

  const { data, error } = await supabase
    .from('workspace_apps')
    .select('*')
    .eq('workspace_id', workspaceId)

  if (error) throw error

  const records = new Map((data ?? []).map((r: WorkspaceAppRecord) => [r.app_slug, r]))

  // Apps marcados como `hidden` no catálogo não aparecem na App Store.
  return APP_CATALOG.filter((app) => !app.hidden).map((app) => {
    const record = records.get(app.slug)
    return {
      ...app,
      record,
      is_active: record?.is_active ?? false,
    }
  })
}

export function useWorkspaceApps() {
  return useQuery({
    queryKey: ['workspace-apps-admin'],
    queryFn: fetchWorkspaceApps,
  })
}

export function useUpdateWorkspaceApp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ appSlug, isActive }: { appSlug: string; isActive: boolean }) => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const { data: existing, error: findError } = await supabase
        .from('workspace_apps')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('app_slug', appSlug)
        .maybeSingle()

      if (findError) throw findError

      if (existing?.id) {
        const { error } = await supabase
          .from('workspace_apps')
          .update({ is_active: isActive, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('workspace_apps').insert({
          workspace_id: workspaceId,
          app_slug: appSlug,
          is_active: isActive,
          settings: {},
        })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-apps-admin'] })
      queryClient.invalidateQueries({ queryKey: ['workspace-apps'] })
    },
  })
}
