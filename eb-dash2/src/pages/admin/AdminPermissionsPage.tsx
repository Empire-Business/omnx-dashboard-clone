import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Shield } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PageShell } from '@/components/layout/PageShell'
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers'
import { useAppRolePermissions, useUpdateAppRolePermission } from '@/hooks/useAppRolePermissions'
import { useAppUserOverrides, useUpdateAppUserOverride } from '@/hooks/useAppUserOverrides'
import { usePermissions } from '@/contexts/PermissionsContext'
import { APP_CATALOG } from '@/types/apps'

const ROLES = [
  { key: 'owner', label: 'Owner', description: 'Acesso total ao sistema' },
  { key: 'admin', label: 'Admin', description: 'Gerencia usuários e configurações' },
  { key: 'member', label: 'Member', description: 'Acesso limitado pelo admin' },
] as const

function roleLabel(role: string) {
  return ROLES.find((r) => r.key === role)?.label ?? role
}

export function AdminPermissionsPage() {
  const { isAdminOrOwner } = usePermissions()
  const [selectedApp, setSelectedApp] = useState<string>(APP_CATALOG[0]?.slug ?? '')

  const appLabel = useMemo(
    () => APP_CATALOG.find((a) => a.slug === selectedApp)?.label ?? selectedApp,
    [selectedApp]
  )

  return (
    <PageShell
      title="Permissões por App"
      description="Controle quais papéis e usuários podem acessar cada app."
    >
      <Card variant="glowing">
        <CardHeader className="border-b border-empire-border">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-3">
                <div className="rounded-lg border border-empire-border bg-empire-elevated p-2.5">
                  <Shield className="h-5 w-5 text-empire-primary" />
                </div>
                <span>Selecionar App</span>
              </CardTitle>
              <CardDescription className="mt-2">
                Escolha o app para configurar permissões de papel e overrides por usuário.
              </CardDescription>
            </div>
            <div className="w-full sm:w-64">
              <Select value={selectedApp} onValueChange={setSelectedApp} disabled={!isAdminOrOwner}>
                <SelectContent>
                  {APP_CATALOG.filter((app) => !app.hidden).map((app) => (
                    <SelectItem key={app.slug} value={app.slug}>
                      {app.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8 pt-6">
          <RolePermissionsSection appSlug={selectedApp} appLabel={appLabel} />
          <UserOverridesSection appSlug={selectedApp} appLabel={appLabel} />
        </CardContent>
      </Card>
    </PageShell>
  )
}

function RolePermissionsSection({ appSlug, appLabel }: { appSlug: string; appLabel: string }) {
  const { isAdminOrOwner } = usePermissions()
  const { data: permissions, isLoading } = useAppRolePermissions(appSlug)
  const update = useUpdateAppRolePermission()

  const handleToggle = async (role: string, next: boolean) => {
    if (!isAdminOrOwner) return
    try {
      await update.mutateAsync({ appSlug, role, canView: next })
      toast.success('Permissão de papel atualizada')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar'
      toast.error(message)
    }
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-empire-void">Por papel</h2>
        <p className="text-sm text-empire-muted">
          Permissões padrão para cada papel no app <strong>{appLabel}</strong>.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Papel</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[120px] text-right">Pode ver</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-9 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : (
                ROLES.map((role) => {
                  const isPrivileged = role.key === 'owner' || role.key === 'admin'
                  const record = permissions?.get(role.key)
                  const checked = isPrivileged || (record?.can_view ?? false)

                  return (
                    <TableRow key={role.key}>
                      <TableCell>
                        <span className="text-sm font-medium text-empire-void">{role.label}</span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-empire-muted">{role.description}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          {isPrivileged && (
                            <span className="text-xs text-empire-muted">sempre ativo</span>
                          )}
                          <Switch
                            checked={checked}
                            disabled={isPrivileged || !isAdminOrOwner || update.isPending}
                            onCheckedChange={(val) => handleToggle(role.key, val)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  )
}

function UserOverridesSection({ appSlug, appLabel }: { appSlug: string; appLabel: string }) {
  const { isAdminOrOwner } = usePermissions()
  const { data: members, isLoading: loadingMembers } = useWorkspaceMembers()
  const { data: overrides, isLoading: loadingOverrides } = useAppUserOverrides(appSlug)
  const update = useUpdateAppUserOverride()

  const handleToggle = async (userId: string, next: boolean, hasOverride: boolean) => {
    if (!isAdminOrOwner) return
    try {
      await update.mutateAsync({ appSlug, userId, canView: next, hasOverride })
      toast.success(hasOverride ? 'Override atualizado' : 'Override criado')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao salvar'
      toast.error(message)
    }
  }

  const isLoading = loadingMembers || loadingOverrides

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-empire-void">Por usuário</h2>
        <p className="text-sm text-empire-muted">
          Overrides individuais vencem as permissões de papel no app <strong>{appLabel}</strong>.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Membro</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead className="w-[140px]">Status</TableHead>
                <TableHead className="w-[120px] text-right">Pode ver</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i} className="hover:bg-transparent">
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="ml-auto h-5 w-9 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : !members || members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-12 text-center text-sm text-empire-muted">
                    Nenhum membro encontrado.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((member) => {
                  const override = overrides?.get(member.user_id)
                  const hasOverride = !!override
                  const checked = override?.can_view ?? false
                  const isPrivileged = member.role === 'owner' || member.role === 'admin'

                  return (
                    <TableRow key={member.user_id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-empire-void">
                            {member.full_name || 'Sem nome'}
                          </span>
                          <span className="text-xs text-empire-muted">{member.email}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-empire-muted">{roleLabel(member.role)}</span>
                      </TableCell>
                      <TableCell>
                        {hasOverride ? (
                          <Badge variant="outline" className="text-xs">
                            Override
                          </Badge>
                        ) : isPrivileged ? (
                          <span className="text-xs text-empire-muted">via papel</span>
                        ) : (
                          <span className="text-xs text-empire-subtle">padrão</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          {isPrivileged && (
                            <span className="text-xs text-empire-muted">sempre ativo</span>
                          )}
                          <Switch
                            checked={isPrivileged || checked}
                            disabled={isPrivileged || !isAdminOrOwner || update.isPending}
                            onCheckedChange={(val) => handleToggle(member.user_id, val, hasOverride)}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  )
}
