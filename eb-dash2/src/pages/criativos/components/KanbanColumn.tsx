import { useRef, useState } from 'react'
import { MoveRight } from 'lucide-react'
import { KanbanCard } from './KanbanCard'
import type { NotionCreative } from '@/hooks/useCriativos'

interface KanbanColumnProps {
  status: string
  label: string
  creatives: NotionCreative[]
  isUpdating: boolean
  canEdit?: boolean
  /** Há um arrasto em andamento no board — todas as colunas viram alvo visível (BUG-06). */
  isDragActive?: boolean
  onDrop: (creativeIds: string[], newStatus: string) => void
  onApproveRoteiro?: (creative: NotionCreative) => void
  onRequestRevision?: (creative: NotionCreative, observation: string) => void
  selectedIds?: Set<string>
  onToggleSelected?: (creative: NotionCreative) => void
  onDragStateChange?: (dragging: boolean) => void
}

export function KanbanColumn({
  status,
  label,
  creatives,
  isUpdating,
  canEdit = true,
  isDragActive = false,
  onDrop,
  onApproveRoteiro,
  onRequestRevision,
  selectedIds,
  onToggleSelected,
  onDragStateChange,
}: KanbanColumnProps) {
  const [isOver, setIsOver] = useState(false)
  // BUG-06: `dragleave` dispara toda vez que o ponteiro passa de um filho para outro dentro
  // da coluna. Sem contar a profundidade, o realce piscava e o usuário nunca sabia se podia
  // soltar. O contador só zera quando o ponteiro realmente sai da coluna.
  const dragDepth = useRef(0)

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit) return
    e.preventDefault()
    dragDepth.current += 1
    setIsOver(true)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit) return
    // preventDefault em todo dragover é obrigatório para o browser aceitar o drop.
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (!isOver) setIsOver(true)
  }

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setIsOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    if (!canEdit) return
    e.preventDefault()
    dragDepth.current = 0
    setIsOver(false)
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (raw) {
        const parsed = JSON.parse(raw) as { ids?: unknown }
        const ids = Array.isArray(parsed.ids) ? parsed.ids.filter((id): id is string => typeof id === 'string') : []
        if (ids.length > 0) {
          onDrop(ids, status)
          return
        }
      }
      // Fallback: alguns navegadores só entregam text/plain.
      const plain = e.dataTransfer.getData('text/plain')
      const fallbackIds = plain.split(',').map((id) => id.trim()).filter(Boolean)
      if (fallbackIds.length > 0) onDrop(fallbackIds, status)
    } catch {
      // ignora payload de arrasto inválido
    }
  }

  const selectedCount = selectedIds
    ? creatives.reduce((sum, c) => sum + (selectedIds.has(c.id) ? 1 : 0), 0)
    : 0

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        'flex min-w-[280px] max-w-[340px] flex-1 flex-col self-stretch rounded-xl border transition-colors',
        isOver
          ? 'border-empire-primary bg-empire-primary/10 ring-2 ring-empire-primary/30'
          : isDragActive
            ? 'border-dashed border-empire-primary/40 bg-empire-elevated/50'
            : 'border-empire-border bg-empire-elevated/50',
        isUpdating ? 'opacity-70' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-center justify-between border-b border-empire-border px-3 py-2.5">
        <h4 className="text-sm font-semibold text-empire-void">{label}</h4>
        <div className="flex items-center gap-1.5">
          {selectedCount > 0 && (
            <span className="rounded-full bg-empire-primary px-2 py-0.5 text-xs font-medium text-empire-primary-foreground">
              {selectedCount} sel.
            </span>
          )}
          <span className="rounded-full border border-empire-border bg-empire-surface px-2 py-0.5 text-xs font-medium text-empire-muted">
            {creatives.length}
          </span>
        </div>
      </div>
      {/* `flex-1` + min-height: a área vazia da coluna também aceita o drop, e não só a pilha
          de cards — era o principal motivo de o gesto "não pegar" (BUG-06). */}
      <div className="min-h-[180px] flex-1 space-y-2 overflow-y-auto p-2">
        {creatives.map((creative) => (
          <KanbanCard
            key={creative.id}
            creative={creative}
            onApproveRoteiro={onApproveRoteiro}
            onRequestRevision={onRequestRevision}
            isUpdating={isUpdating}
            canEdit={canEdit}
            selected={selectedIds?.has(creative.id) ?? false}
            onToggleSelected={onToggleSelected}
            dragIds={selectedIds?.has(creative.id) ? Array.from(selectedIds) : undefined}
            onDragStateChange={onDragStateChange}
          />
        ))}
        {isOver && (
          <div className="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-empire-primary/60 bg-empire-primary/5 px-3 py-4 text-xs font-medium text-empire-primary">
            <MoveRight className="h-4 w-4" />
            Solte aqui para mover para "{label}"
          </div>
        )}
        {!isOver && creatives.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-empire-subtle">
            {isDragActive ? 'Solte um card aqui' : 'Nenhum criativo nesta etapa'}
          </p>
        )}
      </div>
    </div>
  )
}
