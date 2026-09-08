import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import {
  usePreVendas,
  spToday,
  spDaysAgo,
  applyMqlFilter,
} from '@/hooks/usePreVendas'
import type { PreVendasFilters } from '@/hooks/usePreVendas'
import { usePreVendasProducao } from '@/hooks/usePreVendasProducao'
import { CohortProdToggle } from '@/components/ui/CohortProdToggle'
import { RecuperacaoFilter } from '@/components/ui/RecuperacaoFilter'
import { useDashboardPrefs } from '@/hooks/useDashboardPrefs'
import { GeralTab } from './tabs/GeralTab'
import { MatrizTab } from './tabs/MatrizTab'
import { ReunioesTab } from './tabs/ReunioesTab'
import { CamiTab } from './tabs/CamiTab'
import { useCamiVendas } from '@/hooks/useCamiVendas'
import { MatrizEficienciaTab } from '@/components/matriz-eficiencia/MatrizEficienciaTab'
import { BarChart3, TableProperties, CalendarDays, ChevronDown, Star, Gauge } from 'lucide-react'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { emptyFilter, isFilterActive, SEM_ATRIBUICAO, SEM_ATRIBUICAO_LABEL } from '@/types/filters'
import type { FilterValues } from '@/types/filters'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { DatePicker } from '@/components/ui/date-picker'

// ─── Tab definition ───────────────────────────────────────────

const TABS = [
  { key: 'geral', label: 'Visão Geral', icon: BarChart3 },
  { key: 'matriz', label: 'Matriz', icon: TableProperties },
  { key: 'eficiencia', label: 'Eficiência', icon: Gauge },
  { key: 'reunioes', label: 'Reuniões', icon: CalendarDays },
  { key: 'cami', label: 'Cami', icon: Star },
] as const

type TabKey = (typeof TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'geral'

// ─── Date presets ─────────────────────────────────────────────

/** Helper: retorna data SP deslocada N dias para frente */
const spDaysAhead = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

const PRESETS = [
  { label: 'Hoje', fn: () => ({ s: spToday(), e: spToday() }) },
  { label: 'Amanhã', fn: () => ({ s: spDaysAhead(1), e: spDaysAhead(1) }) },
  { label: 'Ontem', fn: () => ({ s: spDaysAgo(1), e: spDaysAgo(1) }) },
  { label: '7d', fn: () => ({ s: spDaysAgo(6), e: spToday() }) },
  { label: '30d', fn: () => ({ s: spDaysAgo(29), e: spToday() }) },
  {
    label: 'Semana que vem',
    fn: () => {
      const now = new Date()
      const spNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
      const dow = spNow.getDay() // 0=dom
      const nextMon = new Date(spNow)
      nextMon.setDate(spNow.getDate() + (dow === 0 ? 1 : 8 - dow))
      const nextSun = new Date(nextMon)
      nextSun.setDate(nextMon.getDate() + 6)
      const fmt = (x: Date) => x.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      return { s: fmt(nextMon), e: fmt(nextSun) }
    },
  },
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

// ─── Main Page ──────────────────────────────────────────────

export function VendasPage() {
  const [searchParams, setSearchParams] = useSearchParams()

  // Tab
  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : DEFAULT_TAB
  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  // MQL toggle
  const modoMql: 'todos' | 'mql' = searchParams.get('mql') === '1' ? 'mql' : 'todos'
  const toggleMql = () => {
    const next = new URLSearchParams(searchParams)
    if (modoMql === 'mql') next.delete('mql')
    else next.set('mql', '1')
    setSearchParams(next, { replace: true })
  }

  // Cohort / Produtividade toggle
  const [activePanel, setActivePanel] = useState<'cohort' | 'produtividade'>('cohort')

  // Filtro de Recuperação (3 estados), salvo por conta
  const { recuperacaoMode, setRecuperacaoMode } = useDashboardPrefs()
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth >= 768)

  // Date filters
  const [startDate, setStartDate] = React.useState(() => spDaysAgo(29))
  const [endDate, setEndDate] = React.useState(() => spToday())
  const [activePreset, setActivePreset] = React.useState('30d')

  // Dimension filters
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

  // Data - usa hook diferente conforme o modo (Cohort vs Produtividade)
  const isProdutividade = activePanel === 'produtividade'

  // Cohort: usa usePreVendas (filtra por data_lead_recebido)
  const { opps: cohortOpps, revenueRows: cohortRevenueRows, metaRows, accountDailyRows, filterOptions, loading: cohortLoading, error: cohortError } =
    usePreVendas(filters, recuperacaoMode)

  // Produtividade: usa usePreVendasProducao (filtra por eventos no período)
  const { opps: prodOpps, revenueRows: prodRevenueRows, loading: prodLoading, error: prodError } =
    usePreVendasProducao(filters, recuperacaoMode, isProdutividade)

  // Seleciona os dados conforme o painel ativo
  const opps = isProdutividade ? prodOpps : cohortOpps
  const revenueRows = isProdutividade ? prodRevenueRows : cohortRevenueRows
  const loading = isProdutividade ? prodLoading : cohortLoading
  const error = isProdutividade ? prodError : cohortError

  // ─── Aba Cami (hook próprio, independente dos outros) ─────
  const camiData = useCamiVendas({
    startDate,
    endDate,
    mode: activePanel,
    canal: isFilterActive(canais) ? canais : undefined,
    sdr: isFilterActive(sdrs) ? sdrs : undefined,
  })

  // MQL filter
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
      title="Vendas"
      description="Performance comercial — funil, cohort e análise de reuniões"
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
        {/* ── Painel de Filtros (colapsável) ── */}
        <div>
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

              {/* Filtro de Recuperação (3 estados, salvo por conta) */}
              <div className="rounded-xl border border-empire-border bg-empire-elevated p-4">
                <RecuperacaoFilter value={recuperacaoMode} onChange={setRecuperacaoMode} />
              </div>

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
                  {/* Filtro MQL — rótulo "Classificação" para não colidir com o
                      toggle Cohort/Produtividade, que também usa "Modo". */}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-empire-subtle">Classificação:</span>
                    <button
                      onClick={toggleMql}
                      title='Restringe a lista a leads com a tag "mql" em contatos.tags (classificação do marketing).'
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                        modoMql === 'mql'
                          ? 'border-empire-primary/40 bg-empire-primary/10 text-empire-primary'
                          : 'border-empire-border bg-empire-surface text-empire-muted hover:text-empire-void'
                      )}
                    >
                      {modoMql === 'mql' ? 'Somente MQL' : 'Todos os leads'}
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
                      {modoMql === 'mql' && <span className="ml-2 text-empire-primary">(filtrado: somente MQL)</span>}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Tab content */}
        <div key={activeTab}>
          {error ? (
            <div className="rounded-lg border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
              Erro ao carregar dados: {error}
            </div>
          ) : activeTab === 'geral' ? (
            <GeralTab
              opps={filteredOpps}
              revenueRows={revenueRows}
              metaRows={metaRows}
              accountDailyRows={accountDailyRows}
              loading={loading}
              startDate={startDate}
              endDate={endDate}
              activePanel={activePanel}
              closerFilter={closers}
              sdrFilter={sdrs}
              canalFilter={canais}
              funilFilter={funilTags}
              campanhaFilter={campanhas}
              recuperacaoMode={recuperacaoMode}
            />
          ) : activeTab === 'matriz' ? (
            <MatrizTab
              opps={filteredOpps}
              revenueRows={revenueRows}
              loading={loading}
              activePanel={activePanel}
              startDate={startDate}
              endDate={endDate}
              dimensionFilters={{ closerFilter: closers, sdrFilter: sdrs, canalFilter: canais, funilFilter: funilTags, campanhaFilter: campanhas }}
              recuperacaoMode={recuperacaoMode}
            />
          ) : activeTab === 'eficiencia' ? (
            <MatrizEficienciaTab opps={filteredOpps} revenueRows={revenueRows} />
          ) : activeTab === 'reunioes' ? (
            <ReunioesTab
              opps={filteredOpps}
              revenueRows={revenueRows}
              startDate={startDate}
              endDate={endDate}
              loading={loading}
              activePanel={activePanel}
              closerFilter={closers}
              sdrFilter={sdrs}
              canalFilter={canais}
              funilFilter={funilTags}
              recuperacaoMode={recuperacaoMode}
            />
          ) : activeTab === 'cami' ? (
            <CamiTab
              inscritos={camiData.inscritos}
              compradores={camiData.compradores}
              chartDays={camiData.chartDays}
              loading={camiData.loading}
              activePanel={activePanel}
            />
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}
