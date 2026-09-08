export type GoalAreaKey = 'trafego' | 'prevendas' | 'vendas' | 'organico'

export type GoalAppSlug =
  | 'aquisicao-vendas'
  | 'traqueamento'
  | 'pre-vendas'
  | 'relatorios'
  | 'sdr-ia'
  | 'metas'
  | 'leads'
  | null

export type GoalAnalysisMode = 'cohort' | 'produtividade'

export type GoalTargetDirection = 'maximize' | 'minimize'

export type GoalTrackingMode = 'cumulative' | 'snapshot' | 'budget_capped'

export type GoalScopeType =
  | 'workspace'
  | 'area'
  | 'team'
  | 'user'
  | 'channel'
  | 'campaign'
  | 'custom_entity'

export type GoalStatus =
  | 'scheduled'
  | 'on_track'
  | 'at_risk'
  | 'off_track'
  | 'completed'
  | 'no_data'

export interface GoalMetricDefinition {
  id: string
  area_key: GoalAreaKey
  metric_key: string
  metric_name: string
  description: string | null
  analysis_mode: GoalAnalysisMode
  aggregation_type: string
  unit: string
  target_direction: GoalTargetDirection
  date_basis: string
  default_period_granularity: string
  tracking_mode: GoalTrackingMode
  provider_key: string
  legacy_tipo: string | null
  supported_scope_types: GoalScopeType[]
  metadata: Record<string, unknown>
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface GoalDefinition {
  id: string
  workspace_id: string
  metric_definition_id: string
  scope_type: GoalScopeType
  scope_id: string
  scope_label: string
  owner_user_id: string | null
  notes: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
  app_slug: GoalAppSlug
}

export interface GoalVersion {
  id: string
  goal_definition_id: string
  target_value: number
  period_start: string
  period_end: string
  cadence: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface GoalSnapshot {
  id: string
  goal_version_id: string
  snapshot_date: string
  actual_value: number | null
  ideal_value: number | null
  projected_value: number | null
  status: GoalStatus
  payload: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface GoalRecord {
  definition: GoalDefinition
  metric: GoalMetricDefinition
  versions: GoalVersion[]
  preferredVersion: GoalVersion | null
  snapshots: GoalSnapshot[]
}

export interface GoalSeriesPoint {
  date: string
  actual: number
  cumulativeActual?: number
  ideal?: number | null
  target?: number | null
}

export interface GoalPerformanceResult {
  versionId: string
  actualValue: number | null
  targetValue: number
  status: GoalStatus
  progressPct: number | null
  delta: number | null
  projectionValue: number | null
  idealValue: number | null
  idealDailyValue: number | null
  label: string
  warning?: string | null
  details: Record<string, unknown>
  series: GoalSeriesPoint[]
  lastComputedAt: string
}

export interface GoalScopeOption {
  type: GoalScopeType
  value: string
  label: string
}

export interface GoalScopeOptionsMap {
  workspace: GoalScopeOption[]
  channel: GoalScopeOption[]
  campaign: GoalScopeOption[]
  sdrUsers: GoalScopeOption[]
  closerUsers: GoalScopeOption[]
  organicChannel: GoalScopeOption[]
}

export interface GoalEditorInput {
  goalDefinitionId?: string
  versionId?: string
  metricDefinitionId: string
  scopeType: GoalScopeType
  scopeId: string
  scopeLabel: string
  targetValue: number
  periodStart: string
  periodEnd: string
  notes?: string
  appSlug?: GoalAppSlug
}
