import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DISPAROS_PRESETS, type DisparosFilters, type StatusFilter, type TipoFilter } from '../filters'
import { DatePicker } from '@/components/ui/date-picker'

interface Props {
  filters: DisparosFilters
  setFilters: React.Dispatch<React.SetStateAction<DisparosFilters>>
  activePreset: string
  setActivePreset: (label: string) => void
}

export function DisparoFiltersBar({ filters, setFilters, activePreset, setActivePreset }: Props) {
  const setPreset = (label: string, fn: () => { s: string; e: string }) => {
    const { s, e } = fn()
    setFilters((f) => ({ ...f, startDate: s, endDate: e }))
    setActivePreset(label)
  }

  const setManualDate = (field: 'startDate' | 'endDate', value: string) => {
    setFilters((f) => ({ ...f, [field]: value }))
    setActivePreset('')
  }

  return (
    <div className="space-y-3 rounded-xl border border-empire-border bg-empire-surface p-4">
      {/* Presets de período */}
      <div className="flex flex-wrap items-center gap-1.5">
        {DISPAROS_PRESETS.map((p) => (
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
      </div>

      {/* Range manual + filtros de dimensão */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-empire-subtle">De</span>
          <DatePicker value={filters.startDate} onChange={(v) => setManualDate('startDate', v)} />
        </div>
        <span className="text-xs font-medium text-empire-subtle">até</span>
        <div className="flex items-center gap-1.5">
          <DatePicker value={filters.endDate} onChange={(v) => setManualDate('endDate', v)} />
        </div>

        <span className="text-empire-border text-base leading-none">|</span>

        <label className="flex h-8 items-center gap-1.5 rounded-md border border-empire-border bg-empire-surface px-2 text-xs">
          <span className="font-medium text-empire-subtle">Status:</span>
          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as StatusFilter }))}
            className="h-full bg-transparent text-xs text-empire-void focus:outline-none cursor-pointer"
          >
            <option value="all">Todas</option>
            <option value="active">Ativas</option>
            <option value="inactive">Inativas</option>
          </select>
        </label>

        <label className="flex h-8 items-center gap-1.5 rounded-md border border-empire-border bg-empire-surface px-2 text-xs">
          <span className="font-medium text-empire-subtle">Tipo:</span>
          <select
            value={filters.tipo}
            onChange={(e) => setFilters((f) => ({ ...f, tipo: e.target.value as TipoFilter }))}
            className="h-full bg-transparent text-xs text-empire-void focus:outline-none cursor-pointer"
          >
            <option value="all">Todos</option>
            <option value="marketing">Marketing</option>
            <option value="utility">Utility</option>
          </select>
        </label>

        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-empire-subtle pointer-events-none" />
          <input
            type="text"
            value={filters.busca}
            onChange={(e) => setFilters((f) => ({ ...f, busca: e.target.value }))}
            placeholder="Buscar campanha..."
            className="h-8 w-48 pl-7 pr-3 text-xs bg-empire-surface border-[1.5px] border-empire-border rounded-md text-empire-void placeholder:text-empire-muted focus:outline-none focus:border-empire-primary transition-colors"
          />
        </div>
      </div>
    </div>
  )
}
