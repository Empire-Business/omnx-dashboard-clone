import { useMemo, useState } from 'react'
import { Layers, MapPin, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { inferPipelineCategory, inferSystemStage, getPipelineCategoryLabel, getSystemStageLabel } from '@/lib/ghl-mapping'
import type {
  GhlDiscoveryResult,
  GhlPipelineMapping,
  GhlStageMapping,
  GhlPipelineCategory,
  GhlSystemStage,
} from '@/types/ghl-config'
import { GHL_PIPELINE_CATEGORIES, GHL_SYSTEM_STAGES } from '@/types/ghl-config'

interface PipelineStageStepProps {
  discoveryResult: GhlDiscoveryResult
  existingPipelines: GhlPipelineMapping[]
  existingStages: GhlStageMapping[]
  pipelineValues: Map<string, GhlPipelineCategory | null>
  stageValues: Map<string, GhlSystemStage | null>
  onPipelineChange: (pipelineId: string, category: GhlPipelineCategory | null) => void
  onStageChange: (stageId: string, stage: GhlSystemStage | null) => void
}

export function PipelineStageStep({
  discoveryResult,
  pipelineValues,
  stageValues,
  onPipelineChange,
  onStageChange,
}: PipelineStageStepProps) {
  const pipelines = discoveryResult.pipelines
  const [search, setSearch] = useState('')

  // Busca por nome de pipeline ou de stage — essencial com dezenas de
  // pipelines e mais de cem stages na tela.
  const visiblePipelines = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return pipelines.map((p) => ({ pipeline: p, stages: p.stages }))
    return pipelines
      .map((p) => {
        const pipelineMatches = p.name.toLowerCase().includes(term)
        const stages = pipelineMatches
          ? p.stages
          : p.stages.filter((s) => s.name.toLowerCase().includes(term))
        return { pipeline: p, stages, pipelineMatches }
      })
      .filter(({ stages, pipelineMatches }) => pipelineMatches || stages.length > 0)
      .map(({ pipeline, stages }) => ({ pipeline, stages }))
  }, [pipelines, search])

  const mappedPipelinesCount = useMemo(
    () => Array.from(pipelineValues.values()).filter(Boolean).length,
    [pipelineValues],
  )
  const totalStages = useMemo(() => pipelines.flatMap((p) => p.stages).length, [pipelines])
  const mappedStagesCount = useMemo(
    () => Array.from(stageValues.values()).filter(Boolean).length,
    [stageValues],
  )

  return (
    <div className="space-y-6">
      <Input
        placeholder="Buscar pipeline ou stage pelo nome..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="sm:max-w-sm"
      />
      <Card className="overflow-visible">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Layers className="h-4 w-4 text-empire-primary" />
                Pipelines
              </CardTitle>
              <CardDescription className="mt-1">
                Classifique cada pipeline do GHL em uma categoria da OMNX.
              </CardDescription>
            </div>
            <Badge variant={mappedPipelinesCount === pipelines.length ? 'success' : 'secondary'}>
              {mappedPipelinesCount}/{pipelines.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {visiblePipelines.length === 0 && (
            <p className="text-sm text-empire-muted">Nenhum pipeline encontrado com a busca atual.</p>
          )}
          {visiblePipelines.map(({ pipeline }) => {
            const selected = pipelineValues.get(pipeline.id) ?? ''
            const match = inferPipelineCategory(pipeline.name).category
            const isMapped = !!selected

            return (
              <div
                key={pipeline.id}
                className={cn(
                  'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
                  isMapped
                    ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
                    : match
                      ? 'border-empire-primary/20 bg-empire-primary/[0.03]'
                      : 'border-empire-border bg-empire-surface'
                )}
              >
                <div>
                  <p className="text-sm font-semibold text-empire-void">{pipeline.name}</p>
                  <details className="mt-1 text-xs text-empire-muted">
                    <summary className="cursor-pointer select-none">Ver código técnico</summary>
                    <code className="mt-1 inline-block rounded bg-empire-elevated px-1 py-0.5">{pipeline.id}</code>
                  </details>
                </div>
                <div className="flex items-center gap-2 sm:min-w-[280px]">
                  <Select
                    value={selected}
                    onValueChange={(v) => onPipelineChange(pipeline.id, (v as GhlPipelineCategory) || null)}
                  >
                    <SelectItem value="">Não mapeado</SelectItem>
                    {GHL_PIPELINE_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </Select>
                  {match && !isMapped && (
                    <ButtonSuggest
                      label={getPipelineCategoryLabel(match)}
                      onClick={() => onPipelineChange(pipeline.id, match)}
                    />
                  )}
                  {isMapped && (
                    <Badge variant="success">
                      <CheckCircle2 className="mr-1 h-3 w-3" />
                      OK
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="overflow-visible">
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="h-4 w-4 text-empire-primary" />
                Stages
              </CardTitle>
              <CardDescription className="mt-1">
                Classifique cada stage (coluna) em um estágio canônico da OMNX.
              </CardDescription>
            </div>
            <Badge variant={mappedStagesCount === totalStages ? 'success' : 'secondary'}>
              {mappedStagesCount}/{totalStages}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {visiblePipelines.map(({ pipeline, stages }) => (
            <div key={pipeline.id} className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-empire-subtle">
                  {pipeline.name}
                </p>
                {stages.length > 0 && (
                  <BulkStageSelect
                    onApply={(stage) => {
                      for (const s of stages) onStageChange(s.id, stage)
                    }}
                  />
                )}
              </div>
              {stages.map((stage) => {
                const selected = stageValues.get(stage.id) ?? ''
                const match = inferSystemStage(stage.name).stage
                const isMapped = !!selected

                return (
                  <div
                    key={stage.id}
                    className={cn(
                      'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
                      isMapped
                        ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
                        : match
                          ? 'border-empire-primary/20 bg-empire-primary/[0.03]'
                          : 'border-empire-border bg-empire-surface'
                    )}
                  >
                    <div>
                      <p className="text-sm font-semibold text-empire-void">{stage.name}</p>
                      <details className="mt-1 text-xs text-empire-muted">
                        <summary className="cursor-pointer select-none">Ver código técnico</summary>
                        <code className="mt-1 inline-block rounded bg-empire-elevated px-1 py-0.5">{stage.id}</code>
                      </details>
                    </div>
                    <div className="flex items-center gap-2 sm:min-w-[280px]">
                      <Select
                        value={selected}
                        onValueChange={(v) => onStageChange(stage.id, (v as GhlSystemStage) || null)}
                      >
                        <SelectItem value="">Não mapeado</SelectItem>
                        {GHL_SYSTEM_STAGES.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </Select>
                      {match && !isMapped && (
                        <ButtonSuggest
                          label={getSystemStageLabel(match)}
                          onClick={() => onStageChange(stage.id, match)}
                        />
                      )}
                      {isMapped && (
                        <Badge variant="success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          OK
                        </Badge>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function ButtonSuggest({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
        'border-empire-primary/20 bg-empire-primary/10 text-empire-primary hover:bg-empire-primary/20'
      )}
    >
      Sugerir: {label}
    </button>
  )
}

// Ação em massa: aplica o mesmo estágio canônico a todos os stages do
// pipeline — evita dezenas de dropdowns manuais em pipelines grandes.
// O placeholder carrega o rótulo da ação: com value '' o trigger do Select
// mostra o placeholder, então sem ele o controle aparecia como "Selecione..."
// e ninguém descobria para que servia.
function BulkStageSelect({ onApply }: { onApply: (stage: GhlSystemStage) => void }) {
  return (
    <Select
      className="sm:w-72"
      value=""
      placeholder="Classificar todos os stages como…"
      onValueChange={(v) => {
        if (v) onApply(v as GhlSystemStage)
      }}
    >
      {GHL_SYSTEM_STAGES.map((s) => (
        <SelectItem key={s.value} value={s.value}>
          {s.label}
        </SelectItem>
      ))}
    </Select>
  )
}
