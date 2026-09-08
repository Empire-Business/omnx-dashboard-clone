import { useState, useEffect, useCallback, useRef } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { publicErrorMessage } from '@/lib/errors'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/utils/dates'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { PapelSelector } from '@/components/users/PapelSelector'
import {
  Users, MoreHorizontal, Search, Shield, Trash2, Mail, Loader2, ChevronDown, ChevronRight, UserPlus, Building2, Check,
} from 'lucide-react'
import type { WorkspaceMember, ModulePermission, GhlUser, GhlPapel } from '@/types/users'
import { MODULE_TREE, PAPEL_CONFIG } from '@/types/users'
import type { ModuleNode } from '@/types/users'

// ─── Helpers ─────────────────────────────────────────────────

function roleLabel(role: string) {
  const map: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Membro' }
  return map[role] || role
}

function initials(nome: string | null, email: string | null): string {
  if (nome) return nome.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return email?.[0]?.toUpperCase() ?? '?'
}

function AccessBadge({ authUserId }: { authUserId: string | null }) {
  if (!authUserId) return <Badge variant="outline">Sem acesso</Badge>
  return <Badge variant="success">Ativo</Badge>
}

const USER_TABS = [
  { key: 'ghl', label: 'GHL — Time', icon: Building2 },
  { key: 'sistema', label: 'Sistema — Acesso', icon: Shield },
] as const

type UserTabKey = (typeof USER_TABS)[number]['key']

// ─── Main Page ───────────────────────────────────────────────

export function AdminUsersPage() {
  const [tab, setTab] = useState<UserTabKey>('ghl')

  return (
    <PageShell
      title="Usuários"
      description="Gerencie o time GHL, papéis no negócio e acesso ao dashboard."
      tabs={
        <PageTabs
          variant="underline"
          tabs={USER_TABS.map((t) => ({
            label: t.label,
            value: t.key,
            icon: t.icon,
            active: tab === t.key,
            onClick: () => setTab(t.key),
          }))}
        />
      }
    >
      <div className="mt-2">
        {tab === 'ghl' ? <GhlTab /> : <SistemaTab />}
      </div>
    </PageShell>
  )
}

// ─── GHL Tab ─────────────────────────────────────────────────

function GhlTab() {
  const [users, setUsers] = useState<GhlUser[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)

  const [showAdd, setShowAdd] = useState(false)

  const [inviteTarget, setInviteTarget] = useState<GhlUser | null>(null)
  const [showInvite, setShowInvite] = useState(false)

  const [permTarget, setPermTarget] = useState<{ userId: string; nome: string } | null>(null)
  const [permInitial, setPermInitial] = useState<ModulePermission[]>([])
  const [showPerms, setShowPerms] = useState(false)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const wid = await getWorkspaceId()
    const [{ data, error }, workspaceId] = await Promise.all([
      supabase.from('ghl_users').select('*').eq('deleted', false).eq('workspace_id', wid ?? '').order('nome'),
      Promise.resolve(wid),
    ])
    if (error) toast.error('Erro ao carregar usuários GHL')
    else setUsers((data as GhlUser[]) || [])

    if (workspaceId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: membership } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .eq('is_active', true)
          .maybeSingle()
        setIsAdmin(['admin', 'owner'].includes(membership?.role ?? ''))
      }
    }

    setLoading(false)
  }, [])

  useEffect(() => { void Promise.resolve().then(() => loadUsers()) }, [loadUsers])

  const filtered = users.filter(u =>
    !search ||
    u.nome.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  )

  const handleOpenInvite = (user: GhlUser) => {
    setInviteTarget(user)
    setShowInvite(true)
  }

  const handleOpenPerms = async (user: GhlUser) => {
    if (!user.auth_user_id) return
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) return
    const { data } = await supabase
      .from('dashboard_user_permissions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.auth_user_id)
    setPermInitial(data || [])
    setPermTarget({ userId: user.auth_user_id, nome: user.nome })
    setShowPerms(true)
  }

  const handleRevoke = async (user: GhlUser) => {
    if (!user.auth_user_id) return
    if (!confirm(`Remover acesso de ${user.nome} ao dashboard?`)) return
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) return
    await supabase.from('workspace_members')
      .update({ is_active: false })
      .eq('user_id', user.auth_user_id)
      .eq('workspace_id', workspaceId)
    await supabase.from('ghl_users').update({ auth_user_id: null }).eq('id', user.id)
    toast.success('Acesso revogado')
    loadUsers()
  }

  return (
    <>
      <Card variant="glowing">
        <CardHeader className="border-b border-empire-border">
          <div className="flex w-full items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <div className="rounded-lg border border-empire-border bg-empire-elevated p-2.5">
                  <Building2 className="h-5 w-5 text-empire-primary" />
                </div>
                <div>
                  <span>Time GHL</span>
                  {!loading && (
                    <span className="ml-2 text-xs font-normal text-empire-muted">
                      ({users.length} usuários)
                    </span>
                  )}
                </div>
              </CardTitle>
              <CardDescription className="mt-2">
                Defina papéis no negócio e conceda acesso ao dashboard.
              </CardDescription>
            </div>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setShowAdd(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Adicionar membro
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-empire-subtle" />
            <Input
              variant="default"
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 border-b border-empire-border bg-empire-elevated">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Papéis no Negócio</TableHead>
                    <TableHead>Acesso ao Sistema</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i} className="hover:bg-transparent">
                        <TableCell><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 w-40" /></div></TableCell>
                        <TableCell><Skeleton className="h-5 w-48" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-12 text-center text-sm text-empire-muted">
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : filtered.map(user => (
                    <GhlUserRow
                      key={user.id}
                      user={user}
                      onInvite={() => handleOpenInvite(user)}
                      onPermissions={() => handleOpenPerms(user)}
                      onRevoke={() => handleRevoke(user)}
                      onPapeisChange={(papeis) => {
                        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, papeis } : u))
                      }}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {showAdd && (
        <AddGhlMemberDialog
          open={showAdd}
          onClose={() => setShowAdd(false)}
          onCreated={loadUsers}
        />
      )}

      {showInvite && (
        <InviteUserDialog
          open={showInvite}
          onClose={() => { setShowInvite(false); setInviteTarget(null) }}
          ghlUser={inviteTarget}
          onInvited={loadUsers}
        />
      )}

      {showPerms && permTarget && (
        <PermissionsDialog
          open={showPerms}
          onClose={() => setShowPerms(false)}
          userId={permTarget.userId}
          displayName={permTarget.nome}
          initialPermissions={permInitial}
          onSaved={loadUsers}
        />
      )}
    </>
  )
}

// ─── GHL User Row (with debounced papel save) ─────────────────

interface GhlUserRowProps {
  user: GhlUser
  onInvite: () => void
  onPermissions: () => void
  onRevoke: () => void
  onPapeisChange: (papeis: GhlPapel[]) => void
}

function GhlUserRow({ user, onInvite, onPermissions, onRevoke, onPapeisChange }: GhlUserRowProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const handlePapeisChange = (papeis: GhlPapel[]) => {
    const cleanPapeis = papeis.filter(Boolean) as GhlPapel[]
    onPapeisChange(cleanPapeis)
    setSavingState('saving')
    if (timerRef.current) clearTimeout(timerRef.current)
    if (resetRef.current) clearTimeout(resetRef.current)
    timerRef.current = setTimeout(async () => {
      const { error } = await supabase
        .from('ghl_users')
        .update({ papeis: cleanPapeis })
        .eq('id', user.id)
      if (error) {
        toast.error('Erro ao salvar papéis')
        setSavingState('error')
      } else {
        setSavingState('saved')
        resetRef.current = setTimeout(() => setSavingState('idle'), 2000)
      }
    }, 800)
  }

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>{initials(user.nome, user.email)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-empire-void">{user.nome}</p>
            <p className="text-xs text-empire-muted">{user.email ?? '—'}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <PapelSelector value={user.papeis} onChange={handlePapeisChange} />
          {savingState === 'saving' && (
            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-empire-muted" />
          )}
          {savingState === 'saved' && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-empire-success">
              <Check className="h-3 w-3" />Salvo
            </span>
          )}
          {savingState === 'error' && (
            <span className="shrink-0 text-xs text-empire-danger">Erro</span>
          )}
        </div>
      </TableCell>
      <TableCell>
        <AccessBadge authUserId={user.auth_user_id} />
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button className="rounded-lg border border-empire-border bg-empire-elevated p-1.5 transition-colors hover:bg-empire-hover">
              <MoreHorizontal className="h-4 w-4 text-empire-muted" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {!user.auth_user_id && (
              <DropdownMenuItem onClick={onInvite}>
                <UserPlus className="mr-2 h-4 w-4" /> Conceder acesso
              </DropdownMenuItem>
            )}
            {user.auth_user_id && (
              <DropdownMenuItem onClick={onPermissions}>
                <Shield className="mr-2 h-4 w-4" /> Permissões
              </DropdownMenuItem>
            )}
            {user.auth_user_id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onRevoke}>
                  <Trash2 className="mr-2 h-4 w-4 text-empire-danger" />
                  <span className="text-empire-danger">Revogar acesso</span>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  )
}

// ─── Sistema Tab ──────────────────────────────────────────────

function SistemaTab() {
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [showPerms, setShowPerms] = useState(false)
  const [permTarget, setPermTarget] = useState<WorkspaceMember | null>(null)
  const [permInitial, setPermInitial] = useState<ModulePermission[]>([])

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      const [{ data: { user } }, workspaceId] = await Promise.all([
        supabase.auth.getUser(),
        getWorkspaceId(),
      ])
      if (!user || !workspaceId) return
      setCurrentUserId(user.id)

      const { data: self } = await supabase
        .from('workspace_members').select('role')
        .eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle()
      setIsAdmin(['admin', 'owner'].includes(self?.role || ''))

      const { data } = await supabase
        .rpc('get_workspace_members_with_profile', { p_workspace_id: workspaceId })
      setMembers((data || []) as WorkspaceMember[])
    } catch {
      toast.error('Erro ao carregar membros')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadMembers() }, [loadMembers])

  const filtered = members.filter(m =>
    !search ||
    m.email?.toLowerCase().includes(search.toLowerCase()) ||
    m.full_name?.toLowerCase().includes(search.toLowerCase())
  )

  const handleOpenPerms = async (member: WorkspaceMember) => {
    setPermTarget(member)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) return
    const { data } = await supabase
      .from('dashboard_user_permissions').select('*')
      .eq('workspace_id', workspaceId).eq('user_id', member.user_id)
    setPermInitial(data || [])
    setShowPerms(true)
  }

  const handleUpdateRole = async (memberId: string, newRole: 'admin' | 'member') => {
    const { error } = await supabase.from('workspace_members')
      .update({ role: newRole }).eq('id', memberId)
    if (error) toast.error(publicErrorMessage(error, 'Não foi possível atualizar o acesso.'))
    else { toast.success('Papel atualizado'); loadMembers() }
  }

  const handleRemove = async (memberId: string) => {
    if (!confirm('Remover este membro?')) return
    const { error } = await supabase.from('workspace_members')
      .update({ is_active: false }).eq('id', memberId)
    if (error) toast.error(publicErrorMessage(error, 'Não foi possível atualizar o acesso.'))
    else { toast.success('Membro removido'); loadMembers() }
  }

  const handleClaraToggle = async (member: WorkspaceMember) => {
    const next = !member.clara_habilitado
    // Otimista
    setMembers(prev => prev.map(m => m.id === member.id ? { ...m, clara_habilitado: next } : m))
    const { error } = await supabase.from('workspace_members')
      .update({ clara_habilitado: next }).eq('id', member.id)
    if (error) {
      setMembers(prev => prev.map(m => m.id === member.id ? { ...m, clara_habilitado: !next } : m))
      toast.error('Erro ao salvar acesso à Clara')
    }
  }

  return (
    <>
      <Card variant="glowing">
        <CardHeader className="border-b border-empire-border">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <div className="rounded-lg border border-empire-border bg-empire-elevated p-2.5">
                  <Users className="h-5 w-5 text-empire-primary" />
                </div>
                <div>
                  <span>Membros com Acesso</span>
                  {!loading && (
                    <span className="ml-2 text-xs font-normal text-empire-muted">
                      ({members.length} {members.length === 1 ? 'membro' : 'membros'})
                    </span>
                  )}
                </div>
              </CardTitle>
              <CardDescription className="mt-2">
                Usuários com login no dashboard. Para convidar alguém externo (sem GHL), use o botão abaixo.
              </CardDescription>
            </div>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setShowInvite(true)}>
                <UserPlus className="mr-2 h-4 w-4" /> Adicionar externo
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-empire-subtle" />
            <Input
              variant="default"
              placeholder="Buscar por nome ou email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="sticky top-0 border-b border-empire-border bg-empire-elevated">
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Membro</TableHead>
                    <TableHead>Papel</TableHead>
                    <TableHead className="font-mono">Desde</TableHead>
                    <TableHead>Clara</TableHead>
                    <TableHead className="w-[80px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i} className="hover:bg-transparent">
                        <TableCell><div className="flex items-center gap-3"><Skeleton className="h-9 w-9 rounded-full" /><Skeleton className="h-4 w-40" /></div></TableCell>
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="py-12 text-center text-sm text-empire-muted">Nenhum membro encontrado</TableCell></TableRow>
                  ) : filtered.map(member => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback>
                              {member.full_name?.[0]?.toUpperCase() || member.email?.[0]?.toUpperCase() || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-semibold text-empire-void">
                              {member.full_name || 'Sem nome'}
                              {member.user_id === currentUserId && (
                                <span className="ml-2 text-xs text-empire-primary/70">(você)</span>
                              )}
                            </p>
                            <p className="text-xs text-empire-muted">{member.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.role === 'owner' ? 'gold' : 'outline'}>
                          {roleLabel(member.role)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-empire-muted">
                        {fmtDate(member.joined_at)}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleClaraToggle(member)}
                          disabled={!isAdmin}
                          title={member.clara_habilitado ? 'Desabilitar Clara' : 'Habilitar Clara'}
                          className={cn(
                            'flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium transition-colors disabled:cursor-default',
                            member.clara_habilitado
                              ? 'border border-empire-success/30 bg-empire-success-soft text-empire-success'
                              : 'border border-empire-border bg-empire-elevated text-empire-subtle'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-block h-2 w-2 rounded-full',
                              member.clara_habilitado ? 'bg-empire-success' : 'bg-empire-subtle'
                            )}
                          />
                          {member.clara_habilitado ? 'Ativo' : 'Inativo'}
                        </button>
                      </TableCell>
                      <TableCell>
                        {isAdmin && member.role !== 'owner' && member.user_id !== currentUserId ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger>
                              <button className="rounded-lg border border-empire-border bg-empire-elevated p-1.5 transition-colors hover:bg-empire-hover">
                                <MoreHorizontal className="h-4 w-4 text-empire-muted" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent>
                              <DropdownMenuItem onClick={() => handleOpenPerms(member)}>
                                <Shield className="mr-2 h-4 w-4" /> Permissões
                              </DropdownMenuItem>
                              {member.role === 'member' && (
                                <DropdownMenuItem onClick={() => handleUpdateRole(member.id, 'admin')}>
                                  <Mail className="mr-2 h-4 w-4" /> Tornar Admin
                                </DropdownMenuItem>
                              )}
                              {member.role === 'admin' && (
                                <DropdownMenuItem onClick={() => handleUpdateRole(member.id, 'member')}>
                                  <Mail className="mr-2 h-4 w-4" /> Revogar Admin
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleRemove(member.id)}>
                                <Trash2 className="mr-2 h-4 w-4 text-empire-danger" />
                                <span className="text-empire-danger">Remover</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-empire-subtle">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {showInvite && (
        <InviteUserDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
          ghlUser={null}
          onInvited={loadMembers}
        />
      )}

      {showPerms && permTarget && (
        <PermissionsDialog
          open={showPerms}
          onClose={() => setShowPerms(false)}
          userId={permTarget.user_id}
          displayName={permTarget.full_name || permTarget.email || 'Usuário'}
          initialPermissions={permInitial}
          onSaved={loadMembers}
        />
      )}
    </>
  )
}

// ─── Add GHL Member Dialog ────────────────────────────────────

interface AddGhlMemberDialogProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

function AddGhlMemberDialog({ open, onClose, onCreated }: AddGhlMemberDialogProps) {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [papeis, setPapeis] = useState<GhlPapel[]>([])
  const [sendInvite, setSendInvite] = useState(true)
  const [workspaceRole, setWorkspaceRole] = useState<'admin' | 'member'>('member')
  const [perms, setPerms] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  // Reinicia o estado ao abrir
  useEffect(() => {
    if (!open) return
    setNome('')
    setEmail('')
    setPapeis([])
    setSendInvite(true)
    setWorkspaceRole('member')
    const initial: Record<string, { can_view: boolean; can_edit: boolean }> = {}
    const initNode = (node: ModuleNode) => {
      initial[node.key] = { can_view: false, can_edit: false }
      node.children?.forEach(initNode)
    }
    MODULE_TREE.forEach(initNode)
    setPerms(initial)
  }, [open])

  // Atualiza permissões quando papéis mudam
  useEffect(() => {
    const defaultKeys = new Set<string>()
    papeis.forEach(p => PAPEL_CONFIG[p]?.defaultPermissions.forEach(k => defaultKeys.add(k)))
    setPerms(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(k => { next[k] = { can_view: false, can_edit: false } })
      defaultKeys.forEach(k => { if (k in next) next[k] = { can_view: true, can_edit: false } })
      return next
    })
  }, [papeis])

  const toggleExpand = (key: string) => {
    setExpanded(prev => { const n = new Set(prev); if (n.has(key)) { n.delete(key) } else { n.add(key) } return n })
  }
  const setView = (key: string, val: boolean) => {
    setPerms(p => ({ ...p, [key]: { ...p[key], can_view: val, can_edit: val ? p[key].can_edit : false } }))
  }
  const setEdit = (key: string, val: boolean) => {
    setPerms(p => ({ ...p, [key]: { ...p[key], can_view: val ? true : p[key].can_view, can_edit: val } }))
  }

  const handleSave = async () => {
    if (!nome.trim()) { toast.error('Informe o nome'); return }
    if (sendInvite && !email.trim()) { toast.error('Informe o email para enviar o convite'); return }
    setSaving(true)
    try {
      // 1. Criar registro em ghl_users
      const newUserWorkspaceId = await getWorkspaceId()
      if (!newUserWorkspaceId) throw new Error('Conta não encontrada')

      const { data: newUser, error: insertError } = await supabase
        .from('ghl_users')
        .insert({
          ghl_id: `manual_${crypto.randomUUID()}`,
          nome: nome.trim(),
          email: email.trim() || null,
          role_ghl: 'user',
          papeis: papeis,
          deleted: false,
          workspace_id: newUserWorkspaceId,
        })
        .select('id')
        .single()

      if (insertError) throw new Error(insertError.message)

      // 2. Enviar convite se solicitado
      if (sendInvite && email.trim()) {
        const { data: refreshData } = await supabase.auth.refreshSession()
        const session = refreshData.session
        if (!session) throw new Error('Sessão expirada — faça login novamente')
        const workspaceId = await getWorkspaceId()
        if (!workspaceId) throw new Error('Conta não encontrada')

        const permissions = Object.entries(perms)
          .filter(([, s]) => s.can_view)
          .map(([module_key, s]) => ({ module_key, can_view: s.can_view, can_edit: s.can_edit }))

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
              email: email.trim(),
              workspaceId,
              workspaceRole,
              ghlUserId: newUser.id,
              permissions,
            }),
          }
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Erro ao enviar convite')
        toast.success(`${nome} adicionado e convite enviado para ${email}`)
      } else {
        toast.success(`${nome} adicionado ao time GHL`)
      }

      onCreated()
      onClose()
    } catch (err) {
      toast.error(publicErrorMessage(err, 'Não foi possível adicionar o membro.'))
    } finally {
      setSaving(false)
    }
  }

  const renderNode = (node: ModuleNode, depth = 0): ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0
    const isExpanded = expanded.has(node.key)
    const perm = perms[node.key] ?? { can_view: false, can_edit: false }
    return (
      <div key={node.key}>
        <div className={cn('flex items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-empire-elevated', depth > 0 && 'ml-6')}>
          {hasChildren ? (
            <button type="button" onClick={() => toggleExpand(node.key)} className="rounded p-0.5 hover:bg-empire-elevated">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-empire-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-empire-muted" />}
            </button>
          ) : <div className="w-5" />}
          <span className="flex-1 text-sm text-empire-void">{node.label}</span>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-1.5">
              <Checkbox checked={perm.can_view} onCheckedChange={v => setView(node.key, !!v)} />
              <span className="text-xs text-empire-muted">Ver</span>
            </label>
            <label className={cn('flex cursor-pointer items-center gap-1.5', !perm.can_view && 'opacity-40')}>
              <Checkbox checked={perm.can_edit} onCheckedChange={v => setEdit(node.key, !!v)} disabled={!perm.can_view} />
              <span className={cn('text-xs', !perm.can_view ? 'text-empire-subtle' : 'text-empire-muted')}>Editar</span>
            </label>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-4 border-l border-empire-border">
            {node.children!.map(c => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader onClose={onClose}>
          <DialogTitle className="flex items-center gap-2 text-empire-void">
            <UserPlus className="h-5 w-5 text-empire-primary" />
            Adicionar membro ao time GHL
          </DialogTitle>
          <DialogDescription>
            Preencha os dados do novo membro. Ele aparecerá na aba GHL — Time.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="max-h-[70vh] space-y-5 overflow-y-auto">
          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-empire-void">Nome <span className="text-empire-danger">*</span></label>
            <Input
              variant="default"
              placeholder="Nome completo"
              value={nome}
              onChange={e => setNome(e.target.value)}
            />
          </div>

          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-empire-void">Email</label>
            <Input
              variant="default"
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {/* Papéis */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-empire-void">Papéis no negócio</label>
            <PapelSelector value={papeis} onChange={setPapeis} />
          </div>

          {/* Toggle: enviar convite */}
          <div className="space-y-4 rounded-xl border border-empire-border bg-empire-elevated p-4">
            <label className="flex cursor-pointer items-center gap-3">
              <Checkbox checked={sendInvite} onCheckedChange={v => setSendInvite(!!v)} />
              <div>
                <p className="text-sm font-medium text-empire-void">Conceder acesso ao dashboard</p>
                <p className="text-xs text-empire-muted">Envia um convite por email para o membro criar sua senha</p>
              </div>
            </label>

            {sendInvite && (
              <div className="space-y-4 border-t border-empire-border pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-empire-void">Papel no sistema</label>
                  <div className="flex flex-wrap gap-4">
                    {(['member', 'admin'] as const).map(r => (
                      <label key={r} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="addMemberRole"
                          checked={workspaceRole === r}
                          onChange={() => setWorkspaceRole(r)}
                          className="accent-empire-primary"
                        />
                        <span className="text-sm text-empire-void">{r === 'admin' ? 'Admin' : 'Membro'}</span>
                        <span className="text-xs text-empire-muted">
                          {r === 'admin' ? '(pode convidar e gerenciar)' : '(acesso somente leitura)'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-empire-void">Permissões de módulo</label>
                  {papeis.length > 0 && (
                    <p className="text-xs text-empire-subtle">
                      Pré-preenchido com base nos papéis: {papeis.map(p => PAPEL_CONFIG[p]?.label).join(', ')}
                    </p>
                  )}
                  <div className="space-y-0.5 rounded-xl border border-empire-border bg-empire-surface p-2">
                    {MODULE_TREE.map(node => renderNode(node))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="premium" onClick={handleSave} disabled={saving}>
            {saving
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
              : sendInvite
                ? <><Mail className="mr-2 h-4 w-4" />Adicionar e convidar</>
                : <><UserPlus className="mr-2 h-4 w-4" />Adicionar sem acesso</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Invite User Dialog ───────────────────────────────────────

interface InviteUserDialogProps {
  open: boolean
  onClose: () => void
  ghlUser: GhlUser | null
  onInvited: () => void
}

function InviteUserDialog({ open, onClose, ghlUser, onInvited }: InviteUserDialogProps) {
  const [email, setEmail] = useState(ghlUser?.email ?? '')
  const [workspaceRole, setWorkspaceRole] = useState<'admin' | 'member'>('member')
  const [perms, setPerms] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['traqueamento']))
  const [sending, setSending] = useState(false)

  // init perms from ghlUser papeis
  useEffect(() => {
    const initial: Record<string, { can_view: boolean; can_edit: boolean }> = {}
    const initNode = (node: ModuleNode) => {
      initial[node.key] = { can_view: false, can_edit: false }
      node.children?.forEach(initNode)
    }
    MODULE_TREE.forEach(initNode)

    // Apply defaults from papeis
    if (ghlUser) {
      const defaultKeys = new Set<string>()
      ghlUser.papeis.forEach(p => {
        PAPEL_CONFIG[p]?.defaultPermissions.forEach(k => defaultKeys.add(k))
      })
      defaultKeys.forEach(k => {
        if (k in initial) initial[k] = { can_view: true, can_edit: false }
      })
    }
    setPerms(initial)
    setEmail(ghlUser?.email ?? '')
  }, [ghlUser])

  const toggleExpand = (key: string) => {
    setExpanded(prev => { const n = new Set(prev); if (n.has(key)) { n.delete(key) } else { n.add(key) } return n })
  }
  const setView = (key: string, val: boolean) => {
    setPerms(p => ({ ...p, [key]: { ...p[key], can_view: val, can_edit: val ? p[key].can_edit : false } }))
  }
  const setEdit = (key: string, val: boolean) => {
    setPerms(p => ({ ...p, [key]: { ...p[key], can_view: val ? true : p[key].can_view, can_edit: val } }))
  }

  const handleSend = async () => {
    if (!email.trim()) { toast.error('Informe o email'); return }
    setSending(true)
    try {
      // Garante token fresco (evita "Unauthorized" por sessão expirada)
      const { data: refreshData } = await supabase.auth.refreshSession()
      const session = refreshData.session
      if (!session) throw new Error('Sessão expirada — faça login novamente')
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const permissions = Object.entries(perms)
        .filter(([, s]) => s.can_view)
        .map(([module_key, s]) => ({ module_key, can_view: s.can_view, can_edit: s.can_edit }))

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            email: email.trim(),
            workspaceId,
            workspaceRole,
            ghlUserId: ghlUser?.id,
            permissions,
          }),
        }
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Erro ao enviar convite')

      toast.success(`Convite enviado para ${email}`)
      onInvited()
      onClose()
    } catch (err) {
      toast.error(publicErrorMessage(err, 'Não foi possível enviar o convite.'))
    } finally {
      setSending(false)
    }
  }

  const renderNode = (node: ModuleNode, depth = 0): ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0
    const isExpanded = expanded.has(node.key)
    const perm = perms[node.key] ?? { can_view: false, can_edit: false }
    return (
      <div key={node.key}>
        <div className={cn('flex items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-empire-elevated', depth > 0 && 'ml-6')}>
          {hasChildren ? (
            <button type="button" onClick={() => toggleExpand(node.key)} className="rounded p-0.5 hover:bg-empire-elevated">
              {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-empire-muted" /> : <ChevronRight className="h-3.5 w-3.5 text-empire-muted" />}
            </button>
          ) : <div className="w-5" />}
          <span className="flex-1 text-sm text-empire-void">{node.label}</span>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-1.5">
              <Checkbox checked={perm.can_view} onCheckedChange={v => setView(node.key, !!v)} />
              <span className="text-xs text-empire-muted">Ver</span>
            </label>
            <label className={cn('flex cursor-pointer items-center gap-1.5', !perm.can_view && 'opacity-40')}>
              <Checkbox checked={perm.can_edit} onCheckedChange={v => setEdit(node.key, !!v)} disabled={!perm.can_view} />
              <span className={cn('text-xs', !perm.can_view ? 'text-empire-subtle' : 'text-empire-muted')}>Editar</span>
            </label>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-4 border-l border-empire-border">
            {node.children!.map(c => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader onClose={onClose}>
          <DialogTitle className="flex items-center gap-2 text-empire-void">
            <UserPlus className="h-5 w-5 text-empire-primary" />
            {ghlUser ? `Convidar — ${ghlUser.nome}` : 'Adicionar usuário externo'}
          </DialogTitle>
          <DialogDescription>
            Envie um convite por email. O usuário receberá um link para criar sua senha.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="max-h-[70vh] space-y-6 overflow-y-auto">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-empire-void">Email</label>
            <Input
              variant="default"
              type="email"
              placeholder="email@exemplo.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          {/* Papel no sistema */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-empire-void">Papel no sistema</label>
            <div className="flex flex-wrap gap-3">
              {(['member', 'admin'] as const).map(r => (
                <label key={r} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="workspaceRole"
                    checked={workspaceRole === r}
                    onChange={() => setWorkspaceRole(r)}
                    className="accent-empire-primary"
                  />
                  <span className="text-sm text-empire-void">{r === 'admin' ? 'Admin' : 'Membro'}</span>
                  <span className="text-xs text-empire-muted">
                    {r === 'admin' ? '(pode convidar e gerenciar)' : '(acesso somente leitura)'}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Permissões de módulo */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-empire-void">Permissões de módulo</label>
            {ghlUser && ghlUser.papeis.length > 0 && (
              <p className="text-xs text-empire-subtle">
                Pré-preenchido com base nos papéis:{' '}
                {ghlUser.papeis.map(p => PAPEL_CONFIG[p]?.label).join(', ')}
              </p>
            )}
            <div className="space-y-0.5 rounded-xl border border-empire-border bg-empire-surface p-2">
              {MODULE_TREE.map(node => renderNode(node))}
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button variant="premium" onClick={handleSend} disabled={sending}>
            {sending
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</>
              : <><Mail className="mr-2 h-4 w-4" />Enviar convite</>
            }
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Permissions Dialog (shared) ──────────────────────────────

interface PermissionsDialogProps {
  open: boolean
  onClose: () => void
  userId: string
  displayName: string
  initialPermissions: ModulePermission[]
  onSaved: () => void
}

function PermissionsDialog({ open, onClose, userId, displayName, initialPermissions, onSaved }: PermissionsDialogProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['traqueamento']))
  const [perms, setPerms] = useState<Record<string, { can_view: boolean; can_edit: boolean }>>({})
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const permsRef = useRef(perms)

  useEffect(() => { permsRef.current = perms }, [perms])

  const [prevInitialPermissions, setPrevInitialPermissions] = useState<ModulePermission[] | null>(null)
  if (prevInitialPermissions !== initialPermissions) {
    setPrevInitialPermissions(initialPermissions)
    const initial: Record<string, { can_view: boolean; can_edit: boolean }> = {}
    const init = (node: ModuleNode) => {
      const found = initialPermissions.find(p => p.module_key === node.key)
      initial[node.key] = { can_view: found?.can_view ?? false, can_edit: found?.can_edit ?? false }
      node.children?.forEach(init)
    }
    MODULE_TREE.forEach(init)
    setPerms(initial)
  }

  const doSave = async (currentPerms: Record<string, { can_view: boolean; can_edit: boolean }>) => {
    setSavingState('saving')
    if (resetRef.current) clearTimeout(resetRef.current)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setSavingState('error'); return }
    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from('dashboard_user_permissions')
      .delete().eq('workspace_id', workspaceId).eq('user_id', userId)

    const toInsert = Object.entries(currentPerms)
      .filter(([, s]) => s.can_view)
      .map(([key, s]) => ({
        workspace_id: workspaceId,
        user_id: userId,
        module_key: key,
        can_view: s.can_view,
        can_edit: s.can_edit,
        granted_by: user?.id ?? null,
      }))

    if (toInsert.length > 0) {
      const { error } = await supabase.from('dashboard_user_permissions').insert(toInsert as never)
      if (error) { toast.error(publicErrorMessage(error, 'Não foi possível salvar as permissões.')); setSavingState('error'); return }
    }

    setSavingState('saved')
    onSaved()
    resetRef.current = setTimeout(() => setSavingState('idle'), 2000)
  }

  const scheduleAutoSave = (newPerms: Record<string, { can_view: boolean; can_edit: boolean }>) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSave(newPerms), 1000)
  }

  const toggleExpand = (key: string) => {
    setExpanded(prev => { const n = new Set(prev); if (n.has(key)) { n.delete(key) } else { n.add(key) } return n })
  }
  const setView = (key: string, val: boolean) => {
    const newPerms = { ...permsRef.current, [key]: { ...permsRef.current[key], can_view: val, can_edit: val ? permsRef.current[key].can_edit : false } }
    setPerms(newPerms)
    scheduleAutoSave(newPerms)
  }
  const setEdit = (key: string, val: boolean) => {
    const newPerms = { ...permsRef.current, [key]: { ...permsRef.current[key], can_view: val ? true : permsRef.current[key].can_view, can_edit: val } }
    setPerms(newPerms)
    scheduleAutoSave(newPerms)
  }

  const renderNode = (node: ModuleNode, depth = 0): ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0
    const isExpanded = expanded.has(node.key)
    const perm = perms[node.key] ?? { can_view: false, can_edit: false }
    return (
      <div key={node.key}>
        <div className={cn('flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-empire-elevated', depth > 0 && 'ml-6')}>
          {hasChildren ? (
            <button type="button" onClick={() => toggleExpand(node.key)} className="rounded p-0.5 hover:bg-empire-elevated">
              {isExpanded ? <ChevronDown className="h-4 w-4 text-empire-muted" /> : <ChevronRight className="h-4 w-4 text-empire-muted" />}
            </button>
          ) : <div className="w-5" />}
          <div className="flex-1">
            <span className="text-sm font-medium text-empire-void">{node.label}</span>
            {node.description && <p className="text-xs text-empire-subtle">{node.description}</p>}
          </div>
          <div className="flex items-center gap-4">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox checked={perm.can_view} onCheckedChange={v => setView(node.key, !!v)} />
              <span className="text-xs text-empire-muted">Ver</span>
            </label>
            <label className={cn('flex cursor-pointer items-center gap-2', !perm.can_view && 'opacity-40')}>
              <Checkbox checked={perm.can_edit} onCheckedChange={v => setEdit(node.key, !!v)} disabled={!perm.can_view} />
              <span className={cn('text-xs', !perm.can_view ? 'text-empire-subtle' : 'text-empire-muted')}>Editar</span>
            </label>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <div className="ml-4 border-l border-empire-border">
            {node.children!.map(c => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader onClose={onClose}>
          <DialogTitle className="flex items-center gap-2 text-empire-void">
            <Shield className="h-5 w-5 text-empire-primary" />
            Permissões — {displayName}
          </DialogTitle>
          <DialogDescription>Configure quais módulos este usuário pode visualizar ou editar.</DialogDescription>
        </DialogHeader>
        <DialogBody className="max-h-[60vh] overflow-y-auto">
          <div className="space-y-1">
            {MODULE_TREE.map(node => renderNode(node))}
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="mr-auto flex items-center gap-3">
            {savingState === 'saving' && (
              <span className="flex items-center gap-1.5 text-xs text-empire-muted">
                <Loader2 className="h-3 w-3 animate-spin" />Salvando...
              </span>
            )}
            {savingState === 'saved' && (
              <span className="flex items-center gap-1.5 text-xs text-empire-success">
                <Check className="h-3 w-3" />Salvo automaticamente
              </span>
            )}
            {savingState === 'error' && (
              <span className="text-xs text-empire-danger">Erro ao salvar</span>
            )}
          </div>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
