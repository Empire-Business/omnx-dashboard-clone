import { useSearchParams, Navigate } from 'react-router-dom'
import { ListaTab } from './tabs/ListaTab'
import { LimpezaTab } from './tabs/LimpezaTab'
import { InscricoesPage } from '@/pages/inscricoes/InscricoesPage'
import { PageShell } from '@/components/layout/PageShell'
import { PageTabs } from '@/components/layout/PageTabs'
import { usePermissions } from '@/contexts/PermissionsContext'
import { BarChart3, Trash2, FileText, ShieldOff } from 'lucide-react'

const TABS = [
  { key: 'lista', label: 'Lista', icon: BarChart3 },
  { key: 'limpeza', label: 'Limpeza', icon: Trash2 },
  { key: 'inscricoes', label: 'Inscrições de integrações', icon: FileText },
] as const

type TabKey = (typeof TABS)[number]['key']
const DEFAULT_TAB: TabKey = 'lista'
const APP_SLUG = 'leads'

export function LeadsPage() {
  const { hasFeaturePermission } = usePermissions()
  const [searchParams, setSearchParams] = useSearchParams()

  const allowedTabs = TABS.filter((t) => hasFeaturePermission(APP_SLUG, t.key))

  const rawTab = searchParams.get('tab')
  const activeTab: TabKey = allowedTabs.some((t) => t.key === rawTab)
    ? (rawTab as TabKey)
    : (allowedTabs[0]?.key ?? DEFAULT_TAB)

  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', key)
    setSearchParams(next, { replace: true })
  }

  if (rawTab && !allowedTabs.some((t) => t.key === rawTab)) {
    const fallback = allowedTabs[0]?.key ?? DEFAULT_TAB
    return <Navigate to={`/leads?tab=${fallback}`} replace />
  }

  if (allowedTabs.length === 0) {
    return (
      <PageShell title="Leads" description="Você não tem permissão para acessar este app.">
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-empire-muted">
          <ShieldOff className="h-8 w-8 opacity-40" />
          <p className="text-sm">Você não tem permissão para acessar este app.</p>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell
      title="Leads"
      description={
        activeTab === 'lista'
          ? 'Todos os leads com filtros e card detalhado'
          : activeTab === 'inscricoes'
          ? 'Leads capturados pelas integrações de formulário'
          : 'Remover leads de teste que poluem os painéis'
      }
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
        {activeTab === 'lista' ? <ListaTab /> : activeTab === 'inscricoes' ? <InscricoesPage /> : <LimpezaTab />}
      </div>
    </PageShell>
  )
}
