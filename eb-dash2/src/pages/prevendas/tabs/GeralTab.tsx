import { useState, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { Skeleton } from '@/components/ui/skeleton'
import { LeadListModal } from '@/components/leads/LeadCard'
import { AlertasCard } from '@/components/prevendas/AlertasCard'
import { computeLossReasons, computeAvgCycle, buildPaymentDateMap, isMqlByTag, buildCampaignNameMap, computeMetaKpis } from '@/hooks/useTrafego'
import { spDaysAgo } from '@/lib/utils/dates'
import { useCohort } from '@/hooks/useCohort'
import { useProdutividadeMatrix } from '@/hooks/useProdutividadeMatrix'
import type { OppRow, MetaRow, MetaAccountDailyRow, RevenueRow } from '@/hooks/useTrafego'
import type { CohortRow } from '@/hooks/useCohort'
import { useSDRProdutividade } from '@/hooks/useSDRProdutividade'
import { usePreVendasProducao } from '@/hooks/usePreVendasProducao'
import type { PreVendasFilters } from '@/hooks/usePreVendas'
import {
  SectionHeader,
  KpiCard,
  DonutChart,
  FunnelViz,
} from '@/components/dashboard'
import type { FunnelStep } from '@/components/dashboard'
import {
  Clock,
  Crosshair,
  Phone,
  CalendarDays,
  Users,
  Target,
  Percent,
  BarChart2,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows?: MetaAccountDailyRow[]
  loading: boolean
  onSdrClick: (sdr: string) => void
  revenueRows: RevenueRow[]
  filters: PreVendasFilters
  startDate: string
  endDate: string
  activePanel?: 'cohort' | 'produtividade'
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao'
}

// ─── Helpers ─────────────────────────────────────────────────

function fmtCurrencyCompact(v: number) {
  if (v === 0) return '—'
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

function cellColor(pct: number, avg: number): string {
  if (avg === 0) return ''
  const diff = pct - avg
  if (diff < -20) return 'bg-empire-danger/10 text-empire-danger'
  if (diff < -10) return 'bg-empire-warning/12 text-empire-primary'
  if (diff > 10) return 'bg-empire-success/10 text-[var(--empire-success)]'
  return ''
}

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

// ─── Matrix Cell ─────────────────────────────────────────────

function MatrixCell({
  value,
  pct,
  avg,
  onClick,
  clickable = true,
}: {
  value: number
  pct: number
  avg: number
  onClick?: () => void
  clickable?: boolean
}) {
  return (
    <td
      className={cn(
        'px-4 py-4 text-center transition-colors',
        cellColor(pct, avg),
        clickable && 'cursor-pointer hover:brightness-95',
      )}
      onClick={clickable ? onClick : undefined}
    >
      <div className="text-xl font-bold leading-tight">{value}</div>
      <div className="text-xs font-medium opacity-70 mt-0.5">{pct}%</div>
    </td>
  )
}

// ─── Main component ───────────────────────────────────────────

export function GeralTab({
  opps,
  metaRows,
  accountDailyRows,
  loading,
  onSdrClick,
  revenueRows,
  filters,
  startDate,
  endDate,
  activePanel = 'cohort',
  pipelineMode,
}: Props) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({ open: false, title: '', leads: [] })
  const [sdrNames, setSdrNames] = useState<Set<string>>(new Set())
  const [campaignNameMap, setCampaignNameMap] = useState<Map<string, string>>(new Map())

  const isProdutividade = activePanel === 'produtividade'

  // Load official SDRs (papel = 'sdr')
  useEffect(() => {
    void getWorkspaceId().then((wid) => {
      if (!wid) return
      return supabase
        .from('ghl_users')
        .select('nome')
        .contains('papeis', ['sdr'])
        .eq('workspace_id', wid)
        .then(({ data }) => {
          const names = new Set((data ?? []).map((u: { nome: string }) => u.nome).filter(Boolean))
          setSdrNames(names)
        })
    })
  }, [])

  useEffect(() => {
    void getWorkspaceId().then((wid) => {
      if (!wid) return
      return supabase
      .from('utm_campaigns')
      .select('nome, utm_campaign')
      .eq('workspace_id', wid)
      .then(({ data }) => {
        setCampaignNameMap(
          buildCampaignNameMap(
            (data ?? []) as { utm_campaign: string | number | null; nome: string | null }[]
          )
        )
      })
    })
  }, [])

  // Filter to official SDRs only (consistent with SDRs tab)
  const oppsComSdr = useMemo(() =>
    opps.filter((o) => sdrNames.has(o.sdr_name || o.contatos?.owner_name || '')),
    [opps, sdrNames]
  )

  const {
    opps: producaoOpps,
    revenueRows: producaoRevenueRows,
    loading: producaoChartsLoading,
  } = usePreVendasProducao(filters, pipelineMode, isProdutividade)

  const producaoOppsComSdr = useMemo(
    () => producaoOpps.filter((o) => sdrNames.has(o.sdr_name || o.contatos?.owner_name || '')),
    [producaoOpps, sdrNames],
  )

  // Payment map
  const paymentDateMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])
  const producaoPaymentDateMap = useMemo(() => buildPaymentDateMap(producaoRevenueRows), [producaoRevenueRows])
  const prazoMedio = useMemo(() => computeAvgCycle(oppsComSdr, paymentDateMap), [oppsComSdr, paymentDateMap])
  const vendasCount = useMemo(() => oppsComSdr.filter(o => paymentDateMap.has(o.id)).length, [oppsComSdr, paymentDateMap])
  const metaKpis = useMemo(() => computeMetaKpis(metaRows, accountDailyRows), [metaRows, accountDailyRows])

  // Cohort KPI counts
  const cohortKpis = useMemo(() => {
    const leads = oppsComSdr.length
    const mqlCount = oppsComSdr.filter(o => isMqlByTag(o.contatos)).length
    const conectados = oppsComSdr.filter(o => !!o.data_conectado).length
    const agendados = oppsComSdr.filter(o => !!o.data_agendamento_reuniao).length
    const reunioes = oppsComSdr.filter(o => !!o.data_realizacao_vendas).length
    return {
      leads,
      mqlCount,
      conectados,
      agendados,
      reunioes,
      fechados: vendasCount,
      taxaConexao: leads > 0 ? Math.round((conectados / leads) * 100) : 0,
      taxaAgendamento: mqlCount > 0 ? Math.round((agendados / mqlCount) * 100) : 0,
      taxaReuniao: agendados > 0 ? Math.round((reunioes / agendados) * 100) : 0,
      taxaFechamento: reunioes > 0 ? Math.round((vendasCount / reunioes) * 100) : 0,
    }
  }, [oppsComSdr, vendasCount])

  // Meta de Comparecimento: 70% dos agendamentos em janela 7d + 72h
  // Janela: reuniões agendadas de 10 dias atrás até 3 dias atrás (72h de tolerância)
  const metaComparecimento = useMemo(() => {
    const windowStart = spDaysAgo(9) // 7 dias de janela + 3 dias tolerância - 1
    const windowEnd = spDaysAgo(3)   // 72h = 3 dias de tolerância mínima

    // Usa producaoOpps em modo produtividade (escopo mais amplo), senão usa cohort
    const baseOpps = isProdutividade ? producaoOppsComSdr : oppsComSdr
    const agendados = baseOpps.filter(
      (o) => !!o.data_agendamento_reuniao && o.data_agendamento_reuniao >= windowStart && o.data_agendamento_reuniao <= windowEnd,
    )
    const realizados = agendados.filter((o) => !!o.data_realizacao_vendas)
    return {
      agendados: agendados.length,
      realizados: realizados.length,
      taxa: agendados.length > 0 ? Math.round((realizados.length / agendados.length) * 100) : 0,
      agendadosList: agendados,
      realizadosList: realizados,
      windowStart,
      windowEnd,
    }
  }, [isProdutividade, producaoOppsComSdr, oppsComSdr])

  // Produtividade KPIs (for event counts)
  const { consolidado: prodConsolidado, loading: prodLoading } = useSDRProdutividade(startDate, endDate, pipelineMode, isProdutividade)

  // Active KPIs: switch source on mode
  const activeKpis = useMemo(() => {
    if (!isProdutividade) return cohortKpis
    const { leads_count, mqls, conectados, agendados, reunioes, fechados } = prodConsolidado
    return {
      ...cohortKpis,
      leads: leads_count,
      mqlCount: mqls,
      conectados,
      agendados,
      reunioes,
      fechados,
      taxaConexao: 0,
      taxaAgendamento: 0,
      taxaReuniao: 0,
      taxaFechamento: 0,
    }
  }, [isProdutividade, cohortKpis, prodConsolidado])

  // Loss reasons
  const lostReasons = useMemo(() => computeLossReasons(oppsComSdr, false), [oppsComSdr])
  const lostReasonsAfter = useMemo(() => computeLossReasons(oppsComSdr, true), [oppsComSdr])

  // SDR distribution (for DonutChart)
  const sdrDistribution = useMemo(() => {
    const counts = new Map<string, number>()
    for (const o of oppsComSdr) {
      const sdr = o.sdr_name || o.contatos?.owner_name || 'Sem SDR'
      counts.set(sdr, (counts.get(sdr) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
  }, [oppsComSdr])

  const campaignMqls = useMemo(() => {
    const sourceOpps = isProdutividade ? producaoOppsComSdr : oppsComSdr
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
  }, [isProdutividade, producaoOppsComSdr, oppsComSdr, campaignNameMap])

  const campaignReunioes = useMemo(() => {
    const sourceOpps = isProdutividade
      ? producaoOppsComSdr.filter((o) => !!o.data_realizacao_vendas)
      : oppsComSdr.filter((o) => !!o.data_realizacao_vendas)
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
  }, [isProdutividade, producaoOppsComSdr, oppsComSdr, campaignNameMap])

  const campaignVendas = useMemo(() => {
    const sourceOpps = isProdutividade
      ? producaoOppsComSdr.filter((o) => producaoPaymentDateMap.has(o.id))
      : oppsComSdr.filter((o) => paymentDateMap.has(o.id))
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
  }, [isProdutividade, producaoOppsComSdr, oppsComSdr, producaoPaymentDateMap, paymentDateMap, campaignNameMap])

  // ── Matrix data ──────────────────────────────────────────────
  // Cohort matrix
  const cohortData = useCohort(oppsComSdr, revenueRows, startDate, endDate)
  // Produtividade matrix (mesma estrutura, cálculo diferente)
  const prodMatrix = useProdutividadeMatrix(oppsComSdr, startDate, endDate, pipelineMode, sdrNames, isProdutividade)

  // Active matrix: switch source on mode
  const matrixRows = isProdutividade ? prodMatrix.rows : cohortData.rows
  const matrixAvgConectados = isProdutividade ? prodMatrix.avgConectados : cohortData.avgConectados
  const matrixAvgAgendados = isProdutividade ? prodMatrix.avgAgendados : cohortData.avgAgendados
  const matrixAvgReuniao = isProdutividade ? prodMatrix.avgReuniao : cohortData.avgReuniao
  const matrixAvgFechados = isProdutividade ? prodMatrix.avgFechados : cohortData.avgFechados
  const matrixLoading = loading || (isProdutividade && prodMatrix.loading)

  // Funnel steps (mesma estrutura, dados diferentes)
  const funnelSteps: FunnelStep[] = useMemo(() => {
    if (isProdutividade) return []
    return buildFunnelSteps([
      { label: 'Leads', count: oppsComSdr.length, onClick: () => setModal({ open: true, title: 'Leads', leads: oppsComSdr }), cost: cpe(metaKpis.spend, oppsComSdr.length) },
      { label: 'MQLs', count: cohortKpis.mqlCount, onClick: () => setModal({ open: true, title: 'MQLs', leads: oppsComSdr.filter(o => isMqlByTag(o.contatos)) }), cost: cpe(metaKpis.spend, cohortKpis.mqlCount) },
      { label: 'Agendados', count: cohortKpis.agendados, onClick: () => setModal({ open: true, title: 'Agendados', leads: oppsComSdr.filter(o => !!o.data_agendamento_reuniao) }), cost: cpe(metaKpis.spend, cohortKpis.agendados) },
      { label: 'Reuniões', count: cohortKpis.reunioes, onClick: () => setModal({ open: true, title: 'Reuniões', leads: oppsComSdr.filter(o => !!o.data_realizacao_vendas) }), cost: cpe(metaKpis.spend, cohortKpis.reunioes) },
      { label: 'Fechados', count: cohortKpis.fechados, onClick: () => setModal({ open: true, title: 'Fechados', leads: oppsComSdr.filter(o => paymentDateMap.has(o.id)) }), cost: cpe(metaKpis.spend, cohortKpis.fechados) },
    ])
  }, [isProdutividade, oppsComSdr, cohortKpis, paymentDateMap, metaKpis])

  const openModal = (title: string, leads: OppRow[]) => setModal({ open: true, title, leads })

  // Drilldown helper for matrix cells (cohort = filter row.leads, produtividade = show row.leads for Leads/MQLs only)
  const canDrilldown = !isProdutividade

  return (
    <div className="space-y-5">
      {/* Alertas — destaque no topo */}
      <AlertasCard loading={loading} />

      {/* Section 1: Indicadores — mesma estrutura em ambos os modos */}
      <div>
        <SectionHeader
          title={isProdutividade ? 'Indicadores Independentes' : 'Indicadores'}
          description={isProdutividade ? 'Produtividade — cada etapa usa a data do próprio evento, sem funil encadeado' : 'Cohort — métricas dos leads gerados no período'}
        />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
          {isProdutividade ? (
            <>
              <KpiCard icon={Clock} label="Prazo Médio" value={prazoMedio !== null ? `${prazoMedio}d` : '—'} loading={loading} variant="highlight" />
              <KpiCard icon={Crosshair} label="Leads" value={String(activeKpis.leads ?? 0)} loading={loading} variant="highlight" subValue={cpe(metaKpis.spend, activeKpis.leads ?? 0)} />
              <KpiCard icon={Crosshair} label="MQLs" value={String(activeKpis.mqlCount ?? 0)} loading={loading} variant="highlight" subValue={cpe(metaKpis.spend, activeKpis.mqlCount ?? 0)} />
              <KpiCard icon={Phone} label="Conectados" value={String(activeKpis.conectados)} loading={loading} subValue={cpe(metaKpis.spend, activeKpis.conectados)} />
              <KpiCard icon={CalendarDays} label="Agendados" value={String(activeKpis.agendados)} loading={loading} variant="highlight" subValue={cpe(metaKpis.spend, activeKpis.agendados)} />
              <KpiCard icon={Users} label="Reuniões" value={String(activeKpis.reunioes)} loading={loading} variant="highlight" subValue={cpe(metaKpis.spend, activeKpis.reunioes)} />
              <KpiCard icon={Target} label="Fechados" value={String(activeKpis.fechados)} loading={loading} variant="highlight" subValue={cpe(metaKpis.spend, activeKpis.fechados)} />
              <KpiCard
                icon={Percent}
                label="Comparecimento 7d"
                value={`${metaComparecimento.taxa}%`}
                loading={loading}
                variant={metaComparecimento.taxa >= 70 ? 'success' : 'default'}
                subValue={metaComparecimento.agendados > 0 ? `${metaComparecimento.realizados}/${metaComparecimento.agendados} · meta 70%` : 'sem agend.'}
              />
            </>
          ) : (
            <>
              <KpiCard icon={Clock} label="Prazo Médio" value={prazoMedio !== null ? `${prazoMedio}d` : '—'} loading={loading} variant="highlight" />
              <KpiCard icon={Crosshair} label="MQLs" value={String(activeKpis.mqlCount)} loading={loading} variant="highlight" subValue={cpe(metaKpis.spend, activeKpis.mqlCount)} />
              <KpiCard icon={Phone} label="Conectados" value={String(activeKpis.conectados)} loading={loading} subValue={cpe(metaKpis.spend, activeKpis.conectados)} />
              <KpiCard icon={CalendarDays} label="Agendados" value={String(activeKpis.agendados)} loading={loading} variant="highlight" subValue={cpe(metaKpis.spend, activeKpis.agendados)} />
              <KpiCard icon={Users} label="Reuniões" value={String(activeKpis.reunioes)} loading={loading} variant="highlight" subValue={cpe(metaKpis.spend, activeKpis.reunioes)} />
              <KpiCard icon={Target} label="Fechados" value={String(activeKpis.fechados)} loading={loading} variant="highlight" subValue={cpe(metaKpis.spend, activeKpis.fechados)} />
              <KpiCard
                icon={Percent}
                label="Taxa Conexão"
                value={`${activeKpis.taxaConexao}%`}
                loading={loading}
              />
              <KpiCard
                icon={BarChart2}
                label="Taxa Agendamento"
                value={`${activeKpis.taxaAgendamento}%`}
                loading={loading}
                variant={activeKpis.taxaAgendamento >= 30 ? 'success' : 'default'}
              />
              <KpiCard
                icon={BarChart2}
                label="Taxa Reunião"
                value={`${activeKpis.taxaReuniao}%`}
                loading={loading}
                variant={activeKpis.taxaReuniao >= 70 ? 'success' : 'default'}
              />
              <KpiCard
                icon={BarChart2}
                label="Taxa Fechamento"
                value={`${activeKpis.taxaFechamento}%`}
                loading={loading}
                variant={activeKpis.taxaFechamento >= 20 ? 'success' : 'default'}
              />
              <KpiCard
                icon={Percent}
                label="Comparecimento 7d"
                value={`${metaComparecimento.taxa}%`}
                loading={loading}
                variant={metaComparecimento.taxa >= 70 ? 'success' : metaComparecimento.agendados === 0 ? 'default' : 'default'}
                subValue={metaComparecimento.agendados > 0 ? `${metaComparecimento.realizados}/${metaComparecimento.agendados} · meta 70%` : 'sem agend.'}
              />
            </>
          )}
        </div>
      </div>

      {!isProdutividade && (
        <div>
          <SectionHeader title="Funil de Conversão" description="Progresso dos leads em cada etapa" />
          <div className="mt-3">
            <FunnelViz steps={funnelSteps} loading={loading || prodLoading} />
          </div>
        </div>
      )}

      {/* Section 3: Matriz — mesma tabela, dados diferentes */}
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-empire-void">
            {isProdutividade ? 'Matriz Produtividade' : 'Matriz Cohort'}
          </h3>
          <p className="text-xs text-empire-subtle mt-0.5">
            {isProdutividade
              ? 'Cada coluna conta a data do próprio evento no mês. Leads e MQLs usam a data de geração e não prendem as etapas seguintes.'
              : 'Cada linha = grupo de leads pelo mês de entrada. Clique numa célula para ver os leads.'}
          </p>
        </div>

        {!isProdutividade && (
          <div className="flex items-center gap-4 text-[10px] text-empire-subtle">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-empire-success/20" /> Acima da média
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-empire-warning/20" /> Levemente abaixo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-empire-danger/15" /> Muito abaixo
            </span>
          </div>
        )}

        {matrixLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : !matrixRows.length ? (
          <div
            className="rounded-xl p-8 text-center bg-empire-elevated border border-empire-border"
          >
            <p className="text-sm text-empire-subtle">
              {isProdutividade ? 'Sem dados de produtividade no período.' : 'Sem dados de cohort no período.'}
            </p>
          </div>
        ) : (
          <div
            className="overflow-x-auto rounded-xl overflow-hidden border border-empire-border"
          >
            <table className="w-full min-w-[480px]">
              <thead style={{ borderBottom: '2px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
                <tr>
                  <th className="px-5 py-4 text-left font-mono text-xs font-semibold tracking-[0.14em] uppercase text-empire-subtle min-w-[110px]">
                    {isProdutividade ? 'Mês' : 'Cohort'}
                  </th>
                  <th className="px-4 py-4 text-center font-mono text-xs font-semibold tracking-[0.14em] uppercase text-empire-subtle min-w-[90px]">Leads</th>
                  <th className="px-4 py-4 text-center font-mono text-xs font-semibold tracking-[0.14em] uppercase text-empire-subtle min-w-[90px]">MQLs</th>
                  <th className="px-4 py-4 text-center font-mono text-xs font-semibold tracking-[0.14em] uppercase text-empire-subtle min-w-[100px]">Conectados</th>
                  <th className="px-4 py-4 text-center font-mono text-xs font-semibold tracking-[0.14em] uppercase text-empire-subtle min-w-[100px]">Agendados</th>
                  <th className="px-4 py-4 text-center font-mono text-xs font-semibold tracking-[0.14em] uppercase text-empire-subtle min-w-[90px]">Reuniões</th>
                  <th className="px-4 py-4 text-center font-mono text-xs font-semibold tracking-[0.14em] uppercase text-empire-subtle min-w-[90px]">Fechados</th>
                  <th className="px-4 py-4 text-center font-mono text-xs font-semibold tracking-[0.14em] uppercase text-empire-subtle min-w-[110px]">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row: CohortRow) => (
                  <tr
                    key={row.cohort_mes}
                    className="border-b border-empire-border hover:bg-[rgba(13,24,41,0.015)] transition-colors"
                  >
                    <td className="px-5 py-4 font-semibold text-empire-void whitespace-nowrap text-sm">
                      {row.cohort_label}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-4 text-center transition-colors',
                        canDrilldown && !isProdutividade && 'cursor-pointer hover:bg-empire-elevated',
                        isProdutividade && 'cursor-pointer hover:bg-empire-elevated',
                      )}
                      onClick={(canDrilldown || isProdutividade) ? () => setModal({ open: true, title: `Leads — ${row.cohort_label}`, leads: row.leads }) : undefined}
                    >
                      <div className="text-xl font-bold text-empire-void leading-tight">{row.leads_count}</div>
                    </td>
                    {isProdutividade ? (
                      <td
                        className="px-4 py-4 text-center transition-colors cursor-pointer hover:bg-empire-elevated"
                        onClick={() => setModal({ open: true, title: `MQLs — ${row.cohort_label}`, leads: row.leads.filter(o => isMqlByTag(o.contatos)) })}
                      >
                        <div className="text-xl font-bold text-empire-void leading-tight">{row.mqls}</div>
                      </td>
                    ) : (
                      <MatrixCell value={row.mqls} pct={row.mqls_pct} avg={0} clickable={canDrilldown} onClick={() => setModal({ open: true, title: `MQLs — ${row.cohort_label}`, leads: row.leads.filter(o => isMqlByTag(o.contatos)) })} />
                    )}
                    {isProdutividade ? (
                      <td className="px-4 py-4 text-center">
                        <div className="text-xl font-bold text-empire-void leading-tight">{row.conectados}</div>
                      </td>
                    ) : (
                      <MatrixCell value={row.conectados} pct={row.conectados_pct} avg={matrixAvgConectados} clickable={canDrilldown} onClick={() => setModal({ open: true, title: `Conectados — ${row.cohort_label}`, leads: row.leads.filter(o => !!o.data_conectado) })} />
                    )}
                    {isProdutividade ? (
                      <td className="px-4 py-4 text-center">
                        <div className="text-xl font-bold text-empire-void leading-tight">{row.agendados}</div>
                      </td>
                    ) : (
                      <MatrixCell value={row.agendados} pct={row.agendados_pct} avg={matrixAvgAgendados} clickable={canDrilldown} onClick={() => setModal({ open: true, title: `Agendados — ${row.cohort_label}`, leads: row.leads.filter(o => !!o.data_agendamento_reuniao) })} />
                    )}
                    {isProdutividade ? (
                      <td className="px-4 py-4 text-center">
                        <div className="text-xl font-bold text-empire-void leading-tight">{row.reunioes}</div>
                      </td>
                    ) : (
                      <MatrixCell value={row.reunioes} pct={row.reunioes_pct} avg={matrixAvgReuniao} clickable={canDrilldown} onClick={() => setModal({ open: true, title: `Reuniões — ${row.cohort_label}`, leads: row.leads.filter(o => !!o.data_realizacao_vendas) })} />
                    )}
                    {isProdutividade ? (
                      <td className="px-4 py-4 text-center">
                        <div className="text-xl font-bold text-empire-void leading-tight">{row.fechados}</div>
                      </td>
                    ) : (
                      <MatrixCell value={row.fechados} pct={row.fechados_pct} avg={matrixAvgFechados} clickable={canDrilldown} onClick={() => setModal({ open: true, title: `Fechados — ${row.cohort_label}`, leads: row.fechados_leads ?? row.leads.filter(o => !!o.data_fechado) })} />
                    )}
                    <td className="px-4 py-4 text-center font-semibold text-empire-void whitespace-nowrap text-base">
                      {fmtCurrencyCompact(row.faturamento)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot style={{ borderTop: '2px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
                <tr>
                  <td className="px-5 py-3 text-xs font-mono font-semibold text-empire-subtle uppercase tracking-wider">
                    {isProdutividade ? 'Total' : 'Média'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-mono font-medium text-empire-subtle">
                    {isProdutividade
                      ? matrixRows.reduce((sum, row) => sum + row.leads_count, 0)
                      : Math.round(matrixRows.reduce((sum, row) => sum + row.leads_count, 0) / Math.max(matrixRows.length, 1))}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-mono font-medium text-empire-subtle">
                    {isProdutividade
                      ? matrixRows.reduce((sum, row) => sum + row.mqls, 0)
                      : Math.round(matrixRows.reduce((sum, row) => sum + row.mqls, 0) / Math.max(matrixRows.length, 1))}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-mono font-medium text-empire-subtle">
                    {isProdutividade ? matrixRows.reduce((sum, row) => sum + row.conectados, 0) : Math.round(matrixAvgConectados)}{isProdutividade ? '' : '%'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-mono font-medium text-empire-subtle">
                    {isProdutividade ? matrixRows.reduce((sum, row) => sum + row.agendados, 0) : Math.round(matrixAvgAgendados)}{isProdutividade ? '' : '%'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-mono font-medium text-empire-subtle">
                    {isProdutividade ? matrixRows.reduce((sum, row) => sum + row.reunioes, 0) : Math.round(matrixAvgReuniao)}{isProdutividade ? '' : '%'}
                  </td>
                  <td className="px-4 py-3 text-center text-sm font-mono font-medium text-empire-subtle">
                    {isProdutividade ? matrixRows.reduce((sum, row) => sum + row.fechados, 0) : Math.round(matrixAvgFechados)}{isProdutividade ? '' : '%'}
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      <div>
        <SectionHeader
          title="Campanhas"
          description={isProdutividade ? 'Colunas por métrica no período dos eventos: MQLs, Reuniões e Vendas' : 'Colunas por métrica para os leads gerados no período: MQLs, Reuniões e Vendas'}
        />
        <div className="mt-3 grid gap-6 xl:grid-cols-3">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-empire-void">MQLs</h3>
            <DonutChart
              title="MQLs por campanha"
              data={campaignMqls}
              onSliceClick={(reason) => {
                const entry = campaignMqls.find((item) => item.reason === reason)
                if (entry) openModal(`MQLs — ${reason}`, entry.leads)
              }}
            />
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-empire-void">Reuniões</h3>
            <DonutChart
              title="Reuniões por campanha"
              data={campaignReunioes}
              onSliceClick={(reason) => {
                const entry = campaignReunioes.find((item) => item.reason === reason)
                if (entry) openModal(`Reuniões — ${reason}`, entry.leads)
              }}
            />
          </div>
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-empire-void">Vendas</h3>
            <DonutChart
              title="Vendas por campanha"
              data={campaignVendas}
              onSliceClick={(reason) => {
                const entry = campaignVendas.find((item) => item.reason === reason)
                if (entry) openModal(`Vendas — ${reason}`, entry.leads)
              }}
              note={isProdutividade && producaoChartsLoading ? 'Atualizando dados de produtividade...' : undefined}
            />
          </div>
        </div>
      </div>

      {/* Section 4: Análise — DonutCharts */}
      <div>
        <SectionHeader title="Análise" description="Distribuição por SDR e motivos de perda" />
        <div className="mt-3 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <DonutChart
              title="Distribuição por SDR"
              data={sdrDistribution}
              onSliceClick={(reason) => onSdrClick(reason === 'Sem SDR' ? '' : reason)}
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <DonutChart
              title="Motivos de perda (pré-venda)"
              data={lostReasons}
              onSliceClick={(reason) => {
                const leads = oppsComSdr.filter(o => o.data_perdido && !o.data_agendamento_reuniao && o.lost_reason === reason)
                openModal(`Perdidos: ${reason}`, leads)
              }}
            />
            <DonutChart
              title="Motivos de perda (vendas)"
              data={lostReasonsAfter}
              onSliceClick={(reason) => {
                const leads = oppsComSdr.filter(o => o.data_perdido_vendas && o.lost_reason === reason)
                openModal(`Perdidos (vendas): ${reason}`, leads)
              }}
            />
          </div>
        </div>
      </div>

      <LeadListModal
        open={modal.open}
        onClose={() => setModal(m => ({ ...m, open: false }))}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
