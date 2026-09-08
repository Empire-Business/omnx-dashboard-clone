import { useState, useEffect } from 'react'
import {
  loadLegacyMetasFromGoals,
} from '@/lib/goals/service'
import { spToday } from '@/lib/utils/dates'

export interface Meta {
  id: string
  workspace_id: string
  tipo: string
  referencia: string
  valor: number
  periodo: string
  periodo_inicio: string
  periodo_fim: string
}

export interface MetasData {
  metas: Meta[]
  loading: boolean
}

function normalizeReference(value: string): string {
  return value.trim()
}

function compareAsc(a: string, b: string): number {
  return a.localeCompare(b)
}

export function sortMetas(metas: Meta[]): Meta[] {
  return [...metas].sort((a, b) => {
    const typeCmp = compareAsc(a.tipo, b.tipo)
    if (typeCmp !== 0) return typeCmp
    const refCmp = compareAsc(normalizeReference(a.referencia), normalizeReference(b.referencia))
    if (refCmp !== 0) return refCmp
    const startCmp = compareAsc(a.periodo_inicio, b.periodo_inicio)
    if (startCmp !== 0) return startCmp
    return compareAsc(a.periodo_fim, b.periodo_fim)
  })
}

export function getMetasByReference(metas: Meta[], tipo: string, referencia: string): Meta[] {
  const ref = normalizeReference(referencia)
  return metas.filter((meta) => meta.tipo === tipo && normalizeReference(meta.referencia) === ref)
}

export function findMetaByExactPeriod(
  metas: Meta[],
  tipo: string,
  referencia: string,
  periodoInicio: string,
  periodoFim: string
): Meta | null {
  return (
    getMetasByReference(metas, tipo, referencia).find(
      (meta) =>
        meta.periodo_inicio === periodoInicio &&
        meta.periodo_fim === periodoFim
    ) ?? null
  )
}

export function getActiveMeta(
  metas: Meta[],
  tipo: string,
  referencia: string,
  today: string = spToday()
): Meta | null {
  const scoped = getMetasByReference(metas, tipo, referencia)
  if (!scoped.length) return null

  const current = scoped
    .filter((meta) => meta.periodo_inicio <= today && meta.periodo_fim >= today)
    .sort((a, b) => b.periodo_inicio.localeCompare(a.periodo_inicio))
  if (current.length > 0) return current[0]

  const future = scoped
    .filter((meta) => meta.periodo_inicio > today)
    .sort((a, b) => a.periodo_inicio.localeCompare(b.periodo_inicio))
  if (future.length > 0) return future[0]

  return scoped
    .filter((meta) => meta.periodo_fim < today)
    .sort((a, b) => b.periodo_fim.localeCompare(a.periodo_fim))[0] ?? null
}

export function isMetaRangeEqual(
  meta: Pick<Meta, 'periodo_inicio' | 'periodo_fim'> | null | undefined,
  startDate: string,
  endDate: string
): boolean {
  return !!meta && meta.periodo_inicio === startDate && meta.periodo_fim === endDate
}

export function useMetas(): MetasData {
  const [metas, setMetas] = useState<Meta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const legacyMetas = await loadLegacyMetasFromGoals()

        if (cancelled) return

        setMetas(sortMetas(legacyMetas as Meta[]))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [])

  return { metas, loading }
}
