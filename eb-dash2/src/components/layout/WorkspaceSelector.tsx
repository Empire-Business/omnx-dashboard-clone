import { useEffect, useState } from 'react'
import { Building2, ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import {
  listUserWorkspaces,
  getSelectedWorkspaceId,
  setSelectedWorkspaceId,
  isSingleTenantMode,
  resolveTenancyMode,
} from '@/lib/workspace'
import type { UserWorkspace, TenancyMode } from '@/lib/workspace'

export function WorkspaceSelector() {
  const [workspaces, setWorkspaces] = useState<UserWorkspace[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(getSelectedWorkspaceId())
  const [loading, setLoading] = useState(true)
  // Lado seguro: começa false — só mostramos o seletor no single-tenant lock
  // depois de confirmar via resolveTenancyMode() que este usuário é
  // owner/admin de agência (nunca antes de resolver, nunca por suposição).
  const [showForAgency, setShowForAgency] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const [data, tenancyMode] = await Promise.all([
        listUserWorkspaces(),
        isSingleTenantMode() ? resolveTenancyMode() : Promise.resolve<TenancyMode>('multi-tenant'),
      ])
      if (cancelled) return
      setWorkspaces(data)
      setShowForAgency(tenancyMode === 'multi-tenant')

      // Se nada estiver selecionado e houver workspaces, não forçamos a seleção aqui —
      // getWorkspaceId() já resolve isso. Mas mantemos o estado local sincronizado.
      const currentSelected = getSelectedWorkspaceId()
      const validIds = new Set(data.map((w) => w.workspace_id))
      if (currentSelected && validIds.has(currentSelected)) {
        setSelectedId(currentSelected)
      } else if (data.length > 0) {
        setSelectedId(data[0].workspace_id)
      }
      setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [])

  // Em single-tenant, o cliente comum nunca vê o seletor — exceto quem é
  // owner/admin de agência (2+ workspaces via resolveTenancyMode), que
  // precisa trocar de sub-conta para operar (Fase 5, fatia 3b).
  if (isSingleTenantMode() && !showForAgency) return null

  if (loading) {
    return (
      <div className="flex h-8 w-40 animate-pulse items-center gap-2 rounded-md bg-empire-elevated px-2" />
    )
  }

  if (workspaces.length <= 1) return null

  const current = workspaces.find((w) => w.workspace_id === selectedId) ?? workspaces[0]

  const handleSelect = (workspaceId: string) => {
    if (workspaceId === selectedId) return
    setSelectedWorkspaceId(workspaceId)
    setSelectedId(workspaceId)
    // Recarrega a aplicação para que todos os hooks/contextos reflitam o novo workspace
    window.location.assign('/')
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid="workspace-selector-trigger"
          className={cn(
            'flex items-center gap-2 rounded-lg border border-empire-border bg-empire-surface px-2.5 py-1.5 text-sm font-medium',
            'text-empire-void transition-all hover:border-empire-border-strong hover:bg-empire-elevated',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary/50 active:scale-[0.98]'
          )}
        >
          <Building2 className="h-4 w-4 shrink-0 text-empire-primary" />
          <span className="hidden max-w-[140px] truncate sm:inline">{current?.workspaces?.name ?? 'Workspace'}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-empire-subtle" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="bottom" sideOffset={6} className="w-64">
        <DropdownMenuLabel>Selecionar workspace</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((w) => {
          const isActive = w.workspace_id === selectedId
          return (
            <DropdownMenuItem
              key={w.workspace_id}
              className={cn('gap-2', isActive && 'bg-empire-primary/10 text-empire-primary')}
              onClick={() => handleSelect(w.workspace_id)}
            >
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{w.workspaces.name}</span>
              {isActive && <Check className="h-4 w-4 shrink-0" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
