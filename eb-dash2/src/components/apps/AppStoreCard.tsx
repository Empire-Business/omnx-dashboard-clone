import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Power, Store } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ICON_MAP } from '@/lib/apps/constants'
import { cn } from '@/lib/utils'
import type { AppCatalogItem } from '@/types/apps'

interface AppStoreCardProps {
  app: AppCatalogItem
  isInstalled: boolean
  isAdmin: boolean
  isPending: boolean
  onToggle: (slug: string, next: boolean) => void
  variant?: 'store' | 'launcher'
}

const CATEGORY_LABEL: Record<AppCatalogItem['category'], string> = {
  vendas: 'Vendas',
  marketing: 'Marketing',
  operacao: 'Operação',
  inteligencia: 'Inteligência',
  comunicacao: 'Comunicação',
}

const BADGE_STYLES: Record<NonNullable<AppCatalogItem['badge']>, string> = {
  novo: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  beta: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  popular: 'bg-empire-primary/10 text-empire-primary border-empire-primary/20',
}

export function AppStoreCard({
  app,
  isInstalled,
  isAdmin,
  isPending,
  onToggle,
  variant = 'store',
}: AppStoreCardProps) {
  const navigate = useNavigate()
  const [isHovering, setIsHovering] = useState(false)
  const Icon = ICON_MAP[app.icon] ?? Store
  const isLauncher = variant === 'launcher'

  const handleClick = () => {
    if (isLauncher) {
      navigate(`/app/${app.slug}`)
      return
    }
    if (!isAdmin || isPending) return
    onToggle(app.slug, !isInstalled)
  }

  if (isLauncher) {
    return (
      <Card
        variant="interactive"
        className="group relative flex flex-col overflow-hidden transition-all duration-200 hover:border-empire-primary/30"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
      >
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-empire-primary/60 via-empire-primary to-empire-primary/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
        <CardContent className="flex flex-1 flex-col p-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-empire-border bg-empire-elevated text-empire-primary transition-all duration-200 group-hover:scale-105 group-hover:border-empire-primary/20 group-hover:bg-empire-primary/8 group-hover:shadow-[0_0_20px_rgba(130,10,209,0.14)]">
            <Icon className="h-6 w-6 transition-transform duration-200 group-hover:scale-110" />
          </div>
          <div className="mt-4 flex-1">
            <h3 className="text-base font-semibold text-empire-void transition-colors group-hover:text-empire-primary">
              {app.label}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-empire-muted line-clamp-2">
              {app.description}
            </p>
          </div>
          <div className="mt-5">
            <Button variant="outline" size="sm" className="w-full">
              Abrir
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className={cn(
        'relative flex flex-col overflow-hidden transition-all duration-200',
        isInstalled
          ? 'border-empire-primary/30 bg-empire-primary/[0.03] shadow-[0_0_20px_rgba(130,10,209,0.08)]'
          : 'border-empire-border bg-empire-surface dark:bg-empire-elevated'
      )}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-1 transition-opacity duration-200',
          isInstalled
            ? 'bg-gradient-to-r from-empire-primary/80 via-empire-primary to-empire-primary/80 opacity-100'
            : 'bg-gradient-to-r from-empire-primary/40 via-empire-primary/60 to-empire-primary/40 opacity-0'
        )}
      />

      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border transition-all duration-200',
              isInstalled
                ? 'border-empire-primary/25 bg-empire-primary/10 text-empire-primary'
                : 'border-empire-border bg-empire-elevated text-empire-muted'
            )}
          >
            <Icon className="h-7 w-7" />
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {app.badge && (
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-medium uppercase tracking-wide',
                  BADGE_STYLES[app.badge]
                )}
              >
                {app.badge}
              </Badge>
            )}
            <span className="text-[11px] font-medium text-empire-muted">
              {CATEGORY_LABEL[app.category]}
            </span>
          </div>
        </div>

        <div className="mt-4 flex-1">
          <h3 className="text-base font-semibold text-empire-void">{app.label}</h3>
          <p className="mt-1 text-sm leading-relaxed text-empire-muted line-clamp-2">
            {app.description}
          </p>

          {app.tags && app.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {app.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-empire-elevated px-2 py-0.5 text-[10px] font-medium text-empire-muted"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5">
          {isAdmin ? (
            <Button
              variant={isInstalled ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'w-full gap-2 transition-all duration-200',
                isInstalled &&
                  'bg-empire-primary text-empire-void hover:bg-empire-primary/90',
                !isInstalled &&
                  'border-empire-border-strong text-empire-void hover:bg-empire-elevated hover:text-empire-void'
              )}
              disabled={isPending}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
              onClick={handleClick}
            >
              {isInstalled ? (
                isHovering ? (
                  <>
                    <Power className="h-4 w-4" />
                    Desativar
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Ativo
                  </>
                )
              ) : (
                <>
                  <Power className="h-4 w-4" />
                  Ativar
                </>
              )}
            </Button>
          ) : (
            <div
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium',
                isInstalled
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                  : 'border-empire-border bg-empire-surface text-empire-subtle'
              )}
            >
              {isInstalled ? (
                <>
                  <Check className="h-4 w-4" /> Ativo
                </>
              ) : (
                'Não ativo'
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
