import { cn } from '@/lib/utils'
import { fmtDateTime } from '@/lib/utils/dates'
import { Clock } from 'lucide-react'
import type { SyncStatus } from '@/hooks/useTrafego'

// Somente leitura: o sync do Meta Ads roda por cron a cada hora, por workspace,
// autenticado com service_role_key (ver docs/SEGURANCA-CRON-CALLER-GUARD.md). Não
// há botão de disparo manual — a edge function não aceita mais chamada de usuário.
interface SyncBannerProps {
  syncStatus: SyncStatus
}

export function SyncBanner({ syncStatus }: SyncBannerProps) {
  const statusColor =
    syncStatus.status === 'success'
      ? 'text-empire-success'
      : syncStatus.status === 'error'
        ? 'text-empire-danger'
        : 'text-empire-subtle'

  return (
    <div className="flex items-center gap-3 rounded-lg border border-empire-border bg-empire-surface px-4 py-2 text-xs text-empire-subtle">
      <Clock className="h-3.5 w-3.5 shrink-0 text-empire-subtle" />
      <span className="flex-1 min-w-0">
        <span className="text-empire-subtle">Meta Ads:</span>{' '}
        <span className={cn('font-medium', statusColor)}>
          {fmtDateTime(syncStatus.lastSync) || 'nunca'}
        </span>
        {syncStatus.status && (
          <>
            {' '}
            · <span className={statusColor}>{syncStatus.status}</span>
          </>
        )}
        {syncStatus.recordsFetched != null && <> · {syncStatus.recordsFetched} registros</>}
      </span>
    </div>
  )
}
