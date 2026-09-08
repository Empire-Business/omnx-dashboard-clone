import { useState, useEffect, useMemo, useCallback } from 'react'
import { isFilterActive, applyFilterValue } from '@/types/filters'
import type { FilterValues } from '@/types/filters'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadListModal } from '@/components/leads/LeadCard'
import { toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { applyRecuperacaoFilter, type RecuperacaoMode } from '@/lib/constants'
import {
  computeRevenueKpis,
  buildCaixaPorCliente,
  computeLossReasons,
  computeAvgCycle,
  computeClosingCycle,
  buildPaymentDateMap,
  buildRevenueMap,
  isMqlByTag,
  isVendaExterna,
  buildCampaignFunnelMap,
  buildCampaignNameMap,
  computeMetaKpis,
  computePendentesAssinatura,
  buildAssinadasPorEtapa,
} from '@/hooks/useTrafego'
import type { OppRow, RevenueRow, MetaRow, MetaAccountDailyRow } from '@/hooks/useTrafego'
import { VENDA_DIRETA_CANAL } from '@/hooks/usePreVendas'
import { PendentesAssinaturaModal } from '@/components/vendas/PendentesAssinaturaModal'
import { CaixaPorClienteModal } from '@/components/vendas/CaixaPorClienteModal'
import { useCloserLeaderboard } from '@/hooks/useCloserLeaderboard'
import { useCloserProdutividade } from '@/hooks/useCloserProdutividade'
import { useMetas, getActiveMeta } from '@/hooks/useMetas'
import {
  SectionHeader,
  KpiCard,
  DonutChart,
  FunnelViz,
  VerticalBarChart,
  AppointmentOriginBreakdown,
  AppointmentBalance,
} from '@/components/dashboard'
import type { FunnelStep } from '@/components/dashboard'
import {
  DollarSign,
  Crosshair,
  CalendarDays,
  Users,
  Target,
  UserX,
  UserCheck,
  Percent,
  Clock,
  AlertTriangle,
  FileSignature,
  Share2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  metaRows?: MetaRow[]
  accountDailyRows?: MetaAccountDailyRow[]
  loading: boolean
  startDate: string
  endDate: string
  activePanel?: 'cohort' | 'produtividade'
  closerFilter?: FilterValues
  sdrFilter?: FilterValues
  canalFilter?: FilterValues
  funilFilter?: FilterValues
  campanhaFilter?: FilterValues
  /** Filtro de Recuperação da página — precisa chegar até as queries desta aba. */
  recuperacaoMode?: RecuperacaoMode
}

interface ModalLead {
  id: string
  contatos?: { nome?: string | null; email?: string | null; utm_source?: string | null } | null
  status?: string | null
  pipeline_name?: string | null
}

interface NormalizedRow {
  closer: string
  leads_count: number | null
  mqls: number
  agendados_vendas: number
  reunioes: number
  no_shows: number
  negociacao: number
  fechados: number
  conversao_pct: number
  taxa_no_show: number
  faturamento: number
  caixa: number
  ligacoes: number
  mensagens: number
  pessoasContatadas: number | null
  avg_response_seconds: number | null
  pct_sem_resposta: number | null
  allLeads: ModalLead[]
  mqlsLeads: ModalLead[]
  agendadosLeads: ModalLead[]
  reunioesLeads: ModalLead[]
  noShowsLeads: ModalLead[]
  negociacaoLeads: ModalLead[]
  fechadosLeads: ModalLead[]
}

// ─── Helpers ─────────────────────────────────────────────────

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
function cpe(spend: number, count: number): string | undefined {
  if (spend <= 0 || count <= 0) return undefined
  return fmtCurrencyCompact(spend / count)
}

function fmtResponseTime(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—'
  if (seconds < 60) return '< 1 min'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}

function responseTimeBadgeClass(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return ''
  if (seconds <= 900) return 'bg-empire-success/10 text-empire-success'
  if (seconds <= 3600) return 'bg-empire-warning/12 text-empire-primary'
  return 'bg-empire-danger/10 text-empire-danger'
}

function pctBadgeClass(pct: number, higherIsBetter: boolean): string {
  if (higherIsBetter) {
    if (pct >= 30) return 'bg-empire-success/10 text-empire-success'
    if (pct >= 15) return 'bg-empire-warning/12 text-empire-primary'
    return 'bg-empire-danger/10 text-empire-danger'
  } else {
    if (pct <= 20) return 'bg-empire-success/10 text-empire-success'
    if (pct <= 35) return 'bg-empire-warning/12 text-empire-primary'
    return 'bg-empire-danger/10 text-empire-danger'
  }
}

function noResponseBadgeClass(pct: number | null): string {
  if (pct === null) return ''
  if (pct <= 10) return 'bg-empire-warning/12 text-empire-primary'
  return 'bg-empire-danger/10 text-empire-danger'
}

const clickableTd = 'cursor-pointer hover:bg-empire-primary/10 transition-colors'

// ─── Funnel step builder ──────────────────────────────────────

function buildFunnelSteps(
  items: { label: string; count: number; onClick?: () => void; cost?: string }[]
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

interface ConversionBarItem {
  label: string
  reunioes: number
  fechados: number
  conversao_pct: number
}

// ─── Main component ───────────────────────────────────────────

export function GeralTab({
  opps,
  revenueRows,
  metaRows = [],
  accountDailyRows,
  loading,
  startDate,
  endDate,
  activePanel = 'cohort',
  closerFilter,
  sdrFilter,
  canalFilter,
  funilFilter,
  campanhaFilter,
  recuperacaoMode = 'exclude_recuperacao',
}: Props) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({ open: false, title: '', leads: [] })
  const [closerModal, setCloserModal] = useState<{ open: boolean; title: string; leads: ModalLead[] }>({ open: false, title: '', leads: [] })
  const [vendasExternasModal, setVendasExternasModal] = useState(false)
  const [pendentesModal, setPendentesModal] = useState(false)
  const [caixaModal, setCaixaModal] = useState(false)
  const [faturamentoModal, setFaturamentoModal] = useState(false)
  const [salesMetric, setSalesMetric] = useState<'count' | 'faturamento' | 'caixa'>('count')

  const isProdutividade = activePanel === 'produtividade'
  const metaKpis = useMemo(() => computeMetaKpis(metaRows, accountDailyRows), [metaRows, accountDailyRows])

  // Meta de conversão
  const { metas } = useMetas()
  const metaConversao = useMemo(
    () => getActiveMeta(metas, 'taxa_conversao_vendas', 'global'),
    [metas]
  )

  // Payment + revenue
  const paymentDateMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])
  // Caixa = dinheiro recebido DENTRO do período (soma o cronograma de pagamentos),
  // não o campo valor_entrada. Ver caixaRecebidoNoPeriodo em useTrafego.ts.
  const periodoCaixa = useMemo(() => ({ startDate, endDate }), [startDate, endDate])
  const revenueMap = useMemo(() => buildRevenueMap(revenueRows, periodoCaixa), [revenueRows, periodoCaixa])
  const revKpis = useMemo(() => computeRevenueKpis(revenueRows, periodoCaixa), [revenueRows, periodoCaixa])
  // Detalhamento do card "Caixa": quem trouxe cada real do período.
  const caixaPorClienteCohort = useMemo(
    () => buildCaixaPorCliente(revenueRows, opps, periodoCaixa),
    [revenueRows, opps, periodoCaixa],
  )
  // Pendência documental do modo Cohort. O equivalente de Produtividade vem do
  // useCloserProdutividade (prodPendentes), que trabalha com o universo do período.
  // A etapa "Assinada" da oportunidade também conta como assinatura — é assim que a
  // assinatura das vendas do omnx-desk chega ao CRM (ver isVendaSemAssinatura).
  const assinadasPorEtapa = useMemo(() => buildAssinadasPorEtapa(opps), [opps])
  const pendentesCohort = useMemo(
    () => computePendentesAssinatura(revenueRows, assinadasPorEtapa),
    [revenueRows, assinadasPorEtapa],
  )
  const prazoMedio = useMemo(() => computeAvgCycle(opps, paymentDateMap), [opps, paymentDateMap])

  // KPIs
  const kpis = useMemo(() => {
    const agendadosVendas = opps.filter(o => !!o.data_agendamento_vendas).length
    const reunioesRealizadas = opps.filter(o => !!o.data_realizacao_vendas).length
    const noShows = opps.filter(o => !!o.data_no_show_vendas && !o.data_realizacao_vendas).length
    const negociacao = opps.filter(o => !!o.data_negociacao).length
    // Venda Direta aparece por padrão em Fechados (é o filtro de canal quem decide
    // se ela entra ou não — ver matchesDimensionFilters / usePreVendas). O card
    // "Vendas Externas" abaixo é só um breakdown informativo, não um desconto.
    const fechados = opps.filter(o => paymentDateMap.has(o.id)).length
    const vendasExternasLeads = opps.filter(o => paymentDateMap.has(o.id) && isVendaExterna(o))
    const vendasExternas = vendasExternasLeads.length
    const leads = opps.length
    const mqlCount = opps.filter(o => isMqlByTag(o.contatos)).length

    return {
      leads,
      mqlCount,
      faturamentoBruto: revKpis.valorFaturado,
      caixaRecebido: revKpis.valorEntrada,
      taxaConversao: reunioesRealizadas > 0 ? Math.round((fechados / reunioesRealizadas) * 100) : 0,
      taxaNoShow: agendadosVendas > 0 ? Math.round((noShows / agendadosVendas) * 100) : 0,
      taxaComparecimento: agendadosVendas > 0 ? Math.round((reunioesRealizadas / agendadosVendas) * 100) : 0,
      taxaRecebimento: revKpis.valorFaturado > 0 ? Math.round((revKpis.valorEntrada / revKpis.valorFaturado) * 100) : 0,
      agendadosVendas,
      reunioesRealizadas,
      noShows,
      negociacao,
      fechados,
      vendasExternas,
      vendasExternasLeads,
    }
  }, [opps, paymentDateMap, revKpis])

  // Loss reasons (vendas)
  const lossWithout = useMemo(() => computeLossReasons(opps, false), [opps])
  const lossWith = useMemo(() => computeLossReasons(opps, true), [opps])

  // Closer data
  const { rows: closerRows, loading: closerLoading } = useCloserLeaderboard(opps, revenueRows, startDate, endDate)
  const { rows: prodRows, overall: prodOverall, pendentes: prodPendentes, caixaPorCliente: prodCaixaPorCliente, loading: prodLoading, error: prodError } =
    useCloserProdutividade(startDate, endDate, isProdutividade, {
      closerFilter,
      sdrFilter,
      canalFilter,
      funilFilter,
      campanhaFilter,
    }, recuperacaoMode)

  // O detalhamento tem que vir do MESMO universo do card. Em Produtividade o card
  // lê prodOverall (do useCloserProdutividade); usar a lista do Cohort aqui fazia
  // o modal divergir do card na mesma tela.
  const caixaPorCliente = isProdutividade ? prodCaixaPorCliente : caixaPorClienteCohort

  // Hook já aplica todos os filtros dimensionais — usar prodRows diretamente
  const filteredProdRows = prodRows

  const isCloserLoading = loading || (isProdutividade ? prodLoading : closerLoading)

  // ── Channel + funnel data ─────────────────────────────────────
  const [paidSourcesSet, setPaidSourcesSet] = useState<Set<string>>(new Set())
  const [channelNameMap, setChannelNameMap] = useState<Map<string, string>>(new Map())
  const [campaignFunnelMap, setCampaignFunnelMap] = useState<Map<string, string[]>>(new Map())
  const [campaignNameMap, setCampaignNameMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    async function loadChannelFunnel() {
      const wid = await getWorkspaceId()
      if (!wid) return
      const [paidRes, organicRes, campaignsRes] = await Promise.all([
        supabase.from('utm_sources').select('utm_source, nome').eq('workspace_id', wid),
        supabase.from('utm_sources_plain').select('utm_source, nome').eq('workspace_id', wid),
        supabase.from('utm_campaigns').select('nome, utm_campaign, funnels').eq('workspace_id', wid),
      ])
      const paid = new Set(
        (paidRes.data ?? []).map((r: { utm_source: string }) => r.utm_source).filter(Boolean)
      )
      setPaidSourcesSet(paid)
      const nameMap = new Map<string, string>()
      for (const r of [
        ...((paidRes.data ?? []) as { utm_source: string; nome: string }[]),
        ...((organicRes.data ?? []) as { utm_source: string; nome: string }[]),
      ]) {
        if (r.utm_source) nameMap.set(r.utm_source, r.nome || r.utm_source)
      }
      setChannelNameMap(nameMap)
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
    }
    void loadChannelFunnel()
  }, [])

  // Opps com pagamento no período — para prazo médio e conversão por funil em produtividade
  const [prodPaidOpps, setProdPaidOpps] = useState<OppRow[]>([])
  const [prodPaymentDateMap, setProdPaymentDateMap] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    if (!isProdutividade) return
    let cancelled = false
    async function load() {
      const wid = await getWorkspaceId()
      if (cancelled || !wid) return
      const startISO = toSPISOStart(startDate)
      const endISO = toSPISOEnd(endDate)

      const revRes = await supabase
        .from('vendas_fechamento')
        .select('oportunidade_id, data_pagamento_entrada')
        .eq('workspace_id', wid)
        .gte('data_pagamento_entrada', startISO)
        .lte('data_pagamento_entrada', endISO)
      if (cancelled) return

      const payMap = new Map<string, string>()
      for (const r of (revRes.data ?? []) as { oportunidade_id: string; data_pagamento_entrada: string }[]) {
        if (r.oportunidade_id && r.data_pagamento_entrada) {
          payMap.set(r.oportunidade_id, r.data_pagamento_entrada.slice(0, 10))
        }
      }
      if (payMap.size === 0) {
        if (!cancelled) { setProdPaidOpps([]); setProdPaymentDateMap(new Map()) }
        return
      }

      const oppIds = [...payMap.keys()]
      const allOpps: OppRow[] = []
      const BATCH = 100
      for (let i = 0; i < oppIds.length; i += BATCH) {
        const batch = oppIds.slice(i, i + BATCH)
        let q = supabase
          .from('oportunidades')
          .select('id, status, pipeline_name, data_lead_recebido, data_realizacao_vendas, vendedor_closer, sdr_name, contatos(nome, email, tags, utm_source, utm_campaign, owner_name, contact_source, print_instagram)')
        q = applyRecuperacaoFilter(q, recuperacaoMode)
        const res = await q.in('id', batch)
        if (cancelled) return
        allOpps.push(...((res.data ?? []) as unknown as OppRow[]))
      }
      if (!cancelled) { setProdPaidOpps(allOpps); setProdPaymentDateMap(payMap) }
    }
    void load()
    return () => { cancelled = true }
  }, [isProdutividade, startDate, endDate, recuperacaoMode])

  // Opps com reunião no período — denominador para funil/canal em produtividade
  // data_realizacao_vendas é DATE (sem timezone)
  const [prodReuniaoOpps, setProdReuniaoOpps] = useState<OppRow[]>([])
  useEffect(() => {
    if (!isProdutividade) { setProdReuniaoOpps([]); return }
    let cancelled = false
    async function load() {
      const wid = await getWorkspaceId()
      if (cancelled || !wid) return
      const PAGE_SIZE = 1000
      const all: OppRow[] = []
      let page = 0
      while (true) {
        let q = supabase
          .from('oportunidades')
          .select('id, data_realizacao_vendas, vendedor_closer, sdr_name, contatos(tags, utm_source, utm_campaign, owner_name, contact_source, print_instagram)')
          .eq('workspace_id', wid)
          .gte('data_realizacao_vendas', startDate)
          .lte('data_realizacao_vendas', endDate)
        q = applyRecuperacaoFilter(q, recuperacaoMode)
        const res = await q
          .order('id')
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
        if (cancelled) return
        all.push(...((res.data ?? []) as unknown as OppRow[]))
        if ((res.data?.length ?? 0) < PAGE_SIZE) break
        page++
      }
      if (!cancelled) setProdReuniaoOpps(all)
    }
    void load()
    return () => { cancelled = true }
  }, [isProdutividade, startDate, endDate, recuperacaoMode])

  const matchesDimensionFilters = useCallback((opp: OppRow): boolean => {
    if (closerFilter && isFilterActive(closerFilter)) {
      const closer = (opp.vendedor_closer ?? '').replace(/\s+/g, ' ').trim()
      if (!applyFilterValue(closer, closerFilter)) return false
    }
    if (sdrFilter && isFilterActive(sdrFilter)) {
      const sdr = (opp.sdr_name || opp.contatos?.owner_name || '').replace(/\s+/g, ' ').trim()
      if (!applyFilterValue(sdr, sdrFilter)) return false
    }

    if (canalFilter && isFilterActive(canalFilter)) {
      // Venda direta é um "canal" próprio (fora do funil), independe do utm_source.
      const canalEfetivo = isVendaExterna(opp) ? VENDA_DIRETA_CANAL : (opp.contatos?.utm_source?.trim() ?? '')
      if (!applyFilterValue(canalEfetivo, canalFilter)) return false
    }

    const utmCampaign = opp.contatos?.utm_campaign
    const campaignCode = utmCampaign != null ? String(utmCampaign) : null

    if (funilFilter && isFilterActive(funilFilter)) {
      const funnels = campaignCode ? (campaignFunnelMap.get(campaignCode) ?? []) : []
      // For funilFilter, check if any funnel of this opp matches the include/exclude
      const matchingFunnel = funnels.find((f) => !funilFilter.exclude.includes(f))
      const includedFunnel = funilFilter.include.length > 0 ? funnels.find((f) => funilFilter.include.includes(f)) : matchingFunnel
      if (funilFilter.include.length > 0 && !includedFunnel) return false
      if (funilFilter.exclude.length > 0 && funnels.every((f) => funilFilter.exclude.includes(f)) && funnels.length > 0) return false
    }

    if (campanhaFilter && isFilterActive(campanhaFilter)) {
      const campaignName = campaignCode ? (campaignNameMap.get(campaignCode) ?? '') : ''
      if (!applyFilterValue(campaignName, campanhaFilter)) return false
    }

    return true
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(closerFilter), JSON.stringify(sdrFilter), JSON.stringify(canalFilter), JSON.stringify(funilFilter), JSON.stringify(campanhaFilter), campaignFunnelMap, campaignNameMap])

  // Venda direta aparece por padrão (é matchesDimensionFilters/canalFilter quem decide
  // se ela entra ou sai — ver o comentário em `kpis` acima).
  const filteredProdPaidOpps = useMemo(
    () => prodPaidOpps.filter(matchesDimensionFilters),
    [prodPaidOpps, matchesDimensionFilters],
  )

  const filteredProdReuniaoOpps = useMemo(
    () => prodReuniaoOpps.filter(matchesDimensionFilters),
    [prodReuniaoOpps, matchesDimensionFilters],
  )

  // Conversão por canal — diferencia cohort vs produtividade
  const conversionByCanal = useMemo((): ConversionBarItem[] => {
    const sourceOpps = isProdutividade
      ? filteredProdReuniaoOpps
      : opps.filter(o => !!o.data_realizacao_vendas)
    const activePayMap = isProdutividade ? prodPaymentDateMap : paymentDateMap

    const counts = new Map<string, { reunioes: number; fechados: number }>()
    for (const opp of sourceOpps) {
      const src = (opp.contatos as { utm_source?: string | null } | null)?.utm_source?.trim() ?? ''
      let label: string
      if (!src) {
        label = 'Desconhecido'
      } else if (paidSourcesSet.has(src)) {
        label = 'Tráfego'
      } else {
        label = channelNameMap.get(src) ?? src
      }
      const entry = counts.get(label) ?? { reunioes: 0, fechados: 0 }
      entry.reunioes++
      if (activePayMap.has(opp.id)) entry.fechados++
      counts.set(label, entry)
    }
    return [...counts.entries()]
      .map(([label, { reunioes, fechados }]) => ({
        label, reunioes, fechados,
        conversao_pct: reunioes > 0 ? Math.round((fechados / reunioes) * 100) : 0,
      }))
      .filter(r => r.reunioes >= 2)
      .sort((a, b) => b.conversao_pct - a.conversao_pct)
  }, [isProdutividade, opps, filteredProdReuniaoOpps, prodPaymentDateMap, paymentDateMap, paidSourcesSet, channelNameMap])

  // Conversão por funil — diferencia cohort vs produtividade (via utm_campaign → campaignFunnelMap)
  const conversionByFunil = useMemo((): ConversionBarItem[] => {
    if (!campaignFunnelMap.size) return []
    const sourceOpps = isProdutividade
      ? filteredProdReuniaoOpps
      : opps.filter(o => !!o.data_realizacao_vendas)
    const activePayMap = isProdutividade ? prodPaymentDateMap : paymentDateMap

    const counts = new Map<string, { reunioes: number; fechados: number }>()
    for (const opp of sourceOpps) {
      const utmCampaign = (opp.contatos as { utm_campaign?: string | null } | null)?.utm_campaign
      const funnels = utmCampaign != null ? (campaignFunnelMap.get(String(utmCampaign)) ?? []) : []
      for (const funnelName of funnels) {
        const entry = counts.get(funnelName) ?? { reunioes: 0, fechados: 0 }
        entry.reunioes++
        if (activePayMap.has(opp.id)) entry.fechados++
        counts.set(funnelName, entry)
      }
    }
    return [...counts.entries()]
      .map(([label, { reunioes, fechados }]) => ({
        label, reunioes, fechados,
        conversao_pct: reunioes > 0 ? Math.round((fechados / reunioes) * 100) : 0,
      }))
      .sort((a, b) => b.conversao_pct - a.conversao_pct)
  }, [isProdutividade, opps, filteredProdReuniaoOpps, prodPaymentDateMap, paymentDateMap, campaignFunnelMap])

  const conversionByCampanha = useMemo((): ConversionBarItem[] => {
    if (!campaignNameMap.size) return []
    const sourceOpps = isProdutividade
      ? filteredProdReuniaoOpps
      : opps.filter(o => !!o.data_realizacao_vendas)
    const activePayMap = isProdutividade ? prodPaymentDateMap : paymentDateMap

    const counts = new Map<string, { reunioes: number; fechados: number }>()
    for (const opp of sourceOpps) {
      const utmCampaign = (opp.contatos as { utm_campaign?: string | null } | null)?.utm_campaign
      const label = utmCampaign != null ? (campaignNameMap.get(String(utmCampaign)) ?? 'Sem campanha') : 'Sem campanha'
      const entry = counts.get(label) ?? { reunioes: 0, fechados: 0 }
      entry.reunioes++
      if (activePayMap.has(opp.id)) entry.fechados++
      counts.set(label, entry)
    }
    return [...counts.entries()]
      .map(([label, { reunioes, fechados }]) => ({
        label, reunioes, fechados,
        conversao_pct: reunioes > 0 ? Math.round((fechados / reunioes) * 100) : 0,
      }))
      .sort((a, b) => b.conversao_pct - a.conversao_pct)
  }, [isProdutividade, opps, filteredProdReuniaoOpps, prodPaymentDateMap, paymentDateMap, campaignNameMap])

  const reunioesByCampanha = useMemo(() => {
    const sourceOpps = isProdutividade ? filteredProdReuniaoOpps : opps.filter((o) => !!o.data_realizacao_vendas)
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    for (const opp of sourceOpps) {
      const utmCampaign = opp.contatos?.utm_campaign
      const label = utmCampaign != null ? (campaignNameMap.get(String(utmCampaign)) ?? 'Sem campanha') : 'Sem campanha'
      const entry = counts.get(label) ?? { count: 0, leads: [] }
      entry.count++
      entry.leads.push(opp)
      counts.set(label, entry)
    }
    return [...counts.entries()]
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [isProdutividade, filteredProdReuniaoOpps, opps, campaignNameMap])

  const mqlsByCampanha = useMemo(() => {
    const sourceOpps = isProdutividade ? filteredProdReuniaoOpps : opps
    const counts = new Map<string, { count: number; leads: OppRow[] }>()
    for (const opp of sourceOpps.filter((o) => isMqlByTag(o.contatos))) {
      const utmCampaign = opp.contatos?.utm_campaign
      const label = utmCampaign != null ? (campaignNameMap.get(String(utmCampaign)) ?? 'Sem campanha') : 'Sem campanha'
      const entry = counts.get(label) ?? { count: 0, leads: [] }
      entry.count++
      entry.leads.push(opp)
      counts.set(label, entry)
    }
    return [...counts.entries()]
      .map(([reason, { count, leads }]) => ({ reason, count, leads }))
      .sort((a, b) => b.count - a.count)
  }, [isProdutividade, filteredProdReuniaoOpps, opps, campaignNameMap])

  const fechadosByCampanha = useMemo(() => {
    const sourceOpps = isProdutividade ? filteredProdPaidOpps : opps.filter((o) => paymentDateMap.has(o.id))
    const activeRevMap = revenueMap
    const counts = new Map<string, { n: number; faturamento: number; caixa: number; leads: OppRow[] }>()
    for (const opp of sourceOpps) {
      const revenue = activeRevMap.get(opp.id)
      const utmCampaign = opp.contatos?.utm_campaign
      const label = utmCampaign != null ? (campaignNameMap.get(String(utmCampaign)) ?? 'Sem campanha') : 'Sem campanha'
      const entry = counts.get(label) ?? { n: 0, faturamento: 0, caixa: 0, leads: [] }
      entry.n++
      entry.faturamento += revenue?.faturamento ?? 0
      entry.caixa += revenue?.caixa ?? 0
      entry.leads.push(opp)
      counts.set(label, entry)
    }
    return [...counts.entries()]
      .map(([reason, { n, faturamento, caixa, leads }]) => ({
        reason,
        count: salesMetric === 'count' ? n : salesMetric === 'faturamento' ? faturamento : caixa,
        leads,
      }))
      .sort((a, b) => b.count - a.count)
  }, [isProdutividade, filteredProdPaidOpps, opps, paymentDateMap, revenueMap, campaignNameMap, salesMetric])

  // KPIs ativos: troca datasource conforme painel
  const activeKpis = useMemo(() => {
    if (!isProdutividade) return kpis
    // prodOverall já tem todos os filtros dimensionais aplicados pelo hook
    return {
      leads: prodOverall.leads_count,
      mqlCount: prodOverall.mqls,
      faturamentoBruto: prodOverall.faturamento,
      caixaRecebido: prodOverall.caixa,
      taxaConversao: prodOverall.reunioes > 0 ? Math.round((prodOverall.fechados / prodOverall.reunioes) * 100) : 0,
      taxaNoShow: prodOverall.agendados_vendas > 0 ? Math.round((prodOverall.no_shows / prodOverall.agendados_vendas) * 100) : 0,
      taxaComparecimento: prodOverall.agendados_vendas > 0 ? Math.round((prodOverall.reunioes / prodOverall.agendados_vendas) * 100) : 0,
      taxaRecebimento: prodOverall.faturamento > 0 ? Math.round((prodOverall.caixa / prodOverall.faturamento) * 100) : 0,
      agendadosVendas: prodOverall.agendados_vendas,
      reunioesRealizadas: prodOverall.reunioes,
      noShows: prodOverall.no_shows,
      negociacao: prodOverall.negociacao,
      // Respeita os filtros dimensionais (igual ao faturamento de prodOverall e ao funil),
      // via filteredProdPaidOpps — antes o card ignorava os filtros ativos (divergia).
      fechados: filteredProdPaidOpps.length,
      vendasExternasLeads: prodPaidOpps.filter(o => matchesDimensionFilters(o) && isVendaExterna(o)),
      vendasExternas: prodPaidOpps.filter(o => matchesDimensionFilters(o) && isVendaExterna(o)).length,
    }
  }, [isProdutividade, kpis, prodOverall, prodPaidOpps, filteredProdPaidOpps, matchesDimensionFilters])

  const prodActiveKpis = activeKpis as {
    leads?: number
    mqlCount?: number
    agendadosVendas: number
    reunioesRealizadas: number
    noShows?: number
    negociacao?: number
    fechados: number
    vendasExternas?: number
    vendasExternasLeads?: OppRow[]
    faturamentoBruto: number
    caixaRecebido: number
    taxaConversao: number
    taxaNoShow: number
    taxaComparecimento: number
    taxaRecebimento: number
  }

  // Prazo médio: troca fonte conforme painel
  const activePrazoMedio = useMemo(() => {
    if (isProdutividade) return computeAvgCycle(filteredProdPaidOpps, prodPaymentDateMap)
    return prazoMedio
  }, [isProdutividade, filteredProdPaidOpps, prodPaymentDateMap, prazoMedio])

  // Ciclo de fechamento: data_realizacao_vendas → data_pagamento_entrada
  const activeClosingCycle = useMemo(() => {
    if (isProdutividade) return computeClosingCycle(filteredProdPaidOpps, prodPaymentDateMap)
    return computeClosingCycle(opps, paymentDateMap)
  }, [isProdutividade, filteredProdPaidOpps, prodPaymentDateMap, opps, paymentDateMap])

  // Normalização das linhas do leaderboard
  const normalizedRows = useMemo((): NormalizedRow[] => {
    if (isProdutividade) {
      return filteredProdRows.map((row) => ({
        closer: row.closer,
        leads_count: row.leads_count,
        mqls: row.mqls,
        agendados_vendas: row.agendados_vendas,
        reunioes: row.reunioes,
        no_shows: row.no_shows,
        negociacao: row.negociacao,
        fechados: row.fechados,
        conversao_pct: row.reunioes > 0 ? Math.round((row.fechados / row.reunioes) * 100) : 0,
        taxa_no_show: row.agendados_vendas > 0 ? Math.round((row.no_shows / row.agendados_vendas) * 100) : 0,
        faturamento: row.faturamento,
        caixa: row.caixa,
        ligacoes: row.ligacoes,
        mensagens: row.mensagens,
        pessoasContatadas: row.pessoasContatadas,
        avg_response_seconds: null,
        pct_sem_resposta: null,
        allLeads: row.leadsLeads as ModalLead[],
        mqlsLeads: row.mqlsLeads as ModalLead[],
        agendadosLeads: row.agendadosLeads,
        reunioesLeads: row.reunioesLeads,
        noShowsLeads: row.noShowsLeads,
        negociacaoLeads: row.negociacaoLeads,
        fechadosLeads: row.fechadosLeads,
      }))
    }

    return closerRows.map((row) => ({
      closer: row.closer,
      leads_count: row.leads_count,
      mqls: row.mqls,
      agendados_vendas: row.agendados_vendas,
      reunioes: row.reunioes_realizadas,
      no_shows: row.no_shows,
      negociacao: row.negociacao,
      fechados: row.fechados,
      conversao_pct: row.conversao_pct,
      taxa_no_show: row.taxa_no_show,
      faturamento: row.faturamento,
      caixa: row.caixa,
      ligacoes: row.ligacoes,
      mensagens: row.mensagens,
      pessoasContatadas: null,
      avg_response_seconds: row.avg_response_seconds,
      pct_sem_resposta: row.pct_sem_resposta,
      allLeads: row.leads as ModalLead[],
      mqlsLeads: row.leads.filter(o => isMqlByTag(o.contatos)) as ModalLead[],
      agendadosLeads: row.leads.filter(o => !!o.data_agendamento_vendas) as ModalLead[],
      reunioesLeads: row.leads.filter(o => !!o.data_realizacao_vendas) as ModalLead[],
      noShowsLeads: row.leads.filter(o => !!o.data_no_show_vendas && !o.data_realizacao_vendas) as ModalLead[],
      negociacaoLeads: row.leads.filter(o => !!o.data_negociacao) as ModalLead[],
      fechadosLeads: row.leads.filter(o => paymentDateMap.has(o.id)) as ModalLead[],
    }))
  }, [isProdutividade, closerRows, filteredProdRows, paymentDateMap])

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const bestFechados = Math.max(...normalizedRows.map(r => r.fechados), 0)
  const bestReunioes = Math.max(...normalizedRows.map(r => r.reunioes), 0)

  // Em Produtividade, os KPIs (leads/mqls/faturamento/caixa/etc.) vêm de
  // useCloserProdutividade (prodOverall), que tem loading/erro PRÓPRIOS. Sem isto,
  // os cards usavam só o loading do usePreVendasProducao e exibiam 0/R$0 falso
  // enquanto o useCloserProdutividade ainda carregava — ou permanentemente em falha.
  const prodDataLoading = loading || (isProdutividade && prodLoading)
  // Card "Sem contrato assinado" — segue o modo ativo, igual aos demais indicadores.
  const activePendentes = isProdutividade ? prodPendentes : pendentesCohort
  const prodFinanceValue = (v: number) =>
    isProdutividade && prodError ? '—' : fmtCurrency(v)

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader title="Indicadores" description="" />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <KpiCard icon={Clock} label="Prazo Médio de Compra" value={activePrazoMedio !== null ? `${activePrazoMedio} dias` : '—'} loading={loading} variant="highlight" />
          <KpiCard icon={Clock} label="Ciclo de Fechamento" value={activeClosingCycle !== null ? `${activeClosingCycle} dias` : '—'} loading={loading} variant="info" subValue="reunião → pagamento" />
          <KpiCard icon={Crosshair} label="Leads" value={String(prodActiveKpis.leads ?? 0)} loading={prodDataLoading} variant="highlight" subValue={cpe(metaKpis.spend, prodActiveKpis.leads ?? 0)} />
          <KpiCard icon={Crosshair} label="MQLs" value={String(prodActiveKpis.mqlCount ?? 0)} loading={prodDataLoading} variant="highlight" subValue={cpe(metaKpis.spend, prodActiveKpis.mqlCount ?? 0)} />
          <KpiCard icon={CalendarDays} label="Agendados" value={String(prodActiveKpis.agendadosVendas ?? 0)} loading={prodDataLoading} variant="highlight" subValue={cpe(metaKpis.spend, prodActiveKpis.agendadosVendas ?? 0)} />
          <KpiCard icon={Users} label="Reuniões" value={String(prodActiveKpis.reunioesRealizadas ?? 0)} loading={prodDataLoading} variant="highlight" subValue={cpe(metaKpis.spend, prodActiveKpis.reunioesRealizadas ?? 0)} />
          <KpiCard icon={UserX} label="No-shows" value={String(prodActiveKpis.noShows ?? 0)} loading={prodDataLoading} />
          <KpiCard icon={AlertTriangle} label="Negociação" value={String(prodActiveKpis.negociacao ?? 0)} loading={prodDataLoading} />
          <KpiCard icon={Target} label="Fechados" value={String(prodActiveKpis.fechados ?? 0)} loading={prodDataLoading} variant="highlight" subValue={cpe(metaKpis.spend, prodActiveKpis.fechados ?? 0)} />
          <KpiCard
            icon={Share2}
            label="Vendas Externas"
            value={String(prodActiveKpis.vendasExternas ?? 0)}
            loading={loading}
            variant="info"
            subValue="venda direta"
            onClick={(prodActiveKpis.vendasExternas ?? 0) > 0 ? () => setVendasExternasModal(true) : undefined}
          />
          <KpiCard
            icon={DollarSign}
            label="Faturamento Bruto"
            value={prodFinanceValue(prodActiveKpis.faturamentoBruto)}
            loading={prodDataLoading}
            variant="highlight"
            subValue={caixaPorCliente.length > 0 ? 'ver por cliente' : undefined}
            onClick={caixaPorCliente.length > 0 ? () => setFaturamentoModal(true) : undefined}
          />
          <KpiCard
            icon={DollarSign}
            label="Caixa Recebido"
            value={prodFinanceValue(prodActiveKpis.caixaRecebido)}
            loading={prodDataLoading}
            subValue={caixaPorCliente.length > 0 ? 'ver por cliente' : undefined}
            onClick={caixaPorCliente.length > 0 ? () => setCaixaModal(true) : undefined}
          />
          <KpiCard
            icon={FileSignature}
            label="Sem contrato assinado"
            value={prodFinanceValue(activePendentes.faturamento)}
            loading={prodDataLoading}
            variant="warning"
            subValue={`${activePendentes.count} venda${activePendentes.count === 1 ? '' : 's'} · caixa ${fmtCurrency(activePendentes.caixa)}`}
            subText="já somam no faturamento"
            onClick={activePendentes.count > 0 ? () => setPendentesModal(true) : undefined}
          />
        </div>
      </div>

      <div>
        <SectionHeader title="Taxas de Conversão" description="" />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          <KpiCard
            icon={Target}
            label="Taxa de Conversão"
            value={`${activeKpis.taxaConversao}%`}
            loading={loading}
            subValue={metaConversao ? `Meta: ${Math.round(metaConversao.valor)}%` : undefined}
            variant={metaConversao ? (activeKpis.taxaConversao >= metaConversao.valor ? 'success' : 'danger') : (activeKpis.taxaConversao >= 30 ? 'success' : 'default')}
          />
          <KpiCard icon={UserX} label="Taxa de No-show" value={`${activeKpis.taxaNoShow}%`} loading={loading} variant={activeKpis.taxaNoShow > 30 ? 'danger' : 'default'} />
          <KpiCard icon={UserCheck} label="Taxa de Comparecimento" value={`${activeKpis.taxaComparecimento}%`} loading={loading} variant={activeKpis.taxaComparecimento >= 70 ? 'success' : 'default'} />
          <KpiCard icon={Percent} label="Taxa de Recebimento" value={`${activeKpis.taxaRecebimento}%`} loading={loading} subValue="caixa / faturamento" />
        </div>
      </div>

      <div>
        <SectionHeader title="Funil de Conversão" description="" />
        <div className="mt-3">
          <FunnelViz
            loading={loading}
            steps={buildFunnelSteps(
              isProdutividade
                ? [
                    { label: 'Leads', count: prodActiveKpis.leads ?? 0, cost: cpe(metaKpis.spend, prodActiveKpis.leads ?? 0) },
                    { label: 'MQLs', count: prodActiveKpis.mqlCount ?? 0, cost: cpe(metaKpis.spend, prodActiveKpis.mqlCount ?? 0) },
                    { label: 'Agend. Vendas', count: prodActiveKpis.agendadosVendas, cost: cpe(metaKpis.spend, prodActiveKpis.agendadosVendas) },
                    {
                      label: 'Reuniões',
                      count: prodActiveKpis.reunioesRealizadas,
                      cost: cpe(metaKpis.spend, prodActiveKpis.reunioesRealizadas),
                      onClick: filteredProdReuniaoOpps.length > 0
                        ? () => setModal({ open: true, title: 'Reuniões', leads: filteredProdReuniaoOpps })
                        : undefined,
                    },
                    {
                      label: 'Fechados',
                      count: prodActiveKpis.fechados,
                      cost: cpe(metaKpis.spend, prodActiveKpis.fechados),
                      onClick: filteredProdPaidOpps.length > 0
                        ? () => setModal({ open: true, title: 'Fechados', leads: filteredProdPaidOpps })
                        : undefined,
                    },
                  ]
                : [
                    { label: 'Leads', count: opps.length, onClick: () => setModal({ open: true, title: 'Leads', leads: opps }), cost: cpe(metaKpis.spend, opps.length) },
                    { label: 'MQLs', count: opps.filter((o) => isMqlByTag(o.contatos)).length, onClick: () => setModal({ open: true, title: 'MQLs', leads: opps.filter((o) => isMqlByTag(o.contatos)) }), cost: cpe(metaKpis.spend, opps.filter((o) => isMqlByTag(o.contatos)).length) },
                    { label: 'Agend. Vendas', count: opps.filter((o) => !!o.data_agendamento_vendas).length, onClick: () => setModal({ open: true, title: 'Agend. Vendas', leads: opps.filter((o) => !!o.data_agendamento_vendas) }), cost: cpe(metaKpis.spend, opps.filter((o) => !!o.data_agendamento_vendas).length) },
                    { label: 'Reuniões', count: opps.filter((o) => !!o.data_realizacao_vendas).length, onClick: () => setModal({ open: true, title: 'Reuniões', leads: opps.filter((o) => !!o.data_realizacao_vendas) }), cost: cpe(metaKpis.spend, opps.filter((o) => !!o.data_realizacao_vendas).length) },
                    { label: 'Fechados', count: opps.filter((o) => paymentDateMap.has(o.id)).length, onClick: () => setModal({ open: true, title: 'Fechados', leads: opps.filter((o) => paymentDateMap.has(o.id)) }), cost: cpe(metaKpis.spend, opps.filter((o) => paymentDateMap.has(o.id)).length) },
                  ]
            )}
          />
        </div>
      </div>

      {/* Section 3.5: Origem dos eventos (IA vs humano) */}
      <AppointmentOriginBreakdown
        opps={opps}
        revenueRows={revenueRows}
        loading={loading}
      />

      {/* Section 3.6: Saldo de agendamentos de vendas */}
      <AppointmentBalance
        opps={opps}
        loading={loading}
        variant="vendas"
        title="Saldo de agendamentos de vendas"
        description="Decomposição dos agendamentos de vendas pelo status real do GHL: realizadas, no-shows, canceladas, a acontecer e aguardando desfecho."
      />

      {/* Section 4: Gráficos */}
      <div>
        <SectionHeader title="Gráficos" description="" />
        <div className="mt-3 space-y-4">
          {/* Contagens absolutas por dimensão */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
            <VerticalBarChart
              title="Reuniões por Closer"
              data={normalizedRows
                .filter(r => r.reunioes > 0)
                .map(r => ({ label: r.closer, value: r.reunioes, sublabel: `${r.fechados} fechados` }))}
              emptyMsg="Sem reuniões no período."
            />
            <VerticalBarChart
              title="Fechados por Closer"
              data={normalizedRows
                .filter(r => r.fechados > 0)
                .map(r => ({ label: r.closer, value: r.fechados, sublabel: fmtCurrencyCompact(r.faturamento) }))}
              emptyMsg="Sem vendas fechadas no período."
            />
            <VerticalBarChart
              title="MQLs por Campanha"
              data={mqlsByCampanha.map(r => ({ label: r.reason, value: r.count }))}
              emptyMsg="Sem MQLs por campanha no período."
            />
            <VerticalBarChart
              title="Reuniões por Campanha"
              data={reunioesByCampanha.map(r => ({ label: r.reason, value: r.count }))}
              emptyMsg="Sem reuniões por campanha no período."
            />
          </div>

          {/* DonutCharts de distribuição */}
          <div className="grid gap-6 xl:grid-cols-3">
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-empire-void">MQLs</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <DonutChart
                  title="MQLs por Closer"
                  data={normalizedRows.filter(r => r.mqls > 0).map(r => ({ reason: r.closer, count: r.mqls }))}
                />
                <DonutChart
                  title="MQLs por Campanha"
                  data={mqlsByCampanha}
                  onSliceClick={(reason) => {
                    const entry = mqlsByCampanha.find((item) => item.reason === reason)
                    if (entry) setModal({ open: true, title: `MQLs — ${reason}`, leads: entry.leads })
                  }}
                />
              </div>
            </div>
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-empire-void">Reuniões</h3>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                <DonutChart
                  title="Reuniões por Closer"
                  data={normalizedRows.filter(r => r.reunioes > 0).map(r => ({ reason: r.closer, count: r.reunioes }))}
                />
                <DonutChart
                  title="Reuniões por Campanha"
                  data={reunioesByCampanha}
                  onSliceClick={(reason) => {
                    const entry = reunioesByCampanha.find((item) => item.reason === reason)
                    if (entry) setModal({ open: true, title: `Reuniões — ${reason}`, leads: entry.leads })
                  }}
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
                  title="Fechados por Closer"
                  data={normalizedRows
                    .filter(r => salesMetric === 'count' ? r.fechados > 0 : (salesMetric === 'faturamento' ? r.faturamento > 0 : r.caixa > 0))
                    .map(r => ({
                      reason: r.closer,
                      count: salesMetric === 'count' ? r.fechados : salesMetric === 'faturamento' ? r.faturamento : r.caixa,
                    }))}
                  valueFormatter={salesMetric !== 'count' ? fmtCurrencyCompact : undefined}
                />
                <DonutChart
                  title="Fechados por Campanha"
                  data={fechadosByCampanha}
                  onSliceClick={(reason) => {
                    const entry = fechadosByCampanha.find((item) => item.reason === reason)
                    if (entry) setModal({ open: true, title: `Fechados — ${reason}`, leads: entry.leads })
                  }}
                  valueFormatter={salesMetric !== 'count' ? fmtCurrencyCompact : undefined}
                />
              </div>
            </div>
          </div>

          {/* Conversão percentual */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
            <VerticalBarChart
              title="Conversão por Closer"
              data={normalizedRows.map(r => ({ label: r.closer, value: r.conversao_pct, sublabel: `${r.fechados}/${r.reunioes}` }))}
              emptyMsg="Sem dados de closers no período."
            />
            <VerticalBarChart
              title="Conversão por Funil"
              data={conversionByFunil.map(r => ({ label: r.label, value: r.conversao_pct, sublabel: `${r.fechados}/${r.reunioes}` }))}
              emptyMsg="Nenhum funil cadastrado ou sem leads com tags de funil no período."
            />
            <VerticalBarChart
              title="Conversão por Campanha"
              data={conversionByCampanha.map(r => ({ label: r.label, value: r.conversao_pct, sublabel: `${r.fechados}/${r.reunioes}` }))}
              emptyMsg="Sem campanhas mapeadas no período."
            />
            <VerticalBarChart
              title="Conversão por Canal"
              data={conversionByCanal.map(r => ({ label: r.label, value: r.conversao_pct, sublabel: `${r.fechados}/${r.reunioes}` }))}
              emptyMsg="Sem dados de canal no período."
            />
          </div>
        </div>
      </div>

      {/* Section 5: Motivos de Perda — visível em ambos os modos */}
      <div>
        <SectionHeader title="Motivos de Perda" description="Distribuição de motivos para oportunidades perdidas" />
        <div className="mt-3 grid gap-4 lg:grid-cols-2">
          <DonutChart
            title="Perdidos sem reunião (motivos)"
            data={lossWithout}
            onSliceClick={(reason) => {
              const leads = opps.filter(o => o.data_perdido && !o.data_agendamento_reuniao && o.lost_reason === reason)
              setModal({ open: true, title: `Perdidos sem reunião: ${reason}`, leads })
            }}
          />
          <DonutChart
            title="Perdidos após reunião (motivos)"
            data={lossWith}
            onSliceClick={(reason) => {
              const leads = opps.filter(o => o.data_perdido_vendas && o.lost_reason === reason)
              setModal({ open: true, title: `Perdidos após reunião: ${reason}`, leads })
            }}
          />
        </div>
      </div>

      {/* Section 6: Tabela de Closers */}
      <div>
        <SectionHeader title="Closers" description="" />
        <div className="mt-3">
          {isCloserLoading ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : isProdutividade && prodError ? (
            <div className="flex items-center gap-3 rounded-xl p-4 text-sm border border-empire-danger/30 bg-empire-danger-soft">
              <AlertTriangle className="h-4 w-4 shrink-0 text-empire-danger" />
              <span className="text-empire-danger">{prodError}</span>
            </div>
          ) : !normalizedRows.length ? (
            <div className="rounded-xl border border-empire-border bg-empire-surface p-8 text-center">
              <p className="text-sm text-empire-subtle">
                Sem atividade de closers no período selecionado.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl overflow-hidden border border-empire-border">
              <table className="w-full min-w-[480px] text-sm">
                <thead style={{ borderBottom: '1px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
                  <tr>
                    {[
                      '#', 'Closer',
                      'Leads', 'MQLs',
                      'Agend.', 'Reuniões', 'No-shows', 'Negociação', 'Fechados',
                      'Tx Conv.',
                      'Faturamento', 'Caixa', 'Msgs', 'Ligações', 'Pessoas', 'Tempo Resp.', '% Sem Resp.',
                    ].map((h) => (
                      <th key={h} className="px-3 py-3 text-center font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {normalizedRows.map((row, i) => (
                    <tr key={row.closer} className="transition-colors hover:bg-empire-elevated border-b border-empire-border">
                      <td className="px-3 py-3 text-center text-xs font-mono text-empire-subtle">{i + 1}</td>
                      <td className="px-3 py-3 text-left text-xs font-semibold text-empire-void whitespace-nowrap max-w-[160px] truncate">{row.closer}</td>
                      <td
                        className={cn('px-3 py-3 text-center text-xs font-medium text-empire-void',
                          row.leads_count !== null && row.leads_count > 0 && clickableTd
                        )}
                        onClick={() => row.leads_count !== null && row.leads_count > 0 && setCloserModal({ open: true, title: `Leads — ${row.closer}`, leads: row.allLeads })}
                      >
                        {row.leads_count !== null
                          ? row.leads_count
                          : <span className="text-empire-subtle opacity-30">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-mono font-medium text-empire-void">
                        {row.mqls > 0
                          ? <span
                              className={cn(
                                'rounded px-1.5 py-0.5 bg-empire-primary/10 text-empire-primary font-semibold',
                                row.mqlsLeads.length > 0 && clickableTd,
                              )}
                              onClick={() => row.mqlsLeads.length > 0 && setCloserModal({ open: true, title: `MQLs — ${row.closer}`, leads: row.mqlsLeads })}
                            >
                              {row.mqls}
                            </span>
                          : <span className="text-empire-subtle">—</span>}
                      </td>
                      <td
                        className={cn('px-3 py-3 text-center text-xs font-medium', row.agendados_vendas > 0 && clickableTd)}
                        onClick={() => row.agendados_vendas > 0 && setCloserModal({ open: true, title: `Agendados — ${row.closer}`, leads: row.agendadosLeads })}
                      >{row.agendados_vendas || <span className="text-empire-subtle">—</span>}</td>
                      <td
                        className={cn('px-3 py-3 text-center', row.reunioes > 0 && clickableTd)}
                        onClick={() => row.reunioes > 0 && setCloserModal({ open: true, title: `Reuniões — ${row.closer}`, leads: row.reunioesLeads })}
                      >
                        <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded',
                          row.reunioes === bestReunioes && bestReunioes > 0 && 'bg-empire-success/10 text-empire-success'
                        )}>{row.reunioes || <span className="text-empire-subtle">—</span>}</span>
                      </td>
                      <td
                        className={cn('px-3 py-3 text-center', row.no_shows > 0 && clickableTd)}
                        onClick={() => row.no_shows > 0 && setCloserModal({ open: true, title: `No-shows — ${row.closer}`, leads: row.noShowsLeads })}
                      >
                        {row.no_shows > 0
                          ? <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', pctBadgeClass(row.taxa_no_show, false))}>
                              {row.no_shows} ({row.taxa_no_show}%)
                            </span>
                          : <span className="text-xs text-empire-subtle">—</span>}
                      </td>
                      <td
                        className={cn('px-3 py-3 text-center text-xs', row.negociacao > 0 && clickableTd)}
                        onClick={() => row.negociacao > 0 && setCloserModal({ open: true, title: `Negociação — ${row.closer}`, leads: row.negociacaoLeads })}
                      >{row.negociacao || <span className="text-empire-subtle">—</span>}</td>
                      <td
                        className={cn('px-3 py-3 text-center', row.fechados > 0 && clickableTd)}
                        onClick={() => row.fechados > 0 && setCloserModal({ open: true, title: `Fechados — ${row.closer}`, leads: row.fechadosLeads })}
                      >
                        <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded',
                          row.fechados === bestFechados && bestFechados > 0 && 'bg-empire-success/10 text-empire-success'
                        )}>{row.fechados || <span className="font-normal text-empire-subtle">—</span>}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {(() => {
                          const metaCloser = getActiveMeta(metas, 'taxa_conversao_vendas', row.closer)
                          const meta = metaCloser ?? metaConversao
                          return (
                            <div className="flex flex-col items-center gap-0.5">
                              <span className={cn('rounded px-1.5 py-0.5 text-xs font-bold', meta
                                ? (row.conversao_pct >= meta.valor ? 'bg-empire-success/10 text-empire-success' : 'bg-empire-danger/10 text-empire-danger')
                                : pctBadgeClass(row.conversao_pct, true)
                              )}>
                                {row.conversao_pct}%
                              </span>
                              {meta && (
                                <span className="text-[10px] text-empire-subtle leading-none">
                                  meta {Math.round(meta.valor)}%
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>
                      <td
                        className={cn('px-3 py-3 text-center text-xs font-bold whitespace-nowrap', row.fechados > 0 && clickableTd)}
                        onClick={() => row.fechados > 0 && setCloserModal({ open: true, title: `Fechados — ${row.closer}`, leads: row.fechadosLeads })}
                      >{row.faturamento > 0 ? fmtCurrencyCompact(row.faturamento) : <span className="font-normal text-empire-subtle">—</span>}</td>
                      <td
                        className={cn('px-3 py-3 text-center text-xs whitespace-nowrap', row.fechados > 0 && clickableTd)}
                        onClick={() => row.fechados > 0 && setCloserModal({ open: true, title: `Fechados — ${row.closer}`, leads: row.fechadosLeads })}
                      >{row.caixa > 0 ? fmtCurrencyCompact(row.caixa) : <span className="text-empire-subtle">—</span>}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-empire-subtle">{row.mensagens || '—'}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-empire-subtle">{row.ligacoes || '—'}</td>
                      <td className="px-3 py-3 text-center text-xs font-mono text-empire-subtle">
                        {row.pessoasContatadas !== null
                          ? (row.pessoasContatadas || '—')
                          : <span className="opacity-30">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {row.avg_response_seconds !== null
                          ? <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', responseTimeBadgeClass(row.avg_response_seconds))}>
                              {fmtResponseTime(row.avg_response_seconds)}
                            </span>
                          : <span className="text-xs text-empire-subtle opacity-30">—</span>}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {row.pct_sem_resposta !== null
                          ? (row.pct_sem_resposta > 0
                              ? <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', noResponseBadgeClass(row.pct_sem_resposta))}>
                                  {row.pct_sem_resposta}%
                                </span>
                              : <span className="text-xs text-empire-subtle">0%</span>)
                          : <span className="text-xs text-empire-subtle opacity-30">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-[10px] text-empire-subtle">
                Clique nos números para ver os leads correspondentes.
              </p>
            </div>
          )}
        </div>
      </div>

      <PendentesAssinaturaModal
        open={pendentesModal}
        onClose={() => setPendentesModal(false)}
        rows={activePendentes.rows}
        faturamento={activePendentes.faturamento}
        caixa={activePendentes.caixa}
      />

      <CaixaPorClienteModal
        open={caixaModal}
        onClose={() => setCaixaModal(false)}
        rows={caixaPorCliente}
        total={prodActiveKpis.caixaRecebido ?? 0}
        periodoLabel={`${startDate} a ${endDate}`}
      />

      <CaixaPorClienteModal
        open={faturamentoModal}
        onClose={() => setFaturamentoModal(false)}
        rows={caixaPorCliente}
        total={prodActiveKpis.faturamentoBruto ?? 0}
        periodoLabel={`${startDate} a ${endDate}`}
        metric="faturamento"
      />

      {/* Lead List Modals */}
      <LeadListModal
        open={vendasExternasModal}
        onClose={() => setVendasExternasModal(false)}
        title="Vendas Externas"
        leads={(prodActiveKpis.vendasExternasLeads ?? []) as ModalLead[]}
      />
      <LeadListModal
        open={modal.open}
        onClose={() => setModal({ open: false, title: '', leads: [] })}
        title={modal.title}
        leads={modal.leads}
      />
      <LeadListModal
        open={closerModal.open}
        onClose={() => setCloserModal({ open: false, title: '', leads: [] })}
        title={closerModal.title}
        leads={closerModal.leads}
      />
    </div>
  )
}
