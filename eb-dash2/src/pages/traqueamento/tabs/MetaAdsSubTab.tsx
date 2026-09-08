import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Megaphone } from 'lucide-react'

type CampaignMetrics = {
  campaign_id: string
  campaign_name: string | null
  total_spend: number
  total_impressions: number
  total_clicks: number
  total_leads: number
  avg_ctr: number
  avg_cpc: number
  days_active: number
  last_date: string | null
}

function fmtMoney(val: number): string {
  if (val === 0) return 'R$ 0'
  return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtNumber(val: number): string {
  return val.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

function fmtPct(val: number): string {
  return `${(val * 100).toFixed(2)}%`
}

export function MetaAdsSubTab() {
  const [campaigns, setCampaigns] = useState<CampaignMetrics[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }

    const { data, error } = await supabase.rpc('get_meta_ads_campaign_metrics', {
      p_workspace_id: workspaceId,
      p_days: 30,
    })

    if (error) {
      console.error('Erro ao carregar métricas Meta:', error)
    } else {
      setCampaigns((data ?? []) as CampaignMetrics[])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const totalSpend = campaigns.reduce((sum, c) => sum + c.total_spend, 0)
  const totalImpressions = campaigns.reduce((sum, c) => sum + c.total_impressions, 0)
  const totalClicks = campaigns.reduce((sum, c) => sum + c.total_clicks, 0)
  const totalLeads = campaigns.reduce((sum, c) => sum + c.total_leads, 0)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-empire-void">Meta Ads</h2>
          <p className="text-sm text-empire-muted">Dados reais da Meta — últimos 30 dias</p>
        </div>
        <Badge variant="gold">V1</Badge>
      </div>

      {!loading && campaigns.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card variant="glowing"><CardContent className="p-4"><p className="text-xs text-empire-subtle">Investimento</p><p className="text-xl font-bold text-empire-void">{fmtMoney(totalSpend)}</p></CardContent></Card>
          <Card variant="glowing"><CardContent className="p-4"><p className="text-xs text-empire-subtle">Impressões</p><p className="text-xl font-bold text-empire-void">{fmtNumber(totalImpressions)}</p></CardContent></Card>
          <Card variant="glowing"><CardContent className="p-4"><p className="text-xs text-empire-subtle">Cliques</p><p className="text-xl font-bold text-empire-void">{fmtNumber(totalClicks)}</p></CardContent></Card>
          <Card variant="glowing"><CardContent className="p-4"><p className="text-xs text-empire-subtle">Leads</p><p className="text-xl font-bold text-empire-void">{fmtNumber(totalLeads)}</p></CardContent></Card>
        </div>
      )}

      <Card variant="glowing">
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[calc(100vh-380px)]">
            <Table>
              <TableHeader className="border-b border-empire-border sticky top-0 z-20 bg-empire-elevated">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs min-w-[220px]">Campanha</TableHead>
                  <TableHead className="text-xs text-right min-w-[80px]">Investimento</TableHead>
                  <TableHead className="text-xs text-right min-w-[80px]">Impressões</TableHead>
                  <TableHead className="text-xs text-right min-w-[60px]">Cliques</TableHead>
                  <TableHead className="text-xs text-right min-w-[50px]">CTR</TableHead>
                  <TableHead className="text-xs text-right min-w-[50px]">CPC</TableHead>
                  <TableHead className="text-xs text-right min-w-[50px]">Leads</TableHead>
                  <TableHead className="text-xs text-right min-w-[60px]">Dias ativo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : campaigns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState icon={Megaphone} title="Nenhuma campanha" description="Os dados da Meta Ads aparecerão aqui após a próxima sincronização (a cada 1h)." />
                    </TableCell>
                  </TableRow>
                ) : (
                  campaigns.map((c) => (
                    <TableRow key={c.campaign_id} className="transition-colors hover:bg-empire-hover">
                      <TableCell className="text-sm font-medium text-empire-void">{c.campaign_name || c.campaign_id}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtMoney(c.total_spend)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtNumber(c.total_impressions)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtNumber(c.total_clicks)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtPct(c.avg_ctr)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtMoney(c.avg_cpc)}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums">{fmtNumber(c.total_leads)}</TableCell>
                      <TableCell className="text-right text-xs text-empire-muted">{c.days_active}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {!loading && campaigns.length > 0 && (
            <div className="flex items-center justify-between border-t border-empire-border px-4 py-2 text-xs text-empire-subtle">
              <span>{campaigns.length} campanhas</span>
              <span>Última atualização: via sync automático (1h)</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
