import { PIPELINE_RECUPERACAO_ID } from '@/lib/constants'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import {
  spToday,
  toSPISOEnd,
  toSPISOStart,
  tsToSPDate,
} from '@/lib/utils/dates'
import {
  computeCostMqlIdealDia,
  computeCostPerMqlSeries,
  computeIdealDia,
  computeMetaKpis,
  isMqlByTag,
  countUniqueMqls,
  filterUniqueMqls,
  loadTrafegoDataset,
} from '@/hooks/useTrafego'
import { emptyFilter } from '@/types/filters'
import type { RevenueRow } from '@/hooks/usePreVendas'
import {
  LEGACY_GOAL_TYPE_MAP,
  sortMetricDefinitions,
} from './catalog'
import type {
  GoalAppSlug,
  GoalDefinition,
  GoalEditorInput,
  GoalMetricDefinition,
  GoalPerformanceResult,
  GoalRecord,
  GoalScopeOption,
  GoalScopeOptionsMap,
  GoalScopeType,
  GoalSeriesPoint,
  GoalSnapshot,
  GoalStatus,
  GoalVersion,
} from './types'

interface PrevendasAgendamentoRow {
  id: string
  data_agendamento_reuniao: string | null
  pipeline_id: string | null
  sdr_name: string | null
}

interface ResponseTimeRow {
  sdr_name: string
  avg_response_seconds: number
  response_count: number
}

interface VendaFechadaRow {
  id: string
  vendedor_closer: string | null
  data_fechado: string | null
}

interface VendasConversionRow {
  opp_id: string
  vendedor_closer: string | null
}

interface VendasConversionDataset {
  reunioes: VendasConversionRow[]
  paidOppIds: Set<string>
}

interface OrganicoOppRow {
  id: string
  data_lead_recebido: string | null
  contatos: {
    utm_source: string | null
    tags: string | null
  } | null
}

interface EvaluationCaches {
  traffic: Map<string, Promise<Awaited<ReturnType<typeof loadTrafegoDataset>>>>
  prevendasAgendamentos: Map<string, Promise<PrevendasAgendamentoRow[]>>
  prevendasResponse: Map<string, Promise<ResponseTimeRow[]>>
  vendasClosed: Map<
    string,
    Promise<{ opps: VendaFechadaRow[]; revenueRows: RevenueRow[] }>
  >
  vendasConversion: Map<string, Promise<VendasConversionDataset>>
  organico: Map<string, Promise<{ opps: OrganicoOppRow[]; organicSourceSet: Set<string> }>>
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}


function buildDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  const cursor = new Date(start)

  while (cursor <= end) {
    dates.push(cursor.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }))
    cursor.setDate(cursor.getDate() + 1)
  }

  return dates
}

function buildCumulativeSeries(
  startDate: string,
  endDate: string,
  valueByDate: Map<string, number>,
  targetValue: number
): GoalSeriesPoint[] {
  const dates = buildDateRange(startDate, endDate)
  const periodDays = Math.max(dates.length, 1)
  let cumulativeActual = 0

  return dates.map((date, index) => {
    const actual = valueByDate.get(date) ?? 0
    cumulativeActual += actual
    return {
      date,
      actual,
      cumulativeActual,
      ideal: targetValue * ((index + 1) / periodDays),
      target: targetValue,
    }
  })
}

function roundNumber(value: number | null | undefined, decimals = 2) {
  if (value == null || Number.isNaN(value)) return null
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function resolveSnapshotStatus(
  startDate: string,
  endDate: string,
  today: string,
  actualValue: number | null,
  targetValue: number,
  direction: GoalMetricDefinition['target_direction']
): GoalStatus {
  if (today < startDate) return 'scheduled'
  if (actualValue == null) return 'no_data'

  const isOnTarget =
    direction === 'maximize' ? actualValue >= targetValue : actualValue <= targetValue

  if (today > endDate) return isOnTarget ? 'completed' : 'off_track'
  if (isOnTarget) return 'on_track'

  const tolerance = targetValue * 0.1
  if (direction === 'maximize') {
    return actualValue >= targetValue - tolerance ? 'at_risk' : 'off_track'
  }
  return actualValue <= targetValue + tolerance ? 'at_risk' : 'off_track'
}

function resolveCumulativeStatus(
  startDate: string,
  endDate: string,
  today: string,
  actualValue: number | null,
  targetValue: number,
  idealValue: number | null,
  projectionValue: number | null
): GoalStatus {
  if (today < startDate) return 'scheduled'
  if (actualValue == null) return 'no_data'
  if (today > endDate) return actualValue >= targetValue ? 'completed' : 'off_track'
  if (idealValue == null) return 'no_data'
  if (actualValue >= idealValue) return 'on_track'
  if (projectionValue != null && projectionValue >= targetValue) return 'at_risk'
  return 'off_track'
}

function resolveBudgetStatus(
  startDate: string,
  endDate: string,
  today: string,
  actualCost: number | null,
  targetCost: number,
  maxBudget: number | null,
  spendProjection: number | null,
  idealBudgetAcumulado: number | null,
  atualSpend: number,
  hasPair: boolean
): GoalStatus {
  if (today < startDate) return 'scheduled'
  if (actualCost == null) return 'no_data'

  const onTarget = actualCost <= targetCost
  if (!hasPair) {
    if (today > endDate) return onTarget ? 'completed' : 'off_track'
    return onTarget ? 'on_track' : 'off_track'
  }

  if (today > endDate) {
    return maxBudget != null && atualSpend <= maxBudget ? 'completed' : onTarget ? 'completed' : 'off_track'
  }

  if (idealBudgetAcumulado != null && atualSpend <= idealBudgetAcumulado) return 'on_track'
  if (maxBudget != null && spendProjection != null && spendProjection <= maxBudget) return 'at_risk'
  return 'off_track'
}

function computeProgressPct(
  actualValue: number | null,
  targetValue: number,
  direction: GoalMetricDefinition['target_direction']
) {
  if (actualValue == null || targetValue <= 0) return null
  if (direction === 'maximize') {
    return roundNumber((actualValue / targetValue) * 100, 1)
  }
  if (actualValue <= 0) return 100
  return roundNumber((targetValue / actualValue) * 100, 1)
}

function getProjectionValue(actualValue: number, daysElapsed: number, periodDays: number) {
  if (daysElapsed <= 0) return null
  return roundNumber((actualValue / daysElapsed) * periodDays, 2)
}

function normalizeScopeId(scopeType: GoalScopeType, scopeId: string) {
  const trimmed = scopeId.trim()
  if (!trimmed) return scopeType === 'workspace' ? 'global' : ''
  return scopeType === 'workspace' ? 'global' : trimmed
}

function normalizeScopeLabel(scopeType: GoalScopeType, scopeLabel: string, scopeId: string) {
  if (scopeType === 'workspace') return 'Global'
  return scopeLabel.trim() || scopeId.trim()
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

async function loadPaginatedRows<T>(
  loader: (page: number, pageSize: number) => Promise<T[]>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = []
  let page = 0

  while (true) {
    const chunk = await loader(page, pageSize)
    rows.push(...chunk)
    if (chunk.length < pageSize) break
    page += 1
  }

  return rows
}

async function loadPrevendasAgendamentosDataset(startDate: string, endDate: string) {
  const wid = await getWorkspaceId()
  if (!wid) throw new Error('Conta não encontrada')
  return loadPaginatedRows<PrevendasAgendamentoRow>(async (page, pageSize) => {
    const { data, error } = await supabase
      .from('oportunidades')
      .select(`
        id,
        pipeline_id,
        data_agendamento_reuniao,
        sdr_name
      `)
      .eq('workspace_id', wid)
      .gte('data_agendamento_reuniao', startDate)
      .lte('data_agendamento_reuniao', endDate)
      .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
      .order('data_agendamento_reuniao', { ascending: true })
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) throw error
    return ((data ?? []) as unknown) as PrevendasAgendamentoRow[]
  })
}

async function loadPrevendasResponseDataset(startDate: string, endDate: string) {
  const { data, error } = await supabase.rpc('get_sdr_avg_response_time', {
    p_start: toSPISOStart(startDate),
    p_end: toSPISOEnd(endDate),
  })

  if (error) throw error
  return ((data ?? []) as ResponseTimeRow[]).map((row) => ({
    sdr_name: row.sdr_name,
    avg_response_seconds: Number(row.avg_response_seconds ?? 0),
    response_count: Number(row.response_count ?? 0),
  }))
}

async function loadVendasClosedDataset(startDate: string, endDate: string) {
  const wid = await getWorkspaceId()
  if (!wid) throw new Error('Conta não encontrada')
  const opps = await loadPaginatedRows<VendaFechadaRow>(async (page, pageSize) => {
    const { data, error } = await supabase
      .from('oportunidades')
      .select('id, vendedor_closer, data_fechado')
      .eq('workspace_id', wid)
      .gte('data_fechado', startDate)
      .lte('data_fechado', endDate)
      .order('data_fechado', { ascending: true })
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) throw error
    return (data ?? []) as VendaFechadaRow[]
  })

  const revenueRows: RevenueRow[] = []
  const oppIds = opps.map((opp) => opp.id)

  for (const idsChunk of chunkArray(oppIds, 250)) {
    if (!idsChunk.length) continue
    const { data, error } = await supabase
      .from('vendas_fechamento')
      .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada')
      .in('oportunidade_id', idsChunk)

    if (error) throw error
    revenueRows.push(...((data ?? []) as RevenueRow[]))
  }

  return { opps, revenueRows }
}

async function loadVendasConversionDataset(startDate: string, endDate: string): Promise<VendasConversionDataset> {
  const wid = await getWorkspaceId()
  if (!wid) throw new Error('Conta não encontrada')

  const startISO = toSPISOStart(startDate)
  const endISO = toSPISOEnd(endDate)

  const reunioes = await loadPaginatedRows<VendasConversionRow>(async (page, pageSize) => {
    const { data, error } = await supabase
      .from('oportunidades')
      .select('id, vendedor_closer')
      .eq('workspace_id', wid)
      .gte('data_realizacao_vendas', startDate)
      .lte('data_realizacao_vendas', endDate)
      .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
      .order('data_realizacao_vendas', { ascending: true })
      .order('id', { ascending: true })
      .range(page * pageSize, (page + 1) * pageSize - 1)

    if (error) throw error
    return ((data ?? []) as { id: string; vendedor_closer: string | null }[])
      .map((row) => ({ opp_id: row.id, vendedor_closer: row.vendedor_closer }))
  })

  const { data: paymentData, error: paymentError } = await supabase
    .from('vendas_fechamento')
    .select('oportunidade_id')
    .eq('workspace_id', wid)
    .gte('data_pagamento_entrada', startISO)
    .lte('data_pagamento_entrada', endISO)

  if (paymentError) throw paymentError

  const paidOppIds = new Set(
    ((paymentData ?? []) as { oportunidade_id: string | null }[])
      .map((r) => r.oportunidade_id)
      .filter((id): id is string => Boolean(id))
  )

  return { reunioes, paidOppIds }
}

async function getVendasConversionDataset(
  cache: EvaluationCaches,
  startDate: string,
  endDate: string
) {
  const key = `${startDate}::${endDate}`
  if (!cache.vendasConversion.has(key)) {
    cache.vendasConversion.set(key, loadVendasConversionDataset(startDate, endDate))
  }
  return cache.vendasConversion.get(key)!
}

async function getTrafficDataset(
  cache: EvaluationCaches,
  startDate: string,
  endDate: string,
  scopeType: GoalScopeType,
  scopeId: string
) {
  const key = [startDate, endDate, scopeType, scopeId].join('::')
  if (!cache.traffic.has(key)) {
    cache.traffic.set(
      key,
      loadTrafegoDataset({
        startDate,
        endDate,
        campaigns: emptyFilter(),
        adsets: emptyFilter(),
        ads: emptyFilter(),
        channels: scopeType === 'channel' ? { include: [scopeId], exclude: [] } : emptyFilter(),
        mediums: emptyFilter(),
        funilTags: emptyFilter(),
        cpTags: scopeType === 'campaign' ? { include: [scopeId], exclude: [] } : emptyFilter(),
        mqlFilter: 'all',
        sdrs: emptyFilter(),
        closers: emptyFilter(),
      })
    )
  }
  return cache.traffic.get(key)!
}

async function getPrevendasAgendamentosDataset(
  cache: EvaluationCaches,
  startDate: string,
  endDate: string
) {
  const key = `${startDate}::${endDate}`
  if (!cache.prevendasAgendamentos.has(key)) {
    cache.prevendasAgendamentos.set(key, loadPrevendasAgendamentosDataset(startDate, endDate))
  }
  return cache.prevendasAgendamentos.get(key)!
}

async function getPrevendasResponseDataset(
  cache: EvaluationCaches,
  startDate: string,
  endDate: string
) {
  const key = `${startDate}::${endDate}`
  if (!cache.prevendasResponse.has(key)) {
    cache.prevendasResponse.set(key, loadPrevendasResponseDataset(startDate, endDate))
  }
  return cache.prevendasResponse.get(key)!
}

async function getVendasClosedDataset(
  cache: EvaluationCaches,
  startDate: string,
  endDate: string
) {
  const key = `${startDate}::${endDate}`
  if (!cache.vendasClosed.has(key)) {
    cache.vendasClosed.set(key, loadVendasClosedDataset(startDate, endDate))
  }
  return cache.vendasClosed.get(key)!
}

function findPairedVolumeRecord(record: GoalRecord, records: GoalRecord[]) {
  if (record.metric.area_key !== 'trafego' || record.metric.metric_key !== 'cost_per_mql') {
    return null
  }

  return (
    records.find((candidate) => {
      if (!candidate.preferredVersion) return false
      if (candidate.metric.area_key !== 'trafego' || candidate.metric.metric_key !== 'mql_count') return false
      if (candidate.definition.scope_type !== record.definition.scope_type) return false
      if (candidate.definition.scope_id !== record.definition.scope_id) return false
      return (
        candidate.preferredVersion.period_start === record.preferredVersion?.period_start &&
        candidate.preferredVersion.period_end === record.preferredVersion?.period_end
      )
    }) ?? null
  )
}

async function evaluateTrafficMqlCount(
  record: GoalRecord,
  version: GoalVersion,
  caches: EvaluationCaches,
  today: string
): Promise<GoalPerformanceResult> {
  const dataset = await getTrafficDataset(
    caches,
    version.period_start,
    version.period_end,
    record.definition.scope_type,
    record.definition.scope_id
  )
  const mqlOpps = filterUniqueMqls(dataset.opps)
  const actualValue = mqlOpps.length
  const ideal = computeIdealDia({
    startDate: version.period_start,
    endDate: version.period_end,
    meta: version.target_value,
    atual: actualValue,
  })
  const projectionValue = getProjectionValue(actualValue, ideal.daysElapsed, ideal.periodDays)

  const valueByDate = new Map<string, number>()
  for (const opp of mqlOpps) {
    if (!opp.data_lead_recebido) continue
    const date = tsToSPDate(opp.data_lead_recebido)
    valueByDate.set(date, (valueByDate.get(date) ?? 0) + 1)
  }

  return {
    versionId: version.id,
    actualValue,
    targetValue: version.target_value,
    status: resolveCumulativeStatus(
      version.period_start,
      version.period_end,
      today,
      actualValue,
      version.target_value,
      ideal.idealAcumulado,
      projectionValue
    ),
    progressPct: computeProgressPct(actualValue, version.target_value, record.metric.target_direction),
    delta: roundNumber(actualValue - ideal.idealAcumulado, 2),
    projectionValue,
    idealValue: roundNumber(ideal.idealAcumulado, 2),
    idealDailyValue:
      ideal.daysRemaining > 0
        ? roundNumber(Math.max(0, (version.target_value - actualValue) / ideal.daysRemaining), 2)
        : 0,
    label: record.metric.metric_name,
    warning: null,
    details: {
      periodDays: ideal.periodDays,
      daysElapsed: ideal.daysElapsed,
      daysRemaining: ideal.daysRemaining,
    },
    series: buildCumulativeSeries(
      version.period_start,
      version.period_end,
      valueByDate,
      version.target_value
    ),
    lastComputedAt: new Date().toISOString(),
  }
}

async function evaluateTrafficCostPerMql(
  record: GoalRecord,
  version: GoalVersion,
  records: GoalRecord[],
  caches: EvaluationCaches,
  today: string
): Promise<GoalPerformanceResult> {
  const dataset = await getTrafficDataset(
    caches,
    version.period_start,
    version.period_end,
    record.definition.scope_type,
    record.definition.scope_id
  )
  const metaKpis = computeMetaKpis(dataset.metaRows, dataset.accountDailyRows)
  const mqlCount = countUniqueMqls(dataset.opps)
  const actualValue = mqlCount > 0 ? metaKpis.spend / mqlCount : metaKpis.spend > 0 ? null : 0

  const pairedRecord = findPairedVolumeRecord(record, records)
  const pairedTarget = pairedRecord?.preferredVersion?.target_value ?? null
  const costIdeal =
    pairedTarget != null
      ? computeCostMqlIdealDia({
          startDate: version.period_start,
          endDate: version.period_end,
          costMeta: version.target_value,
          mqlMeta: pairedTarget,
          atualSpend: metaKpis.spend,
          atualMqls: mqlCount,
        })
      : null

  const warning =
    mqlCount === 0 && metaKpis.spend > 0
      ? 'Há gasto no período, mas nenhum MQL contabilizado.'
      : !pairedTarget
        ? 'Sem meta pareada de MQL para calcular o teto diário de custo.'
        : null

  return {
    versionId: version.id,
    actualValue: roundNumber(actualValue, 2),
    targetValue: version.target_value,
    status: resolveBudgetStatus(
      version.period_start,
      version.period_end,
      today,
      actualValue,
      version.target_value,
      costIdeal?.maxBudget ?? null,
      costIdeal?.projectedTotalSpend ?? null,
      costIdeal?.idealBudgetAcumulado ?? null,
      metaKpis.spend,
      pairedTarget != null
    ),
    progressPct: computeProgressPct(actualValue, version.target_value, record.metric.target_direction),
    delta:
      costIdeal != null
        ? roundNumber(metaKpis.spend - costIdeal.idealBudgetAcumulado, 2)
        : actualValue != null
          ? roundNumber(version.target_value - actualValue, 2)
          : null,
    projectionValue: costIdeal?.projectedTotalSpend ?? null,
    idealValue: costIdeal?.idealBudgetAcumulado ?? null,
    idealDailyValue: costIdeal?.spendPerDayIdeal ?? null,
    label: record.metric.metric_name,
    warning,
    details: {
      spend: roundNumber(metaKpis.spend, 2),
      mqlCount,
      maxBudget: costIdeal?.maxBudget ?? null,
      spendPerDayAtual: costIdeal?.spendPerDayAtual ?? null,
      pairedMqlTarget: pairedTarget,
    },
    series: computeCostPerMqlSeries(
      dataset.metaRows,
      dataset.opps,
      version.period_start,
      version.period_end
    ).map((point) => ({
      date: point.date,
      actual: roundNumber(point.costPerMql, 2) ?? 0,
      cumulativeActual: roundNumber(point.cumSpend, 2) ?? 0,
      ideal: version.target_value,
      target: version.target_value,
    })),
    lastComputedAt: new Date().toISOString(),
  }
}

async function evaluatePrevendasAgendamentos(
  record: GoalRecord,
  version: GoalVersion,
  caches: EvaluationCaches,
  today: string
): Promise<GoalPerformanceResult> {
  const rows = await getPrevendasAgendamentosDataset(caches, version.period_start, version.period_end)
  const scopedRows = rows.filter((row) => {
    if (!row.data_agendamento_reuniao) return false
    if (record.definition.scope_type === 'workspace') return true
    if (record.definition.scope_type === 'user') {
      return row.sdr_name?.trim() === record.definition.scope_id.trim()
    }
    return false
  })

  const actualValue = scopedRows.length
  const ideal = computeIdealDia({
    startDate: version.period_start,
    endDate: version.period_end,
    meta: version.target_value,
    atual: actualValue,
  })
  const projectionValue = getProjectionValue(actualValue, ideal.daysElapsed, ideal.periodDays)
  const byDate = new Map<string, number>()

  for (const row of scopedRows) {
    if (!row.data_agendamento_reuniao) continue
    byDate.set(
      row.data_agendamento_reuniao,
      (byDate.get(row.data_agendamento_reuniao) ?? 0) + 1
    )
  }

  return {
    versionId: version.id,
    actualValue,
    targetValue: version.target_value,
    status: resolveCumulativeStatus(
      version.period_start,
      version.period_end,
      today,
      actualValue,
      version.target_value,
      ideal.idealAcumulado,
      projectionValue
    ),
    progressPct: computeProgressPct(actualValue, version.target_value, record.metric.target_direction),
    delta: roundNumber(actualValue - ideal.idealAcumulado, 2),
    projectionValue,
    idealValue: roundNumber(ideal.idealAcumulado, 2),
    idealDailyValue:
      ideal.daysRemaining > 0
        ? roundNumber(Math.max(0, (version.target_value - actualValue) / ideal.daysRemaining), 2)
        : 0,
    label: record.metric.metric_name,
    warning: null,
    details: {
      periodDays: ideal.periodDays,
      daysElapsed: ideal.daysElapsed,
      daysRemaining: ideal.daysRemaining,
    },
    series: buildCumulativeSeries(
      version.period_start,
      version.period_end,
      byDate,
      version.target_value
    ),
    lastComputedAt: new Date().toISOString(),
  }
}

async function evaluatePrevendasResponseTime(
  record: GoalRecord,
  version: GoalVersion,
  caches: EvaluationCaches,
  today: string
): Promise<GoalPerformanceResult> {
  const rows = await getPrevendasResponseDataset(caches, version.period_start, version.period_end)
  const scopedRows =
    record.definition.scope_type === 'user'
      ? rows.filter((row) => row.sdr_name?.trim() === record.definition.scope_id.trim())
      : rows

  let actualValue: number | null = null
  if (scopedRows.length > 0) {
    const totalResponses = scopedRows.reduce((sum, row) => sum + Number(row.response_count ?? 0), 0)
    const totalSeconds = scopedRows.reduce(
      (sum, row) => sum + Number(row.avg_response_seconds ?? 0) * Number(row.response_count ?? 0),
      0
    )
    actualValue = totalResponses > 0 ? totalSeconds / totalResponses / 60 : null
  }

  return {
    versionId: version.id,
    actualValue: roundNumber(actualValue, 2),
    targetValue: version.target_value,
    status: resolveSnapshotStatus(
      version.period_start,
      version.period_end,
      today,
      actualValue,
      version.target_value,
      record.metric.target_direction
    ),
    progressPct: computeProgressPct(actualValue, version.target_value, record.metric.target_direction),
    delta:
      actualValue != null ? roundNumber(version.target_value - actualValue, 2) : null,
    projectionValue: null,
    idealValue: null,
    idealDailyValue: null,
    label: record.metric.metric_name,
    warning: scopedRows.length === 0 ? 'Nenhuma medição de resposta no período.' : null,
    details: {
      measuredUsers: scopedRows.length,
      responseCount: scopedRows.reduce((sum, row) => sum + Number(row.response_count ?? 0), 0),
    },
    series: [],
    lastComputedAt: new Date().toISOString(),
  }
}

async function evaluateVendasClosedCount(
  record: GoalRecord,
  version: GoalVersion,
  caches: EvaluationCaches,
  today: string
): Promise<GoalPerformanceResult> {
  const { opps } = await getVendasClosedDataset(caches, version.period_start, version.period_end)
  const scopedOpps =
    record.definition.scope_type === 'user'
      ? opps.filter((opp) => opp.vendedor_closer?.trim() === record.definition.scope_id.trim())
      : opps

  const actualValue = scopedOpps.length
  const ideal = computeIdealDia({
    startDate: version.period_start,
    endDate: version.period_end,
    meta: version.target_value,
    atual: actualValue,
  })
  const projectionValue = getProjectionValue(actualValue, ideal.daysElapsed, ideal.periodDays)
  const byDate = new Map<string, number>()

  for (const opp of scopedOpps) {
    if (!opp.data_fechado) continue
    byDate.set(opp.data_fechado, (byDate.get(opp.data_fechado) ?? 0) + 1)
  }

  return {
    versionId: version.id,
    actualValue,
    targetValue: version.target_value,
    status: resolveCumulativeStatus(
      version.period_start,
      version.period_end,
      today,
      actualValue,
      version.target_value,
      ideal.idealAcumulado,
      projectionValue
    ),
    progressPct: computeProgressPct(actualValue, version.target_value, record.metric.target_direction),
    delta: roundNumber(actualValue - ideal.idealAcumulado, 2),
    projectionValue,
    idealValue: roundNumber(ideal.idealAcumulado, 2),
    idealDailyValue:
      ideal.daysRemaining > 0
        ? roundNumber(Math.max(0, (version.target_value - actualValue) / ideal.daysRemaining), 2)
        : 0,
    label: record.metric.metric_name,
    warning: null,
    details: {
      periodDays: ideal.periodDays,
      daysElapsed: ideal.daysElapsed,
      daysRemaining: ideal.daysRemaining,
    },
    series: buildCumulativeSeries(
      version.period_start,
      version.period_end,
      byDate,
      version.target_value
    ),
    lastComputedAt: new Date().toISOString(),
  }
}

async function evaluateVendasClosedRevenue(
  record: GoalRecord,
  version: GoalVersion,
  caches: EvaluationCaches,
  today: string
): Promise<GoalPerformanceResult> {
  const { opps, revenueRows } = await getVendasClosedDataset(caches, version.period_start, version.period_end)
  const scopedOpps =
    record.definition.scope_type === 'user'
      ? opps.filter((opp) => opp.vendedor_closer?.trim() === record.definition.scope_id.trim())
      : opps
  const oppIds = new Set(scopedOpps.map((opp) => opp.id))
  const revenueByOppId = new Map(
    revenueRows.map((row) => [row.oportunidade_id, Number(row.valor_faturado ?? 0)])
  )

  let actualValue = 0
  const byDate = new Map<string, number>()

  for (const opp of scopedOpps) {
    if (!opp.data_fechado) continue
    const revenue = revenueByOppId.get(opp.id) ?? 0
    actualValue += revenue
    byDate.set(opp.data_fechado, (byDate.get(opp.data_fechado) ?? 0) + revenue)
  }

  const ideal = computeIdealDia({
    startDate: version.period_start,
    endDate: version.period_end,
    meta: version.target_value,
    atual: actualValue,
  })
  const projectionValue = getProjectionValue(actualValue, ideal.daysElapsed, ideal.periodDays)

  return {
    versionId: version.id,
    actualValue: roundNumber(actualValue, 2),
    targetValue: version.target_value,
    status: resolveCumulativeStatus(
      version.period_start,
      version.period_end,
      today,
      actualValue,
      version.target_value,
      ideal.idealAcumulado,
      projectionValue
    ),
    progressPct: computeProgressPct(actualValue, version.target_value, record.metric.target_direction),
    delta: roundNumber(actualValue - ideal.idealAcumulado, 2),
    projectionValue,
    idealValue: roundNumber(ideal.idealAcumulado, 2),
    idealDailyValue:
      ideal.daysRemaining > 0
        ? roundNumber(Math.max(0, (version.target_value - actualValue) / ideal.daysRemaining), 2)
        : 0,
    label: record.metric.metric_name,
    warning: scopedOpps.length > 0 && oppIds.size > revenueByOppId.size
      ? 'Algumas oportunidades fechadas ainda não têm valor faturado em vendas_fechamento.'
      : null,
    details: {
      closedOpps: scopedOpps.length,
    },
    series: buildCumulativeSeries(
      version.period_start,
      version.period_end,
      byDate,
      version.target_value
    ),
    lastComputedAt: new Date().toISOString(),
  }
}

async function evaluateVendasConversionRate(
  record: GoalRecord,
  version: GoalVersion,
  caches: EvaluationCaches,
  today: string
): Promise<GoalPerformanceResult> {
  const { reunioes, paidOppIds } = await getVendasConversionDataset(
    caches,
    version.period_start,
    version.period_end
  )

  const scopedReunioes =
    record.definition.scope_type === 'user'
      ? reunioes.filter((r) => r.vendedor_closer?.trim() === record.definition.scope_id.trim())
      : reunioes

  const totalReunioes = scopedReunioes.length
  const totalFechados = scopedReunioes.filter((r) => paidOppIds.has(r.opp_id)).length

  const actualValue =
    totalReunioes > 0 ? roundNumber((totalFechados / totalReunioes) * 100, 1) : null

  return {
    versionId: version.id,
    actualValue,
    targetValue: version.target_value,
    status: resolveSnapshotStatus(
      version.period_start,
      version.period_end,
      today,
      actualValue,
      version.target_value,
      record.metric.target_direction
    ),
    progressPct: computeProgressPct(actualValue, version.target_value, record.metric.target_direction),
    delta: actualValue != null ? roundNumber(actualValue - version.target_value, 1) : null,
    projectionValue: null,
    idealValue: null,
    idealDailyValue: null,
    label: record.metric.metric_name,
    warning: totalReunioes === 0 ? 'Sem reuniões realizadas no período.' : null,
    details: { reunioes: totalReunioes, fechados: totalFechados },
    series: [],
    lastComputedAt: new Date().toISOString(),
  }
}

async function getOrganicoDataset(
  caches: EvaluationCaches,
  periodStart: string,
  periodEnd: string,
  scopeType: GoalScopeType,
  scopeId: string
): Promise<{ opps: OrganicoOppRow[]; organicSourceSet: Set<string> }> {
  const cacheKey = `${periodStart}|${periodEnd}`

  if (!caches.organico.has(cacheKey)) {
    caches.organico.set(
      cacheKey,
      (async () => {
        const wid = await getWorkspaceId()
        if (!wid) throw new Error('Conta não encontrada')

        // Carregar canais orgânicos
        const { data: plainData, error: plainError } = await supabase
          .from('utm_sources_plain')
          .select('utm_source')
          .eq('workspace_id', wid)
        if (plainError) throw plainError
        const organicSourceSet = new Set<string>(
          ((plainData ?? []) as { utm_source: string | null }[])
            .map((r) => r.utm_source)
            .filter((s): s is string => !!s)
        )

        // Carregar oportunidades do período
        const startISO = toSPISOStart(periodStart)
        const endISO = toSPISOEnd(periodEnd)
        const PAGE_SIZE = 1000
        const allOpps: OrganicoOppRow[] = []
        let page = 0
        while (true) {
          const { data, error } = await supabase
            .from('oportunidades')
            .select('id, data_lead_recebido, contatos(utm_source, tags)')
            .eq('workspace_id', wid)
            .gte('data_lead_recebido', startISO)
            .lte('data_lead_recebido', endISO)
            .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
            .order('id', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          if (error) throw error
          const rows = (data ?? []) as unknown as OrganicoOppRow[]
          allOpps.push(...rows)
          if (rows.length < PAGE_SIZE) break
          page++
        }

        return { opps: allOpps, organicSourceSet }
      })()
    )
  }

  const dataset = await caches.organico.get(cacheKey)!

  // Filtrar por canal orgânico
  let opps = dataset.opps.filter((opp) => {
    const src = opp.contatos?.utm_source
    return src != null && src !== '' && dataset.organicSourceSet.has(src)
  })

  if (scopeType === 'channel' && scopeId !== 'global') {
    opps = opps.filter((opp) => opp.contatos?.utm_source === scopeId)
  }

  return { opps, organicSourceSet: dataset.organicSourceSet }
}

async function evaluateOrganicoMqlCount(
  record: GoalRecord,
  version: GoalVersion,
  caches: EvaluationCaches,
  today: string
): Promise<GoalPerformanceResult> {
  const { opps } = await getOrganicoDataset(
    caches,
    version.period_start,
    version.period_end,
    record.definition.scope_type,
    record.definition.scope_id
  )

  const mqlOpps = opps.filter((opp) =>
    isMqlByTag(opp.contatos as Parameters<typeof isMqlByTag>[0])
  )
  const actualValue = mqlOpps.length
  const ideal = computeIdealDia({
    startDate: version.period_start,
    endDate: version.period_end,
    meta: version.target_value,
    atual: actualValue,
  })
  const projectionValue = getProjectionValue(actualValue, ideal.daysElapsed, ideal.periodDays)

  const valueByDate = new Map<string, number>()
  for (const opp of mqlOpps) {
    if (!opp.data_lead_recebido) continue
    const date = tsToSPDate(opp.data_lead_recebido)
    valueByDate.set(date, (valueByDate.get(date) ?? 0) + 1)
  }

  return {
    versionId: version.id,
    actualValue,
    targetValue: version.target_value,
    status: resolveCumulativeStatus(
      version.period_start,
      version.period_end,
      today,
      actualValue,
      version.target_value,
      ideal.idealAcumulado,
      projectionValue
    ),
    progressPct: computeProgressPct(actualValue, version.target_value, record.metric.target_direction),
    delta: roundNumber(actualValue - ideal.idealAcumulado, 2),
    projectionValue,
    idealValue: roundNumber(ideal.idealAcumulado, 2),
    idealDailyValue:
      ideal.daysRemaining > 0
        ? roundNumber(Math.max(0, (version.target_value - actualValue) / ideal.daysRemaining), 2)
        : 0,
    label: record.metric.metric_name,
    warning: null,
    details: {
      periodDays: ideal.periodDays,
      daysElapsed: ideal.daysElapsed,
      daysRemaining: ideal.daysRemaining,
    },
    series: buildCumulativeSeries(
      version.period_start,
      version.period_end,
      valueByDate,
      version.target_value
    ),
    lastComputedAt: new Date().toISOString(),
  }
}

async function evaluateGoalRecord(
  record: GoalRecord,
  records: GoalRecord[],
  caches: EvaluationCaches,
  today: string
) {
  const version = record.preferredVersion
  if (!version) return null

  switch (record.metric.provider_key) {
    case 'trafego.mql_count':
      return evaluateTrafficMqlCount(record, version, caches, today)
    case 'trafego.cost_per_mql':
      return evaluateTrafficCostPerMql(record, version, records, caches, today)
    case 'prevendas.agendamentos':
      return evaluatePrevendasAgendamentos(record, version, caches, today)
    case 'prevendas.response_time':
      return evaluatePrevendasResponseTime(record, version, caches, today)
    case 'vendas.closed_count':
      return evaluateVendasClosedCount(record, version, caches, today)
    case 'vendas.closed_revenue':
      return evaluateVendasClosedRevenue(record, version, caches, today)
    case 'vendas.conversion_rate':
      return evaluateVendasConversionRate(record, version, caches, today)
    case 'organico.mql_count':
      return evaluateOrganicoMqlCount(record, version, caches, today)
    default:
      return null
  }
}

export function sortGoalVersions(versions: GoalVersion[]) {
  return [...versions].sort((a, b) => {
    const startCmp = b.period_start.localeCompare(a.period_start)
    if (startCmp !== 0) return startCmp
    return b.period_end.localeCompare(a.period_end)
  })
}

export function getPreferredGoalVersion(versions: GoalVersion[], today = spToday()) {
  if (!versions.length) return null

  const current = versions
    .filter((version) => version.period_start <= today && version.period_end >= today)
    .sort((a, b) => b.period_start.localeCompare(a.period_start))
  if (current.length > 0) return current[0]

  const future = versions
    .filter((version) => version.period_start > today)
    .sort((a, b) => a.period_start.localeCompare(b.period_start))
  if (future.length > 0) return future[0]

  return versions
    .filter((version) => version.period_end < today)
    .sort((a, b) => b.period_end.localeCompare(a.period_end))[0] ?? null
}

export function buildGoalRecords(params: {
  definitions: GoalMetricDefinition[]
  goalDefinitions: GoalDefinition[]
  goalVersions: GoalVersion[]
  goalSnapshots: GoalSnapshot[]
  today?: string
}): GoalRecord[] {
  const { definitions, goalDefinitions, goalVersions, goalSnapshots, today = spToday() } = params
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]))
  const versionsByGoalId = new Map<string, GoalVersion[]>()
  const snapshotsByVersionId = new Map<string, GoalSnapshot[]>()

  for (const version of goalVersions) {
    const bucket = versionsByGoalId.get(version.goal_definition_id) ?? []
    bucket.push(version)
    versionsByGoalId.set(version.goal_definition_id, bucket)
  }

  for (const snapshot of goalSnapshots) {
    const bucket = snapshotsByVersionId.get(snapshot.goal_version_id) ?? []
    bucket.push(snapshot)
    snapshotsByVersionId.set(snapshot.goal_version_id, bucket)
  }

  return goalDefinitions
    .map((goalDefinition) => {
      const metric = definitionById.get(goalDefinition.metric_definition_id)
      if (!metric) return null

      const versions = sortGoalVersions(versionsByGoalId.get(goalDefinition.id) ?? [])
      const snapshots = versions.flatMap((version) => snapshotsByVersionId.get(version.id) ?? [])

      return {
        definition: goalDefinition,
        metric,
        versions,
        preferredVersion: getPreferredGoalVersion(versions, today),
        snapshots: snapshots.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date)),
      } satisfies GoalRecord
    })
    .filter((record): record is GoalRecord => !!record)
    .sort((a, b) => {
      const areaCmp = a.metric.area_key.localeCompare(b.metric.area_key)
      if (areaCmp !== 0) return areaCmp
      const scopeCmp = a.definition.scope_label.localeCompare(b.definition.scope_label)
      if (scopeCmp !== 0) return scopeCmp
      return a.metric.metric_name.localeCompare(b.metric.metric_name)
    })
}

export async function loadGoalMetricDefinitions() {
  const { data, error } = await supabase
    .from('goal_metric_definitions')
    .select('*')
    .eq('is_active', true)

  if (error) throw error
  return sortMetricDefinitions(
    ((data ?? []) as GoalMetricDefinition[]).map((row) => ({
      ...row,
      metadata: asRecord(row.metadata),
      supported_scope_types: (row.supported_scope_types ?? []) as GoalScopeType[],
    }))
  )
}

export async function loadGoalScopeOptions(): Promise<GoalScopeOptionsMap> {
  const wid = await getWorkspaceId()
  if (!wid) throw new Error('Conta não encontrada')

  const [sourcesRes, campaignsRes, sdrRes, closerRes, plainSourcesRes] = await Promise.all([
    supabase.from('utm_sources').select('nome, utm_source').eq('workspace_id', wid),
    supabase.from('utm_campaigns').select('nome').eq('workspace_id', wid),
    supabase.from('ghl_users').select('nome').contains('papeis', ['sdr']).eq('workspace_id', wid),
    supabase.from('ghl_users').select('nome').contains('papeis', ['closer']).eq('workspace_id', wid),
    supabase.from('utm_sources_plain').select('nome, utm_source').eq('workspace_id', wid),
  ])

  if (sourcesRes.error) throw sourcesRes.error
  if (campaignsRes.error) throw campaignsRes.error
  if (sdrRes.error) throw sdrRes.error
  if (closerRes.error) throw closerRes.error
  if (plainSourcesRes.error) throw plainSourcesRes.error

  const workspaceOption: GoalScopeOption = {
    type: 'workspace',
    value: 'global',
    label: 'Global',
  }

  return {
    workspace: [workspaceOption],
    channel: [
      workspaceOption,
      ...((sourcesRes.data ?? []) as { nome: string | null; utm_source: string | null }[])
        .filter((row) => row.utm_source)
        .map((row) => ({
          type: 'channel' as const,
          value: row.utm_source!,
          label: row.nome || row.utm_source!,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    campaign: [
      workspaceOption,
      ...((campaignsRes.data ?? []) as { nome: string | null }[])
        .filter((row) => row.nome)
        .map((row) => ({
          type: 'campaign' as const,
          value: row.nome!,
          label: row.nome!,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    sdrUsers: [
      workspaceOption,
      ...((sdrRes.data ?? []) as { nome: string | null }[])
        .filter((row) => row.nome)
        .map((row) => ({
          type: 'user' as const,
          value: row.nome!,
          label: row.nome!,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    closerUsers: [
      workspaceOption,
      ...((closerRes.data ?? []) as { nome: string | null }[])
        .filter((row) => row.nome)
        .map((row) => ({
          type: 'user' as const,
          value: row.nome!,
          label: row.nome!,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    organicChannel: [
      workspaceOption,
      ...((plainSourcesRes.data ?? []) as { nome: string | null; utm_source: string | null }[])
        .filter((row) => row.utm_source)
        .map((row) => ({
          type: 'channel' as const,
          value: row.utm_source!,
          label: row.nome || row.utm_source!,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
  }
}

export async function loadGoalsWorkspaceData(workspaceId?: string | null) {
  const resolvedWorkspaceId = workspaceId ?? (await getWorkspaceId())
  if (!resolvedWorkspaceId) {
    return {
      workspaceId: null,
      definitions: [] as GoalMetricDefinition[],
      goalDefinitions: [] as GoalDefinition[],
      goalVersions: [] as GoalVersion[],
      goalSnapshots: [] as GoalSnapshot[],
    }
  }

  const definitions = await loadGoalMetricDefinitions()

  const { data: definitionsData, error: definitionsError } = await supabase
    .from('goal_definitions')
    .select('*, app_slug')
    .eq('workspace_id', resolvedWorkspaceId)
    .eq('is_active', true)

  if (definitionsError) throw definitionsError

  const goalDefinitions = ((definitionsData ?? []) as GoalDefinition[]).map((row) => ({
    ...row,
    metadata: asRecord(row.metadata),
    app_slug: (row.app_slug ?? null) as GoalAppSlug,
  }))

  const goalDefinitionIds = goalDefinitions.map((definition) => definition.id)
  const goalVersions = goalDefinitionIds.length
    ? await (async () => {
        const { data, error } = await supabase
          .from('goal_versions')
          .select('*')
          .in('goal_definition_id', goalDefinitionIds)
        if (error) throw error
        return (data ?? []) as GoalVersion[]
      })()
    : []

  const versionIds = goalVersions.map((version) => version.id)
  const goalSnapshots = versionIds.length
    ? await (async () => {
        const { data, error } = await supabase
          .from('goal_snapshots')
          .select('*')
          .in('goal_version_id', versionIds)
        if (error) throw error
        return (data ?? []) as GoalSnapshot[]
      })()
    : []

  return {
    workspaceId: resolvedWorkspaceId,
    definitions,
    goalDefinitions,
    goalVersions: goalVersions.map((row) => ({ ...row, metadata: asRecord(row.metadata) })),
    goalSnapshots: goalSnapshots.map((row) => ({ ...row, payload: asRecord(row.payload) })),
  }
}

export async function evaluateGoalRecords(records: GoalRecord[], today = spToday()) {
  const caches: EvaluationCaches = {
    traffic: new Map(),
    prevendasAgendamentos: new Map(),
    prevendasResponse: new Map(),
    vendasClosed: new Map(),
    vendasConversion: new Map(),
    organico: new Map(),
  }

  const results = await Promise.all(
    records.map(async (record) => {
      const result = await evaluateGoalRecord(record, records, caches, today)
      return result ? [record.preferredVersion!.id, result] : null
    })
  )

  return new Map(
    results.filter((entry): entry is [string, GoalPerformanceResult] => !!entry)
  )
}

export async function saveGoalVersion(input: GoalEditorInput) {
  const workspaceId = await getWorkspaceId()
  if (!workspaceId) {
    throw new Error('Conta não encontrada para salvar a meta.')
  }

  const scopeType = input.scopeType
  const scopeId = normalizeScopeId(scopeType, input.scopeId)
  const scopeLabel = normalizeScopeLabel(scopeType, input.scopeLabel, scopeId)

  let goalDefinitionId = input.goalDefinitionId
  const appSlug = input.appSlug ?? null

  if (!goalDefinitionId) {
    const { data: existingDefinition, error: existingError } = await supabase
      .from('goal_definitions')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('metric_definition_id', input.metricDefinitionId)
      .eq('scope_type', scopeType)
      .eq('scope_id', scopeId)
      .maybeSingle()

    if (existingError) throw existingError

    if (existingDefinition?.id) {
      goalDefinitionId = existingDefinition.id
      const { error: updateDefinitionError } = await supabase
        .from('goal_definitions')
        .update({
          scope_label: scopeLabel,
          notes: input.notes ?? null,
          app_slug: appSlug,
          updated_at: new Date().toISOString(),
        })
        .eq('id', goalDefinitionId)

      if (updateDefinitionError) throw updateDefinitionError
    } else {
      const { data: createdDefinition, error: createDefinitionError } = await supabase
        .from('goal_definitions')
        .insert({
          workspace_id: workspaceId,
          metric_definition_id: input.metricDefinitionId,
          scope_type: scopeType,
          scope_id: scopeId,
          scope_label: scopeLabel,
          notes: input.notes ?? null,
          app_slug: appSlug,
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (createDefinitionError) throw createDefinitionError
      goalDefinitionId = createdDefinition.id
    }
  } else {
    // Edição de meta existente: atualiza app_slug e metadados da definição
    const { error: updateDefinitionError } = await supabase
      .from('goal_definitions')
      .update({
        scope_label: scopeLabel,
        notes: input.notes ?? null,
        app_slug: appSlug,
        updated_at: new Date().toISOString(),
      })
      .eq('id', goalDefinitionId)

    if (updateDefinitionError) throw updateDefinitionError
  }

  const payload = {
    goal_definition_id: goalDefinitionId,
    target_value: input.targetValue,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    cadence: 'customizado',
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  }

  const query = input.versionId
    ? supabase.from('goal_versions').update(payload).eq('id', input.versionId).select('*').single()
    : supabase.from('goal_versions').insert(payload).select('*').single()

  const { data, error } = await query

  if (error) {
    if (error.code === '23P01') {
      throw new Error('Já existe uma meta sobreposta para esse período.')
    }
    if (error.code === '23505') {
      throw new Error('Já existe uma meta salva exatamente para esse período.')
    }
    throw error
  }

  return { ...(data as GoalVersion), metadata: asRecord((data as GoalVersion).metadata) }
}

export async function upsertGoalSnapshot(params: {
  goalVersionId: string
  snapshotDate?: string
  performance: GoalPerformanceResult
}) {
  const snapshotDate = params.snapshotDate ?? spToday()
  const payload = {
    goal_version_id: params.goalVersionId,
    snapshot_date: snapshotDate,
    actual_value: params.performance.actualValue,
    ideal_value: params.performance.idealValue,
    projected_value: params.performance.projectionValue,
    status: params.performance.status,
    payload: {
      details: params.performance.details,
      warning: params.performance.warning ?? null,
      progressPct: params.performance.progressPct,
    },
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('goal_snapshots')
    .upsert(payload, { onConflict: 'goal_version_id,snapshot_date' })

  if (error) throw error
}

export async function loadLegacyMetasFromGoals() {
  const { workspaceId, definitions, goalDefinitions, goalVersions } = await loadGoalsWorkspaceData()
  if (!workspaceId) return []

  const metricById = new Map(definitions.map((definition) => [definition.id, definition]))

  return goalVersions
    .map((version) => {
      const definition = goalDefinitions.find((item) => item.id === version.goal_definition_id)
      if (!definition) return null
      const metric = metricById.get(definition.metric_definition_id)
      if (!metric?.legacy_tipo) return null

      return {
        id: version.id,
        workspace_id: workspaceId,
        tipo: metric.legacy_tipo,
        referencia:
          definition.scope_type === 'workspace' ? 'global' : definition.scope_id,
        valor: version.target_value,
        periodo: version.cadence,
        periodo_inicio: version.period_start,
        periodo_fim: version.period_end,
      }
    })
    .filter((row): row is {
      id: string
      workspace_id: string
      tipo: string
      referencia: string
      valor: number
      periodo: string
      periodo_inicio: string
      periodo_fim: string
    } => !!row)
    .sort((a, b) => {
      const typeCmp = a.tipo.localeCompare(b.tipo)
      if (typeCmp !== 0) return typeCmp
      const refCmp = a.referencia.localeCompare(b.referencia)
      if (refCmp !== 0) return refCmp
      return a.periodo_inicio.localeCompare(b.periodo_inicio)
    })
}

export function resolveLegacyGoalInput(input: {
  tipo: string
  referencia: string
  valor: number
  periodoInicio: string
  periodoFim: string
  id?: string
}, definitions: GoalMetricDefinition[]): GoalEditorInput {
  const mapping = LEGACY_GOAL_TYPE_MAP[input.tipo]
  if (!mapping) {
    throw new Error(`Tipo de meta legado não mapeado: ${input.tipo}`)
  }

  const metric = definitions.find(
    (definition) =>
      definition.area_key === mapping.areaKey &&
      definition.metric_key === mapping.metricKey
  )

  if (!metric) {
    throw new Error(`Indicador não encontrado para o tipo legado: ${input.tipo}`)
  }

  const tiposComEscopoUser = ['agendamentos_sdr', 'taxa_conversao_vendas']
  const scopeType =
    tiposComEscopoUser.includes(input.tipo) && input.referencia.trim().toLowerCase() !== 'global'
      ? 'user'
      : input.referencia.trim().toLowerCase() === 'global'
        ? 'workspace'
        : mapping.scopeType

  return {
    versionId: input.id,
    metricDefinitionId: metric.id,
    scopeType,
    scopeId: scopeType === 'workspace' ? 'global' : input.referencia.trim(),
    scopeLabel: scopeType === 'workspace' ? 'Global' : input.referencia.trim(),
    targetValue: input.valor,
    periodStart: input.periodoInicio,
    periodEnd: input.periodoFim,
  }
}
