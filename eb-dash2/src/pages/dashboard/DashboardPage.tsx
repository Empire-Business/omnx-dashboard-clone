import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { spToday, spDaysAgo } from '@/lib/utils/dates'
import { useTrafego, applyMqlFilter } from '@/hooks/useTrafego'
import type { TrafegoFilters, OppRow, MetaRow, MetaAccountDailyRow, RevenueRow, FilterOptions, SyncStatus } from '@/hooks/useTrafego'
import { emptyFilter } from '@/types/filters'
import type { RecuperacaoMode } from '@/lib/constants'
import { useProducao } from '@/hooks/useProducao'
import { useDashboardPrefs } from '@/hooks/useDashboardPrefs'
import { RecuperacaoFilter } from '@/components/ui/RecuperacaoFilter'
import { TrafegoTab } from './tabs/TrafegoTab'
import { MatrizTab } from './tabs/MatrizTab'
import { LeadsTab } from './tabs/LeadsTab'
import { MatrizEficienciaTab } from '@/components/matriz-eficiencia/MatrizEficienciaTab'
import { FilterBar } from '@/components/dashboard'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { BarChart2, TableProperties, List, Gauge } from 'lucide-react'

const TABS = [
  { key: 'painel-cohort', label: 'Visão geral', icon: BarChart2 },
  { key: 'matriz', label: 'Matriz', icon: TableProperties },
  { key: 'eficiencia', label: 'Eficiência', icon: Gauge },
  { key: 'leads', label: 'Leads', icon: List },
] as const

type TabKey = (typeof TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'painel-cohort'

const PRESETS = [
  { label: 'Hoje', fn: () => ({ s: spToday(), e: spToday() }) },
  { label: 'Ontem', fn: () => ({ s: spDaysAgo(1), e: spDaysAgo(1) }) },
  { label: '7d', fn: () => ({ s: spDaysAgo(6), e: spToday() }) },
  { label: '30d', fn: () => ({ s: spDaysAgo(29), e: spToday() }) },
  {
    label: 'Este mes',
    fn: () => {
      const now = new Date()
      const fmt = (x: Date) => x.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      return { s: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), e: fmt(new Date(now.getFullYear(), now.getMonth() + 1, 0)) }
    },
  },
  {
    label: 'Mes anterior',
    fn: () => {
      const now = new Date()
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      const fmt = (x: Date) =>
        x.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
      return { s: fmt(d), e: fmt(last) }
    },
  },
]

export interface TrafegoSharedProps {
  filters: TrafegoFilters
  activePanel: 'cohort' | 'produtividade'
  opps: OppRow[]
  metaRows: MetaRow[]
  accountDailyRows: MetaAccountDailyRow[]
  revenueRows: RevenueRow[]
  filterOptions: FilterOptions
  syncStatus: SyncStatus
  loading: boolean
  error: string | null
  missingPageCodeFunnel: boolean
  missingCampaignMapping: boolean
  producaoOppsRaw: OppRow[]
  recuperacaoMode: RecuperacaoMode
  producaoRevenueRows: RevenueRow[]
}

export function DashboardPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = searchParams.get('tab')

  const activeTab: TabKey =
    TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : DEFAULT_TAB

  const setTab = (key: TabKey) => {
    setSearchParams({ tab: key }, { replace: true })
  }

  // ── Filter state ─────────────────────────────────────────
  const [filters, setFilters] = useState<TrafegoFilters>({
    startDate: spDaysAgo(29),
    endDate: spToday(),
    campaigns: emptyFilter(),
    adsets: emptyFilter(),
    ads: emptyFilter(),
    channels: emptyFilter(),
    mediums: emptyFilter(),
    funilTags: emptyFilter(),
    cpTags: emptyFilter(),
    mqlFilter: 'all',
    sdrs: emptyFilter(),
    closers: emptyFilter(),
    metaAccountId: null, // Fase 15: null = Todas as contas Meta (somado)
  })
  const [activePreset, setActivePreset] = useState<string>('30d')
  const [activePanel, setActivePanel] = useState<'cohort' | 'produtividade'>('cohort')
  const [filtersOpen, setFiltersOpen] = useState(() => window.innerWidth >= 768)

  // Filtro de Recuperação — mesma preferência por conta usada em Aquisição e Vendas.
  // Sem isto, Tráfego escondia vendas de Recuperação mesmo com o usuário pedindo pra incluir.
  const { recuperacaoMode, setRecuperacaoMode } = useDashboardPrefs()

  // ── Data hooks ───────────────────────────────────────────
  const {
    opps,
    metaRows,
    accountDailyRows,
    revenueRows,
    filterOptions,
    syncStatus,
    loading,
    error,
    missingPageCodeFunnel,
    missingCampaignMapping,
  } = useTrafego(filters, recuperacaoMode)

  const {
    opps: producaoOppsRaw,
    revenueRows: producaoRevenueRows,
  } = useProducao(filters, activePanel === 'produtividade', recuperacaoMode)

  const sharedProps: TrafegoSharedProps = {
    filters,
    activePanel,
    opps,
    metaRows,
    accountDailyRows,
    revenueRows,
    filterOptions,
    syncStatus,
    loading,
    error,
    missingPageCodeFunnel,
    missingCampaignMapping,
    producaoOppsRaw,
    producaoRevenueRows,
    recuperacaoMode,
  }

  return (
    <PageShell
      title="Tráfego"
      description="Performance de mídia paga, funil de conversão e métricas de receita"
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
        {/* Filtro de Recuperação (3 estados, salvo por conta) — igual a Aquisição/Vendas */}
        <div className="rounded-xl border border-empire-border bg-empire-elevated p-4">
          <RecuperacaoFilter value={recuperacaoMode} onChange={setRecuperacaoMode} />
        </div>

        {/* Filters — above tabs */}
        <FilterBar
          filters={filters}
          setFilters={setFilters}
          filterOptions={filterOptions}
          activePreset={activePreset}
          setActivePreset={setActivePreset}
          activePanel={activePanel}
          setActivePanel={setActivePanel}
          syncStatus={syncStatus}
          filtersOpen={filtersOpen}
          setFiltersOpen={setFiltersOpen}
          missingCampaignMapping={missingCampaignMapping}
          loading={loading}
          presets={PRESETS}
        />

        {/* Tab content */}
        <div key={activeTab}>
          {activeTab === 'painel-cohort' && <TrafegoTab {...sharedProps} />}
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
              startDate={filters.startDate}
              loading={loading}
            />
          )}
        </div>
      </div>
    </PageShell>
  )
}
