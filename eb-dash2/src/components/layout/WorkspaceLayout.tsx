import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { WorkspaceSelector } from '@/components/layout/WorkspaceSelector'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { OmnxMark } from '@/components/brand/OmnxMark'
import { ArrowLeft, LayoutDashboard, Users, UserCog, LayoutGrid, ShieldCheck, LogOut, Plug, KeyRound, Bot } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'Visão Geral', href: '/workspace', icon: LayoutDashboard, exact: true },
  { label: 'Pessoas', href: '/workspace/users', icon: Users, exact: false },
  { label: 'Acesso & Time GHL', href: '/workspace/access', icon: UserCog, exact: false },
  { label: 'Apps', href: '/workspace/apps', icon: LayoutGrid, exact: false },
  { label: 'Permissões', href: '/workspace/permissions', icon: ShieldCheck, exact: false },
  { label: 'Conectar GHL', href: '/workspace/ghl-config', icon: Plug, exact: false },
  { label: 'Integrações', href: '/workspace/integracoes', icon: KeyRound, exact: false },
  { label: 'Configurar Clara', href: '/workspace/clara', icon: Bot, exact: false },
] as const

interface WorkspaceLayoutProps {
  children: React.ReactNode
}

export function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const userInitial = user?.email?.[0]?.toUpperCase() ?? 'U'
  const userName = user?.user_metadata?.full_name ?? user?.email ?? 'Usuário'
  const userEmail = user?.email ?? ''

  const handleLogout = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-empire-canvas dark:[background-image:radial-gradient(ellipse_60%_40%_at_80%_0%,rgba(130,10,209,0.06)_0%,transparent_60%)]">
      {/* Sidebar */}
      <aside className="glass-sidebar flex w-52 shrink-0 flex-col overflow-hidden border-r border-empire-border bg-empire-surface dark:bg-transparent">
        {/* Logo */}
        <div className="flex items-center gap-2.5 border-b border-empire-border px-4 py-4">
          <OmnxMark compact />
          <div className="flex flex-col leading-none">
            <span className="text-[11px] text-empire-subtle">Administração</span>
          </div>
        </div>

        {/* Back */}
        <div className="border-b border-empire-border px-3 py-2">
          <Link
            to="/"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-empire-subtle transition-colors hover:bg-empire-elevated hover:text-empire-void dark:hover:bg-white/[0.055]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Voltar aos apps</span>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-2 font-mono text-[10px] uppercase tracking-[0.12em] text-empire-subtle">
            Gestão
          </p>
          {NAV_ITEMS.map((item) => {
            const isActive = item.exact
              ? location.pathname === item.href
              : location.pathname === item.href || location.pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50',
                  isActive
                    ? 'bg-empire-primary/10 text-empire-primary dark:bg-empire-primary/[0.12]'
                    : 'text-empire-void hover:bg-empire-elevated dark:hover:bg-white/[0.055]'
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* User footer */}
        <div className="flex items-center gap-2 border-t border-empire-border p-3">
          <Avatar className="h-7 w-7 shrink-0 ring-1 ring-empire-border" aria-label={`Avatar de ${userName}`}>
            <AvatarFallback className="text-[11px]">{userInitial}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col leading-none">
            <span className="truncate text-[13px] font-semibold text-empire-void">{userName}</span>
            <span className="truncate text-[11px] text-empire-subtle">{userEmail}</span>
          </div>
          <button
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair"
            className="shrink-0 rounded-lg p-1.5 text-empire-subtle transition-colors hover:bg-empire-danger-soft hover:text-empire-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="glass-header sticky top-0 z-30 mx-3 mt-3 flex h-12 shrink-0 items-center justify-between rounded-xl border border-empire-border bg-empire-surface/95 dark:bg-transparent px-4 shadow-sm backdrop-blur-md">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-empire-muted">
            <Link to="/" className="transition-colors hover:text-empire-void">Apps</Link>
            <span className="text-empire-subtle">/</span>
            <Link to="/workspace" className={cn('transition-colors hover:text-empire-void', location.pathname === '/workspace' ? 'font-medium text-empire-void' : '')}>
              Administração
            </Link>
            {location.pathname !== '/workspace' && (
              <>
                <span className="text-empire-subtle">/</span>
                <span className="font-medium text-empire-void">
                  {location.pathname.startsWith('/workspace/users/')
                    ? 'Pessoa'
                    : (NAV_ITEMS.find((i) => !i.exact && (location.pathname === i.href || location.pathname.startsWith(i.href + '/')))?.label ?? location.pathname.split('/').pop())}
                </span>
              </>
            )}
          </nav>
          <div className="flex items-center gap-2">
            <WorkspaceSelector />
            <ThemeToggle />
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
