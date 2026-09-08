import { useSearchParams, Navigate } from 'react-router-dom'
import { Trophy, Library, LayoutGrid, FlaskConical, LayoutDashboard, ShieldOff } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { usePermissions } from '@/contexts/PermissionsContext'
import { RankingTab } from './tabs/RankingTab'
import { BibliotecaTab } from './tabs/BibliotecaTab'
import { KanbanTab } from './tabs/KanbanTab'
import { TestesTab } from './tabs/TestesTab'
import { DashboardTab } from './tabs/DashboardTab'

const TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'ranking', label: 'Ranking', icon: Trophy },
  { key: 'biblioteca', label: 'Biblioteca', icon: Library },
  { key: 'kanban', label: 'Kanban', icon: LayoutGrid },
  { key: 'testes', label: 'Testes', icon: FlaskConical },
] as const

type TabKey = (typeof TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'dashboard'
const APP_SLUG = 'criativos'

export function CriativosPage() {
  const { hasFeaturePermission } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  const allowedTabs = TABS.filter((t) => hasFeaturePermission(APP_SLUG, t.key))

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = allowedTabs.some((t) => t.key === rawTab)
    ? (rawTab as TabKey)
    : (allowedTabs[0]?.key ?? DEFAULT_TAB)

  const setTab = (key: TabKey) => {
    setSearchParams({ tab: key }, { replace: true })
  }

  if (rawTab && !allowedTabs.some((t) => t.key === rawTab)) {
    const fallback = allowedTabs[0]?.key ?? DEFAULT_TAB
    return <Navigate to={`/criativos?tab=${fallback}`} replace />
  }

  if (allowedTabs.length === 0) {
    return (
      <PageShell title="Criativos" description="Você não tem permissão para acessar este app.">
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-empire-muted">
          <ShieldOff className="h-8 w-8 opacity-40" />
          <p className="text-sm">Você não tem permissão para acessar este app.</p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Criativos"
      description="Controle e teste de criativos de anúncios"
      tabs={
        <PageTabs
          variant="underline"
          tabs={allowedTabs.map((t) => ({
            label: t.label,
            value: t.key,
            icon: t.icon,
            active: activeTab === t.key,
            onClick: () => setTab(t.key),
          }))}
        />
      }
    >
      <div key={activeTab}>
        {activeTab === 'ranking' && <RankingTab />}
        {activeTab === 'biblioteca' && <BibliotecaTab />}
        {activeTab === 'kanban' && <KanbanTab />}
        {activeTab === 'testes' && <TestesTab />}
        {activeTab === 'dashboard' && <DashboardTab />}
      </div>
    </PageShell>
  )
}
