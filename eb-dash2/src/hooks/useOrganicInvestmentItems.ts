import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

// ─── Types ────────────────────────────────────────────────────

export type InvestmentCategory = 'social_media' | 'design' | 'video' | 'copywriter' | 'other'
export type InvestmentRecurrence = 'monthly' | 'once'

export interface OrganicInvestmentItem {
  id: string
  workspace_id: string
  name: string
  category: InvestmentCategory
  utm_source: string | null   // null = aplica a todos os canais orgânicos
  recurrence: InvestmentRecurrence
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export const CATEGORY_LABELS: Record<InvestmentCategory, string> = {
  social_media: 'Social Media',
  design:       'Design',
  video:        'Vídeo',
  copywriter:   'Copywriter',
  other:        'Outro',
}

export const CATEGORY_COLORS: Record<InvestmentCategory, { bg: string; text: string }> = {
  social_media: { bg: 'rgba(99,102,241,0.12)', text: '#6366f1' },
  design:       { bg: 'rgba(236,72,153,0.12)', text: '#ec4899' },
  video:        { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b' },
  copywriter:   { bg: 'rgba(20,184,166,0.12)', text: '#14b8a6' },
  other:        { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
}

// ─── Hook ─────────────────────────────────────────────────────

export interface UseOrganicInvestmentItemsResult {
  items: OrganicInvestmentItem[]
  loading: boolean
  workspaceId: string
  refetch: () => void
}

export function useOrganicInvestmentItems(): UseOrganicInvestmentItemsResult {
  const [items, setItems] = useState<OrganicInvestmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [workspaceId, setWorkspaceId] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        const wid = await getWorkspaceId()
        if (!wid || cancelled) return
        setWorkspaceId(wid)

        const { data, error } = await supabase
          .from('organic_investment_items')
          .select('*')
          .eq('workspace_id', wid)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true })

        if (cancelled) return
        if (error) throw error
        setItems((data ?? []) as OrganicInvestmentItem[])
      } catch (err) {
        if (!cancelled) console.error('[useOrganicInvestmentItems]', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [tick])

  const refetch = () => setTick((t) => t + 1)

  return { items, loading, workspaceId, refetch }
}
