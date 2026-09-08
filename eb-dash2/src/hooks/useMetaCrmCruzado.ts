import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface MetaCrmRow {
  utm_campaign: string
  investimento_meta: number
  impressoes: number
  cliques: number
  leads_meta: number
  leads_crm: number
  mqls_crm: number
  reunioes: number
  fechamentos: number
  cpl_meta: number | null
  cpl_crm: number | null
}

export function useMetaCrmCruzado(
  workspaceId: string | null,
  startDate: string | null,
  endDate: string | null,
) {
  // Última resposta da RPC (sucesso ou erro) — data/loading/error derivam deste estado
  const [result, setResult] = useState<{
    key: string
    data: MetaCrmRow[]
    error: string | null
  } | null>(null)

  // Chave do fetch atual: null quando workspace/datas não estão completos
  const key = workspaceId && startDate && endDate ? `${workspaceId}|${startDate}|${endDate}` : null

  useEffect(() => {
    if (key === null || workspaceId === null || startDate === null || endDate === null) return
    let cancelled = false

    supabase
      .rpc('analisar_meta_crm_cruzado', {
        p_workspace_id: workspaceId,
        p_start_date: startDate,
        p_end_date: endDate,
      })
      .then(({ data: rows, error: err }) => {
        if (cancelled) return
        setResult((prev) => ({
          key,
          // Em erro, preserva os dados anteriores (comportamento original)
          data: err ? (prev?.data ?? []) : ((rows ?? []) as MetaCrmRow[]),
          error: err ? err.message : null,
        }))
      })

    return () => {
      cancelled = true
    }
  }, [key, startDate, endDate])

  // Estado derivado: datas incompletas → vazio; fetch da chave atual pendente → loading
  const data = key === null ? [] : (result?.data ?? [])
  const loading = key !== null && result?.key !== key
  const error =
    key === null
      ? (result?.error ?? null)
      : result?.key === key
        ? (result?.error ?? null)
        : null

  return { data, loading, error }
}
