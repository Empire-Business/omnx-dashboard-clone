import { PageShell } from '@/components/layout/PageShell'
import { ConfigurarClaraTab } from '@/pages/relatorios/tabs/ConfigurarClaraTab'

/**
 * Configuração da IA da Clara.
 *
 * Antes vivia como aba do app Relatórios (/relatorios?tab=clara). Como o app
 * Relatórios foi ocultado, a configuração passou a morar na Administração
 * (/workspace/clara), acessível apenas a owner/admin via <AdminRoute>.
 */
export function WorkspaceClaraPage() {
  return (
    <PageShell
      title="Configurar Clara"
      description="Modelo de IA, instruções persistentes e regras de resposta da Clara."
    >
      <ConfigurarClaraTab />
    </PageShell>
  )
}
