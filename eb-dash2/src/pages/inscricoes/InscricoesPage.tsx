import { useState, useEffect, useCallback } from 'react'
import { Search, ExternalLink, X, CalendarDays, Plug, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { ghlContactUrlForLocation } from '@/lib/ghl'
import { downloadCsv, csvDateStamp, type CsvColumn } from '@/lib/utils/csv'
import { DatePicker } from '@/components/ui/date-picker'

type Submission = {
  id: string; endpoint: string; nome: string | null; email: string | null
  whatsapp: string | null; status: string; utm_source: string | null
  utm_medium: string | null; utm_campaign: string | null; utm_term: string | null
  utm_content: string | null; page_url: string | null; ghl_contact_id: string | null
  created_at: string; last_error: string | null
}

/**
 * Contrato mínimo de uma query filtrável na tabela local.
 * Existe para cortar a inferência de tipo do PostgrestFilterBuilder, que é
 * recursiva e estourava o limite do compilador no build (TS2589).
 */
type LocalQuery = {
  or(filter: string): LocalQuery
  gte(column: string, value: string): LocalQuery
  lte(column: string, value: string): LocalQuery
  eq(column: string, value: string): LocalQuery
  order(column: string, opts: { ascending: boolean }): LocalQuery
  range(from: number, to: number): PromiseLike<{ data: Submission[] | null; error: { message: string } | null }>
}

/** Query base da tabela local já no formato enxuto de `LocalQuery`. */
function localSubmissionsQuery(): LocalQuery {
  return supabase.from('aplic-acelerador').select('*') as unknown as LocalQuery
}

type UtmMaps = { sources: Map<string, string>; campaigns: Map<string, string>; mediums: Map<string, string> }
type FilterOptions = { sources: string[]; campaigns: string[]; mediums: string[]; terms: string[]; endpoints: string[] }

const DEFAULT_WS = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'
const PAGE_SIZE = 50

function statusBadge(status: string) {
  switch (status) {
    case 'success': return <Badge variant="success">Sucesso</Badge>
    case 'pending': return <Badge variant="warning">Pendente</Badge>
    case 'retrying': return <Badge variant="warning">Retentando</Badge>
    case 'failed': return <Badge variant="destructive">Falhou</Badge>
    default: return <Badge variant="outline">{status}</Badge>
  }
}
function fmtDate(iso: string) { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function resolveName(maps: UtmMaps, type: 'sources' | 'campaigns' | 'mediums', code: string | null): string {
  if (!code) return '—'
  const map = type === 'sources' ? maps.sources : type === 'campaigns' ? maps.campaigns : maps.mediums
  return map.get(code) || code
}

/** Remove inscrições duplicadas (mesmo contato no mesmo minuto). */
function dedupe(rows: Submission[]): Submission[] {
  const seen = new Set<string>()
  return rows.filter(s => {
    const key = `${s.email || s.whatsapp || s.nome}|${(s.created_at || '').slice(0, 16)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const active = value !== 'all'
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[11px] font-medium text-empire-subtle">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={cn('h-8 w-full gap-1 rounded-md border px-2.5 text-xs transition-colors',
          active ? 'border-empire-info/35 bg-empire-info/10 text-empire-info' : 'border-empire-border bg-empire-surface text-empire-void hover:border-empire-border-strong')}>
          <span className={cn('truncate', !active && 'text-empire-subtle')}>
            {active ? (options.find(o => o.value === value)?.label || value) : 'Todos'}
          </span>
          {active && <X size={10} className="shrink-0 ml-auto opacity-50" onClick={(e) => { e.stopPropagation(); onChange('all') }} />}
        </SelectTrigger>
        <SelectContent className="max-h-52">{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}

// ── Estado de configuração (subcontas não-default) ──
function ConfigPanel({ workspaceId }: { workspaceId: string }) {
  const [url, setUrl] = useState('')
  const [secret, setSecret] = useState('')
  const [tableName, setTableName] = useState('aplic-acelerador')
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<{ configured: boolean; status: string; last_error?: string } | null>(null)

  const loadStatus = useCallback(async () => {
    const { data } = await supabase.rpc('get_workspace_external_form_source_status', { p_workspace_id: workspaceId })
    setStatus(data as { configured: boolean; status: string; last_error?: string } | null)
  }, [workspaceId])

  useEffect(() => { void Promise.resolve().then(() => loadStatus()) }, [loadStatus])

  const save = async () => {
    if (!url.trim() || !secret.trim()) { toast.error('URL e chave são obrigatórios'); return }
    setSaving(true)
    const { error } = await supabase.rpc('save_workspace_external_form_source', {
      p_workspace_id: workspaceId, p_external_project_url: url.trim(), p_secret: secret.trim(), p_external_table_name: tableName,
    })
    setSaving(false)
    if (error) toast.error(`Erro: ${error.message}`)
    else { toast.success('Configuração salva. Testando conexão...'); setSecret(''); loadStatus() }
  }

  if (status?.status === 'connected') {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" /> Conexão ativa com {status.status}
      </div>
    )
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-empire-void">
        <Plug className="h-4 w-4 text-empire-subtle" /> Configurar Supabase externo
      </div>
      <p className="text-xs text-empire-subtle">
        Cada subconta lê os leads do seu próprio Supabase. Configure a URL do projeto e a service role key.
        A chave é armazenada com criptografia no Vault — nunca exposta ao navegador.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-empire-subtle mb-1 block">URL do projeto Supabase</label>
          <Input placeholder="https://xxxxx.supabase.co" value={url} onChange={e => setUrl(e.target.value)} className="h-8 text-xs" />
        </div>
        <div>
          <label className="text-xs text-empire-subtle mb-1 block">Nome da tabela</label>
          <Input placeholder="aplic-acelerador" value={tableName} onChange={e => setTableName(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs text-empire-subtle mb-1 block">Service Role Key</label>
          <Input type="password" placeholder="eyJ..." value={secret} onChange={e => setSecret(e.target.value)} className="h-8 text-xs" />
        </div>
      </div>
      {status?.last_error && (
        <div className="flex items-center gap-2 rounded-md border border-empire-danger/30 bg-empire-danger-soft p-2 text-xs text-empire-danger">
          <AlertCircle className="h-3.5 w-3.5" /> {status.last_error}
        </div>
      )}
      <Button onClick={save} disabled={saving} size="sm" className="gap-1.5">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
        Salvar e testar
      </Button>
    </Card>
  )
}

// ── Página principal ──
export function InscricoesPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [endpointFilter, setEndpointFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [campaignFilter, setCampaignFilter] = useState('all')
  const [mediumFilter, setMediumFilter] = useState('all')
  const [termFilter, setTermFilter] = useState('all')
  const [utmMaps, setUtmMaps] = useState<UtmMaps>({ sources: new Map(), campaigns: new Map(), mediums: new Map() })
  const [filterOpts, setFilterOpts] = useState<FilterOptions>({ sources: [], campaigns: [], mediums: [], terms: [], endpoints: [] })
  const [ghlLocationId, setGhlLocationId] = useState<string | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [extStatus, setExtStatus] = useState<{ configured: boolean; status: string } | null>(null)

  useEffect(() => {
    (async () => {
      const wid = await getWorkspaceId()
      if (!wid) return
      setWorkspaceId(wid)
      const def = wid === DEFAULT_WS
      setIsDefault(def)

      const [srcRes, srcPlainRes, cmpRes, medRes, ghlRes] = await Promise.all([
        supabase.from('utm_sources').select('utm_source, nome').eq('workspace_id', wid),
        supabase.from('utm_sources_plain').select('utm_source, nome').eq('workspace_id', wid),
        supabase.from('utm_campaigns').select('utm_campaign, nome').eq('workspace_id', wid),
        supabase.from('utm_mediums').select('utm_medium, nome').eq('workspace_id', wid),
        // Via RPC: com SELECT direto a RLS (owner/admin) escondia o link do CRM
        // para SDR/pre-vendedor. A RPC devolve so o location ID.
        supabase.rpc('get_workspace_ghl_location_id', { p_workspace_id: wid }),
      ])
      const sources = new Map<string, string>(), campaigns = new Map<string, string>(), mediums = new Map<string, string>()
      for (const r of (srcRes.data ?? [])) if (r.utm_source) sources.set(r.utm_source, r.nome)
      for (const r of (srcPlainRes.data ?? [])) if (r.utm_source) sources.set(r.utm_source, r.nome)
      for (const r of (cmpRes.data ?? [])) if (r.utm_campaign != null) campaigns.set(String(r.utm_campaign), r.nome)
      for (const r of (medRes.data ?? [])) if (r.utm_medium) mediums.set(r.utm_medium, r.nome)
      setUtmMaps({ sources, campaigns, mediums })
      if (ghlRes.data) setGhlLocationId(ghlRes.data as unknown as string)

      // Para default: carrega opções de filtro da tabela local
      if (def) {
        const { data: subs } = await supabase.from('aplic-acelerador').select('utm_source, utm_campaign, utm_medium, utm_term, endpoint').limit(2000).order('created_at', { ascending: false })
        const uniq = (f: string) => [...new Set((subs ?? []).map((s: Record<string, string | null>) => s[f]).filter((v): v is string => Boolean(v)))].sort()
        setFilterOpts({ sources: uniq('utm_source'), campaigns: uniq('utm_campaign'), mediums: uniq('utm_medium'), terms: uniq('utm_term'), endpoints: uniq('endpoint') })
      } else {
        // Para subcontas: checa status da fonte externa
        const { data } = await supabase.rpc('get_workspace_external_form_source_status', { p_workspace_id: wid })
        setExtStatus(data as { configured: boolean; status: string } | null)
      }
    })()
  }, [])

  const activeFitCount = [statusFilter, endpointFilter, sourceFilter, campaignFilter, mediumFilter, termFilter].filter(v => v !== 'all').length + (search ? 1 : 0) + (dateStart ? 1 : 0) + (dateEnd ? 1 : 0)

  /** Aplica todos os filtros ativos numa query da tabela local. */
  const applyLocalFilters = useCallback((query: LocalQuery): LocalQuery => {
    let q = query
    if (search.trim()) q = q.or(`nome.ilike.%${search.trim().toLowerCase()}%,email.ilike.%${search.trim().toLowerCase()}%,whatsapp.ilike.%${search.trim().toLowerCase()}%`)
    if (dateStart) q = q.gte('created_at', `${dateStart}T00:00:00Z`)
    if (dateEnd) q = q.lte('created_at', `${dateEnd}T23:59:59Z`)
    if (statusFilter !== 'all') q = q.eq('status', statusFilter)
    if (endpointFilter !== 'all') q = q.eq('endpoint', endpointFilter)
    if (sourceFilter !== 'all') q = q.eq('utm_source', sourceFilter)
    if (campaignFilter !== 'all') q = q.eq('utm_campaign', campaignFilter)
    if (mediumFilter !== 'all') q = q.eq('utm_medium', mediumFilter)
    if (termFilter !== 'all') q = q.eq('utm_term', termFilter)
    return q
  }, [search, dateStart, dateEnd, statusFilter, endpointFilter, sourceFilter, campaignFilter, mediumFilter, termFilter])

  const fetchData = useCallback(async () => {
    if (!workspaceId) return
    setLoading(true)

    if (isDefault) {
      // Default: lê tabela local direto
      const q = applyLocalFilters(localSubmissionsQuery())
      const { data, error } = await q.order('created_at', { ascending: false }).range(0, 1999)
      if (error) toast.error(`Erro: ${error.message}`)
      else {
        const deduped = dedupe(data ?? [])
        setSubmissions(deduped.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE))
        setTotal(deduped.length)
      }
    } else {
      // Subconta: chama proxy
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/external-form-submissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` },
        body: JSON.stringify({ workspace_id: workspaceId, page, page_size: PAGE_SIZE, search, status: statusFilter, date_start: dateStart, date_end: dateEnd }),
      })
      const j = await res.json()
      if (!res.ok) { toast.error(j.message || j.error); setSubmissions([]); setTotal(0) }
      else { setSubmissions(j.data ?? []); setTotal(j.total ?? 0) }
    }
    setLoading(false)
  }, [workspaceId, isDefault, page, applyLocalFilters, search, statusFilter, dateStart, dateEnd])

  useEffect(() => { if (workspaceId) void Promise.resolve().then(() => fetchData()) }, [fetchData, workspaceId])

  /** Busca TODAS as linhas que batem com os filtros atuais (sem paginação de tela). */
  const fetchAllFiltered = useCallback(async (): Promise<Submission[]> => {
    if (!workspaceId) return []

    if (isDefault) {
      // PostgREST devolve no máximo 1000 linhas por requisição — precisa paginar
      const CHUNK = 1000
      const all: Submission[] = []
      for (let p = 0; ; p++) {
        const q = applyLocalFilters(localSubmissionsQuery())
        const { data, error } = await q.order('created_at', { ascending: false }).range(p * CHUNK, (p + 1) * CHUNK - 1)
        if (error) throw new Error(error.message)
        const rows = data ?? []
        all.push(...rows)
        if (rows.length < CHUNK) break
      }
      return dedupe(all)
    }

    // Subconta: pagina o proxy até acabar
    const CHUNK = 500
    const token = (await supabase.auth.getSession()).data.session?.access_token
    const all: Submission[] = []
    for (let p = 0; ; p++) {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/external-form-submissions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ workspace_id: workspaceId, page: p, page_size: CHUNK, search, status: statusFilter, date_start: dateStart, date_end: dateEnd }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.message || j.error || 'Falha ao buscar inscrições')
      const rows = (j.data ?? []) as Submission[]
      all.push(...rows)
      if (rows.length < CHUNK) break
    }
    return all
  }, [workspaceId, isDefault, applyLocalFilters, search, statusFilter, dateStart, dateEnd])

  const handleExport = async () => {
    setExporting(true)
    try {
      const rows = await fetchAllFiltered()
      if (rows.length === 0) { toast.info('Nenhuma inscrição para exportar com os filtros atuais.'); return }
      const columns: CsvColumn<Submission>[] = [
        { header: 'Data', value: s => fmtDate(s.created_at) },
        { header: 'Nome', value: s => s.nome },
        { header: 'Email', value: s => s.email },
        { header: 'WhatsApp', value: s => s.whatsapp },
        { header: 'Canal', value: s => resolveName(utmMaps, 'sources', s.utm_source) },
        { header: 'Campanha', value: s => resolveName(utmMaps, 'campaigns', s.utm_campaign) },
        { header: 'Mídia', value: s => resolveName(utmMaps, 'mediums', s.utm_medium) },
        { header: 'Termo', value: s => s.utm_term },
        { header: 'Conteúdo', value: s => s.utm_content },
        { header: 'Endpoint', value: s => s.endpoint },
        { header: 'Status', value: s => s.status },
        { header: 'Página', value: s => s.page_url },
        { header: 'ID do contato no CRM', value: s => s.ghl_contact_id },
        { header: 'Último erro', value: s => s.last_error },
        { header: 'utm_source (código)', value: s => s.utm_source },
        { header: 'utm_campaign (código)', value: s => s.utm_campaign },
        { header: 'utm_medium (código)', value: s => s.utm_medium },
      ]
      downloadCsv(`inscricoes-${csvDateStamp()}`, rows, columns)
      toast.success(`${rows.length} inscriç${rows.length === 1 ? 'ão exportada' : 'ões exportadas'}.`)
    } catch (e) {
      toast.error(`Erro ao exportar: ${e instanceof Error ? e.message : 'falha desconhecida'}`)
    } finally {
      setExporting(false)
    }
  }

  const clear = () => {
    setSearch(''); setDateStart(''); setDateEnd(''); setStatusFilter('all'); setEndpointFilter('all')
    setSourceFilter('all'); setCampaignFilter('all'); setMediumFilter('all'); setTermFilter('all'); setPage(0)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const statusOpts = [{ value: 'all', label: 'Todos' }, { value: 'success', label: 'Sucesso' }, { value: 'pending', label: 'Pendente' }, { value: 'retrying', label: 'Retentando' }, { value: 'failed', label: 'Falhou' }]
  const allOpt = { value: 'all', label: 'Todos' }

  // Subconta não-default sem configuração
  if (!isDefault && extStatus && !extStatus.configured) {
    return <ConfigPanel workspaceId={workspaceId!} />
  }
  if (!isDefault && extStatus && extStatus.status === 'error') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg border border-empire-danger/30 bg-empire-danger-soft p-4 text-sm text-empire-danger">
          <AlertCircle className="h-4 w-4" /> Erro na conexão externa. Reconfigure abaixo.
        </div>
        <ConfigPanel workspaceId={workspaceId!} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="rounded-xl border border-empire-border bg-empire-surface p-4 space-y-3">
        {/* Linha 1 — busca, período e ações */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-[13rem] flex-1 flex-col gap-1 sm:max-w-xs">
            <span className="text-[11px] font-medium text-empire-subtle">Buscar</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-empire-subtle" />
              <Input placeholder="Nome, email, WhatsApp..." className="pl-8 h-8 text-xs" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-1 text-[11px] font-medium text-empire-subtle">
              <CalendarDays size={12} className="shrink-0" /> Período
            </span>
            <div className="flex items-center gap-1.5">
              <DatePicker value={dateStart} onChange={(v) => { setDateStart(v); setPage(0) }} />
              <span className="text-xs font-medium text-empire-subtle">até</span>
              <DatePicker value={dateEnd} onChange={(v) => { setDateEnd(v); setPage(0) }} />
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {activeFitCount > 0 && (
              <span className="text-[11px] px-2 py-1 rounded bg-empire-info/10 border border-empire-info/25 text-empire-info">
                {activeFitCount} filtro{activeFitCount > 1 ? 's' : ''} ativo{activeFitCount > 1 ? 's' : ''}
              </span>
            )}
            {activeFitCount > 0 && (
              <button onClick={clear} className="flex h-8 items-center gap-1 rounded-md border border-empire-border px-2 py-1.5 text-xs font-medium text-empire-subtle hover:bg-empire-danger-soft hover:text-empire-danger transition-all">
                <X size={12} /> Limpar filtros
              </button>
            )}
            <Badge variant="gold" className="h-8">{total} inscrições</Badge>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handleExport} disabled={exporting || loading || total === 0}
              title={activeFitCount > 0 ? 'Exporta as inscrições que batem com os filtros atuais' : 'Exporta todas as inscrições'}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              {exporting ? 'Exportando...' : 'Exportar CSV'}
            </Button>
          </div>
        </div>

        {/* Linha 2 — filtros de classificação */}
        <div className="grid grid-cols-2 gap-3 border-t border-empire-border pt-3 sm:grid-cols-3 lg:grid-cols-6">
          <FilterSelect label="Status" value={statusFilter} onChange={v => { setStatusFilter(v); setPage(0) }} options={statusOpts} />
          {filterOpts.endpoints.length > 0 && <FilterSelect label="Endpoint" value={endpointFilter} onChange={v => { setEndpointFilter(v); setPage(0) }} options={[allOpt, ...filterOpts.endpoints.map(e => ({ value: e, label: e }))]} />}
          {filterOpts.sources.length > 0 && <FilterSelect label="Canal" value={sourceFilter} onChange={v => { setSourceFilter(v); setPage(0) }} options={[allOpt, ...filterOpts.sources.map(s => ({ value: s, label: resolveName(utmMaps, 'sources', s) }))]} />}
          {filterOpts.campaigns.length > 0 && <FilterSelect label="Campanha" value={campaignFilter} onChange={v => { setCampaignFilter(v); setPage(0) }} options={[allOpt, ...filterOpts.campaigns.map(c => ({ value: c, label: resolveName(utmMaps, 'campaigns', c) }))]} />}
          {filterOpts.mediums.length > 0 && <FilterSelect label="Mídia" value={mediumFilter} onChange={v => { setMediumFilter(v); setPage(0) }} options={[allOpt, ...filterOpts.mediums.map(m => ({ value: m, label: resolveName(utmMaps, 'mediums', m) }))]} />}
          {filterOpts.terms.length > 0 && <FilterSelect label="Termo" value={termFilter} onChange={v => { setTermFilter(v); setPage(0) }} options={[allOpt, ...filterOpts.terms.map(t => ({ value: t, label: t }))]} />}
        </div>
      </div>

      {/* Table */}
      <Card variant="glowing">
        <CardContent className="p-0">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 280px)' }}>
            <Table>
              <TableHeader className="border-b border-empire-border sticky top-0 z-20 bg-empire-elevated">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs w-[100px]">Data</TableHead>
                  <TableHead className="text-xs min-w-[130px]">Nome</TableHead>
                  <TableHead className="text-xs min-w-[180px]">Email / WhatsApp</TableHead>
                  <TableHead className="text-xs min-w-[100px]">Canal</TableHead>
                  <TableHead className="text-xs min-w-[100px]">Campanha</TableHead>
                  <TableHead className="text-xs min-w-[80px]">Mídia</TableHead>
                  <TableHead className="text-xs min-w-[80px]">Termo</TableHead>
                  <TableHead className="text-xs min-w-[80px]">Endpoint</TableHead>
                  <TableHead className="text-xs w-[80px]">Status</TableHead>
                  <TableHead className="text-xs w-[50px]">GHL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      {Array.from({ length: 10 }).map((_, j) => (<TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>))}
                    </TableRow>
                  ))
                ) : submissions.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-12 text-empire-muted">Nenhuma inscrição encontrada.</TableCell></TableRow>
                ) : (
                  submissions.map((s) => (
                    <TableRow key={s.id} className="transition-colors hover:bg-empire-hover">
                      <TableCell className="text-xs text-empire-muted whitespace-nowrap">{fmtDate(s.created_at)}</TableCell>
                      <TableCell className="text-sm font-medium whitespace-normal break-words">{s.nome || '—'}</TableCell>
                      <TableCell className="text-xs whitespace-normal break-words">
                        {s.email && <div className="text-empire-void">{s.email}</div>}
                        {s.whatsapp && <div className="text-empire-subtle">{s.whatsapp}</div>}
                        {!s.email && !s.whatsapp && '—'}
                      </TableCell>
                      <TableCell className="text-xs text-empire-subtle whitespace-normal break-words">{resolveName(utmMaps, 'sources', s.utm_source)}</TableCell>
                      <TableCell className="text-xs text-empire-subtle whitespace-normal break-words">{resolveName(utmMaps, 'campaigns', s.utm_campaign)}</TableCell>
                      <TableCell className="text-xs text-empire-subtle whitespace-normal break-words">{resolveName(utmMaps, 'mediums', s.utm_medium)}</TableCell>
                      <TableCell className="text-xs text-empire-muted whitespace-normal break-words">{s.utm_term || '—'}</TableCell>
                      <TableCell className="text-xs text-empire-subtle">{s.endpoint}</TableCell>
                      <TableCell>{statusBadge(s.status)}</TableCell>
                      <TableCell>
                        {s.ghl_contact_id && ghlContactUrlForLocation(ghlLocationId, s.ghl_contact_id) && (
                          <a href={ghlContactUrlForLocation(ghlLocationId, s.ghl_contact_id)!} target="_blank" rel="noopener noreferrer" title="Abrir contato no CRM" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-empire-border px-4 py-2">
              <span className="text-xs text-empire-subtle">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} de {total}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) >= totalPages} onClick={() => setPage(p => p + 1)}>Próximo</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
