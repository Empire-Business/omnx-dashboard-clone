/* eslint-disable react-refresh/only-export-components -- arquivo exporta Provider+hook/variantes por padrão de projeto */
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { publicErrorMessage } from '@/lib/errors'
import { useAuth } from './AuthContext'
import type { ModulePermission } from '@/types/users'
import type { WorkspaceApp } from '@/types/apps'
import { FEATURES_CATALOG } from '@/lib/apps/features'
import { resolveModuleKey } from '@/lib/apps/navigation'

interface PermissionsContextValue {
  permissions: ModulePermission[]
  workspaceRole: string | null
  loading: boolean
  isAdminOrOwner: boolean
  hasPermission: (moduleKey: string) => boolean
  hasFeaturePermission: (appSlug: string, featureKey: string) => boolean
  hasFeatureEditPermission: (appSlug: string, featureKey: string) => boolean
  refresh: () => void
  apps: WorkspaceApp[]
  loadingApps: boolean
  appsError: string | null
}

const PermissionsContext = createContext<PermissionsContextValue>({
  permissions: [],
  workspaceRole: null,
  loading: true,
  isAdminOrOwner: false,
  hasPermission: () => true,
  hasFeaturePermission: () => true,
  hasFeatureEditPermission: () => true,
  refresh: () => {},
  apps: [],
  loadingApps: true,
  appsError: null,
})

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [permissions, setPermissions] = useState<ModulePermission[]>([])
  const [workspaceRole, setWorkspaceRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [apps, setApps] = useState<WorkspaceApp[]>([])
  const [loadingApps, setLoadingApps] = useState(true)
  const [appsError, setAppsError] = useState<string | null>(null)
  const [featureRolePerms, setFeatureRolePerms] = useState<Map<string, boolean>>(new Map())
  const [featureRoleEditPerms, setFeatureRoleEditPerms] = useState<Map<string, boolean>>(new Map())
  const [featureUserOverrides, setFeatureUserOverrides] = useState<Map<string, boolean>>(new Map())
  const [featureUserEditOverrides, setFeatureUserEditOverrides] = useState<Map<string, boolean>>(new Map())
  const [tick, setTick] = useState(0)
  const hasLoadedRef = useRef(false)

  useEffect(() => {
    if (!user) {
      setPermissions([])
      setWorkspaceRole(null)
      setApps([])
      setFeatureRolePerms(new Map())
      setFeatureRoleEditPerms(new Map())
      setFeatureUserOverrides(new Map())
      setFeatureUserEditOverrides(new Map())
      setLoading(false)
      setLoadingApps(false)
      hasLoadedRef.current = false
      return
    }

    let cancelled = false
    const isInitialLoad = !hasLoadedRef.current
    if (isInitialLoad) setLoading(true)

    async function load() {
      try {
        const wid = await getWorkspaceId()
        if (!wid || cancelled) return

        const [memberRes, permsRes, featureRoleRes, featureUserRes] = await Promise.all([
          supabase
            .from('workspace_members')
            .select('role')
            .eq('workspace_id', wid)
            .eq('user_id', user!.id)
            .eq('is_active', true)
            .maybeSingle(),
          supabase
            .from('dashboard_user_permissions')
            .select('*')
            .eq('workspace_id', wid)
            .eq('user_id', user!.id),
          supabase
            .from('app_feature_role_permissions')
            .select('app_slug, feature_key, role, can_view, can_edit')
            .eq('workspace_id', wid),
          supabase
            .from('app_feature_user_overrides')
            .select('app_slug, feature_key, can_view, can_edit')
            .eq('workspace_id', wid)
            .eq('user_id', user!.id),
        ])

        if (cancelled) return

        const role = memberRes.data?.role ?? 'member'
        setWorkspaceRole(role)
        setPermissions((permsRes.data ?? []) as ModulePermission[])
        hasLoadedRef.current = true

        // Feature role permissions keyed by "appSlug:featureKey:role"
        const rolePermsMap = new Map<string, boolean>()
        const roleEditPermsMap = new Map<string, boolean>()
        for (const r of featureRoleRes.data ?? []) {
          rolePermsMap.set(`${r.app_slug}:${r.feature_key}:${r.role}`, r.can_view)
          roleEditPermsMap.set(`${r.app_slug}:${r.feature_key}:${r.role}`, r.can_edit)
        }
        setFeatureRolePerms(rolePermsMap)
        setFeatureRoleEditPerms(roleEditPermsMap)

        const userOverridesMap = new Map<string, boolean>()
        const userEditOverridesMap = new Map<string, boolean>()
        for (const r of featureUserRes.data ?? []) {
          userOverridesMap.set(`${r.app_slug}:${r.feature_key}`, r.can_view)
          userEditOverridesMap.set(`${r.app_slug}:${r.feature_key}`, r.can_edit)
        }
        setFeatureUserOverrides(userOverridesMap)
        setFeatureUserEditOverrides(userEditOverridesMap)
      } catch (err) {
        console.error('[PermissionsContext] error', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [user, tick])

  useEffect(() => {
    if (!user) {
      setApps([])
      setLoadingApps(false)
      setAppsError(null)
      return
    }

    let cancelled = false
    setLoadingApps(true)
    setAppsError(null)

    async function loadApps() {
      try {
        const wid = await getWorkspaceId()
        if (!wid || cancelled) {
          if (!wid && !cancelled) setAppsError('Conta não encontrada')
          return
        }

        const { data, error } = await supabase.functions.invoke('workspace-apps', {
          method: 'POST',
          headers: {
            'x-workspace-id': wid,
          },
        })

        if (cancelled) return
        if (error) throw error

        setApps((data?.apps ?? []) as WorkspaceApp[])
      } catch (err) {
        console.error('[PermissionsContext] error loading apps', err)
        if (!cancelled) {
          setAppsError(publicErrorMessage(err, 'Não foi possível carregar os aplicativos.'))
          setApps([])
        }
      } finally {
        if (!cancelled) setLoadingApps(false)
      }
    }

    void loadApps()
    return () => { cancelled = true }
  }, [user, tick])

  const isAdminOrOwner = workspaceRole === 'owner' || workspaceRole === 'admin'

  const hasPermission = (moduleKey: string): boolean => {
    if (loading) return true
    if (isAdminOrOwner) return true

    // Nova fonte de verdade: sub-apps/features
    const resolved = resolveModuleKey(moduleKey)
    if (resolved) {
      return hasFeaturePermission(resolved.appSlug, resolved.featureKey)
    }

    // Fallback para camada legada (será removido após migração completa)
    const exact = permissions.find(p => p.module_key === moduleKey)
    if (exact) return exact.can_view

    const parts = moduleKey.split('.')
    for (let i = parts.length - 1; i > 0; i--) {
      const parentKey = parts.slice(0, i).join('.')
      const parent = permissions.find(p => p.module_key === parentKey)
      if (parent) return parent.can_view
    }

    return false
  }

  const hasFeaturePermission = (appSlug: string, featureKey: string): boolean => {
    if (loading) return true
    if (isAdminOrOwner) return true

    const key = `${appSlug}:${featureKey}`

    // User override takes precedence
    const userOverride = featureUserOverrides.get(key)
    if (userOverride !== undefined) return userOverride

    // Role permission — keyed by "appSlug:featureKey:role"
    const roleKey = `${key}:${workspaceRole ?? 'member'}`
    const rolePermission = featureRolePerms.get(roleKey)
    if (rolePermission !== undefined) return rolePermission

    // Fallback to FEATURES_CATALOG defaults
    const feature = FEATURES_CATALOG[appSlug]?.find(f => f.key === featureKey)
    if (feature) return feature.defaultRoles.includes(workspaceRole ?? 'member')

    return false
  }

  const hasFeatureEditPermission = (appSlug: string, featureKey: string): boolean => {
    if (loading) return true
    if (isAdminOrOwner) return true

    const key = `${appSlug}:${featureKey}`

    // User override takes precedence
    const userEditOverride = featureUserEditOverrides.get(key)
    if (userEditOverride !== undefined) return userEditOverride

    // Role permission — keyed by "appSlug:featureKey:role"
    const roleKey = `${key}:${workspaceRole ?? 'member'}`
    const roleEditPermission = featureRoleEditPerms.get(roleKey)
    if (roleEditPermission !== undefined) return roleEditPermission

    // Fallback to FEATURES_CATALOG defaults
    const feature = FEATURES_CATALOG[appSlug]?.find(f => f.key === featureKey)
    if (feature) return feature.defaultEditRoles?.includes(workspaceRole ?? 'member') ?? false

    return false
  }

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setTick(t => t + 1)
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [])

  const refresh = () => setTick(t => t + 1)

  return (
    <PermissionsContext.Provider value={{ permissions, workspaceRole, loading, isAdminOrOwner, hasPermission, hasFeaturePermission, hasFeatureEditPermission, refresh, apps, loadingApps, appsError }}>
      {children}
    </PermissionsContext.Provider>
  )
}

export function usePermissions() {
  return useContext(PermissionsContext)
}
