import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { OmnxIcon, OmnxMark } from '@/components/brand/OmnxMark'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/contexts/PermissionsContext'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import type { NavItem } from '@/lib/apps/navigation'
import { resolveAppSlugByPathname } from '@/lib/apps/navigation'
import {
  ChevronRight,
  LogOut,
  Menu,
  X,
  LayoutGrid,
  Settings,
} from 'lucide-react'

function SectionLabel({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  if (collapsed) return null
  return (
    <p className="mb-2 mt-5 px-3 font-mono text-[10px] uppercase tracking-[0.12em] text-empire-subtle">
      {children}
    </p>
  )
}

// Compara pathname + query params exatos (tab/modal) — evita falso ativo quando
// duas páginas usam o mesmo nome de tab (ex: Aquisição e Orgânico, ambas
// "?tab=visao-geral") e suporta itens standalone com query (ex: "/leads?tab=inscricoes").
function isNavHrefActive(pathname: string, search: string, href: string): boolean {
  const [hrefPath, hrefQuery] = href.split('?')
  if (pathname !== hrefPath) return false
  if (!hrefQuery) return true
  const current = new URLSearchParams(search)
  const expected = new URLSearchParams(hrefQuery)
  for (const [key, value] of expected) {
    if (current.get(key) !== value) return false
  }
  return true
}

function NavItemCollapsible({
  item,
  collapsed,
  onLinkClick,
}: {
  item: NavItem
  collapsed: boolean
  onLinkClick?: () => void
}) {
  const location = useLocation()
  const isParentActive = item.children
    ? location.pathname.startsWith(item.href)
    : isNavHrefActive(location.pathname, location.search, item.href)
  const [open, setOpen] = useState(isParentActive)

  // Keep submenu open when navigating to a child route (e.g. via breadcrumb or direct URL)
  const [wasParentActive, setWasParentActive] = useState(isParentActive)
  if (wasParentActive !== isParentActive) {
    setWasParentActive(isParentActive)
    if (isParentActive) setOpen(true)
  }

  if (!item.children) {
    return (
      <Link
        to={item.href}
        onClick={onLinkClick}
        className={cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
          isParentActive
            ? 'bg-empire-primary/10 text-empire-primary dark:bg-empire-primary/[0.12]'
            : 'text-empire-void hover:bg-empire-elevated dark:hover:bg-white/[0.055]',
          collapsed && 'justify-center px-2'
        )}
        title={collapsed ? item.title : undefined}
      >
        <item.icon className="h-4 w-4 shrink-0 transition-colors" />
        {!collapsed && <span className="truncate">{item.title}</span>}
      </Link>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
          isParentActive
            ? 'bg-empire-elevated text-empire-primary dark:bg-white/[0.06]'
            : 'text-empire-void hover:bg-empire-elevated dark:hover:bg-white/[0.055]',
          collapsed && 'justify-center px-2'
        )}
        title={collapsed ? item.title : undefined}
      >
        <item.icon className="h-4 w-4 shrink-0 transition-colors" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left truncate">{item.title}</span>
            <ChevronRight
              className={cn(
                'h-4 w-4 shrink-0 text-empire-subtle transition-transform duration-200 group-hover:text-empire-muted',
                open && 'rotate-90'
              )}
            />
          </>
        )}
      </button>

      {!collapsed && open && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-empire-border dark:border-white/[0.07] pl-3">
          {item.children.map((child) => {
            const isActive = isNavHrefActive(location.pathname, location.search, child.href)
            return (
              <Link
                key={child.href}
                to={child.href}
                onClick={onLinkClick}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
                  isActive
                    ? 'font-semibold text-empire-primary'
                    : 'text-empire-muted hover:bg-empire-elevated hover:text-empire-void dark:hover:bg-white/[0.055]'
                )}
              >
                <child.icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{child.title}</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onMobileClose?: () => void
  items?: NavItem[]
}

export function Sidebar({ collapsed, onToggle, onMobileClose, items }: SidebarProps) {
  const { user, signOut } = useAuth()
  const { hasPermission, hasFeaturePermission, apps, isAdminOrOwner } = usePermissions()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    if (onMobileClose) {
      onMobileClose()
    }
  }, [location.pathname, location.search]) // eslint-disable-line react-hooks/exhaustive-deps

  const userInitial = user?.email?.[0]?.toUpperCase() ?? 'U'
  const userName = user?.user_metadata?.full_name ?? user?.email ?? 'Usuário'
  const userEmail = user?.email ?? ''

  const activeApps = new Set(apps.filter(a => a.is_active && a.allowed).map(a => a.slug))

  const visibleNavigation = (items ?? []).filter(item => {
    // Se o item nao tem moduleKey nem featureKey, exibe (links genericos)
    if (!item.moduleKey && !item.featureKey) return true

    // Verifica permissao de feature quando disponivel
    if (item.featureKey) {
      const appSlug = resolveAppSlugByPathname(item.href)
      if (appSlug && !activeApps.has(appSlug)) return false
      if (appSlug && !hasFeaturePermission(appSlug, item.featureKey)) return false
    }

    // Fallback para moduleKey legado
    if (item.moduleKey && !hasPermission(item.moduleKey)) return false

    return true
  })

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  const isHomeActive = location.pathname === '/'

  return (
    <aside
      className={cn(
        'glass-sidebar flex h-[100dvh] flex-col overflow-hidden transition-all duration-300',
        'bg-empire-surface dark:bg-transparent',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Header — recolhida, troca o wordmark pelo símbolo quadrado (mesma arte
          do favicon) e empilha o botão embaixo.
          O wordmark tem ~107px: nos 64px da sidebar recolhida ele estourava a
          largura, aparecia cortado ("OM") e empurrava o botão de expandir para
          fora da tela, prendendo o usuário no estado recolhido. */}
      <div
        className={cn(
          'flex border-b border-empire-border px-3 py-4',
          collapsed ? 'flex-col items-center gap-2' : 'items-center justify-between gap-2'
        )}
      >
        <Link
          to="/"
          className={cn('flex min-w-0 items-center gap-2 overflow-hidden', collapsed && 'justify-center')}
          aria-label="OMNX"
        >
          {collapsed ? <OmnxIcon className="h-8 w-8" /> : <OmnxMark compact />}
        </Link>
        <button
          onClick={onToggle}
          className="shrink-0 rounded-md p-1.5 text-empire-subtle transition-colors hover:bg-empire-elevated hover:text-empire-void dark:hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50"
          aria-label={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
        >
          {collapsed ? <Menu className="h-4 w-4" /> : <X className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5 scrollbar-hide">
        <Link
          to="/"
          onClick={onMobileClose}
          className={cn(
            'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
            isHomeActive
              ? 'bg-empire-primary/10 text-empire-primary dark:bg-empire-primary/[0.12] dark:text-empire-primary'
              : 'text-empire-void hover:bg-empire-elevated hover:text-empire-void dark:hover:bg-white/[0.055]',
            collapsed && 'justify-center px-2'
          )}
          title={collapsed ? 'Todos os apps' : undefined}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate">Todos os apps</span>}
        </Link>

        {isAdminOrOwner && (
          <Link
            to="/workspace"
            onClick={onMobileClose}
            className={cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
              location.pathname.startsWith('/workspace')
                ? 'bg-empire-primary/10 text-empire-primary dark:bg-empire-primary/[0.12] dark:text-empire-primary'
                : 'text-empire-void hover:bg-empire-elevated hover:text-empire-void dark:hover:bg-white/[0.055]',
              collapsed && 'justify-center px-2'
            )}
            title={collapsed ? 'Admin' : undefined}
          >
            <Settings className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate">Admin</span>}
          </Link>
        )}

        <SectionLabel collapsed={collapsed}>Menu</SectionLabel>
        {visibleNavigation.map((item) => (
          <NavItemCollapsible
            key={item.href}
            item={item}
            collapsed={collapsed}
            onLinkClick={onMobileClose}
          />
        ))}
      </nav>

      {/* User footer — recolhida, empilha avatar e sair; lado a lado eles somam
          mais que os 64px disponíveis e o botão de sair saía da tela. */}
      <div
        className={cn(
          'flex border-t border-empire-border p-3',
          collapsed ? 'flex-col items-center gap-2' : 'items-center gap-2'
        )}
      >
        <Avatar className="h-8 w-8 shrink-0 ring-1 ring-empire-border" aria-label={`Avatar de ${userName}`}>
          <AvatarFallback>{userInitial}</AvatarFallback>
        </Avatar>
        {!collapsed && (
          <div className="flex min-w-0 flex-1 flex-col leading-none">
            <span className="truncate text-sm font-semibold text-empire-void">
              {userName}
            </span>
            <span className="mt-0.5 truncate text-[11px] text-empire-subtle">
              {userEmail}
            </span>
          </div>
        )}
        <button
          onClick={handleLogout}
          title="Sair"
          aria-label="Sair"
          className="shrink-0 rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-danger-soft hover:text-empire-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </aside>
  )
}
