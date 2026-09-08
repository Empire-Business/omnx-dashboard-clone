import { useMemo } from 'react'
import { Plug, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type {
  GhlFieldMapping,
  GhlIntegrationSettings,
  GhlPipelineMapping,
  GhlStageMapping,
} from '@/types/ghl-config'

interface GhlStatusCardProps {
  settings: GhlIntegrationSettings | null | undefined
  isCredentialConnected: boolean
  fields: GhlFieldMapping[] | null | undefined
  pipelines: GhlPipelineMapping[] | null | undefined
  stages: GhlStageMapping[] | null | undefined
  isLoading?: boolean
}

type GhlStatus = 'disconnected' | 'incomplete' | 'connected'

interface ChecklistItem {
  key: string
  label: string
  hint: string
  done: boolean
}

export function GhlStatusCard({
  settings,
  isCredentialConnected,
  fields,
  pipelines,
  stages,
  isLoading,
}: GhlStatusCardProps) {
  const navigate = useNavigate()

  const hasWebhookSecret = Boolean(settings?.webhook_secret)
  const hasFields = (fields?.length ?? 0) > 0
  const hasPipelines = (pipelines?.length ?? 0) > 0
  const hasStages = (stages?.length ?? 0) > 0

  const status: GhlStatus = useMemo(() => {
    if (!isCredentialConnected) return 'disconnected'
    if (hasFields && hasPipelines && hasStages) return 'connected'
    return 'incomplete'
  }, [isCredentialConnected, hasFields, hasPipelines, hasStages])

  const checklist: ChecklistItem[] = useMemo(
    () => [
      {
        key: 'api-key',
        label: 'Chave GHL conectada',
        hint: 'Location ID + Private Integration Token (Vault)',
        done: isCredentialConnected,
      },
      {
        key: 'fields',
        label: 'Campos obrigatórios mapeados',
        hint: 'Lead, telefone, email, origem...',
        done: hasFields,
      },
      {
        key: 'pipelines',
        label: 'Pipelines e stages classificados',
        hint: 'Pré-vendas, vendas, recuperação...',
        done: hasPipelines && hasStages,
      },
      {
        key: 'webhook',
        label: 'Webhook GHL configurado',
        hint: 'Recebe eventos em tempo real',
        done: hasWebhookSecret,
      },
    ],
    [isCredentialConnected, hasFields, hasPipelines, hasStages, hasWebhookSecret],
  )

  const config = {
    disconnected: {
      icon: Plug,
      iconClass: 'bg-empire-danger-soft text-empire-danger border-empire-danger/20',
      title: 'Conectar ao GoHighLevel',
      description:
        'A integração GHL é a espinha dorsal da OMNX. Sem ela, leads e oportunidades não entram.',
      badge: 'Não conectado',
      badgeVariant: 'destructive' as const,
      cta: 'Configurar GHL',
    },
    incomplete: {
      icon: AlertTriangle,
      iconClass: 'bg-empire-warning-soft text-amber-700 dark:text-amber-300 border-empire-warning/30',
      title: 'Integração GHL ativa, mas incompleta',
      description:
        'A conexão existe, mas alguns passos ainda precisam de atenção para os dados fluírem corretamente.',
      badge: 'Mapeamento incompleto',
      badgeVariant: 'warning' as const,
      cta: 'Continuar configuração',
    },
    connected: {
      icon: CheckCircle2,
      iconClass: 'bg-empire-success-soft text-empire-success border-empire-success/20',
      title: 'GoHighLevel conectado',
      description: 'Integração configurada. Leads, pipelines e stages estão sincronizados.',
      badge: 'Tudo certo',
      badgeVariant: 'success' as const,
      cta: 'Revisar mapeamento',
    },
  }

  const current = config[status]
  const Icon = current.icon

  if (isLoading) {
    return (
      <Card className="border-empire-border bg-empire-surface p-6">
        <div className="h-20 animate-pulse rounded-lg bg-empire-elevated" />
      </Card>
    )
  }

  return (
    <Card className="border-empire-border bg-empire-surface overflow-hidden">
      <CardContent className="p-6 sm:p-8">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-4">
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border',
                  current.iconClass,
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-xl font-semibold tracking-tight text-empire-void">
                  {current.title}
                </h2>
                <p className="mt-1 max-w-xl text-sm text-empire-muted">
                  {current.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Badge variant={current.badgeVariant}>{current.badge}</Badge>
              <Button onClick={() => navigate('/workspace/ghl-config')}>
                {current.cta}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-2.5">
            {checklist.map((item) => (
              <div
                key={item.key}
                className={cn(
                  'flex items-center gap-3 rounded-lg border border-empire-border px-4 py-3 transition-opacity',
                  item.done && 'bg-empire-elevated/50 opacity-70',
                )}
              >
                <div
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold',
                    item.done
                      ? 'border-empire-success bg-empire-success text-white'
                      : 'border-empire-subtle text-empire-subtle',
                  )}
                >
                  {item.done ? <CheckCircle2 className="h-3 w-3" /> : '○'}
                </div>
                <span className="flex-1 text-sm font-medium text-empire-void">
                  {item.label}
                </span>
                <span className="hidden text-xs text-empire-subtle sm:inline">
                  {item.hint}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
