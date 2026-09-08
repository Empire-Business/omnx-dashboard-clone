import { useMemo } from 'react'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import type { OrganicoFilterOptions } from '@/hooks/useOrganico'
import { LeadsTable } from '@/components/leads/LeadsTable'

interface LeadsTabProps {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  filterOptions: OrganicoFilterOptions
  campaignFunnelMap: Map<string, string[]>
  campaignNameMap: Map<string, string>
  startDate: string
  loading: boolean
  initialConnectionFilter?: 'all' | 'connected' | 'not_connected'
}

export function LeadsTab({
  opps,
  revenueRows,
  filterOptions,
  campaignFunnelMap,
  campaignNameMap,
  startDate,
  loading,
  initialConnectionFilter = 'all',
}: LeadsTabProps) {
  const channelNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const ch of filterOptions.allChannels) {
      if (ch.slug) m.set(ch.slug, ch.nome || ch.slug)
    }
    return m
  }, [filterOptions.allChannels])

  return (
    <LeadsTable
      opps={opps}
      revenueRows={revenueRows}
      channelNameMap={channelNameMap}
      campaignFunnelMap={campaignFunnelMap}
      campaignNameMap={campaignNameMap}
      startDate={startDate}
      loading={loading}
      title="Leads Orgânicos"
      lsKey="eb-dash2:organico-leads-tab:columns"
      initialConnectionFilter={initialConnectionFilter}
    />
  )
}
