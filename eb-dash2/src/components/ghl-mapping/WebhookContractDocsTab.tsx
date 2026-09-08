import { useMemo, useState } from 'react'
import { BookOpen, Code2, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { renderDocsMarkdown } from '@/lib/docs-markdown'
import contratoWebhookMd from '../../../../docs/CONTRATO-WEBHOOK-CRM.md?raw'
import configOmnxDeskMd from '../../../../docs/CONFIG-OMNX-DESK-USUARIO.md?raw'
import specDevOmnxDeskMd from '../../../../docs/OMNX-DESK-INTEGRACAO-SPEC-DEV.md?raw'

/**
 * Exibe dentro do painel os documentos que explicam como os dados devem
 * chegar ao Empire — antes, só existiam como arquivo .md no repositório,
 * sem forma de leitura para quem configura o webhook sem acesso ao GitHub.
 * Conteúdo vem direto dos arquivos-fonte (import ?raw do Vite) para nunca
 * desatualizar em relação a docs/CONTRATO-WEBHOOK-CRM.md,
 * docs/CONFIG-OMNX-DESK-USUARIO.md e docs/OMNX-DESK-INTEGRACAO-SPEC-DEV.md
 * (esta última é a spec para enviar ao programador do omnx-desk).
 */
export function WebhookContractDocsTab() {
  const [doc, setDoc] = useState<'contrato' | 'omnx-desk' | 'spec-dev'>('contrato')

  const contratoHtml = useMemo(() => renderDocsMarkdown(contratoWebhookMd), [])
  const omnxDeskHtml = useMemo(() => renderDocsMarkdown(configOmnxDeskMd), [])
  const specDevHtml = useMemo(() => renderDocsMarkdown(specDevOmnxDeskMd), [])

  return (
    <Card>
      <CardContent className="py-6 space-y-4">
        <Tabs value={doc} onValueChange={(v) => setDoc(v as 'contrato' | 'omnx-desk' | 'spec-dev')}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="contrato" className="gap-2">
              <BookOpen className="h-4 w-4" />
              Contrato de Webhook (leads/CRM)
            </TabsTrigger>
            <TabsTrigger value="omnx-desk" className="gap-2">
              <FileText className="h-4 w-4" />
              Vendas fechadas (omnx-desk)
            </TabsTrigger>
            <TabsTrigger value="spec-dev" className="gap-2">
              <Code2 className="h-4 w-4" />
              Spec técnica (programador)
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contrato">
            <div className="docs-md-root" dangerouslySetInnerHTML={{ __html: contratoHtml }} />
          </TabsContent>

          <TabsContent value="omnx-desk">
            <div className="docs-md-root" dangerouslySetInnerHTML={{ __html: omnxDeskHtml }} />
          </TabsContent>

          <TabsContent value="spec-dev">
            <div className="docs-md-root" dangerouslySetInnerHTML={{ __html: specDevHtml }} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
