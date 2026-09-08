import { useSearchParams, Navigate } from 'react-router-dom'
import { CodsUtmTab } from './tabs/CodsUtmTab'
import { OrigemTab } from './tabs/OrigemTab'
import { AnunciosTab } from './tabs/AnunciosTab'
import { OrganicoTab } from './tabs/OrganicoTab'
import { FunisTab } from './tabs/FunisTab'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { usePermissions } from '@/contexts/PermissionsContext'
import { Share2, BarChart3, Megaphone, Users, TrendingUp, ShieldOff } from 'lucide-react'

const TABS = [
  { key: 'cods_utm', label: 'CODS UTM', icon: Share2, featureKey: 'cods-utm' },
  { key: 'origem', label: 'Origem', icon: BarChart3, featureKey: 'origem' },
  { key: 'anuncios', label: 'Anúncios', icon: Megaphone, featureKey: 'anuncios' },
  { key: 'organico', label: 'Orgânico', icon: Users, featureKey: 'organico' },
  { key: 'funis', label: 'Funis', icon: TrendingUp, featureKey: 'funis' },
] as const

type TabKey = (typeof TABS)[number]['key']

const DEFAULT_TAB: TabKey = 'cods_utm'
const APP_SLUG = 'traqueamento'

function TabContent({ tab, canEdit }: { tab: TabKey; canEdit: boolean }) {
  switch (tab) {
    case 'cods_utm':
      return <CodsUtmTab canEdit={canEdit} />
    case 'origem':
      return <OrigemTab canEdit={canEdit} />
    case 'anuncios':
      return <AnunciosTab canEdit={canEdit} />
    case 'organico':
      return <OrganicoTab canEdit={canEdit} />
    case 'funis':
      return <FunisTab canEdit={canEdit} />
    default:
      return null
  }
}

export function TraqueamentoPage() {
  const { hasFeaturePermission, hasFeatureEditPermission } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  const allowedTabs = TABS.filter((t) => hasFeaturePermission(APP_SLUG, t.featureKey))

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = allowedTabs.some((t) => t.key === rawTab)
    ? (rawTab as TabKey)
    : (allowedTabs[0]?.key ?? DEFAULT_TAB)

  const activeFeatureKey = TABS.find((t) => t.key === activeTab)?.featureKey ?? 'cods-utm'
  const canEdit = hasFeatureEditPermission(APP_SLUG, activeFeatureKey)

  const setTab = (key: TabKey) => {
    setSearchParams({ tab: key }, { replace: true })
  }

  if (rawTab && !allowedTabs.some((t) => t.key === rawTab)) {
    const fallback = allowedTabs[0]?.key ?? DEFAULT_TAB
    return <Navigate to={`/traqueamento?tab=${fallback}`} replace />
  }

  if (allowedTabs.length === 0) {
    return (
      <PageShell title="Traqueamento" description="Você não tem permissão para acessar este app.">
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-empire-muted">
          <ShieldOff className="h-8 w-8 opacity-40" />
          <p className="text-sm">Você não tem permissão para acessar este app.</p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Traqueamento"
      description="Configuração de parâmetros UTM, anúncios e funis de conversão"
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
        <TabContent tab={activeTab} canEdit={canEdit} />
      </div>
    </PageShell>
  )
}
