import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FilterValues } from '@/types/filters'
import { emptyFilter, isFilterActive } from '@/types/filters'

interface MultiSelectFilterProps {
  value: FilterValues
  onChange: (v: FilterValues) => void
  options: { value: string; label: string }[]
  placeholder: string
  className?: string
  /** Count of data points per option value in the current period. 0 or missing = inactive. */
  periodCounts?: Record<string, number>
}

type ItemState = 'neutral' | 'include' | 'exclude'

function getItemState(value: string, fv: FilterValues): ItemState {
  if (fv.include.includes(value)) return 'include'
  if (fv.exclude.includes(value)) return 'exclude'
  return 'neutral'
}

function cycleState(current: ItemState): ItemState {
  if (current === 'neutral') return 'include'
  if (current === 'include') return 'exclude'
  return 'neutral'
}

export function MultiSelectFilter({
  value,
  onChange,
  options,
  placeholder,
  className,
  periodCounts,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  // Quando o trigger está na metade direita da viewport, o painel abre
  // ancorado à direita — antes era sempre left-0 e estourava pra fora da tela.
  const [alignRight, setAlignRight] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const SEARCH_THRESHOLD = 6
  const showSearch = options.length >= SEARCH_THRESHOLD

  const hasCounts = !!periodCounts

  // Split options into active (has data) and inactive (no data this period)
  const { activeOptions, inactiveOptions } = (() => {
    if (!hasCounts) return { activeOptions: options, inactiveOptions: [] }
    const active: typeof options = []
    const inactive: typeof options = []
    for (const opt of options) {
      const count = periodCounts![opt.value] ?? 0
      if (count > 0 || value.include.includes(opt.value) || value.exclude.includes(opt.value)) {
        active.push(opt)
      } else {
        inactive.push(opt)
      }
    }
    return { activeOptions: active, inactiveOptions: inactive }
  })()

  const visibleOptions = hasCounts
    ? (showInactive ? [...activeOptions, ...inactiveOptions] : activeOptions)
    : options

  const filteredOptions = showSearch && search.trim()
    ? visibleOptions.filter((o) =>
        o.label.toLowerCase().includes(search.trim().toLowerCase())
      )
    : visibleOptions

  const active = isFilterActive(value)
  const totalSelected = value.include.length + value.exclude.length

  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutside as EventListener)
      document.addEventListener('touchstart', handleOutside as EventListener)
      if (showSearch) setTimeout(() => searchRef.current?.focus(), 50)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside as EventListener)
      document.removeEventListener('touchstart', handleOutside as EventListener)
    }
  }, [open, showSearch])

  function handleCycle(optValue: string) {
    const current = getItemState(optValue, value)
    const next = cycleState(current)
    const newFv: FilterValues = {
      include: value.include.filter((v) => v !== optValue),
      exclude: value.exclude.filter((v) => v !== optValue),
    }
    if (next === 'include') newFv.include = [...newFv.include, optValue]
    if (next === 'exclude') newFv.exclude = [...newFv.exclude, optValue]
    onChange(newFv)
  }

  function removeChip(optValue: string) {
    onChange({
      include: value.include.filter((v) => v !== optValue),
      exclude: value.exclude.filter((v) => v !== optValue),
    })
  }

  function clearAll(e: React.MouseEvent) {
    e.stopPropagation()
    onChange(emptyFilter())
  }

  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v

  return (
    <div ref={containerRef} className={cn('relative flex flex-col gap-1', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          if (!open && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect()
            setAlignRight(rect.left + 280 > window.innerWidth - 16)
          }
          setOpen((o) => !o)
        }}
        className={cn(
          'flex h-9 min-h-[36px] min-w-[130px] items-center gap-1.5 rounded-md border px-3 text-xs transition-colors focus:outline-none',
          active
            ? 'border-empire-info/35 bg-empire-info/10 text-empire-info'
            : 'border-empire-border bg-empire-elevated text-empire-void hover:border-empire-border-strong',
        )}
      >
        <span className="flex-1 truncate text-left">
          {active ? `${placeholder} (${totalSelected})` : placeholder}
        </span>
        {active && (
          <span
            onClick={clearAll}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-empire-void/10 dark:hover:bg-empire-void/20"
          >
            <X size={10} />
          </span>
        )}
        <ChevronDown
          size={12}
          className={cn(
            'shrink-0 transition-transform',
            active ? 'text-empire-info' : 'text-empire-subtle',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Chips */}
      {active && (
        <div className="flex flex-wrap gap-1">
          {value.include.map((v) => (
            <span
              key={`inc-${v}`}
              className="flex items-center gap-1 rounded-full border border-empire-info/30 bg-empire-info/10 px-2 py-0.5 text-[11px] font-medium text-empire-info"
            >
              <Check size={9} />
              {labelOf(v)}
              <button
                type="button"
                onClick={() => removeChip(v)}
                className="ml-0.5 opacity-60 hover:opacity-100"
              >
                <X size={9} />
              </button>
            </span>
          ))}
          {value.exclude.map((v) => (
            <span
              key={`exc-${v}`}
              className="flex items-center gap-1 rounded-full border border-empire-danger/30 bg-empire-danger/10 px-2 py-0.5 text-[11px] font-medium text-empire-danger"
            >
              <span className="font-bold">≠</span>
              {labelOf(v)}
              <button
                type="button"
                onClick={() => removeChip(v)}
                className="ml-0.5 opacity-60 hover:opacity-100"
              >
                <X size={9} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div
          className={cn(
            'absolute top-[calc(100%+4px)] z-50 max-h-[300px] min-w-[200px] max-w-[min(280px,calc(100vw-2rem))] overflow-hidden overflow-y-auto rounded-lg border border-empire-border bg-empire-surface shadow-md',
            alignRight ? 'right-0' : 'left-0'
          )}
        >
          {/* Hint row */}
          <div className="flex items-center gap-1.5 border-b border-empire-border bg-empire-elevated px-3 py-1.5 text-[10px] text-empire-subtle">
            <span className="flex items-center gap-1">
              <span className="inline-flex h-3 w-3 items-center justify-center rounded border border-empire-info/40 bg-empire-info/10">
                <Check size={7} className="text-empire-info" />
              </span>
              1× incluir
            </span>
            <span className="opacity-40">·</span>
            <span className="flex items-center gap-1">
              <span className="inline-flex h-3 w-3 items-center justify-center rounded border border-empire-danger/40 bg-empire-danger/10 text-[11px] font-bold leading-none text-empire-danger">≠</span>
              2× excluir
            </span>
            <span className="opacity-40">·</span>
            <span>3× remover</span>
          </div>

          {/* Search input */}
          {showSearch && (
            <div className="border-b border-empire-border px-2 py-2">
              <div className="relative">
                <Search
                  size={11}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-empire-subtle"
                />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar..."
                  className="w-full rounded border border-empire-border bg-empire-elevated py-1 pl-6 pr-2 text-xs text-empire-void placeholder:text-empire-subtle focus:border-empire-primary focus:outline-none"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-empire-subtle hover:text-empire-void"
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
            </div>
          )}

          {filteredOptions.length === 0 && (
            <p className="px-3 py-2 text-xs text-empire-subtle">
              {search ? 'Nenhum resultado para "' + search + '"' : 'Nenhuma opção disponível'}
            </p>
          )}
          {filteredOptions.map((opt) => {
            const state = getItemState(opt.value, value)
            const nextAction =
              state === 'neutral' ? 'Clique para incluir' :
              state === 'include' ? 'Clique novamente para excluir' :
              'Clique para remover'
            const count = hasCounts ? (periodCounts![opt.value] ?? 0) : null
            const isInactive = hasCounts && count === 0 && state === 'neutral'
            return (
              <button
                key={opt.value}
                type="button"
                title={nextAction}
                onClick={() => handleCycle(opt.value)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-empire-hover',
                  isInactive && 'opacity-50'
                )}
              >
                {/* State indicator */}
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded',
                    state === 'neutral' && 'border-[1.5px] border-empire-border bg-transparent',
                    state === 'include' && 'border-[1.5px] border-empire-info/60 bg-empire-info/10',
                    state === 'exclude' && 'border-[1.5px] border-empire-danger/60 bg-empire-danger/10'
                  )}
                >
                  {state === 'include' && <Check size={10} className="text-empire-info" />}
                  {state === 'exclude' && (
                    <span className="text-[10px] font-bold leading-none text-empire-danger">
                      ≠
                    </span>
                  )}
                </span>

                {/* Label */}
                <span
                  className={cn(
                    'flex-1 truncate text-left',
                    state === 'include' && 'font-medium text-empire-info',
                    state === 'exclude' && 'font-medium text-empire-danger line-through',
                    state === 'neutral' && 'text-empire-void'
                  )}
                >
                  {opt.label}
                </span>

                {/* Count badge */}
                {count !== null && count > 0 && (
                  <span className="shrink-0 rounded-full bg-empire-elevated px-1.5 py-0.5 text-[10px] font-medium text-empire-subtle tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            )
          })}

          {/* "Ver mais" toggle for inactive options */}
          {hasCounts && !search && inactiveOptions.length > 0 && (
            <button
              type="button"
              onClick={() => setShowInactive((v) => !v)}
              className="flex w-full items-center gap-1.5 border-t border-empire-border px-3 py-2 text-[11px] text-empire-subtle transition-colors hover:bg-empire-hover hover:text-empire-void"
            >
              <ChevronDown size={11} className={cn('shrink-0 transition-transform', showInactive && 'rotate-180')} />
              {showInactive
                ? 'Ocultar sem dado no período'
                : `Ver mais (${inactiveOptions.length} sem dado no período)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
