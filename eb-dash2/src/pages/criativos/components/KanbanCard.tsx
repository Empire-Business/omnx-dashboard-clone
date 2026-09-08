import { useMemo, useState } from 'react'
import { GripVertical, Film, ImageIcon, Layers, Smartphone, Video, Box, Check, MessageSquareWarning, Send, X } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { getApprovalTagLabel, getApprovalTagVariant } from '@/types/creatives'
import type { NotionCreative } from '@/hooks/useCriativos'
import type { CreativeApprovalTag } from '@/types/creatives'

interface KanbanCardProps {
  creative: NotionCreative
  onApproveRoteiro?: (creative: NotionCreative) => void
  onRequestRevision?: (creative: NotionCreative, observation: string) => void
  isUpdating?: boolean
  canEdit?: boolean
  /** Card faz parte da seleção múltipla (BUG-06). */
  selected?: boolean
  onToggleSelected?: (creative: NotionCreative) => void
  /** Ids que devem viajar no arrasto: a seleção inteira, quando este card está nela. */
  dragIds?: string[]
  onDragStateChange?: (dragging: boolean) => void
}

const FORMAT_ICONS: Record<string, React.ReactNode> = {
  reels: <Film className="h-3.5 w-3.5" />,
  static: <ImageIcon className="h-3.5 w-3.5" />,
  carousel: <Layers className="h-3.5 w-3.5" />,
  stories: <Smartphone className="h-3.5 w-3.5" />,
  video: <Video className="h-3.5 w-3.5" />,
  other: <Box className="h-3.5 w-3.5" />,
}

const APPROVAL_TAGS: CreativeApprovalTag[] = [
  'roteiro-em-aprovacao',
  'roteiro-aprovado',
  'revisao-solicitada',
  'edicao-em-aprovacao',
  'edicao-aprovada',
]

function getInitials(name: string | null | undefined) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function getDisplayCode(creative: NotionCreative) {
  return creative.external_id || creative.id.slice(0, 8)
}

function getOwnerName(creative: NotionCreative) {
  return creative.assigned_to || creative.profile || 'Sem responsável'
}

function sourceBadgeVariant(source: string | null | undefined) {
  if (source === 'native') return 'info'
  if (source === 'import') return 'warning'
  return 'secondary'
}

function sourceLabel(source: string | null | undefined) {
  if (source === 'native') return 'Nativo'
  if (source === 'import') return 'Import'
  return 'Notion'
}

function testBadgeVariant(testStatus: string | null | undefined) {
  if (!testStatus) return 'outline'
  const s = testStatus.toLowerCase()
  if (s === 'aprovado' || s === 'escalar') return 'success'
  if (s === 'reprovado' || s === 'matar' || s === 'kill') return 'destructive'
  if (s === 'em_teste') return 'warning'
  return 'outline'
}

function getApprovalTag(creative: NotionCreative): CreativeApprovalTag | undefined {
  return creative.tags?.find((t) => APPROVAL_TAGS.includes(t as CreativeApprovalTag)) as CreativeApprovalTag | undefined
}

export function KanbanCard({
  creative,
  onApproveRoteiro,
  onRequestRevision,
  isUpdating,
  canEdit = true,
  selected = false,
  onToggleSelected,
  dragIds,
  onDragStateChange,
}: KanbanCardProps) {
  const ownerName = useMemo(() => getOwnerName(creative), [creative])
  const displayCode = useMemo(() => getDisplayCode(creative), [creative])
  const formatIcon = FORMAT_ICONS[creative.format ?? ''] ?? FORMAT_ICONS.other
  const approvalTag = useMemo(() => getApprovalTag(creative), [creative])

  const [showRevisionInput, setShowRevisionInput] = useState(false)
  const [revisionNote, setRevisionNote] = useState('')
  const [isDragging, setIsDragging] = useState(false)

  const isRoteiroPending = approvalTag === 'roteiro-em-aprovacao'
  const isRevisaoSolicitada = approvalTag === 'revisao-solicitada'

  // BUG-06, reunião de 2026-08-28 ("é complicado de arrastar... tem que arrastar de um em
  // um"): quando este card está na seleção, o arrasto leva a seleção inteira.
  const idsToDrag = dragIds && dragIds.length > 0 ? dragIds : [creative.id]

  const handleApprove = () => {
    onApproveRoteiro?.(creative)
  }

  const handleRequestRevision = () => {
    if (!revisionNote.trim()) return
    onRequestRevision?.(creative, revisionNote.trim())
    setShowRevisionInput(false)
    setRevisionNote('')
  }

  const handleCancelRevision = () => {
    setShowRevisionInput(false)
    setRevisionNote('')
  }

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    // BUG-06: o card inteiro continua sendo área de arrasto (alvo grande), mas iniciar o
    // gesto de dentro de um botão/textarea sequestrava a interação — agora esses pontos
    // não arrastam.
    const target = e.target as HTMLElement | null
    if (target?.closest('button, textarea, input, a, [role="checkbox"]')) {
      e.preventDefault()
      return
    }
    e.dataTransfer.setData('application/json', JSON.stringify({ ids: idsToDrag }))
    e.dataTransfer.setData('text/plain', idsToDrag.join(','))
    e.dataTransfer.effectAllowed = 'move'
    setIsDragging(true)
    onDragStateChange?.(true)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    onDragStateChange?.(false)
  }

  const handleCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ctrl/Cmd + clique alterna a seleção sem precisar mirar no checkbox.
    if (!canEdit || !onToggleSelected) return
    if (!e.ctrlKey && !e.metaKey) return
    const target = e.target as HTMLElement | null
    if (target?.closest('button, textarea, input, a')) return
    e.preventDefault()
    onToggleSelected(creative)
  }

  return (
    <Card
      variant="interactive"
      draggable={canEdit}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleCardClick}
      className={[
        'group border bg-empire-surface p-3 transition-shadow',
        canEdit ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        selected
          ? 'border-empire-primary ring-2 ring-empire-primary/40'
          : 'border-empire-border hover:border-empire-border-strong',
        isDragging ? 'opacity-50' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="flex items-start gap-2">
        {/* Alça e checkbox de seleção. A alça era `opacity-0` até o hover e ninguém achava
            onde pegar o card (BUG-06) — agora fica visível, só realça no hover. */}
        <div className="mt-0.5 flex flex-col items-center gap-2">
          {canEdit && onToggleSelected && (
            <Checkbox
              checked={selected}
              onCheckedChange={() => onToggleSelected(creative)}
              aria-label={`Selecionar criativo ${displayCode}`}
            />
          )}
          {canEdit && (
            <div className="text-empire-subtle opacity-60 transition-opacity group-hover:opacity-100">
              <GripVertical className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-mono text-empire-subtle truncate">{displayCode}</p>
              <p className="text-sm font-medium text-empire-void leading-snug line-clamp-2">
                {creative.name || 'Sem nome'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0.5 capitalize">
              {formatIcon}
              {creative.format || 'outro'}
            </Badge>
            <Badge variant={sourceBadgeVariant(creative.source)} className="text-[10px] px-1.5 py-0.5">
              {sourceLabel(creative.source)}
            </Badge>
          </div>

          {approvalTag && (
            <Badge variant={getApprovalTagVariant(approvalTag)} className="text-[10px] px-1.5 py-0.5">
              {getApprovalTagLabel(approvalTag)}
            </Badge>
          )}

          {creative.test_status && (
            <Badge variant={testBadgeVariant(creative.test_status)} className="text-[10px] px-1.5 py-0.5">
              {creative.test_status}
            </Badge>
          )}

          {isRevisaoSolicitada && creative.observations && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900/30 dark:bg-red-900/10 dark:text-red-200">
              <p className="font-medium">Observação da revisão:</p>
              <p className="mt-0.5 line-clamp-4">{creative.observations}</p>
            </div>
          )}

          {isRoteiroPending && (
            <div className="flex flex-col gap-2 pt-1">
              {!showRevisionInput ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 flex-1 text-xs"
                    onClick={handleApprove}
                    disabled={isUpdating}
                  >
                    <Check className="mr-1 h-3 w-3" />
                    Aprovar roteiro
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 flex-1 text-xs"
                    onClick={() => setShowRevisionInput(true)}
                    disabled={isUpdating}
                  >
                    <MessageSquareWarning className="mr-1 h-3 w-3" />
                    Pedir revisão
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    placeholder="O que precisa ser revisado?"
                    value={revisionNote}
                    onChange={(e) => setRevisionNote(e.target.value)}
                    className="min-h-[60px] text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7 flex-1 text-xs"
                      onClick={handleRequestRevision}
                      disabled={isUpdating || !revisionNote.trim()}
                    >
                      <Send className="mr-1 h-3 w-3" />
                      Enviar revisão
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={handleCancelRevision}
                      disabled={isUpdating}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px] bg-empire-primary/10 text-empire-primary">
                {getInitials(ownerName)}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs text-empire-muted truncate">{ownerName}</span>
          </div>
        </div>
      </div>
    </Card>
  )
}
