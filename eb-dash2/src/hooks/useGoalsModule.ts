import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  buildGoalRecords,
  evaluateGoalRecords,
  loadGoalsWorkspaceData,
  loadGoalScopeOptions,
  saveGoalVersion,
  upsertGoalSnapshot,
} from '@/lib/goals/service'
import { spToday } from '@/lib/utils/dates'
import type {
  GoalDefinition,
  GoalEditorInput,
  GoalMetricDefinition,
  GoalPerformanceResult,
  GoalRecord,
  GoalScopeOptionsMap,
  GoalSnapshot,
  GoalVersion,
} from '@/lib/goals/types'

interface GoalsModuleData {
  workspaceId: string | null
  definitions: GoalMetricDefinition[]
  goalDefinitions: GoalDefinition[]
  goalVersions: GoalVersion[]
  goalSnapshots: GoalSnapshot[]
  records: GoalRecord[]
  performances: Map<string, GoalPerformanceResult>
  scopeOptions: GoalScopeOptionsMap
  loading: boolean
  performanceLoading: boolean
  saving: boolean
  error: string | null
  refresh: () => Promise<void>
  saveGoal: (input: GoalEditorInput) => Promise<void>
}

const EMPTY_SCOPE_OPTIONS: GoalScopeOptionsMap = {
  workspace: [{ type: 'workspace', value: 'global', label: 'Global' }],
  channel: [{ type: 'workspace', value: 'global', label: 'Global' }],
  campaign: [{ type: 'workspace', value: 'global', label: 'Global' }],
  sdrUsers: [{ type: 'workspace', value: 'global', label: 'Global' }],
  closerUsers: [{ type: 'workspace', value: 'global', label: 'Global' }],
  organicChannel: [{ type: 'workspace', value: 'global', label: 'Global' }],
}

export function useGoalsModule(): GoalsModuleData {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [definitions, setDefinitions] = useState<GoalMetricDefinition[]>([])
  const [goalDefinitions, setGoalDefinitions] = useState<GoalDefinition[]>([])
  const [goalVersions, setGoalVersions] = useState<GoalVersion[]>([])
  const [goalSnapshots, setGoalSnapshots] = useState<GoalSnapshot[]>([])
  const [scopeOptions, setScopeOptions] = useState<GoalScopeOptionsMap>(EMPTY_SCOPE_OPTIONS)
  const [performances, setPerformances] = useState<Map<string, GoalPerformanceResult>>(new Map())
  const [loading, setLoading] = useState(true)
  const [performanceLoading, setPerformanceLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const persistedSnapshotKeysRef = useRef<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [workspaceData, nextScopeOptions] = await Promise.all([
        loadGoalsWorkspaceData(),
        loadGoalScopeOptions(),
      ])

      setWorkspaceId(workspaceData.workspaceId)
      setDefinitions(workspaceData.definitions)
      setGoalDefinitions(workspaceData.goalDefinitions)
      setGoalVersions(workspaceData.goalVersions)
      setGoalSnapshots(workspaceData.goalSnapshots)
      setScopeOptions(nextScopeOptions)
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : (err as { message?: string })?.message ?? 'Não foi possível carregar o módulo de metas.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const records = useMemo(
    () =>
      buildGoalRecords({
        definitions,
        goalDefinitions,
        goalVersions,
        goalSnapshots,
      }),
    [definitions, goalDefinitions, goalVersions, goalSnapshots]
  )

  useEffect(() => {
    let cancelled = false

    if (!records.length) {
      setPerformances(new Map())
      return
    }

    setPerformanceLoading(true)

    void evaluateGoalRecords(records)
      .then((nextPerformances) => {
        if (cancelled) return
        setPerformances(nextPerformances)
      })
      .catch((err) => {
        if (cancelled) return
        const message =
          err instanceof Error
            ? err.message
            : (err as { message?: string })?.message ?? 'Não foi possível calcular o acompanhamento das metas.'
        setError(message)
      })
      .finally(() => {
        if (!cancelled) setPerformanceLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [records])

  useEffect(() => {
    const today = spToday()
    const activeRecords = records.filter((record) => {
      const version = record.preferredVersion
      return version && version.period_start <= today && version.period_end >= today
    })

    if (!activeRecords.length || performances.size === 0) return

    let cancelled = false

    void (async () => {
      for (const record of activeRecords) {
        const version = record.preferredVersion
        if (!version) continue
        const performance = performances.get(version.id)
        if (!performance) continue

        const snapshotKey = `${version.id}:${today}`
        if (persistedSnapshotKeysRef.current.has(snapshotKey)) continue
        if (performance.status === 'scheduled') continue

        try {
          await upsertGoalSnapshot({
            goalVersionId: version.id,
            snapshotDate: today,
            performance,
          })

          if (cancelled) return

          persistedSnapshotKeysRef.current.add(snapshotKey)
          setGoalSnapshots((prev) => {
            const nextSnapshot: GoalSnapshot = {
              id: snapshotKey,
              goal_version_id: version.id,
              snapshot_date: today,
              actual_value: performance.actualValue,
              ideal_value: performance.idealValue,
              projected_value: performance.projectionValue,
              status: performance.status,
              payload: {
                details: performance.details,
                warning: performance.warning ?? null,
                progressPct: performance.progressPct,
              },
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }

            const withoutCurrent = prev.filter(
              (snapshot) =>
                !(
                  snapshot.goal_version_id === version.id &&
                  snapshot.snapshot_date === today
                )
            )

            return [nextSnapshot, ...withoutCurrent]
          })
        } catch {
          // Snapshot é auditoria auxiliar. Falha de persistência não deve quebrar a tela.
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [performances, records])

  const saveGoal = useCallback(
    async (input: GoalEditorInput) => {
      setSaving(true)
      setError(null)

      try {
        await saveGoalVersion(input)
        await refresh()
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : (err as { message?: string })?.message ?? 'Não foi possível salvar a meta.'
        setError(message)
        throw err instanceof Error ? err : new Error(message)
      } finally {
        setSaving(false)
      }
    },
    [refresh]
  )

  return {
    workspaceId,
    definitions,
    goalDefinitions,
    goalVersions,
    goalSnapshots,
    records,
    performances,
    scopeOptions,
    loading,
    performanceLoading,
    saving,
    error,
    refresh,
    saveGoal,
  }
}
