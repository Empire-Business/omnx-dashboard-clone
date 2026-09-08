import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Menu, ChevronDown, LayoutGrid, Home } from 'lucide-react'
import { Sidebar } from './Sidebar'
import { AdminMenu } from './AdminMenu'
import { WorkspaceSelector } from './WorkspaceSelector'
import { Separator } from '@/components/ui/separator'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { cn } from '@/lib/utils'
import { ChatWidget } from '@/components/chat/ChatWidget'
import { usePermissions } from '@/contexts/PermissionsContext'
import { getNavigationByPathname } from '@/lib/apps/navigation'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { Target } from 'lucide-react'
import { ICON_MAP, APP_ROUTE } from '@/lib/apps/constants'

const ROUTE_LABELS: Record<string, string> = {
  aquisicao: 'Aquisição',
  dashboard: 'Dashboard',
  metas: 'Metas',
  traqueamento: 'Traqueamento',
  leads: 'Leads',
  'pre-vendas': 'Pré-Vendas',
  'sdr-ia': 'SDR IA',
  recuperacao: 'Recuperação',
  admin: 'Administração',
  users: 'Usuários',
  apps: 'Apps',
  permissions: 'Permissões',
  criativos: 'Criativos',
  disparos: 'Campanhas WhatsApp',
}

const TAB_LABELS: Record<string, string> = {
  'visao-geral': 'Visão Geral',
  trafego: 'Tráfego',
  cods_utm: 'CODS UTM',
  origem: 'Origem',
  anuncios: 'Anúncios',
  organico: 'Orgânico',
  funis: 'Funis',
  geral: 'Visão Geral',
  sdrs: 'SDRs',
  leads_parados: 'Leads Parados',
  overview: 'Visão Geral',
  tracking: 'Acompanhamento',
  registry: 'Metas',
  history: 'Histórico',
  dashboard: 'Dashboard',
  discagem: 'Discagem',
  agendamentos: 'Agendamentos',
  atividades: 'Atividades',
  mqls: 'MQLs',
  auto_agendados: 'Auto Agendados',
  auditoria_ia: 'Auditoria IA',
  matriz: 'Matriz',
  leads: 'Leads',
  reunioes: 'Reuniões',
  cami: 'Cami',
  'painel-cohort': 'Painel Cohort',
  criativos: 'Ranking Criativos',
  lista: 'Lista',
  limpeza: 'Limpeza',
  cohort: 'Cohort',
  produtividade: 'Produtividade',
  comparativo: 'Comparativo',
  tendencias: 'Tendências',
  meta: 'Meta MQL',
  investimentos: 'Investimentos',
  ranking: 'Ranking',
  biblioteca: 'Biblioteca',
}

function Breadcrumb() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)
  const params = new URLSearchParams(location.search)
  const tab = params.get('tab')

  const parts: { label: string; isLast: boolean; href?: string }[] = [
    { label: 'Início', isLast: segments.length === 0, href: '/' },
  ]

  segments.forEach((seg, i) => {
    parts.push({
      label: ROUTE_LABELS[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1),
      isLast: i === segments.length - 1 && !tab,
      href: `/${segments.slice(0, i + 1).join('/')}`,
    })
  })

  if (tab) {
    parts.push({ label: TAB_LABELS[tab] ?? tab, isLast: true })
  }

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0 text-empire-muted">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <span className="shrink-0 text-empire-subtle">/</span>}
          {part.href && !part.isLast ? (
            <Link
              to={part.href}
              className="truncate transition-colors hover:text-empire-void focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50 rounded"
            >
              {i === 0 ? <Home className="h-3.5 w-3.5" /> : part.label}
            </Link>
          ) : (
            <span
              className={cn(
                'truncate',
                part.isLast ? 'font-medium text-empire-void' : 'text-empire-muted'
              )}
            >
              {i === 0 && !part.isLast ? <Home className="h-3.5 w-3.5" /> : part.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}


function AppSelector() {
  const { apps, loadingApps } = usePermissions()
  const location = useLocation()
  const navigate = useNavigate()

  const allowedApps = apps.filter((app) => app.allowed)

  const currentSlug = (() => {
    const pathname = location.pathname
    if (pathname.startsWith('/aquisicao') || pathname.startsWith('/vendas') || pathname.startsWith('/organico')) {
      return 'aquisicao-vendas'
    }
    if (pathname.startsWith('/trafego')) return 'trafego'
    if (pathname.startsWith('/traqueamento')) return 'traqueamento'
    if (pathname.startsWith('/pre-vendas')) return 'pre-vendas'
    if (pathname.startsWith('/recuperacao')) return 'pre-vendas'
    if (pathname.startsWith('/relatorios')) return 'relatorios'
    if (pathname.startsWith('/metas')) return 'metas'
    if (pathname.startsWith('/leads') || pathname.startsWith('/inscricoes')) return 'leads'
    if (pathname.startsWith('/criativos')) return 'criativos'
    if (pathname.startsWith('/disparos')) return 'disparos'
    return null
  })()

  const currentApp = allowedApps.find((app) => app.slug === currentSlug)
  const CurrentIcon = currentApp ? ICON_MAP[currentApp.icon] ?? Target : LayoutGrid

  if (loadingApps) {
    return (
      <div className="flex h-8 w-32 animate-pulse items-center gap-2 rounded-md bg-empire-elevated px-2" />
    )
  }

  if (allowedApps.length <= 1) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="app-selector-trigger"
          className={cn(
            'flex items-center gap-2 rounded-lg border border-empire-border bg-empire-surface px-2.5 py-1.5 text-sm font-medium',
            'text-empire-void transition-all hover:border-empire-border-strong hover:bg-empire-elevated',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50 active:scale-[0.98]'
          )}
        >
          <CurrentIcon className="h-4 w-4 shrink-0 text-empire-primary" />
          <span className="hidden sm:inline">{currentApp?.label ?? 'Apps'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-empire-subtle" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-56">
        <DropdownMenuLabel>Selecionar app</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allowedApps.map((app) => {
          const Icon = ICON_MAP[app.icon] ?? Target
          const isActive = app.slug === currentSlug
          return (
            <DropdownMenuItem
              key={app.slug}
              className={cn(
                'gap-2',
                isActive && 'bg-empire-primary/10 text-empire-primary'
              )}
              onClick={() => navigate(APP_ROUTE[app.slug] ?? '/')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{app.label}</span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/')}>
          <LayoutGrid className="h-4 w-4 shrink-0" />
          <span>Todos os apps</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface DashboardLayoutProps {
  children: React.ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const navItems = getNavigationByPathname(location.pathname)

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-empire-canvas">
      {/* Backdrop mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-empire-void/50 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar desktop — sticky para não rolar com o conteúdo */}
      <div className="sticky top-0 hidden h-[100dvh] self-start md:block z-40">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} items={navItems} />
      </div>

      {/* Sidebar mobile */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 md:hidden transition-transform duration-300 ease-in-out',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar
          collapsed={false}
          onToggle={() => setMobileOpen(false)}
          onMobileClose={() => setMobileOpen(false)}
          items={navItems}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="glass-header sticky top-0 z-30 mx-3 mt-3 flex h-14 shrink-0 items-center gap-2 md:gap-3 rounded-xl border border-empire-border bg-empire-surface/95 dark:bg-transparent px-3 shadow-sm backdrop-blur-md md:mx-4 md:mt-4 md:px-4">
          {/* Hamburger mobile */}
          <button
            className="shrink-0 rounded-lg p-1.5 text-empire-void transition-colors hover:bg-empire-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50 md:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <Separator orientation="vertical" className="h-5 shrink-0 bg-empire-border" />

          <Breadcrumb />

          <div className="flex-1" />

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <AdminMenu />
            <WorkspaceSelector />
            <AppSelector />
          </div>
        </header>

        {/* Main content */}
        <main className="relative flex-1 overflow-auto p-4 md:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>

      {/* Chat Widget */}
      <ChatWidget />
    </div>
  )
}
