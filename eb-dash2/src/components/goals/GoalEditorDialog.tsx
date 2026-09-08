import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { GOAL_APP_OPTIONS, GOAL_AREA_META, GOAL_SCOPE_LABELS } from '@/lib/goals/catalog'
import type {
  GoalAppSlug,
  GoalAreaKey,
  GoalEditorInput,
  GoalMetricDefinition,
  GoalScopeOption,
  GoalScopeOptionsMap,
  GoalScopeType,
} from '@/lib/goals/types'
import { DatePicker } from '@/components/ui/date-picker'

interface Props {
  open: boolean
  definitions: GoalMetricDefinition[]
  scopeOptions: GoalScopeOptionsMap
  initialValue?: Partial<GoalEditorInput> & { areaKey?: GoalAreaKey }
  onClose: () => void
  onSave: (input: GoalEditorInput) => Promise<void>
}

function getScopeOptionsForMetric(
  metric: GoalMetricDefinition | null,
  scopeType: GoalScopeType,
  scopeOptions: GoalScopeOptionsMap
): GoalScopeOption[] {
  if (!metric) return scopeOptions.workspace

  if (scopeType === 'workspace') return scopeOptions.workspace
  if (scopeType === 'channel') {
    return metric.area_key === 'organico' ? scopeOptions.organicChannel : scopeOptions.channel
  }
  if (scopeType === 'campaign') return scopeOptions.campaign
  if (scopeType === 'user') {
    return metric.area_key === 'vendas' ? scopeOptions.closerUsers : scopeOptions.sdrUsers
  }

  return scopeOptions.workspace
}

export function GoalEditorDialog({
  open,
  definitions,
  scopeOptions,
  initialValue,
  onClose,
  onSave,
}: Props) {
  const availableAreas = useMemo(
    () =>
      [...new Set(definitions.map((definition) => definition.area_key))].sort() as GoalAreaKey[],
    [definitions]
  )

  const lockedIdentity = Boolean(initialValue?.goalDefinitionId || initialValue?.versionId)

  const [areaKey, setAreaKey] = useState<GoalAreaKey>(initialValue?.areaKey ?? availableAreas[0] ?? 'trafego')
  const [metricDefinitionId, setMetricDefinitionId] = useState(initialValue?.metricDefinitionId ?? '')
  const [scopeType, setScopeType] = useState<GoalScopeType>(initialValue?.scopeType ?? 'workspace')
  const [scopeId, setScopeId] = useState(initialValue?.scopeId ?? 'global')
  const [scopeLabel, setScopeLabel] = useState(initialValue?.scopeLabel ?? 'Global')
  const [targetValue, setTargetValue] = useState(
    initialValue?.targetValue != null ? String(initialValue.targetValue) : ''
  )
  const [periodStart, setPeriodStart] = useState(initialValue?.periodStart ?? '')
  const [periodEnd, setPeriodEnd] = useState(initialValue?.periodEnd ?? '')
  const [notes, setNotes] = useState(initialValue?.notes ?? '')
  const [appSlug, setAppSlug] = useState<GoalAppSlug>(initialValue?.appSlug ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const metricsByArea = useMemo(
    () => definitions.filter((definition) => definition.area_key === areaKey),
    [areaKey, definitions]
  )

  const selectedMetric = useMemo(
    () => definitions.find((definition) => definition.id === metricDefinitionId) ?? null,
    [definitions, metricDefinitionId]
  )

  const scopedOptions = useMemo(
    () => getScopeOptionsForMetric(selectedMetric, scopeType, scopeOptions),
    [scopeOptions, scopeType, selectedMetric]
  )

  useEffect(() => {
    if (!open) return

    const nextArea = initialValue?.areaKey ?? availableAreas[0] ?? 'trafego'
    const areaMetrics = definitions.filter((definition) => definition.area_key === nextArea)
    const fallbackMetric = initialValue?.metricDefinitionId ?? areaMetrics[0]?.id ?? ''
    const metric = definitions.find((definition) => definition.id === fallbackMetric) ?? areaMetrics[0] ?? null
    const nextScopeType = initialValue?.scopeType ?? metric?.supported_scope_types[0] ?? 'workspace'
    const options = getScopeOptionsForMetric(metric, nextScopeType, scopeOptions)
    const fallbackScope = initialValue?.scopeId ?? options[0]?.value ?? 'global'
    const chosenScope = options.find((option) => option.value === fallbackScope) ?? options[0]

    setAreaKey(nextArea)
    setMetricDefinitionId(fallbackMetric)
    setScopeType(nextScopeType)
    setScopeId(chosenScope?.value ?? 'global')
    setScopeLabel(initialValue?.scopeLabel ?? chosenScope?.label ?? 'Global')
    setTargetValue(initialValue?.targetValue != null ? String(initialValue.targetValue) : '')
    setPeriodStart(initialValue?.periodStart ?? '')
    setPeriodEnd(initialValue?.periodEnd ?? '')
    setNotes(initialValue?.notes ?? '')
    setAppSlug(initialValue?.appSlug ?? null)
    setError(null)
    setSaving(false)
  }, [open, initialValue, definitions, availableAreas, scopeOptions])

  useEffect(() => {
    if (!open || lockedIdentity) return
    const firstMetric = metricsByArea[0]
    if (firstMetric && !metricsByArea.some((definition) => definition.id === metricDefinitionId)) {
      setMetricDefinitionId(firstMetric.id)
    }
  }, [areaKey, lockedIdentity, metricDefinitionId, metricsByArea, open])

  useEffect(() => {
    if (!open || lockedIdentity || !selectedMetric) return

    const allowedScopeTypes = selectedMetric.supported_scope_types
    if (!allowedScopeTypes.includes(scopeType)) {
      setScopeType(allowedScopeTypes[0] ?? 'workspace')
    }
  }, [lockedIdentity, open, scopeType, selectedMetric])

  useEffect(() => {
    if (!open || !selectedMetric) return

    const options = getScopeOptionsForMetric(selectedMetric, scopeType, scopeOptions)
    const selectedOption = options.find((option) => option.value === scopeId) ?? options[0]
    if (!selectedOption) return

    setScopeId(selectedOption.value)
    setScopeLabel(selectedOption.label)
  }, [open, scopeId, scopeOptions, scopeType, selectedMetric])

  const handleSubmit = async () => {
    const parsedTarget = parseFloat(targetValue.replace(',', '.'))

    if (!metricDefinitionId) {
      setError('Selecione um indicador.')
      return
    }
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setError('Informe um alvo maior que zero.')
      return
    }
    if (!periodStart || !periodEnd) {
      setError('Preencha o período da meta.')
      return
    }
    if (periodStart > periodEnd) {
      setError('A data inicial não pode ser maior que a data final.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      await onSave({
        goalDefinitionId: initialValue?.goalDefinitionId,
        versionId: initialValue?.versionId,
        metricDefinitionId,
        scopeType,
        scopeId,
        scopeLabel,
        targetValue: parsedTarget,
        periodStart,
        periodEnd,
        notes: notes.trim() || undefined,
        appSlug,
      })

      toast.success('Meta salva.')
      onClose()
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? 'Não foi possível salvar a meta.'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => !saving && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader onClose={() => !saving && onClose()}>
          <div className="space-y-1">
            <p className="section-label mb-0">
              {lockedIdentity ? 'Editar Meta' : 'Nova Meta'}
            </p>
            <DialogTitle>
              {lockedIdentity ? 'Ajustar versão da meta' : 'Cadastrar meta no módulo unificado'}
            </DialogTitle>
            <DialogDescription>
              Defina indicador, escopo, alvo e vigência sem depender do filtro visual dos painéis.
            </DialogDescription>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">
                Área
              </span>
              <select
                value={areaKey}
                onChange={(event) => setAreaKey(event.target.value as GoalAreaKey)}
                disabled={lockedIdentity}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-elevated px-3 text-sm text-empire-void focus:outline-none focus:border-empire-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {availableAreas.map((area) => (
                  <option key={area} value={area}>
                    {GOAL_AREA_META[area].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">
                Indicador
              </span>
              <select
                value={metricDefinitionId}
                onChange={(event) => setMetricDefinitionId(event.target.value)}
                disabled={lockedIdentity}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-elevated px-3 text-sm text-empire-void focus:outline-none focus:border-empire-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {metricsByArea.map((metric) => (
                  <option key={metric.id} value={metric.id}>
                    {metric.metric_name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="rounded-lg border border-empire-border bg-empire-elevated px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-empire-primary">
              {GOAL_AREA_META[areaKey]?.label ?? 'Área'}
            </p>
            <div className="mt-3 min-w-0 flex-1">
              <p className="text-sm font-semibold text-empire-void">
                {selectedMetric?.metric_name ?? 'Indicador'}
              </p>
              <p className="mt-1 text-xs text-empire-subtle">
                {selectedMetric?.description ?? 'Selecione um indicador para ver a descrição.'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[160px,1fr,180px]">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">
                Escopo
              </span>
              <select
                value={scopeType}
                onChange={(event) => setScopeType(event.target.value as GoalScopeType)}
                disabled={lockedIdentity || !selectedMetric}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-elevated px-3 text-sm text-empire-void focus:outline-none focus:border-empire-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {(selectedMetric?.supported_scope_types ?? ['workspace']).map((supportedScopeType) => (
                  <option key={supportedScopeType} value={supportedScopeType}>
                    {GOAL_SCOPE_LABELS[supportedScopeType]}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">
                {GOAL_SCOPE_LABELS[scopeType]}
              </span>
              <select
                value={scopeId}
                onChange={(event) => {
                  const option = scopedOptions.find((item) => item.value === event.target.value)
                  setScopeId(event.target.value)
                  setScopeLabel(option?.label ?? event.target.value)
                }}
                disabled={lockedIdentity}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-elevated px-3 text-sm text-empire-void focus:outline-none focus:border-empire-primary disabled:cursor-not-allowed disabled:opacity-70"
              >
                {scopedOptions.map((option) => (
                  <option key={`${option.type}:${option.value}`} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">
                App vinculado
              </span>
              <select
                value={appSlug ?? ''}
                onChange={(event) => setAppSlug((event.target.value as GoalAppSlug) || null)}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-elevated px-3 text-sm text-empire-void focus:outline-none focus:border-empire-primary"
              >
                {GOAL_APP_OPTIONS.map((option) => (
                  <option key={option.value ?? '__all'} value={option.value ?? ''}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr,180px,180px]">
            <label className="space-y-1.5 md:col-span-1">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">
                Alvo
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={targetValue}
                onChange={(event) => setTargetValue(event.target.value)}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-elevated px-3 text-sm text-empire-void focus:outline-none focus:border-empire-primary"
              />
            </label>

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">
                Data Inicial
              </span>
              <DatePicker
                value={periodStart}
                max={periodEnd || undefined}
                onChange={(v) => setPeriodStart(v)}
                aria-label="Data inicial"
                fullWidth
                className="h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">
                Data Final
              </span>
              <DatePicker
                value={periodEnd}
                min={periodStart || undefined}
                onChange={(v) => setPeriodEnd(v)}
                aria-label="Data final"
                fullWidth
                className="h-10 text-sm"
              />
            </div>
          </div>

          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">
              Notas
            </span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              className="w-full rounded-lg border border-empire-border bg-empire-elevated px-3 py-2 text-sm text-empire-void focus:outline-none focus:border-empire-primary"
              placeholder="Ex.: meta pactuada com o time comercial para o mês de abril."
            />
          </label>

          {error && (
            <div className="rounded-lg border border-empire-danger/25 bg-empire-danger/6 px-3 py-2 text-sm text-empire-danger">
              {error}
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-[var(--radius-sm)] border border-empire-border px-4 py-2 text-sm text-empire-subtle transition-colors hover:bg-empire-elevated disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="rounded-[var(--radius-sm)] border border-empire-primary bg-empire-primary px-4 py-2 text-sm font-medium text-[var(--empire-canvas)] transition-all hover:-translate-y-0.5 hover:bg-[var(--empire-void)] hover:shadow-md disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Salvar Meta'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
