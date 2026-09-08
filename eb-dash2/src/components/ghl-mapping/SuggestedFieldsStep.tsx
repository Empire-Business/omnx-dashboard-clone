import { useMemo, useState } from 'react'
import { Lightbulb, CheckCircle2, XCircle, Archive } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectItem } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  flattenDiscoveryFields,
  inferLogicalName,
  buildExtraFieldLogicalName,
  getLogicalFieldLabel,
  isExtraFieldLogicalName,
} from '@/lib/ghl-mapping'
import type {
  GhlDiscoveryResult,
  GhlFieldMapping,
  GhlFieldMappingTemplate,
} from '@/types/ghl-config'

// Sentinela local do Select — nunca é o logical_name salvo de verdade (que é
// extra.<source>_<slug>, calculado em buildExtraFieldLogicalName).
const EXTRA_OPTION_VALUE = '__extra__'

interface SuggestedFieldsStepProps {
  discoveryResult: GhlDiscoveryResult
  existingFields: GhlFieldMapping[]
  templates: GhlFieldMappingTemplate[]
  fieldValues: Map<string, string | null>
  onFieldChange: (builtKey: string, logicalName: string | null) => void
}

export function SuggestedFieldsStep({
  discoveryResult,
  templates,
  fieldValues,
  onFieldChange,
}: SuggestedFieldsStepProps) {
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<'pending' | 'mapped' | 'none' | 'all'>('pending')

  const allRows = useMemo(() => {
    const discovered = flattenDiscoveryFields(discoveryResult)
    return discovered.map((field) => {
      const currentValue = fieldValues.get(field.builtKey) ?? ''
      const match = inferLogicalName(field.name, field.field_type)
      const isMapped = !!currentValue
      return { field, currentValue, match, isMapped }
    })
  }, [discoveryResult, fieldValues])

  const rows = useMemo(() => {
    return allRows
      .filter(({ field, currentValue, match, isMapped }) => {
        const term = filter.trim().toLowerCase()
        const matchesTerm =
          !term ||
          field.name.toLowerCase().includes(term) ||
          field.key.toLowerCase().includes(term) ||
          (currentValue && currentValue.toLowerCase().includes(term))
        const matchesStatus =
          statusFilter === 'all' ||
          (statusFilter === 'pending' && !isMapped && !!match.logical_name) ||
          (statusFilter === 'mapped' && isMapped) ||
          (statusFilter === 'none' && !isMapped && !match.logical_name)
        return matchesTerm && matchesStatus
      })
      .sort((a, b) => {
        // Mapped first, then suggested, then others
        if (a.isMapped && !b.isMapped) return -1
        if (!a.isMapped && b.isMapped) return 1
        if (a.match.logical_name && !b.match.logical_name) return -1
        if (!a.match.logical_name && b.match.logical_name) return 1
        return a.field.name.localeCompare(b.field.name)
      })
  }, [allRows, filter, statusFilter])

  const mappedCount = allRows.filter((r) => r.isMapped).length
  const suggestionCount = allRows.filter((r) => r.match.logical_name && !r.isMapped).length
  // Pendentes visíveis com o filtro/busca atuais — é sobre elas que a ação em
  // massa atua (assim o botão nunca altera linhas escondidas por um filtro).
  const pendingDisplayedCount = rows.filter((r) => r.match.logical_name && !r.isMapped).length

  const handleAcceptSuggestion = (builtKey: string, logicalName: string | null) => {
    onFieldChange(builtKey, logicalName)
  }

  const handleAcceptAllDisplayed = () => {
    for (const { field, match } of rows) {
      if (match.logical_name && !fieldValues.get(field.builtKey)) {
        onFieldChange(field.builtKey, match.logical_name)
      }
    }
  }

  const handleIgnoreAll = () => {
    for (const { field, match } of allRows) {
      if (match.logical_name && !fieldValues.get(field.builtKey)) {
        onFieldChange(field.builtKey, '')
      }
    }
  }

  return (
    <Card className="overflow-visible">
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-empire-primary" />
              Sugestões automáticas
            </CardTitle>
            <CardDescription className="mt-1">
              Revise somente o significado de cada campo. O sistema cuida dos códigos técnicos.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{mappedCount} campos do GHL mapeados</Badge>
            <Badge variant="outline">{suggestionCount} sugestões pendentes</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Input
            placeholder="Buscar campos..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="sm:max-w-xs"
          />
          <Select
            className="sm:w-52"
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as 'pending' | 'mapped' | 'none' | 'all')}
          >
            <SelectItem value="pending">Sugestões pendentes</SelectItem>
            <SelectItem value="mapped">Já mapeados</SelectItem>
            <SelectItem value="none">Sem sugestão</SelectItem>
            <SelectItem value="all">Todos os campos</SelectItem>
          </Select>
          {pendingDisplayedCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAcceptAllDisplayed}
              className="gap-1"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Aceitar sugestões exibidas ({pendingDisplayedCount})
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleIgnoreAll}
            className="sm:ml-auto text-empire-subtle"
          >
            Ignorar sugestões pendentes
          </Button>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-empire-muted">Nenhum campo encontrado com os filtros atuais.</p>
        ) : (
          <div className="space-y-2">
            {rows.map(({ field, currentValue, match, isMapped }) => {
              const hasSuggestion = !!match.logical_name
              const isIgnored = !isMapped && currentValue === ''

              return (
                <div
                  key={field.builtKey}
                  className={cn(
                    'rounded-xl border p-4 space-y-3',
                    isMapped
                      ? 'border-emerald-500/20 bg-emerald-500/[0.03]'
                      : hasSuggestion
                        ? 'border-empire-primary/20 bg-empire-primary/[0.03]'
                        : 'border-empire-border bg-empire-surface'
                  )}
                >
                  {/* Linha 1: identificação do campo do GHL + status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-semibold text-empire-void">{field.name}</p>
                        <Badge variant="secondary" className="text-[10px]">
                          {field.source === 'contact' ? 'Contato' : 'Oportunidade'}
                        </Badge>
                      </div>
                      <details className="mt-1 text-xs text-empire-muted">
                        <summary className="cursor-pointer select-none">Ver código técnico</summary>
                        <code className="mt-1 inline-block rounded bg-empire-elevated px-1 py-0.5">{field.key}</code>
                      </details>
                    </div>

                    {isMapped && isExtraFieldLogicalName(currentValue) && (
                      <Badge variant="outline" className="shrink-0 text-empire-subtle">
                        <Archive className="mr-1 h-3 w-3" />
                        Extra
                      </Badge>
                    )}
                    {isMapped && !isExtraFieldLogicalName(currentValue) && (
                      <Badge variant="success" className="shrink-0">
                        <CheckCircle2 className="mr-1 h-3 w-3" />
                        Mapeado
                      </Badge>
                    )}
                    {!isMapped && hasSuggestion && (
                      <Badge variant="warning" className="shrink-0">
                        Revisar sugestão
                      </Badge>
                    )}
                    {isIgnored && !hasSuggestion && (
                      <Badge variant="outline" className="shrink-0 text-empire-subtle">
                        <XCircle className="mr-1 h-3 w-3" />
                        Ignorado
                      </Badge>
                    )}
                  </div>

                  {/* Linha 2: onde esse campo mapeia no Empire — sempre em linha própria,
                      com largura total, para nunca ficar espremido junto de outros elementos. */}
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-medium uppercase tracking-wide text-empire-subtle">
                      Usar este campo como
                    </label>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <Select
                        className="w-full"
                        value={currentValue}
                        onValueChange={(v) => {
                          if (v === EXTRA_OPTION_VALUE) {
                            onFieldChange(field.builtKey, buildExtraFieldLogicalName(field))
                            return
                          }
                          onFieldChange(field.builtKey, v || null)
                        }}
                      >
                        <SelectItem value="">Não mapeado</SelectItem>
                        {templates.map((t) => (
                          <SelectItem key={t.logical_name} value={t.logical_name}>
                            {getLogicalFieldLabel(t.logical_name)}
                          </SelectItem>
                        ))}
                        {/* Item "virtual" que reflete a seleção já feita, já que o valor real
                            salvo é extra.<source>_<slug>, não o sentinela EXTRA_OPTION_VALUE —
                            sem isto o Select mostraria em branco para campos já marcados como extra. */}
                        {isExtraFieldLogicalName(currentValue) && (
                          <SelectItem value={currentValue}>
                            Campo extra (não entra em métricas)
                          </SelectItem>
                        )}
                        <SelectItem value={EXTRA_OPTION_VALUE}>
                          + Guardar como campo extra (só exibição, não entra em métricas)
                        </SelectItem>
                      </Select>

                      {hasSuggestion && !isMapped && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAcceptSuggestion(field.builtKey, match.logical_name)}
                          className="shrink-0 gap-1 whitespace-nowrap"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Usar sugestão: {getLogicalFieldLabel(match.logical_name)}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
