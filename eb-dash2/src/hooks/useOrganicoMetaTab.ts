/**
 * useOrganicoMetaTab — carrega TODOS os períodos de meta cadastrados para orgânico.mql_count.
 *
 * Diferente de useOrganicoMeta (que só carrega metas sobrepostas ao filtro de data global),
 * este hook retorna todos os períodos cadastrados para o usuário poder selecionar qual visualizar.
 *
 * Retorna:
 *   - periods: GoalPeriod[] — todos os períodos, ordenados do mais recente para o mais antigo
 *   - loading: boolean
 */
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

export interface GoalPeriod {
  id: string           // "period_start|period_end" — chave única
  label: string        // "Abril 2026 · 01/04 → 30/04"
  startDate: string    // "2026-04-01"
  endDate: string      // "2026-04-30"
  globalTarget: number | null  // workspace target ou soma dos canais
  targetByChannel: Map<string, number>  // utm_source → target_value
}

export interface OrganicoMetaTabData {
  periods: GoalPeriod[]
  loading: boolean
}

const MONTHS_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function formatPeriodLabel(start: string, end: string): string {
  // Usar T12:00:00 para evitar problemas de fuso com new Date('2026-04-01')
  const s = new Date(`${start}T12:00:00`)
  const e = new Date(`${end}T12:00:00`)
  const monthName = MONTHS_PT[s.getMonth()]
  const year = s.getFullYear()
  const fmtDay = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
  return `${monthName} ${year} · ${fmtDay(s)} → ${fmtDay(e)}`
}

export function useOrganicoMetaTab(): OrganicoMetaTabData {
  const [periods, setPeriods] = useState<GoalPeriod[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const workspaceId = await getWorkspaceId()
        if (!workspaceId || cancelled) return

        // Buscar métrica organico.mql_count
        const { data: metricDef, error: metricError } = await supabase
          .from('goal_metric_definitions')
          .select('id')
          .eq('provider_key', 'organico.mql_count')
          .maybeSingle()

        if (metricError || !metricDef || cancelled) {
          setPeriods([])
          return
        }

        // Buscar definições ativas para este workspace
        const { data: goalDefs, error: goalDefsError } = await supabase
          .from('goal_definitions')
          .select('id, scope_type, scope_id')
          .eq('workspace_id', workspaceId)
          .eq('metric_definition_id', metricDef.id)
          .eq('is_active', true)

        if (goalDefsError || !goalDefs?.length || cancelled) {
          setPeriods([])
          return
        }

        const definitionIds = goalDefs.map((d) => d.id)

        // Buscar TODAS as versões (sem filtro de data) — queremos todos os períodos
        const { data: versions, error: versionsError } = await supabase
          .from('goal_versions')
          .select('id, goal_definition_id, target_value, period_start, period_end')
          .in('goal_definition_id', definitionIds)
          .order('period_start', { ascending: false })

        if (versionsError || cancelled) return

        const versionRows = (versions ?? []) as Array<{
          id: string
          goal_definition_id: string
          target_value: number
          period_start: string
          period_end: string
        }>

        const defById = new Map(
          (goalDefs as Array<{ id: string; scope_type: string; scope_id: string }>)
            .map((d) => [d.id, d])
        )

        // Agrupar por (period_start, period_end)
        const periodMap = new Map<
          string,
          {
            start: string
            end: string
            byChannel: Map<string, number>
            workspaceTarget: number | null
          }
        >()

        for (const v of versionRows) {
          const def = defById.get(v.goal_definition_id)
          if (!def) continue

          const key = `${v.period_start}|${v.period_end}`
          if (!periodMap.has(key)) {
            periodMap.set(key, {
              start: v.period_start,
              end: v.period_end,
              byChannel: new Map(),
              workspaceTarget: null,
            })
          }

          const entry = periodMap.get(key)!
          if (def.scope_type === 'workspace' || def.scope_id === 'global') {
            // Workspace target tem prioridade; manter o mais alto em caso de duplicatas
            entry.workspaceTarget = v.target_value
          } else if (def.scope_type === 'channel' && def.scope_id) {
            // Para cada canal, manter a versão com period_start mais recente
            // (as versões já chegam ordenadas por period_start desc, então a primeira ganha)
            if (!entry.byChannel.has(def.scope_id)) {
              entry.byChannel.set(def.scope_id, v.target_value)
            }
          }
        }

        // Construir GoalPeriod[] ordenado do mais recente ao mais antigo
        const result: GoalPeriod[] = Array.from(periodMap.entries())
          .sort((a, b) => b[0].localeCompare(a[0]))
          .map(([, entry]) => {
            const channelSum = Array.from(entry.byChannel.values()).reduce((acc, v) => acc + v, 0)
            const globalTarget =
              entry.workspaceTarget !== null
                ? entry.workspaceTarget
                : channelSum > 0
                  ? channelSum
                  : null
            return {
              id: `${entry.start}|${entry.end}`,
              label: formatPeriodLabel(entry.start, entry.end),
              startDate: entry.start,
              endDate: entry.end,
              globalTarget,
              targetByChannel: entry.byChannel,
            }
          })

        if (!cancelled) setPeriods(result)
      } catch {
        // silencioso — tab renderiza estado vazio
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, []) // sem dependências — carrega uma vez por montagem

  return { periods, loading }
}
