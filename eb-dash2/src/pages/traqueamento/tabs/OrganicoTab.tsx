import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { parseDelimitedContent } from '@/lib/utils/parsers'
import { cn } from '@/lib/utils'
import { fmtDate } from '@/lib/utils/dates'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Loader2, ClipboardPaste, RefreshCw, ExternalLink, Copy, Check, Trash2, Link2 } from 'lucide-react'

// ─── helpers ────────────────────────────────────────────────

function CodeBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-sm)] border border-empire-border-strong bg-empire-elevated px-2 py-0.5 font-mono text-[var(--text-13)] text-empire-void">
      {children}
    </span>
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

// ─── sub-tab nav ─────────────────────────────────────────────

const SUB_TABS = [
  { key: 'producao', label: 'Produção Orgânico' },
  { key: 'catalogo', label: 'Gerador de UTMs' },
] as const

type SubTabKey = (typeof SUB_TABS)[number]['key']

export function OrganicoTab({ canEdit = true }: { canEdit?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSub = searchParams.get('sub')
  const activeSub: SubTabKey = SUB_TABS.some(t => t.key === rawSub) ? (rawSub as SubTabKey) : 'producao'

  const setSub = (key: SubTabKey) => {
    const current = Object.fromEntries(searchParams.entries())
    setSearchParams({ ...current, sub: key }, { replace: true })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-empire-void">Orgânico</h2>
          <p className="text-sm text-empire-muted">Produção e catálogo de conteúdo orgânico</p>
        </div>
        <Badge variant="gold">V1</Badge>
      </div>
      <div style={{ borderBottom: '1px solid var(--empire-border)' }}>
        <nav className="-mb-px flex gap-1 scrollbar-hide">
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
      {activeSub === 'producao' && <ProducaoOrganicoSubTab />}
      {activeSub === 'catalogo' && <OrganicoCatalogoSubTab canEdit={canEdit} />}
    </div>
  )
}

// ─── Produção Orgânico (Notion) ──────────────────────────────

type NotionCreative = {
  id: string; external_id: string | null; name: string | null; status: string | null;
  available_date: string | null; format: string | null; videos_folder_url: string | null;
  final_asset_url: string | null; synced_at: string;
}

function ProducaoOrganicoSubTab() {
  const [data, setData] = useState<NotionCreative[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data: creatives } = await supabase
      .from('notion_creatives').select('*')
      .eq('workspace_id', workspaceId)
      .eq('database_type', 'organic')
      .order('synced_at', { ascending: false })
    setData(creatives || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const { error } = await supabase.functions.invoke('notion-creatives-sync', {
        body: { database_type: 'organic', request_source: 'manual' }
      })
      if (error) throw error
      toast.success('Sincronização concluída')
      await fetchData()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao sincronizar')
    } finally {
      setSyncing(false)
    }
  }

  const statuses = [...new Set(data.map(d => d.status).filter(Boolean))] as string[]

  const filtered = data.filter(item => {
    const matchSearch = !search || (item.name?.toLowerCase().includes(search.toLowerCase()) || item.external_id?.toLowerCase().includes(search.toLowerCase()))
    const matchStatus = filterStatus === 'all' || item.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-primary" />
              Produção Orgânico — Notion
            </CardTitle>
            <CardDescription>{data.length} registros sincronizados do Notion.</CardDescription>
          </div>
          <Button variant="outline" onClick={handleSync} disabled={syncing} className="border-empire-border bg-empire-elevated hover:bg-empire-border">
            {syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Sincronizar
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-6">
        <div className="flex gap-3">
          <Input variant="default" placeholder="Buscar por nome, ID..." value={search} onChange={e => setSearch(e.target.value)} className="flex-1" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="rounded-lg border-[1.5px] border-empire-border bg-empire-elevated px-3 py-2 text-sm text-empire-void focus:outline-none focus:border-empire-primary transition-colors">
            <option value="all">Todos</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>ID</TableHead><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead>Formato</TableHead><TableHead>Disponível</TableHead><TableHead>Links</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={6} /> : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6}><EmptyState icon={RefreshCw} title="Nenhum criativo orgânico" description="Clique em Sincronizar para buscar dados do Notion." /></TableCell></TableRow>
              ) : filtered.map(item => (
                <TableRow key={item.id}>
                  <TableCell>{item.external_id ? <CodeBadge>{item.external_id}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                  <TableCell className="max-w-[200px] truncate font-medium text-empire-void">{item.name || '—'}</TableCell>
                  <TableCell>{item.status ? <Badge variant="outline" className="text-xs border-primary/20">{item.status}</Badge> : <span className="text-empire-subtle">—</span>}</TableCell>
                  <TableCell className="text-empire-muted">{item.format || '—'}</TableCell>
                  <TableCell className="text-empire-muted">{item.available_date ? fmtDate(item.available_date) : '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {item.videos_folder_url && <a href={item.videos_folder_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Vídeos</a>}
                      {item.final_asset_url && <a href={item.final_asset_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Asset</a>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Catálogo Orgânico ───────────────────────────────────────

type OrganicCatalog = {
  id: string; profile: string | null; utm_source_name: string | null; utm_source: string | null;
  utm_campaign_name: string | null; utm_campaign: number | null; utm_medium_name: string | null;
  utm_medium: number | null; utm_term_name: string | null; utm_term: number | null;
  utm_content: string | null; url: string | null;
}

type UtmSourcePlainItem = { id: string; nome: string; utm_source: string }
type CampanhaItem = { id: string; nome: string; utm_campaign: number | null }
type MediumItem = { id: string; nome: string; utm_medium: number | null }
type TermItem = { id: string; nome: string; utm_term: number | null }
type NotionCreativeItem = { id: string; external_id: string | null; name: string | null }

function OrganicoCatalogoSubTab({ canEdit = true }: { canEdit?: boolean }) {
  const [data, setData] = useState<OrganicCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [pasteData, setPasteData] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  // form dropdown options
  const [fontes, setFontes] = useState<UtmSourcePlainItem[]>([])
  const [campanhas, setCampanhas] = useState<CampanhaItem[]>([])
  const [mediums, setMediums] = useState<MediumItem[]>([])
  const [terms, setTerms] = useState<TermItem[]>([])
  const [criativos, setCriativos] = useState<NotionCreativeItem[]>([])

  // form selected values
  const [fonte, setFonte] = useState<UtmSourcePlainItem | null>(null)
  const [campanha, setCampanha] = useState<CampanhaItem | null>(null)
  const [medium, setMedium] = useState<MediumItem | null>(null)
  const [term, setTerm] = useState<TermItem | null>(null)
  const [criativo, setCriativo] = useState<NotionCreativeItem | null>(null)
  const [url, setUrl] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data: catalog } = await supabase.from('organic_catalog').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    setData(catalog || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  useEffect(() => {
    const loadOptions = async () => {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) return
      const [srcs, camps, meds, trms, crtv] = await Promise.all([
        supabase.from('utm_sources_plain').select('id, nome, utm_source').eq('workspace_id', workspaceId).order('nome'),
        supabase.from('utm_campaigns').select('id, nome, utm_campaign').eq('workspace_id', workspaceId).order('nome'),
        supabase.from('utm_mediums').select('id, nome, utm_medium').eq('workspace_id', workspaceId).order('nome'),
        supabase.from('utm_terms').select('id, nome, utm_term').eq('workspace_id', workspaceId).order('nome'),
        supabase.from('notion_creatives').select('id, external_id, name').eq('workspace_id', workspaceId).eq('database_type', 'organic').not('external_id', 'is', null).order('external_id', { ascending: false }),
      ])
      setFontes((srcs.data as UtmSourcePlainItem[]) || [])
      setCampanhas((camps.data as CampanhaItem[]) || [])
      setMediums((meds.data as MediumItem[]) || [])
      setTerms((trms.data as TermItem[]) || [])
      setCriativos((crtv.data as NotionCreativeItem[]) || [])
    }
    loadOptions()
  }, [])

  const buildOrgUrl = (item: OrganicCatalog) => {
    if (!item.url) return ''
    const params = new URLSearchParams()
    if (item.utm_source) params.set('utm_source', item.utm_source)
    if (item.utm_campaign) params.set('utm_campaign', String(item.utm_campaign))
    if (item.utm_medium) params.set('utm_medium', String(item.utm_medium))
    if (item.utm_term) params.set('utm_term', String(item.utm_term))
    if (item.utm_content) params.set('utm_content', item.utm_content)
    return `${item.url}?${params.toString()}`
  }

  // preview derivado dos campos do formulário
  const utmCode = (() => {
    const p = new URLSearchParams()
    if (fonte?.utm_source) p.set('utm_source', fonte.utm_source)
    if (campanha?.utm_campaign != null) p.set('utm_campaign', String(campanha.utm_campaign))
    if (medium?.utm_medium != null) p.set('utm_medium', String(medium.utm_medium))
    if (term?.utm_term != null) p.set('utm_term', String(term.utm_term))
    if (criativo?.external_id) p.set('utm_content', criativo.external_id)
    return p.toString() ? `?${p.toString()}` : ''
  })()
  const finalUrl = url && utmCode ? `${url}${utmCode}` : ''

  const handleSave = async () => {
    if (!fonte) { toast.error('Selecione o Perfil / UTM Source'); return }
    if (!campanha) { toast.error('Selecione a UTM Campaign'); return }
    if (!medium) { toast.error('Selecione o UTM Medium'); return }
    if (!url) { toast.error('Informe a URL da página'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const { error } = await supabase.from('organic_catalog').insert({
      workspace_id: workspaceId,
      profile: fonte.nome,
      utm_source_name: fonte.nome,
      utm_source: fonte.utm_source,
      utm_campaign_name: campanha.nome,
      utm_campaign: campanha.utm_campaign,
      utm_medium_name: medium.nome,
      utm_medium: medium.utm_medium,
      utm_term_name: term?.nome ?? null,
      utm_term: term?.utm_term ?? null,
      utm_content: criativo?.external_id ?? null,
      url,
    })
    if (error) { toast.error(`Erro: ${error.message}`) } else {
      toast.success('UTM salva com sucesso!')
      setFonte(null); setCampanha(null); setMedium(null); setTerm(null); setCriativo(null); setUrl('')
      fetchData()
    }
    setSaving(false)
  }

  const handleCopyField = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedField(key)
    setTimeout(() => setCopiedField(null), 2000)
    toast.success('Copiado!')
  }

  const handleCopy = async (id: string, url: string) => {
    await navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast.success('URL copiada!')
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('organic_catalog').delete().eq('id', id)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success('Registro excluído'); fetchData() }
  }

  const handlePaste = async () => {
    if (!pasteData) { toast.error('Cole os dados do Sheets'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const records: Array<Record<string, unknown>> = []
    for (const row of parseDelimitedContent(pasteData)) {
      if (row.length < 2) continue
      const profile = row[0]
      if (!profile || profile.toLowerCase() === 'perfil') continue
      records.push({
        workspace_id: workspaceId,
        profile: profile || null,
        utm_source_name: row[1] || null,
        utm_campaign_name: row[2] || null,
        utm_medium_name: row[3] || null,
        utm_term_name: row[4] || null,
        utm_content: row[5] || null,
        url: row[6] || null,
      })
    }
    if (records.length === 0) { toast.error('Nenhum registro válido'); setSaving(false); return }
    const { error } = await supabase.from('organic_catalog').insert(records as never)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success(`${records.length} registros importados`); setPasteData(''); fetchData() }
    setSaving(false)
  }

  const selectCls = 'w-full rounded-lg border-[1.5px] border-empire-border bg-empire-elevated px-3 py-2 text-sm text-empire-void focus:outline-none focus:border-empire-primary transition-colors'

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <Link2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>Gerador de UTMs Orgânico</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Crie links UTM para tráfego orgânico</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">

        {/* ── Formulário interativo ── */}
        <div className="space-y-4 rounded-xl border border-empire-border bg-empire-elevated p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-empire-subtle">Novo link UTM</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-empire-void">Perfil / UTM Source <span className="text-destructive">*</span></Label>
              <select value={fonte?.id ?? ''} onChange={e => setFonte(fontes.find(f => f.id === e.target.value) ?? null)} className={selectCls}>
                <option value="">Selecionar...</option>
                {fontes.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-empire-void">UTM Campaign <span className="text-destructive">*</span></Label>
              <select value={campanha?.id ?? ''} onChange={e => setCampanha(campanhas.find(c => c.id === e.target.value) ?? null)} className={selectCls}>
                <option value="">Selecionar...</option>
                {campanhas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-empire-void">UTM Medium <span className="text-destructive">*</span></Label>
              <select value={medium?.id ?? ''} onChange={e => setMedium(mediums.find(m => m.id === e.target.value) ?? null)} className={selectCls}>
                <option value="">Selecionar...</option>
                {mediums.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-empire-void">UTM Term <span className="text-empire-subtle font-normal">(opcional)</span></Label>
              <select value={term?.id ?? ''} onChange={e => setTerm(terms.find(t => t.id === e.target.value) ?? null)} className={selectCls}>
                <option value="">Nenhum</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs font-medium text-empire-void">UTM Content <span className="text-empire-subtle font-normal">(opcional)</span></Label>
              <select value={criativo?.id ?? ''} onChange={e => setCriativo(criativos.find(c => c.id === e.target.value) ?? null)} className={selectCls}>
                <option value="">Nenhum</option>
                {criativos.map(c => <option key={c.id} value={c.id}>{c.external_id}{c.name ? ` — ${c.name}` : ''}</option>)}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs font-medium text-empire-void">URL da Página <span className="text-destructive">*</span></Label>
              <Input variant="default" placeholder="https://exemplo.com/pagina" value={url} onChange={e => setUrl(e.target.value)} />
            </div>
          </div>

          {/* Preview em tempo real */}
          {(utmCode || url) && (
            <div className="rounded-lg border border-empire-border bg-empire-surface p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-empire-subtle">Preview em tempo real</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-empire-subtle w-24 shrink-0">Código UTM:</span>
                <code className="flex-1 truncate rounded bg-empire-elevated px-2 py-1 text-xs font-mono text-empire-void">{utmCode || '—'}</code>
                {utmCode && (
                  <button onClick={() => handleCopyField('code', utmCode)} className="shrink-0 text-empire-muted hover:text-primary transition-colors">
                    {copiedField === 'code' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-empire-subtle w-24 shrink-0">URL Final:</span>
                <code className="flex-1 truncate rounded bg-empire-elevated px-2 py-1 text-xs font-mono text-empire-void">{finalUrl || '—'}</code>
                {finalUrl && (
                  <button onClick={() => handleCopyField('final', finalUrl)} className="shrink-0 text-empire-muted hover:text-primary transition-colors">
                    {copiedField === 'final' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="premium" onClick={handleSave} disabled={saving || !canEdit}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
              {saving ? 'Salvando...' : 'Salvar UTM'}
            </Button>
          </div>
        </div>

        {/* ── Histórico ── */}
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Perfil</TableHead><TableHead>utm_source</TableHead><TableHead>utm_campaign</TableHead><TableHead>utm_medium</TableHead><TableHead>URL Final</TableHead><TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={6} /> : data.length === 0 ? (
                <TableRow><TableCell colSpan={6}><EmptyState icon={Link2} title="Nenhum UTM salvo ainda" description="Preencha o formulário acima para criar seu primeiro link." /></TableCell></TableRow>
              ) : data.map(item => {
                const orgUrl = buildOrgUrl(item)
                return (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium text-empire-void">{item.profile || '—'}</TableCell>
                    <TableCell>{item.utm_source_name ? <CodeBadge>{item.utm_source_name}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                    <TableCell className="text-empire-muted">{item.utm_campaign_name || (item.utm_campaign ? String(item.utm_campaign) : '—')}</TableCell>
                    <TableCell className="text-empire-muted">{item.utm_medium_name || (item.utm_medium ? String(item.utm_medium) : '—')}</TableCell>
                    <TableCell>
                      {orgUrl ? (
                        <div className="flex items-center gap-2">
                          <a href={orgUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline max-w-[200px] truncate block">
                            <ExternalLink className="inline mr-1 h-3 w-3" />{orgUrl}
                          </a>
                          <button onClick={() => handleCopy(item.id, orgUrl)} className="shrink-0 text-empire-muted hover:text-primary transition-colors">
                            {copiedId === item.id ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      ) : <span className="text-empire-subtle">—</span>}
                    </TableCell>
                    <TableCell>
                      {canEdit && (
                        <button type="button" onClick={() => handleDelete(item.id)} className="rounded p-1 text-empire-subtle hover:text-destructive transition-colors">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>

        {/* ── Importar do Sheets (mantido como alternativa) ── */}
        {canEdit && (
          <div className="space-y-2 rounded-xl border border-dashed border-empire-border p-4">
            <div className="flex items-start gap-2">
              <ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0 text-empire-subtle" />
              <Label className="text-xs font-semibold text-empire-subtle">Importar em massa do Google Sheets</Label>
            </div>
            <p className="text-xs text-empire-muted pl-6">Formato: Perfil [Tab] UTM-SOURCE [Tab] UTM-CAMPAIGN [Tab] UTM-MEDIUM [Tab] UTM-TERM [Tab] UTM-CONTENT [Tab] URL</p>
            <Textarea placeholder="Cole aqui os dados do Google Sheets..." value={pasteData} onChange={e => setPasteData(e.target.value)} className="min-h-[80px] font-mono text-[var(--text-13)]" />
            <Button variant="outline" onClick={handlePaste} disabled={saving} size="sm" className="border-empire-border bg-empire-elevated">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ClipboardPaste className="mr-2 h-4 w-4" />}
              {saving ? 'Importando...' : 'Importar do Sheets'}
            </Button>
          </div>
        )}

      </CardContent>
    </Card>
  )
}
