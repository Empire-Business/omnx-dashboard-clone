import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AppStoreCard } from './AppStoreCard'
import { cn } from '@/lib/utils'
import type { AppCatalogItem } from '@/types/apps'
import type { WorkspaceApp } from '@/types/apps'

interface FirstTimeAppSetupProps {
  apps: WorkspaceApp[]
  isAdminOrOwner: boolean
  isLoading: boolean
  onInstall: (slug: string) => Promise<void>
  onFinish?: () => void
}

export function FirstTimeAppSetup({
  apps,
  isAdminOrOwner,
  isLoading,
  onInstall,
  onFinish,
}: FirstTimeAppSetupProps) {
  const navigate = useNavigate()
  const [installing, setInstalling] = useState<Set<string>>(new Set())
  const [installed, setInstalled] = useState<Set<string>>(
    new Set(apps.filter((a) => a.is_active).map((a) => a.slug))
  )

  const catalogApps = useMemo(() => {
    return apps.map((app) => ({
      ...app,
      isInstalled: installed.has(app.slug),
    }))
  }, [apps, installed])

  const installedCount = installed.size
  const hasSelection = installedCount > 0

  const handleToggle = async (slug: string, next: boolean) => {
    if (next) {
      setInstalling((prev) => new Set(prev).add(slug))
      try {
        await onInstall(slug)
        setInstalled((prev) => new Set(prev).add(slug))
      } finally {
        setInstalling((prev) => {
          const nextSet = new Set(prev)
          nextSet.delete(slug)
          return nextSet
        })
      }
    }
  }

  const handleFinish = () => {
    if (onFinish) {
      onFinish()
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-empire-canvas">
      <main className="flex-1 px-4 py-8 md:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 text-center md:mb-12">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-empire-border bg-empire-surface shadow-sm">
              <Sparkles className="h-7 w-7 text-empire-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-empire-void md:text-3xl">
              Bem-vindo à OMNX
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-base text-empire-muted">
              Escolha os módulos que você quer ativar para começar. Você pode ativar ou desativar
              qualquer um depois, a qualquer momento.
            </p>

            <div className="mt-6 flex items-center justify-center gap-3 text-sm">
              <span className={cn('font-medium', hasSelection ? 'text-empire-primary' : 'text-empire-subtle')}>
                {installedCount} {installedCount === 1 ? 'módulo ativado' : 'módulos ativados'}
              </span>
              {hasSelection && (
                <>
                  <span className="text-empire-border">|</span>
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-empire-primary"
                    onClick={handleFinish}
                  >
                    Continuar
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {catalogApps.map((app) => (
              <AppStoreCard
                key={app.slug}
                app={app as unknown as AppCatalogItem}
                isInstalled={app.isInstalled}
                isAdmin={isAdminOrOwner}
                isPending={isLoading || installing.has(app.slug)}
                onToggle={handleToggle}
                variant="store"
              />
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Button
              size="lg"
              disabled={!hasSelection}
              onClick={handleFinish}
              className="gap-2 px-8"
            >
              {hasSelection ? (
                <>
                  <Check className="h-4 w-4" />
                  Continuar com {installedCount} {installedCount === 1 ? 'módulo' : 'módulos'}
                </>
              ) : (
                'Escolha pelo menos um módulo'
              )}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}
