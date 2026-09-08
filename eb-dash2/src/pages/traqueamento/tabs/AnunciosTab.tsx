import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Plus, Trash2, Loader2, Megaphone, ExternalLink, Copy, Check } from 'lucide-react'
import { CreativeProductionPanel } from '@/pages/criativos/components/CreativeProductionPanel'
import { MetaAdsSubTab } from './MetaAdsSubTab'

// ─── helpers ────────────────────────────────────────────────

function CodeBadge({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-[var(--radius-sm)] border border-empire-border-strong bg-empire-elevated px-2 py-0.5 font-mono text-[var(--text-11)] text-empire-void">
      {children}
    </span>
  )
}

function DeleteButton({ onClick, canEdit = true }: { onClick: () => void; canEdit?: boolean }) {
  if (!canEdit) return null
  return (
    <button type="button" onClick={onClick} className="rounded p-1 text-empire-subtle hover:text-destructive transition-colors">
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

// ─── sub-tab nav ─────────────────────────────────────────────

const SUB_TABS = [
  { key: 'campanhas', label: 'Campanhas' },
  { key: 'meta_ads', label: 'Meta Ads' },
  { key: 'catalogo_criativos', label: 'Gerador de UTMs' },
  { key: 'producao_notion', label: 'Produção (Notion)' },
] as const

type SubTabKey = (typeof SUB_TABS)[number]['key']

export function AnunciosTab({ canEdit = true }: { canEdit?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSub = searchParams.get('sub')
  const activeSub: SubTabKey = SUB_TABS.some(t => t.key === rawSub) ? (rawSub as SubTabKey) : 'campanhas'

  const setSub = (key: SubTabKey) => {
    const current = Object.fromEntries(searchParams.entries())
    setSearchParams({ ...current, sub: key }, { replace: true })
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-empire-void">Anúncios</h2>
          <p className="text-sm text-empire-muted">Gestão e análise de campanhas de anúncios, criativos e produção</p>
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
      {activeSub === 'campanhas' && <AdsCampanhasSubTab canEdit={canEdit} />}
      {activeSub === 'meta_ads' && <MetaAdsSubTab />}
      {activeSub === 'catalogo_criativos' && <AdsCatalogoSubTab canEdit={canEdit} />}
      {activeSub === 'producao_notion' && (
        <CreativeProductionPanel databaseType="organic" title="Produção (Orgânico) — Notion" />
      )}
    </div>
  )
}

// ─── Campanhas ───────────────────────────────────────────────

type AdsCampaign = {
  id: string; objective_code: string | null; objective_name: string | null;
  page_name: string | null; campaign_date: string | null; code: string
}

function AdsCampanhasSubTab({ canEdit = true }: { canEdit?: boolean }) {
  const [data, setData] = useState<AdsCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newObjectiveCode, setNewObjectiveCode] = useState('')
  const [newObjectiveName, setNewObjectiveName] = useState('')
  const [newPageName, setNewPageName] = useState('')
  const [newDate, setNewDate] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data: campaigns } = await supabase.from('ads_campaigns').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    setData(campaigns || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  const generateCode = (objCode: string, page: string, date: string) => {
    if (!objCode || !page || !date) return ''
    const match = objCode.match(/\(([^)]+)\)/)
    const code = match ? match[1] : objCode
    return `${code}_${page}_${date}`
  }

  const handleAdd = async () => {
    if (!newObjectiveCode || !newPageName || !newDate) { toast.error('Preencha todos os campos obrigatórios'); return }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const match = newObjectiveCode.match(/\(([^)]+)\)/)
    const objCode = match ? match[1] : newObjectiveCode
    const code = generateCode(newObjectiveCode, newPageName, newDate)
    const { error } = await supabase.from('ads_campaigns').insert({
      workspace_id: workspaceId, objective_code: objCode, objective_name: newObjectiveName || null,
      page_name: newPageName, campaign_date: newDate, code,
    } as never)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success('Campanha adicionada'); setNewObjectiveCode(''); setNewObjectiveName(''); setNewPageName(''); setNewDate(''); fetchData() }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('ads_campaigns').delete().eq('id', id)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success('Campanha excluída'); fetchData() }
  }

  const previewCode = generateCode(newObjectiveCode, newPageName, newDate)

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>Campanhas de Anúncios</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Código gerado: O[objetivo]_[página]_[data]</p>
          </div>
        </CardTitle>
        <CardDescription className="mt-2">Ex: O1_Black Nov 25_30-10-2025</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Objetivo (código)</Label>
            <Input variant="default" placeholder="Ex: O1 ou Conversão (O1)" value={newObjectiveCode} onChange={e => setNewObjectiveCode(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Nome do Objetivo</Label>
            <Input variant="default" placeholder="Ex: Conversão" value={newObjectiveName} onChange={e => setNewObjectiveName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Página de Destino</Label>
            <Input variant="default" placeholder="Ex: Black Nov 25" value={newPageName} onChange={e => setNewPageName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-empire-subtle">Data</Label>
            <Input variant="default" placeholder="Ex: 30-10-2025" value={newDate} onChange={e => setNewDate(e.target.value)} />
          </div>
        </div>
        {previewCode && (
          <div className="rounded-lg border border-empire-border bg-empire-elevated p-3">
            <span className="text-xs text-empire-muted">Código gerado: </span>
            <CodeBadge>{previewCode}</CodeBadge>
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={handleAdd} disabled={saving || !canEdit} variant="premium">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {saving ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </div>
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Código</TableHead><TableHead>Objetivo</TableHead><TableHead>Página</TableHead><TableHead>Data</TableHead><TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={5} /> : data.length === 0 ? (
                <TableRow><TableCell colSpan={5}><EmptyState icon={Megaphone} title="Nenhuma campanha cadastrada" description="Adicione via formulário acima." /></TableCell></TableRow>
              ) : data.map(item => (
                <TableRow key={item.id}>
                  <TableCell><CodeBadge>{item.code}</CodeBadge></TableCell>
                  <TableCell className="text-empire-muted">{item.objective_name || item.objective_code || '—'}</TableCell>
                  <TableCell className="text-empire-muted">{item.page_name || '—'}</TableCell>
                  <TableCell className="text-empire-muted">{item.campaign_date || '—'}</TableCell>
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

// ─── Catálogo Criativos ──────────────────────────────────────

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

type AdsCatalog = {
  id: string; month_number: number | null; objective_name: string | null; objective_code: string | null;
  public_name: string | null; public_code: string | null; utm_source: string | null; creative_id: string | null;
  page_name: string | null; page_code: string | null; utm_campaign_number: number | null;
  utm_medium_name: string | null; utm_medium_number: number | null; url: string | null;
}

type ObjetivoItem = { id: string; nome: string; objective_code: string }
type UtmSourceItem = { id: string; nome: string; utm_source: string; public_code: string | null }
type CreativoItem = { id: string; external_id: string | null; name: string | null }
type CampanhaItem = { id: string; nome: string; utm_campaign: number | null; page_code: string | null }
type MediumItem = { id: string; nome: string; utm_medium: number | null }

const SELECT_CLASS = 'w-full rounded-lg border-[1.5px] border-empire-border bg-empire-elevated px-3 py-2 text-sm text-empire-void focus:outline-none focus:border-empire-primary transition-colors disabled:opacity-50'

function AdsCatalogoSubTab({ canEdit = true }: { canEdit?: boolean }) {
  // Options
  const [objetivos, setObjetivos] = useState<ObjetivoItem[]>([])
  const [publicos, setPublicos] = useState<UtmSourceItem[]>([])
  const [criativos, setCriativos] = useState<CreativoItem[]>([])
  const [paginas, setPaginas] = useState<CampanhaItem[]>([])
  const [mediums, setMediums] = useState<MediumItem[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  // Form state
  const [mes, setMes] = useState<number | null>(null)
  const [objetivo, setObjetivo] = useState<ObjetivoItem | null>(null)
  const [publico, setPublico] = useState<UtmSourceItem | null>(null)
  const [criativo, setCriativo] = useState<CreativoItem | null>(null)
  const [pagina, setPagina] = useState<CampanhaItem | null>(null)
  const [medium, setMedium] = useState<MediumItem | null>(null)
  const [url, setUrl] = useState('')

  // History
  const [data, setData] = useState<AdsCatalog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { setLoading(false); return }
    const { data: catalog } = await supabase.from('ads_catalog').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false })
    setData(catalog || [])
    setLoading(false)
  }, [])

  useEffect(() => { void (async () => { await fetchData() })() }, [fetchData])

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true)
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) { setLoadingOptions(false); return }
      const [objRes, srcRes, creRes, campRes, medRes] = await Promise.all([
        supabase.from('utm_objectives').select('id, nome, objective_code').eq('workspace_id', workspaceId).order('nome'),
        supabase.from('utm_sources').select('id, nome, utm_source, public_code').eq('workspace_id', workspaceId).order('nome'),
        supabase.from('notion_creatives').select('id, external_id, name').eq('workspace_id', workspaceId).eq('database_type', 'paid').order('external_id'),
        supabase.from('utm_campaigns').select('id, nome, utm_campaign, page_code').eq('workspace_id', workspaceId).order('nome'),
        supabase.from('utm_mediums').select('id, nome, utm_medium').eq('workspace_id', workspaceId).order('nome'),
      ])
      setObjetivos(objRes.data || [])
      setPublicos(srcRes.data || [])
      setCriativos(creRes.data || [])
      setPaginas(campRes.data || [])
      setMediums(medRes.data || [])
      setLoadingOptions(false)
    }
    loadOptions()
  }, [])

  // Derived preview values
  const adCode = mes && objetivo?.objective_code && publico?.public_code && criativo?.external_id && pagina?.page_code
    ? `M${String(mes).padStart(2, '0')}_${objetivo.objective_code}_${publico.public_code}_${criativo.external_id}_${pagina.page_code}`
    : ''

  const utmCode = (() => {
    const p = new URLSearchParams()
    if (publico?.utm_source) p.set('utm_source', publico.utm_source)
    if (medium?.utm_medium != null) p.set('utm_medium', String(medium.utm_medium))
    if (pagina?.utm_campaign != null) p.set('utm_campaign', String(pagina.utm_campaign))
    if (criativo?.external_id) p.set('utm_content', criativo.external_id)
    if (adCode) p.set('utm_term', adCode)
    return p.toString() ? `?${p.toString()}` : ''
  })()

  const finalUrl = url && utmCode ? `${url}${utmCode}` : ''

  // Table helpers (for stored records)
  const buildUtmTerm = (item: AdsCatalog) => {
    const parts: string[] = []
    if (item.month_number) parts.push(`M${String(item.month_number).padStart(2, '0')}`)
    if (item.objective_code) parts.push(item.objective_code)
    if (item.public_code) parts.push(item.public_code)
    if (item.creative_id) parts.push(item.creative_id)
    if (item.page_code) parts.push(item.page_code)
    return parts.join('_')
  }

  const buildUtmUrl = (item: AdsCatalog) => {
    if (!item.url) return ''
    const params = new URLSearchParams()
    if (item.utm_source) params.set('utm_source', item.utm_source)
    if (item.utm_medium_number) params.set('utm_medium', String(item.utm_medium_number))
    if (item.utm_campaign_number) params.set('utm_campaign', String(item.utm_campaign_number))
    if (item.creative_id) params.set('utm_content', item.creative_id)
    const utmTerm = buildUtmTerm(item)
    if (utmTerm) params.set('utm_term', utmTerm)
    return `${item.url}?${params.toString()}`
  }

  const handleCopyField = async (field: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
    toast.success('Copiado!')
  }

  const handleCopyRow = async (id: string, value: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
    toast.success('URL copiada!')
  }

  const handleSave = async () => {
    if (!mes || !objetivo || !publico || !criativo || !pagina || !medium || !url) {
      toast.error('Preencha todos os campos')
      return
    }
    setSaving(true)
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) { toast.error('Conta não encontrada'); setSaving(false); return }
    const { error } = await supabase.from('ads_catalog').insert({
      workspace_id: workspaceId,
      month_number: mes,
      objective_name: objetivo.nome,
      objective_code: objetivo.objective_code,
      public_name: publico.nome,
      public_code: publico.public_code,
      utm_source: publico.utm_source,
      creative_id: criativo.external_id,
      page_name: pagina.nome,
      page_code: pagina.page_code,
      utm_campaign_number: pagina.utm_campaign,
      utm_medium_name: medium.nome,
      utm_medium_number: medium.utm_medium,
      url,
    } as never)
    if (error) {
      toast.error(`Erro: ${error.message}`)
    } else {
      toast.success('UTM salvo com sucesso')
      setUrl('')
      setCriativo(null)
      fetchData()
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('ads_catalog').delete().eq('id', id)
    if (error) { toast.error(`Erro: ${error.message}`) } else { toast.success('Anúncio excluído'); fetchData() }
  }

  return (
    <Card variant="default" className="animate-fade-in-up">
      <CardHeader className="border-b border-empire-border">
        <CardTitle className="flex items-center gap-3">
          <div className="rounded-lg bg-[rgba(13,24,41,0.08)] p-2.5">
            <Megaphone className="h-5 w-5 text-primary" />
          </div>
          <div>
            <span>Gerador de UTMs Pago</span>
            <p className="mt-0.5 text-xs font-normal text-empire-muted">Selecione os campos para gerar o código e a URL com UTMs automaticamente</p>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">

        {/* Form — row 1: Mês, Objetivo, Público, Criativo */}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-empire-subtle">Mês</Label>
              <select
                className={SELECT_CLASS}
                value={mes ?? ''}
                onChange={e => setMes(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">Selecione...</option>
                {MONTHS.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m} · M{i + 1}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-empire-subtle">Objetivo</Label>
              <select
                className={SELECT_CLASS}
                disabled={loadingOptions}
                value={objetivo?.id ?? ''}
                onChange={e => setObjetivo(objetivos.find(o => o.id === e.target.value) ?? null)}
              >
                <option value="">Selecione...</option>
                {objetivos.map(o => (
                  <option key={o.id} value={o.id}>{o.nome} · {o.objective_code}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-empire-subtle">Público</Label>
              <select
                className={SELECT_CLASS}
                disabled={loadingOptions}
                value={publico?.id ?? ''}
                onChange={e => setPublico(publicos.find(p => p.id === e.target.value) ?? null)}
              >
                <option value="">Selecione...</option>
                {publicos.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}{p.public_code ? ` · ${p.public_code}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-empire-subtle">Criativo</Label>
              <select
                className={SELECT_CLASS}
                disabled={loadingOptions}
                value={criativo?.id ?? ''}
                onChange={e => setCriativo(criativos.find(c => c.id === e.target.value) ?? null)}
              >
                <option value="">Selecione...</option>
                {criativos.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.external_id ?? ''}{c.name ? ` — ${c.name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Form — row 2: Página, UTM Medium, URL */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-empire-subtle">Página</Label>
              <select
                className={SELECT_CLASS}
                disabled={loadingOptions}
                value={pagina?.id ?? ''}
                onChange={e => setPagina(paginas.find(p => p.id === e.target.value) ?? null)}
              >
                <option value="">Selecione...</option>
                {paginas.map(p => (
                  <option key={p.id} value={p.id}>{p.nome}{p.page_code ? ` · ${p.page_code}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-empire-subtle">UTM Medium</Label>
              <select
                className={SELECT_CLASS}
                disabled={loadingOptions}
                value={medium?.id ?? ''}
                onChange={e => setMedium(mediums.find(m => m.id === e.target.value) ?? null)}
              >
                <option value="">Selecione...</option>
                {mediums.map(m => (
                  <option key={m.id} value={m.id}>{m.nome}{m.utm_medium != null ? ` · ${m.utm_medium}` : ''}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-empire-subtle">URL da Página</Label>
              <Input
                variant="default"
                placeholder="https://..."
                value={url}
                onChange={e => setUrl(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Real-time preview */}
        {(adCode || utmCode || finalUrl) && (
          <div className="rounded-xl border border-empire-border bg-empire-elevated p-4 space-y-3">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-empire-subtle">Gerado em tempo real</p>
            {adCode && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-empire-muted">Código do Anúncio</p>
                  <CodeBadge>{adCode}</CodeBadge>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyField('adCode', adCode)}
                  className="shrink-0 rounded p-1.5 text-empire-subtle transition-colors hover:text-primary"
                >
                  {copiedField === 'adCode' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
            {utmCode && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-empire-muted">Código UTM</p>
                  <span className="break-all font-mono text-[var(--text-13)] text-empire-void">{utmCode}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyField('utmCode', utmCode)}
                  className="shrink-0 rounded p-1.5 text-empire-subtle transition-colors hover:text-primary"
                >
                  {copiedField === 'utmCode' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
            {finalUrl && (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="mb-1 text-xs text-empire-muted">URL Final</p>
                  <span className="break-all font-mono text-[var(--text-13)] text-empire-void">{finalUrl}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyField('finalUrl', finalUrl)}
                  className="shrink-0 rounded p-1.5 text-empire-subtle transition-colors hover:text-primary"
                >
                  {copiedField === 'finalUrl' ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !canEdit} variant="premium">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {saving ? 'Salvando...' : 'Salvar UTM'}
          </Button>
        </div>

        {/* History table */}
        <div className="overflow-hidden rounded-xl border border-empire-border bg-empire-surface">
          <Table>
            <TableHeader className="border-b border-empire-border bg-empire-elevated">
              <TableRow className="hover:bg-transparent">
                <TableHead>Mês</TableHead>
                <TableHead>Objetivo</TableHead>
                <TableHead>Público</TableHead>
                <TableHead>Criativo</TableHead>
                <TableHead>Código do Anúncio</TableHead>
                <TableHead>URL Final</TableHead>
                <TableHead className="w-[60px]">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRowsSkeleton cols={7} /> : data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7}>
                    <EmptyState icon={Megaphone} title="Nenhum UTM salvo" description="Preencha o formulário acima e clique em Salvar." />
                  </TableCell>
                </TableRow>
              ) : data.map(item => {
                const utmUrl = buildUtmUrl(item)
                const term = buildUtmTerm(item)
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-empire-muted">{item.month_number ? MONTHS[item.month_number - 1] : '—'}</TableCell>
                    <TableCell className="text-empire-muted">{item.objective_name || item.objective_code || '—'}</TableCell>
                    <TableCell className="text-empire-muted">{item.public_name || item.public_code || '—'}</TableCell>
                    <TableCell>{item.creative_id ? <CodeBadge>{item.creative_id}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                    <TableCell>{term ? <CodeBadge>{term}</CodeBadge> : <span className="text-empire-subtle">—</span>}</TableCell>
                    <TableCell>
                      {utmUrl ? (
                        <div className="flex items-center gap-2">
                          <a href={utmUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                            <ExternalLink className="mr-1 inline h-3 w-3" />URL
                          </a>
                          <button onClick={() => handleCopyRow(item.id, utmUrl)} className="text-empire-muted transition-colors hover:text-primary">
                            {copiedId === item.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                          </button>
                        </div>
                      ) : <span className="text-empire-subtle">—</span>}
                    </TableCell>
                    <TableCell><DeleteButton onClick={() => handleDelete(item.id)} canEdit={canEdit} /></TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Produção Notion ─────────────────────────────────────────

