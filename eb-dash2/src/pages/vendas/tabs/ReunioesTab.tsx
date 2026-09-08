import { useState, useMemo, useEffect, useCallback } from 'react'
import { isFilterActive, applyFilterValue } from '@/types/filters'
import type { FilterValues } from '@/types/filters'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { buildPaymentDateMap, parseTags } from '@/hooks/useTrafego'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import { fmtDate } from '@/lib/utils/dates'
import { LeadCard } from '@/components/leads/LeadCard'
import { applyRecuperacaoFilter, type RecuperacaoMode } from '@/lib/constants'
import {
  CalendarDays,
  Settings2,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Maximize2,
  Minimize2,
  ExternalLink,
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
  closerFilter?: FilterValues
  sdrFilter?: FilterValues
  canalFilter?: FilterValues
  funilFilter?: FilterValues
  /** Filtro de Recuperação da página — mesma régua das demais abas. */
  recuperacaoMode?: RecuperacaoMode
}

// ─── Column definitions ────────────────────────────────────────

interface ColDef {
  key: string
  label: string
}

const ALL_COLUMNS: ColDef[] = [
  { key: 'closer',                label: 'Closer' },
  { key: 'sdr',                   label: 'SDR' },
  { key: 'data_reuniao_agendada', label: 'Reunião Prevista' },
  { key: 'data_realizacao_vendas', label: 'Realizada em' },
  { key: 'status_reuniao',        label: 'Status Reunião' },
  { key: 'status_oportunidade',   label: 'Status Lead' },
  { key: 'funil',                 label: 'Funil' },
  { key: 'canal',                 label: 'Canal' },
  { key: 'link_gravacao',         label: 'Gravação' },
]

const COLUMN_MAP = new Map(ALL_COLUMNS.map((c) => [c.key, c]))
const LS_KEY = 'eb-dash2:reunioes-tab:columns-v3'

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

type StatusReuniaoKey = 'fechado' | 'perdido' | 'negociacao' | 'realizada' | 'noshow' | 'agendada'

interface StatusInfo {
  label: string
  badgeClass: string
}

const STATUS_MAP: Record<StatusReuniaoKey, StatusInfo> = {
  fechado:    { label: 'Fechado',    badgeClass: 'bg-empire-success/15 text-empire-success' },
  perdido:    { label: 'Perdido',    badgeClass: 'bg-empire-danger/10 text-empire-danger' },
  negociacao: { label: 'Negociação', badgeClass: 'bg-empire-warning/12 text-empire-primary' },
  realizada:  { label: 'Realizada',  badgeClass: 'bg-empire-success/10 text-empire-success' },
  noshow:     { label: 'No-show',    badgeClass: 'bg-empire-danger/8 text-empire-danger' },
  agendada:   { label: 'Agendada',   badgeClass: 'bg-empire-info/10 text-empire-info' },
}

function deriveStatusReuniao(opp: OppRow, paymentMap: Map<string, string>): StatusReuniaoKey {
  if (paymentMap.has(opp.id) && opp.data_fechado) return 'fechado'
  if (opp.data_perdido_vendas) return 'perdido'
  if (opp.data_negociacao) return 'negociacao'
  if (opp.data_realizacao_vendas) return 'realizada'
  if (opp.data_no_show_vendas) return 'noshow'
  return 'agendada'
}

const STATUS_OPP_MAP: Record<string, StatusInfo> = {
  won:  { label: 'Fechado', badgeClass: 'bg-empire-success/15 text-empire-success' },
  lost: { label: 'Perdido', badgeClass: 'bg-empire-danger/10 text-empire-danger' },
  open: { label: 'Aberto',  badgeClass: 'bg-empire-info/10 text-empire-info' },
}

// ─── Row derivada ─────────────────────────────────────────────

interface ReuniaoRow {
  id: string
  opp: OppRow
  cliente: string
  closer: string
  sdr: string
  sdrIsIa: boolean
  data_reuniao_agendada: string | null
  data_realizacao_vendas: string | null
  status_reuniao: StatusReuniaoKey
  status_oportunidade: string
  funil: string
  canal: string
  link_gravacao: string | null
}

// ─── Main component ───────────────────────────────────────────

export function ReunioesTab({
  startDate,
  endDate,
  loading,
  activePanel,
  closerFilter,
  sdrFilter,
  canalFilter,
  funilFilter,
  recuperacaoMode = 'exclude_recuperacao',
}: Props) {
  // ── Column config ────────────────────────────────────────
  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadColumnPrefs().order)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(loadColumnPrefs().hidden))
  const [configOpen, setConfigOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Sort ────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string>('data_reuniao_agendada')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // ── Filtros internos da tabela ───────────────────────────
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
  // utm_source codes que são tráfego pago (tabela utm_sources)
  const [paidSourcesSet, setPaidSourcesSet] = useState<Set<string>>(new Set())
  // nome amigável apenas para canais orgânicos (tabela utm_sources_plain)
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

  // ── Busca independente por data_reuniao_agendada ─────────────
  // O hook do pai filtra por data_lead_recebido — datas futuras ficam vazias.
  // Esta busca usa data_reuniao_agendada diretamente.
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
          resumo_ia, percepcao_closer,
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
          let q = supabase
            .from('oportunidades')
            .select(OPP_SELECT)
            .eq('workspace_id', wid)
            .gte('data_reuniao_agendada', startDate)
            .lte('data_reuniao_agendada', endDate)
          q = applyRecuperacaoFilter(q, recuperacaoMode)
          const res = await q
            .order('data_reuniao_agendada', { ascending: true })
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

        // Buscar revenue dos leads encontrados
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

  // ── Dados derivados ──────────────────────────────────────
  // Usa dados da busca independente por data_reuniao_agendada
  const paymentMap = useMemo(() => buildPaymentDateMap(localRevenueRows), [localRevenueRows])

  // Mapa oppId → link_gravacao (de vendas_fechamento)
  const gravacaoMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of localRevenueRows) {
      if (r.link_gravacao_call_vendas) {
        map.set(r.oportunidade_id, r.link_gravacao_call_vendas)
      }
    }
    return map
  }, [localRevenueRows])

  // Filtro principal: usa localOpps (já filtrados por data_reuniao_agendada no servidor)
  const reunioes = useMemo((): ReuniaoRow[] => {
    const filtered = localOpps.filter((o) => o.data_reuniao_agendada !== null)

    return filtered.map((opp) => {
      const tags = parseTags(opp.contatos?.tags)
      const funil = tags.find((t) => funnelNames.has(t.toLowerCase())) ?? '—'
      const rawCanal = opp.contatos?.utm_source ?? null
      const canal = rawCanal
        ? paidSourcesSet.has(rawCanal)
          ? 'Tráfego'
          : (organicNameMap.get(rawCanal) ?? rawCanal)
        : '—'

      const sdrIsIa = parseTags(opp.contatos?.tags).some(
        (t) => t.toLowerCase() === '[cp] sdr ia'
      )
      const sdr = sdrIsIa ? 'SDR IA' : (opp.sdr_name || opp.contatos?.owner_name || '—')

      return {
        id: opp.id,
        opp,
        cliente: opp.contatos?.nome ?? '(sem nome)',
        closer: opp.vendedor_closer ?? '—',
        sdr,
        sdrIsIa,
        data_reuniao_agendada: opp.data_reuniao_agendada,
        data_realizacao_vendas: opp.data_realizacao_vendas,
        status_reuniao: deriveStatusReuniao(opp, paymentMap),
        status_oportunidade: opp.status ?? 'open',
        funil,
        canal,
        link_gravacao: gravacaoMap.get(opp.id) ?? null,
      }
    })
  }, [localOpps, paymentMap, gravacaoMap, funnelNames, paidSourcesSet, organicNameMap])

  // Filtros internos aplicados sobre o conjunto principal
  const filteredRows = useMemo(() => {
    let rows = reunioes

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter((r) => r.cliente.toLowerCase().includes(q))
    }

    if (statusFilter) {
      rows = rows.filter((r) => r.status_reuniao === statusFilter)
    }

    if (closerFilter && isFilterActive(closerFilter)) {
      rows = rows.filter((r) =>
        applyFilterValue((r.opp.vendedor_closer ?? '').replace(/\s+/g, ' ').trim(), closerFilter)
      )
    }

    if (sdrFilter && isFilterActive(sdrFilter)) {
      rows = rows.filter((r) => {
        const effectiveSdr = r.sdrIsIa ? 'SDR IA' : (r.opp.sdr_name ?? '')
        return applyFilterValue(effectiveSdr, sdrFilter)
      })
    }

    if (canalFilter && isFilterActive(canalFilter)) {
      rows = rows.filter((r) => applyFilterValue(r.opp.contatos?.utm_source ?? '', canalFilter))
    }

    if (funilFilter && isFilterActive(funilFilter)) {
      rows = rows.filter((r) => {
        const tags = parseTags(r.opp.contatos?.tags)
        if (funilFilter.include.length > 0) return tags.some((t) => funilFilter.include.includes(t))
        if (funilFilter.exclude.length > 0) return !tags.every((t) => funilFilter.exclude.includes(t))
        return true
      })
    }

    return rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reunioes, searchQuery, statusFilter, JSON.stringify(closerFilter), JSON.stringify(sdrFilter), JSON.stringify(canalFilter), JSON.stringify(funilFilter)])

  const sortedRows = useMemo(() => {
    const sorted = [...filteredRows]
    sorted.sort((a, b) => {
      let va: string | null = null
      let vb: string | null = null
      if      (sortKey === 'cliente')                 { va = a.cliente;                vb = b.cliente }
      else if (sortKey === 'closer')                  { va = a.closer;                 vb = b.closer }
      else if (sortKey === 'sdr')                     { va = a.sdr;                    vb = b.sdr }
      else if (sortKey === 'data_reuniao_agendada')   { va = a.data_reuniao_agendada;  vb = b.data_reuniao_agendada }
      else if (sortKey === 'data_realizacao_vendas')  { va = a.data_realizacao_vendas; vb = b.data_realizacao_vendas }
      else if (sortKey === 'status_reuniao')          { va = a.status_reuniao;         vb = b.status_reuniao }
      else if (sortKey === 'status_oportunidade')     { va = a.status_oportunidade;    vb = b.status_oportunidade }
      else if (sortKey === 'funil')                   { va = a.funil;                  vb = b.funil }
      else if (sortKey === 'canal')                   { va = a.canal;                  vb = b.canal }
      const sa = (va ?? '').toLowerCase()
      const sb = (vb ?? '').toLowerCase()
      return sortDir === 'desc' ? sb.localeCompare(sa) : sa.localeCompare(sb)
    })
    return sorted
  }, [filteredRows, sortKey, sortDir])

  // ── Colunas visíveis ─────────────────────────────────────
  const visibleColumns = useMemo(
    () => columnOrder.filter((k) => !hiddenColumns.has(k)).map((k) => COLUMN_MAP.get(k)!).filter(Boolean),
    [columnOrder, hiddenColumns],
  )

  // ── Handlers ─────────────────────────────────────────────
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

  // ── Aviso modo Cohort ────────────────────────────────────
  // Esta aba filtra por data_reuniao_agendada (evento no período) — faz sentido apenas no modo Produtividade.
  if (activePanel !== 'produtividade') {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-empire-border bg-empire-surface py-16 text-center">
        <CalendarDays className="h-12 w-12 text-empire-subtle opacity-30" />
        <div className="space-y-1">
          <p className="text-sm font-semibold text-empire-void">Disponível apenas no modo Produtividade</p>
          <p className="text-xs text-empire-subtle">
            Alterne para Produtividade para ver as reuniões do período.
          </p>
        </div>
      </div>
    )
  }

  if (loading || localLoading) {
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
      {/* Toolbar — linha 1: título + busca + status + colunas + fullscreen */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-empire-void">Reuniões</h2>
          <span className="text-xs text-empire-subtle">
            {sortedRows.length} {sortedRows.length !== 1 ? 'reuniões' : 'reunião'}
            {filteredRows.length !== reunioes.length && (
              <span className="ml-1 text-empire-muted">(de {reunioes.length})</span>
            )}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Busca por cliente */}
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
            <option value="agendada">Agendada</option>
            <option value="realizada">Realizada</option>
            <option value="noshow">No-show</option>
            <option value="negociacao">Negociação</option>
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
                <div className="space-y-1">
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
        <table className="w-full text-sm border-collapse">
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
                <th key={col.key} className={thBase} onClick={() => handleSort(col.key)}>
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
              const stReuniao = STATUS_MAP[row.status_reuniao]
              const stOpp = STATUS_OPP_MAP[row.status_oportunidade] ?? STATUS_OPP_MAP['open']
              return (
                <tr key={row.id} className="transition-colors hover:bg-empire-elevated border-b border-empire-border">
                  {/* Cliente — sticky, clicável */}
                  <td
                    className="sticky left-0 z-10 bg-empire-surface min-w-[200px] px-3 py-3 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)] cursor-pointer hover:bg-empire-elevated"
                    onClick={() => setSelectedOppId(row.id)}
                  >
                    <span className="text-xs font-semibold text-empire-void hover:underline block truncate max-w-[220px]" title={row.cliente}>
                      {row.cliente}
                    </span>
                  </td>

                  {visibleColumns.map((col) => {
                    if (col.key === 'closer') return (
                      <td key="closer" className="px-3 py-3 text-center text-xs text-empire-void whitespace-nowrap">{row.closer}</td>
                    )
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
                    if (col.key === 'data_reuniao_agendada') return (
                      <td key="data_reuniao_agendada" className="px-3 py-3 text-center text-xs font-mono text-empire-void whitespace-nowrap">
                        {fmtDate(row.data_reuniao_agendada)}
                      </td>
                    )
                    if (col.key === 'data_realizacao_vendas') return (
                      <td key="data_realizacao_vendas" className="px-3 py-3 text-center text-xs font-mono whitespace-nowrap">
                        {fmtDate(row.data_realizacao_vendas)}
                      </td>
                    )
                    if (col.key === 'status_reuniao') return (
                      <td key="status_reuniao" className="px-3 py-3 text-center">
                        <span className={cn('rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap', stReuniao.badgeClass)}>
                          {stReuniao.label}
                        </span>
                      </td>
                    )
                    if (col.key === 'status_oportunidade') return (
                      <td key="status_oportunidade" className="px-3 py-3 text-center">
                        <span className={cn('rounded px-2 py-0.5 text-xs font-medium whitespace-nowrap', stOpp.badgeClass)}>
                          {stOpp.label}
                        </span>
                      </td>
                    )
                    if (col.key === 'funil') return (
                      <td key="funil" className="px-3 py-3 text-center text-xs text-empire-void whitespace-nowrap">{row.funil}</td>
                    )
                    if (col.key === 'canal') return (
                      <td key="canal" className="px-3 py-3 text-center text-xs text-empire-void whitespace-nowrap">{row.canal}</td>
                    )
                    if (col.key === 'link_gravacao') return (
                      <td key="link_gravacao" className="px-3 py-3 text-center">
                        {row.link_gravacao ? (
                          <a href={row.link_gravacao} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-empire-void hover:underline">
                            Ver <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-empire-subtle opacity-40">—</span>
                        )}
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
                  {reunioes.length === 0
                    ? 'Nenhuma reunião prevista no período selecionado.'
                    : 'Nenhuma reunião encontrada com os filtros aplicados.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[10px] text-empire-subtle">
        Cohort por data prevista da reunião (<code>data_reuniao_agendada</code>) no período selecionado acima.
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
