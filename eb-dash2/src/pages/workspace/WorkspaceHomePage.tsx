import { useNavigate } from 'react-router-dom'
import { Users, UserCog, LayoutGrid, ShieldCheck, Plug, KeyRound, Building2, Bot } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { PageShell } from '@/components/layout/PageShell'
import { GhlStatusCard } from '@/components/admin/GhlStatusCard'
import { useGhlIntegrationSettings } from '@/hooks/useGhlIntegrationSettings'
import { useCredentialsStatus } from '@/hooks/useWorkspaceCredentials'
import { useGhlFieldMappings } from '@/hooks/useGhlFieldMappings'
import { useGhlPipelineMappings } from '@/hooks/useGhlPipelineMappings'
import { useGhlStageMappings } from '@/hooks/useGhlStageMappings'
import { useMyAgencies } from '@/hooks/useAgency'

const MANAGEMENT_CARDS = [
  {
    title: 'Pessoas',
    description: 'Membros do workspace e acesso por app.',
    href: '/workspace/users',
    icon: Users,
  },
  {
    title: 'Acesso & Time GHL',
    description: 'Time GHL, convites, papéis e permissões de módulo.',
    href: '/workspace/access',
    icon: UserCog,
  },
  {
    title: 'Apps',
    description: 'Ative ou desative os módulos disponíveis.',
    href: '/workspace/apps',
    icon: LayoutGrid,
  },
  {
    title: 'Permissões',
    description: 'Controle o acesso por papel e overrides por usuário.',
    href: '/workspace/permissions',
    icon: ShieldCheck,
  },
] as const

const INTEGRATION_CARDS = [
  {
    title: 'Conectar GHL',
    description: 'Chave de API, location e mapeamento de campos.',
    href: '/workspace/ghl-config',
    icon: Plug,
  },
  {
    title: 'Integrações',
    description: 'Credenciais Meta Ads, OpenRouter e omnx-desk.',
    href: '/workspace/integracoes',
    icon: KeyRound,
  },
  {
    title: 'Configurar Clara',
    description: 'Modelo de IA, instruções e regras de resposta da Clara.',
    href: '/workspace/clara',
    icon: Bot,
  },
] as const

export function WorkspaceHomePage() {
  const navigate = useNavigate()

  const { data: settings, isLoading: loadingSettings } = useGhlIntegrationSettings()
  const { data: credentials, isLoading: loadingCredentials } = useCredentialsStatus()
  const { data: fields, isLoading: loadingFields } = useGhlFieldMappings()
  const { data: pipelines, isLoading: loadingPipelines } = useGhlPipelineMappings()
  const { data: stages, isLoading: loadingStages } = useGhlStageMappings()
  const { data: agencies } = useMyAgencies()

  const isCredentialConnected = !!credentials?.some((c) => c.provider === 'ghl')
  const isLoading = loadingSettings || loadingCredentials || loadingFields || loadingPipelines || loadingStages
  const hasAgency = (agencies?.length ?? 0) > 0

  return (
    <PageShell
      title="Administração"
      description="Central de gestão do negócio e da plataforma."
    >
      <div className="space-y-8">
        <section>
          <div className="section-label mb-4">Negócio</div>
          <GhlStatusCard
            settings={settings}
            isCredentialConnected={isCredentialConnected}
            fields={fields}
            pipelines={pipelines}
            stages={stages}
            isLoading={isLoading}
          />
        </section>

        <section>
          <div className="section-label mb-4">Gestão</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {MANAGEMENT_CARDS.map((card) => (
              <Card
                key={card.href}
                variant="interactive"
                className="bg-empire-surface"
                onClick={() => navigate(card.href)}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-empire-border bg-empire-elevated">
                      <card.icon className="h-5 w-5 text-empire-primary" />
                    </div>
                    <CardTitle className="text-empire-void">{card.title}</CardTitle>
                  </div>
                  <CardDescription className="mt-2 text-empire-muted">
                    {card.description}
                  </CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div className="section-label mb-4">Integrações</div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {INTEGRATION_CARDS.map((card) => (
              <Card
                key={card.href}
                variant="interactive"
                className="bg-empire-surface"
                onClick={() => navigate(card.href)}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-empire-border bg-empire-elevated">
                      <card.icon className="h-5 w-5 text-empire-primary" />
                    </div>
                    <CardTitle className="text-empire-void">{card.title}</CardTitle>
                  </div>
                  <CardDescription className="mt-2 text-empire-muted">
                    {card.description}
                  </CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            ))}
          </div>
        </section>

        {hasAgency && (
          <section>
            <div className="section-label mb-4">Agência</div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card
                variant="interactive"
                className="bg-empire-surface"
                onClick={() => navigate('/agency/workspaces')}
              >
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-empire-border bg-empire-elevated">
                      <Building2 className="h-5 w-5 text-empire-primary" />
                    </div>
                    <CardTitle className="text-empire-void">Workspaces da agência</CardTitle>
                  </div>
                  <CardDescription className="mt-2 text-empire-muted">
                    Sub-contas vinculadas à sua agência.
                  </CardDescription>
                </CardHeader>
                <CardContent />
              </Card>
            </div>
          </section>
        )}
      </div>
    </PageShell>
  )
}
