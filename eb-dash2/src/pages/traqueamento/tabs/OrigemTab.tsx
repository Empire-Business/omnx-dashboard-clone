import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { parseDelimitedContent } from '@/lib/utils/parsers'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { Plus, Trash2, Loader2, ClipboardPaste, BarChart3, Share2, AlertTriangle } from 'lucide-react'

type Origin = { id: string; nome: string }
type Slug = { id: string; nome: string; slug: string }
type Assignment = { id: string; utm_source: string; origin_id: string }

export function OrigemTab({ canEdit = true }: { canEdit?: boolean }) {
  const [origins, setOrigins] = useState<Origin[]>([])
  const [slugs, setSlugs] = useState<Slug[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newOrigemNome, setNewOrigemNome] = useState('')
  const [pasteOrigens, setPasteOrigens] = useState('')
  const [pasteAssignments, setPasteAssignments] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const [{ data: originsData }, { data: slugsData }, { data: assignmentsData }] = await Promise.all([
      supabase.from('utm_origins').select('*').eq('workspace_id', workspaceId).order('nome'),
      supabase.from('utm_slugs').select('*').eq('workspace_id', workspaceId).order('nome'),
      supabase.from('utm_source_origin_assignments').select('*').eq('workspace_id', workspaceId),
    ])
    setOrigins(originsData || [])
    setSlugs(slugsData || [])
    setAssignments(assignmentsData || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleAddOrigem = async () => {
    if (!newOrigemNome) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const { error } = await supabase.from('utm_origins').insert({ workspace_id: workspaceId, nome: newOrigemNome } as never)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success('Origem adicionada'); setNewOrigemNome(''); fetchData() }
    setSaving(false)
  }

  const handleDeleteOrigem = async (id: string) => {
    const { error } = await supabase.from('utm_origins').delete().eq('id', id)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success('Origem excluída'); fetchData() }
  }

  const handleAssign = async (slugNome: string, originId: string) => {
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) return
    const { error } = await supabase.from('utm_source_origin_assignments').upsert(
      { workspace_id: workspaceId, utm_source: slugNome, origin_id: originId } as never,
      { onConflict: 'workspace_id,utm_source' }
    )
    if (error) { toast.error(`Erro: ${error.message}`) } else { fetchData() }
  }

  const handlePasteOrigens = async () => {
    if (!pasteOrigens) { toast.error('Cole os dados'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const lines = pasteOrigens.split('\n').filter(l => l.trim())
    const records = lines
      .filter(l => l.toLowerCase() !== 'nome' && l.toLowerCase() !== 'origem')
      .map(l => ({ workspace_id: workspaceId, nome: l.trim() }))
    if (records.length === 0) { toast.error('Nenhum registro válido'); setSaving(false); return }
    const { error } = await supabase.from('utm_origins').insert(records as never)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success(`${records.length} origens importadas`); setPasteOrigens(''); fetchData() }
    setSaving(false)
  }

  const handlePasteAssignments = async () => {
    if (!pasteAssignments) { toast.error('Cole os dados'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    let count = 0
    for (const row of parseDelimitedContent(pasteAssignments)) {
      if (row.length < 2) continue
      const slugNome = row[0]; const originNome = row[1]
      if (!slugNome || !originNome || slugNome.toLowerCase() === 'slug') continue
      const origin = origins.find(o => o.nome.toLowerCase() === originNome.toLowerCase())
      if (!origin) continue
      await supabase.from('utm_source_origin_assignments').upsert(
        { workspace_id: workspaceId, utm_source: slugNome, origin_id: origin.id } as never,
        { onConflict: 'workspace_id,utm_source' }
      )
      count++
    }
    toast.success(`${count} atribuições importadas`)
    setPasteAssignments('')
    fetchData()
    setSaving(false)
  }

  const unassignedCount = slugs.filter(s => !assignments.find(a => a.utm_source === s.nome)).length

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Origens */}
      <Card variant="default">
        <CardHeader className="border-b border-empire-border">
          <CardTitle className="flex items-center gap-3">
            <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
              <BarChart3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span>Origens</span>
              <p className="mt-0.5 text-xs font-normal text-empire-muted">Grupos de origem para dashboards</p>
            </div>
          </CardTitle>
          <CardDescription className="mt-2">Ex: "Instagram Orgânico", "Google Ads", "WhatsApp". Crie grupos para organizar fontes de tráfego.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          <div className="flex gap-3">
            <Input variant="default" placeholder="Ex: Instagram Orgânico" value={newOrigemNome} onChange={e => setNewOrigemNome(e.target.value)} className="flex-1" />
            <Button onClick={handleAddOrigem} disabled={saving || !canEdit} variant="premium">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {saving ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
          {canEdit && (
            <div className="space-y-3 rounded-xl border border-empire-border bg-empire-elevated p-4">
              <div className="flex items-start gap-2">
                <ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0 text-empire-primary" />
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-empire-void">Importar do Google Sheets</Label>
                  <p className="text-xs text-empire-subtle">Um nome por linha</p>
                </div>
              </div>
              <Textarea placeholder="Cole aqui os dados..." value={pasteOrigens} onChange={e => setPasteOrigens(e.target.value)} className="min-h-[80px] font-mono text-[var(--text-13)] bg-empire-surface" />
              <div className="flex justify-end">
                <Button variant="premium" onClick={handlePasteOrigens} disabled={saving || !pasteOrigens.trim()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardPaste className="mr-2 h-4 w-4" />}
                  {saving ? 'Importando...' : 'Importar origens'}
                </Button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {origins.map(o => (
                <div key={o.id} className="flex items-center gap-2 rounded-lg border border-empire-border bg-empire-surface px-3.5 py-2.5 hover:bg-empire-elevated transition-colors">
                  <span className="text-sm font-semibold text-empire-void">{o.nome}</span>
                  {canEdit && (
                    <button onClick={() => handleDeleteOrigem(o.id)} className="ml-1 text-empire-subtle hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {origins.length === 0 && (
                <EmptyState icon={BarChart3} title="Nenhuma origem cadastrada" description="Adicione uma origem para começar a organizar seus dados." />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Atribuição */}
      <Card variant="default">
        <CardHeader className="border-b border-empire-border">
          <CardTitle className="flex items-center gap-3">
            <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
              <Share2 className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span>Atribuição de Origem</span>
                {unassignedCount > 0 && (
                  <Badge variant="warning">
                    <AlertTriangle className="mr-1 h-3 w-3" />{unassignedCount} sem origem
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs font-normal text-empire-muted">Associe cada slug a uma origem</p>
            </div>
          </CardTitle>
          <CardDescription className="mt-2">O campo utm_source armazena o nome do slug. Associe com as origens criadas acima para organizar dados.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 pt-6">
          {canEdit && (
            <div className="space-y-3 rounded-xl border border-empire-border bg-empire-elevated p-4">
              <div className="flex items-start gap-2">
                <ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0 text-empire-primary" />
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-empire-void">Importar do Google Sheets</Label>
                  <p className="text-xs text-empire-subtle">Nome do Slug [Tab] Nome da Origem</p>
                </div>
              </div>
              <Textarea placeholder="Cole aqui os dados..." value={pasteAssignments} onChange={e => setPasteAssignments(e.target.value)} className="min-h-[80px] font-mono text-[var(--text-13)] bg-empire-surface" />
              <div className="flex justify-end">
                <Button variant="premium" onClick={handlePasteAssignments} disabled={saving || !pasteAssignments.trim()}>
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardPaste className="mr-2 h-4 w-4" />}
                  {saving ? 'Importando...' : 'Importar atribuições'}
                </Button>
              </div>
            </div>
          )}
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
              <Table>
                <TableHeader className="border-b border-empire-border bg-empire-elevated">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="font-mono text-[11px] font-medium uppercase tracking-wider text-empire-subtle">Slug (Nome)</TableHead>
                    <TableHead className="font-mono text-[11px] font-medium uppercase tracking-wider text-empire-subtle">Origem Atribuída</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {slugs.length === 0 ? (
                    <TableRow><TableCell colSpan={2}><EmptyState icon={Share2} title="Nenhum slug cadastrado" description="Adicione slugs na aba CODS UTM primeiro." /></TableCell></TableRow>
                  ) : slugs.map(slug => {
                    const assignment = assignments.find(a => a.utm_source === slug.nome)
                    return (
                      <TableRow key={slug.id}>
                        <TableCell className="font-medium text-empire-void">{slug.nome}</TableCell>
                        <TableCell>
                          <Select
                            value={assignment?.origin_id || ''}
                            onValueChange={v => handleAssign(slug.nome, v)}
                            placeholder="Sem origem..."
                            disabled={!canEdit}
                            className={cn('w-48', !assignment && '[&_button]:border-yellow-500/30')}
                          >
                            <SelectContent>
                              {origins.map(o => <SelectItem key={o.id} value={o.id}>{o.nome}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
