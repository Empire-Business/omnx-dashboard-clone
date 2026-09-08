import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { GoalEditorDialog } from '@/components/goals/GoalEditorDialog'
import { GoalPerformanceCard } from '@/components/goals/GoalPerformanceCard'
import { useGoalsModule } from '@/hooks/useGoalsModule'
import {
  GOAL_APP_OPTIONS,
  GOAL_AREA_META,
  GOAL_STATUS_META,
  formatGoalValue,
} from '@/lib/goals/catalog'
import type {
  GoalAppSlug,
  GoalAreaKey,
  GoalEditorInput,
  GoalPerformanceResult,
  GoalRecord,
  GoalStatus,
} from '@/lib/goals/types'
import { fmtDate, fmtDateTime } from '@/lib/utils/dates'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import {
  CalendarRange,
  ChartNoAxesColumn,
  Clock3,
  History,
  Layers3,
  Plus,
  Radar,
  Sparkles,
  X,
} from 'lucide-react'

const TABS = [
  { key: 'overview', label: 'Visão Geral', icon: Sparkles },
  { key: 'tracking', label: 'Acompanhamento', icon: Radar },
  { key: 'registry', label: 'Metas', icon: Layers3 },
  { key: 'history', label: 'Histórico', icon: History },
] as const

type GoalsTabKey = (typeof TABS)[number]['key']

const DEFAULT_TAB: GoalsTabKey = 'overview'

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="mb-4 h-px w-10 bg-empire-primary" />
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-empire-subtle">{label}</p>
          <p className="mt-3 font-display text-[2.25rem] font-semibold leading-none text-empire-void">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-empire-elevated text-empire-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 text-xs text-empire-subtle">{hint}</p>
    </div>
  )
}

function AreaPulseCard({
  areaKey,
  records,
  performances,
}: {
  areaKey: GoalAreaKey
  records: GoalRecord[]
  performances: Map<string, GoalPerformanceResult>
}) {
  const meta = GOAL_AREA_META[areaKey]
  const scopedRecords = records.filter((record) => record.metric.area_key === areaKey)
  const statusCounts = scopedRecords.reduce<Record<GoalStatus, number>>(
    (acc, record) => {
      const version = record.preferredVersion
      const status = version ? performances.get(version.id)?.status ?? 'no_data' : 'no_data'
      acc[status] += 1
      return acc
    },
    {
      scheduled: 0,
      on_track: 0,
      at_risk: 0,
      off_track: 0,
      completed: 0,
      no_data: 0,
    }
  )

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface p-6">
      <div className="mb-4 h-px w-10 bg-empire-primary" />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-empire-primary">
            {meta.eyebrow}
          </p>
          <h3 className="mt-2 font-display text-[1.9rem] font-semibold text-empire-void">
            {meta.label}
          </h3>
          <p className="mt-2 max-w-xs text-sm text-empire-subtle">{meta.description}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-empire-subtle">Metas</p>
          <p className="mt-1 text-3xl font-semibold text-empire-void">{scopedRecords.length}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {(['on_track', 'at_risk', 'off_track'] as GoalStatus[]).map((status) => (
          <div
            key={status}
            className={cn(
              'rounded-md px-4 py-3 text-sm',
              GOAL_STATUS_META[status].className
            )}
          >
            <p className="text-[10px] uppercase tracking-[0.14em] opacity-70">
              {GOAL_STATUS_META[status].label}
            </p>
            <p className="mt-1 text-2xl font-semibold">{statusCounts[status]}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function RegistryTable({
  records,
  performances,
  onEditVersion,
  onCloneVersion,
}: {
  records: GoalRecord[]
  performances: Map<string, GoalPerformanceResult>
  onEditVersion: (record: GoalRecord) => void
  onCloneVersion: (record: GoalRecord) => void
}) {
  if (!records.length) {
    return (
      <div className="rounded-xl border border-dashed border-empire-border bg-empire-surface px-6 py-10 text-center text-sm text-empire-subtle">
        Nenhuma meta cadastrada para o filtro atual.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-empire-border bg-empire-surface">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="sticky top-0 bg-empire-elevated">
          <tr>
            {['Área', 'Indicador', 'Escopo', 'App', 'Vigência', 'Meta', 'Atual', 'Status', 'Ações'].map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-empire-subtle"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const version = record.preferredVersion
            const performance = version ? performances.get(version.id) : null
            if (!version) return null

            return (
              <tr key={record.definition.id} className="border-t border-empire-border">
                <td className="px-4 py-4 font-medium text-empire-void">
                  {GOAL_AREA_META[record.metric.area_key].label}
                </td>
                <td className="px-4 py-4">
                  <div className="font-medium text-empire-void">{record.metric.metric_name}</div>
                  <div className="mt-1 text-xs text-empire-subtle">{record.metric.analysis_mode}</div>
                </td>
                <td className="px-4 py-4 text-empire-void">{record.definition.scope_label}</td>
                <td className="px-4 py-4 text-empire-void">
                  {GOAL_APP_OPTIONS.find((option) => option.value === record.definition.app_slug)?.label ?? '—'}
                </td>
                <td className="px-4 py-4 font-mono text-empire-subtle">
                  {fmtDate(version.period_start)} a {fmtDate(version.period_end)}
                </td>
                <td className="px-4 py-4 font-mono font-medium text-empire-void">
                  {formatGoalValue(version.target_value, record.metric.unit)}
                </td>
                <td className="px-4 py-4 font-mono text-empire-void">
                  {formatGoalValue(performance?.actualValue, record.metric.unit)}
                </td>
                <td className="px-4 py-4">
                  <span
                    className={cn(
                      'rounded-sm px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                      GOAL_STATUS_META[performance?.status ?? 'no_data'].className
                    )}
                  >
                    {GOAL_STATUS_META[performance?.status ?? 'no_data'].label}
                  </span>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onEditVersion(record)}
                      className="rounded-sm border border-empire-border px-3 py-1.5 text-xs font-medium text-empire-void transition-colors hover:bg-empire-elevated"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onCloneVersion(record)}
                      className="rounded-sm border border-empire-primary/25 px-3 py-1.5 text-xs font-medium text-empire-primary transition-colors hover:bg-empire-primary/10"
                    >
                      Nova versão
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HistoryTable({
  records,
  performances,
}: {
  records: GoalRecord[]
  performances: Map<string, GoalPerformanceResult>
}) {
  const historyRows = records.flatMap((record) =>
    record.versions.map((version) => {
      const latestSnapshot = record.snapshots.find((snapshot) => snapshot.goal_version_id === version.id)
      const isPreferred = record.preferredVersion?.id === version.id

      return {
        record,
        version,
        latestSnapshot,
        performance: isPreferred ? performances.get(version.id) : null,
      }
    })
  )

  if (!historyRows.length) {
    return (
      <div className="rounded-xl border border-dashed border-empire-border bg-empire-surface px-6 py-10 text-center text-sm text-empire-subtle">
        Ainda não há histórico de versões para exibir.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-empire-border bg-empire-surface">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="sticky top-0 bg-empire-elevated">
          <tr>
            {['Indicador', 'Escopo', 'App', 'Vigência', 'Alvo', 'Snapshot', 'Status', 'Atualizado'].map((column) => (
              <th
                key={column}
                className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-empire-subtle"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {historyRows
            .sort((a, b) => b.version.period_start.localeCompare(a.version.period_start))
            .map(({ record, version, latestSnapshot, performance }) => {
              const status = performance?.status ?? latestSnapshot?.status ?? 'no_data'
              return (
                <tr key={version.id} className="border-t border-empire-border">
                  <td className="px-4 py-4">
                    <div className="font-medium text-empire-void">{record.metric.metric_name}</div>
                    <div className="mt-1 text-xs text-empire-subtle">{GOAL_AREA_META[record.metric.area_key].label}</div>
                  </td>
                  <td className="px-4 py-4 text-empire-void">{record.definition.scope_label}</td>
                  <td className="px-4 py-4 text-empire-void">
                    {GOAL_APP_OPTIONS.find((option) => option.value === record.definition.app_slug)?.label ?? '—'}
                  </td>
                  <td className="px-4 py-4 font-mono text-empire-subtle">
                    {fmtDate(version.period_start)} a {fmtDate(version.period_end)}
                  </td>
                  <td className="px-4 py-4 font-mono font-medium text-empire-void">
                    {formatGoalValue(version.target_value, record.metric.unit)}
                  </td>
                  <td className="px-4 py-4 font-mono text-empire-subtle">
                    {latestSnapshot
                      ? `${fmtDate(latestSnapshot.snapshot_date)} · ${formatGoalValue(latestSnapshot.actual_value, record.metric.unit)}`
                      : 'Sem snapshot gravado'}
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={cn(
                        'rounded-sm px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
                        GOAL_STATUS_META[status].className
                      )}
                    >
                      {GOAL_STATUS_META[status].label}
                    </span>
                  </td>
                  <td className="px-4 py-4 font-mono text-empire-subtle">{fmtDateTime(version.updated_at)}</td>
                </tr>
              )
            })}
        </tbody>
      </table>
    </div>
  )
}

export function GoalsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab: GoalsTabKey = TABS.some((tab) => tab.key === rawTab) ? (rawTab as GoalsTabKey) : DEFAULT_TAB
  const [areaFilter, setAreaFilter] = useState<'all' | GoalAreaKey>('all')
  const [modeFilter, setModeFilter] = useState<'all' | 'cohort' | 'produtividade'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | GoalStatus>('all')
  const [appFilter, setAppFilter] = useState<'all' | GoalAppSlug>('all')
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorSeed, setEditorSeed] = useState<(Partial<GoalEditorInput> & { areaKey?: GoalAreaKey }) | undefined>()

  const {
    definitions,
    records,
    performances,
    scopeOptions,
    loading,
    performanceLoading,
    saving,
    error,
    saveGoal,
  } = useGoalsModule()

  const setTab = (tab: GoalsTabKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      if (areaFilter !== 'all' && record.metric.area_key !== areaFilter) return false
      if (modeFilter !== 'all' && record.metric.analysis_mode !== modeFilter) return false
      if (appFilter !== 'all' && record.definition.app_slug !== appFilter) return false

      const version = record.preferredVersion
      const status = version ? performances.get(version.id)?.status ?? 'no_data' : 'no_data'
      if (statusFilter !== 'all' && status !== statusFilter) return false

      return true
    })
  }, [areaFilter, appFilter, modeFilter, performances, records, statusFilter])

  const currentRecords = filteredRecords.filter((record) => record.preferredVersion)

  const summary = useMemo(() => {
    const relevantStatuses = currentRecords
      .map((record) => {
        const version = record.preferredVersion
        return version ? performances.get(version.id)?.status ?? 'no_data' : 'no_data'
      })

    return {
      total: currentRecords.length,
      onTrack: relevantStatuses.filter((status) => status === 'on_track' || status === 'completed').length,
      risk: relevantStatuses.filter((status) => status === 'at_risk' || status === 'off_track').length,
      areas: new Set(currentRecords.map((record) => record.metric.area_key)).size,
      history: filteredRecords.reduce((sum, record) => sum + record.versions.length, 0),
    }
  }, [currentRecords, filteredRecords, performances])

  const handleOpenCreate = () => {
    setEditorSeed(undefined)
    setEditorOpen(true)
  }

  const handleEditVersion = (record: GoalRecord) => {
    const version = record.preferredVersion
    if (!version) return

    setEditorSeed({
      areaKey: record.metric.area_key,
      goalDefinitionId: record.definition.id,
      versionId: version.id,
      metricDefinitionId: record.metric.id,
      scopeType: record.definition.scope_type,
      scopeId: record.definition.scope_id,
      scopeLabel: record.definition.scope_label,
      targetValue: version.target_value,
      periodStart: version.period_start,
      periodEnd: version.period_end,
      notes: version.notes ?? record.definition.notes ?? undefined,
      appSlug: record.definition.app_slug,
    })
    setEditorOpen(true)
  }

  const handleCloneVersion = (record: GoalRecord) => {
    const version = record.preferredVersion
    if (!version) return

    setEditorSeed({
      areaKey: record.metric.area_key,
      goalDefinitionId: record.definition.id,
      metricDefinitionId: record.metric.id,
      scopeType: record.definition.scope_type,
      scopeId: record.definition.scope_id,
      scopeLabel: record.definition.scope_label,
      targetValue: version.target_value,
      periodStart: version.period_start,
      periodEnd: version.period_end,
      notes: version.notes ?? record.definition.notes ?? undefined,
      appSlug: record.definition.app_slug,
    })
    setEditorOpen(true)
  }

  const handleSave = async (input: GoalEditorInput) => {
    await saveGoal(input)
  }

  const hasFilters = areaFilter !== 'all' || modeFilter !== 'all' || statusFilter !== 'all' || appFilter !== 'all'

  return (
    <PageShell
      title="Metas"
      description="Cadastro central, acompanhamento e histórico de metas de cohort e produtividade."
      actions={
        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 self-start rounded-md bg-empire-primary px-4 py-2 text-sm font-medium text-empire-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-empire-primary-hover hover:shadow-md active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" />
          Nova Meta
        </button>
      }
      tabs={
        <PageTabs
          variant="underline"
          tabs={TABS.map((t) => ({
            label: t.label,
            value: t.key,
            icon: t.icon,
            active: activeTab === t.key,
            onClick: () => setTab(t.key),
          }))}
        />
      }
    >
      <div className="space-y-6">
        <div className="rounded-xl border border-empire-primary/20 bg-empire-primary/[0.06] px-4 py-3 text-sm text-empire-primary">
          Os cálculos deste módulo sempre usam a vigência salva em cada meta. Filtros visuais dos outros painéis não alteram o acompanhamento aqui.
        </div>

        <div className="space-y-3 rounded-xl border border-empire-border bg-empire-elevated p-4">
          {hasFilters && (
            <div className="flex">
              <button
                onClick={() => { setAreaFilter('all'); setModeFilter('all'); setStatusFilter('all'); setAppFilter('all') }}
                className="flex items-center gap-1 rounded-md border border-empire-border px-2 py-1.5 text-xs font-medium text-empire-subtle transition-all hover:bg-empire-danger-soft hover:text-empire-danger"
              >
                <X className="h-3 w-3" />
                Limpar filtros
              </button>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">Área</span>
              <select
                value={areaFilter}
                onChange={(event) => setAreaFilter(event.target.value as 'all' | GoalAreaKey)}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-surface px-3 text-sm text-empire-void focus:border-empire-primary focus:outline-none"
              >
                <option value="all">Todas as áreas</option>
                {(Object.keys(GOAL_AREA_META) as GoalAreaKey[]).map((areaKey) => (
                  <option key={areaKey} value={areaKey}>
                    {GOAL_AREA_META[areaKey].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">Modo</span>
              <select
                value={modeFilter}
                onChange={(event) => setModeFilter(event.target.value as 'all' | 'cohort' | 'produtividade')}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-surface px-3 text-sm text-empire-void focus:border-empire-primary focus:outline-none"
              >
                <option value="all">Cohort + produtividade</option>
                <option value="cohort">Cohort</option>
                <option value="produtividade">Produtividade</option>
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as 'all' | GoalStatus)}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-surface px-3 text-sm text-empire-void focus:border-empire-primary focus:outline-none"
              >
                <option value="all">Todos os status</option>
                {Object.entries(GOAL_STATUS_META).map(([status, meta]) => (
                  <option key={status} value={status}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.12em] text-empire-subtle">App</span>
              <select
                value={appFilter ?? 'all'}
                onChange={(event) => setAppFilter((event.target.value as GoalAppSlug) || 'all')}
                className="h-10 w-full rounded-lg border border-empire-border bg-empire-surface px-3 text-sm text-empire-void focus:border-empire-primary focus:outline-none"
              >
                <option value="all">Todos os apps</option>
                {GOAL_APP_OPTIONS.filter((option) => option.value !== null).map((option) => (
                  <option key={option.value} value={option.value!}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-empire-danger/20 bg-empire-danger-soft px-4 py-3 text-sm text-empire-danger">
            {error}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <div className="grid gap-4 xl:grid-cols-3">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <SummaryCard
                    label="Metas ativas"
                    value={String(summary.total)}
                    hint="Metas preferenciais considerando vigência atual, futura próxima ou passada mais recente."
                    icon={ChartNoAxesColumn}
                  />
                  <SummaryCard
                    label="Em dia"
                    value={String(summary.onTrack)}
                    hint="Metas em status saudável ou já concluídas."
                    icon={Sparkles}
                  />
                  <SummaryCard
                    label="Em risco"
                    value={String(summary.risk)}
                    hint="Metas atrasadas, projetando abaixo ou fora da faixa esperada."
                    icon={Clock3}
                  />
                  <SummaryCard
                    label="Histórico"
                    value={String(summary.history)}
                    hint="Versões salvas no módulo, preservando mudanças de alvo e vigência."
                    icon={CalendarRange}
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  {(Object.keys(GOAL_AREA_META) as GoalAreaKey[]).map((areaKey) => (
                    <AreaPulseCard
                      key={areaKey}
                      areaKey={areaKey}
                      records={filteredRecords}
                      performances={performances}
                    />
                  ))}
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.4fr,1fr]">
                  <div className="rounded-xl border border-empire-border bg-empire-surface p-6">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-empire-primary">Registro de Indicadores</p>
                    <h2 className="mt-2 font-display text-[1.8rem] font-semibold text-empire-void">
                      Catálogo pronto para novas frentes
                    </h2>
                    <p className="mt-3 max-w-2xl text-sm text-empire-subtle">
                      A V1 já opera Tráfego, Pré-Vendas e Vendas usando o mesmo contrato: indicador, escopo, vigência,
                      histórico e status. Novos painéis entram adicionando indicadores, não recriando o módulo.
                    </p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {definitions.map((metric) => (
                        <div
                          key={metric.id}
                          className="rounded-lg border border-empire-border bg-empire-elevated px-4 py-3"
                        >
                          <p className="text-xs font-semibold text-empire-void">{metric.metric_name}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-empire-subtle">
                            {GOAL_AREA_META[metric.area_key].label} · {metric.analysis_mode}
                          </p>
                          <p className="mt-2 text-xs text-empire-subtle">{metric.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-empire-border bg-empire-surface p-6">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-empire-primary">Fonte de Verdade</p>
                    <h2 className="mt-2 font-display text-[1.6rem] font-semibold text-empire-void">
                      Módulo independente dos dashboards
                    </h2>
                    <div className="mt-5 space-y-4 text-sm text-empire-subtle">
                      <div className="rounded-lg border border-empire-border bg-empire-elevated px-4 py-3">
                        Cada meta guarda sua própria vigência. Não existe reescalonamento via filtro de tela.
                      </div>
                      <div className="rounded-lg border border-empire-border bg-empire-elevated px-4 py-3">
                        O histórico preserva versões e snapshots do acompanhamento conforme o módulo é usado.
                      </div>
                      <div className="rounded-lg border border-empire-border bg-empire-elevated px-4 py-3">
                        Tráfego e Pré-Vendas podem continuar mostrando cards locais, mas o cálculo oficial sai daqui.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tracking' && (
              <div className="space-y-5">
                {performanceLoading && (
                  <div className="rounded-lg border border-empire-border bg-empire-elevated px-4 py-3 text-sm text-empire-subtle">
                    Atualizando performance das metas...
                  </div>
                )}
                {!currentRecords.length ? (
                  <div className="rounded-xl border border-dashed border-empire-border bg-empire-surface px-6 py-10 text-center text-sm text-empire-subtle">
                    Nenhuma meta encontrada para o filtro atual.
                  </div>
                ) : (
                  currentRecords.map((record) => {
                    const version = record.preferredVersion
                    if (!version) return null
                    return (
                      <GoalPerformanceCard
                        key={record.definition.id}
                        metric={record.metric}
                        definition={record.definition}
                        version={version}
                        performance={performances.get(version.id)}
                        onEdit={() => handleEditVersion(record)}
                      />
                    )
                  })
                )}
              </div>
            )}

            {activeTab === 'registry' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-[2rem] font-semibold text-empire-void">Cadastro e governança</h2>
                    <p className="mt-1 text-sm text-empire-subtle">
                      Gerencie metas vigentes, crie novas versões e distribua targets por área, pessoa ou canal.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleOpenCreate}
                    className="inline-flex items-center gap-2 rounded-md bg-empire-primary px-4 py-2 text-sm font-medium text-empire-primary-foreground transition-all hover:-translate-y-0.5 hover:bg-empire-primary-hover hover:shadow-md active:scale-[0.98]"
                  >
                    <Plus className="h-4 w-4" />
                    Nova Meta
                  </button>
                </div>
                <RegistryTable
                  records={currentRecords}
                  performances={performances}
                  onEditVersion={handleEditVersion}
                  onCloneVersion={handleCloneVersion}
                />
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-5">
                <div>
                  <h2 className="font-display text-[2rem] font-semibold text-empire-void">Histórico e trilha</h2>
                  <p className="mt-1 text-sm text-empire-subtle">
                    Cada mudança de alvo vira uma nova versão. Snapshots gravados pelo módulo preservam a leitura do acompanhamento ao longo do tempo.
                  </p>
                </div>
                <HistoryTable records={filteredRecords} performances={performances} />
              </div>
            )}
          </>
        )}

        <GoalEditorDialog
          open={editorOpen}
          definitions={definitions}
          scopeOptions={scopeOptions}
          initialValue={editorSeed}
          onClose={() => {
            if (saving) return
            setEditorOpen(false)
            setEditorSeed(undefined)
          }}
          onSave={handleSave}
        />
      </div>
    </PageShell>
  )
}
