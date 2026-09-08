import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────

export interface WeeklyReportFilters {
  module: string
  reportType: 'cohort' | 'produtividade'
  dimension?: string
  dimensionValue?: string
  weeksCount?: number
}

export interface WeeklyReportRow {
  module: string
  week_start: string
  week_end: string
  year_week: string
  report_type: string
  status: string | null
  leads_count: number | null
  mqls_count: number | null
  conectados_count: number | null
  agendados_count: number | null
  reunioes_count: number | null
  fechados_count: number | null
  faturamento_bruto: number | null
  caixa_recebido: number | null
  // controle de versão do snapshot (usado no dedup por semana — ver trendData.ts)
  data_version?: number | null
  computed_at?: string | null
  // produtividade fields (optional)
  sdr_name?: string | null
  closer_name?: string | null
  ligacoes_count?: number | null
  conversas_count?: number | null
  tempo_medio_atendimento?: number | null
  taxa_conversao?: number | null
}

export interface WeeklyReportsData {
  rows: WeeklyReportRow[]
  loading: boolean
  error: string | null
  refresh: () => void
}

const DEFAULT_WEEKS = 12

// ─── Hook ─────────────────────────────────────────────────────

export function useWeeklyReports(
  filters: WeeklyReportFilters,
  client: typeof supabase = supabase,
): WeeklyReportsData {
  const [rows, setRows] = useState<WeeklyReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function loadData() {
      try {
        const weeksCount = filters.weeksCount ?? DEFAULT_WEEKS

        let query = client
          .from('v_weekly_dashboard')
          .select('*')
          .eq('module', filters.module)
          .eq('report_type', filters.reportType)
          .order('week_start', { ascending: false })
          .limit(weeksCount)

        if (filters.dimension && filters.dimensionValue) {
          query = query.eq('dimension', filters.dimension).eq('dimension_value', filters.dimensionValue)
        }

        const res = await query
        if (cancelled) return
        if (res.error) throw res.error
        const allRows = (res.data ?? []) as WeeklyReportRow[]

        if (!cancelled) setRows(allRows)
      } catch (err) {
        if (!cancelled) {
          console.error('[useWeeklyReports] data error', err)
          const msg =
            err instanceof Error
              ? err.message
              : (err as { message?: string })?.message ?? JSON.stringify(err)
          setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadData()
    return () => { cancelled = true }
  }, [
    filters.module,
    filters.reportType,
    filters.dimension,
    filters.dimensionValue,
    filters.weeksCount,
    refreshKey,
    client,
  ])

  return { rows, loading, error, refresh }
}
