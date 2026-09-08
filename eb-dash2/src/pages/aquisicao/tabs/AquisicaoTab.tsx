import { useState, useMemo } from 'react'

import type { OppRow } from '@/hooks/useTrafego'
import {
  computeMetaKpis,
  computeRevenueKpis,
  applyMqlFilter,
  applyAttributionFilters,
  computeAvgCycle,
  computeClosingCycle,
  buildPaymentDateMap,
  buildRevenueMap,
  filterUniqueMqls,
} from '@/hooks/useTrafego'
import { useCohort } from '@/hooks/useCohort'
import { computeProducao } from '@/hooks/useProducao'
import { LeadListModal } from '@/components/leads/LeadCard'
import { buildLabelColorMap } from '@/lib/utils/colors'
import {
  SectionHeader,
  KpiCard,
  FunnelViz,
  DonutChart,
  OriginTrendChart,
  MediaBreakdownCard,
  ALL_ORIGINS,
} from '@/components/dashboard'
import type { FunnelStep, TrendSeries } from '@/components/dashboard'
import {
  DollarSign,
  TrendingUp,
  BarChart2,
  Clock,
  AlertTriangle,
  Banknote,
  BadgeCheck,
  CalendarCheck2,
  Link2,
  Users,
  UserX,
  Video,
} from 'lucide-react'
import type { AquisicaoSharedProps } from '../AquisicaoPage'

// ─── Formatting helpers ───────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
}
function fmtCurrencyCompact(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(v)
}
function fmtNumber(v: number) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(v))
}
function fmtPct(v: number) {
  return `${v.toFixed(1)}%`
}
// Retorna custo unitário formatado, ou undefined quando não há spend ou contagem
function cpe(spend: number, count: number): string | undefined {
  if (spend <= 0 || count <= 0) return undefined
  return fmtCurrencyCompact(spend / count)
}

type SalesMetric = 'count' | 'faturamento' | 'caixa' | 'mqls' | 'reunioes'

const METRIC_TITLES: Record<SalesMetric, string> = {
  count: 'Vendas',
  faturamento: 'Faturamento',
  caixa: 'Caixa',
  mqls: 'MQLs',
  reunioes: 'Reuniões',
}

// Lista de dias YYYY-MM-DD entre start e end (inclusive), sem depender de timezone
function buildDateRange(start: string, end: string): string[] {
  if (!start || !end || start > end) return start ? [start] : []
  const out: string[] = []
  const cur = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  // trava de segurança: no máximo ~2 anos de eixo
  let guard = 0
  while (cur <= last && guard++ < 800) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return out
}

function isDateInPeriod(dateStr: string | null | undefined, startDate: string, endDate: string): boolean {
  return !!dateStr && dateStr >= startDate && dateStr <= endDate
}

// ─── Funnel step builder ──────────────────────────────────────

function buildFunnelSteps(
  items: { label: string; count: number; onClick: () => void; cost?: string }[]
): FunnelStep[] {
  const first = items[0]?.count || 1
  return items.map((s, i) => ({
    label: s.label,
    count: s.count,
    totalPct: Math.round((s.count / first) * 100),
    stepPct: i === 0 ? null : (items[i - 1].count > 0 ? Math.round((s.count / items[i - 1].count) * 100) : 0),
    onClick: s.onClick,
    cost: s.cost,
  }))
}

// ─── Main Component ───────────────────────────────────────────

export function AquisicaoTab({
  filters,
  activePanel,
  opps,
  metaRows,
  accountDailyRows,
  revenueRows,
  filterOptions,
  campaignFunnelMap,
  campaignNameMap,
  loading,
  error,
  hasPaidTraffic,
  organicInvestment = 0,
  producaoOppsRaw,
  producaoRevenueRows,
  producaoLoading,
  mediumNameMap,
}: AquisicaoSharedProps) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false, title: '', leads: [],
  })
  const [salesMetric, setSalesMetric] = useState<SalesMetric>('count')
  const [mediaOrigin, setMediaOrigin] = useState<string>(ALL_ORIGINS)

  // ── Payment date maps (critério de "fechado" = data_pagamento_entrada preenchida) ──
  const paymentDateMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])
  const producaoPaymentDateMap = useMemo(() => buildPaymentDateMap(producaoRevenueRows), [producaoRevenueRows])

  // ── Revenue maps (faturamento + caixa por opp) ──
  // Caixa = recebido dentro do período (soma o cronograma), igual aos KPIs abaixo.
  const periodoCaixa = useMemo(
    () => ({ startDate: filters.startDate, endDate: filters.endDate }),
    [filters.startDate, filters.endDate],
  )
  const revenueMap = useMemo(() => buildRevenueMap(revenueRows, periodoCaixa), [revenueRows, periodoCaixa])
  const producaoRevenueMap = useMemo(() => buildRevenueMap(producaoRevenueRows, periodoCaixa), [producaoRevenueRows, periodoCaixa])

  // ── Cohort data ──
  const { rows: cohortRows } = useCohort(opps, revenueRows, filters.startDate, filters.endDate)

  const cohortTotals = useMemo(() => ({
    leads: cohortRows.reduce((s, r) => s + r.leads_count, 0),
    mqls: cohortRows.reduce((s, r) => s + r.mqls, 0),
    conectados: cohortRows.reduce((s, r) => s + r.conectados, 0),
    agendados: cohortRows.reduce((s, r) => s + r.agendados, 0),
    reunioes: cohortRows.reduce((s, r) => s + r.reunioes, 0),
    fechados: cohortRows.reduce((s, r) => s + r.fechados, 0),
  }), [cohortRows])

  // ── Produtividade: MQL + atribuição filter + compute table ──
  const producaoOpps = useMemo(
    () => applyAttributionFilters(applyMqlFilter(producaoOppsRaw, filters.mqlFilter), filters.sdrs, filters.closers),
    [producaoOppsRaw, filters.mqlFilter, filters.sdrs, filters.closers],
  )
  const { rows: producaoRows, totals: producaoTotals } = useMemo(
    () => computeProducao(producaoOpps, producaoRevenueRows, filters.startDate, filters.endDate),
    [producaoOpps, producaoRevenueRows, filters.startDate, filters.endDate],
  )

  // ── Meta KPIs ──
  const metaKpis = useMemo(() => computeMetaKpis(metaRows, accountDailyRows), [metaRows, accountDailyRows])

  // ── Revenue KPIs for both views ──
  const revenueKpis = useMemo(() => computeRevenueKpis(revenueRows, periodoCaixa), [revenueRows, periodoCaixa])
  const producaoRevenueKpis = useMemo(() => {
    // Filtra producaoRevenueRows pelas oportunidades em producaoOpps (respeita mqlFilter)
    // para garantir que valorFaturado e valorEntrada sempre venham do mesmo conjunto de linhas.
    const ids = new Set(producaoOpps.map((o) => o.id))
    return computeRevenueKpis(producaoRevenueRows.filter((r) => ids.has(r.oportunidade_id)), periodoCaixa)
  }, [producaoOpps, producaoRevenueRows, periodoCaixa])
  const activeRevenueKpis = activePanel === 'produtividade' ? producaoRevenueKpis : revenueKpis

  const taxaRecebimento = useMemo(() => (
    activeRevenueKpis.valorFaturado > 0
      ? (activeRevenueKpis.valorEntrada / activeRevenueKpis.valorFaturado) * 100
      : 0
  ), [activeRevenueKpis])

  const periodoLeads = useMemo(
    () => producaoOpps.filter((o) => isDateInPeriod(o.data_lead_recebido?.slice(0, 10) ?? null, filters.startDate, filters.endDate)),
    [producaoOpps, filters.startDate, filters.endDate],
  )

  const periodoMqls = useMemo(
    () => filterUniqueMqls(periodoLeads),
    [periodoLeads],
  )
  const periodoReunioes = useMemo(
    () => producaoRows.flatMap((row) => row.leads_reunioes),
    [producaoRows],
  )
  const periodoSales = useMemo(
    () => producaoRows.flatMap((row) => row.leads_fechados),
    [producaoRows],
  )
  const cohortNaoConectados = useMemo(
    () => opps.filter((o) => !o.data_conectado),
    [opps],
  )
  const produtividadeNaoConectados = useMemo(
    () => periodoLeads.filter((o) => !o.data_conectado),
    [periodoLeads],
  )
  // No-shows: cohort = leads do período que deram no-show (qualquer data);
  // produtividade = no-shows que aconteceram no período (independente da entrada do lead)
  const cohortNoShows = useMemo(() => opps.filter((o) => !!o.data_no_show), [opps])
  const periodoNoShows = useMemo(
    () => producaoOpps.filter((o) => isDateInPeriod(o.data_no_show, filters.startDate, filters.endDate)),
    [producaoOpps, filters.startDate, filters.endDate],
  )

  // ── MQLs por funil (via utm_campaign → campaignFunnelMap) ──
  const mqlsByFunnel = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()

    const mqls = activePanel === 'produtividade'
      ? periodoMqls
      : filterUniqueMqls(opps)

    for (const opp of mqls) {
      const utmCampaign = opp.contatos?.utm_campaign
      const funnels = utmCampaign != null ? (campaignFunnelMap.get(String(utmCampaign)) ?? []) : []

      if (funnels.length > 0) {
        for (const funnel of funnels) {
          const entry = counts.get(funnel) ?? { count: 0, leads: [] }
          entry.count++
          entry.leads.push(opp)
          counts.set(funnel, entry)
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
  }, [opps, periodoMqls, activePanel, campaignFunnelMap])

  // ── MQLs por origem (pago agrupado, orgânico por canal) ──
  const mqlsByOrigin = useMemo(() => {
    const { paidSourcesSet, allChannels } = filterOptions
    const channelNameMap = new Map(allChannels.map((c) => [c.slug, c.nome]))
    const counts = new Map<string, { count: number; leads: OppRow[] }>()

    const mqls = activePanel === 'produtividade'
      ? periodoMqls
      : filterUniqueMqls(opps)

    for (const opp of mqls) {
      const src = opp.contatos?.utm_source?.trim() ?? ''
      let label: string
      if (!src) {
        label = 'Desconhecido'
      } else if (paidSourcesSet.has(src)) {
        label = 'Tráfego Pago'
      } else {
        label = channelNameMap.get(src) ?? src
      }
      const entry = counts.get(label) ?? { count: 0, leads: [] }
      entry.count++
      entry.leads.push(opp)
      counts.set(label, entry)
    }

    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [opps, periodoMqls, activePanel, filterOptions])

  // ── Vendas por funil (via utm_campaign → campaignFunnelMap) ──
  const salesByFunnel = useMemo(() => {
    const activeRevMap = activePanel === 'produtividade' ? producaoRevenueMap : revenueMap
    const agg = new Map<string, { nVendas: number; faturamento: number; caixa: number; leads: OppRow[] }>()

    const sales = activePanel === 'produtividade'
      ? periodoSales
      : opps.filter((o) => paymentDateMap.has(o.id))

    for (const opp of sales) {
      const rev = activeRevMap.get(opp.id)
      const utmCampaign = opp.contatos?.utm_campaign
      const funnels = utmCampaign != null ? (campaignFunnelMap.get(String(utmCampaign)) ?? []) : []

      const keys = funnels.length > 0 ? funnels : ['Sem funil']
      for (const key of keys) {
        const entry = agg.get(key) ?? { nVendas: 0, faturamento: 0, caixa: 0, leads: [] }
        entry.nVendas++
        entry.faturamento += rev?.faturamento ?? 0
        entry.caixa += rev?.caixa ?? 0
        entry.leads.push(opp)
        agg.set(key, entry)
      }
    }

    return Array.from(agg.entries())
      .map(([reason, { nVendas, faturamento, caixa, leads }]) => ({
        reason,
        count: salesMetric === 'count' ? nVendas : salesMetric === 'faturamento' ? faturamento : caixa,
        leads,
      }))
      .sort((a, b) => b.count - a.count)
  }, [opps, periodoSales, activePanel, campaignFunnelMap, paymentDateMap, revenueMap, producaoRevenueMap, salesMetric])

  const reunioesByFunnel = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()

    const reunioes = activePanel === 'produtividade'
      ? periodoReunioes
      : opps.filter((o) => !!o.data_realizacao_vendas)

    for (const opp of reunioes) {
      const utmCampaign = opp.contatos?.utm_campaign
      const funnels = utmCampaign != null ? (campaignFunnelMap.get(String(utmCampaign)) ?? []) : []

      if (funnels.length > 0) {
        for (const funnel of funnels) {
          const entry = counts.get(funnel) ?? { count: 0, leads: [] }
          entry.count++
          entry.leads.push(opp)
          counts.set(funnel, entry)
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
  }, [opps, periodoReunioes, activePanel, campaignFunnelMap])

  const mqlsByCampaign = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    const mqls = activePanel === 'produtividade'
      ? periodoMqls
      : filterUniqueMqls(opps)
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
  }, [opps, periodoMqls, activePanel, campaignNameMap])

  // ── MQLs por mídia (utm_medium) ──
  const mqlsByMidia = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    const mqls = activePanel === 'produtividade'
      ? periodoMqls
      : filterUniqueMqls(opps)
    for (const opp of mqls) {
      const code = opp.contatos?.utm_medium?.trim() ?? ''
      const label = code ? (mediumNameMap?.get(code) ?? code) : 'Sem mídia'
      const entry = counts.get(label) ?? { count: 0, leads: [] }
      entry.count++
      entry.leads.push(opp)
      counts.set(label, entry)
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [opps, periodoMqls, activePanel, mediumNameMap])

  // ── Vendas por mídia (utm_medium) ──
  const salesByMidia = useMemo(() => {
    const activeRevMap = activePanel === 'produtividade' ? producaoRevenueMap : revenueMap
    const agg = new Map<string, { nVendas: number; faturamento: number; caixa: number; leads: OppRow[] }>()
    const sales = activePanel === 'produtividade'
      ? periodoSales
      : opps.filter((o) => paymentDateMap.has(o.id))
    for (const opp of sales) {
      const rev = activeRevMap.get(opp.id)
      const code = opp.contatos?.utm_medium?.trim() ?? ''
      const label = code ? (mediumNameMap?.get(code) ?? code) : 'Sem mídia'
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
  }, [opps, periodoSales, activePanel, paymentDateMap, revenueMap, producaoRevenueMap, mediumNameMap, salesMetric])

  const reunioesByMidia = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    const reunioes = activePanel === 'produtividade'
      ? periodoReunioes
      : opps.filter((o) => !!o.data_realizacao_vendas)
    for (const opp of reunioes) {
      const code = opp.contatos?.utm_medium?.trim() ?? ''
      const label = code ? (mediumNameMap?.get(code) ?? code) : 'Sem mídia'
      const entry = counts.get(label) ?? { count: 0, leads: [] }
      entry.count++
      entry.leads.push(opp)
      counts.set(label, entry)
    }
    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [opps, periodoReunioes, activePanel, mediumNameMap])

  // ── Vendas por origem (pago agrupado, orgânico por canal) ──
  const salesByOrigin = useMemo(() => {
    const { paidSourcesSet, allChannels } = filterOptions
    const channelNameMap = new Map(allChannels.map((c) => [c.slug, c.nome]))
    const activeRevMap = activePanel === 'produtividade' ? producaoRevenueMap : revenueMap
    const agg = new Map<string, { nVendas: number; faturamento: number; caixa: number; leads: OppRow[] }>()

    const sales = activePanel === 'produtividade'
      ? periodoSales
      : opps.filter((o) => paymentDateMap.has(o.id))

    for (const opp of sales) {
      const rev = activeRevMap.get(opp.id)
      const src = opp.contatos?.utm_source?.trim() ?? ''
      let label: string
      if (!src) {
        label = 'Desconhecido'
      } else if (paidSourcesSet.has(src)) {
        label = 'Tráfego Pago'
      } else {
        label = channelNameMap.get(src) ?? src
      }
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
  }, [opps, periodoSales, activePanel, filterOptions, paymentDateMap, revenueMap, producaoRevenueMap, salesMetric])

  const salesByCampaign = useMemo(() => {
    const activeRevMap = activePanel === 'produtividade' ? producaoRevenueMap : revenueMap
    const agg = new Map<string, { nVendas: number; faturamento: number; caixa: number; leads: OppRow[] }>()
    const sales = activePanel === 'produtividade'
      ? periodoSales
      : opps.filter((o) => paymentDateMap.has(o.id))
    for (const opp of sales) {
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
  }, [opps, periodoSales, activePanel, paymentDateMap, revenueMap, producaoRevenueMap, campaignNameMap, salesMetric])

  const reunioesByOrigin = useMemo(() => {
    const { paidSourcesSet, allChannels } = filterOptions
    const channelNameMap = new Map(allChannels.map((c) => [c.slug, c.nome]))
    const counts = new Map<string, { count: number; leads: OppRow[] }>()

    const reunioes = activePanel === 'produtividade'
      ? periodoReunioes
      : opps.filter((o) => !!o.data_realizacao_vendas)

    for (const opp of reunioes) {
      const src = opp.contatos?.utm_source?.trim() ?? ''
      let label: string
      if (!src) {
        label = 'Desconhecido'
      } else if (paidSourcesSet.has(src)) {
        label = 'Tráfego Pago'
      } else {
        label = channelNameMap.get(src) ?? src
      }
      const entry = counts.get(label) ?? { count: 0, leads: [] }
      entry.count++
      entry.leads.push(opp)
      counts.set(label, entry)
    }

    return Array.from(counts.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [opps, periodoReunioes, activePanel, filterOptions])

  const reunioesByCampaign = useMemo(() => {
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    const reunioes = activePanel === 'produtividade'
      ? periodoReunioes
      : opps.filter((o) => !!o.data_realizacao_vendas)
    for (const opp of reunioes) {
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
  }, [opps, periodoReunioes, activePanel, campaignNameMap])

  // ─────────────────────────────────────────────────────────────
  // Evolução dia a dia por origem + detalhamento de mídia
  //
  // Um único conjunto de eventos alimenta os dois blocos. Cada evento carrega
  // a data do PRÓPRIO evento (a que define a métrica), a origem (utm_source
  // agrupando pago) e a mídia (utm_medium: bio, direct, stories…).
  // ─────────────────────────────────────────────────────────────

  const resolveOriginLabel = useMemo(() => {
    const { paidSourcesSet, allChannels } = filterOptions
    const channelNameMap = new Map(allChannels.map((c) => [c.slug, c.nome]))
    return (opp: OppRow): string => {
      const src = opp.contatos?.utm_source?.trim() ?? ''
      if (!src) return 'Desconhecido'
      if (paidSourcesSet.has(src)) return 'Tráfego Pago'
      return channelNameMap.get(src) ?? src
    }
  }, [filterOptions])

  const metricEvents = useMemo(() => {
    const activeRevMap = activePanel === 'produtividade' ? producaoRevenueMap : revenueMap
    const activePayMap = activePanel === 'produtividade' ? producaoPaymentDateMap : paymentDateMap

    const events: { origin: string; media: string; date: string; value: number; opp: OppRow }[] = []

    const push = (opp: OppRow, date: string | null | undefined, value: number) => {
      const d = date?.slice(0, 10)
      if (!d) return
      const code = opp.contatos?.utm_medium?.trim() ?? ''
      events.push({
        origin: resolveOriginLabel(opp),
        media: code ? (mediumNameMap?.get(code) ?? code) : 'Sem mídia',
        date: d,
        value,
        opp,
      })
    }

    if (salesMetric === 'mqls') {
      const mqls = activePanel === 'produtividade' ? periodoMqls : filterUniqueMqls(opps)
      for (const opp of mqls) push(opp, opp.data_lead_recebido, 1)
    } else if (salesMetric === 'reunioes') {
      const reunioes = activePanel === 'produtividade'
        ? periodoReunioes
        : opps.filter((o) => !!o.data_realizacao_vendas)
      for (const opp of reunioes) push(opp, opp.data_realizacao_vendas, 1)
    } else {
      // count / faturamento / caixa — "venda" = data_pagamento_entrada preenchida
      const sales = activePanel === 'produtividade'
        ? periodoSales
        : opps.filter((o) => paymentDateMap.has(o.id))
      for (const opp of sales) {
        const rev = activeRevMap.get(opp.id)
        const value = salesMetric === 'count'
          ? 1
          : salesMetric === 'faturamento'
            ? (rev?.faturamento ?? 0)
            : (rev?.caixa ?? 0)
        push(opp, activePayMap.get(opp.id) ?? paymentDateMap.get(opp.id), value)
      }
    }

    return events
  }, [
    salesMetric, activePanel, opps, periodoMqls, periodoReunioes, periodoSales,
    paymentDateMap, producaoPaymentDateMap, revenueMap, producaoRevenueMap,
    resolveOriginLabel, mediumNameMap,
  ])

  const originTrend = useMemo(() => {
    if (metricEvents.length === 0) return { dates: [] as string[], series: [] as TrendSeries[] }

    // Eixo X: cobre o período filtrado e também eventos que caem fora dele
    // (em cohort, a venda pode acontecer depois da janela de geração do lead).
    let minDate = filters.startDate
    let maxDate = filters.endDate
    for (const e of metricEvents) {
      if (!minDate || e.date < minDate) minDate = e.date
      if (!maxDate || e.date > maxDate) maxDate = e.date
    }
    const dates = buildDateRange(minDate, maxDate)
    const dateIndex = new Map(dates.map((d, i) => [d, i]))

    const agg = new Map<string, { total: number; points: { value: number; leads: OppRow[] }[] }>()
    for (const e of metricEvents) {
      const i = dateIndex.get(e.date)
      if (i === undefined) continue
      let entry = agg.get(e.origin)
      if (!entry) {
        entry = { total: 0, points: dates.map(() => ({ value: 0, leads: [] as OppRow[] })) }
        agg.set(e.origin, entry)
      }
      entry.total += e.value
      entry.points[i].value += e.value
      entry.points[i].leads.push(e.opp)
    }

    // Cor por ORIGEM (não pela posição no ranking): a mesma origem mantém a cor
    // quando o período muda e é a mesma cor usada nos donuts/barras.
    const colorMap = buildLabelColorMap(agg.keys())
    const series: TrendSeries[] = Array.from(agg.entries())
      .map(([label, { total, points }]) => ({
        key: label,
        label,
        color: colorMap.get(label) ?? 'var(--series-1)',
        total,
        points: points.map((p, i) => ({ date: dates[i], value: p.value, leads: p.leads })),
      }))
      .sort((a, b) => b.total - a.total)

    return { dates, series }
  }, [metricEvents, filters.startDate, filters.endDate])

  const midiaOrigins = useMemo(
    () => originTrend.series.map((s) => s.label),
    [originTrend.series],
  )

  // Se a origem escolhida sumir (troca de métrica/período), volta para "todas"
  const effectiveMediaOrigin = midiaOrigins.includes(mediaOrigin) ? mediaOrigin : ALL_ORIGINS

  // ── Detalhamento de mídia (utm_medium) da métrica ativa, opcionalmente por origem ──
  const midiaBreakdown = useMemo(() => {
    const agg = new Map<string, { count: number; leads: OppRow[] }>()
    for (const e of metricEvents) {
      if (effectiveMediaOrigin !== ALL_ORIGINS && e.origin !== effectiveMediaOrigin) continue
      const entry = agg.get(e.media) ?? { count: 0, leads: [] }
      entry.count += e.value
      entry.leads.push(e.opp)
      agg.set(e.media, entry)
    }
    return Array.from(agg.entries())
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [metricEvents, effectiveMediaOrigin])

  // ── Avg cycle (critério = data_pagamento_entrada) ──
  const avgCycle = useMemo(() => {
    if (activePanel === 'produtividade') {
      const s = filters.startDate
      const e = filters.endDate
      const closedInPeriod = producaoOpps.filter((o) => {
        const pd = producaoPaymentDateMap.get(o.id)
        return pd && pd >= s && pd <= e
      })
      return computeAvgCycle(closedInPeriod, producaoPaymentDateMap)
    }
    return computeAvgCycle(opps, paymentDateMap)
  }, [activePanel, opps, producaoOpps, filters.startDate, filters.endDate, paymentDateMap, producaoPaymentDateMap])

  // ── Closing cycle (data_realizacao_vendas → data_pagamento_entrada) ──
  const closingCycle = useMemo(() => {
    if (activePanel === 'produtividade') {
      const s = filters.startDate
      const e = filters.endDate
      const closedInPeriod = producaoOpps.filter((o) => {
        const pd = producaoPaymentDateMap.get(o.id)
        return pd && pd >= s && pd <= e
      })
      return computeClosingCycle(closedInPeriod, producaoPaymentDateMap)
    }
    return computeClosingCycle(opps, paymentDateMap)
  }, [activePanel, opps, producaoOpps, filters.startDate, filters.endDate, paymentDateMap, producaoPaymentDateMap])

  // ── ROAS / ROI — totalInvestment inclui Meta Ads + equipe orgânica ──
  const totalInvestment = metaKpis.spend + organicInvestment
  const roas = activeRevenueKpis.valorFaturado > 0 && totalInvestment > 0
    ? activeRevenueKpis.valorFaturado / totalInvestment
    : 0
  const roi = totalInvestment > 0
    ? ((activeRevenueKpis.valorFaturado - totalInvestment) / totalInvestment) * 100
    : 0

  // ── Helpers ──
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

  // ── Error state ──
  if (error) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Performance por Origem — evolução dia a dia + detalhamento de mídia */}
      <div>
        <SectionHeader
          title="Performance por Origem"
          description="Evolução dia a dia de MQLs, reuniões e vendas por canal de origem"
        />
        <div className="mt-3 space-y-3">
          <OriginTrendChart
            title="Performance por Origem"
            subtitle="Cada linha é uma origem · passe o mouse para ver o dia a dia"
            dates={originTrend.dates}
            series={originTrend.series}
            metric={salesMetric}
            onMetricChange={setSalesMetric}
            onPointClick={(origin, date, leads, metricLabel) =>
              openModal(`${metricLabel} — ${origin} · ${date.split('-').reverse().join('/')}`, leads)
            }
            valueFormatter={salesMetric === 'faturamento' || salesMetric === 'caixa' ? fmtCurrencyCompact : undefined}
            emptyMsg="Sem dados de origem no período."
          />

          <MediaBreakdownCard
            title="Detalhamento de mídia"
            subtitle={`De onde o lead veio dentro do canal (bio, direct, stories…) · ${METRIC_TITLES[salesMetric]}`}
            data={midiaBreakdown}
            origins={midiaOrigins}
            selectedOrigin={effectiveMediaOrigin}
            onOriginChange={setMediaOrigin}
            valueFormatter={salesMetric === 'faturamento' || salesMetric === 'caixa' ? fmtCurrencyCompact : undefined}
            onRowClick={(media, leads) =>
              openModal(`${METRIC_TITLES[salesMetric]} — mídia: ${media}`, leads)
            }
            emptyMsg="Sem dados de mídia no período."
          />
        </div>
      </div>

      {/* Section 1: KPI Cards */}
      <div>
        <SectionHeader
          title="Indicadores"
          description={activePanel === 'cohort' ? 'Cohort — métricas por data de geração do lead' : 'Produtividade — eventos que aconteceram no período, respeitando apenas os filtros ativos'}
        />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <KpiCard
            label="Prazo Médio de Compra"
            value={avgCycle !== null ? `${avgCycle} dias` : '—'}
            icon={Clock}
            loading={loading}
            variant="highlight"
          />
          <KpiCard
            label="Ciclo de Fechamento"
            value={closingCycle !== null ? `${closingCycle} dias` : '—'}
            icon={Clock}
            loading={loading}
            variant="info"
            subValue="reunião → pagamento"
          />
          {totalInvestment > 0 && (
            <KpiCard
              label={hasPaidTraffic && organicInvestment > 0 ? 'Investimento Total' : hasPaidTraffic ? 'Investimento' : 'Investimento Equipe'}
              value={fmtCurrency(totalInvestment)}
              icon={DollarSign}
              loading={loading}
              subValue={hasPaidTraffic && organicInvestment > 0
                ? `Meta ${fmtCurrencyCompact(metaKpis.spend)} + Equipe ${fmtCurrencyCompact(organicInvestment)}`
                : undefined}
            />
          )}
          <KpiCard label="Faturamento bruto" value={fmtCurrency(activeRevenueKpis.valorFaturado)} icon={TrendingUp} loading={loading} variant="highlight" />
          <KpiCard label="Caixa recebido" value={fmtCurrency(activeRevenueKpis.valorEntrada)} icon={DollarSign} loading={loading} />
          <KpiCard label="Taxa de recebimento" value={fmtPct(taxaRecebimento)} icon={Banknote} loading={loading} subValue="caixa / faturamento" />
          {totalInvestment > 0 && (
            <KpiCard label="ROAS" value={roas > 0 ? `${roas.toFixed(2)}x` : '—'} icon={BarChart2} loading={loading} subValue="faturamento / investimento" />
          )}
          {totalInvestment > 0 && (
            <KpiCard label="ROI" value={roi !== 0 ? `${roi.toFixed(1)}%` : '—'} icon={TrendingUp} loading={loading} subValue="(fat. − invest.) / invest." />
          )}
        </div>
      </div>

      {/* Section 2: Funil de Conversão */}
      {activePanel === 'cohort' && cohortRows.length > 0 && (
        <div>
          <SectionHeader title="Funil de Conversão" description="Progresso dos leads em cada etapa" />
          <div className="mt-3 space-y-3">
            <FunnelViz
              loading={loading}
              steps={buildFunnelSteps([
                { label: 'Leads', count: cohortTotals.leads, onClick: () => openModal('Leads', opps), cost: cpe(totalInvestment, cohortTotals.leads) },
                { label: 'MQLs', count: cohortTotals.mqls, onClick: () => openModal('MQLs', filterUniqueMqls(opps)), cost: cpe(totalInvestment, cohortTotals.mqls) },
                { label: 'Agendados', count: cohortTotals.agendados, onClick: () => openModal('Agendados', opps.filter((o) => !!o.data_agendamento_reuniao)), cost: cpe(totalInvestment, cohortTotals.agendados) },
                { label: 'Reuniões', count: cohortTotals.reunioes, onClick: () => openModal('Reuniões', opps.filter((o) => !!o.data_realizacao_vendas)), cost: cpe(totalInvestment, cohortTotals.reunioes) },
                { label: 'Fechados', count: cohortTotals.fechados, onClick: () => openModal('Fechados', opps.filter((o) => paymentDateMap.has(o.id))), cost: cpe(totalInvestment, cohortTotals.fechados) },
              ])}
            />
            <div className="flex items-center gap-2">
              <KpiCard
                label="Conectados"
                value={fmtNumber(cohortTotals.conectados)}
                icon={Link2}
                loading={loading}
                subValue={cpe(totalInvestment, cohortTotals.conectados)}
                onClick={() => openModal('Conectados', opps.filter((o) => !!o.data_conectado))}
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
        </div>
      )}
      {activePanel === 'produtividade' && !producaoLoading && producaoRows.length > 0 && (
        <div>
          <SectionHeader title="Etapas independentes" description="Cada etapa é contada pela sua própria data, sem encadear uma na outra" />
          <div className="mt-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <KpiCard
                label="Leads gerados"
                value={fmtNumber(periodoLeads.length)}
                icon={Users}
                loading={producaoLoading}
                subValue={cpe(totalInvestment, periodoLeads.length)}
                onClick={() => openModal('Leads gerados', periodoLeads)}
              />
              <KpiCard
                label="MQLs"
                value={fmtNumber(periodoMqls.length)}
                icon={BadgeCheck}
                loading={producaoLoading}
                variant="highlight"
                subValue={cpe(totalInvestment, periodoMqls.length)}
                onClick={() => openModal('MQLs', periodoMqls)}
              />
              <KpiCard
                label="Conectados"
                value={fmtNumber(producaoTotals.conectados)}
                icon={Link2}
                loading={producaoLoading}
                subValue={cpe(totalInvestment, producaoTotals.conectados)}
                onClick={() => openModal('Conectados', producaoRows.flatMap((r) => r.leads_conectados))}
              />
              {/* Em Produtividade a conta e por data do evento: um lead conectado
                  FORA da janela cai aqui. "Nao conectados" fazia o leitor concluir
                  que ninguem falou com a pessoa — quando o certo e "nao conectou
                  neste periodo". */}
              <KpiCard
                label="Sem conexão no período"
                value={fmtNumber(produtividadeNaoConectados.length)}
                icon={Users}
                loading={producaoLoading}
                onClick={() => openModal('Sem conexão no período', produtividadeNaoConectados)}
              />
              <KpiCard
                label="Agendados"
                value={fmtNumber(producaoTotals.agendados)}
                icon={CalendarCheck2}
                loading={producaoLoading}
                subValue={cpe(totalInvestment, producaoTotals.agendados)}
                onClick={() => openModal('Agendados', producaoRows.flatMap((r) => r.leads_agendados))}
              />
              <KpiCard
                label="Reuniões"
                value={fmtNumber(producaoTotals.reunioes)}
                icon={Video}
                loading={producaoLoading}
                subValue={cpe(totalInvestment, producaoTotals.reunioes)}
                onClick={() => openModal('Reuniões', producaoRows.flatMap((r) => r.leads_reunioes))}
              />
              <KpiCard
                label="Fechados"
                value={fmtNumber(producaoTotals.fechados)}
                icon={Banknote}
                loading={producaoLoading}
                variant="highlight"
                subValue={cpe(totalInvestment, producaoTotals.fechados)}
                onClick={() => openModal('Fechados', producaoRows.flatMap((r) => r.leads_fechados))}
              />
              <KpiCard
                label="No-shows"
                value={fmtNumber(periodoNoShows.length)}
                icon={UserX}
                loading={producaoLoading}
                onClick={() => openModal('No-shows', periodoNoShows)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Section 3: Segmentação */}
      <div>
        <SectionHeader title="Segmentação" description="Colunas por métrica: MQLs, Reuniões e Vendas; cada coluna detalha funil, campanha, origem e mídia" />
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
                title="MQLs por origem"
                data={mqlsByOrigin}
                onSliceClick={openChartModal('MQLs', mqlsByOrigin)}
              />
              <DonutChart
                title="MQLs por mídia"
                data={mqlsByMidia}
                onSliceClick={openChartModal('MQLs', mqlsByMidia)}
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
                title="Reuniões por origem"
                data={reunioesByOrigin}
                onSliceClick={openChartModal('Reuniões', reunioesByOrigin)}
              />
              <DonutChart
                title="Reuniões por mídia"
                data={reunioesByMidia}
                onSliceClick={openChartModal('Reuniões', reunioesByMidia)}
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
                    className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      salesMetric === m
                        ? 'bg-empire-surface text-empire-void shadow-sm'
                        : 'text-empire-subtle hover:text-empire-void'
                    }`}
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
                title="Vendas por origem"
                data={salesByOrigin}
                onSliceClick={openChartModal('Vendas', salesByOrigin)}
                valueFormatter={salesMetric !== 'count' ? fmtCurrencyCompact : undefined}
              />
              <DonutChart
                title="Vendas por mídia"
                data={salesByMidia}
                onSliceClick={openChartModal('Vendas', salesByMidia)}
                valueFormatter={salesMetric !== 'count' ? fmtCurrencyCompact : undefined}
              />
            </div>
          </div>
        </div>
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
