import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Maximize2,
  Minimize2,
  Settings2,
  ChevronDown,
  ChevronRight,
  ArrowUpNarrowWide,
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  AlertTriangle,
  Loader2,
  X,
  ExternalLink,
} from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { LeadListModal } from '@/components/leads/LeadCard'
import { CriativosFilterBar } from '../components/CriativosFilterBar'
import {
  useCriativosFilters,
  emptyFilter,
  type CriativosFilters,
} from '@/hooks/useCriativosFilters'
import { useCreativeRankingData } from '@/hooks/useCreativeRankingData'
import { aggregateCreativeRanking, type CreativeRankingRow, type PublicBreakdownRow } from '@/lib/creativeRanking'
import { spToday, spDaysAgo } from '@/lib/utils/dates'
import { applyMqlFilter, applyAttributionFilters, type OppRow } from '@/hooks/useTrafego'

// ─── Column definitions ────────────────────────────────────────

interface ColumnDef {
  key: keyof CreativeRankingRow
  label: string
  format: (v: number) => string
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

function fmtNumber(v: number) {
  return new Intl.NumberFormat('pt-BR').format(Math.round(v))
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: 'investimento', label: 'Investimento', format: fmtCurrency },
  { key: 'faturamento', label: 'Faturamento', format: fmtCurrency },
  { key: 'caixa', label: 'Caixa', format: fmtCurrency },
  { key: 'leads', label: 'Leads', format: fmtNumber },
  { key: 'cpl', label: 'CPL', format: fmtCurrency },
  { key: 'mql', label: 'MQL', format: fmtNumber },
  { key: 'cpmql', label: 'CPMQL', format: fmtCurrency },
  { key: 'reunioes', label: 'Reuniões', format: fmtNumber },
  { key: 'vendas', label: 'Vendas', format: fmtNumber },
  { key: 'cpv', label: 'CPV', format: fmtCurrency },
  { key: 'ctr', label: 'CTR', format: (v: number) => v > 0 ? v.toFixed(2) + '%' : '—' },
  { key: 'cpm', label: 'CPM', format: (v: number) => v > 0 ? 'R$ ' + v.toFixed(2) : '—' },
  { key: 'convPagina', label: 'Conv. Página', format: (v: number) => v > 0 ? v.toFixed(2) + '%' : '—' },
  { key: 'videoHook', label: 'Video Hook', format: (v: number) => v > 0 ? v.toFixed(2) + '%' : '—' },
]

const COLUMN_MAP = new Map(ALL_COLUMNS.map((c) => [c.key, c]))
const LS_KEY = 'eb-dash2:criativos-ranking:columns'

type RankingColumnKey = keyof CreativeRankingRow

interface ColumnPrefs {
  order: RankingColumnKey[]
  hidden: RankingColumnKey[]
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
      hidden: (parsed.hidden ?? []).filter((k) => knownKeys.has(k)),
    }
  } catch {
    return { order: ALL_COLUMNS.map((c) => c.key), hidden: [] }
  }
}

function saveColumnPrefs(prefs: ColumnPrefs) {
  localStorage.setItem(LS_KEY, JSON.stringify(prefs))
}

const PRESETS = [
  { label: 'Hoje', fn: () => ({ s: spToday(), e: spToday() }) },
  { label: 'Ontem', fn: () => ({ s: spDaysAgo(1), e: spDaysAgo(1) }) },
  { label: '7 dias', fn: () => ({ s: spDaysAgo(6), e: spToday() }) },
  { label: '30 dias', fn: () => ({ s: spDaysAgo(29), e: spToday() }) },
  { label: '90 dias', fn: () => ({ s: spDaysAgo(89), e: spToday() }) },
  { label: 'Este mês', fn: () => {
    const now = new Date()
    return { s: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), e: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
  }},
  { label: 'Mês passado', fn: () => {
    const now = new Date()
    return { s: fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1)), e: fmt(new Date(now.getFullYear(), now.getMonth(), 0)) }
  }},
]

function fmt(d: Date) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

export function RankingTab() {
  const [filters, setFilters] = useState<CriativosFilters>({
    startDate: spDaysAgo(29),
    endDate: spToday(),
    campaigns: emptyFilter(),
    adsets: emptyFilter(),
    ads: emptyFilter(),
    channels: emptyFilter(),
    funilTags: emptyFilter(),
    cpTags: emptyFilter(),
    mqlFilter: 'all',
    sdrs: emptyFilter(),
    closers: emptyFilter(),
  })
  const [activePreset, setActivePreset] = useState('30 dias')
  const [columnOrder, setColumnOrder] = useState<RankingColumnKey[]>(() => loadColumnPrefs().order)
  const [hiddenColumns, setHiddenColumns] = useState<Set<RankingColumnKey>>(() => new Set(loadColumnPrefs().hidden))
  const [configOpen, setConfigOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sortKey, setSortKey] = useState<string>('mql')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [hideSemMql, setHideSemMql] = useState(true)
  const [expandedCreativeCodes, setExpandedCreativeCodes] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false,
    title: '',
    leads: [],
  })

  const filterOptions = useCriativosFilters(filters.startDate, filters.endDate)
  const { opps, metaRows, revenueRows, creativeMap, creativeAdUrlMap, publicNameMap, loading, error } =
    useCreativeRankingData(filters)

  useEffect(() => {
    saveColumnPrefs({ order: columnOrder, hidden: Array.from(hiddenColumns) })
  }, [columnOrder, hiddenColumns])

  // "Apenas MQL" (filters.mqlFilter) restringe os leads-base a MQLs, igual em
  // todas as outras abas (Tráfego, Aquisição, Orgânico, Pré-Vendas, Vendas) —
  // investimento/spend (metaRows) não é filtrado, pois é essa comparação
  // (spend total ÷ MQLs) que gera o CPMQL. "Ocultar sem MQL" (hideSemMql) é
  // um controle visual independente: só esconde linhas de criativo com 0 MQL,
  // sem alterar os números das linhas que permanecem visíveis.
  const mqlFilteredOpps = useMemo(
    () => applyAttributionFilters(applyMqlFilter(opps, filters.mqlFilter), filters.sdrs, filters.closers),
    [opps, filters.mqlFilter, filters.sdrs, filters.closers],
  )

  const rows = useMemo(() => {
    return aggregateCreativeRanking({
      opps: mqlFilteredOpps,
      metaRows,
      revenueRows,
      startDate: filters.startDate,
      endDate: filters.endDate,
      mode: 'cohort',
      creativeMap,
      creativeAdUrlMap,
      publicNameMap,
    })
  }, [mqlFilteredOpps, metaRows, revenueRows, filters.startDate, filters.endDate, creativeMap, creativeAdUrlMap, publicNameMap])

  const sortedRows = useMemo(() => {
    const filtered = hideSemMql ? rows.filter((r) => r.mql > 0) : rows
    const sorted = [...filtered]
    sorted.sort((a, b) => {
      if (sortKey === 'name' || sortKey === 'code') {
        const va = (a[sortKey as 'name' | 'code'] ?? '').toLowerCase()
        const vb = (b[sortKey as 'name' | 'code'] ?? '').toLowerCase()
        return sortDir === 'desc' ? vb.localeCompare(va) : va.localeCompare(vb)
      }
      const va = a[sortKey as keyof CreativeRankingRow] as number
      const vb = b[sortKey as keyof CreativeRankingRow] as number
      return sortDir === 'desc' ? vb - va : va - vb
    })
    return sorted
  }, [rows, sortKey, sortDir, hideSemMql])

  const semMqlCount = useMemo(() => rows.filter((r) => r.mql === 0).length, [rows])

  const visibleColumns = useMemo(
    () => columnOrder.filter((k) => !hiddenColumns.has(k)).map((k) => COLUMN_MAP.get(k)!).filter(Boolean),
    [columnOrder, hiddenColumns],
  )

  const toggleColumn = useCallback((key: RankingColumnKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const moveColumn = useCallback((key: RankingColumnKey, dir: 'up' | 'down') => {
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
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }, [sortKey])

  const toggleCreativeExpand = useCallback((creativeCode: string) => {
    setExpandedCreativeCodes((current) => {
      const next = new Set(current)
      if (next.has(creativeCode)) next.delete(creativeCode)
      else next.add(creativeCode)
      return next
    })
  }, [])

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-center gap-2 text-red-700">
          <AlertTriangle className="h-4 w-4" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      </div>
    )
  }

  const tableContent = (
    <>
      <CriativosFilterBar
        filters={filters}
        setFilters={setFilters}
        filterOptions={filterOptions}
        activePreset={activePreset}
        setActivePreset={setActivePreset}
        presets={PRESETS}
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 mt-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-empire-void">
            Ranking de Criativos
          </h2>
          <span className="text-xs text-empire-subtle">
            {sortedRows.length} criativo{sortedRows.length !== 1 ? 's' : ''}
            {hideSemMql && semMqlCount > 0 && (
              <span className="ml-1 text-empire-muted">({semMqlCount} sem MQL ocultos)</span>
            )}
          </span>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-empire-subtle" />}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHideSemMql((p) => !p)}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              hideSemMql
                ? 'border-empire-primary bg-empire-primary text-white'
                : 'border-empire-border bg-empire-surface text-empire-subtle hover:bg-empire-elevated'
            }`}
          >
            Só com MQL
          </button>
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
                      <div key={String(key)} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-empire-elevated">
                        <input
                          type="checkbox"
                          checked={!hiddenColumns.has(key)}
                          onChange={() => toggleColumn(key)}
                          className="rounded border-empire-border text-empire-void focus:ring-[var(--empire-primary)]"
                        />
                        <span className="flex-1 text-xs text-empire-void">{col.label}</span>
                        <button
                          onClick={() => moveColumn(key, 'up')}
                          disabled={idx === 0}
                          className="text-empire-subtle hover:text-empire-void disabled:opacity-30"
                        >
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => moveColumn(key, 'down')}
                          disabled={idx === columnOrder.length - 1}
                          className="text-empire-subtle hover:text-empire-void disabled:opacity-30"
                        >
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
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
      <div className={isFullscreen ? 'overflow-auto flex-1' : 'overflow-auto max-h-[calc(100vh-340px)]'}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 left-0 z-30 bg-empire-elevated min-w-[240px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-empire-subtle hover:text-empire-void"
                >
                  Criativo
                  {sortKey === 'name'
                    ? sortDir === 'asc'
                      ? <ArrowUpNarrowWide className="h-3.5 w-3.5 text-empire-void" />
                      : <ArrowDownWideNarrow className="h-3.5 w-3.5 text-empire-void" />
                    : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                  }
                </button>
              </TableHead>
              {visibleColumns.map((col) => (
                <TableHead
                  key={col.key}
                  className="sticky top-0 z-20 bg-empire-elevated text-center min-w-[110px] cursor-pointer"
                  onClick={() => handleSort(col.key)}
                >
                  <div className="flex items-center justify-center gap-1.5 text-[10px] font-semibold tracking-wider uppercase text-empire-subtle hover:text-empire-void">
                    {col.label}
                    {sortKey === col.key
                      ? sortDir === 'asc'
                        ? <ArrowUpNarrowWide className="h-3.5 w-3.5 text-empire-void" />
                        : <ArrowDownWideNarrow className="h-3.5 w-3.5 text-empire-void" />
                      : <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                    }
                  </div>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => {
              const isExpanded = expandedCreativeCodes.has(row.code)
              const visiblePublicRows = hideSemMql
                ? row.publicRows.filter((publicRow: PublicBreakdownRow) => publicRow.mql > 0)
                : row.publicRows

              return (
                <Fragment key={row.code}>
                  <TableRow className="hover:bg-empire-elevated transition-colors">
                    <TableCell className="sticky left-0 z-20 bg-empire-surface min-w-[240px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start gap-2">
                          {row.publicRows.length > 0 ? (
                            <button
                              onClick={() => toggleCreativeExpand(row.code)}
                              className="mt-0.5 rounded p-0.5 text-empire-subtle hover:bg-empire-elevated hover:text-empire-void"
                              aria-label={isExpanded ? 'Recolher públicos' : 'Expandir públicos'}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : (
                            <span className="mt-0.5 h-4 w-4 shrink-0" />
                          )}
                          <div className="flex min-w-0 flex-col">
                            {row.previewUrl ? (
                              <a
                                href={row.previewUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs font-semibold text-empire-void hover:underline"
                                title="Abrir anúncio"
                              >
                                {row.code}
                                <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                              </a>
                            ) : (
                              <span className="text-xs font-semibold text-empire-void">{row.code}</span>
                            )}
                            <span className="text-[11px] text-empire-subtle truncate max-w-[190px]" title={row.name}>
                              {row.name !== row.code ? row.name : ''}
                            </span>
                            {row.publicRows.length > 0 && (
                              <span className="text-[10px] text-empire-subtle">
                                {visiblePublicRows.length} público{visiblePublicRows.length !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    {visibleColumns.map((col) => {
                      const value = row[col.key] as number
                      const isClickable = col.key === 'leads' || col.key === 'mql' || col.key === 'reunioes' || col.key === 'vendas'
                      const modalLeads = col.key === 'leads' ? row.leadsList : col.key === 'mql' ? row.mqlLeads : col.key === 'reunioes' ? row.reunioesList : col.key === 'vendas' ? row.salesLeads : []
                      const modalLabel = col.key === 'leads' ? 'Leads' : col.key === 'mql' ? 'MQLs' : col.key === 'reunioes' ? 'Reuniões' : 'Vendas'
                      const cpvClass = col.key === 'cpv' ? (value > 9000 ? 'bg-red-50 text-red-700 font-semibold' : value > 6000 ? 'bg-amber-50 text-amber-700 font-semibold' : '') : ''
                      const isZeroVendas = col.key === 'vendas' && value === 0
                      return (
                        <TableCell
                          key={String(col.key)}
                          className={`text-center text-sm font-${isZeroVendas ? 'semibold' : 'normal'} ${cpvClass || ''} ${isClickable && value > 0 ? 'cursor-pointer hover:text-empire-void hover:underline' : ''}`}
                          style={isZeroVendas ? { color: 'var(--empire-danger)' } : undefined}
                          onClick={() => {
                            if (isClickable && value > 0) {
                              setModal({
                                open: true,
                                title: `${modalLabel} — ${row.name}`,
                                leads: modalLeads,
                              })
                            }
                          }}
                        >
                          {col.format(value)}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                  {isExpanded && visiblePublicRows.map((publicRow: PublicBreakdownRow) => (
                    <TableRow key={`${row.code}-${publicRow.code}`} className="bg-empire-elevated/55">
                      <TableCell className="sticky left-0 z-10 bg-empire-surface min-w-[240px] pl-8 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-empire-void">
                            {publicRow.label}
                          </span>
                          <span className="text-[11px] text-empire-subtle">
                            {publicRow.code}
                          </span>
                        </div>
                      </TableCell>
                      {visibleColumns.map((col) => {
                        const value = (publicRow[col.key as keyof PublicBreakdownRow] ?? 0) as number
                        const isClickable = col.key === 'leads' || col.key === 'mql' || col.key === 'reunioes' || col.key === 'vendas'
                        const modalLeads = col.key === 'leads'
                          ? publicRow.leadsList
                          : col.key === 'mql'
                            ? publicRow.mqlLeads
                            : col.key === 'reunioes'
                              ? publicRow.reunioesList
                              : col.key === 'vendas'
                                ? publicRow.salesLeads
                                : []
                        const modalLabel = col.key === 'leads' ? 'Leads' : col.key === 'mql' ? 'MQLs' : col.key === 'reunioes' ? 'Reuniões' : 'Vendas'
                        const subCpvClass = col.key === 'cpv' ? (value > 9000 ? 'bg-red-50 text-red-700 font-semibold' : value > 6000 ? 'bg-amber-50 text-amber-700 font-semibold' : '') : ''
                        const isSubZeroVendas = col.key === 'vendas' && value === 0
                        return (
                          <TableCell
                            key={`${row.code}-${publicRow.code}-${String(col.key)}`}
                            className={`text-center text-sm ${subCpvClass || ''} ${isClickable && value > 0 ? 'cursor-pointer hover:text-empire-void hover:underline' : ''}`}
                            style={isSubZeroVendas ? { color: 'var(--empire-danger)', fontWeight: 600 } : undefined}
                            onClick={() => {
                              if (isClickable && value > 0) {
                                setModal({
                                  open: true,
                                  title: `${modalLabel} — ${row.name} / ${publicRow.label}`,
                                  leads: modalLeads,
                                })
                              }
                            }}
                          >
                            {col.format(value)}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              )
            })}
            {sortedRows.length === 0 && !loading && (
              <TableRow>
                <TableCell
                  colSpan={visibleColumns.length + 1}
                  className="text-center text-sm text-empire-subtle py-12"
                >
                  Nenhum criativo encontrado no período selecionado
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <LeadListModal
        open={modal.open}
        title={modal.title}
        leads={modal.leads}
        onClose={() => setModal({ open: false, title: '', leads: [] })}
      />
    </>
  )

  if (isFullscreen) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex flex-col bg-empire-surface p-6 animate-fade-in-up">
        {tableContent}
      </div>,
      document.body,
    )
  }

  return <div className="space-y-2">{tableContent}</div>
}
