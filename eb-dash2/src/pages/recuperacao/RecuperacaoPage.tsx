import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useMetas } from '@/hooks/useMetas'
import {
  usePreVendas,
  spToday,
  spDaysAgo,
  applyMqlFilter,
} from '@/hooks/usePreVendas'
import type { PreVendasFilters } from '@/hooks/usePreVendas'
import { GeralTab } from '@/pages/prevendas/tabs/GeralTab'
import { SDRsTab } from '@/pages/prevendas/tabs/SDRsTab'
import { MQLsCohortTab } from '@/pages/prevendas/tabs/MQLsCohortTab'
import { AutoAgendadosTab } from '@/pages/prevendas/tabs/AutoAgendadosTab'
import { LeadsParadosTab } from '@/pages/prevendas/tabs/LeadsParadosTab'
import { DiscagemTab } from '@/pages/prevendas/tabs/DiscagemTab'
import { BarChart3, Users, Target, CalendarCheck, AlertCircle, ChevronDown, PhoneCall } from 'lucide-react'
import { CohortProdToggle } from '@/components/ui/CohortProdToggle'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { emptyFilter, isFilterActive, SEM_ATRIBUICAO, SEM_ATRIBUICAO_LABEL } from '@/types/filters'
import type { FilterValues } from '@/types/filters'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { DatePicker } from '@/components/ui/date-picker'

// ─── Tab definition ───────────────────────────────────────────

const TABS = [
  { key: 'discagem', label: 'Discagem', icon: PhoneCall },
  { key: 'geral', label: 'Visão Geral', icon: BarChart3 },
  { key: 'sdrs', label: 'SDRs', icon: Users },
  { key: 'mqls', label: 'MQLs', icon: Target },
  { key: 'auto_agendados', label: 'Auto Agendados', icon: CalendarCheck },
  { key: 'leads_parados', label: 'Leads Parados', icon: AlertCircle },
] as const

type TabKey = (typeof TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'geral'

// ─── Date presets ─────────────────────────────────────────────

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

// ─── Main Page ────────────────────────────────────────────────

export function RecuperacaoPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Tab
  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : DEFAULT_TAB
  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  // MQL toggle (persisted in URL)
  const modoMql: 'todos' | 'mql' = searchParams.get('mql') === '1' ? 'mql' : 'todos'
  const toggleMql = () => {
    const next = new URLSearchParams(searchParams)
    if (modoMql === 'mql') next.delete('mql')
    else next.set('mql', '1')
    setSearchParams(next, { replace: true })
  }

  // Cohort / Produtividade toggle
  const [activePanel, setActivePanel] = useState<'cohort' | 'produtividade'>('cohort')
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth >= 768)

  // Date filters (local state)
  const [startDate, setStartDate] = React.useState(() => spDaysAgo(29))
  const [endDate, setEndDate] = React.useState(() => spToday())
  const [activePreset, setActivePreset] = React.useState('30d')

  // Dimension filters (local state)
  const [sdrs, setSdrs] = React.useState<FilterValues>(emptyFilter)
  const [closers, setClosers] = React.useState<FilterValues>(emptyFilter)
  const [canais, setCanais] = React.useState<FilterValues>(emptyFilter)
  const [mediums, setMediums] = React.useState<FilterValues>(emptyFilter)
  const [funilTags, setFunilTags] = React.useState<FilterValues>(emptyFilter)
  const [campanhas, setCampanhas] = React.useState<FilterValues>(emptyFilter)

  const filters: PreVendasFilters = useMemo(
    () => ({ startDate, endDate, sdrs, closers, canais, mediums, funilTags, campanhas, modoMql }),
    [startDate, endDate, sdrs, closers, canais, mediums, funilTags, campanhas, modoMql]
  )

  // Cohort data (always loaded)
  const { opps, metaRows, accountDailyRows, revenueRows, filterOptions, loading, error } = usePreVendas(filters, 'only_recuperacao')
  const { metas } = useMetas()

  // Apply MQL mode client-side
  const filteredOpps = useMemo(() => applyMqlFilter(opps, modoMql === 'mql' ? 'mql' : 'all'), [opps, modoMql])

  const setPreset = (label: string, fn: () => { s: string; e: string }) => {
    const { s, e } = fn()
    setStartDate(s)
    setEndDate(e)
    setActivePreset(label)
  }

  const clearFilters = () => {
    setSdrs(emptyFilter()); setClosers(emptyFilter()); setCanais(emptyFilter()); setMediums(emptyFilter()); setFunilTags(emptyFilter()); setCampanhas(emptyFilter())
    const next = new URLSearchParams(searchParams)
    next.delete('mql')
    setSearchParams(next, { replace: true })
  }

  const activeFilterCount = [sdrs, closers, canais, mediums, funilTags, campanhas].filter(isFilterActive).length

  return (
    <PageShell
      title="Recuperação"
      description="Leads reativados — funil, cohort e análise do time de recuperação"
      tabs={
        <PageTabs
          variant="underline"
          tabs={TABS.map((t) => ({
            label: t.label,
            value: t.key,
            icon: t.icon,
            active: activeTab === t.key,
            onClick: () => setTab(t.key),
          }))}
        />
      }
    >
      <div className="space-y-6">
        {/* ── Painel de Filtros (colapsável) — oculto na aba Discagem ── */}
        <div className={cn(activeTab === 'discagem' && 'hidden')}>
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-empire-border bg-empire-elevated px-4 py-2.5 transition-colors hover:border-empire-border-strong"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-empire-void">Filtros</span>
              {!filtersOpen && (
                <span className="text-xs font-mono text-empire-subtle">
                  {activePreset || `${startDate} → ${endDate}`} · {activePanel === 'cohort' ? 'Cohort' : 'Produtividade'}
                </span>
              )}
            </div>
            <ChevronDown
              size={16}
              className={cn('text-empire-subtle transition-transform duration-200', filtersOpen ? 'rotate-180' : '')}
            />
          </button>

          {filtersOpen && (
            <div className="mt-3 space-y-3">
              {/* Toggle Cohort / Produtividade */}
              <CohortProdToggle activePanel={activePanel} setActivePanel={setActivePanel} variant="card" />

              {/* Global filters */}
              <div className="space-y-3 rounded-xl border border-empire-border bg-empire-elevated p-4">
                {/* Presets + date range */}
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-empire-subtle">De</span>
                      <DatePicker value={startDate} onChange={(v) => { setStartDate(v); setActivePreset('') }} />
                    </div>
                    <span className="text-xs font-medium text-empire-subtle">até</span>
                    <div className="flex items-center gap-1.5">
                      <DatePicker value={endDate} onChange={(v) => { setEndDate(v); setActivePreset('') }} />
                    </div>
                  </div>
                </div>

                {/* Dimension filters */}
                <div className="flex flex-wrap items-start gap-2">
                  {(activeFilterCount > 0 || modoMql === 'mql') && (
                    <button
                      onClick={clearFilters}
                      className="flex h-8 items-center gap-1 rounded-md border border-empire-border px-2 py-1.5 text-xs font-medium text-empire-subtle transition-all hover:bg-empire-danger-soft hover:text-empire-danger"
                    >
                      Limpar
                    </button>
                  )}
                  <MultiSelectFilter value={sdrs} onChange={setSdrs} options={filterOptions.sdrs.map((s) => ({ value: s, label: s === SEM_ATRIBUICAO ? SEM_ATRIBUICAO_LABEL : s }))} placeholder="Pré-vendedor" />
                  <MultiSelectFilter value={closers} onChange={setClosers} options={filterOptions.closers.map((s) => ({ value: s, label: s === SEM_ATRIBUICAO ? SEM_ATRIBUICAO_LABEL : s }))} placeholder="Closer" />
                  <MultiSelectFilter value={canais} onChange={setCanais} options={filterOptions.canais.map((c) => ({ value: c.value, label: c.label }))} placeholder="Canal" />
                  <MultiSelectFilter value={mediums} onChange={setMediums} options={filterOptions.mediums.map((m) => ({ value: m.value, label: m.label }))} placeholder="Mídia" />
                  <MultiSelectFilter value={funilTags} onChange={setFunilTags} options={filterOptions.funilTags.map((s) => ({ value: s, label: s }))} placeholder="Funil" />
                  <MultiSelectFilter value={campanhas} onChange={setCampanhas} options={filterOptions.campanhas.map((s) => ({ value: s, label: s }))} placeholder="Campanha" />

                  {/* MQL Toggle */}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-empire-subtle">Modo:</span>
                    <button
                      onClick={toggleMql}
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                        modoMql === 'mql'
                          ? 'border-empire-primary/40 bg-empire-primary/10 text-empire-primary'
                          : 'border-empire-border bg-empire-surface text-empire-muted hover:text-empire-void'
                      )}
                    >
                      {modoMql === 'mql' ? 'Apenas MQL' : 'Todos'}
                    </button>
                  </div>
                </div>

                {/* Lead count */}
                <p className="text-xs text-empire-subtle">
                  {loading ? (
                    <span>Carregando...</span>
                  ) : (
                    <>
                      <span className="font-mono font-semibold text-empire-void">{filteredOpps.length}</span> leads no período
                      {modoMql === 'mql' && <span className="ml-2 text-empire-primary">(filtrado: apenas MQL)</span>}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Tab content */}
        <div key={activeTab}>
          {activeTab === 'discagem' ? (
            <DiscagemTab scope="recuperacao" />
          ) : error ? (
            <div className="rounded-lg border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
              Erro ao carregar dados: {error}
            </div>
          ) : activeTab === 'geral' ? (
            <GeralTab
              opps={filteredOpps}
              metaRows={metaRows}
              accountDailyRows={accountDailyRows}
              loading={loading}
              onSdrClick={(sdrName) => setSdrs(sdrName ? { include: [sdrName], exclude: [] } : emptyFilter())}
              revenueRows={revenueRows}
              filters={filters}
              startDate={startDate}
              endDate={endDate}
              activePanel={activePanel}
              pipelineMode="only_recuperacao"
            />
          ) : activeTab === 'sdrs' ? (
            <SDRsTab
              opps={filteredOpps}
              revenueRows={revenueRows}
              filters={filters}
              startDate={startDate}
              endDate={endDate}
              loading={loading}
              metas={metas}
              activePanel={activePanel}
              pipelineMode="only_recuperacao"
            />
          ) : activeTab === 'mqls' ? (
            <MQLsCohortTab
              opps={filteredOpps}
              revenueRows={revenueRows}
              startDate={startDate}
              endDate={endDate}
              loading={loading}
              activePanel={activePanel}
            />
          ) : activeTab === 'auto_agendados' ? (
            <AutoAgendadosTab
              opps={filteredOpps}
              revenueRows={revenueRows}
              startDate={startDate}
              endDate={endDate}
              loading={loading}
            />
          ) : activeTab === 'leads_parados' ? (
            <LeadsParadosTab loading={loading} pipelineMode="only_recuperacao" />
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}
