import { useState, useMemo, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import {
  computeMetaKpis,
  computeRevenueKpis,
  applyMqlFilter,
  applyAttributionFilters,
  computeFunnel,
  computeAvgCycle,
  computeClosingCycle,
  buildPaymentDateMap,
  buildRevenueMap,
  computeIdealDia,
  computeCostMqlIdealDia,
  computeCostPerMqlSeries,
  isMqlByTag,
  countUniqueMqls,
  filterUniqueMqls,
  buildCampaignFunnelMap,
  buildCampaignNameMap,
  loadTrafegoDataset,
} from '@/hooks/useTrafego'
import type { TrafegoDataset, OppRow, MetaRow } from '@/hooks/useTrafego'
import { tsToSPDate } from '@/lib/utils/dates'
import { InvestimentoCpmqlChart } from '@/components/dashboard/InvestimentoCpmqlChart'
import type { DailyPoint } from '@/components/dashboard/InvestimentoCpmqlChart'
import { computeProducao } from '@/hooks/useProducao'
import {
  findMetaByExactPeriod,
  getActiveMeta,
  useMetas,
} from '@/hooks/useMetas'
import { MetaTrackingCard } from '@/components/metas/MetaTrackingCard'
import { LeadListModal } from '@/components/leads/LeadCard'
import {
  SectionHeader,
  KpiCard,
  FunnelViz,
  DonutChart,
} from '@/components/dashboard'
import {
  DollarSign,
  TrendingUp,
  BarChart2,
  Clock,
  AlertTriangle,
  Crosshair,
  ShoppingCart,
  Target,
  Percent,
  BadgeCheck,
  CalendarCheck2,
  Link2,
  Users,
  UserX,
  Video,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import type { TrafegoSharedProps } from '../DashboardPage'
import { useMetaCrmCruzado } from '@/hooks/useMetaCrmCruzado'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Formatting helpers ───────────────────────────────────────
function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

function fmtCurrencyCompact(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v)
}

function fmtNumber(v: number) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(v))
}
function cpe(spend: number, count: number): string | undefined {
  if (spend <= 0 || count <= 0) return undefined
  return fmtCurrencyCompact(spend / count)
}

type SalesMetric = 'count' | 'faturamento' | 'caixa'

function isDateInPeriod(dateStr: string | null | undefined, startDate: string, endDate: string): boolean {
  return !!dateStr && dateStr >= startDate && dateStr <= endDate
}

function extractCreativeId(utmTerm: string): string | null {
  const match = utmTerm.match(/(CR|AN)-(\d+)/)
  return match ? `${match[1]}-${match[2]}` : null
}

// ─── computeDailyPoints ───────────────────────────────────────
// Calcula investimento, MQLs e CPMQL por dia para o gráfico dual-eixo.
function computeDailyPoints(
  metaRows: MetaRow[],
  opps: OppRow[],
  startDate: string,
  endDate: string,
): DailyPoint[] {
  // 1. Agrupar spend por data (metaRows já têm date YYYY-MM-DD)
  const spendByDate = new Map<string, number>()
  for (const row of metaRows) {
    if (!row.date) continue
    spendByDate.set(row.date, (spendByDate.get(row.date) ?? 0) + (row.spend ?? 0))
  }

  // 2. Agrupar MQLs por data de recebimento (TIMESTAMPTZ → SP date)
  const mqlsByDate = new Map<string, number>()
  for (const opp of opps) {
    if (!isMqlByTag(opp.contatos)) continue
    if (!opp.data_lead_recebido) continue
    const d = tsToSPDate(opp.data_lead_recebido)
    mqlsByDate.set(d, (mqlsByDate.get(d) ?? 0) + 1)
  }

  // 3. Iterar cada dia do intervalo
  const points: DailyPoint[] = []
  const cur = new Date(`${startDate}T12:00:00`)
  const end = new Date(`${endDate}T12:00:00`)
  while (cur <= end) {
    const date = cur.toLocaleDateString('sv-SE') // YYYY-MM-DD
    const spend = spendByDate.get(date) ?? 0
    const mqls = mqlsByDate.get(date) ?? 0
    const cpmql = spend > 0 && mqls > 0 ? spend / mqls : 0
    points.push({ date, spend, mqls, cpmql, ma7cpmql: null })
    cur.setDate(cur.getDate() + 1)
  }

  // 4. Calcular MA7 (média móvel 7 dias de cpmql — apenas dias com dados)
  for (let i = 0; i < points.length; i++) {
    const window = points.slice(Math.max(0, i - 6), i + 1).filter((p) => p.cpmql > 0)
    if (window.length >= 2) {
      points[i].ma7cpmql = window.reduce((s, p) => s + p.cpmql, 0) / window.length
    }
  }

  return points
}

// ─── Main Component ───────────────────────────────────────────
export function TrafegoTab({
  filters,
  activePanel,
  opps,
  metaRows,
  accountDailyRows,
  revenueRows,
  filterOptions,
  loading,
  error,
  missingPageCodeFunnel,
  producaoOppsRaw,
  producaoRevenueRows,
  recuperacaoMode,
}: TrafegoSharedProps) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false,
    title: '',
    leads: [],
  })
  const [salesMetric, setSalesMetric] = useState<SalesMetric>('count')
  const [showMetaCrm, setShowMetaCrm] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void getWorkspaceId().then((wid) => {
      if (!cancelled) setWorkspaceId(wid ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const { data: metaCrmData, loading: metaCrmLoading, error: metaCrmError } = useMetaCrmCruzado(
    workspaceId,
    filters.startDate ?? null,
    filters.endDate ?? null,
  )

  const { metas } = useMetas()
  const [metaRangeData, setMetaRangeData] = useState<Record<string, TrafegoDataset>>({})
  const [metaRangeLoading, setMetaRangeLoading] = useState(false)

  // ── Meta goals ───────────────────────────────────────────
  const activeMqlMeta = useMemo(
    () => getActiveMeta(metas, 'mql_count_trafego', 'global'),
    [metas],
  )
  const activeCostMeta = useMemo(
    () => getActiveMeta(metas, 'custo_mql_trafego', 'global'),
    [metas],
  )
  const costBasisMqlMeta = useMemo(
    () =>
      activeCostMeta
        ? findMetaByExactPeriod(
            metas,
            'mql_count_trafego',
            'global',
            activeCostMeta.periodo_inicio,
            activeCostMeta.periodo_fim,
          )
        : null,
    [metas, activeCostMeta],
  )

  const metaRanges = useMemo(() => {
    const ranges = new Map<string, { startDate: string; endDate: string }>()
    const addRange = (s: string, e: string) => ranges.set(`${s}|${e}`, { startDate: s, endDate: e })
    if (activeMqlMeta) addRange(activeMqlMeta.periodo_inicio, activeMqlMeta.periodo_fim)
    if (activeCostMeta) addRange(activeCostMeta.periodo_inicio, activeCostMeta.periodo_fim)
    return Array.from(ranges.values())
  }, [activeMqlMeta, activeCostMeta])

  useEffect(() => {
    let cancelled = false
    if (!metaRanges.length) return () => { cancelled = true }

    void (async () => {
      setMetaRangeLoading(true)
      try {
        const results = await Promise.all(
          metaRanges.map(async (range) => ({
            key: `${range.startDate}|${range.endDate}`,
            dataset: await loadTrafegoDataset(
              { ...filters, startDate: range.startDate, endDate: range.endDate },
              recuperacaoMode,
            ),
          })),
        )
        if (cancelled) return
        const next: Record<string, TrafegoDataset> = {}
        results.forEach((r) => { next[r.key] = r.dataset })
        setMetaRangeData(next)
      } catch (err) {
        if (!cancelled) {
          console.error('[TrafegoTab] metaRange load error', err)
          setMetaRangeData({})
        }
      } finally {
        if (!cancelled) setMetaRangeLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [filters, metaRanges, recuperacaoMode])

  // ── Computed data ────────────────────────────────────────
  const filteredOpps = useMemo(() => applyMqlFilter(opps, filters.mqlFilter), [opps, filters.mqlFilter])
  const filteredOppIds = useMemo(() => new Set(filteredOpps.map((o) => o.id)), [filteredOpps])
  const filteredRevenueRows = useMemo(
    () => revenueRows.filter((r) => filteredOppIds.has(r.oportunidade_id)),
    [revenueRows, filteredOppIds],
  )
  const paymentDateMap = useMemo(() => buildPaymentDateMap(filteredRevenueRows), [filteredRevenueRows])
  const producaoPaymentDateMap = useMemo(() => buildPaymentDateMap(producaoRevenueRows), [producaoRevenueRows])
  // Caixa = recebido dentro do período (soma o cronograma), igual aos KPIs.
  const periodoCaixa = useMemo(
    () => ({ startDate: filters.startDate, endDate: filters.endDate }),
    [filters.startDate, filters.endDate],
  )
  const revenueMap = useMemo(() => buildRevenueMap(filteredRevenueRows, periodoCaixa), [filteredRevenueRows, periodoCaixa])
  const producaoRevenueMap = useMemo(() => buildRevenueMap(producaoRevenueRows, periodoCaixa), [producaoRevenueRows, periodoCaixa])

  // Produtividade
  const producaoOpps = useMemo(
    () => applyAttributionFilters(applyMqlFilter(producaoOppsRaw, filters.mqlFilter), filters.sdrs, filters.closers),
    [producaoOppsRaw, filters.mqlFilter, filters.sdrs, filters.closers],
  )
  const { rows: producaoRows, totals: producaoTotals } = useMemo(
    () => computeProducao(producaoOpps, producaoRevenueRows, filters.startDate, filters.endDate),
    [producaoOpps, producaoRevenueRows, filters.startDate, filters.endDate],
  )

  // KPIs
  const metaKpis = useMemo(() => computeMetaKpis(metaRows, accountDailyRows), [metaRows, accountDailyRows])
  const revenueKpis = useMemo(() => computeRevenueKpis(filteredRevenueRows, periodoCaixa), [filteredRevenueRows, periodoCaixa])
  const funnelSteps = useMemo(() => computeFunnel(filteredOpps, paymentDateMap), [filteredOpps, paymentDateMap])

  const producaoRevenueKpis = useMemo(() => {
    // Filtra producaoRevenueRows pelas oportunidades em producaoOpps (respeita mqlFilter)
    // para garantir que valorFaturado e valorEntrada sempre venham do mesmo conjunto de linhas.
    const ids = new Set(producaoOpps.map((o) => o.id))
    return computeRevenueKpis(producaoRevenueRows.filter((r) => ids.has(r.oportunidade_id)), periodoCaixa)
  }, [producaoOpps, producaoRevenueRows, periodoCaixa])
  const activeRevenueKpis = activePanel === 'produtividade' ? producaoRevenueKpis : revenueKpis

  const producaoLeadsInPeriod = useMemo(
    () => producaoOpps.filter((o) => isDateInPeriod(o.data_lead_recebido?.slice(0, 10) ?? null, filters.startDate, filters.endDate)),
    [producaoOpps, filters.startDate, filters.endDate],
  )
  // Unico por contato: MQL e tag do contato, entao o mesmo lead com 2 oportunidades
  // nao pode contar (nem aparecer) duas vezes.
  const producaoMqlsInPeriod = useMemo(
    () => filterUniqueMqls(producaoLeadsInPeriod),
    [producaoLeadsInPeriod],
  )
  const cohortNaoConectados = useMemo(
    () => filteredOpps.filter((o) => !o.data_conectado),
    [filteredOpps],
  )
  const produtividadeNaoConectados = useMemo(
    () => producaoLeadsInPeriod.filter((o) => !o.data_conectado),
    [producaoLeadsInPeriod],
  )
  // No-shows: cohort = leads do período que deram no-show (qualquer data);
  // produtividade = no-shows que aconteceram no período (independente da entrada do lead)
  const cohortNoShows = useMemo(() => filteredOpps.filter((o) => !!o.data_no_show), [filteredOpps])
  const producaoNoShows = useMemo(
    () => producaoOpps.filter((o) => isDateInPeriod(o.data_no_show, filters.startDate, filters.endDate)),
    [producaoOpps, filters.startDate, filters.endDate],
  )
  const mqlBaseOpps = activePanel === 'produtividade' ? producaoLeadsInPeriod : filteredOpps
  const salesBaseOpps = useMemo(
    () => {
      if (activePanel === 'produtividade') {
        return producaoRows.flatMap((row) => row.leads_fechados)
      }
      return filteredOpps.filter((o) => paymentDateMap.has(o.id))
    },
    [activePanel, producaoRows, filteredOpps, paymentDateMap],
  )
  const reunioesBaseOpps = useMemo(
    () => {
      if (activePanel === 'produtividade') {
        return producaoRows.flatMap((row) => row.leads_reunioes)
      }
      return filteredOpps.filter((o) => o.data_realizacao_vendas)
    },
    [activePanel, producaoRows, filteredOpps],
  )

  // Avg cycle
  const avgCycle = useMemo(() => {
    if (activePanel === 'produtividade') {
      const s = filters.startDate
      const e = filters.endDate
      const closedInPeriod = producaoOpps.filter((o) => {
        const payDate = producaoPaymentDateMap.get(o.id)
        return payDate && payDate >= s && payDate <= e
      })
      return computeAvgCycle(closedInPeriod, producaoPaymentDateMap)
    }
    return computeAvgCycle(filteredOpps, paymentDateMap)
  }, [activePanel, filteredOpps, producaoOpps, filters.startDate, filters.endDate, paymentDateMap, producaoPaymentDateMap])

  // Closing cycle (data_realizacao_vendas → data_pagamento_entrada)
  const closingCycle = useMemo(() => {
    if (activePanel === 'produtividade') {
      const s = filters.startDate
      const e = filters.endDate
      const closedInPeriod = producaoOpps.filter((o) => {
        const payDate = producaoPaymentDateMap.get(o.id)
        return payDate && payDate >= s && payDate <= e
      })
      return computeClosingCycle(closedInPeriod, producaoPaymentDateMap)
    }
    return computeClosingCycle(filteredOpps, paymentDateMap)
  }, [activePanel, filteredOpps, producaoOpps, filters.startDate, filters.endDate, paymentDateMap, producaoPaymentDateMap])

  // Meta-derived KPIs
  const mqlCount = activePanel === 'produtividade'
    ? producaoMqlsInPeriod.length
    : funnelSteps.find((s) => s.key === 'mql')?.count ?? 0
  const custoPorMql = metaKpis.spend > 0 && mqlCount > 0 ? metaKpis.spend / mqlCount : 0
  const mqlMetaKey = activeMqlMeta ? `${activeMqlMeta.periodo_inicio}|${activeMqlMeta.periodo_fim}` : null
  const costMetaKey = activeCostMeta ? `${activeCostMeta.periodo_inicio}|${activeCostMeta.periodo_fim}` : null
  const mqlMetaDataset = mqlMetaKey ? metaRangeData[mqlMetaKey] : null
  const costMetaDataset = costMetaKey ? metaRangeData[costMetaKey] : null

  const mqlCountForGoal = activeMqlMeta
    ? (mqlMetaDataset ? countUniqueMqls(mqlMetaDataset.opps) : 0)
    : mqlCount
  const mqlIdealDia = activeMqlMeta
    ? computeIdealDia({
        startDate: activeMqlMeta.periodo_inicio,
        endDate: activeMqlMeta.periodo_fim,
        meta: activeMqlMeta.valor,
        atual: mqlCountForGoal,
      })
    : undefined
  const mqlMetaSeries = useMemo(
    () =>
      activeMqlMeta
        ? computeCostPerMqlSeries(
            mqlMetaDataset?.metaRows ?? [],
            mqlMetaDataset?.opps ?? [],
            activeMqlMeta.periodo_inicio,
            activeMqlMeta.periodo_fim,
          )
        : computeCostPerMqlSeries(
            metaRows,
            mqlBaseOpps,
            filters.startDate,
            filters.endDate,
          ),
    [activeMqlMeta, mqlMetaDataset, metaRows, mqlBaseOpps, filters.startDate, filters.endDate],
  )

  const costMetaRowsForCard = useMemo(
    () => (activeCostMeta ? (costMetaDataset?.metaRows ?? []) : metaRows),
    [activeCostMeta, costMetaDataset, metaRows],
  )
  const costOppsForCard = useMemo(
    () => (
      activeCostMeta
        ? (costMetaDataset?.opps ?? [])
        : mqlBaseOpps
    ),
    [activeCostMeta, costMetaDataset, mqlBaseOpps],
  )
  const costMetaKpis = useMemo(() => computeMetaKpis(costMetaRowsForCard), [costMetaRowsForCard])
  const costMqlCount = useMemo(
    () => countUniqueMqls(costOppsForCard),
    [costOppsForCard],
  )
  const custoPorMqlMetaCard =
    costMetaKpis.spend > 0 && costMqlCount > 0 ? costMetaKpis.spend / costMqlCount : 0
  const costIdealDia =
    activeCostMeta && costBasisMqlMeta
      ? computeCostMqlIdealDia({
          startDate: activeCostMeta.periodo_inicio,
          endDate: activeCostMeta.periodo_fim,
          costMeta: activeCostMeta.valor,
          mqlMeta: costBasisMqlMeta.valor,
          atualSpend: costMetaKpis.spend,
          atualMqls: costMqlCount,
        })
      : null

  // ROAS
  const roas =
    activeRevenueKpis.valorFaturado > 0 && metaKpis.spend > 0
      ? activeRevenueKpis.valorFaturado / metaKpis.spend
      : 0
  const roasCaixa =
    activeRevenueKpis.valorEntrada > 0 && metaKpis.spend > 0
      ? activeRevenueKpis.valorEntrada / metaKpis.spend
      : 0

  // Sales
  const salesCount = useMemo(() => {
    if (activePanel === 'produtividade') {
      return salesBaseOpps.length
    }
    return salesBaseOpps.length
  }, [activePanel, salesBaseOpps])

  const cpv = metaKpis.spend > 0 && salesCount > 0 ? metaKpis.spend / salesCount : 0

  // ── Agendamentos por origem (IA vs humano) ────────────────────────────
  // ── Pie chart data: funnel names + campaign map + creative names ───────
  const [campaignFunnelMap, setCampaignFunnelMap] = useState<Map<string, string[]>>(new Map())
  const [campaignNameMap, setCampaignNameMap] = useState<Map<string, string>>(new Map())
  const [creativeMap, setCreativeMap] = useState<Map<string, string>>(new Map())
  const [creativeAdUrlMap, setCreativeAdUrlMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const wid = await getWorkspaceId()
      if (cancelled || !wid) return
      const [campaignsRes, creativesRes, permalinksRes] = await Promise.all([
        supabase.from('utm_campaigns').select('nome, utm_campaign, funnels').eq('workspace_id', wid),
        supabase.from('notion_creatives').select('external_id, name, final_asset_url').eq('workspace_id', wid).eq('database_type', 'paid'),
        supabase.from('meta_ads_permalinks').select('creative_code, instagram_permalink_url, permalink_url').eq('workspace_id', wid).not('creative_code', 'is', null),
      ])
      if (cancelled) return
      setCampaignFunnelMap(
        buildCampaignFunnelMap(
          (campaignsRes.data ?? []) as { utm_campaign: string | number | null; funnels: unknown }[]
        )
      )
      setCampaignNameMap(
        buildCampaignNameMap(
          (campaignsRes.data ?? []) as { utm_campaign: string | number | null; nome: string | null }[]
        )
      )
      type CreativeRow = {
        external_id: string | null
        name: string | null
        final_asset_url: string | null
      }
      const creatives = (creativesRes.data ?? []) as CreativeRow[]
      setCreativeMap(new Map(
        creatives
          .filter((c) => c.external_id && c.name)
          .map((c) => [c.external_id!, c.name!]),
      ))
      // URL priority:
      // 1. instagram_permalink_url (Meta API) — link público do post no Instagram
      // 2. permalink_url (Meta API) — link público do post no Facebook
      // 3. final_asset_url (Google Drive) — fallback se ainda não sincronizado
      type PermalinkRow = { creative_code: string | null; instagram_permalink_url: string | null; permalink_url: string | null }
      const permalinks = (permalinksRes.data ?? []) as PermalinkRow[]
      // Mapa da Meta API: CR-XXX → URL
      const metaUrlMap = new Map<string, string>()
      for (const p of permalinks) {
        if (p.creative_code) {
          const url = p.instagram_permalink_url ?? p.permalink_url
          if (url) metaUrlMap.set(p.creative_code, url)
        }
      }
      // Mapa de fallback do Google Drive
      const fallbackUrlMap = new Map<string, string>(
        creatives
          .filter((c) => c.external_id && c.final_asset_url)
          .map((c) => [c.external_id!, c.final_asset_url!]),
      )
      // Combinar: Meta API > Google Drive
      const allCreativeCodes = new Set([...metaUrlMap.keys(), ...fallbackUrlMap.keys()])
      setCreativeAdUrlMap(new Map(
        Array.from(allCreativeCodes)
          .map((code) => [code, metaUrlMap.get(code) ?? fallbackUrlMap.get(code)!] as [string, string])
          .filter(([, url]) => !!url),
      ))
    })()
    return () => { cancelled = true }
  }, [])

  // MQLs by funnel (via utm_campaign → campaignFunnelMap)
  const mqlsByFunnel = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    const mqls = filterUniqueMqls(mqlBaseOpps)
    for (const opp of mqls) {
      const utmCampaign = opp.contatos?.utm_campaign
      const funnels = utmCampaign != null ? (campaignFunnelMap.get(String(utmCampaign)) ?? []) : []
      if (funnels.length > 0) {
        for (const fn of funnels) {
          const e = counts.get(fn) ?? { count: 0, leads: [] }
          e.count++
          e.leads.push(opp)
          counts.set(fn, e)
        }
      } else {
        const e = counts.get('Sem funil') ?? { count: 0, leads: [] }
        e.count++
        e.leads.push(opp)
        counts.set('Sem funil', e)
      }
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [mqlBaseOpps, campaignFunnelMap])

  const mqlsByCampaign = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    const mqls = filterUniqueMqls(mqlBaseOpps)
    for (const opp of mqls) {
      const utmCampaign = opp.contatos?.utm_campaign
      const label = utmCampaign != null ? (campaignNameMap.get(String(utmCampaign)) ?? 'Sem campanha') : 'Sem campanha'
      const entry = counts.get(label) ?? { count: 0, leads: [] }
      entry.count++
      entry.leads.push(opp)
      counts.set(label, entry)
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [mqlBaseOpps, campaignNameMap])

  // MQLs by channel
  const mqlsByPublico = useMemo(() => {
    const channelNameMap = new Map(filterOptions.channels.map((c) => [c.slug, c.nome]))
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    const mqls = filterUniqueMqls(mqlBaseOpps)
    for (const opp of mqls) {
      const src = opp.contatos?.utm_source?.trim() ?? ''
      const label = channelNameMap.get(src) ?? (src || 'Desconhecido')
      const e = counts.get(label) ?? { count: 0, leads: [] }
      e.count++
      e.leads.push(opp)
      counts.set(label, e)
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [mqlBaseOpps, filterOptions.channels])

  // Sales by funnel (via utm_campaign → campaignFunnelMap)
  const salesByFunnel = useMemo(() => {
    const activeRevMap = activePanel === 'produtividade' ? producaoRevenueMap : revenueMap
    const agg = new Map<string, { nVendas: number; faturamento: number; caixa: number; leads: OppRow[] }>()
    for (const opp of salesBaseOpps) {
      const rev = activeRevMap.get(opp.id)
      const utmCampaign = opp.contatos?.utm_campaign
      const funnels = utmCampaign != null ? (campaignFunnelMap.get(String(utmCampaign)) ?? []) : []
      const keys = funnels.length > 0 ? funnels : ['Sem funil']
      for (const fn of keys) {
        const en = agg.get(fn) ?? { nVendas: 0, faturamento: 0, caixa: 0, leads: [] }
        en.nVendas++
        en.faturamento += rev?.faturamento ?? 0
        en.caixa += rev?.caixa ?? 0
        en.leads.push(opp)
        agg.set(fn, en)
      }
    }
    return Array.from(agg.entries())
      .map(([reason, { nVendas, faturamento, caixa, leads }]) => ({
        reason,
        count: salesMetric === 'count' ? nVendas : salesMetric === 'faturamento' ? faturamento : caixa,
        leads,
      }))
      .sort((a, b) => b.count - a.count)
  }, [salesBaseOpps, campaignFunnelMap, activePanel, revenueMap, producaoRevenueMap, salesMetric])

  const salesByCampaign = useMemo(() => {
    const activeRevMap = activePanel === 'produtividade' ? producaoRevenueMap : revenueMap
    const agg = new Map<string, { nVendas: number; faturamento: number; caixa: number; leads: OppRow[] }>()
    for (const opp of salesBaseOpps) {
      const rev = activeRevMap.get(opp.id)
      const utmCampaign = opp.contatos?.utm_campaign
      const label = utmCampaign != null ? (campaignNameMap.get(String(utmCampaign)) ?? 'Sem campanha') : 'Sem campanha'
      const entry = agg.get(label) ?? { nVendas: 0, faturamento: 0, caixa: 0, leads: [] }
      entry.nVendas++
      entry.faturamento += rev?.faturamento ?? 0
      entry.caixa += rev?.caixa ?? 0
      entry.leads.push(opp)
      agg.set(label, entry)
    }
    return Array.from(agg.entries())
      .map(([reason, { nVendas, faturamento, caixa, leads }]) => ({
        reason,
        count: salesMetric === 'count' ? nVendas : salesMetric === 'faturamento' ? faturamento : caixa,
        leads,
      }))
      .sort((a, b) => b.count - a.count)
  }, [salesBaseOpps, activePanel, revenueMap, producaoRevenueMap, campaignNameMap, salesMetric])

  // Sales by channel
  const salesByPublico = useMemo(() => {
    const channelNameMap = new Map(filterOptions.channels.map((c) => [c.slug, c.nome]))
    const activeRevMap = activePanel === 'produtividade' ? producaoRevenueMap : revenueMap
    const agg = new Map<string, { nVendas: number; faturamento: number; caixa: number; leads: OppRow[] }>()
    for (const opp of salesBaseOpps) {
      const rev = activeRevMap.get(opp.id)
      const src = opp.contatos?.utm_source?.trim() ?? ''
      const label = channelNameMap.get(src) ?? (src || 'Desconhecido')
      const en = agg.get(label) ?? { nVendas: 0, faturamento: 0, caixa: 0, leads: [] }
      en.nVendas++
      en.faturamento += rev?.faturamento ?? 0
      en.caixa += rev?.caixa ?? 0
      en.leads.push(opp)
      agg.set(label, en)
    }
    return Array.from(agg.entries())
      .map(([reason, { nVendas, faturamento, caixa, leads }]) => ({
        reason,
        count: salesMetric === 'count' ? nVendas : salesMetric === 'faturamento' ? faturamento : caixa,
        leads,
      }))
      .sort((a, b) => b.count - a.count)
  }, [salesBaseOpps, filterOptions.channels, activePanel, revenueMap, producaoRevenueMap, salesMetric])

  const reunioesByFunnel = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    for (const opp of reunioesBaseOpps) {
      const utmCampaign = opp.contatos?.utm_campaign
      const funnels = utmCampaign != null ? (campaignFunnelMap.get(String(utmCampaign)) ?? []) : []
      if (funnels.length > 0) {
        for (const fn of funnels) {
          const entry = counts.get(fn) ?? { count: 0, leads: [] }
          entry.count++
          entry.leads.push(opp)
          counts.set(fn, entry)
        }
      } else {
        const entry = counts.get('Sem funil') ?? { count: 0, leads: [] }
        entry.count++
        entry.leads.push(opp)
        counts.set('Sem funil', entry)
      }
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [reunioesBaseOpps, campaignFunnelMap])

  const reunioesByCampaign = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    for (const opp of reunioesBaseOpps) {
      const utmCampaign = opp.contatos?.utm_campaign
      const label = utmCampaign != null ? (campaignNameMap.get(String(utmCampaign)) ?? 'Sem campanha') : 'Sem campanha'
      const entry = counts.get(label) ?? { count: 0, leads: [] }
      entry.count++
      entry.leads.push(opp)
      counts.set(label, entry)
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [reunioesBaseOpps, campaignNameMap])

  const reunioesByPublico = useMemo(() => {
    const channelNameMap = new Map(filterOptions.channels.map((c) => [c.slug, c.nome]))
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    for (const opp of reunioesBaseOpps) {
      const src = opp.contatos?.utm_source?.trim() ?? ''
      const label = channelNameMap.get(src) ?? (src || 'Desconhecido')
      const entry = counts.get(label) ?? { count: 0, leads: [] }
      entry.count++
      entry.leads.push(opp)
      counts.set(label, entry)
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [reunioesBaseOpps, filterOptions.channels])

  // ── MQLs / Sales by creative ─────────────────────────────
  const mqlsByCriativo = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[]; previewUrl?: string; code?: string }>()
    const mqls = filterUniqueMqls(mqlBaseOpps)
    for (const opp of mqls) {
      const utmTerm = opp.contatos?.utm_term?.trim() ?? ''
      const crId = extractCreativeId(utmTerm)
      const name = crId ? (creativeMap.get(crId) ?? crId) : (utmTerm || 'Sem criativo')
      const previewUrl = crId ? creativeAdUrlMap.get(crId) : undefined
      const e = counts.get(name) ?? { count: 0, leads: [], previewUrl, code: crId ?? undefined }
      e.count++
      e.leads.push(opp)
      counts.set(name, e)
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads, previewUrl, code }]) => ({ reason, count, leads, previewUrl, code }))
      .sort((a, b) => b.count - a.count)
  }, [mqlBaseOpps, creativeMap, creativeAdUrlMap])

  const salesByCriativo = useMemo(() => {
    const activeRevMap = activePanel === 'produtividade' ? producaoRevenueMap : revenueMap
    const agg = new Map<string, { nVendas: number; faturamento: number; caixa: number; leads: OppRow[]; previewUrl?: string; code?: string }>()
    for (const opp of salesBaseOpps) {
      const rev = activeRevMap.get(opp.id)
      const utmTerm = opp.contatos?.utm_term?.trim() ?? ''
      const crId = extractCreativeId(utmTerm)
      const name = crId ? (creativeMap.get(crId) ?? crId) : (utmTerm || 'Sem criativo')
      const previewUrl = crId ? creativeAdUrlMap.get(crId) : undefined
      const en = agg.get(name) ?? { nVendas: 0, faturamento: 0, caixa: 0, leads: [], previewUrl, code: crId ?? undefined }
      en.nVendas++
      en.faturamento += rev?.faturamento ?? 0
      en.caixa += rev?.caixa ?? 0
      en.leads.push(opp)
      agg.set(name, en)
    }
    return Array.from(agg.entries())
      .map(([reason, { nVendas, faturamento, caixa, leads, previewUrl, code }]) => ({
        reason,
        count: salesMetric === 'count' ? nVendas : salesMetric === 'faturamento' ? faturamento : caixa,
        leads,
        previewUrl,
        code,
      }))
      .sort((a, b) => b.count - a.count)
  }, [salesBaseOpps, creativeMap, creativeAdUrlMap, activePanel, revenueMap, producaoRevenueMap, salesMetric])

  const reunioesByCriativo = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[]; previewUrl?: string; code?: string }>()
    for (const opp of reunioesBaseOpps) {
      const utmTerm = opp.contatos?.utm_term?.trim() ?? ''
      const crId = extractCreativeId(utmTerm)
      const name = crId ? (creativeMap.get(crId) ?? crId) : (utmTerm || 'Sem criativo')
      const previewUrl = crId ? creativeAdUrlMap.get(crId) : undefined
      const entry = counts.get(name) ?? { count: 0, leads: [], previewUrl, code: crId ?? undefined }
      entry.count++
      entry.leads.push(opp)
      counts.set(name, entry)
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads, previewUrl, code }]) => ({ reason, count, leads, previewUrl, code }))
      .sort((a, b) => b.count - a.count)
  }, [reunioesBaseOpps, creativeMap, creativeAdUrlMap])

  // ── Daily points for Investimento × CPMQL chart ─────────
  const dailyPoints = useMemo(
    () => computeDailyPoints(metaRows, mqlBaseOpps, filters.startDate, filters.endDate),
    [metaRows, mqlBaseOpps, filters.startDate, filters.endDate],
  )

  // ── CPMQL variant ────────────────────────────────────────
  const cpmqlMeta = activeCostMeta?.valor ?? 0
  const hasCpmqlMeta = cpmqlMeta > 0 && custoPorMql > 0
  const cpmqlDiffPct = hasCpmqlMeta ? ((custoPorMql - cpmqlMeta) / cpmqlMeta) * 100 : 0
  const cpmqlVariant: 'default' | 'success' | 'warning' | 'danger' = !hasCpmqlMeta
    ? 'default'
    : cpmqlDiffPct > 10
      ? 'danger'
      : cpmqlDiffPct < -10
        ? 'success'
        : 'default'

  // ── Helpers ──────────────────────────────────────────────
  const openModal = (title: string, leads: OppRow[]) => {
    setModal({ open: true, title, leads })
  }

  const openChartModal = (
    prefix: 'MQLs' | 'Reuniões' | 'Vendas',
    collection: Array<{ reason: string; leads: OppRow[] }>
  ) => (reason: string) => {
    const entry = collection.find((item) => item.reason === reason)
    if (entry) openModal(`${prefix} — ${reason}`, entry.leads)
  }

  // ── Leads por etapa do funil (para modal ao clicar) ──
  const funnelLeadsMap = useMemo(() => {
    if (activePanel === 'produtividade') {
      return {
        leads: producaoLeadsInPeriod,
        mql: producaoMqlsInPeriod,
        conectados: producaoRows.flatMap((r) => r.leads_conectados),
        agendados: producaoRows.flatMap((r) => r.leads_agendados),
        reunioes: producaoRows.flatMap((r) => r.leads_reunioes),
        fechados: producaoRows.flatMap((r) => r.leads_fechados),
      } as Record<string, OppRow[]>
    }
    return {
      leads: filteredOpps,
      mql: filterUniqueMqls(filteredOpps),
      conectados: filteredOpps.filter((o) => o.data_conectado),
      agendados: filteredOpps.filter((o) => o.data_agendamento_reuniao),
      reunioes: filteredOpps.filter((o) => o.data_realizacao_vendas),
      fechados: filteredOpps.filter((o) => paymentDateMap.has(o.id)),
    } as Record<string, OppRow[]>
  }, [activePanel, producaoLeadsInPeriod, producaoMqlsInPeriod, producaoRows, filteredOpps, paymentDateMap])

  const vizFunnelSteps = useMemo(() => {
    const first = funnelSteps[0]?.count ?? 0
    return funnelSteps.map((s, i) => ({
      label: s.label,
      count: s.count,
      stepPct: i === 0 ? null : (funnelSteps[i - 1].count > 0 ? Math.round((s.count / funnelSteps[i - 1].count) * 100) : 0),
      totalPct: first > 0 ? Math.round((s.count / first) * 100) : 0,
      onClick: () => openModal(s.label, funnelLeadsMap[s.key] ?? []),
      cost: cpe(metaKpis.spend, s.count),
    }))
  }, [funnelSteps, funnelLeadsMap, metaKpis.spend])

  // ── Error state ──────────────────────────────────────────
  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* Section 1: KPI Cards — compact grid */}
      <div>
        <SectionHeader
          title="Indicadores"
          description={activePanel === 'cohort' ? 'Cohort — metricas por data de geracao do lead' : 'Produtividade — eventos que aconteceram no período, respeitando apenas os filtros ativos'}
        />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <KpiCard label="Investimento" value={fmtCurrency(metaKpis.spend)} icon={DollarSign} loading={loading} />
          <KpiCard
            label="CPMQL"
            value={custoPorMql > 0 ? fmtCurrency(custoPorMql) : '\u2014'}
            icon={DollarSign}
            loading={loading}
            variant={cpmqlVariant}
            delta={hasCpmqlMeta ? { value: `${cpmqlDiffPct.toFixed(0)}%`, positive: cpmqlDiffPct < 0 } : undefined}
          />
          <KpiCard label="Meta CPMQL" value={activeCostMeta ? fmtCurrency(activeCostMeta.valor ?? 0) : '\u2014'} icon={Target} loading={loading} variant="highlight" />
          <KpiCard label="MQLs" value={fmtNumber(mqlCount)} icon={Crosshair} loading={loading} variant="highlight" />
          <KpiCard label="Vendas" value={fmtNumber(salesCount)} icon={ShoppingCart} loading={loading} variant="highlight" />
          <KpiCard label="CPV" value={cpv > 0 ? fmtCurrency(cpv) : '\u2014'} icon={Target} loading={loading} />
          <KpiCard label="Faturamento" value={fmtCurrency(activeRevenueKpis.valorFaturado)} icon={TrendingUp} loading={loading} variant="highlight" />
          <KpiCard label="Caixa" value={fmtCurrency(activeRevenueKpis.valorEntrada)} icon={DollarSign} loading={loading} />
          <KpiCard label="ROAS" value={roas > 0 ? `${roas.toFixed(2)}x` : '\u2014'} icon={BarChart2} loading={loading} />
          <KpiCard label="ROAS Caixa" value={roasCaixa > 0 ? `${roasCaixa.toFixed(2)}x` : '\u2014'} icon={Percent} loading={loading} />
          <KpiCard
            label="Ciclo Compra"
            value={avgCycle !== null ? `${avgCycle}d` : '\u2014'}
            icon={Clock}
            loading={loading}
            variant="highlight"
          />
          <KpiCard
            label="Ciclo de Fechamento"
            value={closingCycle !== null ? `${closingCycle}d` : '\u2014'}
            icon={Clock}
            loading={loading}
            variant="info"
            subValue="reunião → pagamento"
          />
        </div>

        {missingPageCodeFunnel && !loading && (
          <div className="mt-2 rounded border border-empire-warning/30 bg-empire-warning-soft px-3 py-2 text-[10px] text-empire-warning">
            Nenhum <strong>page_code</strong> cadastrado para as campanhas deste funil. Configure em{' '}
            <strong>Rastreamento &rarr; Funis</strong> para ver o investimento.
          </div>
        )}
      </div>

      {/* Section 3: Funnel / etapas independentes */}
      <div>
        <SectionHeader
          title={activePanel === 'produtividade' ? 'Etapas independentes' : 'Funil de Conversao'}
          description={
            activePanel === 'produtividade'
              ? 'Cada etapa usa sua própria data; não há conversao encadeada entre colunas'
              : 'Progresso dos leads em cada etapa'
          }
        />
        <div className="mt-3">
          {activePanel === 'produtividade' ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label="Leads gerados"
                value={fmtNumber(producaoLeadsInPeriod.length)}
                icon={Users}
                loading={loading}
                subValue={cpe(metaKpis.spend, producaoLeadsInPeriod.length)}
                onClick={() => openModal('Leads gerados', producaoLeadsInPeriod)}
              />
              <KpiCard
                label="MQLs"
                value={fmtNumber(producaoMqlsInPeriod.length)}
                icon={BadgeCheck}
                loading={loading}
                variant="highlight"
                subValue={cpe(metaKpis.spend, producaoMqlsInPeriod.length)}
                onClick={() => openModal('MQLs', producaoMqlsInPeriod)}
              />
              <KpiCard
                label="Conectados"
                value={fmtNumber(producaoTotals.conectados)}
                icon={Link2}
                loading={loading}
                subValue={cpe(metaKpis.spend, producaoTotals.conectados)}
                onClick={() => openModal('Conectados', producaoRows.flatMap((r) => r.leads_conectados))}
              />
              {/* Em Produtividade a conta e por data do evento: um lead conectado
                  FORA da janela cai aqui. Ver AquisicaoTab. */}
              <KpiCard
                label="Sem conexão no período"
                value={fmtNumber(produtividadeNaoConectados.length)}
                icon={Users}
                loading={loading}
                onClick={() => openModal('Sem conexão no período', produtividadeNaoConectados)}
              />
              <KpiCard
                label="Agendados"
                value={fmtNumber(producaoTotals.agendados)}
                icon={CalendarCheck2}
                loading={loading}
                subValue={cpe(metaKpis.spend, producaoTotals.agendados)}
                onClick={() => openModal('Agendados', producaoRows.flatMap((r) => r.leads_agendados))}
              />
              <KpiCard
                label="Reuniões"
                value={fmtNumber(producaoTotals.reunioes)}
                icon={Video}
                loading={loading}
                subValue={cpe(metaKpis.spend, producaoTotals.reunioes)}
                onClick={() => openModal('Reuniões', producaoRows.flatMap((r) => r.leads_reunioes))}
              />
              <KpiCard
                label="Fechados"
                value={fmtNumber(producaoTotals.fechados)}
                icon={ShoppingCart}
                loading={loading}
                variant="highlight"
                subValue={cpe(metaKpis.spend, producaoTotals.fechados)}
                onClick={() => openModal('Fechados', producaoRows.flatMap((r) => r.leads_fechados))}
              />
              <KpiCard
                label="No-shows"
                value={fmtNumber(producaoNoShows.length)}
                icon={UserX}
                loading={loading}
                onClick={() => openModal('No-shows', producaoNoShows)}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <FunnelViz steps={vizFunnelSteps} loading={loading} />
              <div className="flex items-center gap-2">
                <KpiCard
                  label="Conectados"
                  value={fmtNumber((funnelLeadsMap['conectados'] ?? []).length)}
                  icon={Link2}
                  loading={loading}
                  subValue={cpe(metaKpis.spend, (funnelLeadsMap['conectados'] ?? []).length)}
                  onClick={() => openModal('Conectados', funnelLeadsMap['conectados'] ?? [])}
                />
                <KpiCard
                  label="Não conectados"
                  value={fmtNumber(cohortNaoConectados.length)}
                  icon={Users}
                  loading={loading}
                  onClick={() => openModal('Não conectados', cohortNaoConectados)}
                />
                <KpiCard
                  label="No-shows"
                  value={fmtNumber(cohortNoShows.length)}
                  icon={UserX}
                  loading={loading}
                  onClick={() => openModal('No-shows', cohortNoShows)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section 4: Investimento × CPMQL ao longo do tempo */}
      <InvestimentoCpmqlChart
        data={dailyPoints}
        loading={loading}
      />

      {/* Section 5: Meta Tracking */}
      <MetaTrackingCard
        mqlCount={mqlCountForGoal}
        mqlMeta={activeMqlMeta}
        idealDia={mqlIdealDia}
        mqlSeries={mqlMetaSeries}
        custoPorMql={custoPorMqlMetaCard}
        totalSpend={costMetaKpis.spend}
        costMeta={activeCostMeta}
        idealCost={costIdealDia}
        loading={loading || (!!activeMqlMeta && metaRangeLoading && !mqlMetaDataset) || (!!activeCostMeta && metaRangeLoading && !costMetaDataset)}
        filterStartDate={filters.startDate}
        filterEndDate={filters.endDate}
      />

      {/* Section 5: Segmentation Charts */}
      <div>
        <SectionHeader title="Segmentacao" description="Colunas por métrica: MQLs, Reuniões e Vendas; cada coluna detalha funil, campanha, canal e criativo" />
        <div className="grid gap-6 xl:grid-cols-3">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-empire-void">MQLs</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <DonutChart
                title="MQLs por funil"
                data={mqlsByFunnel}
                onSliceClick={openChartModal('MQLs', mqlsByFunnel)}
              />
              <DonutChart
                title="MQLs por campanha"
                data={mqlsByCampaign}
                onSliceClick={openChartModal('MQLs', mqlsByCampaign)}
              />
              <DonutChart
                title="MQLs por canal"
                data={mqlsByPublico}
                onSliceClick={openChartModal('MQLs', mqlsByPublico)}
              />
              <DonutChart
                title="MQLs por criativo"
                data={mqlsByCriativo}
                onSliceClick={openChartModal('MQLs', mqlsByCriativo)}
              />
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-empire-void">Reuniões</h3>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <DonutChart
                title="Reuniões por funil"
                data={reunioesByFunnel}
                onSliceClick={openChartModal('Reuniões', reunioesByFunnel)}
              />
              <DonutChart
                title="Reuniões por campanha"
                data={reunioesByCampaign}
                onSliceClick={openChartModal('Reuniões', reunioesByCampaign)}
              />
              <DonutChart
                title="Reuniões por canal"
                data={reunioesByPublico}
                onSliceClick={openChartModal('Reuniões', reunioesByPublico)}
              />
              <DonutChart
                title="Reuniões por criativo"
                data={reunioesByCriativo}
                onSliceClick={openChartModal('Reuniões', reunioesByCriativo)}
              />
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-empire-void">Vendas</h3>
              <div className="flex items-center gap-0.5 rounded-lg border border-empire-border bg-empire-elevated p-0.5">
                {(['count', 'faturamento', 'caixa'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setSalesMetric(m)}
                    className={cn(
                      'cursor-pointer rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors',
                      salesMetric === m
                        ? 'bg-empire-surface text-empire-void shadow-sm'
                        : 'text-empire-subtle hover:text-empire-void'
                    )}
                  >
                    {m === 'count' ? 'Nº Vendas' : m === 'faturamento' ? 'Faturamento' : 'Caixa'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
              <DonutChart
                title="Vendas por funil"
                data={salesByFunnel}
                onSliceClick={openChartModal('Vendas', salesByFunnel)}
                valueFormatter={salesMetric !== 'count' ? fmtCurrencyCompact : undefined}
              />
              <DonutChart
                title="Vendas por campanha"
                data={salesByCampaign}
                onSliceClick={openChartModal('Vendas', salesByCampaign)}
                valueFormatter={salesMetric !== 'count' ? fmtCurrencyCompact : undefined}
              />
              <DonutChart
                title="Vendas por canal"
                data={salesByPublico}
                onSliceClick={openChartModal('Vendas', salesByPublico)}
                valueFormatter={salesMetric !== 'count' ? fmtCurrencyCompact : undefined}
              />
              <DonutChart
                title="Vendas por criativo"
                data={salesByCriativo}
                onSliceClick={openChartModal('Vendas', salesByCriativo)}
                valueFormatter={salesMetric !== 'count' ? fmtCurrencyCompact : undefined}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ─── Cruzamento Meta × CRM ─────────────────────────── */}
      <div className="mt-6 rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
        <button
          type="button"
          onClick={() => setShowMetaCrm((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3.5 text-left hover:bg-empire-elevated transition-colors"
        >
          <span className="text-[13px] font-semibold text-empire-void">
            Cruzamento Meta × CRM
          </span>
          {showMetaCrm ? (
            <ChevronUp className="h-4 w-4 text-empire-subtle shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-empire-subtle shrink-0" />
          )}
        </button>

        {showMetaCrm && (
          <div className="border-t border-empire-border px-5 py-4">
            {metaCrmLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-8 w-full rounded" />
                ))}
              </div>
            ) : metaCrmError ? (
              <p className="text-sm text-empire-danger py-2">
                Erro ao carregar dados: {metaCrmError}
              </p>
            ) : metaCrmData.length === 0 ? (
              <p className="text-sm text-empire-subtle py-2">
                Sem dados de campanhas no período selecionado.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-empire-border text-empire-subtle text-left">
                      <th className="pb-2 pr-4 font-medium">Campanha</th>
                      <th className="pb-2 pr-4 font-medium text-right">Invest. Meta</th>
                      <th className="pb-2 pr-4 font-medium text-right">Leads Meta</th>
                      <th className="pb-2 pr-4 font-medium text-right">Leads CRM</th>
                      <th className="pb-2 pr-4 font-medium text-right">MQLs</th>
                      <th className="pb-2 pr-4 font-medium text-right">CPL Meta</th>
                      <th className="pb-2 font-medium text-right">CPL CRM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metaCrmData.map((row) => (
                      <tr
                        key={row.utm_campaign}
                        className="border-b border-empire-border/50 last:border-0 hover:bg-empire-elevated transition-colors"
                      >
                        <td className="py-2 pr-4 font-medium text-empire-void max-w-[200px] truncate" title={row.utm_campaign}>
                          {row.utm_campaign}
                        </td>
                        <td className="py-2 pr-4 text-right text-empire-void tabular-nums">
                          {row.investimento_meta > 0
                            ? `R$ ${row.investimento_meta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.leads_meta || '—'}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.leads_crm || '—'}</td>
                        <td className="py-2 pr-4 text-right tabular-nums">{row.mqls_crm || '—'}</td>
                        <td className="py-2 pr-4 text-right tabular-nums text-empire-subtle">
                          {row.cpl_meta != null
                            ? `R$ ${row.cpl_meta.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                        <td className="py-2 text-right tabular-nums text-empire-subtle">
                          {row.cpl_crm != null
                            ? `R$ ${row.cpl_crm.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lead List Modal */}
      <LeadListModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
