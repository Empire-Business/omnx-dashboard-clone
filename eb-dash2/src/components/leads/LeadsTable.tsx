import { useState, useMemo, useEffect, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { buildPaymentDateMap, buildRevenueMap, isMqlByTag, parseTags } from '@/hooks/useTrafego'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import {
  computeLeadQualityScore,
  getLeadQualityBucket,
  type LeadQualityBucket,
  type LeadQualityMaturity,
} from '@/lib/lead-quality-score'
import { fmtDate, tsToSPDate } from '@/lib/utils/dates'
import { useMQLCohortComms } from '@/hooks/useMQLCohortComms'
import type { CommAggregation } from '@/hooks/useMQLCohortComms'
import { LeadCard } from '@/components/leads/LeadCard'
import { AppointmentOriginBadge } from '@/components/appointment-origin-badge'
import {
  Settings2,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2,
  X,
  Search,
  Check,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Props ────────────────────────────────────────────────────

export interface LeadsTableProps {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  /** Mapa utm_source → nome amigável, pré-construído pelo caller */
  channelNameMap: Map<string, string>
  /** utm_campaign → funnels[] (para exibição correta da coluna Funil) */
  campaignFunnelMap?: Map<string, string[]>
  /** utm_campaign → nome amigável */
  campaignNameMap?: Map<string, string>
  /** Usado pelo useMQLCohortComms para buscar comunicações desde esta data */
  startDate: string
  loading: boolean
  /** Título exibido na toolbar (ex: "Todos os Leads", "Leads de Tráfego Pago") */
  title?: string
  /** Chave do localStorage para persistir prefs de colunas — diferente por módulo */
  lsKey?: string
  initialConnectionFilter?: 'all' | 'connected' | 'not_connected'
}

const DEFAULT_LS_KEY = 'eb-dash2:leads-table:columns'

// ─── Column definitions ───────────────────────────────────────

interface ColDef {
  key: string
  label: string
  numeric?: boolean
  currency?: boolean
  boolean?: boolean
  narrow?: boolean
}

const ALL_COLUMNS: ColDef[] = [
  { key: 'canal',         label: 'Canal' },
  { key: 'funil',         label: 'Funil' },
  { key: 'campanha',      label: 'Campanha' },
  { key: 'entrada',       label: 'Entrada' },
  { key: 'estagio',       label: 'Estágio' },
  { key: 'score',         label: 'Score',         numeric: true, narrow: true },
  { key: 'termometro',    label: 'Termômetro' },
  { key: 'mql',           label: 'MQL',           boolean: true, narrow: true },
  { key: 'sdr',           label: 'SDR' },
  { key: 'conectado',     label: 'Conectado?',    boolean: true, narrow: true },
  { key: 'agendado',      label: 'Ag. Reunião?',  boolean: true, narrow: true },
  { key: 'reuniao',       label: 'Reunião Feita?',boolean: true, narrow: true },
  { key: 'fechado',       label: 'Fechado?',      boolean: true, narrow: true },
  { key: 'faturamento',   label: 'Faturamento',   currency: true },
  { key: 'caixa',         label: 'Caixa',         currency: true },
  { key: 'fatura_anual',  label: 'Fatura/Ano' },
  { key: 'perfil',        label: 'Perfil' },
  { key: 'mensagens',     label: 'Mensagens',     numeric: true, narrow: true },
  { key: 'ligacoes',      label: 'Ligações',      numeric: true, narrow: true },
]

const COLUMN_MAP = new Map(ALL_COLUMNS.map((c) => [c.key, c]))

interface ColumnPrefs {
  order: string[]
  hidden: string[]
}

function loadColumnPrefs(lsKey: string): ColumnPrefs {
  try {
    const raw = localStorage.getItem(lsKey)
    if (!raw) return { order: ALL_COLUMNS.map((c) => c.key), hidden: [] }
    const parsed = JSON.parse(raw) as ColumnPrefs
    const knownKeys = new Set(ALL_COLUMNS.map((c) => c.key))
    const validOrder = parsed.order.filter((k) => knownKeys.has(k))
    const missing = ALL_COLUMNS.map((c) => c.key).filter((k) => !validOrder.includes(k))
    return {
      order: [...validOrder, ...missing],
      hidden: (parsed.hidden ?? []).filter((k: string) => knownKeys.has(k)),
    }
  } catch {
    return { order: ALL_COLUMNS.map((c) => c.key), hidden: [] }
  }
}

function saveColumnPrefs(lsKey: string, prefs: ColumnPrefs) {
  localStorage.setItem(lsKey, JSON.stringify(prefs))
}

// ─── Stage ────────────────────────────────────────────────────

type LeadStageKey =
  | 'fechado'
  | 'perdido_vendas'
  | 'perdido'
  | 'reuniao_realizada'
  | 'em_negociacao'
  | 'noshow_vendas'
  | 'ag_reuniao_vendas'
  | 'noshow'
  | 'ag_reuniao'
  | 'qualificado'
  | 'conectado'
  | 'lead_recebido'

interface StageInfo {
  label: string
  badgeClass: string
}

const STAGE_CONFIG: Record<LeadStageKey, StageInfo> = {
  fechado:           { label: 'Fechado',              badgeClass: 'bg-empire-success/15 text-empire-success' },
  perdido_vendas:    { label: 'Perdido Vendas',        badgeClass: 'bg-empire-danger/10 text-empire-danger' },
  perdido:           { label: 'Perdido',               badgeClass: 'bg-empire-danger/8 text-empire-danger' },
  reuniao_realizada: { label: 'Reunião Realizada',     badgeClass: 'bg-empire-success/10 text-empire-success' },
  em_negociacao:     { label: 'Em Negociação',         badgeClass: 'bg-empire-warning/15 text-empire-warning' },
  noshow_vendas:     { label: 'No-show Vendas',        badgeClass: 'bg-empire-danger/6 text-empire-danger' },
  ag_reuniao_vendas: { label: 'Ag. Reunião Vendas',   badgeClass: 'bg-empire-info/10 text-empire-info' },
  noshow:            { label: 'No-show',               badgeClass: 'bg-empire-danger/6 text-empire-danger' },
  ag_reuniao:        { label: 'Ag. Reunião',           badgeClass: 'bg-empire-info/10 text-empire-info' },
  qualificado:       { label: 'Qualificado',           badgeClass: 'bg-empire-success/10 text-empire-success' },
  conectado:         { label: 'Conectado',             badgeClass: 'bg-empire-warning/10 text-empire-warning' },
  lead_recebido:     { label: 'Lead Recebido',         badgeClass: 'bg-empire-elevated text-empire-subtle' },
}

// Mapeia nomes de estágio do GHL para LeadStageKey
function ghlStageToKey(stageName: string | null | undefined): LeadStageKey | null {
  if (!stageName) return null
  const s = stageName.toLowerCase().trim()
  if (s.includes('fechad') || s.includes('won'))              return 'fechado'
  if (s.includes('perdid') || s.includes('lost'))             return 'perdido'
  if (s.includes('negoci'))                                   return 'em_negociacao'
  if (s.includes('no-show vendas') || s.includes('noshow vendas')) return 'noshow_vendas'
  if (s.includes('ag') && s.includes('vendas'))               return 'ag_reuniao_vendas'
  if (s.includes('no-show') || s.includes('noshow'))          return 'noshow'
  if (s.includes('reunião realizada') || s.includes('reuniao realizada') || s.includes('realizada')) return 'reuniao_realizada'
  if (s.includes('ag') || s.includes('agendad') || s.includes('reunião marcada') || s.includes('reuniao marcada')) return 'ag_reuniao'
  if (s.includes('qualificad'))                               return 'qualificado'
  if (s.includes('lead recebido') || s.includes('lead') || s.includes('novo')) return 'lead_recebido'
  return null
}

function deriveStage(opp: OppRow, paymentDateMap: Map<string, string>): LeadStageKey {
  // Pagamento confirmado tem prioridade máxima
  if (paymentDateMap.has(opp.id)) return 'fechado'

  // Opps perdidas
  if (opp.data_perdido_vendas) return 'perdido_vendas'
  if (opp.data_perdido || opp.status === 'lost') return 'perdido'

  // Usa o estágio real do pipeline GHL quando disponível
  const fromGhl = ghlStageToKey(opp.pipeline_stage_id)
  if (fromGhl) return fromGhl

  // Fallback por datas (quando pipeline_stage_id não está disponível)
  if (opp.data_realizacao_vendas)   return 'reuniao_realizada'
  if (opp.data_negociacao)          return 'em_negociacao'
  if (opp.data_no_show_vendas)      return 'noshow_vendas'
  if (opp.data_agendamento_vendas)  return 'ag_reuniao_vendas'
  if (opp.data_no_show)             return 'noshow'
  if (opp.data_agendamento_reuniao) return 'ag_reuniao'
  if (opp.data_qualificado)         return 'qualificado'
  return 'lead_recebido'
}

// ─── Row type ─────────────────────────────────────────────────

interface LeadRow {
  id: string
  opp: OppRow
  nome: string
  canal: string
  funil: string
  campanha: string
  entrada: string | null
  estagio: LeadStageKey
  score: number | null
  termometro: LeadQualityBucket | null
  maturidade: LeadQualityMaturity | null
  isMql: boolean
  sdr: string
  conectado: boolean
  agendado: boolean
  reuniao: boolean
  fechado: boolean
  faturamento: number
  caixa: number
  fatura_anual: string | null
  perfil: string | null
  mensagens: number
  ligacoes: number
  respondedIn7d: boolean
  scheduledIn7d: boolean
  boughtIn90d: boolean
}

// ─── Helpers ─────────────────────────────────────────────────

const EMPTY_COMM: CommAggregation = { msgs_humanas: 0, msgs_ia: 0, emails: 0, ligacoes: 0, msgs_lead: 0, inbound_dates: [] }

type ScoreGroupBy = 'canal' | 'funil' | 'campanha' | 'sdr' | 'estagio'

function fmtCurrency(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function getLeadSortValue(row: LeadRow, key: string): string | number {
  switch (key) {
    case 'canal':        return row.canal.toLowerCase()
    case 'funil':        return row.funil.toLowerCase()
    case 'campanha':     return row.campanha.toLowerCase()
    case 'entrada':      return row.entrada ?? ''
    case 'estagio':      return row.estagio
    case 'score':        return row.score ?? -1
    case 'termometro':   return (row.termometro ?? '').toLowerCase()
    case 'mql':          return row.isMql ? 1 : 0
    case 'sdr':          return row.sdr.toLowerCase()
    case 'conectado':    return row.conectado ? 1 : 0
    case 'agendado':     return row.agendado ? 1 : 0
    case 'reuniao':      return row.reuniao ? 1 : 0
    case 'fechado':      return row.fechado ? 1 : 0
    case 'faturamento':  return row.faturamento
    case 'caixa':        return row.caixa
    case 'fatura_anual': return (row.fatura_anual ?? '').toLowerCase()
    case 'perfil':       return (row.perfil ?? '').toLowerCase()
    case 'mensagens':    return row.mensagens
    case 'ligacoes':     return row.ligacoes
    default:             return ''
  }
}

function getBucketBadgeClass(bucket: LeadQualityBucket | null): string {
  switch (bucket) {
    case 'Excelente':
      return 'bg-empire-success/15 text-empire-success'
    case 'Bom':
      return 'bg-empire-info/10 text-empire-info'
    case 'Medio':
      return 'bg-empire-warning/15 text-empire-warning'
    case 'Fraco':
      return 'bg-empire-warning/15 text-empire-warning'
    case 'Critico':
      return 'bg-empire-danger/12 text-empire-danger'
    default:
      return 'bg-empire-elevated text-empire-subtle'
  }
}

function formatMaturityLabel(maturity: LeadQualityMaturity | null): string {
  switch (maturity) {
    case 'recente':
      return 'Recente'
    case 'em_resposta':
      return 'Resposta'
    case 'em_agendamento':
      return 'Agendamento'
    case 'em_avanco':
      return 'Avanço'
    case 'maduro':
      return 'Maduro'
    default:
      return '—'
  }
}

// ─── Main component ───────────────────────────────────────────

export function LeadsTable({
  opps,
  revenueRows,
  channelNameMap,
  campaignFunnelMap = new Map(),
  campaignNameMap = new Map(),
  startDate,
  loading: parentLoading,
  title = 'Leads',
  lsKey = DEFAULT_LS_KEY,
  initialConnectionFilter = 'all',
}: LeadsTableProps) {
  // ── Column config ────────────────────────────────────────
  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadColumnPrefs(lsKey).order)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(loadColumnPrefs(lsKey).hidden))
  const [configOpen, setConfigOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Sort ────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string>('entrada')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Filtros internos ───────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [connectionFilter, setConnectionFilter] = useState<'all' | 'connected' | 'not_connected'>(initialConnectionFilter)
  const [scoreGroupBy, setScoreGroupBy] = useState<ScoreGroupBy>('canal')

  // ── LeadCard ─────────────────────────────────────────────
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)

  // Persist column prefs
  useEffect(() => {
    saveColumnPrefs(lsKey, { order: columnOrder, hidden: Array.from(hiddenColumns) })
  }, [lsKey, columnOrder, hiddenColumns])

  useEffect(() => {
    setConnectionFilter(initialConnectionFilter)
  }, [initialConnectionFilter])

  // ── Dados derivados ────────────────────────────────────
  const paymentDateMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])
  const revenueMap = useMemo(() => buildRevenueMap(revenueRows), [revenueRows])

  // ── Comunicações ─────────────────────────────────────────
  const contatoIds = useMemo(
    () => opps.map((o) => o.contato_id).filter((id): id is string => Boolean(id)),
    [opps],
  )
  const { commsMap, loading: commsLoading } = useMQLCohortComms(contatoIds, startDate)

  // ── Rows ─────────────────────────────────────────────────
  const rows = useMemo((): LeadRow[] => {
    return opps.map((opp) => {
      const rawSrc = opp.contatos?.utm_source ?? null
      const canal = rawSrc ? (channelNameMap.get(rawSrc) ?? rawSrc) : '—'

      const rawCampaign = opp.contatos?.utm_campaign ?? null
      const campaignName = rawCampaign ? (campaignNameMap.get(rawCampaign) ?? rawCampaign) : ''
      const contactTags = parseTags(opp.contatos?.tags)

      // Funil via utm_campaign → campaignFunnelMap.
      // Para campanhas [cp]: só conta se o contato tem a tag correspondente.
      const isCpCampaign = campaignName.toLowerCase().startsWith('[cp]')
      const cpTagPresent = isCpCampaign
        ? contactTags.some((t) => t.toLowerCase() === campaignName.toLowerCase())
        : true
      const funnels = rawCampaign && cpTagPresent ? (campaignFunnelMap.get(rawCampaign) ?? []) : []
      const funil = funnels[0] ?? '—'

      const campanha = rawCampaign
        ? (isCpCampaign
            ? (cpTagPresent ? campaignName : '—')
            : campaignName || rawCampaign)
        : '—'

      const entrada = opp.data_lead_recebido ? tsToSPDate(opp.data_lead_recebido) : null
      const estagio = deriveStage(opp, paymentDateMap)
      const isMql = isMqlByTag(opp.contatos)
      const sdr = opp.sdr_name || opp.contatos?.owner_name || '—'
      const rev = revenueMap.get(opp.id)
      const comms = (opp.contato_id ? commsMap.get(opp.contato_id) : null) ?? EMPTY_COMM
      const scoreResult = computeLeadQualityScore(
        opp,
        isMql,
        comms,
        paymentDateMap.has(opp.id),
        paymentDateMap.get(opp.id),
      )

      return {
        id: opp.id,
        opp,
        nome: opp.contatos?.nome ?? '(sem nome)',
        canal,
        funil,
        campanha,
        entrada,
        estagio,
        score: scoreResult.scoreTotal,
        termometro: scoreResult.scoreBucket,
        maturidade: scoreResult.maturityStage,
        isMql,
        sdr,
        conectado: !!opp.data_conectado,
        agendado: !!opp.data_agendamento_reuniao,
        reuniao: !!opp.data_realizacao_vendas,
        fechado: paymentDateMap.has(opp.id),
        faturamento: rev?.faturamento ?? 0,
        caixa: rev?.caixa ?? 0,
        fatura_anual: opp.contatos?.faturamento_anual ?? null,
        perfil: opp.contatos?.perfil_inteligente ?? null,
        mensagens: comms.msgs_humanas,
        ligacoes: comms.ligacoes,
        respondedIn7d: scoreResult.respondedIn7d,
        scheduledIn7d: scoreResult.scheduledIn7d,
        boughtIn90d: scoreResult.boughtIn90d,
      }
    })
  }, [opps, paymentDateMap, revenueMap, channelNameMap, campaignFunnelMap, campaignNameMap, commsMap])

  // ── Filtros internos ───────────────────────────────────
  const filteredRows = useMemo(() => {
    let result = rows
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) => r.nome.toLowerCase().includes(q))
    }
    if (stageFilter) result = result.filter((r) => r.estagio === stageFilter)
    if (connectionFilter === 'connected') {
      result = result.filter((r) => r.conectado)
    }
    if (connectionFilter === 'not_connected') {
      result = result.filter((r) => !r.conectado)
    }
    return result
  }, [rows, searchQuery, stageFilter, connectionFilter])

  // ── Ordenação ─────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows]
    sorted.sort((a, b) => {
      const col = COLUMN_MAP.get(sortKey)
      if (sortKey === 'nome') {
        const sa = a.nome.toLowerCase()
        const sb = b.nome.toLowerCase()
        return sortDir === 'desc' ? sb.localeCompare(sa) : sa.localeCompare(sb)
      }
      if (col?.boolean || col?.numeric || col?.currency) {
        const va = getLeadSortValue(a, sortKey) as number
        const vb = getLeadSortValue(b, sortKey) as number
        return sortDir === 'desc' ? vb - va : va - vb
      }
      const va = getLeadSortValue(a, sortKey) as string
      const vb = getLeadSortValue(b, sortKey) as string
      return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
    })
    return sorted
  }, [filteredRows, sortKey, sortDir])

  // ── Colunas visíveis ─────────────────────────────────
  const visibleColumns = useMemo(
    () => columnOrder.filter((k) => !hiddenColumns.has(k)).map((k) => COLUMN_MAP.get(k)!).filter(Boolean),
    [columnOrder, hiddenColumns],
  )

  const scoredRows = useMemo(
    () => filteredRows.filter((row) => row.isMql && row.score != null),
    [filteredRows],
  )

  const scoreSummary = useMemo(() => {
    const totalMqls = filteredRows.filter((row) => row.isMql).length
    const total = scoredRows.length

    if (total === 0) {
      return {
        totalMqls,
        scoredMqls: 0,
        avgScore: null as number | null,
        excellentPct: 0,
        criticalPct: 0,
        respondedPct: 0,
        scheduledPct: 0,
        boughtPct: 0,
      }
    }

    const excellentCount = scoredRows.filter((row) => row.termometro === 'Excelente').length
    const criticalCount = scoredRows.filter((row) => row.termometro === 'Critico').length
    const scoreTotal = scoredRows.reduce((sum, row) => sum + (row.score ?? 0), 0)

    return {
      totalMqls,
      scoredMqls: total,
      avgScore: Math.round(scoreTotal / total),
      excellentPct: Math.round((excellentCount / total) * 100),
      criticalPct: Math.round((criticalCount / total) * 100),
      respondedPct: Math.round((scoredRows.filter((row) => row.respondedIn7d).length / total) * 100),
      scheduledPct: Math.round((scoredRows.filter((row) => row.scheduledIn7d).length / total) * 100),
      boughtPct: Math.round((scoredRows.filter((row) => row.boughtIn90d).length / total) * 100),
    }
  }, [filteredRows, scoredRows])

  const groupedScoreRows = useMemo(() => {
    const groups = new Map<string, LeadRow[]>()

    for (const row of scoredRows) {
      let key = '—'
      if (scoreGroupBy === 'canal') key = row.canal || '—'
      else if (scoreGroupBy === 'funil') key = row.funil || '—'
      else if (scoreGroupBy === 'campanha') key = row.campanha || '—'
      else if (scoreGroupBy === 'sdr') key = row.sdr || '—'
      else if (scoreGroupBy === 'estagio') key = STAGE_CONFIG[row.estagio].label
      const current = groups.get(key) ?? []
      current.push(row)
      groups.set(key, current)
    }

    return Array.from(groups.entries())
      .map(([label, rows]) => {
        const avgScore = Math.round(rows.reduce((sum, row) => sum + (row.score ?? 0), 0) / rows.length)
        return {
          label,
          leadCount: rows.length,
          avgScore,
          avgBucket: getLeadQualityBucket(avgScore),
          respondedPct: Math.round((rows.filter((row) => row.respondedIn7d).length / rows.length) * 100),
          scheduledPct: Math.round((rows.filter((row) => row.scheduledIn7d).length / rows.length) * 100),
          boughtPct: Math.round((rows.filter((row) => row.boughtIn90d).length / rows.length) * 100),
        }
      })
      .sort((a, b) => {
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore
        return b.leadCount - a.leadCount
      })
      .slice(0, 8)
  }, [scoredRows, scoreGroupBy])

  // ── Handlers ─────────────────────────────────────────
  const toggleColumn = useCallback((key: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const moveColumn = useCallback((key: string, dir: 'up' | 'down') => {
    setColumnOrder((prev) => {
      const idx = prev.indexOf(key)
      if (idx < 0) return prev
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
      return next
    })
  }, [])

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }, [sortKey])

  // ── Loading skeleton ─────────────────────────────────
  const isLoading = parentLoading || commsLoading
  if (isLoading && rows.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  // ── UI helpers ────────────────────────────────────────
  const sortIcon = (key: string) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUpNarrowWide className="h-3.5 w-3.5 text-empire-primary" />
      : <ArrowDownWideNarrow className="h-3.5 w-3.5 text-empire-primary" />
  }

  const inputStyle = {
    background: 'var(--empire-surface)',
    border: '1.5px solid var(--empire-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--empire-void)',
  }

  const thBase = 'sticky top-0 z-20 bg-empire-elevated px-3 py-3 text-center cursor-pointer select-none whitespace-nowrap'
  const thInner = 'flex items-center justify-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-empire-subtle hover:text-empire-void'

  const tableContent = (
    <>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-empire-void">{title}</h2>
          <span className="text-xs text-empire-subtle">
            {sortedRows.length} {sortedRows.length !== 1 ? 'leads' : 'lead'}
            {filteredRows.length !== rows.length && (
              <span className="ml-1 text-empire-border">(de {rows.length})</span>
            )}
            {commsLoading && <span className="ml-2 text-empire-border">carregando msgs...</span>}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-empire-subtle pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar lead..."
              className="h-8 pl-8 pr-3 text-xs focus:outline-none transition-colors"
              style={{ ...inputStyle, minWidth: '160px' }}
            />
          </div>

          {/* Filtro de estágio */}
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="h-8 px-3 text-xs focus:outline-none transition-colors"
            style={{ ...inputStyle, color: stageFilter ? 'var(--empire-void)' : 'var(--empire-subtle)', minWidth: '140px' }}
          >
            <option value="">Todos os estágios</option>
            {(Object.entries(STAGE_CONFIG) as [LeadStageKey, StageInfo][]).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          <select
            value={connectionFilter}
            onChange={(e) => setConnectionFilter(e.target.value as 'all' | 'connected' | 'not_connected')}
            className="h-8 px-3 text-xs focus:outline-none transition-colors"
            style={{ ...inputStyle, color: connectionFilter !== 'all' ? 'var(--empire-void)' : 'var(--empire-subtle)', minWidth: '140px' }}
          >
            <option value="all">Todas conexões</option>
            <option value="not_connected">Não conectados</option>
            <option value="connected">Conectados</option>
          </select>

          {/* Colunas */}
          <div className="relative">
            <button
              onClick={() => setConfigOpen((p) => !p)}
              className="flex items-center gap-1.5 rounded-md border border-empire-border bg-white px-3 py-1.5 text-xs font-medium text-empire-subtle hover:bg-empire-elevated transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Colunas
            </button>
            {configOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-empire-border bg-white p-3 shadow-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-empire-void">Configurar colunas</span>
                  <button onClick={() => setConfigOpen(false)} className="text-empire-subtle hover:text-empire-void">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {columnOrder.map((key, idx) => {
                    const col = COLUMN_MAP.get(key)
                    if (!col) return null
                    return (
                      <div key={key} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-empire-elevated">
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.has(key)}
                          onChange={() => toggleColumn(key)}
                          className="rounded border-empire-border"
                        />
                        <span className="flex-1 text-xs text-empire-void">{col.label}</span>
                        <button onClick={() => moveColumn(key, 'up')} disabled={idx === 0} className="text-empire-subtle hover:text-empire-void disabled:opacity-30">
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => moveColumn(key, 'down')} disabled={idx === columnOrder.length - 1} className="text-empire-subtle hover:text-empire-void disabled:opacity-30">
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Tela cheia */}
          <button
            onClick={() => setIsFullscreen((p) => !p)}
            className="flex items-center gap-1.5 rounded-md border border-empire-border bg-white px-3 py-1.5 text-xs font-medium text-empire-subtle hover:bg-empire-elevated transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? 'Sair' : 'Tela cheia'}
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-empire-border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-empire-void">Score real do MQL</p>
            <p className="text-xs text-empire-subtle">
              Cohort por <code>data_lead_recebido</code>, MQL por tag, resposta por inbound e compra por <code>data_pagamento_entrada</code>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-empire-subtle">Agrupar por</span>
            <select
              value={scoreGroupBy}
              onChange={(e) => setScoreGroupBy(e.target.value as ScoreGroupBy)}
              className="h-8 px-3 text-xs focus:outline-none transition-colors"
              style={{ ...inputStyle, minWidth: '140px' }}
            >
              <option value="canal">Canal</option>
              <option value="funil">Funil</option>
              <option value="campanha">Campanha</option>
              <option value="sdr">SDR</option>
              <option value="estagio">Estágio</option>
            </select>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {[
            {
              label: 'Score médio',
              value: scoreSummary.avgScore != null ? String(scoreSummary.avgScore) : '—',
              helper: `${scoreSummary.scoredMqls}/${scoreSummary.totalMqls} MQLs com score`,
            },
            { label: 'Excelentes', value: `${scoreSummary.excellentPct}%`, helper: 'Bucket 85-100' },
            { label: 'Críticos', value: `${scoreSummary.criticalPct}%`, helper: 'Bucket 0-29' },
            { label: 'Responderam 7d', value: `${scoreSummary.respondedPct}%`, helper: 'Inbound em até 7 dias' },
            { label: 'Compraram 90d', value: `${scoreSummary.boughtPct}%`, helper: 'Pagamento confirmado' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-empire-border bg-empire-elevated px-3 py-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-empire-subtle">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold text-empire-void">{item.value}</p>
              <p className="mt-1 text-xs text-empire-subtle">{item.helper}</p>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-auto rounded-lg border border-empire-border">
          <table className="w-full min-w-[720px] text-sm border-collapse">
            <thead>
              <tr className="border-b border-empire-border bg-empire-elevated">
                <th className="px-3 py-2 text-left text-[10px] font-mono font-semibold uppercase tracking-wider text-empire-subtle">{scoreGroupBy}</th>
                <th className="px-3 py-2 text-center text-[10px] font-mono font-semibold uppercase tracking-wider text-empire-subtle">MQLs</th>
                <th className="px-3 py-2 text-center text-[10px] font-mono font-semibold uppercase tracking-wider text-empire-subtle">Score</th>
                <th className="px-3 py-2 text-center text-[10px] font-mono font-semibold uppercase tracking-wider text-empire-subtle">Termômetro</th>
                <th className="px-3 py-2 text-center text-[10px] font-mono font-semibold uppercase tracking-wider text-empire-subtle">Resp. 7d</th>
                <th className="px-3 py-2 text-center text-[10px] font-mono font-semibold uppercase tracking-wider text-empire-subtle">Agend. 7d</th>
                <th className="px-3 py-2 text-center text-[10px] font-mono font-semibold uppercase tracking-wider text-empire-subtle">Compra 90d</th>
              </tr>
            </thead>
            <tbody>
              {groupedScoreRows.length > 0 ? groupedScoreRows.map((group) => (
                <tr key={group.label} className="border-b border-empire-border last:border-b-0">
                  <td className="px-3 py-2 text-xs text-empire-void">{group.label}</td>
                  <td className="px-3 py-2 text-center text-xs font-mono text-empire-void">{group.leadCount}</td>
                  <td className="px-3 py-2 text-center text-xs font-mono font-semibold text-empire-void">{group.avgScore}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={cn('rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap', getBucketBadgeClass(group.avgBucket))}>
                      {group.avgBucket}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-empire-void">{group.respondedPct}%</td>
                  <td className="px-3 py-2 text-center text-xs text-empire-void">{group.scheduledPct}%</td>
                  <td className="px-3 py-2 text-center text-xs text-empire-void">{group.boughtPct}%</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-empire-subtle">
                    Nenhum MQL com score calculável nos filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <details className="mt-4 rounded-lg border border-empire-border bg-empire-elevated" open>
          <summary className="cursor-pointer list-none px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-empire-void">Metodologia do score</p>
                <p className="text-xs text-empire-subtle">
                  Área do sistema para auditoria rápida da regra usada no termômetro.
                </p>
              </div>
              <span className="text-[11px] uppercase tracking-wider text-empire-subtle">Documento vivo</span>
            </div>
          </summary>

          <div className="border-t border-empire-border px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-empire-subtle">Universo avaliado</p>
                  <ul className="mt-2 space-y-1 text-xs text-empire-void">
                    <li>Apenas oportunidades com tag <code>MQL</code>.</li>
                    <li>Lead = oportunidade.</li>
                    <li>Recuperação fica fora.</li>
                    <li>Cohort por <code>data_lead_recebido</code>.</li>
                    <li>Compra real só por <code>data_pagamento_entrada</code>.</li>
                  </ul>
                </div>

                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-empire-subtle">Fórmula</p>
                  <div className="mt-2 rounded-md border border-empire-border bg-white px-3 py-2 text-xs font-mono text-empire-void">
                    lead_quality_score = (pontos_ganhos / pontos_elegiveis) * 100
                  </div>
                  <p className="mt-2 text-xs text-empire-subtle">
                    Pontos elegíveis evitam punir lead recente por etapa que ainda não venceu.
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-empire-subtle">Blocos de pontuação</p>
                  <div className="mt-2 space-y-2 text-xs text-empire-void">
                    <div className="rounded-md border border-empire-border bg-white px-3 py-2">
                      <strong>Resposta inicial (25 pts)</strong>: inbound em até 7 dias, <code>data_conectado</code> e velocidade da primeira resposta.
                    </div>
                    <div className="rounded-md border border-empire-border bg-white px-3 py-2">
                      <strong>Agendamento (25 pts)</strong>: <code>data_agendamento_reuniao</code> até 7 dias e reunião prevista até 10 dias.
                    </div>
                    <div className="rounded-md border border-empire-border bg-white px-3 py-2">
                      <strong>Avanço comercial (25 pts)</strong>: qualificação, reunião realizada e entrada em fase comercial.
                    </div>
                    <div className="rounded-md border border-empire-border bg-white px-3 py-2">
                      <strong>Resultado final (25 pts)</strong>: pagamento confirmado em até 90 dias.
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-empire-subtle">Buckets</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(['Excelente', 'Bom', 'Medio', 'Fraco', 'Critico'] as LeadQualityBucket[]).map((bucket) => (
                      <span key={bucket} className={cn('rounded px-2 py-1 text-xs font-medium', getBucketBadgeClass(bucket))}>
                        {bucket}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </details>
      </div>

      {/* Table */}
      <div className={cn(
        'overflow-auto rounded-xl border border-empire-border',
        isFullscreen ? 'flex-1' : 'max-h-[calc(100vh-380px)]',
      )}>
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr style={{ background: 'var(--empire-elevated)', borderBottom: '1px solid var(--empire-border)' }}>
              <th
                className="sticky top-0 left-0 z-30 bg-empire-elevated min-w-[200px] px-3 py-3 text-left cursor-pointer select-none shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]"
                onClick={() => handleSort('nome')}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-empire-subtle hover:text-empire-void">
                  Lead
                  {sortIcon('nome')}
                </div>
              </th>
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  className={cn(thBase, col.narrow && 'min-w-[70px] max-w-[90px]')}
                  onClick={() => handleSort(col.key)}
                >
                  <div className={thInner}>
                    {col.label}
                    {sortIcon(col.key)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => {
              const stageInfo = STAGE_CONFIG[row.estagio]
              return (
                <tr
                  key={row.id}
                  className="transition-colors hover:bg-empire-elevated"
                  style={{ borderBottom: '1px solid var(--empire-border)' }}
                >
                  <td
                    className="sticky left-0 z-10 bg-white min-w-[200px] px-3 py-3 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] cursor-pointer hover:bg-empire-elevated"
                    style={{ transition: 'background 0.1s' }}
                    onClick={() => setSelectedOppId(row.id)}
                  >
                    <span className="text-xs font-semibold text-empire-primary hover:underline block truncate max-w-[220px]" title={row.nome}>
                      {row.nome}
                    </span>
                  </td>

                  {visibleColumns.map((col) => {
                    if (col.key === 'canal') return (
                      <td key="canal" className="px-3 py-3 text-center text-xs text-empire-void whitespace-nowrap">{row.canal}</td>
                    )
                    if (col.key === 'funil') return (
                      <td key="funil" className="px-3 py-3 text-center text-xs whitespace-nowrap"
                        style={{ color: row.funil !== '—' ? 'var(--empire-void)' : 'var(--empire-subtle)', opacity: row.funil === '—' ? 0.3 : 1 }}>
                        {row.funil}
                      </td>
                    )
                    if (col.key === 'campanha') return (
                      <td key="campanha" className="px-3 py-3 text-center text-xs max-w-[160px] truncate"
                        title={row.campanha !== '—' ? row.campanha : undefined}
                        style={{ color: row.campanha !== '—' ? 'var(--empire-void)' : 'var(--empire-subtle)', opacity: row.campanha === '—' ? 0.3 : 1 }}>
                        {row.campanha}
                      </td>
                    )
                    if (col.key === 'entrada') return (
                      <td key="entrada" className="px-3 py-3 text-center text-xs font-mono text-empire-void whitespace-nowrap">
                        {row.entrada ? fmtDate(row.entrada) : '—'}
                      </td>
                    )
                    if (col.key === 'estagio') return (
                      <td key="estagio" className="px-3 py-3 text-center">
                        <span className={cn('rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap', stageInfo.badgeClass)}>
                          {stageInfo.label}
                        </span>
                      </td>
                    )
                    if (col.key === 'score') return (
                      <td key="score" className="px-3 py-3 text-center">
                        {row.score != null ? (
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-sm font-semibold text-empire-void">{row.score}</span>
                            <span className="text-[10px] uppercase tracking-wider text-empire-subtle">
                              {formatMaturityLabel(row.maturidade)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-empire-subtle opacity-30">—</span>
                        )}
                      </td>
                    )
                    if (col.key === 'termometro') return (
                      <td key="termometro" className="px-3 py-3 text-center">
                        {row.termometro ? (
                          <span className={cn('rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap', getBucketBadgeClass(row.termometro))}>
                            {row.termometro}
                          </span>
                        ) : (
                          <span className="text-xs text-empire-subtle opacity-30">—</span>
                        )}
                      </td>
                    )
                    if (col.key === 'mql') return (
                      <td key="mql" className="px-3 py-3 text-center">
                        {row.isMql
                          ? <span className="rounded px-2 py-0.5 text-xs font-semibold bg-empire-warning/15 text-empire-primary">MQL</span>
                          : <span className="text-xs text-empire-subtle opacity-30">—</span>}
                      </td>
                    )
                    if (col.key === 'sdr') return (
                      <td key="sdr" className="px-3 py-3 text-center text-xs text-empire-void whitespace-nowrap">{row.sdr}</td>
                    )
                    if (col.key === 'conectado') return renderBoolCell('conectado', row.conectado)
                    if (col.key === 'agendado')  return renderBoolCell('agendado', row.agendado, false, (
                      <AppointmentOriginBadge
                        origin={row.opp.agendamento_origem}
                        calendarName={row.opp.agendamento_calendar_name}
                        bookedByName={row.opp.agendamento_por_user_nome}
                        assignedUserName={row.opp.agendamento_assigned_user_nome}
                      />
                    ))
                    if (col.key === 'reuniao')   return renderBoolCell('reuniao', row.reuniao)
                    if (col.key === 'fechado')   return renderBoolCell('fechado', row.fechado, true)
                    if (col.key === 'faturamento') return (
                      <td key="faturamento" className={cn('px-3 py-3 text-center text-xs font-mono whitespace-nowrap', !row.faturamento && 'opacity-40')}
                        style={{ color: row.faturamento ? 'var(--empire-success)' : 'var(--empire-subtle)' }}>
                        {row.faturamento ? fmtCurrency(row.faturamento) : '—'}
                      </td>
                    )
                    if (col.key === 'caixa') return (
                      <td key="caixa" className={cn('px-3 py-3 text-center text-xs font-mono whitespace-nowrap', !row.caixa && 'opacity-40')}
                        style={{ color: row.caixa ? 'var(--empire-success)' : 'var(--empire-subtle)' }}>
                        {row.caixa ? fmtCurrency(row.caixa) : '—'}
                      </td>
                    )
                    if (col.key === 'fatura_anual') return (
                      <td key="fatura_anual" className="px-3 py-3 text-center text-xs text-empire-void whitespace-nowrap max-w-[120px] truncate"
                        title={row.fatura_anual ?? ''}>
                        {row.fatura_anual ?? <span className="opacity-30">—</span>}
                      </td>
                    )
                    if (col.key === 'perfil') return (
                      <td key="perfil" className="px-3 py-3 text-center text-xs text-empire-void max-w-[160px] truncate"
                        title={row.perfil ?? ''}>
                        {row.perfil ?? <span className="opacity-30">—</span>}
                      </td>
                    )
                    if (col.key === 'mensagens') return renderNumCell('mensagens', row.mensagens)
                    if (col.key === 'ligacoes')  return renderNumCell('ligacoes', row.ligacoes)
                    return null
                  })}
                </tr>
              )
            })}

            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="py-16 text-center text-sm text-empire-subtle">
                  {rows.length === 0
                    ? 'Nenhum lead encontrado no período selecionado.'
                    : 'Nenhum lead encontrado com os filtros aplicados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-empire-subtle">
        Modo Cohort — filtra leads pela data de entrada (<code>data_lead_recebido</code>) e mostra tudo que aconteceu com cada um.
      </p>
    </>
  )

  return (
    <>
      {isFullscreen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex flex-col bg-white p-6 animate-fade-in-up">
              {tableContent}
            </div>,
            document.body,
          )
        : <div className="space-y-2">{tableContent}</div>
      }
      <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
    </>
  )
}

// ─── Helpers de renderização ──────────────────────────────────

function renderBoolCell(key: string, value: boolean, highlight = false, children?: ReactNode) {
  return (
    <td key={key} className="px-3 py-3 text-center">
      {value ? (
        <div className="flex flex-col items-center gap-1">
          <span className={cn(
            'inline-flex items-center justify-center w-5 h-5 rounded-full',
            highlight ? 'bg-empire-success/20' : 'bg-empire-success/12',
          )}>
            <Check className="h-3 w-3 text-[var(--empire-success)]" />
          </span>
          {children}
        </div>
      ) : (
        <span className="text-empire-subtle opacity-30 text-xs">—</span>
      )}
    </td>
  )
}

function renderNumCell(key: string, value: number) {
  const isEmpty = value === 0
  return (
    <td key={key} className={cn('px-3 py-3 text-center text-xs font-mono whitespace-nowrap', isEmpty && 'opacity-40')}
      style={{ color: isEmpty ? 'var(--empire-subtle)' : 'var(--empire-void)' }}>
      {value}
    </td>
  )
}
