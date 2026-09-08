import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { spDaysAgo, spToday } from '@/lib/utils/dates'
import { DatePicker } from '@/components/ui/date-picker'
import { AuditoriaIaPanel } from '../components/AuditoriaIaPanel'

const PRESETS = [
  { label: 'Hoje', fn: () => ({ s: spToday(), e: spToday() }) },
  { label: 'Ontem', fn: () => ({ s: spDaysAgo(1), e: spDaysAgo(1) }) },
  { label: '7d', fn: () => ({ s: spDaysAgo(6), e: spToday() }) },
  { label: '30d', fn: () => ({ s: spDaysAgo(29), e: spToday() }) },
  {
    label: 'Este mês',
    fn: () => {
      const now = new Date()
      const fmt = (x: Date) => x.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      return { s: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), e: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
    },
  },
  {
    label: 'Mês anterior',
    fn: () => {
      const now = new Date()
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      const fmt = (x: Date) => x.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      return { s: fmt(d), e: fmt(last) }
    },
  },
]

export function AuditoriaTab() {
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth >= 768)
  const [startDate, setStartDate] = useState(() => spDaysAgo(29))
  const [endDate, setEndDate] = useState(() => spToday())
  const [activePreset, setActivePreset] = useState('30d')

  const setPreset = (label: string, fn: () => { s: string; e: string }) => {
    const { s, e } = fn()
    setStartDate(s)
    setEndDate(e)
    setActivePreset(label)
  }

  const dateSummary = useMemo(
    () => `${startDate} → ${endDate}`,
    [startDate, endDate]
  )

  return (
    <div className="space-y-6">
      {/* Painel de Filtros (colapsável) */}
      <div>
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          className="flex w-full items-center justify-between rounded-xl border border-empire-border bg-empire-elevated px-4 py-2.5 transition-colors hover:border-empire-border-strong"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-empire-void">Período</span>
            {!filtersOpen && (
              <span className="text-xs font-mono text-empire-subtle">{dateSummary}</span>
            )}
          </div>
          <ChevronDown
            size={16}
            className={cn('text-empire-subtle transition-transform duration-200', filtersOpen ? 'rotate-180' : '')}
          />
        </button>

        {filtersOpen && (
          <div className="mt-3 space-y-3 rounded-xl border border-empire-border bg-empire-elevated p-4">
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => setPreset(p.label, p.fn)}
                  className={cn(
                    'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                    activePreset === p.label
                      ? 'border-empire-primary/40 bg-empire-primary/10 text-empire-primary'
                      : 'border-empire-border bg-empire-surface text-empire-muted hover:text-empire-void'
                  )}
                >
                  {p.label}
                </button>
              ))}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-empire-subtle">De</span>
                <DatePicker
                  value={startDate}
                  max={endDate}
                  aria-label="Data inicial"
                  onChange={(v) => {
                    setStartDate(v)
                    setActivePreset('')
                  }}
                />
                <span className="text-xs font-medium text-empire-subtle">até</span>
                <DatePicker
                  value={endDate}
                  min={startDate}
                  aria-label="Data final"
                  onChange={(v) => {
                    setEndDate(v)
                    setActivePreset('')
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Conteúdo da auditoria */}
      <AuditoriaIaPanel startDate={startDate} endDate={endDate} />
    </div>
  )
}
