import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bot, Settings } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { usePermissions } from '@/contexts/PermissionsContext'
import { AuditoriaTab } from './tabs/AuditoriaTab'
import { ConfiguracaoTab } from './tabs/ConfiguracaoTab'

const ALL_TABS = [
  { key: 'auditoria', label: 'Auditoria IA', icon: Bot },
  { key: 'configuracao', label: 'Configuração', icon: Settings },
] as const

type TabKey = (typeof ALL_TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'auditoria'

export function SdrIaPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { hasFeaturePermission } = usePermissions()
  const canAccessConfig = hasFeaturePermission('sdr-ia', 'configuracao')

  const tabs = useMemo(
    () => ALL_TABS.filter((t) => t.key === 'auditoria' || canAccessConfig),
    [canAccessConfig]
  )

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = tabs.some((t) => t.key === rawTab)
    ? (rawTab as TabKey)
    : DEFAULT_TAB

  // Protege a rota /sdr-ia?tab=configuracao contra usuários sem permissão
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
      title={
        <span className="inline-flex items-center gap-3">
          <Bot className="h-7 w-7 text-empire-primary" />
          SDR IA
        </span>
      }
      description="Auditoria e monitoramento do atendimento automatizado da SDR IA"
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
        {activeTab === 'auditoria' && <AuditoriaTab />}
        {activeTab === 'configuracao' && <ConfiguracaoTab />}
      </div>
    </PageShell>
  )
}
