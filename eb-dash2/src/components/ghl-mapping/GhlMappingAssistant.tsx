import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, CircleHelp, Loader2, Sparkles } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { GhlMappingChatInput } from './GhlMappingChatInput'
import { GhlMappingProposalReview } from './GhlMappingProposalReview'
import { useGhlDiscovery } from '@/hooks/useGhlDiscovery'
import { useAiGhlMapping } from '@/hooks/useAiGhlMapping'
import { useSaveGhlFieldMappings } from '@/hooks/useGhlMappings'
import type {
  GhlDiscoveryResult,
  GhlFieldMapping,
  GhlPipelineMapping,
  GhlStageMapping,
  GhlFieldMappingTemplate,
  GhlMappingProposal,
} from '@/types/ghl-config'

interface GhlMappingAssistantProps {
  existingFields: GhlFieldMapping[]
  existingPipelines: GhlPipelineMapping[]
  existingStages: GhlStageMapping[]
  templates: GhlFieldMappingTemplate[]
  onOpenAdvanced: () => void
}

type AssistantStep = 'start' | 'discovery' | 'select-field' | 'describe-field' | 'proposal' | 'all-mapped'

interface PendingField {
  key: string
  name: string
  source: 'contact' | 'opportunity'
}

function buildFieldKeyLocal(source: 'contact' | 'opportunity', key: string): string {
  return source === 'opportunity' ? `{{opportunity.${key}}}` : key
}

function computePendingFields(
  discovery: GhlDiscoveryResult,
  existingFields: GhlFieldMapping[],
): PendingField[] {
  const mappedFieldKeys = new Set(existingFields.map((field) => field.ghl_field_key).filter(Boolean))

  return [
    ...discovery.contact_custom_fields.map((field) => ({
      key: buildFieldKeyLocal('contact', field.key),
      name: field.name,
      source: 'contact' as const,
    })),
    ...discovery.opportunity_custom_fields.map((field) => ({
      key: buildFieldKeyLocal('opportunity', field.key),
      name: field.name,
      source: 'opportunity' as const,
    })),
  ].filter((field) => !mappedFieldKeys.has(field.key))
}

export function GhlMappingAssistant({
  existingFields,
  existingPipelines,
  existingStages,
  templates,
  onOpenAdvanced,
}: GhlMappingAssistantProps) {
  const [step, setStep] = useState<AssistantStep>('start')
  const [discoveryResult, setDiscoveryResult] = useState<GhlDiscoveryResult | null>(null)
  const [pendingFields, setPendingFields] = useState<PendingField[]>([])
  const [selectedField, setSelectedField] = useState<PendingField | null>(null)
  const [proposal, setProposal] = useState<GhlMappingProposal | null>(null)

  const discovery = useGhlDiscovery()
  const aiMapping = useAiGhlMapping()
  const saveFields = useSaveGhlFieldMappings()
  const isBusy = discovery.isPending || aiMapping.isPending || saveFields.isPending
  const hasMappings = existingFields.length > 0 || existingPipelines.length > 0 || existingStages.length > 0

  const handleDiscover = useCallback(async () => {
    setStep('discovery')
    setProposal(null)
    setSelectedField(null)

    try {
      const result = await discovery.mutateAsync({})
      const fields = computePendingFields(result, existingFields)
      setDiscoveryResult(result)
      setPendingFields(fields)
      setStep(fields.length > 0 ? 'select-field' : 'all-mapped')
    } catch {
      setStep('start')
    }
  }, [discovery, existingFields])

  const handleAnalyze = useCallback(async (userDescription: string) => {
    if (!discoveryResult || !selectedField) return

    try {
      const result = await aiMapping.mutateAsync({
        userDescription,
        discoveryResult,
        target: {
          kind: 'field',
          source: selectedField.source,
          key: selectedField.key,
        },
      })
      setProposal(result.proposal)
      setStep('proposal')
    } catch {
      setStep('describe-field')
    }
  }, [aiMapping, discoveryResult, selectedField])

  const handleSave = useCallback(async () => {
    if (!proposal || !discoveryResult || !selectedField) return

    const fieldRows = proposal.fields
      .filter((field) => field.ghl_field_key === selectedField.key)
      .map((field) => {
        const discovered = selectedField.source === 'contact'
          ? discoveryResult.contact_custom_fields.find((item) => buildFieldKeyLocal('contact', item.key) === field.ghl_field_key)
          : discoveryResult.opportunity_custom_fields.find((item) => buildFieldKeyLocal('opportunity', item.key) === field.ghl_field_key)
        const template = templates.find((item) => item.logical_name === field.logical_name)
        if (!discovered || !template) return null

        return {
          logical_name: field.logical_name,
          ghl_field_key: field.ghl_field_key,
          ghl_field_id: discovered.id,
          field_type: template.field_type ?? discovered.field_type ?? 'text',
          variations: [field.ghl_field_key],
          is_required: template.is_required,
          enabled: true,
        }
      })
      .filter((row): row is NonNullable<typeof row> => row !== null)

    if (fieldRows.length === 0) {
      toast.error('A sugestão não corresponde ao campo selecionado. Tente explicar o campo novamente.')
      return
    }

    try {
      await saveFields.mutateAsync({ mappings: fieldRows })
      toast.success(`Campo “${selectedField.name}” mapeado com sucesso`)
      setPendingFields((current) => current.filter((field) => field.key !== selectedField.key))
      setProposal(null)
      setSelectedField(null)
      setStep('select-field')
    } catch {
      // Erros já são exibidos pelo hook.
    }
  }, [discoveryResult, proposal, saveFields, selectedField, templates])

  const handleReset = useCallback(() => {
    setStep('start')
    setProposal(null)
    setSelectedField(null)
    setPendingFields([])
    setDiscoveryResult(null)
  }, [])

  return (
    <div className="space-y-6">
      {hasMappings && step === 'start' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Mapeamentos atuais
            </CardTitle>
            <CardDescription>Você pode detectar novos campos sem alterar o que já está salvo.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant="secondary">{existingFields.length} campos</Badge>
            <Badge variant="secondary">{existingPipelines.length} pipelines</Badge>
            <Badge variant="secondary">{existingStages.length} stages</Badge>
          </CardContent>
        </Card>
      )}

      {step === 'start' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-empire-primary" />
              Vamos encontrar seus campos primeiro
            </CardTitle>
            <CardDescription>
              Em seguida, você escolhe um campo por vez e explica para que ele serve. A IA sugere apenas a categoria daquele campo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button type="button" onClick={handleDiscover} disabled={isBusy}>
              {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Buscar campos no GHL
            </Button>
            <p className="text-xs text-empire-subtle">Isso não salva nem altera nada no GHL.</p>
          </CardContent>
        </Card>
      )}

      {step === 'discovery' && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-empire-primary" />
            <p className="mt-4 text-sm font-medium text-empire-void">Lendo os campos da sua conta no GHL...</p>
            <p className="mt-1 text-xs text-empire-subtle">Nenhum mapeamento será salvo nesta etapa.</p>
          </CardContent>
        </Card>
      )}

      {step === 'select-field' && (
        <FieldSelection
          fields={pendingFields}
          onSelect={(field) => {
            setSelectedField(field)
            setProposal(null)
            setStep('describe-field')
          }}
          onReset={handleReset}
          onOpenAdvanced={onOpenAdvanced}
        />
      )}

      {step === 'describe-field' && selectedField && (
        <>
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep('select-field')} disabled={isBusy}>
            Escolher outro campo
          </Button>
          <GhlMappingChatInput fieldName={selectedField.name} onSubmit={handleAnalyze} isLoading={isBusy} disabled={isBusy} />
        </>
      )}

      {step === 'proposal' && proposal && discoveryResult && selectedField && (
        <GhlMappingProposalReview
          proposal={proposal}
          discoveryResult={discoveryResult}
          fieldName={selectedField.name}
          fieldSource={selectedField.source}
          onSave={handleSave}
          onBack={() => setStep('describe-field')}
          onOpenAdvanced={onOpenAdvanced}
          isLoading={isBusy}
        />
      )}

      {step === 'all-mapped' && discoveryResult && (
        <AllMappedCard discoveryResult={discoveryResult} onBack={handleReset} />
      )}
    </div>
  )
}

function FieldSelection({
  fields,
  onSelect,
  onReset,
  onOpenAdvanced,
}: {
  fields: PendingField[]
  onSelect: (field: PendingField) => void
  onReset: () => void
  onOpenAdvanced: () => void
}) {
  const [search, setSearch] = useState('')

  if (fields.length === 0) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="py-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-3 font-medium text-emerald-600">Todos os campos detectados já foram mapeados.</p>
          <Button type="button" variant="outline" className="mt-5" onClick={onReset}>Buscar novamente</Button>
        </CardContent>
      </Card>
    )
  }

  const term = search.trim().toLowerCase()
  const visibleFields = term ? fields.filter((f) => f.name.toLowerCase().includes(term)) : fields

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Qual campo você quer organizar agora?</CardTitle>
        <CardDescription>
          Escolha um campo. Na próxima tela, basta explicar para que ele é usado no seu processo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Buscar campo pelo nome..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:max-w-xs"
        />
        {visibleFields.length === 0 ? (
          <p className="text-sm text-empire-muted">Nenhum campo encontrado com a busca atual.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {visibleFields.map((field) => (
              <button
                key={field.key}
                type="button"
                onClick={() => onSelect(field)}
                className="flex min-h-16 items-center justify-between rounded-xl border border-empire-border bg-empire-surface px-4 py-3 text-left transition-colors hover:border-empire-primary hover:bg-empire-elevated"
              >
                <span className="font-medium text-empire-void">{field.name}</span>
                <Badge variant="outline">{field.source === 'contact' ? 'Contato' : 'Oportunidade'}</Badge>
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>Buscar novamente</Button>
          <Button type="button" variant="ghost" size="sm" onClick={onOpenAdvanced}>
            <CircleHelp className="mr-2 h-4 w-4" />
            Prefiro o mapeamento guiado
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AllMappedCard({ discoveryResult, onBack }: { discoveryResult: GhlDiscoveryResult; onBack: () => void }) {
  const totalFields = discoveryResult.contact_custom_fields.length + discoveryResult.opportunity_custom_fields.length
  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        <p className="mt-4 text-base font-semibold text-emerald-600">Tudo certo! Não há campos novos para organizar.</p>
        <p className="mt-2 max-w-md text-sm text-empire-subtle">Encontramos {totalFields} campos no GHL e todos já estão mapeados.</p>
        <Button type="button" variant="outline" onClick={onBack} className="mt-6">Voltar</Button>
      </CardContent>
    </Card>
  )
}
