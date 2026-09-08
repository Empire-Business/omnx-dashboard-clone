/**
 * useOrganicoMeta — hook leve para carregar targets de metas orgânicas.
 *
 * Não avalia performance (sem queries de opps). Apenas carrega os valores
 * alvo cadastrados na aba Metas para a área 'organico', métrica 'mql_count'.
 *
 * Retorna:
 *   - targetByChannel: Map<utm_source, target_value> — meta por canal
 *   - globalTarget: soma das metas por canal (ou versão workspace se existir)
 */
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

interface GoalVersionRow {
  id: string
  goal_definition_id: string
  target_value: number
  period_start: string
  period_end: string
}

interface GoalDefinitionRow {
  id: string
  scope_type: string
  scope_id: string
}

export interface OrganicoMetaData {
  targetByChannel: Map<string, number>
  globalTarget: number
  loading: boolean
}

export function useOrganicoMeta(startDate: string, endDate: string): OrganicoMetaData {
  const [targetByChannel, setTargetByChannel] = useState<Map<string, number>>(new Map())
  const [globalTarget, setGlobalTarget] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const workspaceId = await getWorkspaceId()
        if (!workspaceId || cancelled) return

        // Buscar a definição da métrica organico.mql_count
        const { data: metricDef, error: metricError } = await supabase
          .from('goal_metric_definitions')
          .select('id')
          .eq('provider_key', 'organico.mql_count')
          .maybeSingle()

        if (metricError || !metricDef || cancelled) return

        // Buscar goal_definitions ativas para esta métrica no workspace
        const { data: goalDefs, error: goalDefsError } = await supabase
          .from('goal_definitions')
          .select('id, scope_type, scope_id')
          .eq('workspace_id', workspaceId)
          .eq('metric_definition_id', metricDef.id)
          .eq('is_active', true)

        if (goalDefsError || !goalDefs?.length || cancelled) {
          setTargetByChannel(new Map())
          setGlobalTarget(0)
          return
        }

        const definitionIds = goalDefs.map((d) => d.id)

        // Buscar versões com vigência que intersecta o período do filtro
        const { data: versions, error: versionsError } = await supabase
          .from('goal_versions')
          .select('id, goal_definition_id, target_value, period_start, period_end')
          .in('goal_definition_id', definitionIds)
          .lte('period_start', endDate)
          .gte('period_end', startDate)

        if (versionsError || cancelled) return

        const versionRows = (versions ?? []) as GoalVersionRow[]
        const defRows = goalDefs as GoalDefinitionRow[]

        // Mapear goal_definition_id → scope info
        const defById = new Map(defRows.map((d) => [d.id, d]))

        // Para cada definition, pegar a versão mais recente que cobre o período
        // (em caso de múltiplas versões sobrepostas, usar a de period_start mais recente)
        const bestVersionByDef = new Map<string, GoalVersionRow>()
        for (const v of versionRows) {
          const existing = bestVersionByDef.get(v.goal_definition_id)
          if (!existing || v.period_start > existing.period_start) {
            bestVersionByDef.set(v.goal_definition_id, v)
          }
        }

        // Construir mapa canal → target e calcular global
        const byChannel = new Map<string, number>()
        let workspaceTarget: number | null = null

        for (const [defId, version] of bestVersionByDef) {
          const def = defById.get(defId)
          if (!def) continue

          if (def.scope_type === 'workspace' || def.scope_id === 'global') {
            workspaceTarget = version.target_value
          } else if (def.scope_type === 'channel' && def.scope_id) {
            byChannel.set(def.scope_id, version.target_value)
          }
        }

        if (cancelled) return

        setTargetByChannel(byChannel)

        // globalTarget: se há versão workspace, usa ela; senão soma os canais
        if (workspaceTarget !== null) {
          setGlobalTarget(workspaceTarget)
        } else {
          const soma = Array.from(byChannel.values()).reduce((acc, v) => acc + v, 0)
          setGlobalTarget(soma)
        }
      } catch {
        // silencioso — gráfico renderiza sem meta
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [startDate, endDate])

  return { targetByChannel, globalTarget, loading }
}
