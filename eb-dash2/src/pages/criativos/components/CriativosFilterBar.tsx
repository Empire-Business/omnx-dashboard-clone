import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'

import type { CriativosFilters, FilterOptions } from '@/hooks/useCriativosFilters'
import { emptyFilter, isFilterActive } from '@/hooks/useCriativosFilters'
import { SEM_ATRIBUICAO, SEM_ATRIBUICAO_LABEL } from '@/types/filters'
import { DatePicker } from '@/components/ui/date-picker'

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

function fmt(d: Date) {
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function getSelectedMonthKey(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return null
  const start = new Date(startDate + 'T12:00:00')
  const end = new Date(endDate + 'T12:00:00')
  if (start.getDate() !== 1) return null
  const expectedEnd = new Date(start.getFullYear(), start.getMonth() + 1, 0)
  if (
    end.getDate() === expectedEnd.getDate() &&
    end.getMonth() === start.getMonth() &&
    end.getFullYear() === start.getFullYear()
  ) {
    return `${start.getFullYear()}-${start.getMonth()}`
  }
  return null
}

interface Props {
  filters: CriativosFilters
  setFilters: React.Dispatch<React.SetStateAction<CriativosFilters>>
  filterOptions: FilterOptions
  activePreset: string
  setActivePreset: (label: string) => void
  presets: { label: string; fn: () => { s: string; e: string } }[]
}

export function CriativosFilterBar({
  filters,
  setFilters,
  filterOptions,
  activePreset,
  setActivePreset,
  presets,
}: Props) {
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear())

  const setPreset = (label: string, fn: () => { s: string; e: string }) => {
    const { s, e } = fn()
    setFilters((f) => ({ ...f, startDate: s, endDate: e }))
    setActivePreset(label)
  }

  const selectMonth = (year: number, monthIdx: number) => {
    const start = new Date(year, monthIdx, 1)
    const end = new Date(year, monthIdx + 1, 0)
    setFilters((f) => ({ ...f, startDate: fmt(start), endDate: fmt(end) }))
    setActivePreset(`${MONTH_NAMES[monthIdx]} ${year}`)
  }

  const selectedMonthKey = getSelectedMonthKey(filters.startDate, filters.endDate)

  const clearFilters = () => {
    setFilters((f) => ({
      ...f,
      campaigns: emptyFilter(),
      adsets: emptyFilter(),
      ads: emptyFilter(),
      channels: emptyFilter(),
      funilTags: emptyFilter(),
      cpTags: emptyFilter(),
      mqlFilter: 'all',
      sdrs: emptyFilter(),
      closers: emptyFilter(),
    }))
  }

  const activeFilterCount = [
    filters.campaigns,
    filters.adsets,
    filters.ads,
    filters.channels,
    filters.funilTags,
    filters.cpTags,
    filters.sdrs,
    filters.closers,
  ].filter(isFilterActive).length + (filters.mqlFilter === 'mql' ? 1 : 0)

  return (
    <div>
      <button
        onClick={() => setFiltersOpen(!filtersOpen)}
        className="flex w-full items-center justify-between rounded-xl border border-empire-border bg-empire-elevated px-4 py-2.5"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-empire-void">Filtros</span>
          {!filtersOpen && (
            <span className="text-xs text-empire-muted">
              {activePreset || `${filters.startDate} → ${filters.endDate}`}
            </span>
          )}
        </div>
        <ChevronDown
          size={16}
          className={cn(
            'text-empire-subtle transition-transform duration-200',
            filtersOpen ? 'rotate-180' : '',
          )}
        />
      </button>

      {filtersOpen && (
        <div className="mt-3 space-y-3 rounded-xl border border-empire-border bg-empire-surface p-4">
          {/* Presets + seletor de mês */}
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => setPreset(p.label, p.fn)}
                className={cn(
                  'rounded-md px-2.5 py-1 text-xs font-medium transition-all border',
                  activePreset === p.label
                    ? 'border-empire-primary/40 bg-empire-primary/10 text-empire-primary'
                    : 'border-empire-border bg-empire-surface text-empire-subtle hover:text-empire-void',
                )}
              >
                {p.label}
              </button>
            ))}

            <span className="text-empire-border text-base leading-none">|</span>

            <button
              onClick={() => setPickerYear((y) => y - 1)}
              className="flex h-6 w-5 items-center justify-center rounded text-empire-subtle hover:bg-empire-elevated transition-colors"
            >
              <ChevronLeft size={12} />
            </button>
            <span className="text-[11px] font-medium tabular-nums text-empire-subtle min-w-[32px] text-center">
              {pickerYear}
            </span>
            <button
              onClick={() => setPickerYear((y) => y + 1)}
              className="flex h-6 w-5 items-center justify-center rounded text-empire-subtle hover:bg-empire-elevated transition-colors"
            >
              <ChevronRight size={12} />
            </button>

            {MONTH_NAMES.map((name, idx) => {
              const key = `${pickerYear}-${idx}`
              const isSelected = selectedMonthKey === key
              const isFuture = new Date(pickerYear, idx, 1) > new Date()
              return (
                <button
                  key={key}
                  disabled={isFuture}
                  onClick={() => selectMonth(pickerYear, idx)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-medium transition-all border',
                    isFuture
                      ? 'border-transparent text-empire-border cursor-default'
                      : isSelected
                        ? 'border-empire-primary/50 bg-empire-primary/10 text-empire-primary'
                        : 'border-transparent text-empire-subtle hover:text-empire-void hover:bg-empire-elevated',
                  )}
                >
                  {name}
                </button>
              )
            })}
          </div>

          {/* Date range manual */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-empire-subtle">De</span>
              <DatePicker value={filters.startDate} onChange={(v) => {
                  setFilters((f) => ({ ...f, startDate: v }))
                  setActivePreset('')
                }} />
            </div>
            <span className="text-xs font-medium text-empire-subtle">até</span>
            <div className="flex items-center gap-1.5">
              <DatePicker value={filters.endDate} onChange={(v) => {
                  setFilters((f) => ({ ...f, endDate: v }))
                  setActivePreset('')
                }} />
            </div>
            {activeFilterCount > 0 && (
              <span className="text-[11px] px-2 py-1 rounded bg-empire-info/10 border border-empire-info/25 text-empire-info">
                {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} ativo{activeFilterCount > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* Dimension filters */}
          <div className="flex flex-wrap items-start gap-2">
            {(activeFilterCount > 0 || filters.mqlFilter !== 'all') && (
              <button
                onClick={clearFilters}
                className="flex h-8 items-center gap-1 rounded-md border border-empire-border px-2 py-1.5 text-xs font-medium text-empire-subtle hover:bg-empire-danger-soft hover:text-empire-danger transition-all"
              >
                Limpar
              </button>
            )}

            <MultiSelectFilter
              value={filters.campaigns}
              onChange={(v) => setFilters((f) => ({ ...f, campaigns: v }))}
              options={filterOptions.campaigns.map((c) => ({ value: c, label: c }))}
              placeholder="Campanha Meta"
            />
            <MultiSelectFilter
              value={filters.adsets}
              onChange={(v) => setFilters((f) => ({ ...f, adsets: v }))}
              options={filterOptions.adsets.map((c) => ({ value: c, label: c }))}
              placeholder="Conjunto"
            />
            <MultiSelectFilter
              value={filters.ads}
              onChange={(v) => setFilters((f) => ({ ...f, ads: v }))}
              options={filterOptions.ads.map((c) => ({ value: c, label: c }))}
              placeholder="Anúncio"
            />
            <MultiSelectFilter
              value={filters.channels}
              onChange={(v) => setFilters((f) => ({ ...f, channels: v }))}
              options={filterOptions.channels.map((ch) => ({ value: ch.slug, label: ch.nome }))}
              placeholder="Canal"
            />
            <MultiSelectFilter
              value={filters.funilTags}
              onChange={(v) => setFilters((f) => ({ ...f, funilTags: v }))}
              options={filterOptions.funilTags.map((t) => ({ value: t, label: t }))}
              placeholder="Funil [fn]"
            />
            <MultiSelectFilter
              value={filters.cpTags}
              onChange={(v) => setFilters((f) => ({ ...f, cpTags: v }))}
              options={filterOptions.cpTags.map((t) => ({ value: t, label: t }))}
              placeholder="Campanha [cp]"
            />
            <MultiSelectFilter
              value={filters.sdrs}
              onChange={(v) => setFilters((f) => ({ ...f, sdrs: v }))}
              options={filterOptions.sdrs.map((s) => ({ value: s, label: s === SEM_ATRIBUICAO ? SEM_ATRIBUICAO_LABEL : s }))}
              placeholder="Pré-vendedor"
            />
            <MultiSelectFilter
              value={filters.closers}
              onChange={(v) => setFilters((f) => ({ ...f, closers: v }))}
              options={filterOptions.closers.map((s) => ({ value: s, label: s === SEM_ATRIBUICAO ? SEM_ATRIBUICAO_LABEL : s }))}
              placeholder="Closer"
            />

            {/* Filtro MQL — mantém o rótulo "Classificação" usado nas demais
                abas do dashboard, para consistência. */}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-empire-subtle">Classificação:</span>
              <button
                onClick={() => setFilters((f) => ({ ...f, mqlFilter: f.mqlFilter === 'mql' ? 'all' : 'mql' }))}
                title='Restringe os leads-base (que alimentam o ranking) a leads com a tag "mql" em contatos.tags. Não altera o investimento/spend exibido. Use "Ocultar sem MQL" para apenas esconder criativos com 0 MQL sem mudar os números.'
                className={cn(
                  'rounded-md px-3 py-1.5 text-xs font-medium transition-all border',
                  filters.mqlFilter === 'mql'
                    ? 'border-empire-primary/40 bg-empire-primary/10 text-empire-primary'
                    : 'border-empire-border bg-empire-surface text-empire-subtle hover:text-empire-void',
                )}
              >
                {filters.mqlFilter === 'mql' ? 'Somente MQL' : 'Todos os leads'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
