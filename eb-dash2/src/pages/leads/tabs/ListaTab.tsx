import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useLeads, resolveUtmName, TRAFFIC_TYPE_LABEL } from '@/hooks/useLeads'
import { useGhlLocationId } from '@/hooks/useGhlLocationId'
import { ghlContactUrlForLocation } from '@/lib/ghl'
import type { LeadsFilters, LeadsFilterOptions, SortField, UtmMaps, OppRow } from '@/hooks/useLeads'
import { LeadCard } from '@/components/leads/LeadCard'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { emptyFilter, isFilterActive, SEM_ATRIBUICAO, SEM_ATRIBUICAO_LABEL } from '@/types/filters'
import type { FilterValues } from '@/types/filters'
import { spToday, spDaysAgo, fmtDate, fmtDateTime } from '@/lib/utils/dates'
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Users,
  AlertTriangle,
  Trash2,
  Loader2,
  X,
  Settings2,
  ArrowUp,
  ArrowDown,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { DatePicker } from '@/components/ui/date-picker'

// ─── Confirmation Modal ────────────────────────────────────────

function ConfirmDeleteModal({
  open,
  count,
  isDeleting,
  onConfirm,
  onCancel,
}: {
  open: boolean
  count: number
  isDeleting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-empire-void/40 backdrop-blur-sm">
      <div
        className="rounded-2xl p-6 max-w-sm bg-empire-surface border border-empire-border"
      >
        <h2 className="text-lg font-semibold text-empire-void mb-2">Confirmar exclusão</h2>
        <p className="text-sm text-empire-subtle mb-6">
          Tem certeza? Você está prestes a excluir {count} lead{count > 1 ? 's' : ''}. Esta ação não pode ser desfeita.
        </p>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors text-empire-void bg-empire-elevated border border-empire-border"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Excluir
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Sort indicator ───────────────────────────────────────────

function SortIcon({
  field,
  active,
  asc,
}: {
  field: SortField
  active: SortField
  asc: boolean
}) {
  if (field !== active) return <ChevronsUpDown className="h-3 w-3 ml-1 text-empire-subtle" />
  return asc ? (
    <ChevronUp className="h-3 w-3 ml-1 text-empire-void" />
  ) : (
    <ChevronDown className="h-3 w-3 ml-1 text-empire-void" />
  )
}

// ─── Column definitions (reordenáveis/ocultáveis — padrão ReunioesTab) ────

interface ColDef {
  key: string
  label: string
  sortField?: SortField
  hideOnMobile?: boolean
}

const ALL_COLUMNS: ColDef[] = [
  { key: 'data_lead', label: 'Data Lead', sortField: 'data_lead_recebido' },
  { key: 'nome',      label: 'Nome' },
  { key: 'email',     label: 'Email', hideOnMobile: true },
  { key: 'canal',     label: 'Canal', hideOnMobile: true },
  { key: 'campanha',  label: 'Campanha', hideOnMobile: true },
  { key: 'midia',     label: 'Mídia', hideOnMobile: true },
  { key: 'termo',     label: 'Termo', hideOnMobile: true },
  { key: 'pipeline',  label: 'Pipeline', sortField: 'pipeline_name' },
  { key: 'status',    label: 'Status', sortField: 'status' },
  { key: 'closer',    label: 'Closer', sortField: 'vendedor_closer', hideOnMobile: true },
  { key: 'fechado',   label: 'Fechado', sortField: 'data_fechado', hideOnMobile: true },
  { key: 'ghl',       label: 'CRM', hideOnMobile: true },
]

const COLUMN_MAP = new Map(ALL_COLUMNS.map((c) => [c.key, c]))
const LS_KEY = 'eb-dash2:lista-tab:columns-v1'

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

// ─── Botão/painel de configuração de colunas ──────────────────────────────

function ColumnConfig({
  columnOrder,
  hiddenColumns,
  onToggle,
  onMove,
}: {
  columnOrder: string[]
  hiddenColumns: Set<string>
  onToggle: (key: string) => void
  onMove: (key: string, dir: 'up' | 'down') => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 rounded-lg border border-empire-border bg-empire-surface px-3 py-1.5 text-xs font-medium text-empire-subtle hover:bg-empire-elevated transition-colors"
      >
        <Settings2 className="h-3.5 w-3.5" />
        Colunas
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-56 rounded-lg border border-empire-border bg-empire-surface p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-empire-void">Configurar colunas</span>
            <button onClick={() => setOpen(false)} className="text-empire-subtle hover:text-empire-void">
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
                    onChange={() => onToggle(key)}
                    className="rounded border-empire-border"
                  />
                  <span className="flex-1 text-xs text-empire-void">{col.label}</span>
                  <button onClick={() => onMove(key, 'up')} disabled={idx === 0} className="text-empire-subtle hover:text-empire-void disabled:opacity-30">
                    <ArrowUp className="h-3 w-3" />
                  </button>
                  <button onClick={() => onMove(key, 'down')} disabled={idx === columnOrder.length - 1} className="text-empire-subtle hover:text-empire-void disabled:opacity-30">
                    <ArrowDown className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FilterBar ────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'abandoned', label: 'Abandoned' },
]

// Silence exhaustive-deps for FilterValues setters
type SetFilters = React.Dispatch<React.SetStateAction<LeadsFilters>>

function FilterBar({
  filters,
  setFilters,
  filterOptions,
  utmMaps,
}: {
  filters: LeadsFilters
  setFilters: SetFilters
  filterOptions: LeadsFilterOptions
  utmMaps: UtmMaps
}) {
  const hasActiveFilters =
    isFilterActive(filters.trafficType) ||
    isFilterActive(filters.pipelineName) ||
    isFilterActive(filters.utmSource) ||
    isFilterActive(filters.utmCampaign) ||
    isFilterActive(filters.utmMedium) ||
    isFilterActive(filters.utmTerm) ||
    isFilterActive(filters.vendedorCloser) ||
    isFilterActive(filters.sdrName) ||
    isFilterActive(filters.status) ||
    !!filters.search

  const clearFilters = () =>
    setFilters((f) => ({
      ...f,
      search: '',
      trafficType: emptyFilter(),
      pipelineName: emptyFilter(),
      utmSource: emptyFilter(),
      utmCampaign: emptyFilter(),
      utmMedium: emptyFilter(),
      utmTerm: emptyFilter(),
      vendedorCloser: emptyFilter(),
      sdrName: emptyFilter(),
      status: emptyFilter(),
    }))

  const setTrafficType = (v: FilterValues) => setFilters((f) => ({ ...f, trafficType: v }))
  const setPipeline = (v: FilterValues) => setFilters((f) => ({ ...f, pipelineName: v }))
  const setUtmSource = (v: FilterValues) => setFilters((f) => ({ ...f, utmSource: v }))
  const setUtmCampaign = (v: FilterValues) => setFilters((f) => ({ ...f, utmCampaign: v }))
  const setUtmMedium = (v: FilterValues) => setFilters((f) => ({ ...f, utmMedium: v }))
  const setUtmTerm = (v: FilterValues) => setFilters((f) => ({ ...f, utmTerm: v }))
  const setVendedor = (v: FilterValues) => setFilters((f) => ({ ...f, vendedorCloser: v }))
  const setSdr = (v: FilterValues) => setFilters((f) => ({ ...f, sdrName: v }))
  const setStatus = (v: FilterValues) => setFilters((f) => ({ ...f, status: v }))

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="flex items-center gap-1 rounded-lg border border-empire-border px-2 py-1.5 text-xs font-medium text-empire-subtle hover:bg-empire-danger-soft hover:text-empire-danger transition-all"
        >
          <X className="h-3 w-3" />
          Limpar
        </button>
      )}
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-empire-subtle" />
        <input
          type="text"
          placeholder="Buscar nome ou email..."
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          className="h-8 rounded-lg border-[1.5px] border-empire-border bg-empire-elevated pl-8 pr-3 text-xs text-empire-void placeholder:text-empire-muted focus:outline-none focus:border-empire-primary focus:bg-empire-surface transition-colors w-full sm:w-52"
        />
      </div>

      {/* Date */}
      <DatePicker value={filters.startDate} onChange={(v) => setFilters((f) => ({ ...f, startDate: v }))} />
      <span className="text-xs text-empire-subtle">até</span>
      <DatePicker value={filters.endDate} onChange={(v) => setFilters((f) => ({ ...f, endDate: v }))} />

      <MultiSelectFilter
        value={filters.trafficType}
        onChange={setTrafficType}
        options={filterOptions.trafficTypes.map((t) => ({ value: t, label: TRAFFIC_TYPE_LABEL[t] }))}
        placeholder="Tipo de tráfego"
      />
      <MultiSelectFilter
        value={filters.pipelineName}
        onChange={setPipeline}
        options={filterOptions.pipelines.map((p) => ({ value: p, label: p }))}
        placeholder="Pipeline"
      />
      <MultiSelectFilter
        value={filters.utmSource}
        onChange={setUtmSource}
        options={filterOptions.utmSources.map((s) => ({ value: s, label: resolveUtmName(utmMaps, 'sources', s) }))}
        placeholder="Canal"
      />
      <MultiSelectFilter
        value={filters.utmCampaign}
        onChange={setUtmCampaign}
        options={filterOptions.utmCampaigns.map((c) => ({ value: c, label: resolveUtmName(utmMaps, 'campaigns', c) }))}
        placeholder="Campanha"
      />
      <MultiSelectFilter
        value={filters.utmMedium}
        onChange={setUtmMedium}
        options={filterOptions.utmMediums.map((m) => ({ value: m, label: resolveUtmName(utmMaps, 'mediums', m) }))}
        placeholder="Mídia"
      />
      <MultiSelectFilter
        value={filters.utmTerm}
        onChange={setUtmTerm}
        options={filterOptions.utmTerms.map((t) => ({ value: t, label: t }))}
        placeholder="Termo"
      />
      <MultiSelectFilter
        value={filters.sdrName}
        onChange={setSdr}
        options={filterOptions.sdrs.map((s) => ({ value: s, label: s === SEM_ATRIBUICAO ? SEM_ATRIBUICAO_LABEL : s }))}
        placeholder="Pré-vendedor"
      />
      <MultiSelectFilter
        value={filters.vendedorCloser}
        onChange={setVendedor}
        options={filterOptions.closers.map((c) => ({ value: c, label: c === SEM_ATRIBUICAO ? SEM_ATRIBUICAO_LABEL : c }))}
        placeholder="Closer"
      />
      <MultiSelectFilter
        value={filters.status}
        onChange={setStatus}
        options={STATUS_OPTIONS}
        placeholder="Status"
      />
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────

export function ListaTab() {
  const [filters, setFilters] = useState<LeadsFilters>({
    startDate: spDaysAgo(29),
    endDate: spToday(),
    trafficType: emptyFilter(),
    utmSource: emptyFilter(),
    utmCampaign: emptyFilter(),
    utmMedium: emptyFilter(),
    utmTerm: emptyFilter(),
    pipelineName: emptyFilter(),
    status: emptyFilter(),
    vendedorCloser: emptyFilter(),
    sdrName: emptyFilter(),
    search: '',
  })

  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[] } | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // ── Configuração de colunas (persistida em localStorage) ──
  const [columnOrder, setColumnOrder] = useState<string[]>(() => loadColumnPrefs().order)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(() => new Set(loadColumnPrefs().hidden))

  const {
    leads,
    total,
    page,
    pageSize,
    setPage,
    sortField,
    sortAsc,
    handleSort,
    loading,
    error,
    filterOptions,
    utmMaps,
    deleteLeads,
  } = useLeads(filters)

  // Location do GHL direto do banco (query de 1 linha). O ghlLocationId do
  // useLeads só resolve depois de ~70 queries paginadas de filtro (~30s),
  // deixando a coluna GHL com "—" no primeiro meio minuto da página.
  const { data: ghlLocationId } = useGhlLocationId()

  const totalPages = Math.ceil(total / pageSize)

  // Persist column prefs
  useEffect(() => {
    saveColumnPrefs({ order: columnOrder, hidden: Array.from(hiddenColumns) })
  }, [columnOrder, hiddenColumns])

  const visibleColumns = useMemo(
    () => columnOrder.filter((k) => !hiddenColumns.has(k)).map((k) => COLUMN_MAP.get(k)!).filter(Boolean),
    [columnOrder, hiddenColumns],
  )

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

  // Clear selection when page changes
  const prevPage = useRef(page)
  useEffect(() => {
    if (prevPage.current !== page) {
      setSelectedRows(new Set())
      prevPage.current = page
    }
  }, [page])

  const toggleRow = (id: string) => {
    const newSet = new Set(selectedRows)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedRows(newSet)
  }

  const toggleAll = () => {
    if (selectedRows.size === leads.length && leads.length > 0) {
      setSelectedRows(new Set())
    } else {
      setSelectedRows(new Set(leads.map((l) => l.id)))
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      setIsDeleting(true)
      await deleteLeads(deleteConfirm.ids)
      const count = deleteConfirm.ids.length
      toast.success(`${count} lead${count > 1 ? 's' : ''} excluído${count > 1 ? 's' : ''} com sucesso`)
      setSelectedRows(new Set())
      setDeleteConfirm(null)
    } catch (err) {
      console.error('[ListaTab.handleDelete]', err)
      toast.error('Erro ao excluir leads')
    } finally {
      setIsDeleting(false)
    }
  }

  const thClass = () =>
    cn(
      'px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle cursor-pointer select-none',
      'hover:text-empire-void transition-colors whitespace-nowrap'
    )

  const renderCell = (lead: OppRow, col: ColDef) => {
    const mobileCls = col.hideOnMobile ? 'hidden md:table-cell' : ''
    switch (col.key) {
      case 'data_lead':
        return (
          <td key={col.key} className="px-4 py-3 text-xs text-empire-subtle whitespace-nowrap">
            {fmtDateTime(lead.data_lead_recebido)}
          </td>
        )
      case 'nome':
        return (
          <td key={col.key} className="px-4 py-3 font-medium max-w-[160px] truncate text-empire-void">
            {lead.contatos?.nome ?? '—'}
          </td>
        )
      case 'email':
        return (
          <td key={col.key} className={cn(mobileCls, 'px-4 py-3 text-empire-subtle max-w-[180px] truncate')}>
            {lead.contatos?.email ?? '—'}
          </td>
        )
      case 'canal':
        return (
          <td key={col.key} className={cn(mobileCls, 'px-4 py-3 text-xs text-empire-subtle max-w-[140px] truncate')}>
            {resolveUtmName(utmMaps, 'sources', lead.contatos?.utm_source)}
          </td>
        )
      case 'campanha':
        return (
          <td key={col.key} className={cn(mobileCls, 'px-4 py-3 text-xs text-empire-subtle max-w-[160px] truncate')}>
            {resolveUtmName(utmMaps, 'campaigns', lead.contatos?.utm_campaign)}
          </td>
        )
      case 'midia':
        return (
          <td key={col.key} className={cn(mobileCls, 'px-4 py-3 text-xs text-empire-subtle max-w-[120px] truncate')}>
            {resolveUtmName(utmMaps, 'mediums', lead.contatos?.utm_medium)}
          </td>
        )
      case 'termo':
        return (
          <td key={col.key} className={cn(mobileCls, 'px-4 py-3 text-xs text-empire-subtle max-w-[120px] truncate')}>
            {lead.contatos?.utm_term || '—'}
          </td>
        )
      case 'pipeline':
        return (
          <td key={col.key} className="px-4 py-3 max-w-[160px]">
            {lead.pipeline_name ? (
              <span className="truncate text-xs text-empire-subtle">{lead.pipeline_name}</span>
            ) : (
              '—'
            )}
          </td>
        )
      case 'status':
        return (
          <td key={col.key} className="px-4 py-3">
            {lead.status ? (
              <Badge
                variant="secondary"
                className={cn(
                  'text-xs border-0',
                  lead.status === 'won' && 'bg-empire-success/10 text-empire-success',
                  lead.status === 'lost' && 'bg-empire-danger/10 text-empire-danger'
                )}
              >
                {lead.status}
              </Badge>
            ) : (
              '—'
            )}
          </td>
        )
      case 'closer':
        return (
          <td key={col.key} className={cn(mobileCls, 'px-4 py-3 text-xs text-empire-subtle')}>
            {lead.vendedor_closer ?? '—'}
          </td>
        )
      case 'fechado':
        return (
          <td key={col.key} className={cn(mobileCls, 'px-4 py-3 text-xs text-empire-subtle whitespace-nowrap')}>
            {fmtDate(lead.data_fechado)}
          </td>
        )
      case 'ghl':
        return (
          <td key={col.key} className={cn(mobileCls, 'px-4 py-3 text-center')}>
            {lead.contatos?.ghl_id && ghlContactUrlForLocation(ghlLocationId, lead.contatos.ghl_id) ? (
              <a
                href={ghlContactUrlForLocation(ghlLocationId, lead.contatos.ghl_id)!}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title="Abrir contato no CRM"
                className="inline-flex items-center text-empire-info hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ) : (
              <span className="text-xs text-empire-subtle">—</span>
            )}
          </td>
        )
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters + column config */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <FilterBar filters={filters} setFilters={setFilters} filterOptions={filterOptions} utmMaps={utmMaps} />
        <ColumnConfig
          columnOrder={columnOrder}
          hiddenColumns={hiddenColumns}
          onToggle={toggleColumn}
          onMove={moveColumn}
        />
      </div>

      {/* Bulk action bar */}
      {selectedRows.size > 0 && (
        <div
          className="flex items-center justify-between rounded-lg px-4 py-3"
        >
          <span className="text-sm text-empire-void font-medium">
            ✓ {selectedRows.size} lead{selectedRows.size > 1 ? 's' : ''} selecionado{selectedRows.size > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedRows(new Set())}
              className="text-xs px-3 py-1.5 rounded-lg text-empire-subtle hover:bg-empire-surface transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => setDeleteConfirm({ ids: Array.from(selectedRows) })}
              className="text-xs px-3 py-1.5 rounded-lg bg-empire-danger text-white hover:opacity-90 transition-opacity flex items-center gap-1"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Deletar
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="flex items-center gap-3 rounded-xl p-4 text-sm text-empire-danger border border-empire-danger/20"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden bg-empire-surface border border-empire-border"
      >
        {/* Table header with count */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b border-empire-border"
        >
          <div className="flex items-center gap-2 text-xs text-empire-subtle">
            <Users className="h-3.5 w-3.5" />
            <span>
              {loading ? '…' : `${total.toLocaleString('pt-BR')} leads`}
            </span>
          </div>
          {/* Pagination top */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs text-empire-subtle">
              <span>
                Pág. {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded p-1 hover:bg-empire-elevated disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded p-1 hover:bg-empire-elevated disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
          <table className="w-full min-w-[1200px] text-sm">
            <thead style={{ borderBottom: '1px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
              <tr>
                <th className="px-4 py-3 text-left w-8">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === leads.length && leads.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded cursor-pointer accent-[var(--empire-primary)]"
                  />
                </th>
                {visibleColumns.map((col) => {
                  const mobileCls = col.hideOnMobile ? 'hidden md:table-cell' : ''
                  if (col.sortField) {
                    return (
                      <th key={col.key} className={cn(mobileCls, thClass())} onClick={() => handleSort(col.sortField!)}>
                        <span className="flex items-center">
                          {col.label}
                          <SortIcon field={col.sortField} active={sortField} asc={sortAsc} />
                        </span>
                      </th>
                    )
                  }
                  return (
                    <th
                      key={col.key}
                      className={cn(
                        mobileCls,
                        'px-4 py-3 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle whitespace-nowrap'
                      )}
                    >
                      {col.label}
                    </th>
                  )
                })}
                <th className="px-4 py-3 text-center w-8"></th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 10 }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--empire-border)' }}>
                      {Array.from({ length: visibleColumns.length + 2 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-full" />
                        </td>
                      ))}
                    </tr>
                  ))
                : leads.length === 0
                ? (
                    <tr>
                      <td colSpan={visibleColumns.length + 2} className="px-4 py-12 text-center text-sm text-empire-subtle">
                        Nenhum lead encontrado com os filtros aplicados.
                      </td>
                    </tr>
                  )
                : leads.map((lead) => (
                    <tr
                      key={lead.id}
                      className="group cursor-pointer transition-colors hover:bg-empire-elevated border-b border-empire-border"
                      onClick={() => setSelectedOppId(lead.id)}
                    >
                      <td
                        className="px-4 py-3 text-left w-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRows.has(lead.id)}
                          onChange={(e) => {
                            e.stopPropagation()
                            toggleRow(lead.id)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded cursor-pointer accent-[var(--empire-primary)]"
                        />
                      </td>
                      {visibleColumns.map((col) => renderCell(lead, col))}
                      <td
                        className="px-4 py-3 text-center w-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            setDeleteConfirm({ ids: [lead.id] })
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity rounded p-1 hover:bg-empire-danger/10 text-empire-danger"
                          title="Deletar lead"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {/* Pagination bottom */}
        {!loading && totalPages > 1 && (
          <div
            className="flex items-center justify-between px-4 py-3"
          >
            <span className="text-xs text-empire-subtle">
              Mostrando {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} de {total.toLocaleString('pt-BR')}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(0)}
                disabled={page === 0}
                className="rounded px-2 py-1 text-xs text-empire-subtle hover:bg-empire-elevated disabled:opacity-30 transition-colors"
              >
                «
              </button>
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded p-1 text-empire-subtle hover:bg-empire-elevated disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {/* Page numbers (show 5 around current) */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const start = Math.max(0, Math.min(page - 2, totalPages - 5))
                return start + i
              }).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs transition-colors',
                    p === page
                      ? 'bg-[rgba(13,24,41,0.08)] text-empire-void font-medium'
                      : 'text-empire-subtle hover:bg-empire-elevated hover:text-empire-void'
                  )}
                >
                  {p + 1}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded p-1 text-empire-subtle hover:bg-empire-elevated disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage(totalPages - 1)}
                disabled={page >= totalPages - 1}
                className="rounded px-2 py-1 text-xs text-empire-subtle hover:bg-empire-elevated disabled:opacity-30 transition-colors"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      <ConfirmDeleteModal
        open={deleteConfirm !== null}
        count={deleteConfirm?.ids.length ?? 0}
        isDeleting={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* Lead card modal - to be rendered via portal */}
      <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
    </div>
  )
}
