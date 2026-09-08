import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Users, ChevronRight, ShieldCheck, User } from 'lucide-react'
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers'
import { useWorkspaceApps } from '@/hooks/useWorkspaceApps'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { WorkspaceMember } from '@/types/users'

function roleLabel(role: string): string {
  if (role === 'owner') return 'Owner'
  if (role === 'admin') return 'Admin'
  return 'Membro'
}

function roleBadgeClass(role: string): string {
  if (role === 'owner') return 'bg-empire-primary/15 text-empire-primary border-empire-primary/30'
  if (role === 'admin') return 'bg-purple-500/15 text-purple-400 border-purple-500/30'
  return 'bg-empire-elevated text-empire-muted border-empire-border'
}

function UserInitials({ name, email }: { name?: string; email?: string }) {
  const text = name ?? email ?? '?'
  const parts = text.split(/[\s@]/).filter(Boolean)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : text.slice(0, 2).toUpperCase()
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-empire-primary/15 text-[13px] font-bold text-empire-primary ring-1 ring-empire-primary/30">
      {initials}
    </div>
  )
}

export function WorkspaceUsersPage() {
  const navigate = useNavigate()
  const { data: members, isLoading } = useWorkspaceMembers()
  const { data: apps } = useWorkspaceApps()
  const [search, setSearch] = useState('')

  const activeAppsCount = useMemo(
    () => (apps ?? []).filter((a) => a.is_active).length,
    [apps]
  )

  const filtered = useMemo(() => {
    if (!members) return []
    const q = search.toLowerCase().trim()
    if (!q) return members
    return members.filter(
      (m) =>
        m.full_name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q)
    )
  }, [members, search])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-empire-void">Pessoas</h1>
        <p className="mt-1 text-sm text-empire-muted">
          Selecione uma pessoa para ver e editar todos os seus acessos de uma vez.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {[
          { label: 'Membros', value: members?.length ?? 0, icon: Users },
          { label: 'Apps ativos', value: activeAppsCount, icon: ShieldCheck },
          { label: 'Admins', value: members?.filter((m) => m.role !== 'member').length ?? 0, icon: User },
        ].map((stat) => (
          <div
            key={stat.label}
            className="glass-card flex items-center gap-4 rounded-xl border border-empire-border p-4"
          >
            <div className="rounded-lg border border-empire-border bg-empire-elevated p-2.5">
              <stat.icon className="h-4 w-4 text-empire-primary" />
            </div>
            <div>
              <p className="text-xl font-bold text-empire-void">{isLoading ? '–' : stat.value}</p>
              <p className="text-xs text-empire-muted">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Search + list */}
      <div className="rounded-xl border border-empire-border bg-empire-surface dark:bg-empire-surface/50">
        {/* Search */}
        <div className="border-b border-empire-border px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-empire-subtle" />
            <input
              type="text"
              placeholder="Buscar por nome ou e-mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'w-full rounded-lg border border-empire-border bg-empire-elevated py-2 pl-9 pr-4 text-sm text-empire-void',
                'placeholder:text-empire-subtle focus:border-empire-primary/50 focus:outline-none focus:ring-2 focus:ring-empire-primary/25'
              )}
            />
          </div>
        </div>

        {/* List */}
        <div className="divide-y divide-empire-border">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-empire-subtle">
              <Users className="h-8 w-8 opacity-40" />
              <p className="text-sm">{search ? 'Nenhum membro encontrado' : 'Nenhum membro cadastrado'}</p>
            </div>
          ) : (
            filtered.map((member: WorkspaceMember) => (
              <button
                key={member.user_id}
                onClick={() => navigate(`/workspace/users/${member.user_id}`)}
                className={cn(
                  'flex w-full items-center gap-4 px-4 py-3 text-left transition-colors',
                  'hover:bg-empire-elevated dark:hover:bg-white/[0.03]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-empire-primary/40'
                )}
                aria-label={`Ver detalhes de ${member.full_name ?? member.email}`}
              >
                <UserInitials name={member.full_name} email={member.email} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold text-empire-void">
                    {member.full_name ?? member.email}
                  </p>
                  {member.full_name && (
                    <p className="truncate text-[12px] text-empire-subtle">{member.email}</p>
                  )}
                </div>

                <span
                  className={cn(
                    'shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                    roleBadgeClass(member.role)
                  )}
                >
                  {roleLabel(member.role)}
                </span>

                <ChevronRight className="h-4 w-4 shrink-0 text-empire-subtle" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
