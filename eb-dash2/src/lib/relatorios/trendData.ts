import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'

// Métricas exibíveis nos gráficos de tendência (aba /relatorios?tab=tendencias)
export type TrendMetric =
  | 'leads'
  | 'mqls'
  | 'conectados'
  | 'agendados'
  | 'reunioes'
  | 'fechados'
  | 'faturamento_bruto'
  | 'caixa_recebido'

export interface TrendPoint {
  /** Chave estável e única para o React: week_start ISO do snapshot vencedor. */
  key: string
  /** Rótulo exibido no eixo X (ex.: "2026-W27"). */
  label: string
  value: number
}

const METRIC_FIELD: Record<TrendMetric, keyof WeeklyReportRow> = {
  leads: 'leads_count',
  mqls: 'mqls_count',
  conectados: 'conectados_count',
  agendados: 'agendados_count',
  reunioes: 'reunioes_count',
  fechados: 'fechados_count',
  faturamento_bruto: 'faturamento_bruto',
  caixa_recebido: 'caixa_recebido',
}

/**
 * Decide se o snapshot candidato `a` representa melhor a semana do que `b`.
 *
 * Em produção, weekly_snapshots pode conter linhas duplicadas para a mesma
 * semana (pares legados com workspace_id NULL + novos com workspace_id, e
 * snapshots antigos com week_start fora da convenção de segunda-feira cujo
 * year_week colide com o snapshot correto). Critério determinístico:
 *   1. maior data_version (snapshot mais reprocessado);
 *   2. computed_at mais recente;
 *   3. week_start mais antigo (convenção: semana começa na segunda-feira).
 */
function isBetterSnapshot(a: WeeklyReportRow, b: WeeklyReportRow): boolean {
  const versionA = a.data_version ?? 1
  const versionB = b.data_version ?? 1
  if (versionA !== versionB) return versionA > versionB

  const computedA = a.computed_at ?? ''
  const computedB = b.computed_at ?? ''
  if (computedA !== computedB) return computedA > computedB

  return a.week_start < b.week_start
}

/**
 * Deduplica as linhas de v_weekly_dashboard por semana: exatamente um
 * snapshot vencedor por year_week (ver isBetterSnapshot). Consumidores
 * (TrendChart, WeeklyReportTable) aplicam a ordenação de exibição em seguida.
 */
export function dedupeWeeklyRows(rows: WeeklyReportRow[]): WeeklyReportRow[] {
  const byWeek = new Map<string, WeeklyReportRow>()

  for (const row of rows) {
    const current = byWeek.get(row.year_week)
    if (!current || isBetterSnapshot(row, current)) {
      byWeek.set(row.year_week, row)
    }
  }

  return [...byWeek.values()]
}

/**
 * Pivota as linhas de v_weekly_dashboard para o eixo X de um gráfico de
 * tendência: exatamente um ponto por semana (dedup por year_week), em ordem
 * cronológica ascendente, com chave única estável (week_start ISO).
 *
 * A ordenação de entrada não importa — a saída é sempre cronológica.
 */
export function buildTrendData(rows: WeeklyReportRow[], metric: TrendMetric): TrendPoint[] {
  const field = METRIC_FIELD[metric]

  return dedupeWeeklyRows(rows)
    .sort((a, b) => (a.week_start < b.week_start ? -1 : a.week_start > b.week_start ? 1 : 0))
    .map((row) => ({
      key: row.week_start,
      label: row.year_week,
      value: Number(row[field]) || 0,
    }))
}
