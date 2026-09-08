import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermissions } from '@/contexts/PermissionsContext'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { OmnxMark } from '@/components/brand/OmnxMark'
import { PageShell } from '@/components/layout/PageShell'
import { FirstTimeAppSetup } from '@/components/apps/FirstTimeAppSetup'
import { Link } from 'react-router-dom'
import {
  Target,
  LayoutGrid,
  AlertTriangle,
  LogOut,
  Settings,
  Store,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { isHiddenApp, type WorkspaceApp } from '@/types/apps'
import { ICON_MAP, APP_ROUTE } from '@/lib/apps/constants'
import { useUpdateWorkspaceApp } from '@/hooks/useWorkspaceApps'
import { useMyAgencies } from '@/hooks/useAgency'

function AppCard({ app }: { app: WorkspaceApp }) {
  const navigate = useNavigate()
  const Icon = ICON_MAP[app.icon] ?? Target
  const href = APP_ROUTE[app.slug] ?? '/'

  return (
    <Card
      variant="interactive"
      className="group"
      onClick={() => navigate(href)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(href)
        }
      }}
    >
      <CardHeader className="pb-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-empire-border bg-empire-elevated text-empire-primary transition-all duration-200 group-hover:border-empire-primary/30 group-hover:bg-empire-primary/8 group-hover:shadow-[0_0_16px_rgba(130,10,209,0.20)]">
          <Icon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
        </div>
      </CardHeader>
      <CardContent>
        <CardTitle className="text-base">{app.label}</CardTitle>
        <CardDescription className="mt-1">Acessar {app.label.toLowerCase()}</CardDescription>
      </CardContent>
    </Card>
  )
}

function AppHubHeader() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  const userInitial = user?.email?.[0]?.toUpperCase() ?? 'U'
  const userName = user?.user_metadata?.full_name ?? user?.email ?? 'Usuário'
  const userEmail = user?.email ?? ''

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <header className="glass-header sticky top-0 z-30 mx-3 mt-3 flex h-14 shrink-0 items-center justify-between rounded-xl border border-empire-border bg-empire-surface/95 dark:bg-transparent px-3 shadow-sm backdrop-blur-md md:mx-4 md:mt-4 md:px-4">
      <a href="/" className="flex items-center" aria-label="OMNX"><OmnxMark compact /></a>

      <div className="flex items-center gap-2 md:gap-3">
        <div className="hidden flex-col items-end leading-none sm:flex">
          <span className="text-sm font-semibold text-empire-void">{userName}</span>
          <span className="text-[11px] text-empire-subtle">{userEmail}</span>
        </div>
        <Avatar className="h-8 w-8" aria-label={`Avatar de ${userName}`}>
          <AvatarFallback>{userInitial}</AvatarFallback>
        </Avatar>
        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          title="Sair"
          aria-label="Sair"
          className="text-empire-subtle hover:bg-empire-danger-soft hover:text-empire-danger"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}

export function AppHubPage() {
  const { apps, loadingApps, appsError, refresh, isAdminOrOwner } = usePermissions()
  const { data: agencies } = useMyAgencies()
  const navigate = useNavigate()
  const update = useUpdateWorkspaceApp()
  // Apps ocultos (catálogo com `hidden: true`) continuam acessíveis por URL,
  // mas não aparecem no hub nem no onboarding de primeiro acesso.
  const visibleApps = apps.filter((app) => !isHiddenApp(app.slug))
  const activeApps = visibleApps.filter((a) => a.allowed && a.is_active)
  const allowedApps = visibleApps.filter((app) => app.allowed)
  const hasNoActiveApps = !loadingApps && activeApps.length === 0 && allowedApps.length > 0
  const hasAgency = (agencies?.length ?? 0) > 0

  useEffect(() => {
    if (loadingApps) return
    if (activeApps.length === 1) {
      const only = activeApps[0]
      const href = APP_ROUTE[only.slug] ?? '/'
      navigate(href, { replace: true })
    }
  }, [activeApps, loadingApps, navigate])

  if (hasNoActiveApps && isAdminOrOwner) {
    return (
      <FirstTimeAppSetup
        apps={allowedApps}
        isAdminOrOwner={isAdminOrOwner}
        isLoading={update.isPending}
        onInstall={async (slug) => {
          await update.mutateAsync({ appSlug: slug, isActive: true })
          refresh()
        }}
        onFinish={() => navigate('/', { replace: true })}
      />
    )
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-empire-canvas dark:[background-image:radial-gradient(ellipse_80%_50%_at_20%_0%,rgba(130,10,209,0.06)_0%,transparent_60%),radial-gradient(ellipse_60%_40%_at_80%_100%,rgba(130,10,209,0.06)_0%,transparent_60%)]">
      <AppHubHeader />
      <main className="flex-1 p-4 md:p-8">
        <div className="mx-auto max-w-7xl">
          {loadingApps ? (
            <div className="space-y-6">
              <div>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="mt-2 h-4 w-96" />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-40 w-full" />
                ))}
              </div>
            </div>
          ) : allowedApps.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4">
              <EmptyState
                icon={LayoutGrid}
                title="Nenhum app disponível"
                description="Você não tem acesso a nenhum app. Entre em contato com o administrador."
                action={
                  appsError ? (
                    <Button variant="outline" size="sm" onClick={refresh}>
                      Tentar novamente
                    </Button>
                  ) : undefined
                }
              />
              {appsError && (
                <div className="max-w-md rounded-lg border border-empire-danger/30 bg-empire-danger-soft p-4 text-sm text-empire-danger">
                  <div className="mb-2 flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4" />
                    Erro ao carregar permissões
                  </div>
                  <p className="break-all">{appsError}</p>
                </div>
              )}
            </div>
          ) : activeApps.length === 1 ? (
            <div className="flex h-full items-center justify-center">
              <Skeleton className="h-8 w-48" />
            </div>
          ) : (
            <PageShell
              title="Meus Apps"
              description="Acesse os apps instalados na sua conta"
            >
              {isAdminOrOwner && (
                <div className="mb-6 space-y-3">
                  <Link
                    to="/workspace/apps"
                    className={cn(
                      'flex items-center gap-3 rounded-xl border px-4 py-3 transition-all',
                      'border-empire-primary/20 bg-empire-primary/[0.03] text-empire-void hover:bg-empire-primary/[0.06] hover:border-empire-primary/30'
                    )}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-empire-primary/20 bg-empire-primary/10 text-empire-primary">
                      <Store className="h-4 w-4 shrink-0" />
                    </div>
                    <div className="flex flex-col leading-none">
                      <span className="text-[13px] font-semibold">App Store</span>
                      <span className="text-[11px] text-empire-subtle mt-0.5">
                        {activeApps.length < allowedApps.length
                          ? 'Ativar mais módulos no seu workspace'
                          : 'Gerenciar módulos ativos do workspace'}
                      </span>
                    </div>
                    <span className="ml-auto text-[12px] text-empire-primary">→</span>
                  </Link>

                  <Link
                    to="/workspace"
                    className="inline-flex items-center gap-1.5 text-[12px] text-empire-subtle transition-colors hover:text-empire-void"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Administração (GHL, usuários e permissões)
                    <span className="text-empire-primary">→</span>
                  </Link>

                  {hasAgency && (
                    <Link
                      to="/agency/workspaces"
                      className="inline-flex items-center gap-1.5 text-[12px] text-empire-subtle transition-colors hover:text-empire-void"
                    >
                      <Store className="h-3.5 w-3.5" />
                      Agência (workspaces vinculados)
                      <span className="text-empire-primary">→</span>
                    </Link>
                  )}
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {activeApps.map((app) => (
                  <AppCard key={app.slug} app={app} />
                ))}
              </div>
            </PageShell>
          )}
        </div>
      </main>
    </div>
  )
}
