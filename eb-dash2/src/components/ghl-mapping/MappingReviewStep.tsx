import { AlertCircle, CheckCircle2, Database, Layers, MapPin } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { flattenDiscoveryFields, getPipelineCategoryLabel, getSystemStageLabel, getLogicalFieldLabel } from '@/lib/ghl-mapping'
import type {
  GhlDiscoveryResult,
  GhlDiscoveryPipeline,
  GhlDiscoveryStage,
  GhlPipelineCategory,
  GhlSystemStage,
} from '@/types/ghl-config'
import type { MappingStatus } from '@/lib/ghl-mapping'

interface MappingReviewStepProps {
  discoveryResult: GhlDiscoveryResult
  fieldValues: Map<string, string | null>
  pipelineValues: Map<string, GhlPipelineCategory | null>
  stageValues: Map<string, GhlSystemStage | null>
  status: MappingStatus
}

export function MappingReviewStep({
  discoveryResult,
  fieldValues,
  pipelineValues,
  stageValues,
  status,
}: MappingReviewStepProps) {
  const discovered = flattenDiscoveryFields(discoveryResult)
  const mappedFields = Array.from(fieldValues.entries())
    .filter(([, v]) => v)
    .map(([builtKey, logicalName]) => {
      const field = discovered.find((f) => f.builtKey === builtKey)
      return { field, builtKey, logicalName: logicalName as string }
    })

  // Agrupa por logical_name — espelha o formato do save (uma row por
  // logical_name, com todos os campos do GHL como variações).
  const groups = new Map<string, string[]>()
  for (const { field, builtKey, logicalName } of mappedFields) {
    const names = groups.get(logicalName) ?? []
    names.push(field?.name ?? builtKey)
    groups.set(logicalName, names)
  }
  const groupedFields = Array.from(groups.entries())
    .map(([logicalName, fieldNames]) => ({ logicalName, fieldNames }))
    .sort((a, b) => getLogicalFieldLabel(a.logicalName).localeCompare(getLogicalFieldLabel(b.logicalName)))

  const mappedPipelines: Array<{ pipeline: GhlDiscoveryPipeline; category: GhlPipelineCategory }> = discoveryResult.pipelines
    .map((p) => ({ pipeline: p, category: pipelineValues.get(p.id) }))
    .filter((r): r is { pipeline: GhlDiscoveryPipeline; category: GhlPipelineCategory } => !!r.category)

  const mappedStages: Array<{ pipeline: GhlDiscoveryPipeline; stage: GhlDiscoveryStage; systemStage: GhlSystemStage }> = discoveryResult.pipelines
    .flatMap((p) => p.stages.map((s) => ({ pipeline: p, stage: s, systemStage: stageValues.get(s.id) })))
    .filter((r): r is { pipeline: GhlDiscoveryPipeline; stage: GhlDiscoveryStage; systemStage: GhlSystemStage } => !!r.systemStage)

  const warnings: string[] = []
  if (status.unmappedTemplateFields.length > 0) {
    warnings.push(`${status.unmappedTemplateFields.length} campo(s) do template ainda não estão mapeados.`)
  }
  if (status.pipelinesCount > 0 && status.mappedPipelinesCount < status.pipelinesCount) {
    warnings.push('Alguns pipelines não foram classificados.')
  }
  if (status.stagesCount > 0 && status.mappedStagesCount < status.stagesCount) {
    warnings.push('Alguns stages não foram classificados.')
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-empire-primary" />
            Resumo do mapeamento
          </CardTitle>
          <CardDescription>
            Revise o que será salvo. Você pode voltar aos passos anteriores para ajustar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              icon={Database}
              label="Campos do GHL mapeados"
              value={mappedFields.length}
              total={status.totalDiscoveredFields}
            />
            <MetricCard
              icon={Layers}
              label="Pipelines classificados"
              value={status.mappedPipelinesCount}
              total={status.pipelinesCount}
            />
            <MetricCard
              icon={MapPin}
              label="Stages classificados"
              value={status.mappedStagesCount}
              total={status.stagesCount}
            />
          </div>

          {warnings.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.03] p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-sm font-semibold text-empire-void">Atenção</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-empire-muted">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {status.isComplete && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.03] p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
                <div>
                  <p className="text-sm font-semibold text-empire-void">Mapeamento completo</p>
                  <p className="text-sm text-empire-muted">
                    Todos os campos obrigatórios, pipelines e stages estão mapeados.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos que serão salvos</CardTitle>
          <CardDescription>
            Cada item da OMNX pode receber dados de vários campos do GHL ao mesmo tempo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {groupedFields.length === 0 ? (
            <p className="text-sm text-empire-muted">Nenhum campo será salvo.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto space-y-2 rounded-lg border border-empire-border p-3">
              {groupedFields.map(({ logicalName, fieldNames }) => (
                <div key={logicalName} className="flex items-start justify-between gap-3 py-1 text-sm">
                  <span className="font-medium text-empire-void">{getLogicalFieldLabel(logicalName)}</span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {fieldNames.map((name) => (
                      <Badge key={name} variant="secondary">{name}</Badge>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pipelines e stages que serão salvos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {mappedPipelines.length === 0 ? (
            <p className="text-sm text-empire-muted">Nenhum pipeline classificado.</p>
          ) : (
            <div className="space-y-1">
              {mappedPipelines.map(({ pipeline, category }) => (
                <div key={pipeline.id} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-empire-muted">{pipeline.name}</span>
                  <Badge variant="secondary">{getPipelineCategoryLabel(category)}</Badge>
                </div>
              ))}
            </div>
          )}

          {mappedStages.length > 0 && (
            <div className="space-y-1">
              {mappedStages.map(({ pipeline, stage, systemStage }) => (
                <div key={stage.id} className="flex items-center justify-between py-1 text-sm">
                  <span className="text-empire-muted">
                    {pipeline.name} → {stage.name}
                  </span>
                  <Badge variant="secondary">{getSystemStageLabel(systemStage)}</Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  total,
}: {
  icon: React.ElementType
  label: string
  value: number
  total: number
}) {
  const complete = total > 0 && value === total
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        complete ? 'border-emerald-500/20 bg-emerald-500/[0.03]' : 'border-empire-border bg-empire-surface'
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('h-4 w-4', complete ? 'text-emerald-500' : 'text-empire-subtle')} />
        <span className="text-xs text-empire-muted">{label}</span>
      </div>
      <p className={cn('mt-2 text-2xl font-bold', complete ? 'text-emerald-500' : 'text-empire-void')}>
        {value}/{total}
      </p>
    </div>
  )
}
