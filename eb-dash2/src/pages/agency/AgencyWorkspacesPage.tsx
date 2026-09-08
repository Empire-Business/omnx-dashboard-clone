import { useState } from 'react'
import { Building2, ShieldOff, ShieldCheck, KeyRound } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
} from '@/components/ui/dialog'
import {
  useMyAgencies,
  useAgencyWorkspaces,
  useSuspendAgencyWorkspace,
  useReactivateAgencyWorkspace,
  type AgencyWorkspaceRow,
  type AgencyWorkspaceStatus,
} from '@/hooks/useAgency'

// Fase 5 (Agency UI) — docs/PLANO-MULTI-TENANT-AGENCY.md secao 8.
// Pagina unica da area /agency/*: lista as sub-contas (agency_workspaces) da
// agencia do usuario logado, com suspensao/reativacao.

const STATUS_BADGE: Record<AgencyWorkspaceStatus, { label: string; className: string }> = {
  active: { label: 'Ativa', className: 'bg-empire-success/15 text-empire-success border-empire-success/30' },
  suspended: { label: 'Suspensa', className: 'bg-empire-danger/15 text-empire-danger border-empire-danger/30' },
  pending: { label: 'Pendente', className: 'bg-empire-warning-soft text-amber-800 border-empire-warning/30 dark:text-amber-300' },
}

function SuspendDialog({
  row,
  onClose,
}: {
  row: AgencyWorkspaceRow
  onClose: () => void
}) {
  const suspend = useSuspendAgencyWorkspace()

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader onClose={onClose}>
          <DialogTitle>Suspender sub-conta</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja suspender <strong>{row.workspace?.name ?? row.workspace_id}</strong>? O
            acesso desta sub-conta será bloqueado até que seja reativada.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={suspend.isPending}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={suspend.isPending}
            onClick={() =>
              suspend.mutate(row.id, {
                onSuccess: onClose,
              })
            }
          >
            {suspend.isPending ? 'Suspendendo…' : 'Suspender'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReactivateDialog({
  row,
  onClose,
}: {
  row: AgencyWorkspaceRow
  onClose: () => void
}) {
  const reactivate = useReactivateAgencyWorkspace()
  const [confirmText, setConfirmText] = useState('')
  const expectedName = row.workspace?.name ?? ''
  const isMatch = expectedName.length > 0 && confirmText.trim() === expectedName

  return (
    <Dialog open onClose={onClose}>
      <DialogContent>
        <DialogHeader onClose={onClose}>
          <DialogTitle>Reativar sub-conta</DialogTitle>
          <DialogDescription>
            Para confirmar a reativação, digite exatamente o nome da sub-conta:{' '}
            <strong>{expectedName}</strong>
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reactivate">Nome da sub-conta</Label>
            <Input
              id="confirm-reactivate"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={expectedName}
              autoComplete="off"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={reactivate.isPending}>
            Cancelar
          </Button>
          <Button
            disabled={!isMatch || reactivate.isPending}
            onClick={() =>
              reactivate.mutate(row.id, {
                onSuccess: onClose,
              })
            }
          >
            {reactivate.isPending ? 'Reativando…' : 'Reativar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WorkspaceRowCard({ row }: { row: AgencyWorkspaceRow }) {
  const [dialog, setDialog] = useState<'suspend' | 'reactivate' | null>(null)
  const statusCfg = STATUS_BADGE[row.status] ?? STATUS_BADGE.pending

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-empire-primary" />
            <span className="font-medium text-empire-void">{row.workspace?.name ?? row.workspace_id}</span>
            <Badge className={statusCfg.className}>{statusCfg.label}</Badge>
          </div>
          <div className="text-[12px] text-empire-muted">
            Modo: {row.provisioning_mode} · Location GHL: {row.ghl_location_id ?? '—'}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {row.status === 'active' && (
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 text-empire-danger"
              onClick={() => setDialog('suspend')}
            >
              <ShieldOff className="h-3.5 w-3.5" />
              Suspender
            </Button>
          )}
          {row.status === 'suspended' && (
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setDialog('reactivate')}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Reativar
            </Button>
          )}
        </div>
      </CardContent>

      {row.status === 'pending' && row.provisioning_mode === 'auto_discovered' && (
        <CardContent className="flex items-start gap-2 border-t border-empire-border pt-3 text-[12px] text-empire-muted">
          <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-empire-warning" />
          <span>
            Sub-conta descoberta automaticamente no GHL — ainda não está ativa. O próprio cliente
            precisa entrar no workspace e conectar a chave de API dele em{' '}
            <strong>Configurações → Integrações</strong> para liberar a sincronização de dados.
          </span>
        </CardContent>
      )}

      {dialog === 'suspend' && <SuspendDialog row={row} onClose={() => setDialog(null)} />}
      {dialog === 'reactivate' && <ReactivateDialog row={row} onClose={() => setDialog(null)} />}
    </Card>
  )
}

export function AgencyWorkspacesPage() {
  const { data: agencies, isLoading: isLoadingAgencies } = useMyAgencies()
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | undefined>(undefined)

  const agencyId = selectedAgencyId ?? agencies?.[0]?.agency_id
  const { data: workspaces, isLoading, isError, error } = useAgencyWorkspaces(agencyId)

  return (
    <PageShell title="Sub-contas" description="Gerencie as sub-contas provisionadas pela sua agência.">
      <div className="space-y-6">
        {!isLoadingAgencies && agencies && agencies.length > 1 && (
          <div className="max-w-sm space-y-1.5">
            <Label htmlFor="agency-select">Agência</Label>
            <select
              id="agency-select"
              className="flex h-9 w-full rounded-md border border-empire-border bg-empire-surface px-3 text-sm text-empire-void"
              value={agencyId ?? ''}
              onChange={(e) => setSelectedAgencyId(e.target.value)}
            >
              {agencies.map((a) => (
                <option key={a.agency_id} value={a.agency_id}>
                  {a.agency?.name ?? a.agency_id}
                </option>
              ))}
            </select>
          </div>
        )}

        {isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}

        {isError && (
          <Card>
            <CardContent className="py-4 text-sm text-empire-danger">
              Erro ao carregar sub-contas: {error instanceof Error ? error.message : 'tente novamente'}
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && (!workspaces || workspaces.length === 0) && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Nenhuma sub-conta encontrada</CardTitle>
            </CardHeader>
            <CardContent className="text-[13px] text-empire-muted">
              Esta agência ainda não tem nenhuma sub-conta provisionada.
            </CardContent>
          </Card>
        )}

        {!isLoading && !isError && workspaces && workspaces.length > 0 && (
          <div className="space-y-3">
            {workspaces.map((row) => (
              <WorkspaceRowCard key={row.id} row={row} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
