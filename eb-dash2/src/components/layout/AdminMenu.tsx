import { useNavigate } from 'react-router-dom'
import { Users, UserCog, LayoutGrid, LogOut, Settings, LayoutDashboard, ShieldCheck, Plug, KeyRound } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/contexts/PermissionsContext'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const ADMIN_ITEMS = [
  { label: 'Visão Geral', href: '/workspace', icon: LayoutDashboard },
  { label: 'Pessoas', href: '/workspace/users', icon: Users },
  { label: 'Acesso & Time GHL', href: '/workspace/access', icon: UserCog },
  { label: 'Apps', href: '/workspace/apps', icon: LayoutGrid },
  { label: 'Permissões', href: '/workspace/permissions', icon: ShieldCheck },
  { label: 'Conectar GHL', href: '/workspace/ghl-config', icon: Plug },
  { label: 'Integrações', href: '/workspace/integracoes', icon: KeyRound },
] as const

export function AdminMenu() {
  const { isAdminOrOwner, workspaceRole } = usePermissions()
  const { signOut } = useAuth()
  const navigate = useNavigate()

  if (!isAdminOrOwner) {
    return (
      <button
        className={cn(
          'flex h-9 items-center justify-center gap-1.5 rounded-lg border border-empire-border/50 px-2 md:px-3',
          'bg-empire-surface/50 text-empire-muted cursor-not-allowed transition-all'
        )}
        aria-label="Admin"
        title={`Admin (apenas admins — seu papel: ${workspaceRole ?? 'carregando...'})`}
        data-testid="admin-menu-trigger"
        disabled
      >
        <Settings className="h-4 w-4 shrink-0" />
        <span className="hidden md:inline text-[13px] font-medium">Admin</span>
      </button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'flex h-9 items-center justify-center gap-1.5 rounded-lg border border-empire-border bg-empire-surface px-2 md:px-3',
            'text-empire-void transition-all hover:border-empire-border-strong hover:bg-empire-elevated',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50 active:scale-[0.98]'
          )}
          aria-label="Admin"
          title="Admin"
          data-testid="admin-menu-trigger"
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span className="hidden md:inline text-[13px] font-medium">Admin</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-52">
        {ADMIN_ITEMS.map((item) => (
          <DropdownMenuItem
            key={item.href}
            className="gap-2"
            onClick={() => navigate(item.href)}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span>{item.label}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-empire-danger focus:text-empire-danger"
          onClick={() => void signOut().then(() => navigate('/login'))}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sair</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
