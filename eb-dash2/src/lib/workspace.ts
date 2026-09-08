import { supabase } from '@/lib/supabase'
import { resolveTenancyModeFromCounts, type TenancyMode } from './tenancy-mode'
export type { TenancyMode } from './tenancy-mode'

const SELECTED_WORKSPACE_KEY = 'eb:selected_workspace_id'

/**
 * Modo single-tenant: cada instância do Empire (Supabase + Vercel) atende
 * apenas um cliente/empresa. A estrutura multitenancy por trás
 * (workspaces, workspace_members, workspace_id em todas as tabelas) é
 * preservada, mas o usuário final nunca vê o conceito de "workspace".
 *
 * Quando true:
 * - WorkspaceSelector não é renderizado.
 * - getWorkspaceId() sempre retorna o primeiro/único workspace do usuário.
 * - Labels visíveis usam "Conta", "Empresa" ou "Administração".
 */
export const SINGLE_WORKSPACE_MODE = true

export function isSingleTenantMode(): boolean {
  return SINGLE_WORKSPACE_MODE
}

export interface UserWorkspace {
  workspace_id: string
  workspaces: {
    id: string
    name: string
  }
  role: string
}

export function getSelectedWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(SELECTED_WORKSPACE_KEY)
}

export function setSelectedWorkspaceId(workspaceId: string | null): void {
  if (typeof window === 'undefined') return
  if (workspaceId) {
    window.localStorage.setItem(SELECTED_WORKSPACE_KEY, workspaceId)
  } else {
    window.localStorage.removeItem(SELECTED_WORKSPACE_KEY)
  }
}

export function clearSelectedWorkspaceId(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(SELECTED_WORKSPACE_KEY)
}

export async function listUserWorkspaces(): Promise<UserWorkspace[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name)')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('joined_at', { ascending: true })

  if (error) {
    console.error('[workspace] listUserWorkspaces error', error)
    return []
  }

  return (data ?? []) as unknown as UserWorkspace[]
}

export async function isWorkspaceMember(workspaceId: string, userId?: string): Promise<boolean> {
  let uid = userId
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return false
    uid = user.id
  }

  const { data, error } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', uid)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    console.error('[workspace] isWorkspaceMember error', error)
    return false
  }

  return !!data
}

export async function getWorkspaceId(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const selectedId = getSelectedWorkspaceId()
  if (selectedId && await isWorkspaceMember(selectedId, user.id)) {
    return selectedId
  }

  // Se a seleção não é válida, limpa e cai no fallback do primeiro workspace ativo
  clearSelectedWorkspaceId()

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .order('joined_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  return (membership as { workspace_id: string } | null)?.workspace_id ?? null
}

/**
 * Resolve o modo de tenancy do usuario (Fase 1 — fatia 3).
 *
 * Conta os workspaces ativos e as participacoes ativas em agencias do usuario
 * e delega a decisao para `resolveTenancyModeFromCounts` (funcao pura, testada
 * em unit e em integracao). Em caso de erro de query, cai no lado seguro
 * 'single-tenant' para nao expor UI de agencia antes da hora.
 *
 * NOTA: nesta fatia a funcao ainda NAO e ligada a UI — `isSingleTenantMode()`
 * continua retornando a constante SINGLE_WORKSPACE_MODE. A troca da UI (tornar
 * a decisao assincrona e efetiva) fica para a fatia 3b.
 */
export async function resolveTenancyMode(userId?: string): Promise<TenancyMode> {
  let uid = userId
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return 'single-tenant'
    uid = user.id
  }

  const [wsResult, agencyResult] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('is_active', true),
    supabase
      .from('agency_members')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', uid)
      .eq('is_active', true),
  ])

  if (wsResult.error || agencyResult.error) {
    console.error('[workspace] resolveTenancyMode error', wsResult.error ?? agencyResult.error)
    return 'single-tenant'
  }

  return resolveTenancyModeFromCounts({
    workspaceCount: wsResult.count ?? 0,
    agencyMemberCount: agencyResult.count ?? 0,
  })
}
