import { useMemo } from 'react'
import type { AquisicaoSharedProps } from '@/pages/aquisicao/AquisicaoPage'
import { LeadsTable } from '@/components/leads/LeadsTable'

type LeadsTabProps = Pick<
  AquisicaoSharedProps,
  'opps' | 'revenueRows' | 'filterOptions' | 'campaignFunnelMap' | 'campaignNameMap' | 'loading'
> & { startDate: string; initialConnectionFilter?: 'all' | 'connected' | 'not_connected' }

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
      title="Todos os Leads"
      lsKey="eb-dash2:aquisicao-leads-tab:columns"
      initialConnectionFilter={initialConnectionFilter}
    />
  )
}
