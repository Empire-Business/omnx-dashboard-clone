import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { spToday, spDaysAgo, toSPISOStart, toSPISOEnd } from '@/lib/utils/dates'
import { applyRecuperacaoFilter } from '@/lib/constants'
import { useAquisicao } from '@/hooks/useAquisicao'
import { RecuperacaoFilter } from '@/components/ui/RecuperacaoFilter'
import { useDashboardPrefs } from '@/hooks/useDashboardPrefs'
import { retryAsync } from '@/lib/retry'
import type { AquisicaoFilters, AquisicaoFilterOptions } from '@/hooks/useAquisicao'
import type { OppRow, RevenueRow, MetaRow, MetaAccountDailyRow } from '@/hooks/useTrafego'
import { parseTags, isVendaExterna, applyMqlFilter } from '@/hooks/useTrafego'
import { useOrganicInvestments, computeOrganicInvestment } from '@/hooks/useOrganicInvestments'
import { CohortProdToggle } from '@/components/ui/CohortProdToggle'
import { AquisicaoTab } from './tabs/AquisicaoTab'
import { MatrizTab } from './tabs/MatrizTab'
import { LeadsTab } from './tabs/LeadsTab'
import { MatrizEficienciaTab } from '@/components/matriz-eficiencia/MatrizEficienciaTab'
import { BarChart2, TableProperties, List, ChevronDown, Gauge } from 'lucide-react'
import { MultiSelectFilter } from '@/components/ui/MultiSelectFilter'
import { emptyFilter, isFilterActive, SEM_ATRIBUICAO, SEM_ATRIBUICAO_LABEL } from '@/types/filters'
import type { FilterValues } from '@/types/filters'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { DatePicker } from '@/components/ui/date-picker'

const TABS = [
  { key: 'visao-geral', label: 'Visão Geral', icon: BarChart2 },
  { key: 'matriz', label: 'Matriz', icon: TableProperties },
  { key: 'eficiencia', label: 'Eficiência', icon: Gauge },
  { key: 'leads', label: 'Leads', icon: List },
] as const

type TabKey = (typeof TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'visao-geral'

const PRESETS = [
  { label: 'Hoje', fn: () => ({ s: spToday(), e: spToday() }) },
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

const OPP_SELECT = `
  id, contato_id, ghl_opportunity_id, pipeline_name, pipeline_id,
  lost_reason, vendedor_closer, status, sdr_name,
  data_lead_recebido, data_conectado, data_qualificado,
  data_no_show, data_agendamento_reuniao,
  data_realizacao_vendas, data_fechado,
  data_perdido, data_perdido_vendas, data_negociacao,
  data_no_show_vendas, data_agendamento_vendas,
  data_pendencias_preenchimento,
  resumo_ia, percepcao_closer,
  agendamento_origem,
  contatos(
    ghl_id, nome, email, telefone,
    utm_source, utm_medium, utm_campaign, utm_term, utm_content,
    fbclid, gclid,
    tt_source, tt_campaign, tt_medium, tt_term, tt_content,
    owner_name, owner_email, date_created, print_instagram,
    como_nos_conheceu, faturamento_anual, perfil_inteligente,
    tags, contact_source
  )
`

export interface AquisicaoSharedProps {
  filters: AquisicaoFilters
  activePanel: 'cohort' | 'produtividade'
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
  filterOptions: AquisicaoFilterOptions
  funnelNames: string[]
  campaignFunnelMap: Map<string, string[]>
  campaignNameMap: Map<string, string>
  loading: boolean
  error: string | null
  hasPaidTraffic: boolean
  organicInvestment?: number
  producaoOppsRaw: OppRow[]
  producaoRevenueRows: RevenueRow[]
  producaoLoading: boolean
  mediumNameMap?: Map<string, string>
}

export function AquisicaoPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')
  const activeTab: TabKey =
    TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : DEFAULT_TAB

  const setTab = (key: TabKey) => {
    setSearchParams({ tab: key }, { replace: true })
  }

  // ── Filter state ─────────────────────────────────────────
  const [filters, setFilters] = useState<AquisicaoFilters>({
    startDate: spDaysAgo(29),
    endDate: spToday(),
    origin: emptyFilter(),
    subCategory: emptyFilter(),
    channel: emptyFilter(),
    medium: emptyFilter(),
    mqlFilter: 'all',
    funilTags: emptyFilter(),
    campanhas: emptyFilter(),
    sdrs: emptyFilter(),
    closers: emptyFilter(),
  })
  const [activePreset, setActivePreset] = useState<string>('30d')
  const [activePanel, setActivePanel] = useState<'cohort' | 'produtividade'>('cohort')
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth >= 768)

  // ── Filtro de Recuperação (3 estados), salvo por conta ───
  const { recuperacaoMode, setRecuperacaoMode } = useDashboardPrefs()

  // ── Data hook ────────────────────────────────────────────
  const { opps, metaRows, accountDailyRows, revenueRows, filterOptions, funnelNames, campaignFunnelMap, campaignNameMap, mediumNameMap, loading, error, hasPaidTraffic } =
    useAquisicao(filters, recuperacaoMode)

  // ── Investimento orgânico ─ soma ao Meta Ads quando não há filtro de canal ──
  const { investments } = useOrganicInvestments()
  const organicInvestment = useMemo(() => {
    if (isFilterActive(filters.channel)) return 0
    return computeOrganicInvestment(investments, filters.startDate, filters.endDate, null)
  }, [investments, filters.startDate, filters.endDate, filters.channel])

  // ── Produtividade: inline loading ────────────────────────
  const [producaoOppsRaw, setProducaoOpps] = useState<OppRow[]>([])
  const [producaoRevenueRows, setProducaoRevenue] = useState<RevenueRow[]>([])
  const [producaoLoading, setProducaoLoading] = useState(false)
  const [producaoError, setProducaoError] = useState(false)
  const [producaoRetry, setProducaoRetry] = useState(0)

  useEffect(() => {
    if (activePanel !== 'produtividade') return
    let cancelled = false
    setProducaoError(false)
    setProducaoLoading(true)

    async function loadProducao() {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) throw new Error('Conta não encontrada')

        const { startDate, endDate } = filters

        const startISO = toSPISOStart(startDate)
        const endISO = toSPISOEnd(endDate)

        const PAGE_SIZE = 1000
        let allRows: OppRow[] = []
        let page = 0
        while (true) {
          const res = await retryAsync(async () => {
            let oppQuery = supabase
              .from('oportunidades')
              .select(OPP_SELECT)
              .eq('workspace_id', wid)
            oppQuery = applyRecuperacaoFilter(oppQuery, recuperacaoMode)
            const r = await oppQuery
              .order('id', { ascending: true })
              .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
            if (r.error) throw r.error
            return r
          })
          if (cancelled) return
          const pageRows = (res.data ?? []) as unknown as OppRow[]
          allRows = allRows.concat(pageRows)
          if (pageRows.length < PAGE_SIZE) break
          page++
        }

        let dimensionRows = allRows

        if (isFilterActive(filters.origin)) {
          const includeUnknown = filters.origin.include.includes('__unknown__')
          const excludeUnknown = filters.origin.exclude.includes('__unknown__')
          const includeVendaDireta = filters.origin.include.includes('__venda_direta__')
          const excludeVendaDireta = filters.origin.exclude.includes('__venda_direta__')
          const knownIncludes = filters.origin.include.filter((id) => id !== '__unknown__' && id !== '__venda_direta__')
          const knownExcludes = filters.origin.exclude.filter((id) => id !== '__unknown__' && id !== '__venda_direta__')
          const includeSourceSet = new Set(filterOptions.allAssignments.filter((a) => knownIncludes.includes(a.origin_id)).map((a) => a.utm_source))
          const excludeSourceSet = new Set(filterOptions.allAssignments.filter((a) => knownExcludes.includes(a.origin_id)).map((a) => a.utm_source))
          dimensionRows = dimensionRows.filter((r) => {
            // "Venda Direta" é uma origem própria (independe do utm_source), como "Desconhecido".
            if (isVendaExterna(r)) {
              if (excludeVendaDireta) return false
              if (filters.origin.include.length > 0) return includeVendaDireta
              return true
            }
            const src = r.contatos?.utm_source
            const isUnknown = !src || src.trim() === ''
            if (isUnknown) {
              if (excludeUnknown) return false
              if (filters.origin.include.length > 0) return includeUnknown
              return true
            }
            if (excludeSourceSet.has(src)) return false
            if (knownIncludes.length > 0) return includeSourceSet.has(src)
            return true
          })
        }

        if (isFilterActive(filters.subCategory)) {
          const { include, exclude } = filters.subCategory
          dimensionRows = dimensionRows.filter((r) => {
            const src = r.contatos?.utm_source ?? ''
            if (exclude.includes(src)) return false
            if (include.length > 0) return include.includes(src)
            return true
          })
        }

        if (isFilterActive(filters.channel)) {
          const { include, exclude } = filters.channel
          dimensionRows = dimensionRows.filter((r) => {
            const src = r.contatos?.utm_source ?? ''
            if (exclude.includes(src)) return false
            if (include.length > 0) return include.includes(src)
            return true
          })
        }

        if (isFilterActive(filters.medium)) {
          const { include, exclude } = filters.medium
          dimensionRows = dimensionRows.filter((r) => {
            const medium = r.contatos?.utm_medium ?? ''
            if (exclude.includes(medium)) return false
            if (include.length > 0) return include.includes(medium)
            return true
          })
        }

        if (isFilterActive(filters.funilTags)) {
          const { include, exclude } = filters.funilTags
          dimensionRows = dimensionRows.filter((r) => {
            const code = r.contatos?.utm_campaign != null ? String(r.contatos.utm_campaign) : ''
            const funnels = campaignFunnelMap.get(code) ?? []
            if (exclude.length > 0 && funnels.length > 0 && funnels.every((f) => exclude.includes(f))) return false
            if (include.length > 0 && !funnels.some((f) => include.includes(f))) return false
            return true
          })
        }

        if (isFilterActive(filters.campanhas)) {
          dimensionRows = dimensionRows.filter((r) => {
            const code = r.contatos?.utm_campaign != null ? String(r.contatos.utm_campaign) : ''
            const campaignNameFromUtm = campaignNameMap.get(code) ?? ''
            const contactTags = parseTags(r.contatos?.tags)
            const { include, exclude } = filters.campanhas

            const matchesCampaign = (name: string): boolean => {
              if (name.toLowerCase().startsWith('[cp]')) {
                return contactTags.some((t) => t.toLowerCase() === name.toLowerCase())
              }
              return campaignNameFromUtm.toLowerCase() === name.toLowerCase()
            }

            if (exclude.length > 0 && exclude.some((n) => matchesCampaign(n))) return false
            if (include.length > 0) return include.some((n) => matchesCampaign(n))
            return true
          })
        }

        const oppIds = new Set(dimensionRows.map((o) => o.id))
        let rev: RevenueRow[] = []
        if (oppIds.size > 0) {
          const REV_PAGE_SIZE = 1000
          let allRevRows: RevenueRow[] = []
          let revPage = 0
          while (true) {
            const revRes = await retryAsync(async () => {
              const r = await supabase
                .from('vendas_fechamento')
                .select('oportunidade_id, valor_faturado, valor_entrada, pagamentos, data_pagamento_entrada')
                .eq('workspace_id', wid)
                .gte('data_pagamento_entrada', startISO)
                .lte('data_pagamento_entrada', endISO)
                .order('oportunidade_id', { ascending: true })
                .range(revPage * REV_PAGE_SIZE, (revPage + 1) * REV_PAGE_SIZE - 1)
              if (r.error) throw r.error
              return r
            })
            if (cancelled) return
            allRevRows = allRevRows.concat((revRes.data ?? []) as RevenueRow[])
            if ((revRes.data?.length ?? 0) < REV_PAGE_SIZE) break
            revPage++
          }
          rev = allRevRows.filter((r) => oppIds.has(r.oportunidade_id))
        }

        const payMap = new Map(
          rev
            .filter((r) => r.data_pagamento_entrada)
            .map((r) => [r.oportunidade_id, r.data_pagamento_entrada!.slice(0, 10)] as const)
        )
        const rows = dimensionRows.filter((row) => {
          const leadDate = row.data_lead_recebido?.slice(0, 10) ?? null
          const payDate = payMap.get(row.id) ?? null
          return (
            (!!leadDate && leadDate >= startDate && leadDate <= endDate) ||
            (!!row.data_conectado && row.data_conectado >= startDate && row.data_conectado <= endDate) ||
            (!!row.data_agendamento_reuniao && row.data_agendamento_reuniao >= startDate && row.data_agendamento_reuniao <= endDate) ||
            (!!row.data_realizacao_vendas && row.data_realizacao_vendas >= startDate && row.data_realizacao_vendas <= endDate) ||
            (!!payDate && payDate >= startDate && payDate <= endDate)
          )
        })

        if (!cancelled) {
          setProducaoOpps(rows)
          setProducaoRevenue(rev)
        }
      } catch (e) {
        // NÃO engolir em silêncio: falha aqui fazia a tela mostrar "0 vendas"
        // sem aviso. Agora loga e sinaliza erro para a UI (o retryAsync já
        // tentou reexecutar as queries transitórias antes de chegar aqui).
        if (!cancelled) {
          console.error('[AquisicaoPage] falha ao carregar Produtividade (após retries):', e)
          setProducaoError(true)
        }
      } finally {
        if (!cancelled) setProducaoLoading(false)
      }
    }

    void loadProducao()
    return () => { cancelled = true }
  }, [activePanel, filters, filterOptions, campaignFunnelMap, campaignNameMap, recuperacaoMode, producaoRetry])

  // ── Cascading filter options ─────────────────────────────
  const subCategoryOptions = useMemo(() => {
    const knownIncludes = filters.origin.include.filter((id) => id !== '__unknown__')
    if (knownIncludes.length === 0) return []
    const assignmentsForOrigin = filterOptions.allAssignments.filter((a) => knownIncludes.includes(a.origin_id))
    const sources = assignmentsForOrigin.map((a) => a.utm_source)
    return sources.map((src) => {
      const ch = filterOptions.allChannels.find((c) => c.slug === src)
      return { value: src, label: ch ? `${ch.nome} (${src})` : src }
    }).sort((a, b) => a.label.localeCompare(b.label))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters.origin), filterOptions])

  const channelOptions = useMemo(() => {
    let channels = filterOptions.allChannels
    const knownIncludes = filters.origin.include.filter((id) => id !== '__unknown__')
    if (knownIncludes.length > 0) {
      const assignmentsForOrigin = filterOptions.allAssignments.filter((a) => knownIncludes.includes(a.origin_id))
      const sourceSet = new Set(assignmentsForOrigin.map((a) => a.utm_source))
      channels = channels.filter((ch) => sourceSet.has(ch.slug))
    }
    if (filters.subCategory.include.length > 0) {
      channels = channels.filter((ch) => filters.subCategory.include.includes(ch.slug))
    }
    return channels.map((ch) => ({
      value: ch.slug,
      label: ch.nome !== ch.slug ? `${ch.nome} (${ch.slug})` : ch.slug,
    }))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filters.origin), JSON.stringify(filters.subCategory), filterOptions])

  // ── Helpers ──────────────────────────────────────────────
  const setPreset = (label: string, fn: () => { s: string; e: string }) => {
    const { s, e } = fn()
    setFilters((f) => ({ ...f, startDate: s, endDate: e }))
    setActivePreset(label)
  }

  const setOrigin = (v: FilterValues) => {
    setFilters((f) => ({ ...f, origin: v, subCategory: emptyFilter(), channel: emptyFilter() }))
  }

  const setSubCategory = (v: FilterValues) => {
    setFilters((f) => ({ ...f, subCategory: v, channel: emptyFilter() }))
  }

  const clearFilters = () => {
    setFilters((f) => ({ ...f, origin: emptyFilter(), subCategory: emptyFilter(), channel: emptyFilter(), medium: emptyFilter(), mqlFilter: 'all', funilTags: emptyFilter(), campanhas: emptyFilter(), sdrs: emptyFilter(), closers: emptyFilter() }))
  }

  const activeFilterCount = [filters.origin, filters.subCategory, filters.channel, filters.medium, filters.funilTags, filters.campanhas, filters.sdrs, filters.closers].filter(isFilterActive).length + (filters.mqlFilter === 'mql' ? 1 : 0)

  const sharedProps: AquisicaoSharedProps = {
    filters,
    activePanel,
    opps,
    metaRows,
    accountDailyRows,
    revenueRows,
    filterOptions,
    funnelNames,
    campaignFunnelMap,
    campaignNameMap,
    mediumNameMap,
    loading,
    error,
    hasPaidTraffic,
    organicInvestment,
    producaoOppsRaw,
    producaoRevenueRows,
    producaoLoading,
  }

  return (
    <PageShell
      title="Aquisição"
      description="Visão completa de todas as fontes — pago, orgânico, direto e desconhecido"
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
          {/* Toggle Cohort / Produtividade — SEMPRE visível, acima dos filtros */}
          <CohortProdToggle activePanel={activePanel} setActivePanel={setActivePanel} variant="card" />

          {/* Filtro de Recuperação (3 estados, salvo por conta) */}
          <div className="mt-3 rounded-xl border border-empire-border bg-empire-elevated p-4">
            <RecuperacaoFilter value={recuperacaoMode} onChange={setRecuperacaoMode} />
          </div>

          {/* Erro de carregamento da Produtividade — evita mostrar "0" enganoso */}
          {activePanel === 'produtividade' && producaoError && !producaoLoading && (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
              <span>Não foi possível carregar os dados de Produtividade (falha de rede). Os números podem estar incompletos.</span>
              <button
                type="button"
                onClick={() => { setProducaoError(false); setProducaoRetry((n) => n + 1) }}
                className="ml-3 shrink-0 rounded-md border border-red-300 px-3 py-1 text-xs font-semibold hover:bg-red-100"
              >
                Tentar de novo
              </button>
            </div>
          )}

          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-empire-border bg-empire-elevated px-4 py-2.5 transition-colors hover:border-empire-border-strong"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-empire-void">Filtros</span>
              {!filtersOpen && (
                <span className="text-xs font-mono text-empire-subtle">
                  {activePreset || `${filters.startDate} → ${filters.endDate}`}
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
                      <DatePicker value={filters.startDate} onChange={(v) => { setFilters((f) => ({ ...f, startDate: v })); setActivePreset('') }} />
                    </div>
                    <span className="text-xs font-medium text-empire-subtle">até</span>
                    <div className="flex items-center gap-1.5">
                      <DatePicker value={filters.endDate} onChange={(v) => { setFilters((f) => ({ ...f, endDate: v })); setActivePreset('') }} />
                    </div>
                  </div>
                </div>

                {/* Dimension filters */}
                <div className="flex flex-wrap items-start gap-2">
                  {(activeFilterCount > 0 || filters.mqlFilter !== 'all') && (
                    <button
                      onClick={clearFilters}
                      className="flex h-8 items-center gap-1 rounded-md border border-empire-border px-2 py-1.5 text-xs font-medium text-empire-subtle transition-all hover:bg-empire-danger-soft hover:text-empire-danger"
                    >
                      Limpar
                    </button>
                  )}
                  <MultiSelectFilter
                    value={filters.origin}
                    onChange={setOrigin}
                    options={filterOptions.origins.map((o) => ({ value: o.id, label: o.nome }))}
                    placeholder="Origem"
                  />
                  {subCategoryOptions.length > 0 && (
                    <MultiSelectFilter
                      value={filters.subCategory}
                      onChange={setSubCategory}
                      options={subCategoryOptions}
                      placeholder="Sub-categoria"
                    />
                  )}
                  <MultiSelectFilter
                    value={filters.channel}
                    onChange={(v) => setFilters((f) => ({ ...f, channel: v }))}
                    options={channelOptions}
                    placeholder="Canal"
                  />
                  <MultiSelectFilter
                    value={filters.medium}
                    onChange={(v) => setFilters((f) => ({ ...f, medium: v }))}
                    options={Array.from(mediumNameMap.entries()).map(([code, nome]) => ({ value: code, label: nome })).sort((a, b) => a.label.localeCompare(b.label))}
                    placeholder="Mídia"
                  />
                  <MultiSelectFilter
                    value={filters.funilTags}
                    onChange={(v) => setFilters((f) => ({ ...f, funilTags: v }))}
                    options={funnelNames.map((n) => ({ value: n, label: n }))}
                    placeholder="Funil"
                  />
                  <MultiSelectFilter
                    value={filters.campanhas}
                    onChange={(v) => setFilters((f) => ({ ...f, campanhas: v }))}
                    options={[...campaignNameMap.values()].filter(Boolean).sort().map((n) => ({ value: n, label: n }))}
                    placeholder="Campanha"
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

                  {/* Filtro MQL — rótulo "Classificação" para não colidir com o
                      toggle Cohort/Produtividade, que também usa "Modo". */}
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-xs text-empire-subtle">Classificação:</span>
                    <button
                      onClick={() => setFilters((f) => ({ ...f, mqlFilter: f.mqlFilter === 'mql' ? 'all' : 'mql' }))}
                      title='Restringe a lista a leads com a tag "mql" em contatos.tags (classificação do marketing).'
                      className={cn(
                        'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                        filters.mqlFilter === 'mql'
                          ? 'border-empire-primary/40 bg-empire-primary/10 text-empire-primary'
                          : 'border-empire-border bg-empire-surface text-empire-muted hover:text-empire-void'
                      )}
                    >
                      {filters.mqlFilter === 'mql' ? 'Somente MQL' : 'Todos os leads'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tab content */}
        <div key={activeTab}>
          {activeTab === 'visao-geral' && <AquisicaoTab {...sharedProps} />}
          {activeTab === 'matriz' && <MatrizTab {...sharedProps} />}
          {activeTab === 'eficiencia' && (
            <MatrizEficienciaTab
              opps={activePanel === 'produtividade' ? applyMqlFilter(producaoOppsRaw, filters.mqlFilter) : opps}
              revenueRows={activePanel === 'produtividade' ? producaoRevenueRows : revenueRows}
            />
          )}
          {activeTab === 'leads' && (
            <LeadsTab
              opps={opps}
              revenueRows={revenueRows}
              filterOptions={filterOptions}
              campaignFunnelMap={campaignFunnelMap}
              campaignNameMap={campaignNameMap}
              startDate={filters.startDate}
              loading={loading}
            />
          )}
        </div>
      </div>
    </PageShell>
  )
}
