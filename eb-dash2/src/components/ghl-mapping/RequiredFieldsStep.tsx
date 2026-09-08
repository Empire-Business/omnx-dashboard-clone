import { useMemo } from 'react'
import { CheckCircle2, AlertCircle, HelpCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectItem } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { flattenDiscoveryFields, getLogicalFieldLabel } from '@/lib/ghl-mapping'
import type {
  GhlDiscoveryResult,
  GhlFieldMappingTemplate,
} from '@/types/ghl-config'

interface RequiredFieldsStepProps {
  discoveryResult: GhlDiscoveryResult
  templates: GhlFieldMappingTemplate[]
  fieldValues: Map<string, string | null>
  onFieldChange: (builtKey: string, logicalName: string | null) => void
}

// Explicação em linguagem simples do que cada campo obrigatório faz —
// o rótulo sozinho ("ID da oportunidade") não diz por que aquilo importa.
const REQUIRED_FIELD_DESCRIPTIONS: Record<string, string> = {
  opportunity_id:
    'É o código que liga cada lead à negociação certa no GHL. Sem ele, o sistema não consegue saber qual oportunidade pertence a qual lead.',
  pipeline_id_opp:
    'Diz em qual pipeline a oportunidade está. Sem ele, os leads não aparecem nos painéis de acompanhamento.',
}

function getRequiredFieldDescription(logicalName: string): string {
  return (
    REQUIRED_FIELD_DESCRIPTIONS[logicalName] ??
    'Campo essencial para o sistema ligar os dados do GHL aos painéis da OMNX.'
  )
}

export function RequiredFieldsStep({
  discoveryResult,
  templates,
  fieldValues,
  onFieldChange,
}: RequiredFieldsStepProps) {
  const discovered = useMemo(() => flattenDiscoveryFields(discoveryResult), [discoveryResult])

  // Required template fields, split by found / not found
  const rows = useMemo(() => {
    const required = templates.filter((t) => t.is_required)
    return required.map((template) => {
      const found = discovered.find((f) => f.builtKey === template.ghl_field_key)
      const currentValue = found ? (fieldValues.get(found.builtKey) ?? '') : ''
      return { template, found, currentValue }
    })
  }, [templates, discovered, fieldValues])

  const foundCount = rows.filter((r) => r.found).length
  const missingCount = rows.length - foundCount

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-empire-primary" />
              Campos obrigatórios
            </CardTitle>
            <CardDescription className="mt-1">
              Estes dados mantêm o CRM funcionando. Confirme se cada um foi encontrado na sua conta.
            </CardDescription>
          </div>
          <Badge variant={missingCount === 0 ? 'success' : 'warning'}>
            {foundCount}/{rows.length} encontrados
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-xl border border-empire-border bg-empire-surface p-4 text-sm text-empire-muted">
          Estes campos são a ponte entre o GHL e a OMNX: sem eles, o sistema não consegue ligar
          o lead à oportunidade certa, e os painéis ficam incompletos.
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-empire-muted">Nenhum campo obrigatório definido no template.</p>
        ) : (
          rows.map(({ template, found, currentValue }) => (
            <div
              key={template.logical_name}
              className={cn(
                'flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
                found
                  ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
                  : 'border-amber-500/20 bg-amber-500/[0.03]'
              )}
            >
              <div className="flex items-start gap-3">
                {found ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                ) : (
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
                )}
                <div>
                  <p className="text-sm font-semibold text-empire-void">{getLogicalFieldLabel(template.logical_name)}</p>
                  <p className="text-xs text-empire-muted">{getRequiredFieldDescription(template.logical_name)}</p>
                  {!found && (
                    <p className="mt-1 text-xs text-amber-500">
                      Não encontramos este campo na sua conta GHL. Crie um campo personalizado no GHL
                      (em Configurações → Campos personalizados) com este nome e rode a busca de campos
                      novamente. Se preferir, você pode avançar agora e mapear este campo depois.
                    </p>
                  )}
                </div>
              </div>

              {found ? (
                <div className="flex items-center gap-3 sm:min-w-[320px]">
                  <Select
                    value={currentValue}
                    onValueChange={(v) => onFieldChange(found.builtKey, v || null)}
                  >
                    <SelectItem value="">Ignorar este campo</SelectItem>
                    <SelectItem value={template.logical_name}>{getLogicalFieldLabel(template.logical_name)}</SelectItem>
                  </Select>
                  <Badge variant="success" className="hidden sm:inline-flex">Encontrado</Badge>
                </div>
              ) : (
                <div className="flex items-center gap-3 sm:min-w-[320px]">
                  <Select value="" disabled onValueChange={() => {}}>
                    <SelectItem value="">Não encontrado no GHL</SelectItem>
                  </Select>
                  <Badge variant="warning" className="hidden sm:inline-flex">Pendente</Badge>
                </div>
              )}
            </div>
          ))
        )}
        {missingCount > 0 && (
          <p className="text-xs text-empire-muted">
            Você pode avançar mesmo com campos pendentes — eles podem ser mapeados depois,
            sem precisar refazer os outros passos.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
