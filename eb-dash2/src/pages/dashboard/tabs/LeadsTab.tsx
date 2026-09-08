import { useState, useEffect, useMemo } from 'react'
import type { TrafegoSharedProps } from '@/pages/dashboard/DashboardPage'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { buildCampaignNameMap, buildCampaignFunnelMap } from '@/hooks/useTrafego'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

type LeadsTabProps = Pick<
  TrafegoSharedProps,
  'opps' | 'revenueRows' | 'filterOptions' | 'loading'
> & { startDate: string; initialConnectionFilter?: 'all' | 'connected' | 'not_connected' }

export function LeadsTab({
  opps,
  revenueRows,
  filterOptions,
  startDate,
  loading,
  initialConnectionFilter = 'all',
}: LeadsTabProps) {
  const [campaignFunnelMap, setCampaignFunnelMap] = useState<Map<string, string[]>>(new Map())
  const [campaignNameMap, setCampaignNameMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false

    async function loadMeta() {
      const wid = await getWorkspaceId()
      if (cancelled || !wid) return
      const campaignsRes = await supabase.from('utm_campaigns').select('utm_campaign, nome, funnels').eq('workspace_id', wid)
      if (cancelled) return
      if (!campaignsRes.error) {
        const rows = campaignsRes.data ?? []
        setCampaignNameMap(buildCampaignNameMap(rows as { utm_campaign: string | null; nome: string | null }[]))
        setCampaignFunnelMap(buildCampaignFunnelMap(rows as { utm_campaign: string | null; funnels: unknown }[]))
      }
    }

    void loadMeta()
    return () => { cancelled = true }
  }, [])

  const channelNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const ch of filterOptions.channels) {
      if (ch.slug) m.set(ch.slug, ch.nome || ch.slug)
    }
    return m
  }, [filterOptions.channels])

  return (
    <LeadsTable
      opps={opps}
      revenueRows={revenueRows}
      channelNameMap={channelNameMap}
      campaignFunnelMap={campaignFunnelMap}
      campaignNameMap={campaignNameMap}
      startDate={startDate}
      loading={loading}
      title="Leads de Tráfego Pago"
      lsKey="eb-dash2:trafego-leads-tab:columns"
      initialConnectionFilter={initialConnectionFilter}
    />
  )
}
