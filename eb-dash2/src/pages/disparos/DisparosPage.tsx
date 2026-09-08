import { useSearchParams } from 'react-router-dom'
import { LayoutDashboard, Settings } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { DashboardTab } from './tabs/DashboardTab'
import { ConfiguracaoTab } from './tabs/ConfiguracaoTab'
import { usePermissions } from '@/contexts/PermissionsContext'
import { useMemo, useEffect } from 'react'

const ALL_TABS = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'configuracao', label: 'Configuração', icon: Settings },
] as const

type TabKey = (typeof ALL_TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'dashboard'

export function DisparosPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasFeaturePermission } = usePermissions()
  const canAccessConfig = hasFeaturePermission('disparos', 'configuracao')

  const tabs = useMemo(
    () => ALL_TABS.filter((t) => t.key === 'dashboard' || canAccessConfig),
    [canAccessConfig]
  )

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = tabs.some((t) => t.key === rawTab)
    ? (rawTab as TabKey)
    : DEFAULT_TAB

  // Protege a rota /disparos?tab=configuracao contra usuários sem permissão
  useEffect(() => {
    if (rawTab === 'configuracao' && !canAccessConfig) {
      setSearchParams({ tab: DEFAULT_TAB }, { replace: true })
    }
  }, [rawTab, canAccessConfig, setSearchParams])

  const setTab = (key: TabKey) => {
    setSearchParams({ tab: key }, { replace: true })
  }

  return (
    <PageShell
      title="Campanhas WhatsApp"
      description="Campanhas de disparo no WhatsApp mensuradas por tags configuráveis"
      tabs={
        <PageTabs
          variant="underline"
          tabs={tabs.map((t) => ({
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
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'configuracao' && <ConfiguracaoTab />}
      </div>
    </PageShell>
  )
}
