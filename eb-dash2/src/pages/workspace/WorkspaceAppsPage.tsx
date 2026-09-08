import { useMemo } from 'react'
import { toast } from 'sonner'
import {
  ShoppingCart,
  Radar,
  MessageCircle,
  BarChart2,
  TrendingUp,
  Bot,
  Target,
  Users,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspaceApps, useUpdateWorkspaceApp } from '@/hooks/useWorkspaceApps'
import { usePermissions } from '@/contexts/PermissionsContext'
import { APP_CATALOG } from '@/types/apps'
import { cn } from '@/lib/utils'

const ICON_MAP: Record<string, LucideIcon> = {
  'shopping-cart': ShoppingCart,
  radar: Radar,
  'message-circle': MessageCircle,
  'bar-chart-2': BarChart2,
  'trending-up': TrendingUp,
  bot: Bot,
  target: Target,
  users: Users,
}

function AppIcon({ icon }: { icon: string }) {
  const Icon = ICON_MAP[icon]
  if (!Icon) return null
  return <Icon className="h-5 w-5 text-empire-primary" />
}

export function WorkspaceAppsPage() {
  const { isAdminOrOwner, refresh } = usePermissions()
  const { data: apps, isLoading } = useWorkspaceApps()
  const update = useUpdateWorkspaceApp()

  const appsList = useMemo(() => {
    if (!apps) return APP_CATALOG.filter((app) => !app.hidden).map((app) => ({ ...app, is_active: false }))
    return apps
  }, [apps])

  const handleToggle = async (appSlug: string, next: boolean) => {
    try {
      await update.mutateAsync({ appSlug, isActive: next })
      toast.success(next ? 'Módulo ativado' : 'Módulo desativado')
      refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar'
      toast.error(message)
    }
  }

  const activeCount = appsList.filter((a) => a.is_active).length

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-empire-void">Módulos</h1>
          <p className="mt-1 text-sm text-empire-muted">
            Ative ou desative os módulos do workspace.
          </p>
        </div>
        <div className="rounded-xl border border-empire-border bg-empire-elevated px-4 py-2 text-center">
          <p className="text-lg font-bold text-empire-void">{isLoading ? '–' : activeCount}</p>
          <p className="text-[11px] text-empire-subtle">ativos</p>
        </div>
      </div>

      {!isAdminOrOwner && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-400">
          Apenas owners e admins podem ativar ou desativar apps.
        </div>
      )}

      {/* App grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-empire-border p-4">
              <div className="flex items-start justify-between">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <Skeleton className="h-5 w-10 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-4 w-32" />
              <Skeleton className="mt-1.5 h-3 w-48" />
            </div>
          ))
        ) : (
          appsList.map((app) => (
            <div
              key={app.slug}
              className={cn(
                'glass-card rounded-xl border p-4 transition-all',
                app.is_active
                  ? 'border-empire-primary/20 bg-empire-primary/[0.03] dark:bg-empire-primary/[0.04]'
                  : 'border-empire-border'
              )}
            >
              <div className="flex items-start justify-between">
                <div className={cn(
                  'rounded-lg border p-2.5 transition-colors',
                  app.is_active
                    ? 'border-empire-primary/25 bg-empire-primary/10'
                    : 'border-empire-border bg-empire-elevated'
                )}>
                  <AppIcon icon={app.icon} />
                </div>
                <Switch
                  checked={app.is_active}
                  onCheckedChange={(v) => void handleToggle(app.slug, v)}
                  disabled={!isAdminOrOwner || update.isPending}
                  aria-label={`${app.is_active ? 'Desativar' : 'Ativar'} ${app.label}`}
                />
              </div>
              <h3 className="mt-3 text-[14px] font-semibold text-empire-void">{app.label}</h3>
              <p className="mt-0.5 text-[12px] text-empire-muted">
                {app.is_active ? 'Ativo' : 'Desativado'}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="flex items-center gap-2 text-[12px] text-empire-subtle">
        <LayoutGrid className="h-3.5 w-3.5" />
        <span>Apps desativados ficam ocultos para todos os membros.</span>
      </div>
    </div>
  )
}
