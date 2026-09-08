import { useState, useMemo, useEffect, useCallback } from 'react'
import { isFilterActive, applyFilterValue } from '@/types/filters'
import type { FilterValues } from '@/types/filters'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { buildPaymentDateMap, buildRevenueMap, isMqlByTag } from '@/hooks/useTrafego'
import { spDaysAgo } from '@/lib/utils/dates'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import { fmtDate } from '@/lib/utils/dates'
import { LeadCard } from '@/components/leads/LeadCard'
import { AppointmentOriginBadge } from '@/components/appointment-origin-badge'
import { PIPELINE_RECUPERACAO_ID } from '@/lib/constants'
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
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  startDate: string
  endDate: string
  loading: boolean
  /** SDR selecionado no filtro global da página */
  globalSdr?: FilterValues
}

// ─── Column definitions ────────────────────────────────────────

interface ColDef {
  key: string
  label: string
  numeric?: boolean
  narrow?: boolean
}

const ALL_COLUMNS: ColDef[] = [
  { key: 'sdr',                   label: 'SDR' },
  { key: 'status',                label: 'Status' },
  { key: 'data_agendamento',      label: 'Agendado em' },
  { key: 'data_reuniao_prevista', label: 'Reunião Prevista' },
  { key: 'data_reuniao_realizada',label: 'Reunião Realizada' },
  { key: 'valor_faturado',        label: 'Faturado', numeric: true },
  { key: 'mql',                   label: 'MQL', narrow: true },
  { key: 'origem',                label: 'Origem' },
]

const COLUMN_MAP = new Map(ALL_COLUMNS.map((c) => [c.key, c]))
const NUMERIC_KEYS = new Set(ALL_COLUMNS.filter((c) => c.numeric).map((c) => c.key))
const LS_KEY = 'eb-dash2:agendamentos-tab:columns-v1'

interface ColumnPrefs {
  order: string[]
  hidden: string[]
}

function loadColumnPrefs(): ColumnPrefs {
  try {
    const raw = localStorage.getItem(LS_KEY)
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

function saveColumnPrefs(prefs: ColumnPrefs) {
  localStorage.setItem(LS_KEY, JSON.stringify(prefs))
}

// ─── Meta helpers ─────────────────────────────────────────────

const META_POR_DIA_UTIL = 10

function contarDiasUteis(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T12:00:00`)
  const end   = new Date(`${endDate}T12:00:00`)
  let count = 0
  const cur = new Date(start)
  while (cur <= end) {
    const dow = cur.getDay() // 0=dom, 6=sab
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return count
}

// ─── Status helpers ────────────────────────────────────────────

type AgendStatusKey = 'fechado' | 'perdido' | 'reuniao_realizada' | 'noshow' | 'reuniao_agendada' | 'agendado'

interface StatusInfo {
  label: string
  badgeClass: string
}

const STATUS_MAP: Record<AgendStatusKey, StatusInfo> = {
  fechado:           { label: 'Fechado',         badgeClass: 'bg-empire-success/15 text-empire-success' },
  perdido:           { label: 'Perdido',         badgeClass: 'bg-empire-danger/10 text-empire-danger' },
  reuniao_realizada: { label: 'Reunião Feita',   badgeClass: 'bg-empire-success/10 text-empire-success' },
  noshow:            { label: 'No-show',         badgeClass: 'bg-empire-danger/8 text-empire-danger' },
  reuniao_agendada:  { label: 'Reunião Marcada', badgeClass: 'bg-empire-info/10 text-empire-info' },
  agendado:          { label: 'Agendado',        badgeClass: 'bg-empire-info/10 text-empire-info' },
}

function deriveStatus(opp: OppRow, paymentMap: Map<string, string>): AgendStatusKey {
  if (paymentMap.has(opp.id)) return 'fechado'
  if (opp.data_perdido || opp.data_perdido_vendas) return 'perdido'
  if (opp.data_realizacao_vendas) return 'reuniao_realizada'
  if (opp.data_no_show || opp.data_no_show_vendas) return 'noshow'
  if (opp.data_reuniao_agendada) return 'reuniao_agendada'
  return 'agendado'
}

// ─── Row type ──────────────────────────────────────────────────

interface AgendRow {
  id: string
  opp: OppRow
  cliente: string
  sdr: string
  sdrIsIa: boolean
  status: AgendStatusKey
  data_agendamento: string | null
  data_reuniao_prevista: string | null
  data_reuniao_realizada: string | null
  valor_faturado: number | null
  mql: boolean
  origem: string
}

// ─── Formatters ────────────────────────────────────────────────

function fmtCurrency(v: number | null): string {
  if (v === null || v === 0) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// ─── Main component ───────────────────────────────────────────

export function AgendamentosTab({
  startDate,
  endDate,
  loading: parentLoading,
  globalSdr,
}: Props) {
  // ── Column config ────────────────────────────────────────
  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadColumnPrefs().order)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(loadColumnPrefs().hidden))
  const [configOpen, setConfigOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Sort ────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string>('data_agendamento')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Filtros internos ───────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sdrFilter, setSdrFilter] = useState('')

  // ── LeadCard ─────────────────────────────────────────────
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)

  // Persist column prefs
  useEffect(() => {
    saveColumnPrefs({ order: columnOrder, hidden: Array.from(hiddenColumns) })
  }, [columnOrder, hiddenColumns])

  // ── Dados externos: mapa de canais ───────────────────────
  const [channelNameMap, setChannelNameMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const wid = await getWorkspaceId()
      if (cancelled || !wid) return
      const [paidRes, organicRes] = await Promise.all([
        supabase.from('utm_sources').select('nome, utm_source').eq('workspace_id', wid),
        supabase.from('utm_sources_plain').select('nome, utm_source').eq('workspace_id', wid),
      ])
      if (cancelled) return
      const m = new Map<string, string>()
      for (const r of [...(paidRes.data ?? []), ...(organicRes.data ?? [])]) {
        const row = r as { nome: string | null; utm_source: string | null }
        if (row.utm_source) m.set(row.utm_source, row.nome || row.utm_source)
      }
      setChannelNameMap(m)
    })()
    return () => { cancelled = true }
  }, [])

  // ── Busca local por data_agendamento_reuniao ──────────────
  // O hook do pai filtra por data_lead_recebido — um lead recebido em outro período
  // pode ter sido agendado neste período. Portanto fazemos fetch próprio.
  const [localOpps, setLocalOpps] = useState<OppRow[]>([])
  const [localRevenueRows, setLocalRevenueRows] = useState<RevenueRow[]>([])
  const [localLoading, setLocalLoading] = useState(false)

  useEffect(() => {
    if (!startDate || !endDate) return
    let cancelled = false
    setLocalLoading(true)

    void (async () => {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) throw new Error('Conta não encontrada')

        const OPP_SELECT = `
          id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
          lost_reason, vendedor_closer, sdr_name, status,
          data_lead_recebido, data_conectado, data_qualificado,
          data_no_show, data_agendamento_reuniao, data_reuniao_agendada,
          data_realizacao_vendas, data_fechado,
          data_perdido, data_perdido_vendas, data_negociacao,
          data_no_show_vendas, data_agendamento_vendas,
          data_pendencias_preenchimento,
          data_auto_agendamento,
          agendamento_origem, agendamento_por_user_id, agendamento_por_user_nome,
          agendamento_por_user_email, agendamento_calendar_id, agendamento_calendar_name,
          agendamento_assigned_user_id, agendamento_assigned_user_nome,
          contatos(
            ghl_id, nome, email, telefone,
            utm_source, utm_medium, utm_campaign, utm_term, utm_content,
            fbclid, gclid,
            tt_source, tt_campaign, tt_medium, tt_term, tt_content,
            owner_name, owner_email, date_created, print_instagram,
            como_nos_conheceu, faturamento_anual, perfil_inteligente,
            tags
          )
        `
        const PAGE_SIZE = 1000
        let all: OppRow[] = []
        let page = 0
        while (true) {
          const res = await supabase
            .from('oportunidades')
            .select(OPP_SELECT)
            .eq('workspace_id', wid)
            .gte('data_agendamento_reuniao', startDate)
            .lte('data_agendamento_reuniao', endDate)
            .neq('pipeline_id', PIPELINE_RECUPERACAO_ID)
            .order('data_agendamento_reuniao', { ascending: false })
            .order('id', { ascending: true })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
          if (res.error) throw res.error
          const rows = (res.data ?? []) as unknown as OppRow[]
          all = all.concat(rows)
          if (rows.length < PAGE_SIZE) break
          page++
        }

        if (cancelled) return
        setLocalOpps(all)

        if (all.length > 0) {
          const oppIds = all.map((o) => o.id)
          const accRev: RevenueRow[] = []
          let revErr = false
          const BATCH = 100
          for (let i = 0; i < oppIds.length; i += BATCH) {
            const batch = oppIds.slice(i, i + BATCH)
            const revRes = await supabase
              .from('vendas_fechamento')
              .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada, link_gravacao_call_vendas')
              .in('oportunidade_id', batch)
            if (revRes.error) { revErr = true; break }
            accRev.push(...((revRes.data ?? []) as RevenueRow[]))
          }
          if (!cancelled && !revErr) {
            setLocalRevenueRows(accRev)
          }
        } else {
          setLocalRevenueRows([])
        }
      } finally {
        if (!cancelled) setLocalLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [startDate, endDate])

  // ── Dados derivados ────────────────────────────────────
  const paymentMap = useMemo(() => buildPaymentDateMap(localRevenueRows), [localRevenueRows])
  const revenueMap = useMemo(() => buildRevenueMap(localRevenueRows), [localRevenueRows])

  // ── Meta de Comparecimento: 70% em janela 7d + 72h ────────
  const metaComparecimento = useMemo(() => {
    const windowStart = spDaysAgo(9) // 7 dias + 3 dias tolerância - 1
    const windowEnd = spDaysAgo(3)   // 72h de tolerância mínima
    const agendados = localOpps.filter(
      (o) => !!o.data_agendamento_reuniao && o.data_agendamento_reuniao >= windowStart && o.data_agendamento_reuniao <= windowEnd,
    )
    const realizados = agendados.filter((o) => !!o.data_realizacao_vendas)
    return {
      agendados: agendados.length,
      realizados: realizados.length,
      taxa: agendados.length > 0 ? Math.round((realizados.length / agendados.length) * 100) : 0,
    }
  }, [localOpps])

  const rows = useMemo((): AgendRow[] => {
    return localOpps.map((opp) => {
      const rawCanal = opp.contatos?.utm_source ?? null
      const origem = rawCanal ? (channelNameMap.get(rawCanal) ?? rawCanal) : '—'

      const sdrIsIa = (opp.contatos?.tags ?? '').toLowerCase().includes('[cp] sdr ia')
      const sdr = sdrIsIa ? 'SDR IA' : (opp.sdr_name || opp.contatos?.owner_name || '—')

      const rev = revenueMap.get(opp.id)

      return {
        id: opp.id,
        opp,
        cliente: opp.contatos?.nome ?? '(sem nome)',
        sdr,
        sdrIsIa,
        status: deriveStatus(opp, paymentMap),
        data_agendamento: opp.data_agendamento_reuniao,
        data_reuniao_prevista: opp.data_reuniao_agendada,
        data_reuniao_realizada: opp.data_realizacao_vendas,
        valor_faturado: rev ? rev.faturamento : null,
        mql: isMqlByTag(opp.contatos),
        origem,
      }
    })
  }, [localOpps, paymentMap, revenueMap, channelNameMap])

  // ── SDRs disponíveis para o filtro ────────────────────
  const sdrOptions = useMemo(() => {
    const set = new Set(rows.map((r) => r.sdr).filter((s) => s !== '—'))
    return Array.from(set).sort()
  }, [rows])

  // ── Filtros internos ───────────────────────────────────
  // globalSdr vem do filtro de SDR da barra de filtros da página;
  // sdrFilter é o dropdown local dentro da aba — os dois se acumulam.
  const globalSdrActive = globalSdr && isFilterActive(globalSdr)

  const filteredRows = useMemo(() => {
    let result = rows

    if (globalSdrActive) {
      result = result.filter((r) => applyFilterValue(r.sdr, globalSdr!))
    } else if (sdrFilter) {
      result = result.filter((r) => r.sdr === sdrFilter)
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) => r.cliente.toLowerCase().includes(q))
    }

    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter)
    }

    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, globalSdrActive, JSON.stringify(globalSdr), sdrFilter, searchQuery, statusFilter])

  // ── Ordenação ──────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows]
    sorted.sort((a, b) => {
      if (sortKey === 'cliente') {
        const sa = a.cliente.toLowerCase()
        const sb = b.cliente.toLowerCase()
        return sortDir === 'desc' ? sb.localeCompare(sa) : sa.localeCompare(sb)
      }

      if (NUMERIC_KEYS.has(sortKey)) {
        const va = getNumericValue(a, sortKey)
        const vb = getNumericValue(b, sortKey)
        return sortDir === 'desc' ? vb - va : va - vb
      }

      if (sortKey === 'mql') {
        const va = a.mql ? 1 : 0
        const vb = b.mql ? 1 : 0
        return sortDir === 'desc' ? vb - va : va - vb
      }

      const va = getStringValue(a, sortKey)
      const vb = getStringValue(b, sortKey)
      return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
    })
    return sorted
  }, [filteredRows, sortKey, sortDir])

  // ── Colunas visíveis ─────────────────────────────────
  const visibleColumns = useMemo(
    () => columnOrder.filter((k) => !hiddenColumns.has(k)).map((k) => COLUMN_MAP.get(k)!).filter(Boolean),
    [columnOrder, hiddenColumns],
  )

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

  // ── Loading ──────────────────────────────────────────
  const loading = parentLoading || localLoading

  if (loading && rows.length === 0) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  const sortIcon = (key: string) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
    return sortDir === 'asc'
      ? <ArrowUpNarrowWide className="h-3.5 w-3.5 text-empire-void" />
      : <ArrowDownWideNarrow className="h-3.5 w-3.5 text-empire-void" />
  }


  const thBase = 'sticky top-0 z-20 bg-empire-elevated px-3 py-3 text-center cursor-pointer select-none whitespace-nowrap'
  const thInner = 'flex items-center justify-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-empire-subtle hover:text-empire-void'

  const tableContent = (
    <>
      {/* Meta de Agendamentos */}
      {(() => {
        const diasUteis = contarDiasUteis(startDate, endDate)
        const meta = diasUteis * META_POR_DIA_UTIL
        const realizado = rows.length
        const pct = meta > 0 ? Math.min(Math.round((realizado / meta) * 100), 100) : 0
        const atingiu = realizado >= meta
        const cor = atingiu ? 'var(--empire-success)' : realizado >= meta * 0.7 ? 'var(--empire-primary)' : 'var(--empire-danger)'
        return (
          <div className="mb-3 rounded-xl border border-empire-border bg-empire-surface p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-empire-subtle uppercase tracking-wider">
                Meta de Agendamentos — {diasUteis} dia{diasUteis !== 1 ? 's' : ''} útil{diasUteis !== 1 ? 'eis' : ''}
              </span>
              <span className="text-xs font-semibold">
                {realizado} / {meta}
                {atingiu && <span className="ml-1.5">✓ meta atingida</span>}
              </span>
            </div>
            <div className="h-2 rounded-full bg-empire-border overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, background: cor }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-empire-subtle">
              {META_POR_DIA_UTIL} agendamentos por dia útil · {pct}% da meta
            </p>
          </div>
        )
      })()}

      {/* Meta de Comparecimento */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-empire-border bg-empire-elevated px-4 py-3">
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-empire-subtle uppercase tracking-wider">Comparecimento 7d</span>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className={`text-2xl font-bold ${metaComparecimento.taxa >= 70 ? 'text-[var(--empire-success)]' : 'text-empire-void'}`}>
              {metaComparecimento.agendados > 0 ? `${metaComparecimento.taxa}%` : '—'}
            </span>
            <span className="text-xs text-empire-subtle">
              {metaComparecimento.agendados > 0
                ? `${metaComparecimento.realizados}/${metaComparecimento.agendados} · meta 70%`
                : 'sem agendamentos nos últimos 7d'}
            </span>
          </div>
        </div>
        {metaComparecimento.agendados > 0 && (
          <div className="ml-auto text-xs text-empire-subtle">
            {metaComparecimento.taxa >= 70
              ? <span className="text-[var(--empire-success)] font-semibold">✓ meta atingida</span>
              : <span className="text-empire-danger">↓ abaixo da meta</span>
            }
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-empire-void">Agendamentos</h2>
          <span className="text-xs text-empire-subtle">
            {sortedRows.length} {sortedRows.length !== 1 ? 'agendamentos' : 'agendamento'}
            {filteredRows.length !== rows.length && (
              <span className="ml-1 text-empire-muted">(de {rows.length})</span>
            )}
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
              className="h-8 pl-8 pr-3 text-xs focus:outline-none transition-colors rounded-md border border-empire-border bg-empire-surface text-empire-void focus:border-empire-primary"
            />
          </div>

          {/* Filtro de SDR */}
          <select
            value={sdrFilter}
            onChange={(e) => setSdrFilter(e.target.value)}
            className="h-8 px-3 text-xs focus:outline-none transition-colors rounded-md border border-empire-border bg-empire-surface text-empire-void focus:border-empire-primary"
          >
            <option value="">Todos os SDRs</option>
            {sdrOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          {/* Filtro de status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-3 text-xs focus:outline-none transition-colors rounded-md border border-empire-border bg-empire-surface text-empire-void focus:border-empire-primary"
          >
            <option value="">Todos os status</option>
            <option value="agendado">Agendado</option>
            <option value="reuniao_agendada">Reunião Marcada</option>
            <option value="reuniao_realizada">Reunião Feita</option>
            <option value="noshow">No-show</option>
            <option value="fechado">Fechado</option>
            <option value="perdido">Perdido</option>
          </select>

          {/* Colunas */}
          <div className="relative">
            <button
              onClick={() => setConfigOpen((p) => !p)}
              className="flex items-center gap-1.5 rounded-md border border-empire-border bg-empire-surface px-3 py-1.5 text-xs font-medium text-empire-subtle hover:bg-empire-elevated transition-colors"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Colunas
            </button>
            {configOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-empire-border bg-empire-surface p-3 shadow-lg">
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
            className="flex items-center gap-1.5 rounded-md border border-empire-border bg-empire-surface px-3 py-1.5 text-xs font-medium text-empire-subtle hover:bg-empire-elevated transition-colors"
          >
            {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            {isFullscreen ? 'Sair' : 'Tela cheia'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className={cn(
        'overflow-auto rounded-xl border border-empire-border',
        isFullscreen ? 'flex-1' : 'max-h-[calc(100vh-380px)]',
      )}>
        <table className="w-full min-w-[640px] text-sm border-collapse">
          <thead>
            <tr style={{ background: 'var(--empire-elevated)', borderBottom: '1px solid var(--empire-border)' }}>
              {/* Lead — fixo à esquerda */}
              <th
                className="sticky top-0 left-0 z-30 bg-empire-elevated min-w-[200px] px-3 py-3 text-left cursor-pointer select-none shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]"
                onClick={() => handleSort('cliente')}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-empire-subtle hover:text-empire-void">
                  Lead
                  {sortIcon('cliente')}
                </div>
              </th>
              {visibleColumns.map((col) => (
                <th key={col.key} className={cn(thBase, col.narrow && 'min-w-[70px] max-w-[80px]')} onClick={() => handleSort(col.key)}>
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
              const stInfo = STATUS_MAP[row.status]
              return (
                <tr key={row.id} className="transition-colors hover:bg-empire-elevated border-b border-empire-border">
                  {/* Lead — sticky */}
                  <td
                    className="sticky left-0 z-10 bg-empire-surface min-w-[200px] px-3 py-3 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] cursor-pointer hover:bg-empire-elevated"
                    onClick={() => setSelectedOppId(row.id)}
                  >
                    <span className="text-xs font-semibold text-empire-void hover:underline block truncate max-w-[220px]" title={row.cliente}>
                      {row.cliente}
                    </span>
                  </td>

                  {visibleColumns.map((col) => {
                    if (col.key === 'sdr') return (
                      <td key="sdr" className="px-3 py-3 text-center whitespace-nowrap">
                        {row.sdrIsIa ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium">
                            <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-empire-info/10 text-empire-info">IA</span>
                            <span className="text-empire-subtle">SDR IA</span>
                          </span>
                        ) : (
                          <span className="text-xs text-empire-void">{row.sdr}</span>
                        )}
                      </td>
                    )
                    if (col.key === 'status') return (
                      <td key="status" className="px-3 py-3 text-center">
                        <span className={cn('rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap', stInfo.badgeClass)}>
                          {stInfo.label}
                        </span>
                      </td>
                    )
                    if (col.key === 'data_agendamento') return (
                      <td key="data_agendamento" className="px-3 py-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-mono">{row.data_agendamento ? fmtDate(row.data_agendamento) : '—'}</span>
                          <AppointmentOriginBadge
                            origin={row.opp.agendamento_origem}
                            calendarName={row.opp.agendamento_calendar_name}
                            bookedByName={row.opp.agendamento_por_user_nome}
                            assignedUserName={row.opp.agendamento_assigned_user_nome}
                          />
                        </div>
                      </td>
                    )
                    if (col.key === 'data_reuniao_prevista') return (
                      <td key="data_reuniao_prevista" className="px-3 py-3 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-xs font-mono">{row.data_reuniao_prevista ? fmtDate(row.data_reuniao_prevista) : '—'}</span>
                          <AppointmentOriginBadge
                            origin={row.opp.agendamento_origem}
                            calendarName={row.opp.agendamento_calendar_name}
                            bookedByName={row.opp.agendamento_por_user_nome}
                            assignedUserName={row.opp.agendamento_assigned_user_nome}
                          />
                        </div>
                      </td>
                    )
                    if (col.key === 'data_reuniao_realizada') return (
                      <td key="data_reuniao_realizada" className="px-3 py-3 text-center text-xs font-mono whitespace-nowrap">
                        {row.data_reuniao_realizada ? fmtDate(row.data_reuniao_realizada) : '—'}
                      </td>
                    )
                    if (col.key === 'valor_faturado') return (
                      <td key="valor_faturado" className="px-3 py-3 text-center text-xs font-mono whitespace-nowrap">
                        {fmtCurrency(row.valor_faturado)}
                      </td>
                    )
                    if (col.key === 'mql') return (
                      <td key="mql" className="px-3 py-3 text-center">
                        {row.mql ? (
                          <span className="rounded px-2 py-0.5 text-[10px] font-semibold bg-empire-warning/12 text-empire-primary">MQL</span>
                        ) : (
                          <span className="text-xs text-empire-subtle opacity-40">—</span>
                        )}
                      </td>
                    )
                    if (col.key === 'origem') return (
                      <td key="origem" className="px-3 py-3 text-center text-xs text-empire-void whitespace-nowrap">
                        {row.origem}
                      </td>
                    )
                    return null
                  })}
                </tr>
              )
            })}

            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="py-16 text-center text-sm text-empire-subtle">
                  {rows.length === 0
                    ? 'Nenhum agendamento encontrado no período selecionado.'
                    : 'Nenhum resultado com os filtros aplicados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-empire-subtle">
        Filtra leads pela data em que o SDR realizou o agendamento (<code>data_agendamento_reuniao</code>) no período selecionado.
      </p>
    </>
  )

  return (
    <>
      {isFullscreen
        ? createPortal(
            <div className="fixed inset-0 z-50 flex flex-col bg-empire-surface p-6 animate-fade-in-up">
              {tableContent}
            </div>,
            document.body,
          )
        : <div className="space-y-2">{tableContent}</div>
      }

      <LeadCard
        oppId={selectedOppId}
        onClose={() => setSelectedOppId(null)}
      />
    </>
  )
}

// ─── Sort helpers ──────────────────────────────────────────────

function getNumericValue(row: AgendRow, key: string): number {
  if (key === 'valor_faturado') return row.valor_faturado ?? 0
  return 0
}

function getStringValue(row: AgendRow, key: string): string {
  switch (key) {
    case 'sdr': return row.sdr.toLowerCase()
    case 'status': return row.status
    case 'data_agendamento': return row.data_agendamento ?? ''
    case 'data_reuniao_prevista': return row.data_reuniao_prevista ?? ''
    case 'data_reuniao_realizada': return row.data_reuniao_realizada ?? ''
    case 'origem': return row.origem.toLowerCase()
    default: return ''
  }
}
