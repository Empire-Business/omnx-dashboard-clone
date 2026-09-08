import { useMemo } from 'react'
import { CheckCircle2, AlertTriangle, Database, Layers, MapPin, Save, ArrowLeft, Sparkles, SlidersHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { getPipelineCategoryLabel, getSystemStageLabel } from '@/lib/ghl-mapping'
import type { GhlDiscoveryResult, GhlMappingProposal } from '@/types/ghl-config'

interface GhlMappingProposalReviewProps {
  proposal: GhlMappingProposal
  discoveryResult: GhlDiscoveryResult
  fieldName?: string
  fieldSource?: 'contact' | 'opportunity'
  onSave: () => void
  onBack: () => void
  onOpenAdvanced?: () => void
  isLoading?: boolean
}

function buildFieldKey(source: 'contact' | 'opportunity', key: string): string {
  if (source === 'opportunity') return `{{opportunity.${key}}}`
  return key
}

function getFieldName(proposalFieldKey: string, discoveryResult: GhlDiscoveryResult): string {
  const contact = discoveryResult.contact_custom_fields.find(
    (f) => buildFieldKey('contact', f.key) === proposalFieldKey,
  )
  if (contact) return contact.name

  const opportunity = discoveryResult.opportunity_custom_fields.find(
    (f) => buildFieldKey('opportunity', f.key) === proposalFieldKey,
  )
  return opportunity?.name ?? proposalFieldKey
}

function getPipelineName(pipelineId: string, discoveryResult: GhlDiscoveryResult): string {
  return discoveryResult.pipelines.find((p) => p.id === pipelineId)?.name ?? pipelineId
}

function getStageName(stageId: string, discoveryResult: GhlDiscoveryResult): string {
  for (const pipeline of discoveryResult.pipelines) {
    const stage = pipeline.stages.find((s) => s.id === stageId)
    if (stage) return `${pipeline.name} → ${stage.name}`
  }
  return stageId
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const variant = confidence >= 0.8 ? 'success' : confidence >= 0.6 ? 'warning' : 'destructive'
  const label = `${Math.round(confidence * 100)}%`
  return (
    <Badge variant={variant} className="text-[10px]">
      Confiança {label}
    </Badge>
  )
}

export function GhlMappingProposalReview({
  proposal,
  discoveryResult,
  fieldName,
  fieldSource,
  onSave,
  onBack,
  onOpenAdvanced,
  isLoading,
}: GhlMappingProposalReviewProps) {
  const hasWarnings = proposal.warnings.length > 0
  const isEmpty =
    proposal.fields.length === 0 && proposal.pipelines.length === 0 && proposal.stages.length === 0

  const groupedFields = useMemo(() => {
    return proposal.fields.map((field) => ({
      ...field,
      ghlName: getFieldName(field.ghl_field_key, discoveryResult),
    }))
  }, [proposal.fields, discoveryResult])

  const groupedPipelines = useMemo(() => {
    return proposal.pipelines.map((pipeline) => ({
      ...pipeline,
      ghlName: getPipelineName(pipeline.ghl_pipeline_id, discoveryResult),
    }))
  }, [proposal.pipelines, discoveryResult])

  const groupedStages = useMemo(() => {
    return proposal.stages.map((stage) => ({
      ...stage,
      ghlName: getStageName(stage.ghl_stage_id, discoveryResult),
    }))
  }, [proposal.stages, discoveryResult])

  // Edge nova devolve outcome explícito; edge antiga (pré-deploy) não devolve —
  // nesse caso, proposta vazia para campo único é tratada como fora do vocabulário.
  const effectiveOutcome = proposal.outcome ?? (isEmpty ? 'not_in_vocabulary' : 'mapped')

  // Campo único sem mapeamento aceito: mostrar o destino real do campo (escape
  // automático, docs/CONTRATO-WEBHOOK-CRM.md e docs/GHL-CAMPOS-EXTRAS.md) em vez
  // da explanation da IA, que descreveria um mapeamento que o servidor recusou.
  if (fieldName && effectiveOutcome !== 'mapped') {
    return (
      <EscapeStateCard
        fieldName={fieldName}
        fieldSource={fieldSource}
        onBack={onBack}
        onOpenAdvanced={onOpenAdvanced}
        isLoading={isLoading}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-empire-primary" />
            {fieldName ? `Sugestão para “${fieldName}”` : 'Proposta da IA'}
          </CardTitle>
          <CardDescription>
            {fieldName
              ? 'Revise esta sugestão antes de salvar. Ela afeta somente este campo.'
              : 'Revise o que a IA sugeriu. Você pode voltar e ajustar sua descrição antes de salvar.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {proposal.explanation && (
            <div className="rounded-xl border border-empire-border bg-empire-surface p-4 text-sm text-empire-void">
              {proposal.explanation}
            </div>
          )}

          {hasWarnings && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-400">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-medium">Atenção</p>
                  <ul className="mt-1 list-inside list-disc text-amber-400/80">
                    {proposal.warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {isEmpty && (
            <div className="rounded-xl border border-empire-border bg-empire-surface p-4 text-sm text-empire-subtle">
              A IA não encontrou mapeamentos claros. Tente descrever com mais detalhes ou use o modo
              avançado.
            </div>
          )}

          {!fieldName && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <MetricCard icon={Database} label="Campos" value={proposal.fields.length} />
              <MetricCard icon={Layers} label="Pipelines" value={proposal.pipelines.length} />
              <MetricCard icon={MapPin} label="Stages" value={proposal.stages.length} />
            </div>
          )}
        </CardContent>
      </Card>

      {groupedFields.length > 0 && (
        <ProposalGroupCard
          icon={Database}
          title="Campos mapeados"
          description="Campos customizados do GHL associados a conceitos da OMNX"
        >
          {groupedFields.map((field) => (
            <ProposalRow
              key={field.ghl_field_key}
              left={field.ghlName}
              right={field.logical_name}
              confidence={field.confidence}
            />
          ))}
        </ProposalGroupCard>
      )}

      {groupedPipelines.length > 0 && (
        <ProposalGroupCard
          icon={Layers}
          title="Pipelines classificados"
          description="Pipelines do GHL classificados por categoria da OMNX"
        >
          {groupedPipelines.map((pipeline) => (
            <ProposalRow
              key={pipeline.ghl_pipeline_id}
              left={pipeline.ghlName}
              right={getPipelineCategoryLabel(pipeline.system_category)}
              confidence={pipeline.confidence}
            />
          ))}
        </ProposalGroupCard>
      )}

      {groupedStages.length > 0 && (
        <ProposalGroupCard
          icon={MapPin}
          title="Stages classificados"
          description="Estágios do GHL classificados em estágios canônicos da OMNX"
        >
          {groupedStages.map((stage) => (
            <ProposalRow
              key={stage.ghl_stage_id}
              left={stage.ghlName}
              right={getSystemStageLabel(stage.system_stage)}
              confidence={stage.confidence}
            />
          ))}
        </ProposalGroupCard>
      )}

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={isLoading}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button type="button" onClick={onSave} disabled={isLoading || isEmpty}>
          {isLoading ? (
            'Salvando...'
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              {fieldName ? 'Salvar esta classificação' : 'Salvar mapeamentos'}
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

function EscapeStateCard({
  fieldName,
  fieldSource,
  onBack,
  onOpenAdvanced,
  isLoading,
}: {
  fieldName: string
  fieldSource?: 'contact' | 'opportunity'
  onBack: () => void
  onOpenAdvanced?: () => void
  isLoading?: boolean
}) {
  const isOpportunity = fieldSource === 'opportunity'

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            “{fieldName}” não precisa de mapeamento
          </CardTitle>
          <CardDescription>
            Este campo não faz parte dos campos padrão que alimentam métricas e funis — e não precisa ser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isOpportunity ? (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
              <p className="font-medium text-emerald-500">Nada a fazer — ele já é guardado sozinho</p>
              <p className="mt-1 text-empire-muted">
                Todo campo de oportunidade fora do padrão é capturado automaticamente junto aos dados
                da oportunidade e aparece de forma passiva no cartão do lead. Ele nunca entra em
                métricas, funis ou cálculos.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-empire-border bg-empire-surface p-4 text-sm">
              <p className="font-medium text-empire-void">Quer vê-lo no cartão do lead?</p>
              <p className="mt-1 text-empire-muted">
                Campos de contato fora do padrão podem ser guardados como extras pelo mapeamento guiado —
                aparecem de forma passiva no cartão do lead, nunca em métricas.
              </p>
            </div>
          )}
          <p className="text-xs text-empire-subtle">
            Se um dia este campo precisar virar métrica, isso é uma decisão de produto: ele precisa
            entrar no vocabulário padrão da OMNX — a IA nunca cria categorias novas por conta própria.
          </p>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <Button type="button" variant="outline" onClick={onBack} disabled={isLoading}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        {onOpenAdvanced && (
          <Button type="button" variant="ghost" onClick={onOpenAdvanced} disabled={isLoading}>
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            Abrir mapeamento guiado
          </Button>
        )}
      </div>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: number
}) {
  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-empire-subtle" />
        <span className="text-xs text-empire-muted">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-empire-void">{value}</p>
    </div>
  )
}

function ProposalGroupCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4 text-empire-primary" />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  )
}

function ProposalRow({
  left,
  right,
  confidence,
}: {
  left: string
  right: string
  confidence: number
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between',
        confidence >= 0.8
          ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
          : confidence >= 0.6
            ? 'border-amber-500/20 bg-amber-500/[0.03]'
            : 'border-empire-border bg-empire-surface',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-empire-void">{left}</p>
      </div>
      <div className="flex items-center gap-2 sm:shrink-0">
        <CheckCircle2 className="h-4 w-4 text-empire-subtle" />
        <span className="text-sm font-semibold text-empire-void">{right}</span>
        <ConfidenceBadge confidence={confidence} />
      </div>
    </div>
  )
}
