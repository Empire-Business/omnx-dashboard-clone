import { useState } from 'react'
import { toast } from 'sonner'
import {
  Copy,
  Check,
  RefreshCw,
  Link2,
  Shield,
  AlertTriangle,
  Sparkles,
  SlidersHorizontal,
  ScanLine,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  CircleOff,
  PlugZap,
  BookOpenText,
} from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useGhlIntegrationSettings, useSaveGhlIntegrationSettings } from '@/hooks/useGhlIntegrationSettings'
import { useCredentialsStatus, useSaveCredential, useTestConnection } from '@/hooks/useWorkspaceCredentials'
import { useGhlFieldMappings } from '@/hooks/useGhlFieldMappings'
import { useGhlPipelineMappings } from '@/hooks/useGhlPipelineMappings'
import { useGhlStageMappings } from '@/hooks/useGhlStageMappings'
import { useGhlDiscovery } from '@/hooks/useGhlDiscovery'
import { useGhlFieldMappingTemplates } from '@/hooks/useGhlFieldMappingTemplates'
import {
  useGhlMappingAlerts,
  useAcknowledgeGhlMappingAlerts,
  ghlMappingAlertSourceLabel,
} from '@/hooks/useGhlMappingAlerts'
import {
  useWebhookContractMismatches,
  useAcknowledgeWebhookContractMismatches,
} from '@/hooks/useWebhookContractMismatches'
import { usePermissions } from '@/contexts/PermissionsContext'
import { GhlMappingWizard } from '@/components/ghl-mapping/GhlMappingWizard'
import { GhlMappingAssistant } from '@/components/ghl-mapping/GhlMappingAssistant'
import { WebhookContractDocsTab } from '@/components/ghl-mapping/WebhookContractDocsTab'
import type { GhlDiscoveryResult, GhlIntegrationSettings, GhlFieldMapping, GhlPipelineMapping, GhlStageMapping } from '@/types/ghl-config'
import { cn } from '@/lib/utils'
import { fmtDateTime } from '@/lib/utils/dates'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined

function getWebhookUrl(): string {
  try {
    const origin = supabaseUrl ? new URL(supabaseUrl).origin : ''
    return origin ? `${origin}/functions/v1/webhook-ghl` : 'https://<projeto>.supabase.co/functions/v1/webhook-ghl'
  } catch {
    return 'https://<projeto>.supabase.co/functions/v1/webhook-ghl'
  }
}

function WebhookUrlCard() {
  const url = getWebhookUrl()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('URL copiada')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Erro ao copiar URL')
    }
  }

  return (
    <Card variant="accent">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4 text-empire-primary" />
          URL do webhook GHL
        </CardTitle>
        <CardDescription>
          Configure esta URL no GHL para receber eventos de contatos e oportunidades.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2">
          <Input readOnly value={url} className="font-mono text-xs" />
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={handleCopy}
            aria-label="Copiar URL"
            title="Copiar URL"
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

interface GhlConnectCardProps {
  isConnected: boolean
  locationIdFromCredential: string
  settings: GhlIntegrationSettings | null
}

/**
 * Passo 1 do fluxo de conexão GHL — BYOK real (Vault, Fase 4), não o
 * modelo antigo de secret de edge function. save_workspace_credential
 * sincroniza ghl_integration_settings.ghl_location_id na mesma transação
 * (migration 20260825000000) — aqui só cuidamos da chave + location_id;
 * o webhook_secret continua num campo próprio, opcional, avançado.
 */
function GhlConnectCard({ isConnected, locationIdFromCredential, settings }: GhlConnectCardProps) {
  const saveCredential = useSaveCredential()
  const testConnection = useTestConnection()
  const saveSettings = useSaveGhlIntegrationSettings()

  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [locationId, setLocationId] = useState(locationIdFromCredential)
  const [webhookSecret, setWebhookSecret] = useState('')
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedSecret = secret.trim()
    const trimmedLocation = locationId.trim()
    if (!trimmedSecret || !trimmedLocation) return
    saveCredential.mutate(
      { provider: 'ghl', secret: trimmedSecret, metadata: { location_id: trimmedLocation } },
      { onSuccess: () => setSecret('') } // nunca manter a chave em tela apos salvar
    )
  }

  const handleSaveWebhookSecret = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = webhookSecret.trim()
    if (!trimmed || !locationIdFromCredential) return
    saveSettings.mutate(
      { ghl_location_id: locationIdFromCredential, webhook_secret: trimmed },
      { onSuccess: () => setWebhookSecret('') }
    )
  }

  return (
    <Card variant="accent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-empire-primary" />
            Passo 1 — Conectar GHL
          </CardTitle>
          {isConnected ? (
            <Badge className="gap-1 bg-empire-success/15 text-empire-success border-empire-success/30">
              <CheckCircle2 className="h-3 w-3" /> Conectado
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <CircleOff className="h-3 w-3" /> Não conectado
            </Badge>
          )}
        </div>
        <CardDescription>
          Cole o Private Integration Token da sua conta GHL. Ele vai direto para um cofre — ninguém
          consegue ler de volta depois. Assim que conectar, o mapeamento de campos abaixo se libera.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {isConnected && (
          <div className="rounded-md border border-empire-border bg-empire-elevated/40 px-3 py-2 text-[12px] text-empire-muted">
            <div className="flex items-center justify-between gap-2">
              <span>
                <span className="font-medium text-empire-void">Location ID:</span>{' '}
                <span className="font-mono">{locationIdFromCredential}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto gap-1.5 px-2 py-1 text-[12px]"
                disabled={testConnection.isPending}
                onClick={() => testConnection.mutate('ghl')}
              >
                <PlugZap className="h-3.5 w-3.5" />
                {testConnection.isPending ? 'Testando…' : 'Testar conexão'}
              </Button>
            </div>
          </div>
        )}

        <form onSubmit={handleConnect} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ghl-location-id">Location ID</Label>
            <Input
              id="ghl-location-id"
              placeholder="Ex: 7gcRvmDSt9GU7ZUuXh1z"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ghl-secret">{isConnected ? 'Trocar chave' : 'Chave de acesso (Private Integration Token)'}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="ghl-secret"
                type={showSecret ? 'text' : 'password'}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={isConnected ? 'Cole a nova chave para trocar' : 'Cole a chave aqui'}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? 'Ocultar chave' : 'Mostrar chave'}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          <Button type="submit" disabled={saveCredential.isPending || !secret.trim() || !locationId.trim()}>
            {saveCredential.isPending ? 'Salvando…' : isConnected ? 'Salvar nova chave' : 'Conectar'}
          </Button>
        </form>

        {isConnected && (
          <details className="rounded-md border border-empire-border">
            <summary className="cursor-pointer select-none px-3 py-2 text-[12px] font-medium text-empire-muted">
              Avançado — Webhook Secret {settings?.webhook_secret ? '(configurado)' : '(opcional)'}
            </summary>
            <form onSubmit={handleSaveWebhookSecret} className="space-y-2 border-t border-empire-border p-3">
              <Label htmlFor="ghl-webhook-secret" className="text-[12px]">
                Segredo para validar a assinatura dos webhooks recebidos
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="ghl-webhook-secret"
                  type={showWebhookSecret ? 'text' : 'password'}
                  value={webhookSecret}
                  onChange={(e) => setWebhookSecret(e.target.value)}
                  placeholder={settings?.webhook_secret ? 'Cole um novo segredo para trocar' : 'Opcional'}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  onClick={() => setShowWebhookSecret((v) => !v)}
                  aria-label={showWebhookSecret ? 'Ocultar segredo' : 'Mostrar segredo'}
                >
                  {showWebhookSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <Button type="submit" size="sm" variant="outline" disabled={saveSettings.isPending || !webhookSecret.trim()}>
                {saveSettings.isPending ? 'Salvando…' : 'Salvar segredo'}
              </Button>
            </form>
          </details>
        )}
      </CardContent>
    </Card>
  )
}

function DiscoveryButton({ onDiscover }: { onDiscover: (result: GhlDiscoveryResult) => void }) {
  const discovery = useGhlDiscovery()

  const handleClick = async () => {
    const result = await discovery.mutateAsync({})
    onDiscover(result)
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={handleClick}
      disabled={discovery.isPending}
      className="gap-2"
    >
      <RefreshCw className={cn('h-4 w-4', discovery.isPending && 'animate-spin')} />
      {discovery.isPending ? 'Buscando...' : 'Buscar campos no GHL'}
    </Button>
  )
}

function buildFieldKey(source: 'contact' | 'opportunity', key: string): string {
  if (source === 'opportunity') return `{{opportunity.${key}}}`
  return key
}

interface CheckForChangesButtonProps {
  existingFields: GhlFieldMapping[]
  existingPipelines: GhlPipelineMapping[]
  existingStages: GhlStageMapping[]
  onHasChanges: (result: GhlDiscoveryResult) => void
}

function CheckForChangesButton({
  existingFields,
  existingPipelines,
  existingStages,
  onHasChanges,
}: CheckForChangesButtonProps) {
  const discovery = useGhlDiscovery()

  const handleClick = async () => {
    try {
      const result = await discovery.mutateAsync({})

      const mappedFieldKeys = new Set(existingFields.map((f) => f.ghl_field_key).filter(Boolean))
      const mappedPipelineIds = new Set(existingPipelines.map((p) => p.ghl_pipeline_id))
      const mappedStageIds = new Set(existingStages.map((s) => s.ghl_stage_id))

      const newFields = [
        ...result.contact_custom_fields.map((f) => buildFieldKey('contact', f.key)),
        ...result.opportunity_custom_fields.map((f) => buildFieldKey('opportunity', f.key)),
      ].filter((key) => !mappedFieldKeys.has(key))

      const newPipelines = result.pipelines.filter((p) => !mappedPipelineIds.has(p.id))

      const newStages = result.pipelines.flatMap((p) =>
        p.stages.filter((s) => !mappedStageIds.has(s.id)),
      )

      const totalNew = newFields.length + newPipelines.length + newStages.length

      if (totalNew === 0) {
        toast.success('Nada novo para mapear', {
          description: 'Todos os campos, pipelines e stages do GHL já estão mapeados.',
        })
      } else {
        toast.info('Novidades detectadas no GHL', {
          description: `${newFields.length} campo(s), ${newPipelines.length} pipeline(s) e ${newStages.length} stage(s) ainda não mapeados.`,
        })
      }

      // Sempre abre o mapeamento guiado já com o resultado da busca — antes o
      // wizard só abria se o usuário clicasse na ação do toast, e o clique no
      // botão da sidebar parecia "não fazer nada".
      onHasChanges(result)
    } catch {
      // Erro já tratado pelo hook
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={discovery.isPending}
      className="w-full gap-2"
    >
      <ScanLine className={cn('h-4 w-4', discovery.isPending && 'animate-spin')} />
      {discovery.isPending ? 'Buscando...' : 'Buscar campos novos no GHL'}
    </Button>
  )
}

/**
 * Vigilância automática: mostra alertas gerados pelo cron diário
 * (ghl-mapping-discovery-watch + ghl-mapping-detect-changes), sem depender do
 * usuário ter clicado em "Buscar campos novos" nesta sessão. Diferente do
 * banner do wizard (que só aparece após discovery manual), este aparece
 * assim que a página carrega, se houver alerta pendente.
 */
function GhlMappingAlertsBanner({ onReview }: { onReview: () => void }) {
  const { data: alerts, isLoading } = useGhlMappingAlerts()
  const acknowledge = useAcknowledgeGhlMappingAlerts()

  if (isLoading || !alerts || alerts.length === 0) return null

  const handleDismiss = () => {
    acknowledge.mutate(alerts.map((a) => a.id))
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-400 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <p className="font-medium">
          A verificação automática encontrou mudanças na sua conta GHL desde a última revisão:
        </p>
        <ul className="space-y-1 text-amber-400/90">
          {alerts.map((alert) => (
            <li key={alert.id}>
              {ghlMappingAlertSourceLabel(alert.source)}: {alert.previous_count} → {alert.current_count}{' '}
              ({alert.delta > 0 ? '+' : ''}
              {alert.delta})
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" size="sm" onClick={onReview}>
            Revisar mapeamento
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            disabled={acknowledge.isPending}
          >
            Já revisei, dispensar
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Vigilância do contrato de webhook: mostra eventos autenticados que chegaram
 * fora do formato esperado — sem contact_id/id, ou customData com chave
 * desconhecida. O evento em si nunca é bloqueado nem perdido; é só um aviso
 * para o owner/admin revisar a configuração de campos customizados.
 * Colapsado por padrão: o resumo de 1 linha tranquiliza ("nada foi perdido")
 * e os detalhes técnicos ficam a um clique, sem dominar a primeira dobra.
 */
function WebhookContractMismatchesBanner() {
  const { data: mismatches, isLoading } = useWebhookContractMismatches()
  const acknowledge = useAcknowledgeWebhookContractMismatches()

  if (isLoading || !mismatches || mismatches.length === 0) return null

  const handleDismissAll = () => {
    acknowledge.mutate(mismatches.map((m) => m.id))
  }

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-400 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 space-y-3">
        <p className="font-medium">
          {mismatches.length} evento{mismatches.length > 1 ? 's' : ''} do webhook chegaram em formato
          inesperado — nada foi perdido, os dados foram recebidos normalmente.
        </p>
        <details className="space-y-2">
          <summary className="cursor-pointer select-none text-amber-400/90">Ver detalhes</summary>
          <ul className="space-y-2 pt-2 text-amber-400/90">
            {mismatches.slice(0, 8).map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div>
                    {fmtDateTime(m.created_at)}
                    {m.location_id ? ` · location ${m.location_id}` : ''}
                  </div>
                  {m.missing_identifiers.length > 0 && (
                    <div>Identificador faltando: {m.missing_identifiers.join(', ')}</div>
                  )}
                  {m.unknown_customdata_keys.length > 0 && (
                    <div>
                      Campo(s) desconhecido(s):{' '}
                      {m.unknown_customdata_keys.slice(0, 5).join(', ')}
                      {m.unknown_customdata_keys.length > 5
                        ? ` +${m.unknown_customdata_keys.length - 5} mais`
                        : ''}
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => acknowledge.mutate([m.id])}
                  disabled={acknowledge.isPending}
                >
                  Reconhecer
                </Button>
              </li>
            ))}
          </ul>
          {mismatches.length > 8 && (
            <p className="text-xs text-amber-400/70">+ {mismatches.length - 8} desvio(s) mais antigo(s).</p>
          )}
          <p className="text-xs text-amber-400/70">
            Referência técnica (para o time de engenharia): docs/CONTRATO-WEBHOOK-CRM.md
          </p>
        </details>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="button" size="sm" variant="ghost" onClick={handleDismissAll} disabled={acknowledge.isPending}>
            Reconhecer todos
          </Button>
        </div>
      </div>
    </div>
  )
}

export function WorkspaceGhlConfigPage() {
  const { isAdminOrOwner } = usePermissions()

  const { data: settings } = useGhlIntegrationSettings()
  const { data: credentials, isLoading: loadingCredentials } = useCredentialsStatus()
  const { data: existingFields } = useGhlFieldMappings()
  const { data: existingPipelines } = useGhlPipelineMappings()
  const { data: existingStages } = useGhlStageMappings()
  const { data: templates } = useGhlFieldMappingTemplates()

  const ghlCredential = credentials?.find((c) => c.provider === 'ghl')
  const isConnected = !!ghlCredential
  const locationIdFromCredential =
    typeof ghlCredential?.metadata?.location_id === 'string' ? ghlCredential.metadata.location_id : ''

  const [activeTab, setActiveTab] = useState<'assistant' | 'advanced' | 'docs'>('advanced')
  const [discoveryResult, setDiscoveryResult] = useState<GhlDiscoveryResult | null>(null)
  const [discoveryKey, setDiscoveryKey] = useState(0)

  const handleDiscover = (result: GhlDiscoveryResult) => {
    setDiscoveryResult(result)
    setDiscoveryKey((k) => k + 1)
  }

  const handleOpenAdvanced = () => {
    setActiveTab('advanced')
  }

  return (
    <PageShell
      title="Configuração GHL"
      description="Conecte a conta GoHighLevel e mapeie campos, pipelines e stages para a OMNX."
    >
      {!isAdminOrOwner && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-400 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Apenas owners e admins podem configurar a integração GHL.</span>
        </div>
      )}

      {isAdminOrOwner && (
        <>
          <WebhookContractMismatchesBanner />
          <GhlMappingAlertsBanner onReview={() => setActiveTab('advanced')} />
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {loadingCredentials ? (
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3 w-72" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-24" />
              </CardContent>
            </Card>
          ) : (
            <GhlConnectCard
              isConnected={isConnected}
              locationIdFromCredential={locationIdFromCredential}
              settings={settings ?? null}
            />
          )}

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'assistant' | 'advanced' | 'docs')}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="advanced" className="gap-2">
                <SlidersHorizontal className="h-4 w-4" />
                Mapeamento guiado
              </TabsTrigger>
              <TabsTrigger value="assistant" className="gap-2">
                <Sparkles className="h-4 w-4" />
                Campo a campo (IA)
              </TabsTrigger>
              <TabsTrigger value="docs" className="gap-2">
                <BookOpenText className="h-4 w-4" />
                Documentação
              </TabsTrigger>
            </TabsList>

            <TabsContent value="assistant" className="space-y-6">
              {!isConnected ? (
                <Card>
                  <CardContent className="py-6">
                    <EmptyState
                      icon={Shield}
                      title="Passo 2 — Mapeamento de campos"
                      description="Conecte sua chave GHL no Passo 1 acima para liberar o mapeamento de campos, pipelines e stages."
                    />
                  </CardContent>
                </Card>
              ) : templates ? (
                <GhlMappingAssistant
                  existingFields={existingFields ?? []}
                  existingPipelines={existingPipelines ?? []}
                  existingStages={existingStages ?? []}
                  templates={templates}
                  onOpenAdvanced={handleOpenAdvanced}
                />
              ) : (
                <Card>
                  <CardContent className="py-6">
                    <EmptyState
                      icon={RefreshCw}
                      title="Carregando templates"
                      description="Aguarde enquanto preparamos o assistente."
                    />
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6">
              {!isConnected ? (
                <Card>
                  <CardContent className="py-6">
                    <EmptyState
                      icon={Shield}
                      title="Passo 2 — Mapeamento de campos"
                      description="Conecte sua chave GHL no Passo 1 acima para liberar o mapeamento de campos, pipelines e stages."
                    />
                  </CardContent>
                </Card>
              ) : (
              <>
              <div className="flex justify-end">
                <DiscoveryButton onDiscover={handleDiscover} />
              </div>
              {discoveryResult && templates && (
                <GhlMappingWizard
                  key={discoveryKey}
                  discoveryResult={discoveryResult}
                  existingFields={existingFields ?? []}
                  existingPipelines={existingPipelines ?? []}
                  existingStages={existingStages ?? []}
                  templates={templates}
                  onClose={() => setDiscoveryResult(null)}
                />
              )}
              {!discoveryResult && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Mapeamento guiado</CardTitle>
                    <CardDescription>
                      Clique em "Buscar campos no GHL" para listar os campos, pipelines e stages
                      da sua conta e classificá-los passo a passo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <EmptyState
                      icon={RefreshCw}
                      title="Nenhuma busca executada"
                      description="A busca lista os campos, pipelines e stages da conta GHL para você classificar. Nada é salvo nesta etapa."
                    />
                  </CardContent>
                </Card>
              )}
              </>
              )}
            </TabsContent>

            <TabsContent value="docs">
              <WebhookContractDocsTab />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <WebhookUrlCard />
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-empire-muted">Integração</span>
                <Badge variant={isConnected ? 'success' : 'secondary'}>
                  {isConnected ? 'Conectada' : 'Pendente'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-empire-muted">Location ID</span>
                <span className="text-empire-void">{locationIdFromCredential || '–'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-empire-muted">Webhook Secret</span>
                <span className="text-empire-void">{settings?.webhook_secret ? 'Configurado' : '–'}</span>
              </div>
              {isConnected && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-empire-muted">Campos do sistema mapeados</span>
                    <span className="text-empire-void">{existingFields?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-empire-muted">Campos do GHL ligados</span>
                    <span className="text-empire-void">
                      {(existingFields ?? []).reduce(
                        (acc, f) => acc + Math.max(f.variations?.length ?? 0, f.ghl_field_key ? 1 : 0),
                        0,
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-empire-muted">Pipelines mapeados</span>
                    <span className="text-empire-void">{existingPipelines?.length ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-empire-muted">Stages mapeados</span>
                    <span className="text-empire-void">{existingStages?.length ?? 0}</span>
                  </div>
                  <CheckForChangesButton
                    existingFields={existingFields ?? []}
                    existingPipelines={existingPipelines ?? []}
                    existingStages={existingStages ?? []}
                    onHasChanges={(result) => {
                      handleDiscover(result)
                      setActiveTab('advanced')
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  )
}
