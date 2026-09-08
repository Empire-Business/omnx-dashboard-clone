import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

// ─── Types ────────────────────────────────────────────────────

export interface OrganicInvestment {
  id: string
  workspace_id: string
  item_id: string | null
  period_start: string   // DATE "YYYY-MM-DD"
  period_end: string     // DATE "YYYY-MM-DD"
  year_month: string     // gerado "YYYY-MM"
  utm_source: string | null
  amount: number
  description: string | null
  created_at: string
  updated_at: string
}

// Map<item_id, Map<year_month, OrganicInvestment>>
export type InvestmentGridMap = Map<string, Map<string, OrganicInvestment>>

export interface UseOrganicInvestmentsResult {
  investments: OrganicInvestment[]
  gridMap: InvestmentGridMap
  loading: boolean
  refetch: () => void
}

// ─── Pure helpers ──────────────────────────────────────────────

function overlaps(inv: OrganicInvestment, startDate: string, endDate: string): boolean {
  return inv.period_start <= endDate && inv.period_end >= startDate
}

/**
 * Soma os investimentos orgânicos compatíveis com o período e filtro de canal.
 *
 * @param investments   - Lista bruta de investimentos
 * @param startDate     - Início do período do filtro (YYYY-MM-DD)
 * @param endDate       - Fim do período do filtro (YYYY-MM-DD)
 * @param activeChannels - null = sem filtro (soma tudo); string[] = canais selecionados
 *                         Investimentos com utm_source=null (gerais) entram SEMPRE.
 */
export function computeOrganicInvestment(
  investments: OrganicInvestment[],
  startDate: string,
  endDate: string,
  activeChannels: string[] | null = null
): number {
  let total = 0
  for (const inv of investments) {
    if (!overlaps(inv, startDate, endDate)) continue
    if (inv.utm_source === null) {
      total += inv.amount  // geral: sempre soma
      continue
    }
    if (activeChannels === null) {
      total += inv.amount  // sem filtro: soma tudo
    } else if (activeChannels.includes(inv.utm_source)) {
      total += inv.amount  // canal específico: só soma se estiver no filtro
    }
  }
  return total
}

// ─── Hook ─────────────────────────────────────────────────────

export function useOrganicInvestments(): UseOrganicInvestmentsResult {
  const [investments, setInvestments] = useState<OrganicInvestment[]>([])
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        const wid = await getWorkspaceId()
        if (!wid || cancelled) return

        const { data, error } = await supabase
          .from('organic_investments')
          .select('id, workspace_id, item_id, period_start, period_end, year_month, utm_source, amount, description, created_at, updated_at')
          .eq('workspace_id', wid)
          .order('period_start', { ascending: false })

        if (cancelled) return
        if (error) throw error
        setInvestments((data ?? []) as OrganicInvestment[])
      } catch (err) {
        if (!cancelled) console.error('[useOrganicInvestments]', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [tick])

  const refetch = () => setTick((t) => t + 1)

  // Build gridMap: item_id → year_month → investment entry
  const gridMap: InvestmentGridMap = new Map()
  for (const inv of investments) {
    if (!inv.item_id) continue
    if (!gridMap.has(inv.item_id)) gridMap.set(inv.item_id, new Map())
    gridMap.get(inv.item_id)!.set(inv.year_month, inv)
  }

  return { investments, gridMap, loading, refetch }
}
