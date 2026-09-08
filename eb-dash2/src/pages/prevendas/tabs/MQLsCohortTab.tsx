import { useState, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { buildPaymentDateMap, parseTags, isMqlByTag } from '@/hooks/useTrafego'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import { fmtDate, tsToSPDate } from '@/lib/utils/dates'
import { useMQLCohortComms } from '@/hooks/useMQLCohortComms'
import type { CommAggregation } from '@/hooks/useMQLCohortComms'
import { LeadCard } from '@/components/leads/LeadCard'
import {
  Target,
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
  activePanel: 'cohort' | 'produtividade'
}

// ─── Column definitions ────────────────────────────────────────

interface ColDef {
  key: string
  label: string
  numeric?: boolean
  narrow?: boolean
}

const ALL_COLUMNS: ColDef[] = [
  { key: 'sdr',            label: 'SDR' },
  { key: 'funil',          label: 'Funil' },
  { key: 'canal',          label: 'Canal' },
  { key: 'entrada',        label: 'Entrada' },
  { key: 'conectado',      label: 'Conectado' },
  { key: 'auto_agendou',   label: 'Auto agendou\nSDR', narrow: true },
  { key: 'agendado',       label: 'Agendado' },
  { key: 'reuniao',        label: 'Reunião' },
  { key: 'status',         label: 'Status' },
  { key: 'msgs_humanas',   label: 'Msgs SDR',   numeric: true },
  { key: 'msgs_ia',        label: 'Msgs IA',    numeric: true },
  { key: 'emails',         label: 'Emails',     numeric: true },
  { key: 'ligacoes',       label: 'Ligações',   numeric: true },
  { key: 'msgs_lead',      label: 'Msgs Lead',  numeric: true },
  { key: 'dias_na_base',   label: 'Dias na Base', numeric: true },
  { key: 'tempo_conexao',  label: 'Tempo Conexão', numeric: true },
]

const COLUMN_MAP = new Map(ALL_COLUMNS.map((c) => [c.key, c]))
const NUMERIC_KEYS = new Set(ALL_COLUMNS.filter((c) => c.numeric).map((c) => c.key))
const LS_KEY = 'eb-dash2:mqls-cohort-tab:columns-v2'

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

// ─── Status helpers ────────────────────────────────────────────

type MQLStatusKey = 'fechado' | 'perdido' | 'reuniao_realizada' | 'noshow' | 'reuniao_agendada' | 'agendado' | 'conectado' | 'novo'

interface StatusInfo {
  label: string
  badgeClass: string
}

const STATUS_MAP: Record<MQLStatusKey, StatusInfo> = {
  fechado:           { label: 'Fechado',         badgeClass: 'bg-empire-success/15 text-empire-success' },
  perdido:           { label: 'Perdido',         badgeClass: 'bg-empire-danger/10 text-empire-danger' },
  reuniao_realizada: { label: 'Reunião Feita',   badgeClass: 'bg-empire-success/10 text-empire-success' },
  noshow:            { label: 'No-show',         badgeClass: 'bg-empire-danger/8 text-empire-danger' },
  reuniao_agendada:  { label: 'Reunião Marcada', badgeClass: 'bg-empire-info/10 text-empire-info' },
  agendado:          { label: 'Agendado',        badgeClass: 'bg-empire-info/10 text-empire-info' },
  conectado:         { label: 'Conectado',       badgeClass: 'bg-empire-warning/12 text-empire-primary' },
  novo:              { label: 'Novo',            badgeClass: 'bg-empire-elevated text-empire-subtle' },
}

function deriveMQLStatus(opp: OppRow, paymentMap: Map<string, string>): MQLStatusKey {
  if (paymentMap.has(opp.id)) return 'fechado'
  if (opp.data_perdido || opp.data_perdido_vendas) return 'perdido'
  if (opp.data_realizacao_vendas) return 'reuniao_realizada'
  if (opp.data_no_show || opp.data_no_show_vendas) return 'noshow'
  if (opp.data_reuniao_agendada) return 'reuniao_agendada'
  if (opp.data_agendamento_reuniao) return 'agendado'
  if (opp.data_conectado) return 'conectado'
  return 'novo'
}

// ─── Row type ──────────────────────────────────────────────────

interface MQLRow {
  id: string
  opp: OppRow
  cliente: string
  sdr: string
  sdrIsIa: boolean
  funil: string
  canal: string
  entrada: string | null
  conectado: string | null
  auto_agendou: boolean
  agendado: string | null
  reuniao: string | null
  status: MQLStatusKey
  msgs_humanas: number
  msgs_ia: number
  emails: number
  ligacoes: number
  msgs_lead: number
  dias_na_base: number
  tempo_conexao: number | null
}

// ─── Helpers ───────────────────────────────────────────────────

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000)
}

const EMPTY_COMM: CommAggregation = { msgs_humanas: 0, msgs_ia: 0, emails: 0, ligacoes: 0, msgs_lead: 0, inbound_dates: [] }

// ─── Main component ───────────────────────────────────────────

export function MQLsCohortTab({
  opps,
  revenueRows,
  startDate,
  loading: parentLoading,
  activePanel,
}: Props) {
  // ── Column config ────────────────────────────────────────
  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadColumnPrefs().order)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(loadColumnPrefs().hidden))
  const [configOpen, setConfigOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Sort ────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string>('entrada')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Filtros internos ───────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  // ── LeadCard ─────────────────────────────────────────────
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)

  // Persist column prefs
  useEffect(() => {
    saveColumnPrefs({ order: columnOrder, hidden: Array.from(hiddenColumns) })
  }, [columnOrder, hiddenColumns])

  // ── Dados externos ───────────────────────────────────────
  const [funnelNames, setFunnelNames] = useState<Set<string>>(new Set())
  const [paidSourcesSet, setPaidSourcesSet] = useState<Set<string>>(new Set())
  const [organicNameMap, setOrganicNameMap] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const wid = await getWorkspaceId()
      if (cancelled || !wid) return
      const [funnelsRes, paidRes, organicRes] = await Promise.all([
        supabase.from('funnels').select('nome').eq('workspace_id', wid),
        supabase.from('utm_sources').select('utm_source').eq('workspace_id', wid),
        supabase.from('utm_sources_plain').select('nome, utm_source').eq('workspace_id', wid),
      ])
      if (cancelled) return

      setFunnelNames(new Set(
        (funnelsRes.data ?? []).map((r: { nome: string }) => r.nome.toLowerCase())
      ))

      setPaidSourcesSet(new Set(
        (paidRes.data ?? [])
          .map((r: { utm_source: string | null }) => r.utm_source)
          .filter(Boolean) as string[]
      ))

      const nameMap = new Map<string, string>()
      for (const r of (organicRes.data ?? [])) {
        const row = r as { nome: string | null; utm_source: string | null }
        if (row.utm_source && row.nome) nameMap.set(row.utm_source, row.nome)
      }
      setOrganicNameMap(nameMap)
    })()
    return () => { cancelled = true }
  }, [])

  // ── MQLs filtrados ─────────────────────────────────────
  const mqlOpps = useMemo(() => opps.filter((o) => isMqlByTag(o.contatos)), [opps])

  // ── Comunicações ────────────────────────────────────────
  const contatoIds = useMemo(
    () => mqlOpps.map((o) => o.contato_id).filter((id): id is string => Boolean(id)),
    [mqlOpps],
  )
  const { commsMap, loading: commsLoading } = useMQLCohortComms(contatoIds, startDate)

  // ── Dados derivados ────────────────────────────────────
  const paymentMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])

  const todayStr = useMemo(() => {
    const now = new Date()
    return now.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
  }, [])

  const rows = useMemo((): MQLRow[] => {
    return mqlOpps.map((opp) => {
      const tags = parseTags(opp.contatos?.tags)
      const funil = tags.find((t) => funnelNames.has(t.toLowerCase())) ?? '—'
      const rawCanal = opp.contatos?.utm_source ?? null
      const canal = rawCanal
        ? paidSourcesSet.has(rawCanal)
          ? 'Tráfego'
          : (organicNameMap.get(rawCanal) ?? rawCanal)
        : '—'

      const sdrIsIa = tags.some((t) => t.toLowerCase() === '[cp] sdr ia')
      const sdr = sdrIsIa ? 'SDR IA' : (opp.sdr_name || opp.contatos?.owner_name || '—')
      const autoAgendou = tags.some((t) => t.toLowerCase() === 'auto agendou')

      // data_lead_recebido é TIMESTAMPTZ — converter para date string SP
      const entradaDate = opp.data_lead_recebido ? tsToSPDate(opp.data_lead_recebido) : null

      const comms = (opp.contato_id ? commsMap.get(opp.contato_id) : null) ?? EMPTY_COMM

      const dias_na_base = entradaDate ? daysBetween(entradaDate, todayStr) : 0
      const tempo_conexao = entradaDate && opp.data_conectado
        ? daysBetween(entradaDate, opp.data_conectado)
        : null

      return {
        id: opp.id,
        opp,
        cliente: opp.contatos?.nome ?? '(sem nome)',
        sdr,
        sdrIsIa,
        funil,
        canal,
        entrada: entradaDate,
        conectado: opp.data_conectado,
        auto_agendou: autoAgendou,
        agendado: opp.data_agendamento_reuniao,
        reuniao: opp.data_reuniao_agendada,
        status: deriveMQLStatus(opp, paymentMap),
        msgs_humanas: comms.msgs_humanas,
        msgs_ia: comms.msgs_ia,
        emails: comms.emails,
        ligacoes: comms.ligacoes,
        msgs_lead: comms.msgs_lead,
        dias_na_base,
        tempo_conexao,
      }
    })
  }, [mqlOpps, paymentMap, commsMap, funnelNames, paidSourcesSet, organicNameMap, todayStr])

  // ── Filtros internos ───────────────────────────────────
  const filteredRows = useMemo(() => {
    let result = rows

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((r) => r.cliente.toLowerCase().includes(q))
    }

    if (statusFilter) {
      result = result.filter((r) => r.status === statusFilter)
    }

    return result
  }, [rows, searchQuery, statusFilter])

  // ── Ordenação ──────────────────────────────────────────
  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows]
    sorted.sort((a, b) => {
      const col = COLUMN_MAP.get(sortKey)

      // Cliente (coluna fixa)
      if (sortKey === 'cliente') {
        const sa = a.cliente.toLowerCase()
        const sb = b.cliente.toLowerCase()
        return sortDir === 'desc' ? sb.localeCompare(sa) : sa.localeCompare(sb)
      }

      // Colunas numéricas
      if (col?.numeric || NUMERIC_KEYS.has(sortKey)) {
        const va = getNumericValue(a, sortKey)
        const vb = getNumericValue(b, sortKey)
        return sortDir === 'desc' ? vb - va : va - vb
      }

      // Colunas texto/data
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

  // ── Guard: só cohort ─────────────────────────────────
  if (activePanel !== 'cohort') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-empire-border bg-empire-surface py-16 text-center">
        <Target className="h-12 w-12 text-empire-subtle opacity-30" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-empire-void">Disponível apenas no modo Cohort</p>
          <p className="text-xs text-empire-subtle">
            Alterne o modo de visualização acima para ver o acompanhamento dos MQLs.
          </p>
        </div>
      </div>
    )
  }

  const loading = parentLoading || commsLoading

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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-empire-void">MQLs</h2>
          <span className="text-xs text-empire-subtle">
            {sortedRows.length} {sortedRows.length !== 1 ? 'leads' : 'lead'}
            {filteredRows.length !== rows.length && (
              <span className="ml-1 text-empire-muted">(de {rows.length})</span>
            )}
            {commsLoading && <span className="ml-2 text-empire-muted">carregando msgs...</span>}
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
              placeholder="Buscar cliente..."
              className="h-8 pl-8 pr-3 text-xs focus:outline-none transition-colors rounded-md border border-empire-border bg-empire-surface text-empire-void focus:border-empire-primary"
            />
          </div>

          {/* Filtro de status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 px-3 text-xs focus:outline-none transition-colors rounded-md border border-empire-border bg-empire-surface text-empire-void focus:border-empire-primary"
          >
            <option value="">Todos os status</option>
            <option value="novo">Novo</option>
            <option value="conectado">Conectado</option>
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
              <th
                className="sticky top-0 left-0 z-30 bg-empire-elevated min-w-[200px] px-3 py-3 text-left cursor-pointer select-none shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]"
                onClick={() => handleSort('cliente')}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-empire-subtle hover:text-empire-void">
                  Cliente
                  {sortIcon('cliente')}
                </div>
              </th>
              {visibleColumns.map((col) => (
                <th key={col.key} className={cn(thBase, col.narrow && 'whitespace-normal min-w-[70px] max-w-[80px]')} onClick={() => handleSort(col.key)}>
                  <div className={thInner}>
                    {col.label.includes('\n') ? (
                      <span className="text-center leading-tight">{col.label.split('\n').map((line, i) => <span key={i} className="block">{line}</span>)}</span>
                    ) : col.label}
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
                  {/* Cliente — sticky */}
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
                    if (col.key === 'funil') return (
                      <td key="funil" className="px-3 py-3 text-center text-xs text-empire-void whitespace-nowrap">{row.funil}</td>
                    )
                    if (col.key === 'canal') return (
                      <td key="canal" className="px-3 py-3 text-center text-xs text-empire-void whitespace-nowrap">{row.canal}</td>
                    )
                    if (col.key === 'entrada') return (
                      <td key="entrada" className="px-3 py-3 text-center text-xs font-mono text-empire-void whitespace-nowrap">
                        {row.entrada ? fmtDate(row.entrada) : '—'}
                      </td>
                    )
                    if (col.key === 'conectado') return (
                      <td key="conectado" className="px-3 py-3 text-center text-xs font-mono whitespace-nowrap">
                        {row.conectado ? fmtDate(row.conectado) : '—'}
                      </td>
                    )
                    if (col.key === 'auto_agendou') return (
                      <td key="auto_agendou" className="px-3 py-3 text-center">
                        {row.auto_agendou ? (
                          <span className="rounded px-2 py-0.5 text-xs font-medium bg-empire-success/12 text-[var(--empire-success)]">Sim</span>
                        ) : (
                          <span className="text-xs text-empire-subtle opacity-40">—</span>
                        )}
                      </td>
                    )
                    if (col.key === 'agendado') return (
                      <td key="agendado" className="px-3 py-3 text-center text-xs font-mono whitespace-nowrap">
                        {row.agendado ? fmtDate(row.agendado) : '—'}
                      </td>
                    )
                    if (col.key === 'reuniao') return (
                      <td key="reuniao" className="px-3 py-3 text-center text-xs font-mono whitespace-nowrap">
                        {row.reuniao ? fmtDate(row.reuniao) : '—'}
                      </td>
                    )
                    if (col.key === 'status') return (
                      <td key="status" className="px-3 py-3 text-center">
                        <span className={cn('rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap', stInfo.badgeClass)}>
                          {stInfo.label}
                        </span>
                      </td>
                    )
                    // Colunas numéricas de comunicação
                    if (col.key === 'msgs_humanas') return renderNumCell('msgs_humanas', row.msgs_humanas)
                    if (col.key === 'msgs_ia') return renderNumCell('msgs_ia', row.msgs_ia)
                    if (col.key === 'emails') return renderNumCell('emails', row.emails)
                    if (col.key === 'ligacoes') return renderNumCell('ligacoes', row.ligacoes)
                    if (col.key === 'msgs_lead') return renderNumCell('msgs_lead', row.msgs_lead, true)
                    if (col.key === 'dias_na_base') return (
                      <td key="dias_na_base" className="px-3 py-3 text-center text-xs font-mono text-empire-void whitespace-nowrap">
                        {row.dias_na_base}d
                      </td>
                    )
                    if (col.key === 'tempo_conexao') return (
                      <td key="tempo_conexao" className="px-3 py-3 text-center text-xs font-mono whitespace-nowrap">
                        {row.tempo_conexao !== null ? `${row.tempo_conexao}d` : '—'}
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
                    ? 'Nenhum MQL encontrado no período selecionado.'
                    : 'Nenhum MQL encontrado com os filtros aplicados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-empire-subtle">
        Modo Cohort — filtra leads MQL pela data de entrada (<code>data_lead_recebido</code>) e mostra tudo que aconteceu com cada um.
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

// ─── Helpers de renderização ──────────────────────────────────

function renderNumCell(key: string, value: number, highlightPositive = false) {
  const isEmpty = value === 0
  const highlight = highlightPositive && value > 0
  return (
    <td
      key={key}
      className={cn(
        'px-3 py-3 text-center text-xs font-mono whitespace-nowrap',
        isEmpty && 'opacity-40',
        highlight && 'text-[var(--empire-success)] font-medium',
      )}
      style={{ color: highlight ? 'var(--empire-success)' : isEmpty ? 'var(--empire-subtle)' : 'var(--empire-void)' }}
    >
      {value}
    </td>
  )
}

function getNumericValue(row: MQLRow, key: string): number {
  switch (key) {
    case 'msgs_humanas': return row.msgs_humanas
    case 'msgs_ia': return row.msgs_ia
    case 'emails': return row.emails
    case 'ligacoes': return row.ligacoes
    case 'msgs_lead': return row.msgs_lead
    case 'dias_na_base': return row.dias_na_base
    case 'tempo_conexao': return row.tempo_conexao ?? -1
    default: return 0
  }
}

function getStringValue(row: MQLRow, key: string): string {
  switch (key) {
    case 'sdr': return row.sdr.toLowerCase()
    case 'funil': return row.funil.toLowerCase()
    case 'canal': return row.canal.toLowerCase()
    case 'entrada': return row.entrada ?? ''
    case 'conectado': return row.conectado ?? ''
    case 'auto_agendou': return row.auto_agendou ? 'sim' : 'nao'
    case 'agendado': return row.agendado ?? ''
    case 'reuniao': return row.reuniao ?? ''
    case 'status': return row.status
    default: return ''
  }
}
