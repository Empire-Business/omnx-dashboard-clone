import React, { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useMetas } from '@/hooks/useMetas'
import { usePermissions } from '@/contexts/PermissionsContext'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  usePreVendas,
  spToday,
  spDaysAgo,
  applyMqlFilter,
} from '@/hooks/usePreVendas'
import type { PreVendasFilters } from '@/hooks/usePreVendas'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { emptyFilter, isFilterActive, SEM_ATRIBUICAO, SEM_ATRIBUICAO_LABEL } from '@/types/filters'
import type { FilterValues } from '@/types/filters'
import { VisaoGeralTab } from './tabs/VisaoGeralTab'
import { SDRsTab } from './tabs/SDRsTab'
import { FunilTab } from './tabs/FunilTab'
import { MQLsCohortTab } from './tabs/MQLsCohortTab'
import { AutoAgendadosTab } from './tabs/AutoAgendadosTab'
import { LeadsParadosTab } from './tabs/LeadsParadosTab'
import { AtividadesTab } from './tabs/AtividadesTab'
import { AgendamentosTab } from './tabs/AgendamentosTab'
import { DiscagemTab } from './tabs/DiscagemTab'
import { Users, Target, CalendarCheck, AlertCircle, CalendarRange, ChevronDown, Activity, PhoneCall, BarChart3, LayoutDashboard } from 'lucide-react'
import { CohortProdToggle } from '@/components/ui/CohortProdToggle'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { DatePicker } from '@/components/ui/date-picker'

// ─── Tab definition ───────────────────────────────────────────

const TABS = [
  { key: 'geral', label: 'Visão Geral', icon: LayoutDashboard },
  { key: 'discagem', label: 'Discagem', icon: PhoneCall },
  { key: 'agendamentos', label: 'Agendamentos', icon: CalendarRange },
  { key: 'atividades', label: 'Atividades', icon: Activity },
  { key: 'mqls', label: 'MQLs', icon: Target },
  { key: 'sdrs', label: 'SDRs', icon: Users },
  { key: 'funil', label: 'Funil', icon: BarChart3 },
  { key: 'auto_agendados', label: 'Auto Agendados', icon: CalendarCheck },
  { key: 'leads_parados', label: 'Leads Parados', icon: AlertCircle },
] as const

type TabKey = (typeof TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'atividades'

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

export function PreVendasPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { isAdminOrOwner } = usePermissions()
  const { user } = useAuth()

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

  // Date filters
  const [startDate, setStartDate] = React.useState(() => spDaysAgo(29))
  const [endDate, setEndDate] = React.useState(() => spToday())
  const [activePreset, setActivePreset] = React.useState('30d')

  // Dimension filters
  const [sdrs, setSdrs] = React.useState<FilterValues>(emptyFilter)
  const [currentSdrName, setCurrentSdrName] = React.useState<string | null>(null)
  const [isGestorSdr, setIsGestorSdr] = React.useState(false)
  const [closers, setClosers] = React.useState<FilterValues>(emptyFilter)
  const [currentCloserName, setCurrentCloserName] = React.useState<string | null>(null)

  useEffect(() => {
    if (isAdminOrOwner || !user?.id) return
    supabase.from('ghl_users').select('nome, papeis').eq('auth_user_id', user.id).maybeSingle()
      .then(({ data }) => {
        if (!data?.nome) return
        const papeis: string[] = data.papeis ?? []
        if (papeis.includes('gestor')) {
          setIsGestorSdr(true)
        } else if (papeis.includes('closer')) {
          setCurrentCloserName(data.nome)
          setClosers({ include: [data.nome], exclude: [] })
        } else {
          setCurrentSdrName(data.nome)
          setSdrs({ include: [data.nome], exclude: [] })
        }
      })
  }, [isAdminOrOwner, user?.id])
  const [canais, setCanais] = React.useState<FilterValues>(emptyFilter)
  const [mediums, setMediums] = React.useState<FilterValues>(emptyFilter)
  const [funilTags, setFunilTags] = React.useState<FilterValues>(emptyFilter)
  const [campanhas, setCampanhas] = React.useState<FilterValues>(emptyFilter)

  const filters: PreVendasFilters = useMemo(
    () => ({ startDate, endDate, sdrs, closers, canais, mediums, funilTags, campanhas, modoMql }),
    [startDate, endDate, sdrs, closers, canais, mediums, funilTags, campanhas, modoMql]
  )

  const { opps, revenueRows, filterOptions, loading, error } = usePreVendas(filters, 'exclude_recuperacao')
  const { metas } = useMetas()

  const filteredOpps = useMemo(() => applyMqlFilter(opps, modoMql === 'mql' ? 'mql' : 'all'), [opps, modoMql])

  const setPreset = (label: string, fn: () => { s: string; e: string }) => {
    const { s, e } = fn()
    setStartDate(s)
    setEndDate(e)
    setActivePreset(label)
  }

  const activeFilterCount = [sdrs, closers, canais, mediums, funilTags, campanhas].filter(isFilterActive).length

  const clearFilters = () => {
    setSdrs(emptyFilter()); setClosers(emptyFilter()); setCanais(emptyFilter()); setMediums(emptyFilter()); setFunilTags(emptyFilter()); setCampanhas(emptyFilter())
    const next = new URLSearchParams(searchParams)
    next.delete('mql')
    setSearchParams(next, { replace: true })
  }

  return (
    <PageShell
      title="Pré-Vendas"
      description="Performance do time de SDRs — funil, cohort e análise de leads"
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
          {/* Toggle Cohort / Produtividade — SEMPRE visível, acima dos filtros */}
          <CohortProdToggle activePanel={activePanel} setActivePanel={setActivePanel} variant="card" />

          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-empire-border bg-empire-elevated px-4 py-2.5 transition-colors hover:border-empire-border-strong"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-empire-void">Filtros</span>
              {!filtersOpen && (
                <span className="text-xs font-mono text-empire-subtle">
                  {activePreset || `${startDate} → ${endDate}`}
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
                  {(isAdminOrOwner || isGestorSdr) && (
                    <MultiSelectFilter value={sdrs} onChange={setSdrs} options={filterOptions.sdrs.map((s) => ({ value: s, label: s === SEM_ATRIBUICAO ? SEM_ATRIBUICAO_LABEL : s }))} placeholder="Pré-vendedor" />
                  )}
                  {!isAdminOrOwner && !isGestorSdr && currentSdrName && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-empire-border bg-empire-elevated px-3 py-1.5 text-xs font-medium text-empire-void">
                      SDR: {currentSdrName}
                    </span>
                  )}
                  {(isAdminOrOwner || isGestorSdr) && (
                    <MultiSelectFilter value={closers} onChange={setClosers} options={filterOptions.closers.map((s) => ({ value: s, label: s === SEM_ATRIBUICAO ? SEM_ATRIBUICAO_LABEL : s }))} placeholder="Closer" />
                  )}
                  {!isAdminOrOwner && !isGestorSdr && currentCloserName && (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-empire-border bg-empire-elevated px-3 py-1.5 text-xs font-medium text-empire-void">
                      Closer: {currentCloserName}
                    </span>
                  )}
                  <MultiSelectFilter value={canais} onChange={setCanais} options={filterOptions.canais.map((c) => ({ value: c.value, label: c.label }))} placeholder="Canal" />
                  <MultiSelectFilter value={mediums} onChange={setMediums} options={filterOptions.mediums.map((m) => ({ value: m.value, label: m.label }))} placeholder="Mídia" />
                  <MultiSelectFilter value={funilTags} onChange={setFunilTags} options={filterOptions.funilTags.map((s) => ({ value: s, label: s }))} placeholder="Funil" />
                  <MultiSelectFilter value={campanhas} onChange={setCampanhas} options={filterOptions.campanhas.map((s) => ({ value: s, label: s }))} placeholder="Campanha" />

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
            <VisaoGeralTab
              opps={filteredOpps}
              revenueRows={revenueRows}
              loading={loading}
            />
          ) : activeTab === 'agendamentos' ? (
            <AgendamentosTab
              opps={filteredOpps}
              revenueRows={revenueRows}
              startDate={startDate}
              endDate={endDate}
              loading={loading}
              globalSdr={sdrs}
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
              pipelineMode="exclude_recuperacao"
            />
          ) : activeTab === 'funil' ? (
            <FunilTab
              opps={filteredOpps}
              revenueRows={revenueRows}
              startDate={startDate}
              endDate={endDate}
              loading={loading}
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
              globalSdr={sdrs}
            />
          ) : activeTab === 'leads_parados' ? (
            <LeadsParadosTab loading={loading} pipelineMode="exclude_recuperacao" />
          ) : activeTab === 'atividades' ? (
            <AtividadesTab
              startDate={startDate}
              endDate={endDate}
              pipelineMode="exclude_recuperacao"
              activePanel={activePanel}
              sdr={sdrs}
            />
          ) : activeTab === 'discagem' ? (
            <DiscagemTab />
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}
