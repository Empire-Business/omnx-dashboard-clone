import type {
  GoalAppSlug,
  GoalAreaKey,
  GoalMetricDefinition,
  GoalScopeOption,
  GoalScopeOptionsMap,
  GoalScopeType,
  GoalStatus,
  GoalTargetDirection,
} from './types'

export interface GoalAreaMeta {
  label: string
  eyebrow: string
  description: string
  accent: string
  tint: string
}

export const GOAL_APP_OPTIONS: { value: GoalAppSlug; label: string }[] = [
  { value: null, label: 'Todos os apps' },
  { value: 'aquisicao-vendas', label: 'Aquisição & Vendas' },
  { value: 'traqueamento', label: 'Traqueamento' },
  { value: 'pre-vendas', label: 'Pré-Vendas' },
  { value: 'relatorios', label: 'Relatórios' },
  { value: 'sdr-ia', label: 'SDR IA' },
  { value: 'metas', label: 'Metas' },
  { value: 'leads', label: 'Leads' },
]

export const GOAL_AREA_META: Record<GoalAreaKey, GoalAreaMeta> = {
  trafego: {
    label: 'Tráfego',
    eyebrow: 'Aquisição',
    description: 'Metas de geração, custo e eficiência do tráfego pago.',
    accent: 'var(--empire-primary)',
    tint: 'var(--empire-primary-soft)',
  },
  prevendas: {
    label: 'Pré-Vendas',
    eyebrow: 'Operação',
    description: 'Metas operacionais do time de SDRs, produtividade e SLA.',
    accent: 'var(--empire-success)',
    tint: 'var(--empire-success-soft)',
  },
  vendas: {
    label: 'Vendas',
    eyebrow: 'Receita',
    description: 'Metas de fechamentos e faturamento para closers e operação comercial.',
    accent: 'var(--empire-warning)',
    tint: 'var(--empire-warning-soft)',
  },
  organico: {
    label: 'Orgânico',
    eyebrow: 'Aquisição',
    description: 'Metas de geração de MQLs por canais orgânicos (Instagram, YouTube, Indicação, etc.).',
    accent: 'var(--empire-info)',
    tint: 'var(--empire-info-soft)',
  },
}

export const GOAL_STATUS_META: Record<
  GoalStatus,
  { label: string; className: string }
> = {
  scheduled: {
    label: 'Agendada',
    className: 'bg-empire-void/10 text-empire-primary',
  },
  on_track: {
    label: 'Em dia',
    className: 'bg-empire-success/10 text-empire-success',
  },
  at_risk: {
    label: 'Em risco',
    className: 'bg-empire-warning/15 text-empire-warning',
  },
  off_track: {
    label: 'Fora',
    className: 'bg-empire-danger/10 text-empire-danger',
  },
  completed: {
    label: 'Concluída',
    className: 'bg-empire-success/15 text-empire-success',
  },
  no_data: {
    label: 'Sem dados',
    className: 'bg-empire-subtle/10 text-empire-subtle',
  },
}

export const GOAL_SCOPE_LABELS: Record<GoalScopeType, string> = {
  workspace: 'Global',
  area: 'Área',
  team: 'Time',
  user: 'Pessoa',
  channel: 'Canal',
  campaign: 'Campanha',
  custom_entity: 'Outro',
}

export const LEGACY_GOAL_TYPE_MAP: Record<
  string,
  { areaKey: GoalAreaKey; metricKey: string; scopeType: GoalScopeType }
> = {
  mql_count_trafego: {
    areaKey: 'trafego',
    metricKey: 'mql_count',
    scopeType: 'workspace',
  },
  custo_mql_trafego: {
    areaKey: 'trafego',
    metricKey: 'cost_per_mql',
    scopeType: 'workspace',
  },
  agendamentos_sdr: {
    areaKey: 'prevendas',
    metricKey: 'agendamentos',
    scopeType: 'user',
  },
  taxa_conversao_vendas: {
    areaKey: 'vendas',
    metricKey: 'conversion_rate',
    scopeType: 'workspace',
  },
}

export function getMetricCompositeKey(metric: Pick<GoalMetricDefinition, 'area_key' | 'metric_key'>) {
  return `${metric.area_key}.${metric.metric_key}`
}

export function sortMetricDefinitions(definitions: GoalMetricDefinition[]) {
  return [...definitions].sort((a, b) => {
    const areaCmp = a.area_key.localeCompare(b.area_key)
    if (areaCmp !== 0) return areaCmp
    return a.metric_name.localeCompare(b.metric_name)
  })
}

export function getSupportedScopeOptions(
  metric: GoalMetricDefinition | null,
  options: GoalScopeOption[]
): GoalScopeOption[] {
  if (!metric) return options
  const allowed = new Set(metric.supported_scope_types)
  return options.filter((option) => allowed.has(option.type))
}

export function formatGoalValue(
  value: number | null | undefined,
  unit: string,
  maximumFractionDigits = 1
): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (unit === 'BRL') {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits,
    }).format(value)
  }
  if (unit === 'percent') {
    return `${value.toFixed(1)}%`
  }
  if (unit === 'minutes') {
    if (value <= 0) return '—'
    if (value < 1) return '< 1 min'
    if (value < 60) return `${Math.round(value)} min`
    const hours = Math.floor(value / 60)
    const minutes = Math.round(value % 60)
    return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`
  }
  return new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits,
  }).format(value)
}

export function formatGoalDelta(
  delta: number | null | undefined,
  direction: GoalTargetDirection,
  unit: string
): string {
  if (delta == null || Number.isNaN(delta)) return '—'
  const signed = direction === 'minimize' ? -delta : delta
  const prefix = signed > 0 ? '+' : ''
  if (unit === 'BRL') {
    return `${prefix}${formatGoalValue(signed, unit, 0)}`
  }
  if (unit === 'percent') {
    return `${prefix}${signed.toFixed(1)} pp`
  }
  if (unit === 'minutes') {
    return `${prefix}${formatGoalValue(signed, unit)}`
  }
  return `${prefix}${Math.round(signed)}`
}

export function getScopeSourceKey(metric: GoalMetricDefinition): keyof GoalScopeOptionsMap {
  const raw = metric.metadata?.scope_source
  if (raw === 'trafego') return 'channel'
  if (raw === 'utm_campaigns') return 'campaign'
  if (raw === 'sdr_users') return 'sdrUsers'
  if (raw === 'closer_users') return 'closerUsers'
  if (raw === 'organico') return 'organicChannel'
  return 'workspace'
}
