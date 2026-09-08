import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { LeadCard } from '@/components/leads/LeadCard'
import { NoShowsPendentesCard } from '@/components/prevendas/NoShowsPendentesCard'
import { supabase } from '@/lib/supabase'
import { applyRecuperacaoFilter, type RecuperacaoQueryLike } from '@/lib/constants'
import { getWorkspaceId } from '@/lib/workspace'
import { MessageSquare, Phone, Sparkles, Loader2, ChevronDown } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  loading: boolean
  pipelineMode?: 'exclude_recuperacao' | 'only_recuperacao'
}

interface LeadParado {
  opp_id: string
  contato_id: string
  nome: string | null
  sdr: string | null
  tentativas: number
  ultima_tentativa: string | null
  dias_sem_contato: number
  canal: string | null
  pipeline_name: string | null
  data_lead_recebido: string | null
  ultimas_mensagens?: string[]
}

interface AguardandoLead {
  opp_id: string
  contato_id: string
  nome: string | null
  sdr: string | null
  mensagem_trecho: string | null
  horas_aguardando: number
  pipeline_name: string | null
  stage: string | null
}

interface AiInsight {
  padroes: string[]
  recomendacoes: string[]
  grupos: { label: string; leads_indices: number[] }[]
}

// Shape das linhas de `oportunidades` (com embed de `contatos`) lidas via
// supabase-js não tipado — ver select nas queries abaixo
interface StalledOppRow {
  id: string
  sdr_name: string | null
  data_tentativa_1: string | null
  data_tentativa_2: string | null
  data_tentativa_3: string | null
  data_tentativa_4: string | null
  data_tentativa_5: string | null
  data_tentativa_6: string | null
  data_tentativa_7: string | null
  data_tentativa_8: string | null
  data_fechado: string | null
  data_perdido: string | null
  data_conectado: string | null
  data_lead_recebido: string | null
  pipeline_id: string
  pipeline_name: string | null
  contatos: {
    id: string
    nome: string | null
    utm_source: string | null
    tags: unknown
    owner_name: string | null
  } | null
}

interface AwaitingOppRow {
  id: string
  contato_id: string
  pipeline_name: string | null
  contatos: { nome: string | null; tags: unknown }[] | { nome: string | null; tags: unknown } | null
}

// ─── Helpers ─────────────────────────────────────────────────

function daysAgo(iso: string | null): number {
  if (!iso) return 0
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function hoursAgo(iso: string | null): number {
  if (!iso) return 0
  const diff = Date.now() - new Date(iso).getTime()
  return Math.floor(diff / (1000 * 60 * 60))
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}


function urgencyBadge(horas: number) {
  if (horas > 24) return 'bg-[rgba(139,46,46,0.1)] text-empire-danger border-empire-danger/20'
  if (horas > 2) return 'bg-[rgba(201,162,64,0.12)] text-empire-primary border-[rgba(201,162,64,0.25)]'
  return 'bg-empire-elevated text-empire-subtle'
}

function parseTags(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map(String)
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch {
      // não é JSON: cai no split por vírgula abaixo
    }
    return raw.split(',').map((tag) => tag.trim()).filter(Boolean)
  }
  return []
}

function isBlockedContact(tags: unknown): boolean {
  return parseTags(tags).some((tag) => tag.toLowerCase() === 'bloquear')
}

// ─── Quadrant 1: Não Respondem ────────────────────────────────

function diasNaBase(dataLeadRecebido: string | null): number {
  if (!dataLeadRecebido) return 0
  return Math.floor((Date.now() - new Date(dataLeadRecebido).getTime()) / 86400000)
}

function NaoRespondemQuadrant({
  leads,
  total,
  loading,
  onLeadClick,
  onAnalyzeAi,
  aiLoading,
  aiInsight,
}: {
  leads: LeadParado[]
  total: number
  loading: boolean
  onLeadClick: (oppId: string) => void
  onAnalyzeAi: (leads: LeadParado[]) => void
  aiLoading: boolean
  aiInsight: AiInsight | null
}) {
  const [open, setOpen] = useState(true)
  const [inboundMap, setInboundMap] = useState<Map<string, number>>(new Map())

  useEffect(() => {
    async function loadInboundCounts() {
      const ids = leads
        .map((l) => l.contato_id)
        .filter((id): id is string => Boolean(id))
      if (!ids.length) {
        setInboundMap(new Map())
        return
      }
      const { data } = await supabase
        .rpc('get_inbound_count_by_contato', { p_contato_ids: ids })
      const map = new Map<string, number>()
      for (const row of (data ?? []) as { contato_id: string; total_inbound: string }[]) {
        map.set(row.contato_id, Number(row.total_inbound))
      }
      setInboundMap(map)
    }
    void loadInboundCounts()
  }, [leads])

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-empire-border px-4 py-3 cursor-pointer select-none hover:bg-empire-elevated transition-colors" onClick={() => setOpen(o => !o)}>
        <div className="flex items-center gap-2">
          <ChevronDown className={cn('h-4 w-4 text-empire-subtle transition-transform', !open && '-rotate-90')} />
          <Phone className="h-4 w-4 text-empire-primary" />
          <h3 className="text-sm font-semibold">Não Respondem</h3>
          {!loading && <Badge variant="secondary" className="text-xs">{total > 100 ? `${leads.length} de ${total}` : leads.length}</Badge>}
        </div>
        {!loading && leads.length > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onAnalyzeAi(leads)
            }}
            disabled={aiLoading}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
              'border-empire-border text-empire-void hover:bg-empire-surface disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Analisar com IA
          </button>
        )}
      </div>

      {open && (
        <>
          {/* AI Insight Card */}
          {aiInsight && (
        <div className="border-b border-empire-border bg-empire-elevated px-4 py-3 space-y-3">
          {aiInsight.padroes.length > 0 && (
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-empire-subtle mb-1.5">Padrões detectados</p>
              <ul className="space-y-1">
                {aiInsight.padroes.map((p, i) => (
                  <li key={i} className="text-xs text-empire-void flex gap-2">
                    <span className="text-empire-subtle shrink-0">•</span>{p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {aiInsight.recomendacoes.length > 0 && (
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-empire-subtle mb-1.5">Recomendações</p>
              <ul className="space-y-1">
                {aiInsight.recomendacoes.map((r, i) => (
                  <li key={i} className="text-xs text-empire-void flex gap-2">
                    <span className="text-[rgba(45,125,74,0.6)] shrink-0">→</span>{r}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : leads.length === 0 ? (
        <p className="p-6 text-sm text-center text-empire-muted">Nenhum lead nessa situação.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-empire-elevated border-b border-empire-border">
            <tr>
              <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Nome</th>
              <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">SDR</th>
              <th className="px-4 py-2 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Tentativas</th>
              <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Última</th>
              <th className="px-4 py-2 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Dias sem contato</th>
              <th className="px-4 py-2 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Dias na base</th>
              <th className="px-4 py-2 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Msgs</th>
              <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Canal</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.opp_id}
                className="border-t border-empire-border hover:bg-empire-elevated cursor-pointer transition-colors"
                onClick={() => onLeadClick(lead.opp_id)}
              >
                <td className="px-4 py-2.5 font-medium">{lead.nome ?? '—'}</td>
                <td className="px-4 py-2.5 text-empire-muted text-xs">{lead.sdr ?? '—'}</td>
                <td className="px-4 py-2.5 text-right text-empire-muted">{lead.tentativas}</td>
                <td className="px-4 py-2.5 text-empire-muted text-xs">{fmtDatetime(lead.ultima_tentativa)}</td>
                <td className="px-4 py-2.5 text-right">
                  <span className={cn('text-xs font-medium', lead.dias_sem_contato > 7 ? 'text-empire-danger' : lead.dias_sem_contato > 3 ? 'text-empire-primary' : 'text-empire-subtle')}>
                    {lead.dias_sem_contato}d
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="text-xs font-mono text-empire-subtle">
                    {diasNaBase(lead.data_lead_recebido) > 0 ? `${diasNaBase(lead.data_lead_recebido)}d` : '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right">
                  {(() => {
                    const count = inboundMap.get(lead.contato_id)
                    if (count === undefined) return <span className="text-xs font-mono text-empire-subtle">…</span>
                    return (
                      <span className={cn('text-xs font-mono px-1.5 py-0.5 rounded',
                        count === 0
                          ? 'bg-[rgba(139,46,46,0.1)] text-empire-danger'
                          : 'text-empire-subtle'
                      )}>
                        {count}
                      </span>
                    )
                  })()}
                </td>
                <td className="px-4 py-2.5 text-empire-muted text-xs">{lead.canal ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}
        </>
      )}
    </div>
  )
}

// ─── Quadrant 2: Aguardando SDR ───────────────────────────────

function AguardandoSdrQuadrant({
  leads,
  loading,
  onLeadClick,
}: {
  leads: AguardandoLead[]
  loading: boolean
  onLeadClick: (oppId: string) => void
}) {
  const [open, setOpen] = useState(true)

  return (
    <div className="rounded-xl border border-empire-border bg-empire-surface overflow-hidden">
      <div className="flex items-center gap-2 border-b border-empire-border px-4 py-3 cursor-pointer select-none hover:bg-empire-elevated transition-colors" onClick={() => setOpen(o => !o)}>
        <MessageSquare className="h-4 w-4 text-blue-400" />
        <h3 className="text-sm font-semibold">Aguardando Resposta do SDR</h3>
        {!loading && <Badge variant="secondary" className="text-xs">{leads.length}</Badge>}
        <ChevronDown className={cn('h-4 w-4 text-empire-subtle ml-auto transition-transform', !open && '-rotate-90')} />
      </div>

      {open && (
        <>
          {loading ? (
        <div className="p-4 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : leads.length === 0 ? (
        <p className="p-6 text-sm text-center text-empire-muted">Nenhum lead aguardando.</p>
      ) : (
        <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-empire-elevated border-b border-empire-border">
            <tr>
              <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Nome</th>
              <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">SDR</th>
              <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Última mensagem</th>
              <th className="px-4 py-2 text-right font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Aguardando</th>
              <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase text-empire-subtle">Estágio</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.opp_id}
                className="border-t border-empire-border hover:bg-empire-elevated cursor-pointer transition-colors"
                onClick={() => onLeadClick(lead.opp_id)}
              >
                <td className="px-4 py-2.5 font-medium">{lead.nome ?? '—'}</td>
                <td className="px-4 py-2.5 text-empire-muted text-xs">{lead.sdr ?? '—'}</td>
                <td className="px-4 py-2.5 text-empire-muted text-xs max-w-xs truncate">{lead.mensagem_trecho ?? '—'}</td>
                <td className="px-4 py-2.5 text-right">
                  <Badge variant="secondary" className={cn('text-xs border', urgencyBadge(lead.horas_aguardando))}>
                    {lead.horas_aguardando > 48
                      ? `${Math.floor(lead.horas_aguardando / 24)}d`
                      : `${lead.horas_aguardando}h`}
                  </Badge>
                </td>
                <td className="px-4 py-2.5 text-empire-muted text-xs">{lead.pipeline_name ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
          )}
        </>
      )}
    </div>
  )
}


// ─── Main component ───────────────────────────────────────────

export function LeadsParadosTab({ loading, pipelineMode = 'exclude_recuperacao' }: Props) {
  const [naoRespondem, setNaoRespondem] = useState<LeadParado[]>([])
  const [naoRespondemTotal, setNaoRespondemTotal] = useState(0)
  const [aguardando, setAguardando] = useState<AguardandoLead[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiInsight, setAiInsight] = useState<AiInsight | null>(null)

  useEffect(() => {
    let cancelled = false
    setDataLoading(true)

    async function loadData() {
      try {
        const wid = await getWorkspaceId()
        if (cancelled) return
        if (!wid) throw new Error('Conta não encontrada')

        const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
        const cutoffMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

        // Quadrant 1: Não respondem
        // Criteria: data_tentativa_2 IS NOT NULL + data_conectado IS NULL
        const [sourcesRes] = await Promise.all([
          supabase.from('utm_sources').select('utm_source, nome').eq('workspace_id', wid),
        ])

        if (cancelled) return

        const sourceNameMap = new Map<string, string>()
        for (const s of ((sourcesRes.data ?? []) as { utm_source: string; nome: string }[])) {
          if (s.utm_source && s.nome) sourceNameMap.set(s.utm_source, s.nome)
        }

        // Paginated fetch (max_rows=1000 limit no PostgREST)
        const q1Data: StalledOppRow[] = []
        let q1Page = 0
        const Q1_PAGE = 1000
        while (true) {
          const q1Base = supabase
            .from('oportunidades')
            .select(`
              id,
              sdr_name,
              data_tentativa_2, data_tentativa_8,
              data_tentativa_1, data_tentativa_3, data_tentativa_4,
              data_tentativa_5, data_tentativa_6, data_tentativa_7,
              data_fechado, data_perdido,
              data_conectado,
              data_lead_recebido,
              pipeline_id,
              pipeline_name,
              contatos(id, nome, utm_source, tags, owner_name)
            `)
            .eq('workspace_id', wid)
            .not('data_tentativa_2', 'is', null)
            .is('data_conectado', null)
            .is('data_fechado', null)
            .is('data_perdido', null)
          const q1Res = await (
            applyRecuperacaoFilter(q1Base as unknown as RecuperacaoQueryLike, pipelineMode) as unknown as typeof q1Base
          )
            .order('id')
            .range(q1Page * Q1_PAGE, (q1Page + 1) * Q1_PAGE - 1)
          if (cancelled) return
          // Embed many-to-one: em runtime o PostgREST retorna `contatos` como
          // objeto único; o tipo inferido pelo client não tipado diz array
          q1Data.push(...((q1Res.data ?? []) as unknown as StalledOppRow[]))
          if ((q1Res.data?.length ?? 0) < Q1_PAGE) break
          q1Page++
        }

        // For each, check last comunicacao date
        const contatoIds = q1Data.map((r) => r.contatos?.id).filter(Boolean) as string[]
        const lastComMap = new Map<string, string>()

        if (contatoIds.length > 0) {
          const comRes = await supabase
            .from('comunicacoes')
            .select('contato_id, data_comunicacao')
            .in('contato_id', contatoIds)
            .order('data_comunicacao', { ascending: false })
            .limit(Math.min(contatoIds.length * 3, 1000))

          if (cancelled) return

          for (const c of (comRes.data ?? []) as { contato_id: string; data_comunicacao: string }[]) {
            if (!lastComMap.has(c.contato_id)) {
              lastComMap.set(c.contato_id, c.data_comunicacao)
            }
          }
        }

        const q1Leads: LeadParado[] = q1Data
          .filter((r) => {
            if (isBlockedContact(r.contatos?.tags)) return false
            const contatoId = r.contatos?.id
            if (!contatoId) return true
            const lastCom = lastComMap.get(contatoId)
            if (!lastCom) return true
            return new Date(lastCom) < new Date(cutoff48h)
          })
          .map((r) => {
            const tentativas = [
              r.data_tentativa_1, r.data_tentativa_2, r.data_tentativa_3,
              r.data_tentativa_4, r.data_tentativa_5, r.data_tentativa_6,
              r.data_tentativa_7, r.data_tentativa_8,
            ].filter(Boolean)
            // Get the most recent attempt by date (not by array position)
            // Datas DATE "YYYY-MM-DD" ordenam lexicograficamente — reduce é suficiente e correto
            const lastTentativa = tentativas.length > 0
              ? tentativas.reduce((max, d) => (d ?? '') > (max ?? '') ? d : max)
              : null
            const contatoId = r.contatos?.id
            const lastCom = contatoId ? lastComMap.get(contatoId) : undefined

            return {
              opp_id: r.id,
              contato_id: r.contatos?.id ?? '',
              nome: r.contatos?.nome ?? null,
              sdr: r.sdr_name || r.contatos?.owner_name || null,
              tentativas: tentativas.length,
              ultima_tentativa: lastTentativa,
              dias_sem_contato: daysAgo(lastCom ?? lastTentativa),
              canal: (() => { const raw = r.contatos?.utm_source; if (!raw) return null; return sourceNameMap.get(raw) ?? raw })(),
              pipeline_name: r.pipeline_name,
              data_lead_recebido: r.data_lead_recebido ?? null,
            }
          })
          .sort((a, b) => b.dias_sem_contato - a.dias_sem_contato)

        setNaoRespondemTotal(q1Leads.length)
        setNaoRespondem(q1Leads.slice(0, 100))

        // Quadrant 2: Aguardando SDR (last comunicacao has direction='inbound')
        // Paginação: buscar TODAS as comunicações (inbound + outbound manual) dos últimos 30 dias
        const PAGE_SIZE = 1000
        let allComs: {
          contato_id: string
          direction: string
          ghl_source: string | null
          data_comunicacao: string
          mensagem_body: string | null
          sdr_name: string | null
        }[] = []
        let comPage = 0
        while (true) {
          const res = await supabase
            .from('comunicacoes')
            .select('contato_id, direction, ghl_source, data_comunicacao, mensagem_body, sdr_name')
            .eq('workspace_id', wid)
            .or('direction.eq.inbound,and(direction.eq.outbound,channel.in.(call,whatsapp,sms),ghl_source.in.(app,api))')
            .gt('data_comunicacao', cutoffMonth)
            .not('contato_id', 'is', null)
            .order('data_comunicacao', { ascending: false })
            .range(comPage * PAGE_SIZE, (comPage + 1) * PAGE_SIZE - 1)

          if (cancelled) return
          if (res.error) throw res.error

          allComs = allComs.concat((res.data ?? []) as typeof allComs)
          if ((res.data?.length ?? 0) < PAGE_SIZE) break
          comPage++
        }

        // Para cada contato: qual foi a ÚLTIMA comunicação?
        // allComs está ordenado DESC por data — a primeira ocorrência de cada contato é a mais recente
        const latestPerContato = new Map<string, {
          direction: string
          data_comunicacao: string
          msg: string | null
          sdr: string | null
        }>()
        for (const com of allComs) {
          if (!com.contato_id) continue
          if (!latestPerContato.has(com.contato_id)) {
            latestPerContato.set(com.contato_id, {
              direction: com.direction,
              data_comunicacao: com.data_comunicacao,
              msg: com.mensagem_body,
              sdr: com.sdr_name,
            })
          }
        }

        // Aguardando = última comunicação foi inbound (lead enviou, SDR não respondeu ainda)
        const aguardandoContatoIds = [...latestPerContato.entries()]
          .filter(([, v]) => v.direction === 'inbound')
          .map(([contatoId]) => contatoId)

        const inboundMap = new Map(
          [...latestPerContato.entries()]
            .filter(([, v]) => v.direction === 'inbound')
            .map(([id, v]) => [id, { msg: v.msg, data_comunicacao: v.data_comunicacao, sdr: v.sdr }])
        )

        const awaiting: AguardandoLead[] = []

        if (aguardandoContatoIds.length > 0) {
          // Build opp map for these contacts
          // Batch in chunks of 300 contact IDs to keep .in() query manageable
          const CHUNK = 300
          const allOppData: AwaitingOppRow[] = []
          for (let ci = 0; ci < aguardandoContatoIds.length; ci += CHUNK) {
            const chunk = aguardandoContatoIds.slice(ci, ci + CHUNK)
            const oppBase = supabase
              .from('oportunidades')
              .select('id, contato_id, pipeline_id, pipeline_name, data_lead_recebido, data_fechado, data_perdido, contatos(nome, tags)')
              .in('contato_id', chunk)
              .is('data_fechado', null)
              .is('data_perdido', null)
            const oppRes = await (
              applyRecuperacaoFilter(oppBase as unknown as RecuperacaoQueryLike, pipelineMode) as unknown as typeof oppBase
            )
              .order('data_lead_recebido', { ascending: false })
              .limit(1000)
            if (cancelled) return
            allOppData.push(...(oppRes.data ?? []))
          }

          const oppRes = { data: allOppData }

          if (cancelled) return

          const oppByContato = new Map<string, { opp_id: string; pipeline_name: string | null; nome: string | null }>()
          for (const o of (oppRes.data ?? [])) {
            if (!oppByContato.has(o.contato_id)) {
              const contatos = Array.isArray(o.contatos) ? o.contatos[0] : o.contatos
              if (isBlockedContact(contatos?.tags)) continue
              oppByContato.set(o.contato_id, { opp_id: o.id, pipeline_name: o.pipeline_name, nome: contatos?.nome ?? null })
            }
          }

          for (const [contatoId, inbound] of inboundMap.entries()) {
            const opp = oppByContato.get(contatoId)
            if (!opp) continue

            awaiting.push({
              opp_id: opp.opp_id,
              contato_id: contatoId,
              nome: opp.nome,
              sdr: inbound.sdr,
              mensagem_trecho: inbound.msg ? inbound.msg.slice(0, 60) + (inbound.msg.length > 60 ? '…' : '') : null,
              horas_aguardando: hoursAgo(inbound.data_comunicacao),
              pipeline_name: opp.pipeline_name,
              stage: null,
            })
          }
        }

        setAguardando(awaiting.sort((a, b) => b.horas_aguardando - a.horas_aguardando).slice(0, 50))
      } catch (err) {
        console.error('[LeadsParadosTab]', err)
      } finally {
        if (!cancelled) setDataLoading(false)
      }
    }

    void loadData()
    return () => { cancelled = true }
  }, [pipelineMode])

  const handleAnalyzeAi = async (leads: LeadParado[]) => {
    setAiLoading(true)
    setAiInsight(null)
    try {
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Conta não encontrada')

      const payload = {
        workspace_id: workspaceId,
        leads: leads.slice(0, 30).map((l) => ({
          nome: l.nome,
          tentativas: l.tentativas,
          ultima_tentativa: l.ultima_tentativa,
          canal: l.canal,
          dias_sem_contato: l.dias_sem_contato,
        })),
      }

      const { data, error } = await supabase.functions.invoke('prevendas-ai', { body: payload })
      if (error) throw error

      setAiInsight((data as { resultado: AiInsight }).resultado)
    } catch (err) {
      console.error('[LeadsParadosTab] AI error', err)
    } finally {
      setAiLoading(false)
    }
  }

  const isLoading = loading || dataLoading

  return (
    <div className="space-y-6">
      <NoShowsPendentesCard loading={isLoading} />

      {/* Quadrant 1 */}
      <NaoRespondemQuadrant
        leads={naoRespondem}
        total={naoRespondemTotal}
        loading={isLoading}
        onLeadClick={setSelectedOppId}
        onAnalyzeAi={handleAnalyzeAi}
        aiLoading={aiLoading}
        aiInsight={aiInsight}
      />

      {/* Quadrant 2 */}
      <AguardandoSdrQuadrant
        leads={aguardando}
        loading={isLoading}
        onLeadClick={setSelectedOppId}
      />

      {/* Lead Card Drawer */}
      <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
    </div>
  )
}
