import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useWeeklyReports } from '@/hooks/useWeeklyReports'
import { CohortTab } from './tabs/CohortTab'
import { ProdutividadeTab } from './tabs/ProdutividadeTab'
import { ComparativoTab } from './tabs/ComparativoTab'
import { TendenciasTab } from './tabs/TendenciasTab'
import { AutomacoesTab } from './tabs/AutomacoesTab'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { Users, TrendingUp, GitCompare, BarChart3, Mail } from 'lucide-react'
import { REPORT_MODULE_OPTIONS } from '@/lib/relatorios/moduleOptions'

// ─── Tab definition ───────────────────────────────────────────

// A aba "Configurar Clara" saiu daqui em 2026-08-04 — agora vive em
// /workspace/clara (Administração). Links antigos são redirecionados abaixo.
const TABS = [
  { key: 'cohort', label: 'Cohort', icon: Users },
  { key: 'produtividade', label: 'Produtividade', icon: BarChart3 },
  { key: 'comparativo', label: 'Comparativo', icon: GitCompare },
  { key: 'tendencias', label: 'Tendências', icon: TrendingUp },
  { key: 'automacoes', label: 'Automações', icon: Mail },
] as const

type TabKey = (typeof TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'cohort'

// ─── Module options ───────────────────────────────────────────

const MODULES = REPORT_MODULE_OPTIONS

// ─── Main Page ────────────────────────────────────────────────

export function RelatoriosPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const availableTabs = TABS

  // Tab
  const rawTab = searchParams.get('tab')

  // Link legado /relatorios?tab=clara → nova casa na Administração
  useEffect(() => {
    if (rawTab === 'clara') navigate('/workspace/clara', { replace: true })
  }, [rawTab, navigate])
  const activeTab: TabKey = availableTabs.some((t) => t.key === rawTab) ? (rawTab as TabKey) : DEFAULT_TAB
  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  // Module filter
  const rawModule = searchParams.get('module')
  const activeModule = MODULES.some((m) => m.value === rawModule)
    ? (rawModule as typeof MODULES[number]['value'])
    : 'trafego'
  const setModule = (value: typeof MODULES[number]['value']) => {
    const next = new URLSearchParams(searchParams)
    next.set('module', value)
    setSearchParams(next, { replace: true })
  }

  // Report type derived from tab
  const reportType: 'cohort' | 'produtividade' = activeTab === 'produtividade' ? 'produtividade' : 'cohort'

  const filters = useMemo(
    () => ({
      module: activeModule,
      reportType,
      weeksCount: 12,
    }),
    [activeModule, reportType]
  )

  const { rows, loading, error } = useWeeklyReports(filters)

  return (
    <PageShell
      title="Relatórios"
      description="Visão semanal consolidada por módulo — cohort, produtividade e tendências"
      tabs={
        <PageTabs
          variant="underline"
          tabs={availableTabs.map((t) => ({
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
        {/* Module selector */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-medium text-empire-subtle">Módulo:</span>
          {MODULES.map((m) => (
            <button
              key={m.value}
              onClick={() => setModule(m.value)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-xs font-medium transition-all',
                activeModule === m.value
                  ? 'border-empire-primary/40 bg-empire-primary/10 text-empire-primary'
                  : 'border-empire-border bg-empire-surface text-empire-muted hover:text-empire-void'
              )}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Error state */}
        {error && (
          <div className="rounded-lg border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
            Erro ao carregar dados: {error}
          </div>
        )}

        {/* Tab content */}
        <div key={activeTab}>
          {activeTab === 'cohort' ? (
            <CohortTab rows={rows} loading={loading} />
          ) : activeTab === 'produtividade' ? (
            <ProdutividadeTab rows={rows} loading={loading} />
          ) : activeTab === 'comparativo' ? (
            <ComparativoTab rows={rows} loading={loading} />
          ) : activeTab === 'tendencias' ? (
            <TendenciasTab rows={rows} loading={loading} />
          ) : activeTab === 'automacoes' ? (
            <AutomacoesTab />
          ) : null}
        </div>
      </div>
    </PageShell>
  )
}
