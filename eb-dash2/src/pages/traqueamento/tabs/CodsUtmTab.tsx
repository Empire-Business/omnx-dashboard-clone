import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { GENERIC_OPERATION_ERROR } from '@/lib/errors'
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
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2, Loader2, ClipboardPaste, Share2, Megaphone, BarChart3, Target, Users, AlertTriangle } from 'lucide-react'

// ─── helpers ────────────────────────────────────────────────

function CodeBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-sm)] border border-empire-border-strong bg-empire-elevated px-2 py-0.5 font-mono text-[var(--text-13)] text-empire-void">
      {children}
    </span>
  )
}

function DeleteButton({ onClick, canEdit = true }: { onClick: () => void; canEdit?: boolean }) {
  if (!canEdit) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded p-1 text-empire-subtle hover:text-destructive transition-colors duration-200"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

function TableRowsSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableRow key={i} className="hover:bg-transparent">
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

function PasteSection({
  hint,
  value,
  onChange,
  onImport,
  saving,
  canEdit = true,
}: {
  hint: string
  value: string
  onChange: (v: string) => void
  onImport: () => void
  saving: boolean
  canEdit?: boolean
}) {
  if (!canEdit) return null
  return (
    <div className="space-y-2 paste-section-accent">
      <div className="flex items-start gap-2">
        <ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-1">
          <Label className="text-xs font-semibold text-empire-subtle">Importar do Google Sheets</Label>
          <p className="text-xs text-empire-subtle">{hint}</p>
        </div>
      </div>
      <Textarea
        placeholder="Cole aqui os dados do Google Sheets (múltiplas linhas)..."
        value={value}
        onChange={e => onChange(e.target.value)}
        className="min-h-[80px] font-mono text-[var(--text-13)] bg-empire-surface"
      />
      <div className="flex justify-end">
        <Button variant="premium" onClick={onImport} disabled={saving || !value.trim()}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardPaste className="mr-2 h-4 w-4" />}
          {saving ? 'Importando...' : 'Importar'}
        </Button>
      </div>
    </div>
  )
}

// ─── sub-tab nav ─────────────────────────────────────────────

const SUB_TABS = [
  { key: 'slug_utm', label: 'Slug UTM' },
  { key: 'utm_source_ads', label: 'UTM-SOURCE ADS' },
  { key: 'utm_source_organico', label: 'UTM-SOURCE Orgânico' },
  { key: 'utm_campaign', label: 'UTM-CAMPAIGN' },
  { key: 'utm_medium', label: 'UTM-MEDIUM' },
  { key: 'utm_term', label: 'UTM-TERM' },
  { key: 'objetivo_ads', label: 'Objetivo ADS' },
] as const

type SubTabKey = (typeof SUB_TABS)[number]['key']

export function CodsUtmTab({ canEdit = true }: { canEdit?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSub = searchParams.get('sub')
  const activeSub: SubTabKey = SUB_TABS.some(t => t.key === rawSub) ? (rawSub as SubTabKey) : 'slug_utm'

  const setSub = (key: SubTabKey) => {
    const current = Object.fromEntries(searchParams.entries())
    setSearchParams({ ...current, sub: key }, { replace: true })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-empire-void">CODS UTM</h2>
          <p className="text-sm text-empire-muted">Gerenciamento de códigos UTM para rastreamento de campanhas</p>
        </div>
        <Badge variant="gold">V1</Badge>
      </div>

      <div style={{ borderBottom: '1px solid var(--empire-border)' }}>
        <nav className="-mb-px flex flex-wrap gap-1 scrollbar-hide">
          {SUB_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSub(key)}
              className={cn(
                'border-b-2 px-3.5 py-2.5 text-xs font-semibold transition-all duration-200',
                activeSub === key
                  ? 'border-[var(--empire-primary)] text-empire-void'
                  : 'border-transparent text-empire-subtle hover:border-empire-border hover:text-empire-void'
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {activeSub === 'slug_utm' && <SlugUtmSubTab canEdit={canEdit} />}
      {activeSub === 'utm_source_ads' && <UtmSourceAdsSubTab canEdit={canEdit} />}
      {activeSub === 'utm_source_organico' && <UtmSourceOrganicoSubTab canEdit={canEdit} />}
      {activeSub === 'utm_campaign' && <UtmCampaignSubTab canEdit={canEdit} />}
      {activeSub === 'utm_medium' && <UtmMediumSubTab canEdit={canEdit} />}
      {activeSub === 'utm_term' && <UtmTermSubTab canEdit={canEdit} />}
      {activeSub === 'objetivo_ads' && <ObjetivoAdsSubTab canEdit={canEdit} />}
    </div>
  )
}

// ─── 1.1 Slug UTM ───────────────────────────────────────────

function SlugUtmSubTab({ canEdit = true }: { canEdit?: boolean }) {
  const [data, setData] = useState<Array<{ id: string; nome: string; slug: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [pasteData, setPasteData] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data: slugs } = await supabase
      .from('utm_slugs').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    setData(slugs || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleAdd = async () => {
    if (!newNome || !newSlug) { toast.error('Preencha todos os campos'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const { error } = await supabase.from('utm_slugs').insert({ workspace_id: workspaceId, nome: newNome, slug: newSlug.toLowerCase().replace(/\s+/g, '-') } as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Slug adicionado'); setNewNome(''); setNewSlug(''); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('utm_slugs').delete().eq('id', id)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Slug excluído'); fetchData() }
  }

  const handlePaste = async () => {
    if (!pasteData) { toast.error('Cole os dados do Sheets'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const parsedData = parseDelimitedContent(pasteData)
    const records: { workspace_id: string; nome: string; slug: string }[] = []
    for (const row of parsedData) {
      if (row.length < 2) continue
      const nome = row[0]; const slug = row[1]
      if (!nome || !slug || nome.toLowerCase().includes('nome')) continue
      records.push({ workspace_id: workspaceId, nome, slug: slug.toLowerCase().replace(/\s+/g, '-') })
    }
    if (records.length === 0) { toast.error('Nenhum registro válido'); setSaving(false); return }
    const { error } = await supabase.from('utm_slugs').insert(records as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success(`${records.length} slugs importados`); setPasteData(''); fetchData() }
    setSaving(false)
  }

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <Share2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>Slug UTM</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Slugs base para geração de códigos</p>
          </div>
        </CardTitle>
        <CardDescription className="mt-2">Cole do Google Sheets ou adicione manualmente. Suporta tab, vírgula e ponto-e-vírgula.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Nome</Label>
            <Input variant="default" placeholder="Ex: Davi Louback" value={newNome} onChange={e => setNewNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Slug</Label>
            <Input variant="default" placeholder="Ex: davil" value={newSlug} onChange={e => setNewSlug(e.target.value)} className="font-mono" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} disabled={saving || !canEdit} variant="premium">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {saving ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
        </div>
        <PasteSection hint="Nome [Tab] Slug" value={pasteData} onChange={setPasteData} onImport={handlePaste} saving={saving} canEdit={canEdit} />
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={3} /> : data.length === 0 ? (
                <TableRow><TableCell colSpan={3}><EmptyState icon={Share2} title="Nenhum slug cadastrado" description="Adicione via formulário ou importando do Google Sheets." /></TableCell></TableRow>
              ) : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-empire-void">{item.nome}</TableCell>
                  <TableCell><CodeBadge>{item.slug}</CodeBadge></TableCell>
                  <TableCell><DeleteButton onClick={() => handleDelete(item.id)} canEdit={canEdit} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 1.2 UTM Source ADS ─────────────────────────────────────

function UtmSourceAdsSubTab({ canEdit = true }: { canEdit?: boolean }) {
  const [data, setData] = useState<Array<{ id: string; nome: string; slug: string; utm_source: string; public_code: string | null }>>([])
  const [slugs, setSlugs] = useState<Array<{ id: string; nome: string; slug: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newUtmSource, setNewUtmSource] = useState('')
  const [newPublicCode, setNewPublicCode] = useState('')
  const [pasteData, setPasteData] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const [{ data: sources }, { data: slugData }] = await Promise.all([
      supabase.from('utm_sources').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabase.from('utm_slugs').select('*').eq('workspace_id', workspaceId).order('nome'),
    ])
    setData(sources || [])
    setSlugs(slugData || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleAdd = async () => {
    if (!newNome || !newSlug) { toast.error('Nome e Slug são obrigatórios'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    let utmSource = newUtmSource
    if (!utmSource) {
      const [{ data: existing }, { data: existingPlain }] = await Promise.all([
        supabase.from('utm_sources').select('utm_source').eq('workspace_id', workspaceId) as unknown as Promise<{ data: { utm_source: string }[] | null }>,
        supabase.from('utm_sources_plain').select('utm_source').eq('workspace_id', workspaceId) as unknown as Promise<{ data: { utm_source: string }[] | null }>,
      ])
      const allSources = [...(existing || []).map(e => e.utm_source), ...(existingPlain || []).map(e => e.utm_source)]
      let n = 1; while (allSources.includes(`${newSlug}-${n}`)) n++
      utmSource = `${newSlug}-${n}`
    }
    let publicCode = newPublicCode
    if (!publicCode) {
      const { data: existing } = await supabase.from('utm_sources').select('public_code').eq('workspace_id', workspaceId) as unknown as { data: { public_code: string | null }[] | null }
      const codes = (existing || []).map(e => e.public_code).filter(Boolean).map(c => parseInt(c!.replace(/\D/g, '')) || 0)
      publicCode = `P${(codes.length > 0 ? Math.max(...codes) : 0) + 1}`
    }
    const { error } = await supabase.from('utm_sources').insert({ workspace_id: workspaceId, nome: newNome, slug: newSlug, utm_source: utmSource, public_code: publicCode } as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Source ADS adicionado'); setNewNome(''); setNewSlug(''); setNewUtmSource(''); setNewPublicCode(''); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('utm_sources').delete().eq('id', id)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Source excluído'); fetchData() }
  }

  const handlePaste = async () => {
    if (!pasteData) { toast.error('Cole os dados do Sheets'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const [{ data: existing }, { data: existingPlain }] = await Promise.all([
      supabase.from('utm_sources').select('utm_source, public_code').eq('workspace_id', workspaceId) as unknown as Promise<{ data: { utm_source: string; public_code: string | null }[] | null }>,
      supabase.from('utm_sources_plain').select('utm_source').eq('workspace_id', workspaceId) as unknown as Promise<{ data: { utm_source: string }[] | null }>,
    ])
    const allSources = new Set([...(existing || []).map(e => e.utm_source), ...(existingPlain || []).map(e => e.utm_source)])
    const codes = (existing || []).map(e => e.public_code).filter(Boolean).map(c => parseInt(c!.replace(/\D/g, '')) || 0)
    let maxCode = codes.length > 0 ? Math.max(...codes) : 0
    const parsedData = parseDelimitedContent(pasteData)
    const records: Array<{ workspace_id: string; nome: string; slug: string; utm_source: string; public_code: string }> = []
    for (const row of parsedData) {
      if (row.length < 2) continue
      const nome = row[0]; const slug = row[1]
      if (!nome || !slug || nome.toLowerCase() === 'nome') continue
      let utmSource = row[2] || ''
      let publicCode = row[3] || ''
      if (!utmSource) { let n = 1; while (allSources.has(`${slug}-${n}`)) n++; utmSource = `${slug}-${n}` }
      if (!publicCode) { maxCode++; publicCode = `P${maxCode}` }
      allSources.add(utmSource)
      records.push({ workspace_id: workspaceId, nome, slug, utm_source: utmSource, public_code: publicCode })
    }
    if (records.length === 0) { toast.error('Nenhum registro válido'); setSaving(false); return }
    const { error } = await supabase.from('utm_sources').insert(records as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success(`${records.length} sources importados`); setPasteData(''); fetchData() }
    setSaving(false)
  }

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>UTM Source ADS</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Canais de tráfego pago</p>
          </div>
        </CardTitle>
        <CardDescription className="mt-2">utm_source e public_code são auto-gerados. Cole do Google Sheets ou adicione manualmente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Nome</Label>
            <Input variant="default" placeholder="Ex: Facebook Ads" value={newNome} onChange={e => setNewNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Slug</Label>
            <Select
              value={newSlug}
              onValueChange={setNewSlug}
              placeholder="Selecione..."
            >
              <SelectContent>
                {slugs.map(s => <SelectItem key={s.id} value={s.slug}>{s.nome} ({s.slug})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">utm_source <span className="text-empire-subtle">(auto)</span></Label>
            <Input variant="default" placeholder="Auto-gerado" value={newUtmSource} onChange={e => setNewUtmSource(e.target.value)} className="font-mono text-[var(--text-13)]" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">public_code <span className="text-empire-subtle">(auto)</span></Label>
            <Input variant="default" placeholder="Auto-gerado" value={newPublicCode} onChange={e => setNewPublicCode(e.target.value)} className="font-mono text-[var(--text-13)]" />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={saving || !canEdit} variant="premium">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {saving ? 'Adicionando...' : 'Adicionar'}
        </Button>
        <PasteSection hint="Nome [Tab] Slug [Tab] utm_source [Tab] public_code" value={pasteData} onChange={setPasteData} onImport={handlePaste} saving={saving} canEdit={canEdit} />
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead><TableHead>Slug</TableHead><TableHead>utm_source</TableHead><TableHead>public_code</TableHead><TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={5} /> : data.length === 0 ? (
                <TableRow><TableCell colSpan={5}><EmptyState icon={Megaphone} title="Nenhum source ADS cadastrado" description="Adicione via formulário ou importando do Google Sheets." /></TableCell></TableRow>
              ) : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-empire-void">{item.nome}</TableCell>
                  <TableCell><CodeBadge>{item.slug}</CodeBadge></TableCell>
                  <TableCell><CodeBadge>{item.utm_source}</CodeBadge></TableCell>
                  <TableCell>{item.public_code ? <CodeBadge>{item.public_code}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                  <TableCell><DeleteButton onClick={() => handleDelete(item.id)} canEdit={canEdit} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 1.3 UTM Source Orgânico ────────────────────────────────

function UtmSourceOrganicoSubTab({ canEdit = true }: { canEdit?: boolean }) {
  const [data, setData] = useState<Array<{ id: string; nome: string; slug: string; utm_source: string }>>([])
  const [slugs, setSlugs] = useState<Array<{ id: string; nome: string; slug: string }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newUtmSource, setNewUtmSource] = useState('')
  const [pasteData, setPasteData] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const [{ data: sources }, { data: slugData }] = await Promise.all([
      supabase.from('utm_sources_plain').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }),
      supabase.from('utm_slugs').select('*').eq('workspace_id', workspaceId).order('nome'),
    ])
    setData(sources || [])
    setSlugs(slugData || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleAdd = async () => {
    if (!newNome || !newSlug) { toast.error('Nome e Slug são obrigatórios'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    let utmSource = newUtmSource
    if (!utmSource) {
      const [{ data: existing }, { data: existingPlain }] = await Promise.all([
        supabase.from('utm_sources').select('utm_source').eq('workspace_id', workspaceId) as unknown as Promise<{ data: { utm_source: string }[] | null }>,
        supabase.from('utm_sources_plain').select('utm_source').eq('workspace_id', workspaceId) as unknown as Promise<{ data: { utm_source: string }[] | null }>,
      ])
      const allSources = [...(existing || []).map(e => e.utm_source), ...(existingPlain || []).map(e => e.utm_source)]
      let n = 1; while (allSources.includes(`${newSlug}-${n}`)) n++
      utmSource = `${newSlug}-${n}`
    }
    const { error } = await supabase.from('utm_sources_plain').insert({ workspace_id: workspaceId, nome: newNome, slug: newSlug, utm_source: utmSource } as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Source orgânico adicionado'); setNewNome(''); setNewSlug(''); setNewUtmSource(''); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('utm_sources_plain').delete().eq('id', id)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Source excluído'); fetchData() }
  }

  const handlePaste = async () => {
    if (!pasteData) { toast.error('Cole os dados do Sheets'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const [{ data: existing }, { data: existingPlain }] = await Promise.all([
      supabase.from('utm_sources').select('utm_source').eq('workspace_id', workspaceId) as unknown as Promise<{ data: { utm_source: string }[] | null }>,
      supabase.from('utm_sources_plain').select('utm_source').eq('workspace_id', workspaceId) as unknown as Promise<{ data: { utm_source: string }[] | null }>,
    ])
    const allSources = new Set([...(existing || []).map(e => e.utm_source), ...(existingPlain || []).map(e => e.utm_source)])
    const records: Array<{ workspace_id: string; nome: string; slug: string; utm_source: string }> = []
    for (const row of parseDelimitedContent(pasteData)) {
      if (row.length < 2) continue
      const nome = row[0]; const slug = row[1]
      if (!nome || !slug || nome.toLowerCase() === 'nome') continue
      let utmSource = row[2] || ''
      if (!utmSource) { let n = 1; while (allSources.has(`${slug}-${n}`)) n++; utmSource = `${slug}-${n}` }
      allSources.add(utmSource)
      records.push({ workspace_id: workspaceId, nome, slug, utm_source: utmSource })
    }
    if (records.length === 0) { toast.error('Nenhum registro válido'); setSaving(false); return }
    const { error } = await supabase.from('utm_sources_plain').insert(records as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success(`${records.length} sources importados`); setPasteData(''); fetchData() }
    setSaving(false)
  }

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>UTM Source Orgânico</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Canais de tráfego orgânico</p>
          </div>
        </CardTitle>
        <CardDescription className="mt-2">Sem public_code (não participam do P-Code System). Cole do Google Sheets ou adicione manualmente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Nome</Label>
            <Input variant="default" placeholder="Ex: Instagram Orgânico" value={newNome} onChange={e => setNewNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Slug</Label>
            <Select value={newSlug} onValueChange={setNewSlug} placeholder="Selecione...">
              <SelectContent>
                {slugs.map(s => <SelectItem key={s.id} value={s.slug}>{s.nome} ({s.slug})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">utm_source <span className="text-empire-subtle">(auto)</span></Label>
            <Input variant="default" placeholder="Auto-gerado" value={newUtmSource} onChange={e => setNewUtmSource(e.target.value)} className="font-mono text-[var(--text-13)]" />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={saving || !canEdit} variant="premium">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {saving ? 'Adicionando...' : 'Adicionar'}
        </Button>
        <PasteSection hint="Nome [Tab] Slug [Tab] utm_source" value={pasteData} onChange={setPasteData} onImport={handlePaste} saving={saving} canEdit={canEdit} />
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead><TableHead>Slug</TableHead><TableHead>utm_source</TableHead><TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={4} /> : data.length === 0 ? (
                <TableRow><TableCell colSpan={4}><EmptyState icon={Users} title="Nenhum source orgânico cadastrado" description="Adicione via formulário ou importando do Google Sheets." /></TableCell></TableRow>
              ) : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-empire-void">{item.nome}</TableCell>
                  <TableCell><CodeBadge>{item.slug}</CodeBadge></TableCell>
                  <TableCell><CodeBadge>{item.utm_source}</CodeBadge></TableCell>
                  <TableCell><DeleteButton onClick={() => handleDelete(item.id)} canEdit={canEdit} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 1.4 UTM Campaign ───────────────────────────────────────

// ─── Alerta de campanha [cp] órfã ───────────────────────────
// Campanha "[cp]" é casada pela TAG do contato contra o nome cadastrado aqui.
// Tag sem cadastro (ou com grafia diferente) não aparece no filtro e os leads
// somem do painel sem erro nenhum. Em 2026-07-31 achamos tags assim que
// estavam invisíveis havia meses. Este bloco mostra a pendência e deixa o
// próprio time resolver, sem depender de migration.
// Ver docs/MUDANCAS.md (2026-07-31) e RPC listar_campanhas_cp_orfas.

type CampanhaCpOrfa = {
  tag: string
  contatos: number
  primeiro_contato: string | null
  ultimo_contato: string | null
}

function CampanhasCpOrfasAlert({ canEdit, onCadastrada }: { canEdit: boolean; onCadastrada: () => void }) {
  const [orfas, setOrfas] = useState<CampanhaCpOrfa[]>([])
  const [loading, setLoading] = useState(true)
  const [savingTag, setSavingTag] = useState<string | null>(null)

  const fetchOrfas = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data, error } = await supabase.rpc('listar_campanhas_cp_orfas', { p_workspace_id: workspaceId })
    if (error) {
      // Alerta é informativo: falhar aqui não pode derrubar a tela de cadastro.
      setOrfas([])
    } else {
      setOrfas((data as CampanhaCpOrfa[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { void fetchOrfas() }, [fetchOrfas])

  const handleCadastrar = async (tag: string) => {
    setSavingTag(tag)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSavingTag(null); return }
    const { data: existing } = await supabase.from('utm_campaigns').select('utm_campaign').eq('workspace_id', workspaceId)
    const nums = (existing || []).map(e => e.utm_campaign).filter(Boolean) as number[]
    const utmCampaign = nums.length > 0 ? Math.max(...nums) + 1 : 1
    const { error } = await supabase.from('utm_campaigns').insert({
      workspace_id: workspaceId, nome: tag, utm_campaign: utmCampaign, page_code: `PG${utmCampaign}`, funnels: [],
    } as never)
    if (error) {
      toast.error(GENERIC_OPERATION_ERROR)
    } else {
      toast.success(`Campanha "${tag}" cadastrada`)
      await fetchOrfas()
      onCadastrada()
    }
    setSavingTag(null)
  }

  if (loading || orfas.length === 0) return null

  return (
    <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="text-sm font-semibold text-empire-void">
              {orfas.length === 1
                ? '1 campanha usada no CRM não está cadastrada aqui'
                : `${orfas.length} campanhas usadas no CRM não estão cadastradas aqui`}
            </p>
            <p className="mt-1 text-xs text-empire-muted">
              Campanha <span className="font-mono">[cp]</span> é reconhecida pela tag do contato, comparando o nome
              inteiro (espaço e acento contam). Enquanto a tag não estiver cadastrada com a grafia exata, os leads
              dela não aparecem nos filtros dos painéis.
            </p>
          </div>
          <div className="space-y-2">
            {orfas.map(o => (
              <div key={o.tag} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-empire-surface px-3 py-2">
                <span className="font-mono text-[var(--text-13)] font-medium text-empire-void">{o.tag}</span>
                <Badge variant="secondary">{o.contatos} {o.contatos === 1 ? 'contato' : 'contatos'}</Badge>
                <div className="ml-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canEdit || savingTag === o.tag}
                    onClick={() => handleCadastrar(o.tag)}
                  >
                    {savingTag === o.tag ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-2 h-3.5 w-3.5" />}
                    Cadastrar
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-empire-subtle">
            Se a tag for de automação (disparo, controle interno) e não uma campanha de verdade, ignore — o aviso
            some sozinho quando a tag deixa de ser usada.
          </p>
        </div>
      </div>
    </div>
  )
}

function UtmCampaignSubTab({ canEdit = true }: { canEdit?: boolean }) {
  const [data, setData] = useState<Array<{ id: string; nome: string; utm_campaign: number | null; page_code: string | null; funnels: unknown }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newUtmCampaign, setNewUtmCampaign] = useState('')
  const [newPageCode, setNewPageCode] = useState('')
  const [pasteData, setPasteData] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data: campaigns } = await supabase.from('utm_campaigns').select('*').eq('workspace_id', workspaceId).order('utm_campaign', { ascending: true })
    setData(campaigns || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleAdd = async () => {
    if (!newNome) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    let utmCampaign = newUtmCampaign ? parseInt(newUtmCampaign) : 0
    if (!utmCampaign) {
      const { data: existing } = await supabase.from('utm_campaigns').select('utm_campaign').eq('workspace_id', workspaceId)
      const nums = (existing || []).map(e => e.utm_campaign).filter(Boolean) as number[]
      utmCampaign = nums.length > 0 ? Math.max(...nums) + 1 : 1
    }
    const pageCode = newPageCode || `PG${utmCampaign}`
    const { error } = await supabase.from('utm_campaigns').insert({ workspace_id: workspaceId, nome: newNome, utm_campaign: utmCampaign, page_code: pageCode, funnels: [] } as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Campanha adicionada'); setNewNome(''); setNewUtmCampaign(''); setNewPageCode(''); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('utm_campaigns').delete().eq('id', id)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Campanha excluída'); fetchData() }
  }

  const handlePaste = async () => {
    if (!pasteData) { toast.error('Cole os dados do Sheets'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const { data: existing } = await supabase.from('utm_campaigns').select('utm_campaign').eq('workspace_id', workspaceId)
    const nums = (existing || []).map(e => e.utm_campaign).filter(Boolean) as number[]
    let maxNum = nums.length > 0 ? Math.max(...nums) : 0
    const records: Array<{ workspace_id: string; nome: string; utm_campaign: number; page_code: string; funnels: unknown[] }> = []
    for (const row of parseDelimitedContent(pasteData)) {
      const nome = row[0]
      if (!nome || nome.toLowerCase() === 'nome') continue
      let utmCampaign = row[1] ? parseInt(row[1]) : 0
      if (!utmCampaign) { maxNum++; utmCampaign = maxNum }
      const pageCode = row[2] || `PG${utmCampaign}`
      records.push({ workspace_id: workspaceId, nome, utm_campaign: utmCampaign, page_code: pageCode, funnels: [] })
    }
    if (records.length === 0) { toast.error('Nenhum registro válido'); setSaving(false); return }
    const { error } = await supabase.from('utm_campaigns').insert(records as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success(`${records.length} campanhas importadas`); setPasteData(''); fetchData() }
    setSaving(false)
  }

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>UTM Campaign</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Campanhas de marketing</p>
          </div>
        </CardTitle>
        <CardDescription className="mt-2">utm_campaign e page_code são auto-gerados. Cole do Google Sheets ou adicione manualmente.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <CampanhasCpOrfasAlert canEdit={canEdit} onCadastrada={fetchData} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Nome</Label>
            <Input variant="default" placeholder="Ex: Black November 2025" value={newNome} onChange={e => setNewNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">utm_campaign <span className="text-empire-subtle">(auto)</span></Label>
            <Input variant="default" type="number" placeholder="Auto-gerado" value={newUtmCampaign} onChange={e => setNewUtmCampaign(e.target.value)} className="font-mono text-[var(--text-13)]" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">page_code <span className="text-empire-subtle">(auto)</span></Label>
            <Input variant="default" placeholder="Ex: PG12" value={newPageCode} onChange={e => setNewPageCode(e.target.value)} className="font-mono text-[var(--text-13)]" />
          </div>
        </div>
        <Button onClick={handleAdd} disabled={saving || !canEdit} variant="premium">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          {saving ? 'Adicionando...' : 'Adicionar'}
        </Button>
        <PasteSection hint="Nome [Tab] utm_campaign [Tab] page_code" value={pasteData} onChange={setPasteData} onImport={handlePaste} saving={saving} canEdit={canEdit} />
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead><TableHead>utm_campaign</TableHead><TableHead>page_code</TableHead><TableHead>Funis</TableHead><TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={5} /> : data.length === 0 ? (
                <TableRow><TableCell colSpan={5}><EmptyState icon={BarChart3} title="Nenhuma campanha cadastrada" description="Adicione via formulário ou importando do Google Sheets." /></TableCell></TableRow>
              ) : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-empire-void">{item.nome}</TableCell>
                  <TableCell>{item.utm_campaign ? <CodeBadge>{String(item.utm_campaign)}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                  <TableCell>{item.page_code ? <CodeBadge>{item.page_code}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {Array.isArray(item.funnels) && (item.funnels as string[]).map((f, i) => (
                        <Badge key={i} variant="gold" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell><DeleteButton onClick={() => handleDelete(item.id)} canEdit={canEdit} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 1.5 UTM Medium ─────────────────────────────────────────

function UtmMediumSubTab({ canEdit = true }: { canEdit?: boolean }) {
  const [data, setData] = useState<Array<{ id: string; nome: string; utm_medium: number | null }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newMedium, setNewMedium] = useState('')
  const [pasteData, setPasteData] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data: mediums } = await supabase.from('utm_mediums').select('*').eq('workspace_id', workspaceId).order('utm_medium', { ascending: true })
    setData(mediums || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleAdd = async () => {
    if (!newNome) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    let medium = newMedium ? parseInt(newMedium) : 0
    if (!medium) {
      const { data: existing } = await supabase.from('utm_mediums').select('utm_medium').eq('workspace_id', workspaceId)
      const nums = (existing || []).map(e => e.utm_medium).filter(Boolean) as number[]
      medium = nums.length > 0 ? Math.max(...nums) + 1 : 1
    }
    const { error } = await supabase.from('utm_mediums').insert({ workspace_id: workspaceId, nome: newNome, utm_medium: medium } as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Medium adicionado'); setNewNome(''); setNewMedium(''); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('utm_mediums').delete().eq('id', id)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Medium excluído'); fetchData() }
  }

  const handlePaste = async () => {
    if (!pasteData) { toast.error('Cole os dados do Sheets'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const { data: existing } = await supabase.from('utm_mediums').select('utm_medium').eq('workspace_id', workspaceId)
    const nums = (existing || []).map(e => e.utm_medium).filter(Boolean) as number[]
    let maxNum = nums.length > 0 ? Math.max(...nums) : 0
    const records: Array<{ workspace_id: string; nome: string; utm_medium: number }> = []
    for (const row of parseDelimitedContent(pasteData)) {
      const nome = row[0]
      if (!nome || nome.toLowerCase() === 'nome') continue
      let medium = row[1] ? parseInt(row[1]) : 0
      if (!medium) { maxNum++; medium = maxNum }
      records.push({ workspace_id: workspaceId, nome, utm_medium: medium })
    }
    if (records.length === 0) { toast.error('Nenhum registro válido'); setSaving(false); return }
    const { error } = await supabase.from('utm_mediums').insert(records as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success(`${records.length} mediums importados`); setPasteData(''); fetchData() }
    setSaving(false)
  }

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <Share2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>UTM Medium</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Meios/formatos de veiculação</p>
          </div>
        </CardTitle>
        <CardDescription className="mt-2">Botão, Swipe Up, Story... utm_medium é auto-gerado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Nome</Label>
            <Input variant="default" placeholder="Ex: Botão, Swipe Up" value={newNome} onChange={e => setNewNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">utm_medium <span className="text-empire-subtle">(auto)</span></Label>
            <Input variant="default" type="number" placeholder="Auto-gerado" value={newMedium} onChange={e => setNewMedium(e.target.value)} className="font-mono text-[var(--text-13)]" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} disabled={saving || !canEdit} variant="premium">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {saving ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
        </div>
        <PasteSection hint="Nome [Tab] utm_medium" value={pasteData} onChange={setPasteData} onImport={handlePaste} saving={saving} canEdit={canEdit} />
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead><TableHead>utm_medium</TableHead><TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={3} /> : data.length === 0 ? (
                <TableRow><TableCell colSpan={3}><EmptyState icon={Share2} title="Nenhum medium cadastrado" description="Adicione via formulário ou importando do Google Sheets." /></TableCell></TableRow>
              ) : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-empire-void">{item.nome}</TableCell>
                  <TableCell>{item.utm_medium ? <CodeBadge>{String(item.utm_medium)}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                  <TableCell><DeleteButton onClick={() => handleDelete(item.id)} canEdit={canEdit} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 1.6 UTM Term ───────────────────────────────────────────

function UtmTermSubTab({ canEdit = true }: { canEdit?: boolean }) {
  const [data, setData] = useState<Array<{ id: string; nome: string; utm_term: number | null }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newTerm, setNewTerm] = useState('')
  const [pasteData, setPasteData] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data: terms } = await supabase.from('utm_terms').select('*').eq('workspace_id', workspaceId).order('utm_term', { ascending: true })
    setData(terms || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleAdd = async () => {
    if (!newNome) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    let term = newTerm ? parseInt(newTerm) : 0
    if (!term) {
      const { data: existing } = await supabase.from('utm_terms').select('utm_term').eq('workspace_id', workspaceId)
      const nums = (existing || []).map(e => e.utm_term).filter(Boolean) as number[]
      term = nums.length > 0 ? Math.max(...nums) + 1 : 1
    }
    const { error } = await supabase.from('utm_terms').insert({ workspace_id: workspaceId, nome: newNome, utm_term: term } as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Term adicionado'); setNewNome(''); setNewTerm(''); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('utm_terms').delete().eq('id', id)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Term excluído'); fetchData() }
  }

  const handlePaste = async () => {
    if (!pasteData) { toast.error('Cole os dados do Sheets'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const { data: existing } = await supabase.from('utm_terms').select('utm_term').eq('workspace_id', workspaceId)
    const nums = (existing || []).map(e => e.utm_term).filter(Boolean) as number[]
    let maxNum = nums.length > 0 ? Math.max(...nums) : 0
    const records: Array<{ workspace_id: string; nome: string; utm_term: number }> = []
    for (const row of parseDelimitedContent(pasteData)) {
      const nome = row[0]
      if (!nome || nome.toLowerCase() === 'nome') continue
      let term = row[1] ? parseInt(row[1]) : 0
      if (!term) { maxNum++; term = maxNum }
      records.push({ workspace_id: workspaceId, nome, utm_term: term })
    }
    if (records.length === 0) { toast.error('Nenhum registro válido'); setSaving(false); return }
    const { error } = await supabase.from('utm_terms').insert(records as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success(`${records.length} terms importados`); setPasteData(''); fetchData() }
    setSaving(false)
  }

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>UTM Term</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Identificadores de criativos</p>
          </div>
        </CardTitle>
        <CardDescription className="mt-2">Descrição de criativos individuais. utm_term é auto-gerado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Nome (descrição)</Label>
            <Input variant="default" placeholder="Ex: Video depoimento" value={newNome} onChange={e => setNewNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">utm_term <span className="text-empire-subtle">(auto)</span></Label>
            <Input variant="default" type="number" placeholder="Auto-gerado" value={newTerm} onChange={e => setNewTerm(e.target.value)} className="font-mono text-[var(--text-13)]" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} disabled={saving || !canEdit} variant="premium">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {saving ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
        </div>
        <PasteSection hint="Nome [Tab] utm_term" value={pasteData} onChange={setPasteData} onImport={handlePaste} saving={saving} canEdit={canEdit} />
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead><TableHead>utm_term</TableHead><TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={3} /> : data.length === 0 ? (
                <TableRow><TableCell colSpan={3}><EmptyState icon={Target} title="Nenhum term cadastrado" description="Adicione via formulário ou importando do Google Sheets." /></TableCell></TableRow>
              ) : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-empire-void">{item.nome}</TableCell>
                  <TableCell>{item.utm_term ? <CodeBadge>{String(item.utm_term)}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                  <TableCell><DeleteButton onClick={() => handleDelete(item.id)} canEdit={canEdit} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── 1.7 Objetivo ADS ───────────────────────────────────────

function ObjetivoAdsSubTab({ canEdit = true }: { canEdit?: boolean }) {
  const [data, setData] = useState<Array<{ id: string; nome: string; objective_code: string | null }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newNome, setNewNome] = useState('')
  const [newCode, setNewCode] = useState('')
  const [pasteData, setPasteData] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data: objectives } = await supabase.from('utm_objectives').select('*').eq('workspace_id', workspaceId).order('objective_code', { ascending: true })
    setData(objectives || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleAdd = async () => {
    if (!newNome) { toast.error('Nome é obrigatório'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    let code = newCode ? newCode.toUpperCase() : ''
    if (!code) {
      const { data: existing } = await supabase.from('utm_objectives').select('objective_code').eq('workspace_id', workspaceId)
      const nums = (existing || []).map(e => e.objective_code).filter(Boolean).map(c => parseInt(c!.replace(/\D/g, '')) || 0)
      code = `O${(nums.length > 0 ? Math.max(...nums) : 0) + 1}`
    }
    const { error } = await supabase.from('utm_objectives').insert({ workspace_id: workspaceId, nome: newNome, objective_code: code } as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Objetivo adicionado'); setNewNome(''); setNewCode(''); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('utm_objectives').delete().eq('id', id)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success('Objetivo excluído'); fetchData() }
  }

  const handlePaste = async () => {
    if (!pasteData) { toast.error('Cole os dados do Sheets'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const { data: existing } = await supabase.from('utm_objectives').select('objective_code').eq('workspace_id', workspaceId)
    const nums = (existing || []).map(e => e.objective_code).filter(Boolean).map(c => parseInt(c!.replace(/\D/g, '')) || 0)
    let maxNum = nums.length > 0 ? Math.max(...nums) : 0
    const records: Array<{ workspace_id: string; nome: string; objective_code: string }> = []
    for (const row of parseDelimitedContent(pasteData)) {
      const nome = row[0]
      if (!nome || nome.toLowerCase() === 'nome') continue
      let code = row[1]?.toUpperCase() || ''
      if (!code) { maxNum++; code = `O${maxNum}` }
      records.push({ workspace_id: workspaceId, nome, objective_code: code })
    }
    if (records.length === 0) { toast.error('Nenhum registro válido'); setSaving(false); return }
    const { error } = await supabase.from('utm_objectives').insert(records as never)
    if (error) { toast.error(GENERIC_OPERATION_ERROR) } else { toast.success(`${records.length} objetivos importados`); setPasteData(''); fetchData() }
    setSaving(false)
  }

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>Objetivo ADS</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Objetivos de campanha de mídia</p>
          </div>
        </CardTitle>
        <CardDescription className="mt-2">Conversão, Tráfego, Engajamento... objective_code é auto-gerado.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Nome</Label>
            <Input variant="default" placeholder="Ex: Conversão, Tráfego" value={newNome} onChange={e => setNewNome(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">objective_code <span className="text-empire-subtle">(auto)</span></Label>
            <Input variant="default" placeholder="Ex: O1" value={newCode} onChange={e => setNewCode(e.target.value.toUpperCase())} className="font-mono text-[var(--text-13)]" />
          </div>
          <div className="flex items-end">
            <Button onClick={handleAdd} disabled={saving || !canEdit} variant="premium">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {saving ? 'Adicionando...' : 'Adicionar'}
            </Button>
          </div>
        </div>
        <PasteSection hint="Nome [Tab] Objetivo" value={pasteData} onChange={setPasteData} onImport={handlePaste} saving={saving} canEdit={canEdit} />
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Nome</TableHead><TableHead>objective_code</TableHead><TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={3} /> : data.length === 0 ? (
                <TableRow><TableCell colSpan={3}><EmptyState icon={Target} title="Nenhum objetivo cadastrado" description="Adicione via formulário ou importando do Google Sheets." /></TableCell></TableRow>
              ) : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium text-empire-void">{item.nome}</TableCell>
                  <TableCell>{item.objective_code ? <CodeBadge>{item.objective_code}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                  <TableCell><DeleteButton onClick={() => handleDelete(item.id)} canEdit={canEdit} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
