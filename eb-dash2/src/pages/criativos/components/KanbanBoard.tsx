import { useCallback, useMemo, useState } from 'react'
import { LayoutGrid, Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  useCriativosList,
  useUpdateCreativeStatus,
  useUpdateCreativeApproval,
  useBulkUpdateCreativeStatus,
} from '@/hooks/useCriativos'
import { CREATIVE_STATUSES } from '@/types/creatives'
import { KanbanColumn } from './KanbanColumn'
import type { NotionCreative } from '@/hooks/useCriativos'

const SOURCE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'notion', label: 'Notion' },
  { value: 'native', label: 'Nativo' },
  { value: 'import', label: 'Import' },
]

interface KanbanBoardProps {
  canEdit?: boolean
}

export function KanbanBoard({ canEdit = true }: KanbanBoardProps) {
  const { data: creatives, isLoading } = useCriativosList('paid')
  const { mutate: updateStatus, isPending: isUpdatingStatus } = useUpdateCreativeStatus()
  const { mutate: updateApproval, isPending: isUpdatingApproval } = useUpdateCreativeApproval()
  const bulkUpdateStatus = useBulkUpdateCreativeStatus()
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  // BUG-06, reunião de 2026-08-28: seleção múltipla para mover vários cards de uma vez.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDragActive, setIsDragActive] = useState(false)

  const isUpdating = isUpdatingStatus || isUpdatingApproval || bulkUpdateStatus.isPending

  const filteredCreatives = useMemo(() => {
    return (creatives ?? []).filter((creative: NotionCreative) => {
      const matchesSource = sourceFilter === 'all' || creative.source === sourceFilter
      const query = search.trim().toLowerCase()
      const matchesSearch =
        !query ||
        (creative.name ?? '').toLowerCase().includes(query) ||
        (creative.external_id ?? '').toLowerCase().includes(query)
      return matchesSource && matchesSearch
    })
  }, [creatives, sourceFilter, search])

  const grouped = useMemo(() => {
    const map = new Map<string, NotionCreative[]>()
    for (const status of CREATIVE_STATUSES) {
      map.set(status.value, [])
    }
    for (const creative of filteredCreatives) {
      const status = creative.status ?? 'ideia'
      const list = map.get(status) ?? []
      list.push(creative)
      map.set(status, list)
    }
    return map
  }, [filteredCreatives])

  const byId = useMemo(() => {
    return new Map(filteredCreatives.map((c) => [c.id, c]))
  }, [filteredCreatives])

  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  const handleToggleSelected = useCallback((creative: NotionCreative) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(creative.id)) next.delete(creative.id)
      else next.add(creative.id)
      return next
    })
  }, [])

  // Recebe os ids que vieram no arrasto (1 card, ou a seleção inteira).
  const handleMove = useCallback(
    (creativeIds: string[], newStatus: string) => {
      if (!canEdit) return
      // Só move quem existe na visão atual e ainda não está na coluna de destino.
      const ids = creativeIds.filter((id) => {
        const creative = byId.get(id)
        return creative != null && creative.status !== newStatus
      })
      if (ids.length === 0) return

      if (ids.length === 1) {
        updateStatus({ id: ids[0], status: newStatus })
      } else {
        bulkUpdateStatus.mutate({ ids, status: newStatus })
      }
      clearSelection()
    },
    [byId, canEdit, updateStatus, bulkUpdateStatus, clearSelection],
  )

  const handleApproveRoteiro = (creative: NotionCreative) => {
    if (!canEdit) return
    const nextTags = (creative.tags ?? []).filter((t) => t !== 'roteiro-em-aprovacao')
    if (!nextTags.includes('roteiro-aprovado')) {
      nextTags.push('roteiro-aprovado')
    }
    updateApproval({ id: creative.id, input: { tags: nextTags } })
    // Roteiro aprovado => automaticamente vai para edição (produzindo)
    if (creative.status !== 'produzindo') {
      updateStatus({ id: creative.id, status: 'produzindo' })
    }
  }

  const handleRequestRevision = (creative: NotionCreative, observation: string) => {
    if (!canEdit) return
    const nextTags = (creative.tags ?? []).filter((t) => t !== 'roteiro-em-aprovacao')
    if (!nextTags.includes('revisao-solicitada')) {
      nextTags.push('revisao-solicitada')
    }
    updateApproval({
      id: creative.id,
      input: { tags: nextTags, observations: observation },
    })
  }

  if (isLoading) {
    return (
      <Card variant="default" className="animate-fade-in-up">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5 text-primary" />
            Produção — Kanban
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-[180px]" />
          </div>
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[400px] min-w-[260px] flex-1" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if ((creatives ?? []).length === 0) {
    return (
      <Card variant="default" className="animate-fade-in-up">
        <CardContent className="py-12">
          <EmptyState
            icon={LayoutGrid}
            title="Nenhum criativo no Kanban"
            description="Cadastre ou sincronize criativos na aba Biblioteca para começar."
          />
        </CardContent>
      </Card>
    )
  }

  const selectedCount = selectedIds.size

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-2">
          <LayoutGrid className="h-5 w-5 text-primary" />
          Produção — Kanban
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-empire-subtle" />
            <Input
              variant="default"
              placeholder="Buscar por nome ou código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-[200px]">
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectContent>
                {SOURCE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {canEdit && (
          <p className="text-xs text-empire-subtle">
            Arraste um card para outra coluna. Para mover vários de uma vez, marque os
            checkboxes (ou Ctrl/Cmd + clique) e arraste qualquer card marcado.
          </p>
        )}

        {/* Barra de ação da seleção múltipla. Também é o caminho sem arrasto — útil em
            telas de toque, onde o drag-and-drop HTML5 não funciona. */}
        {canEdit && selectedCount > 0 && (
          <div className="flex flex-col gap-3 rounded-xl border border-empire-primary/40 bg-empire-primary/5 p-3 sm:flex-row sm:items-center">
            <span className="text-sm font-medium text-empire-void">
              {selectedCount} {selectedCount === 1 ? 'criativo selecionado' : 'criativos selecionados'}
            </span>
            <div className="w-full sm:w-[220px]">
              <Select
                value=""
                onValueChange={(status) => handleMove(Array.from(selectedIds), status)}
                placeholder="Mover para..."
                disabled={isUpdating}
              >
                <SelectContent>
                  {CREATIVE_STATUSES.map((status) => (
                    <SelectItem key={status.value} value={status.value}>
                      {status.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="ghost" size="sm" onClick={clearSelection} className="sm:ml-auto">
              <X className="mr-1 h-4 w-4" />
              Limpar seleção
            </Button>
          </div>
        )}

        <div className="flex items-stretch gap-3 overflow-x-auto pb-2">
          {CREATIVE_STATUSES.map((status) => (
            <KanbanColumn
              key={status.value}
              status={status.value}
              label={status.label}
              creatives={grouped.get(status.value) ?? []}
              isUpdating={isUpdating}
              canEdit={canEdit}
              isDragActive={isDragActive}
              onDrop={handleMove}
              onApproveRoteiro={handleApproveRoteiro}
              onRequestRevision={handleRequestRevision}
              selectedIds={selectedIds}
              onToggleSelected={handleToggleSelected}
              onDragStateChange={setIsDragActive}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
