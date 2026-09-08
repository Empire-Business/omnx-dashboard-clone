import { useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, ChevronLeft, Save, CheckCircle2, Sparkles, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  useSaveGhlFieldMappings,
  useSaveGhlPipelineMappings,
  useSaveGhlStageMappings,
} from '@/hooks/useGhlMappings'
import {
  type GhlDiscoveryResult,
  type GhlFieldMapping,
  type GhlFieldMappingTemplate,
  type GhlPipelineMapping,
  type GhlStageMapping,
  type GhlPipelineCategory,
  type GhlSystemStage,
} from '@/types/ghl-config'
import {
  flattenDiscoveryFields,
  inferLogicalName,
  inferPipelineCategory,
  inferSystemStage,
  computeMappingStatus,
  computeMappingChanges,
  groupFieldMappingsByLogicalName,
} from '@/lib/ghl-mapping'
import { extractErrorMessage } from '@/lib/errors'
import { RequiredFieldsStep } from './RequiredFieldsStep'
import { SuggestedFieldsStep } from './SuggestedFieldsStep'
import { PipelineStageStep } from './PipelineStageStep'
import { MappingReviewStep } from './MappingReviewStep'

interface GhlMappingWizardProps {
  discoveryResult: GhlDiscoveryResult
  existingFields: GhlFieldMapping[]
  existingPipelines: GhlPipelineMapping[]
  existingStages: GhlStageMapping[]
  templates: GhlFieldMappingTemplate[]
  onClose?: () => void
}

type WizardStep = 'required' | 'suggestions' | 'pipelines' | 'review'

const STEP_ORDER: WizardStep[] = ['required', 'suggestions', 'pipelines', 'review']

const STEP_LABELS: Record<WizardStep, { title: string; description: string }> = {
  required: {
    title: 'Campos obrigatórios',
    description: 'Confirme os campos essenciais da OMNX que foram encontrados no GHL.',
  },
  suggestions: {
    title: 'Sugestões automáticas',
    description: 'Revise os matches automáticos de campos opcionais.',
  },
  pipelines: {
    title: 'Pipelines e stages',
    description: 'Classifique pipelines e stages do GHL nos conceitos da OMNX.',
  },
  review: {
    title: 'Revisão',
    description: 'Valide tudo antes de salvar.',
  },
}

export function GhlMappingWizard({
  discoveryResult,
  existingFields,
  existingPipelines,
  existingStages,
  templates,
  onClose,
}: GhlMappingWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>('required')
  const [saveSummary, setSaveSummary] = useState<{ systemFields: number; ghlFields: number; pipelines: number; stages: number } | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const saveFields = useSaveGhlFieldMappings()
  const savePipelines = useSaveGhlPipelineMappings()
  const saveStages = useSaveGhlStageMappings()

  const discoveredFields = useMemo(() => flattenDiscoveryFields(discoveryResult), [discoveryResult])
  const status = useMemo(
    () => computeMappingStatus(discoveryResult, existingFields, existingPipelines, existingStages, templates),
    [discoveryResult, existingFields, existingPipelines, existingStages, templates],
  )

  const changes = useMemo(
    () => computeMappingChanges(discoveryResult, existingFields, existingPipelines, existingStages),
    [discoveryResult, existingFields, existingPipelines, existingStages],
  )

  // Field values: builtKey -> logicalName
  // Só pré-preenchemos matches de ALTA confiança (e o que já estava salvo ou
  // consta no template). Sugestões de média/baixa confiança ficam pendentes de
  // revisão no passo de sugestões — nunca entram como "Mapeado" automaticamente.
  const [fieldValues, setFieldValues] = useState<Map<string, string | null>>(() => {
    const next = new Map<string, string | null>()
    for (const field of discoveredFields) {
      const existing = existingFields.find((m) => m.ghl_field_key === field.builtKey)
      const templateMatch = templates.find((t) => t.ghl_field_key === field.builtKey)
      const match = inferLogicalName(field.name, field.field_type)
      const trustedInference = match.confidence === 'high' ? match.logical_name : null
      next.set(field.builtKey, existing?.logical_name ?? templateMatch?.logical_name ?? trustedInference ?? '')
    }
    return next
  })

  // Pipeline values: pipelineId -> category
  const [pipelineValues, setPipelineValues] = useState<Map<string, GhlPipelineCategory | null>>(() => {
    const next = new Map<string, GhlPipelineCategory | null>()
    for (const p of discoveryResult.pipelines) {
      const existing = existingPipelines.find((m) => m.ghl_pipeline_id === p.id)
      next.set(p.id, existing?.system_category ?? inferPipelineCategory(p.name).category)
    }
    return next
  })

  // Stage values: stageId -> systemStage
  const [stageValues, setStageValues] = useState<Map<string, GhlSystemStage | null>>(() => {
    const next = new Map<string, GhlSystemStage | null>()
    for (const p of discoveryResult.pipelines) {
      for (const s of p.stages) {
        const existing = existingStages.find((m) => m.ghl_stage_id === s.id)
        next.set(s.id, existing?.system_stage ?? inferSystemStage(s.name).stage)
      }
    }
    return next
  })

  const handleFieldChange = useCallback((builtKey: string, logicalName: string | null) => {
    setFieldValues((prev) => {
      const next = new Map(prev)
      next.set(builtKey, logicalName)
      return next
    })
  }, [])

  const handlePipelineChange = useCallback((pipelineId: string, category: GhlPipelineCategory | null) => {
    setPipelineValues((prev) => {
      const next = new Map(prev)
      next.set(pipelineId, category)
      return next
    })
  }, [])

  const handleStageChange = useCallback((stageId: string, stage: GhlSystemStage | null) => {
    setStageValues((prev) => {
      const next = new Map(prev)
      next.set(stageId, stage)
      return next
    })
  }, [])

  const handleSave = async () => {
    setSaveError(null)

    // UMA row por logical_name, com `variations` = todos os campos do GHL
    // mapeados para ele. Sem este agrupamento o upsert falha: o Postgres
    // rejeita lotes com logical_name repetido no onConflict.
    const fieldRows = groupFieldMappingsByLogicalName(
      discoveredFields.flatMap((field) => {
        const logicalName = fieldValues.get(field.builtKey)
        if (!logicalName) return []
        return [{
          logical_name: logicalName,
          ghl_field_key: field.builtKey,
          ghl_field_id: field.id,
          field_type: field.source === 'opportunity' ? 'opportunity_field' : 'contact_field',
          variations: [field.builtKey],
        }]
      }),
    )

    const pipelineRows = discoveryResult.pipelines
      .map((p) => {
        const category = pipelineValues.get(p.id)
        if (!category) return null
        return {
          ghl_pipeline_id: p.id,
          ghl_pipeline_name: p.name,
          system_category: category,
        }
      })
      .filter((r): r is { ghl_pipeline_id: string; ghl_pipeline_name: string; system_category: GhlPipelineCategory } => r !== null)

    const stageRows = discoveryResult.pipelines
      .flatMap((p) =>
        p.stages.map((s) => {
          const systemStage = stageValues.get(s.id)
          if (!systemStage) return null
          return {
            ghl_pipeline_id: p.id,
            ghl_stage_id: s.id,
            ghl_stage_name: s.name,
            system_stage: systemStage,
          }
        }),
      )
      .filter((r): r is { ghl_pipeline_id: string; ghl_stage_id: string; ghl_stage_name: string; system_stage: GhlSystemStage } => r !== null)

    const [fieldsResult, pipelinesResult, stagesResult] = await Promise.allSettled([
      saveFields.mutateAsync({ mappings: fieldRows }),
      savePipelines.mutateAsync({ mappings: pipelineRows }),
      saveStages.mutateAsync({ mappings: stageRows }),
    ])

    const failures = [fieldsResult, pipelinesResult, stagesResult].filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    )

    if (failures.length === 0) {
      const ghlFieldsCount = fieldRows.reduce((acc, r) => acc + (r.variations?.length ?? 0), 0)
      setSaveSummary({
        systemFields: fieldRows.length,
        ghlFields: ghlFieldsCount,
        pipelines: pipelineRows.length,
        stages: stageRows.length,
      })
      return
    }

    const savedParts: string[] = []
    if (pipelinesResult.status === 'fulfilled') savedParts.push('pipelines')
    if (stagesResult.status === 'fulfilled') savedParts.push('stages')
    const reason = extractErrorMessage(failures[0].reason, 'motivo não informado pelo servidor')

    const fieldsFailed = fieldsResult.status === 'rejected'
    const intro = savedParts.length > 0
      ? `${savedParts.join(' e ').replace(/^./, (c) => c.toUpperCase())} foram salvos, mas ${fieldsFailed ? 'os campos' : 'parte do mapeamento'} não.`
      : 'Nada foi salvo.'
    setSaveError(`${intro} Motivo: ${reason}. Corrija e clique em "Salvar mapeamentos" novamente.`)
  }

  const currentIndex = STEP_ORDER.indexOf(currentStep)
  const canGoBack = currentIndex > 0

  const goNext = () => {
    const nextIndex = currentIndex + 1
    if (nextIndex < STEP_ORDER.length) setCurrentStep(STEP_ORDER[nextIndex])
  }

  const goBack = () => {
    const prevIndex = currentIndex - 1
    if (prevIndex >= 0) setCurrentStep(STEP_ORDER[prevIndex])
  }

  const handleClose = () => {
    if (onClose) {
      onClose()
      return
    }
    setSaveSummary(null)
    setCurrentStep('required')
  }

  if (saveSummary) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
          <p className="mt-4 text-base font-semibold text-emerald-600">Mapeamento salvo com sucesso</p>
          <p className="mt-2 text-sm text-empire-subtle">
            {saveSummary.ghlFields} campos do GHL ligados a {saveSummary.systemFields} campos do sistema
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Badge variant="secondary">{saveSummary.pipelines} pipelines</Badge>
            <Badge variant="secondary">{saveSummary.stages} stages</Badge>
          </div>
          <p className="mt-3 max-w-md text-sm text-empire-subtle">
            Pronto — a partir de agora os novos leads já chegam classificados nos painéis.
            Se criar campos novos no GHL, volte aqui e rode a busca de campos de novo.
          </p>
          <Button type="button" onClick={handleClose} className="mt-6">
            Concluir
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Progress header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-empire-primary" />
                Assistente de mapeamento GHL
              </CardTitle>
              <CardDescription className="mt-1">
                {STEP_LABELS[currentStep].description}
              </CardDescription>
            </div>
            <Badge variant={status.isComplete ? 'success' : 'secondary'}>
              {status.isComplete ? 'Completo' : 'Incompleto'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            {STEP_ORDER.map((step, idx) => (
              <div key={step} className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentStep(step)}
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    step === currentStep
                      ? 'bg-empire-primary text-empire-void'
                      : idx < currentIndex
                        ? 'bg-emerald-500/10 text-emerald-600'
                        : 'bg-empire-elevated text-empire-subtle'
                  )}
                >
                  {idx < currentIndex ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
                </button>
                <span
                  className={cn(
                    'text-xs font-medium hidden sm:inline',
                    step === currentStep ? 'text-empire-void' : 'text-empire-subtle'
                  )}
                >
                  {STEP_LABELS[step].title}
                </span>
                {idx < STEP_ORDER.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-empire-subtle" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {changes.hasChanges && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-400 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div className="space-y-2">
            <p className="font-medium">Mudanças detectadas desde o último mapeamento</p>
            <ul className="text-amber-400/80 list-disc list-inside">
              {changes.newFields.length > 0 && (
                <li>{changes.newFields.length} campo(s) novo(s) no GHL</li>
              )}
              {changes.removedFields.length > 0 && (
                <li>{changes.removedFields.length} campo(s) mapeado(s) não encontrado(s) no GHL</li>
              )}
              {changes.newPipelines.length > 0 && (
                <li>{changes.newPipelines.length} pipeline(s) novo(s)</li>
              )}
              {changes.removedPipelines.length > 0 && (
                <li>{changes.removedPipelines.length} pipeline(s) removido(s)</li>
              )}
              {changes.newStages.length > 0 && (
                <li>{changes.newStages.length} stage(s) novo(s)</li>
              )}
              {changes.removedStages.length > 0 && (
                <li>{changes.removedStages.length} stage(s) removido(s)</li>
              )}
            </ul>
            <div className="flex flex-wrap gap-2 pt-1">
              {(changes.newFields.length > 0 || changes.removedFields.length > 0) && (
                <Button type="button" size="sm" variant="outline" onClick={() => setCurrentStep('suggestions')}>
                  Revisar campos que mudaram
                </Button>
              )}
              {(changes.newPipelines.length > 0 || changes.removedPipelines.length > 0 ||
                changes.newStages.length > 0 || changes.removedStages.length > 0) && (
                <Button type="button" size="sm" variant="outline" onClick={() => setCurrentStep('pipelines')}>
                  Revisar pipelines e stages
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Step content */}
      {currentStep === 'required' && (
        <RequiredFieldsStep
          discoveryResult={discoveryResult}
          templates={templates}
          fieldValues={fieldValues}
          onFieldChange={handleFieldChange}
        />
      )}

      {currentStep === 'suggestions' && (
        <SuggestedFieldsStep
          discoveryResult={discoveryResult}
          existingFields={existingFields}
          templates={templates}
          fieldValues={fieldValues}
          onFieldChange={handleFieldChange}
        />
      )}

      {currentStep === 'pipelines' && (
        <PipelineStageStep
          discoveryResult={discoveryResult}
          existingPipelines={existingPipelines}
          existingStages={existingStages}
          pipelineValues={pipelineValues}
          stageValues={stageValues}
          onPipelineChange={handlePipelineChange}
          onStageChange={handleStageChange}
        />
      )}

      {currentStep === 'review' && (
        <MappingReviewStep
          discoveryResult={discoveryResult}
          fieldValues={fieldValues}
          pipelineValues={pipelineValues}
          stageValues={stageValues}
          status={status}
        />
      )}

      {/* Navigation */}
      {saveError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>{saveError}</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={goBack} disabled={!canGoBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>

        {currentStep === 'review' ? (
          <Button
            onClick={handleSave}
            disabled={
              saveFields.isPending || savePipelines.isPending || saveStages.isPending
            }
          >
            <Save className="mr-2 h-4 w-4" />
            {saveFields.isPending || savePipelines.isPending || saveStages.isPending
              ? 'Salvando...'
              : 'Salvar mapeamentos'}
          </Button>
        ) : (
          <Button onClick={goNext}>
            Avançar
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
