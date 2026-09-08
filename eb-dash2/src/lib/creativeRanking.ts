import type { OppRow, MetaRow, RevenueRow } from '@/hooks/useTrafego'
import { buildPaymentDateMap, isMqlByTag, caixaRecebidoAcumulado, faturamentoDaVenda } from '@/hooks/useTrafego'

export function extractCreativeId(utmTerm: string): string | null {
  const match = utmTerm.match(/(CR|AN)-(\d+)/)
  return match ? `${match[1]}-${match[2]}` : null
}

export function extractPublicCode(raw: string): string | null {
  const parts = raw.split('_').map((part) => part.trim()).filter(Boolean)
  return parts.length >= 3 ? parts[2] ?? null : null
}

export function cpvAlertClass(cpv: number): string {
  if (cpv > 9000) return 'bg-red-50 text-red-700 font-semibold'
  if (cpv > 6000) return 'bg-amber-50 text-amber-700 font-semibold'
  return ''
}

export function isDateInPeriod(dateStr: string | null | undefined, startDate: string, endDate: string): boolean {
  return !!dateStr && dateStr >= startDate && dateStr <= endDate
}

export interface PublicBreakdownRow {
  code: string
  label: string
  investimento: number
  faturamento: number
  caixa: number
  leads: number
  cpl: number
  mql: number
  cpmql: number
  reunioes: number
  vendas: number
  cpv: number
  ctr: number
  cpm: number
  convPagina: number
  videoHook: number
  leadsList: OppRow[]
  mqlLeads: OppRow[]
  reunioesList: OppRow[]
  salesLeads: OppRow[]
}

export interface CreativeRankingRow {
  code: string
  name: string
  previewUrl?: string
  investimento: number
  faturamento: number
  caixa: number
  leads: number
  cpl: number
  mql: number
  cpmql: number
  reunioes: number
  vendas: number
  cpv: number
  ctr: number
  cpm: number
  convPagina: number
  videoHook: number
  leadsList: OppRow[]
  mqlLeads: OppRow[]
  reunioesList: OppRow[]
  salesLeads: OppRow[]
  publicRows: PublicBreakdownRow[]
}

interface AggregateOptions {
  opps: OppRow[]
  metaRows: MetaRow[]
  revenueRows: RevenueRow[]
  startDate: string
  endDate: string
  mode: 'cohort' | 'produtividade'
  creativeMap: Map<string, string>
  creativeAdUrlMap: Map<string, string>
  publicNameMap: Map<string, string>
}

export function aggregateCreativeRanking(options: AggregateOptions): CreativeRankingRow[] {
  const {
    opps,
    metaRows,
    revenueRows,
    startDate,
    endDate,
    mode,
    creativeMap,
    creativeAdUrlMap,
    publicNameMap,
  } = options

  const paymentDateMap = buildPaymentDateMap(revenueRows)

  const oppCreativeMap = new Map<string, string>()
  for (const opp of opps) {
    const crId = extractCreativeId(opp.contatos?.utm_term?.trim() ?? '')
    if (crId) oppCreativeMap.set(opp.id, crId)
  }

  const aggregatedByCreative = new Map<string, {
    spend: number
    impressions: number
    clicks: number
    ctr: number
    cpm: number
    landing_page_views: number
    video_views: number
    link_clicks: number
    leads: number
  }>()

  for (const row of metaRows) {
    const adName = row.ad_name?.trim() ?? ''
    const crId = extractCreativeId(adName)
    if (!crId) continue
    const entry = aggregatedByCreative.get(crId) ?? { spend: 0, impressions: 0, clicks: 0, ctr: 0, cpm: 0, landing_page_views: 0, video_views: 0, link_clicks: 0, leads: 0 }
    entry.spend += row.spend ?? 0
    entry.impressions += row.impressions ?? 0
    entry.clicks += row.clicks ?? 0
    entry.ctr = row.ctr ?? 0
    entry.cpm = row.cpm ?? 0
    entry.landing_page_views += row.landing_page_views ?? 0
    entry.video_views += row.video_views ?? 0
    entry.link_clicks += row.link_clicks ?? 0
    entry.leads += row.leads ?? 0
    aggregatedByCreative.set(crId, entry)
  }

  const revenueByCreative = new Map<string, { faturamento: number; caixa: number }>()
  for (const rev of revenueRows) {
    const crId = oppCreativeMap.get(rev.oportunidade_id)
    if (!crId) continue
    const entry = revenueByCreative.get(crId) ?? { faturamento: 0, caixa: 0 }
    entry.faturamento += faturamentoDaVenda(rev)
    entry.caixa += caixaRecebidoAcumulado(rev)
    revenueByCreative.set(crId, entry)
  }

  const publicBreakdownByCreative = new Map<string, Map<string, PublicBreakdownRow>>()
  const oppIndex = new Map(opps.map((opp) => [opp.id, opp]))

  const ensurePublicEntry = (creativeCode: string, publicCode: string, fallbackLabel?: string | null) => {
    const byPublic = publicBreakdownByCreative.get(creativeCode) ?? new Map<string, PublicBreakdownRow>()
    const existing = byPublic.get(publicCode)
    if (existing) return existing

    const next: PublicBreakdownRow = {
      code: publicCode,
      label: publicNameMap.get(publicCode) ?? fallbackLabel ?? publicCode,
      investimento: 0,
      faturamento: 0,
      caixa: 0,
      leads: 0,
      cpl: 0,
      mql: 0,
      cpmql: 0,
      reunioes: 0,
      vendas: 0,
      cpv: 0,
      ctr: 0,
      cpm: 0,
      convPagina: 0,
      videoHook: 0,
      leadsList: [],
      mqlLeads: [],
      reunioesList: [],
      salesLeads: [],
    }
    byPublic.set(publicCode, next)
    publicBreakdownByCreative.set(creativeCode, byPublic)
    return next
  }

  for (const row of metaRows) {
    const adName = row.ad_name?.trim() ?? ''
    const creativeCode = extractCreativeId(adName)
    const publicCode = extractPublicCode(adName)
    if (!creativeCode || !publicCode) continue

    const entry = ensurePublicEntry(creativeCode, publicCode, row.adset_name?.trim() ?? null)
    entry.investimento += row.spend ?? 0
    const runtime = entry as PublicBreakdownRow & {
      _impressions?: number
      _clicks?: number
      _landingPageViews?: number
      _leads?: number
      _videoViews?: number
    }
    runtime._impressions = (runtime._impressions ?? 0) + (row.impressions ?? 0)
    runtime._clicks = (runtime._clicks ?? 0) + (row.clicks ?? 0)
    runtime._landingPageViews = (runtime._landingPageViews ?? 0) + (row.landing_page_views ?? 0)
    runtime._leads = (runtime._leads ?? 0) + (row.leads ?? 0)
    runtime._videoViews = (runtime._videoViews ?? 0) + (row.video_views ?? 0)
  }

  for (const opp of opps) {
    const trackingCode = opp.contatos?.utm_term?.trim() ?? ''
    const creativeCode = extractCreativeId(trackingCode)
    const publicCode = extractPublicCode(trackingCode)
    if (!creativeCode || !publicCode) continue

    const entry = ensurePublicEntry(creativeCode, publicCode)
    const leadDate = opp.data_lead_recebido?.slice(0, 10) ?? null
    const isMqlInPeriod = mode === 'produtividade' ? isDateInPeriod(leadDate, startDate, endDate) : true

    if (isMqlInPeriod) {
      entry.leads += 1
      entry.leadsList.push(opp)
    }

    if (isMqlByTag(opp.contatos) && isMqlInPeriod) {
      entry.mql += 1
      entry.mqlLeads.push(opp)
    }

    const reuniaoDate = opp.data_realizacao_vendas
    const isReuniaoInPeriod = mode === 'produtividade' ? isDateInPeriod(reuniaoDate, startDate, endDate) : !!reuniaoDate
    if (isReuniaoInPeriod) {
      entry.reunioes += 1
      entry.reunioesList.push(opp)
    }

    if (mode === 'produtividade') {
      const paymentDate = paymentDateMap.get(opp.id)
      if (paymentDate && paymentDate >= startDate && paymentDate <= endDate) {
        entry.vendas += 1
        entry.salesLeads.push(opp)
      }
    } else if (paymentDateMap.has(opp.id)) {
      entry.vendas += 1
      entry.salesLeads.push(opp)
    }
  }

  for (const revenue of revenueRows) {
    const opp = oppIndex.get(revenue.oportunidade_id)
    const trackingCode = opp?.contatos?.utm_term?.trim() ?? ''
    const creativeCode = extractCreativeId(trackingCode)
    const publicCode = extractPublicCode(trackingCode)
    if (!creativeCode || !publicCode) continue

    const entry = ensurePublicEntry(creativeCode, publicCode)
    entry.faturamento += faturamentoDaVenda(revenue)
    entry.caixa += caixaRecebidoAcumulado(revenue)
  }

  for (const byPublic of publicBreakdownByCreative.values()) {
    for (const entry of byPublic.values()) {
      const runtime = entry as PublicBreakdownRow & {
        _impressions?: number
        _clicks?: number
        _landingPageViews?: number
        _leads?: number
        _videoViews?: number
      }
      const impressions = runtime._impressions ?? 0
      const clicks = runtime._clicks ?? 0
      const landingPageViews = runtime._landingPageViews ?? 0
      const leads = runtime._leads ?? 0
      const videoViews = runtime._videoViews ?? 0

      entry.ctr = impressions > 0 ? (clicks / impressions * 100) : 0
      entry.cpm = impressions > 0 ? (entry.investimento / impressions * 1000) : 0
      entry.convPagina = landingPageViews > 0 ? (leads / landingPageViews * 100) : 0
      entry.videoHook = impressions > 0 ? (videoViews / impressions * 100) : 0
      entry.cpl = entry.leads > 0 ? entry.investimento / entry.leads : 0
      entry.cpmql = entry.mql > 0 ? entry.investimento / entry.mql : 0
      entry.cpv = entry.vendas > 0 ? entry.investimento / entry.vendas : 0
    }
  }

  const creativeLeadsMap = new Map<string, {
    leadsCount: number
    mqlCount: number
    reunioesCount: number
    salesCount: number
    leadsList: OppRow[]
    mqlLeads: OppRow[]
    reunioesList: OppRow[]
    salesLeads: OppRow[]
  }>()

  for (const opp of opps) {
    const crId = extractCreativeId(opp.contatos?.utm_term?.trim() ?? '')
    if (!crId) continue
    const entry = creativeLeadsMap.get(crId) ?? { leadsCount: 0, mqlCount: 0, reunioesCount: 0, salesCount: 0, leadsList: [], mqlLeads: [], reunioesList: [], salesLeads: [] }
    const leadDate = opp.data_lead_recebido?.slice(0, 10) ?? null
    const isMqlInPeriod = mode === 'produtividade' ? isDateInPeriod(leadDate, startDate, endDate) : true

    if (isMqlInPeriod) {
      entry.leadsCount++
      entry.leadsList.push(opp)
    }
    if (isMqlByTag(opp.contatos) && isMqlInPeriod) {
      entry.mqlCount++
      entry.mqlLeads.push(opp)
    }

    const reuniaoDate = opp.data_realizacao_vendas
    const isReuniaoInPeriod = mode === 'produtividade' ? isDateInPeriod(reuniaoDate, startDate, endDate) : !!reuniaoDate
    if (isReuniaoInPeriod) {
      entry.reunioesCount++
      entry.reunioesList.push(opp)
    }

    if (mode === 'produtividade') {
      const pd = paymentDateMap.get(opp.id)
      if (pd && pd >= startDate && pd <= endDate) {
        entry.salesCount++
        entry.salesLeads.push(opp)
      }
    } else if (paymentDateMap.has(opp.id)) {
      entry.salesCount++
      entry.salesLeads.push(opp)
    }
    creativeLeadsMap.set(crId, entry)
  }

  const allCodes = new Set([...creativeLeadsMap.keys(), ...aggregatedByCreative.keys()])
  const result: CreativeRankingRow[] = []

  for (const code of allCodes) {
    const oppData = creativeLeadsMap.get(code) ?? { leadsCount: 0, mqlCount: 0, reunioesCount: 0, salesCount: 0, leadsList: [], mqlLeads: [], reunioesList: [], salesLeads: [] }
    const agg = aggregatedByCreative.get(code)
    const inv = agg?.spend ?? 0
    const rev = revenueByCreative.get(code) ?? { faturamento: 0, caixa: 0 }

    const ctr = agg && agg.impressions > 0 ? (agg.clicks / agg.impressions * 100) : 0
    const cpm = agg && agg.impressions > 0 ? (agg.spend / agg.impressions * 1000) : 0
    const convPagina = agg && agg.landing_page_views > 0 ? (agg.leads / agg.landing_page_views * 100) : 0
    const videoHook = agg && agg.impressions > 0 ? (agg.video_views / agg.impressions * 100) : 0

    result.push({
      code,
      name: creativeMap.get(code) ?? code,
      previewUrl: creativeAdUrlMap.get(code),
      investimento: inv,
      faturamento: rev.faturamento,
      caixa: rev.caixa,
      leads: oppData.leadsCount,
      cpl: oppData.leadsCount > 0 ? inv / oppData.leadsCount : 0,
      mql: oppData.mqlCount,
      cpmql: oppData.mqlCount > 0 ? inv / oppData.mqlCount : 0,
      reunioes: oppData.reunioesCount,
      vendas: oppData.salesCount,
      cpv: oppData.salesCount > 0 ? inv / oppData.salesCount : 0,
      ctr,
      cpm,
      convPagina,
      videoHook,
      leadsList: oppData.leadsList,
      mqlLeads: oppData.mqlLeads,
      reunioesList: oppData.reunioesList,
      salesLeads: oppData.salesLeads,
      publicRows: Array.from(publicBreakdownByCreative.get(code)?.values() ?? []).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    })
  }

  return result.filter((r) => r.investimento > 0)
}
