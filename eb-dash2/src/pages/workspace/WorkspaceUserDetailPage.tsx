import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { ArrowLeft, ShieldCheck, ShieldOff, RotateCcw, Loader2, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers'
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps'
import { useUserAppOverrides, useUpsertUserAppOverride, useDeleteUserAppOverride } from '@/hooks/useUserAppOverrides'
import { useAppRolePermissions } from '@/hooks/useAppRolePermissions'
import { useAppFeatureRolePermissions, useAppFeatureUserOverrides, useUpdateAppFeatureUserOverride, useDeleteAppFeatureUserOverride } from '@/hooks/useAppFeaturePermissions'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { APP_CATALOG } from '@/types/apps'
import { FEATURES_CATALOG } from '@/lib/apps/features'
import { cn } from '@/lib/utils'
import type { AppUserOverride } from '@/types/apps'

function UserInitials({ name, email }: { name?: string; email?: string }) {
  const text = name ?? email ?? '?'
  const parts = text.split(/[\s@]/).filter(Boolean)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : text.slice(0, 2).toUpperCase()
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-empire-primary/15 text-lg font-bold text-empire-primary ring-2 ring-empire-primary/25">
      {initials}
    </div>
  )
}

function roleLabel(role: string): string {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  return 'Membro'
}

interface AppRowProps {
  appSlug: string
  appLabel: string
  appIcon: string
  isWorkspaceActive: boolean
  userId: string
  userRole: string
  override: AppUserOverride | undefined
  roleCanView: boolean | undefined
}

function AppRow({ appSlug, appLabel, isWorkspaceActive, userId, override, roleCanView }: AppRowProps) {
  const upsert = useUpsertUserAppOverride()
  const deleteOverride = useDeleteUserAppOverride()

  const hasOverride = !!override
  const effectiveAccess = hasOverride ? override.can_view : (roleCanView ?? false)

  const handleToggle = async (next: boolean) => {
    try {
      await upsert.mutateAsync({ userId, appSlug, canView: next, existingOverride: override })
      toast.success(next ? `Acesso a ${appLabel} liberado` : `Acesso a ${appLabel} bloqueado`)
    } catch {
      toast.error('Erro ao salvar permissão')
    }
  }

  const handleReset = async () => {
    if (!override?.id) return
    try {
      await deleteOverride.mutateAsync({ overrideId: override.id, userId })
      toast.success(`Override de ${appLabel} removido — voltou ao padrão do cargo`)
    } catch {
      toast.error('Erro ao remover override')
    }
  }

  const isPending = upsert.isPending || deleteOverride.isPending

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-xl border px-4 py-3.5 transition-colors',
        isWorkspaceActive
          ? 'border-empire-border bg-empire-surface/60 dark:bg-white/[0.02]'
          : 'border-empire-border/50 bg-empire-canvas/50 opacity-60'
      )}
    >
      {/* Status indicator */}
      <div className={cn(
        'h-2 w-2 shrink-0 rounded-full',
        !isWorkspaceActive ? 'bg-empire-subtle' :
        effectiveAccess ? 'bg-green-500' : 'bg-empire-subtle'
      )} />

      {/* App info */}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium text-empire-void">{appLabel}</p>
        {!isWorkspaceActive && (
          <p className="text-[11px] text-empire-subtle">App desativado</p>
        )}
      </div>

      {/* Source badge */}
      <div className="hidden sm:flex shrink-0">
        {hasOverride ? (
          <span className="flex items-center gap-1 rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-400">
            <ShieldCheck className="h-2.5 w-2.5" />
            override pessoal
          </span>
        ) : (
          <span className="flex items-center gap-1 rounded-full border border-empire-border bg-empire-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-empire-muted">
            padrão do cargo
          </span>
        )}
      </div>

      {/* Reset override */}
      {hasOverride && (
        <button
          onClick={() => void handleReset()}
          disabled={isPending || !isWorkspaceActive}
          title="Remover override — volta ao padrão do cargo"
          aria-label={`Remover override de ${appLabel}`}
          className={cn(
            'shrink-0 rounded-lg p-1.5 text-empire-subtle transition-colors',
            'hover:bg-empire-elevated hover:text-empire-void',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
            'disabled:cursor-not-allowed disabled:opacity-40'
          )}
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        </button>
      )}

      {/* Toggle */}
      <Switch
        checked={effectiveAccess}
        onCheckedChange={(v) => void handleToggle(v)}
        disabled={isPending || !isWorkspaceActive}
        aria-label={`${effectiveAccess ? 'Bloquear' : 'Liberar'} acesso a ${appLabel}`}
      />
    </div>
  )
}

// ─── Feature permissions dentro de cada app ─────────────────────────────────

function FeatureRow({
  appSlug,
  featureKey,
  featureLabel,
  userId,
  userRole,
}: {
  appSlug: string
  featureKey: string
  featureLabel: string
  userId: string
  userRole: string
}) {
  const { data: rolePerms } = useAppFeatureRolePermissions(appSlug)
  const { data: userOverrides } = useAppFeatureUserOverrides(appSlug)
  const updateUser = useUpdateAppFeatureUserOverride()
  const deleteUser = useDeleteAppFeatureUserOverride()

  const feature = FEATURES_CATALOG[appSlug]?.find((f) => f.key === featureKey)
  const isEditable = !!feature?.defaultEditRoles

  const roleValue = rolePerms?.get(`${featureKey}:${userRole}`)
  const userValue = userOverrides?.get(`${featureKey}:${userId}`)
  const hasUserOverride = userValue !== undefined

  const defaultCanView = feature?.defaultRoles.includes(userRole) ?? false
  const defaultCanEdit = feature?.defaultEditRoles?.includes(userRole) ?? false

  const effectiveCanView = userValue?.canView ?? roleValue?.canView ?? defaultCanView
  const effectiveCanEdit = userValue?.canEdit ?? roleValue?.canEdit ?? defaultCanEdit

  const handleToggleView = async (next: boolean) => {
    try {
      // Invariante: se não pode ver, não pode editar.
      const nextEdit = next ? effectiveCanEdit : false
      await updateUser.mutateAsync({
        appSlug,
        featureKey,
        userId,
        canView: next,
        canEdit: nextEdit,
      })
      toast.success(next ? `Visualização de "${featureLabel}" liberada` : `Acesso a "${featureLabel}" bloqueado`)
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  const handleToggleEdit = async (next: boolean) => {
    try {
      // Invariante: editar implica ver.
      const nextView = next ? true : effectiveCanView
      await updateUser.mutateAsync({
        appSlug,
        featureKey,
        userId,
        canView: nextView,
        canEdit: next,
      })
      toast.success(next ? `Edição de "${featureLabel}" liberada` : `Edição de "${featureLabel}" bloqueada`)
    } catch {
      toast.error('Erro ao salvar')
    }
  }

  const handleResetUser = async () => {
    try {
      await deleteUser.mutateAsync({ appSlug, featureKey, userId })
      toast.success('Override removido — voltou ao padrão do cargo')
    } catch {
      toast.error('Erro ao remover override')
    }
  }

  const isPending = updateUser.isPending || deleteUser.isPending

  return (
    <div className="flex items-center gap-3 rounded-lg border border-empire-border/60 bg-empire-canvas/50 px-3 py-2.5">
      <div className={cn('h-1.5 w-1.5 shrink-0 rounded-full', effectiveCanView ? 'bg-green-500' : 'bg-empire-subtle')} />
      <span className="flex-1 text-[13px] text-empire-void">{featureLabel}</span>
      {hasUserOverride && (
        <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-purple-400">
          override
        </span>
      )}
      {hasUserOverride && (
        <button
          onClick={() => void handleResetUser()}
          disabled={isPending}
          title="Voltar ao padrão do cargo"
          className="shrink-0 rounded p-1 text-empire-subtle hover:text-empire-void disabled:opacity-40"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      )}
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-[11px] text-empire-subtle">
          <span>Ver</span>
          <Switch
            checked={effectiveCanView}
            onCheckedChange={(v) => void handleToggleView(v)}
            disabled={isPending}
            aria-label={`${effectiveCanView ? 'Bloquear' : 'Liberar'} visualização de ${featureLabel}`}
          />
        </label>
        {isEditable && (
          <label className="flex items-center gap-1.5 text-[11px] text-empire-subtle">
            <span>Editar</span>
            <Switch
              checked={effectiveCanEdit}
              onCheckedChange={(v) => void handleToggleEdit(v)}
              disabled={isPending || !effectiveCanView}
              aria-label={`${effectiveCanEdit ? 'Bloquear' : 'Liberar'} edição de ${featureLabel}`}
            />
          </label>
        )}
      </div>
    </div>
  )
}

function AppRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-empire-border px-4 py-3.5">
      <Skeleton className="h-2 w-2 shrink-0 rounded-full" />
      <Skeleton className="h-4 w-36" />
      <div className="flex-1" />
      <Skeleton className="h-5 w-24 rounded-full" />
      <Skeleton className="h-5 w-10 rounded-full" />
    </div>
  )
}

function RolePermissionsLoader({ userId, userRole, apps, overridesMap }: {
  userId: string
  userRole: string
  apps: Array<{ slug: string; label: string; icon: string; is_active: boolean }>
  overridesMap: Map<string, AppUserOverride>
}) {
  return (
    <div className="space-y-3">
      {APP_CATALOG.filter((catalogApp) => !catalogApp.hidden).map((catalogApp) => {
        const workspaceApp = apps.find((a) => a.slug === catalogApp.slug)
        return (
          <AppRowWithRolePermission
            key={catalogApp.slug}
            catalogApp={catalogApp}
            isWorkspaceActive={workspaceApp?.is_active ?? false}
            userId={userId}
            userRole={userRole}
            override={overridesMap.get(catalogApp.slug)}
          />
        )
      })}
    </div>
  )
}

function AppRowWithRolePermission({
  catalogApp,
  isWorkspaceActive,
  userId,
  userRole,
  override,
}: {
  catalogApp: { slug: string; label: string; icon: string }
  isWorkspaceActive: boolean
  userId: string
  userRole: string
  override: AppUserOverride | undefined
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: rolePermissions } = useAppRolePermissions(catalogApp.slug)
  const roleCanView = rolePermissions?.get(userRole)?.can_view
  const features = FEATURES_CATALOG[catalogApp.slug] ?? []

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <AppRow
            appSlug={catalogApp.slug}
            appLabel={catalogApp.label}
            appIcon={catalogApp.icon}
            isWorkspaceActive={isWorkspaceActive}
            userId={userId}
            userRole={userRole}
            override={override}
            roleCanView={roleCanView}
          />
        </div>
        {features.length > 0 && (
          <button
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? 'Ocultar features' : `Ver ${features.length} feature${features.length > 1 ? 's' : ''} controlável${features.length > 1 ? 'eis' : ''}`}
            className="shrink-0 rounded-lg border border-empire-border bg-empire-surface p-2 text-empire-subtle transition-colors hover:bg-empire-elevated hover:text-empire-void"
          >
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
        )}
      </div>
      {expanded && features.length > 0 && (
        <div className="ml-4 space-y-1.5 border-l-2 border-empire-border/40 pl-4">
          {features.map((f) => (
            <FeatureRow
              key={f.key}
              appSlug={catalogApp.slug}
              featureKey={f.key}
              featureLabel={f.label}
              userId={userId}
              userRole={userRole}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function WorkspaceUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()

  const { data: members, isLoading: loadingMembers } = useWorkspaceMembers()
  const { data: apps, isLoading: loadingApps } = useWorkspaceApps()
  const { data: overridesMap, isLoading: loadingOverrides } = useUserAppOverrides(userId)

  const member = members?.find((m) => m.user_id === userId)
  const isLoading = loadingMembers || loadingApps || loadingOverrides

  return (
    <div className="space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate('/workspace/users')}
        className="flex items-center gap-2 text-[13px] text-empire-subtle transition-colors hover:text-empire-void focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50"
        aria-label="Voltar para Pessoas"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Pessoas
      </button>

      {/* User header */}
      {loadingMembers ? (
        <div className="flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3.5 w-64" />
          </div>
        </div>
      ) : member ? (
        <div className="flex items-center gap-4">
          <UserInitials name={member.full_name} email={member.email} />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-empire-void">
              {member.full_name ?? member.email}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              {member.full_name && (
                <span className="text-sm text-empire-muted">{member.email}</span>
              )}
              <span className="rounded-full border border-empire-border bg-empire-elevated px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-empire-muted">
                {roleLabel(member.role)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">
          Usuário não encontrado.
        </div>
      )}

      {/* Permission matrix */}
      {member && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-empire-void">Acesso a apps</h2>
              <p className="text-[12px] text-empire-subtle">
                Overrides pessoais sobrepõem o padrão do cargo. Remova o override para voltar ao padrão.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-empire-subtle">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                Com acesso
              </span>
              <span className="flex items-center gap-1">
                <ShieldOff className="h-3 w-3" />
                Sem acesso
              </span>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <AppRowSkeleton key={i} />)}
            </div>
          ) : (
            <RolePermissionsLoader
              userId={member.user_id}
              userRole={member.role}
              apps={apps ?? []}
              overridesMap={overridesMap ?? new Map()}
            />
          )}
        </div>
      )}
    </div>
  )
}
