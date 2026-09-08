import { useEffect, useMemo, useState } from 'react'
import {
  RefreshCw, PhoneCall, ExternalLink,
  MessageSquare, Phone, Smartphone,
  Sparkles, Flame, CalendarClock,
} from 'lucide-react'
import { useDiscagemScore } from '@/hooks/useDiscagemScore'
import type { DiscagemScoreLead, DiscagemCamada, CanalSugerido, ReengajamentoLead, DiscagemScope } from '@/hooks/useDiscagemScore'
import { LeadCard } from '@/components/leads/LeadCard'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { ghlContactUrlForLocation } from '@/lib/ghl'
import { useGhlLocationId } from '@/hooks/useGhlLocationId'

// ─── Helpers ──────────────────────────────────────────────────

// Dias na base contados por DIA DE CALENDARIO em Sao Paulo — nao por blocos de
// 24h corridas. A versao anterior usava `floor((agora - chegada) / 24h)`: um lead
// que chegou ontem as 15h44 ainda marcava 0 as 14h46 de hoje e aparecia como
// "Chegou hoje", contradizendo o proprio badge do banco ("1d na base") na mesma
// linha — e fazendo a fila parecer fora de ordem para quem confere pela data.
function fmtDiasNaBase(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // 'sv-SE' devolve YYYY-MM-DD; o Date de uma data pura e sempre UTC meia-noite,
  // entao a subtracao entre as duas da o numero exato de dias de calendario.
  const diaSP = (x: Date) => new Date(x.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }))
  const dias = Math.round((diaSP(new Date()).getTime() - diaSP(d).getTime()) / 86400000)
  if (dias <= 0) return 'Chegou hoje'
  if (dias === 1) return 'Chegou ontem'
  return `${dias}d na base`
}

// ─── Configuração visual por camada ───────────────────────────

const CAMADA_CFG: Record<DiscagemCamada, {
  label: string
  icon: string
  /** Texto do tooltip — explica ao SDR por que o lead esta nessa camada. */
  desc: string
  border: string
  badge: string
}> = {
  horario_marcado: {
    label: 'Task GHL',
    desc: 'Task GHL — o lead tem tarefa/retorno agendado no CRM para agora. É a maior prioridade da fila.',
    icon: '🔔',
    border: 'border-l-4 border-l-violet-500',
    badge: 'bg-violet-100 text-violet-700 border border-violet-200',
  },
  respondeu: {
    label: 'Respondeu',
    desc: 'Respondeu — o lead mandou mensagem e ainda não teve retorno. Fale enquanto está quente.',
    icon: '💬',
    border: 'border-l-4 border-l-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  },
  lead_novo: {
    label: 'Novo hoje',
    desc: 'Novo hoje — lead que acabou de entrar e nunca foi contatado. Ordenado por ordem de chegada.',
    icon: '🔴',
    border: 'border-l-4 border-l-red-500',
    badge: 'bg-red-100 text-red-700 border border-red-200',
  },
  cadencia: {
    label: 'Cadência',
    desc: 'Cadência — lead antigo sem resposta, no fluxo automático de novas tentativas de follow-up.',
    icon: '🔁',
    border: 'border-l-4 border-l-slate-400',
    badge: 'bg-slate-100 text-slate-600 border border-slate-200',
  },
}

const CANAL_CFG: Record<CanalSugerido, { icon: React.ReactNode; label: string }> = {
  call:      { icon: <Phone className="h-3.5 w-3.5" />,        label: 'Ligar' },
  whatsapp:  { icon: <MessageSquare className="h-3.5 w-3.5" />, label: 'WhatsApp' },
  sms:       { icon: <Smartphone className="h-3.5 w-3.5" />,    label: 'SMS' },
}

// ─── Card de lead individual ───────────────────────────────────

interface LeadRowProps {
  lead: DiscagemScoreLead
  posicao: number
  /** "Ligue para" so na ordem de urgencia — na ordem de chegada a posicao nao
   *  significa prioridade, e o rotulo mentiria para o SDR. */
  rotuloPosicao?: string
  onLeadClick: (id: string) => void
  /** Vem do pai: o location do CRM é o mesmo para a fila inteira — não faz
   *  sentido montar um hook por linha da lista. */
  ghlLocationId: string | null | undefined
}

function LeadRow({ lead, posicao, rotuloPosicao = 'Ligue para', onLeadClick, ghlLocationId }: LeadRowProps) {
  const cfg = CAMADA_CFG[lead.camada]
  const canal = CANAL_CFG[lead.canalSugerido]
  const ghlUrl = lead.ghlContactId ? ghlContactUrlForLocation(ghlLocationId, lead.ghlContactId) : null
  const telLimpo = lead.telefone?.replace(/\D/g, '') ?? ''
  const waLink = telLimpo ? `https://wa.me/55${telLimpo}` : null
  const diasLabel = fmtDiasNaBase(lead.dataEntradaLead)

  return (
    <div className={cn('rounded-xl border border-empire-border transition-colors group', cfg.border)}>
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-empire-elevated/40"
        onClick={() => onLeadClick(lead.oppId)}
      >
        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-semibold text-empire-subtle uppercase tracking-wide">
              {rotuloPosicao}
            </span>
            <span className="text-sm font-bold truncate text-empire-void">
              {posicao}. {lead.nome}
            </span>
            <span
              className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold cursor-help', cfg.badge)}
              title={cfg.desc}
            >
              {lead.razao}
            </span>
          </div>

          {/* Linha 2: telefone + dias na base + SDR */}
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {lead.telefone && (
              <span className="text-xs text-empire-subtle">{lead.telefone}</span>
            )}
            {diasLabel && (
              <span className="text-[10px] text-empire-subtle opacity-70">{diasLabel}</span>
            )}
            {lead.sdrName && (
              <span className="text-[10px] text-empire-subtle opacity-70">· {lead.sdrName}</span>
            )}
            {lead.telefoneDuplicado && (
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800"
                title="Outro lead da fila usa este mesmo telefone. O histórico de ligações e mensagens pode estar no outro registro — confira os dois antes de concluir que ninguém falou com este lead."
              >
                telefone repetido
              </span>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          {lead.telefone && (
            <a
              href={`tel:${lead.telefone}`}
              title="Ligar"
              className="rounded-lg border border-empire-border bg-empire-surface p-1.5 hover:bg-blue-50 hover:border-blue-200 transition-colors opacity-0 group-hover:opacity-100"
            >
              <Phone className="h-3.5 w-3.5 text-blue-600" />
            </a>
          )}
          {waLink && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              title="WhatsApp"
              className="rounded-lg border border-empire-border bg-empire-surface p-1.5 hover:bg-green-50 hover:border-green-200 transition-colors opacity-0 group-hover:opacity-100"
            >
              <MessageSquare className="h-3.5 w-3.5 text-green-600" />
            </a>
          )}
          {ghlUrl && (
            <a
              href={ghlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-empire-border bg-empire-surface px-2.5 py-1.5 text-xs font-medium text-empire-void hover:bg-empire-elevated transition-colors"
              title="Abrir no CRM"
            >
              {canal.icon}
              <ExternalLink className="h-3 w-3 opacity-50" />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Linha de reengajamento ────────────────────────────────────

interface ReengajamentoRowProps {
  lead: ReengajamentoLead
  onLeadClick: (id: string) => void
  ghlLocationId: string | null | undefined
}

function ReengajamentoRow({ lead, onLeadClick, ghlLocationId }: ReengajamentoRowProps) {
  const ghlUrl = lead.ghlContactId ? ghlContactUrlForLocation(ghlLocationId, lead.ghlContactId) : null

  return (
    <div
      className="flex items-start gap-3 px-4 py-3 rounded-xl border border-empire-border bg-empire-surface/60 hover:bg-empire-elevated transition-colors cursor-pointer"
      onClick={() => onLeadClick(lead.oppId)}
    >
      <Sparkles className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-empire-void truncate">{lead.nome}</p>
        <p className="text-[11px] text-empire-subtle mt-0.5 line-clamp-2">{lead.contexto}</p>
      </div>
      {ghlUrl && (
        <a
          href={ghlUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 shrink-0 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors"
        >
          Reabrir
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  )
}

// ─── Tab principal ─────────────────────────────────────────────

interface DiscagemTabProps {
  scope?: DiscagemScope
}

const SCOPE_CFG: Record<DiscagemScope, { eyebrow: string; emptyHint: string }> = {
  pre_vendas: { eyebrow: 'Pré-Vendas', emptyHint: 'Nenhum lead na fila agora.' },
  recuperacao: { eyebrow: 'Recuperação', emptyHint: 'Nenhum lead de recuperação na fila agora.' },
}

/** Quantos leads a fila mostra por vez. A fila de recuperação passa de 2 mil
 *  leads — renderizar tudo de uma vez trava a aba, e ninguém liga para o
 *  lead nº 800 antes do nº 1. */
const PAGE_RENDER_SIZE = 100

/**
 * Ordem da fila.
 *
 * `urgencia` (padrao) e a fila de verdade: score 0-1000 calculado pelo motor,
 * que poe hora marcada e quem respondeu na frente. `chegada` e uma visao
 * alternativa pedida pelo time comercial — mesma fila, so reordenada da chegada
 * mais recente para a mais antiga, para conferir "o que entrou hoje" sem
 * precisar cacar na lista. Nao muda quem esta na fila, so a ordem de exibicao.
 */
type OrdemFila = 'urgencia' | 'chegada'

const ORDEM_STORAGE_KEY = 'eb:discagem_ordem'

function lerOrdemSalva(): OrdemFila {
  if (typeof window === 'undefined') return 'urgencia'
  return window.localStorage.getItem(ORDEM_STORAGE_KEY) === 'chegada' ? 'chegada' : 'urgencia'
}

const ORDEM_CFG: Record<OrdemFila, { label: string; icon: typeof Flame; hint: string }> = {
  urgencia: {
    label: 'Urgência',
    icon: Flame,
    hint: 'Hora marcada e quem respondeu vêm primeiro — não é ordem de chegada.',
  },
  chegada: {
    label: 'Chegada',
    icon: CalendarClock,
    hint: 'Do lead mais recente para o mais antigo. A prioridade real continua sendo a de Urgência.',
  },
}

export function DiscagemTab({ scope = 'pre_vendas' }: DiscagemTabProps) {
  const [sdrFilter, setSdrFilter] = useState('')
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)
  const [visibleCount, setVisibleCount] = useState(PAGE_RENDER_SIZE)
  const [ordem, setOrdem] = useState<OrdemFila>(lerOrdemSalva)
  // Location do CRM buscado uma vez para a tela toda (antes era um hook por linha)
  const { data: ghlLocationId } = useGhlLocationId()

  // Trocar de SDR ou de escopo é uma fila nova — voltar ao topo evita manter
  // 1.500 linhas montadas de uma consulta que nem existe mais.
  useEffect(() => { setVisibleCount(PAGE_RENDER_SIZE) }, [sdrFilter, scope, ordem])

  // A escolha sobrevive ao F5 — a aba recarrega sozinha a cada 30s e o SDR nao
  // deveria ter que reescolher a ordem o tempo todo.
  useEffect(() => { window.localStorage.setItem(ORDEM_STORAGE_KEY, ordem) }, [ordem])

  const {
    leads, reengajamento,
    total, ligacoesHoje,
    isAdmin, sdrOptions,
    loading, refreshing, loadingReengajamento, error,
    reload,
  } = useDiscagemScore(sdrFilter, scope)

  // Reordenacao so de exibicao: `leads` ja vem ordenado por score do hook, e a
  // copia evita mutar o array do estado (sort e in-place).
  const leadsOrdenados = useMemo(() => {
    if (ordem === 'urgencia') return leads
    return [...leads].sort((a, b) => {
      const ta = a.dataEntradaLead ? new Date(a.dataEntradaLead).getTime() : null
      const tb = b.dataEntradaLead ? new Date(b.dataEntradaLead).getTime() : null
      // Sem data de chegada vai para o fim — nao da para afirmar que e recente.
      if (ta === null && tb === null) return b.score - a.score
      if (ta === null) return 1
      if (tb === null) return -1
      // Empate na data cai no score, para nao embaralhar a cada refresh.
      return tb - ta || b.score - a.score
    })
  }, [leads, ordem])

  const scopeCfg = SCOPE_CFG[scope]

  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long',
  })

  const tableNotReady = error?.includes('does not exist') || error?.includes('relation') || false

  // Contagem por camada para exibição no KPI
  const contadorPorCamada = leads.reduce<Partial<Record<DiscagemCamada, number>>>(
    (acc, lead) => ({ ...acc, [lead.camada]: (acc[lead.camada] ?? 0) + 1 }),
    {}
  )

  return (
    <div className="space-y-5 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-empire-primary mb-1">{scopeCfg.eyebrow}</p>
          <h2 className="font-display text-2xl font-semibold text-empire-void">Fila de Discagem</h2>
          <p className="mt-1 text-sm text-empire-subtle capitalize">{hoje}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          {isAdmin && (
            <select
              value={sdrFilter}
              onChange={e => setSdrFilter(e.target.value)}
              className="h-8 px-3 text-xs focus:outline-none transition-colors min-w-[160px] text-empire-void bg-empire-elevated border-[1.5px] border-empire-border rounded-md"
            >
              <option value="">Todos os SDRs</option>
              {sdrOptions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          {/* Ordem da fila — urgencia (padrao) x chegada */}
          <div
            role="group"
            aria-label="Ordem da fila"
            className="inline-flex items-center rounded-lg border border-empire-border bg-empire-elevated p-0.5"
          >
            {(['urgencia', 'chegada'] as OrdemFila[]).map(o => {
              const cfg = ORDEM_CFG[o]
              const Icon = cfg.icon
              const ativo = ordem === o
              return (
                <button
                  key={o}
                  onClick={() => setOrdem(o)}
                  title={cfg.hint}
                  aria-pressed={ativo}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                    ativo
                      ? 'bg-empire-surface text-empire-void shadow-sm'
                      : 'text-empire-subtle hover:text-empire-void',
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {cfg.label}
                </button>
              )
            })}
          </div>
          <button
            onClick={reload}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-empire-border bg-empire-surface px-3 py-1.5 text-xs font-medium text-empire-void hover:bg-empire-elevated transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            Atualizar
          </button>
        </div>
      </div>

      {/* Erros */}
      {error && tableNotReady && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
          O sistema de prioridade dinâmica está sendo configurado. Tente novamente em alguns minutos.
        </div>
      )}
      {error && !tableNotReady && isAdmin && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <strong>Erro:</strong> {error}
        </div>
      )}

      {/* KPIs */}
      {loading ? (
        <Skeleton className="h-16 w-full rounded-xl" />
      ) : (
        <div className="rounded-xl border border-empire-border bg-empire-surface p-4 flex items-center gap-4">
          <div className="rounded-lg p-2.5">
            <PhoneCall className="h-5 w-5 text-empire-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-empire-subtle uppercase tracking-wider">
              Ligações hoje{sdrFilter ? ` · ${sdrFilter}` : ''}
            </p>
            <p className="text-2xl font-bold text-empire-void mt-0.5">{ligacoesHoje}</p>
          </div>
          {total > 0 && (
            <div className="ml-auto flex items-center gap-4">
              {(['horario_marcado', 'respondeu', 'lead_novo', 'cadencia'] as DiscagemCamada[]).map(c => {
                const count = contadorPorCamada[c] ?? 0
                if (!count) return null
                const cfg = CAMADA_CFG[c]
                return (
                  <div key={c} className="text-center cursor-help" title={cfg.desc}>
                    <p className="text-[10px] text-empire-subtle">{cfg.icon}</p>
                    <p className="text-lg font-bold text-empire-void">{count}</p>
                  </div>
                )
              })}
              <div className="h-8 w-px bg-empire-border" />
              <div className="text-center">
                <p className="text-[10px] text-empire-subtle">Total</p>
                <p className="text-lg font-bold text-empire-void">{total}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fila */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : total === 0 && !error ? (
        /* ── Fila vazia → Reengajamento ── */
        <div className="space-y-4">
          <div className="rounded-xl border border-empire-border bg-empire-elevated p-6 text-center">
            <PhoneCall className="h-8 w-8 mx-auto mb-2 text-empire-subtle opacity-40" />
            <p className="text-sm font-semibold text-empire-void">Fila zerada</p>
            <p className="text-xs text-empire-subtle mt-1">
              {sdrFilter ? `Nenhum lead ativo para ${sdrFilter}` : scopeCfg.emptyHint}
            </p>
          </div>

          {scope !== 'pre_vendas' ? null : loadingReengajamento ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          ) : reengajamento.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-semibold text-empire-void">Reengajar</p>
                <p className="text-xs text-empire-subtle">leads que responderam e podem retomar conversa</p>
              </div>
              {reengajamento.map(r => (
                <ReengajamentoRow key={r.oppId} lead={r} onLeadClick={setSelectedOppId} ghlLocationId={ghlLocationId} />
              ))}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-xs text-empire-subtle">Nenhuma sugestão de reengajamento disponível.</p>
              <button
                onClick={reload}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-empire-border bg-empire-surface px-3 py-1.5 text-xs font-medium text-empire-void hover:bg-empire-elevated transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Verificar novos leads
              </button>
            </div>
          )}
        </div>
      ) : !error ? (
        /* ── Lista plana por score — sem blocos de camada ── */
        <div className="space-y-1">
          {ordem === 'chegada' && (
            <div className="mb-2 flex items-start gap-2 rounded-lg border border-empire-border bg-empire-elevated px-3 py-2">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-empire-subtle" />
              <p className="text-[11px] text-empire-subtle">
                Ordenado por <strong className="text-empire-void">data de chegada</strong> — do mais
                recente para o mais antigo. A ordem de prioridade real da fila continua sendo a de{' '}
                <strong className="text-empire-void">Urgência</strong>.
              </p>
            </div>
          )}
          {leadsOrdenados.slice(0, visibleCount).map((lead, i) => (
            <LeadRow
              key={lead.oppId}
              lead={lead}
              posicao={i + 1}
              rotuloPosicao={ordem === 'chegada' ? 'Lead' : 'Ligue para'}
              onLeadClick={setSelectedOppId}
              ghlLocationId={ghlLocationId}
            />
          ))}
          {visibleCount < total && (
            <div className="pt-2 text-center">
              <button
                onClick={() => setVisibleCount(c => c + PAGE_RENDER_SIZE)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-empire-border bg-empire-surface px-3 py-1.5 text-xs font-medium text-empire-void hover:bg-empire-elevated transition-colors"
              >
                Carregar mais
                <span className="text-empire-subtle">({visibleCount} de {total})</span>
              </button>
            </div>
          )}
        </div>
      ) : null}

      {/* Legenda de cores */}
      {!loading && total > 0 && (
        <div className="flex items-center gap-4 pt-1 border-t border-empire-border flex-wrap">
          <p className="text-[10px] text-empire-subtle uppercase tracking-wider font-semibold">Legenda</p>
          {(['horario_marcado', 'respondeu', 'lead_novo', 'cadencia'] as DiscagemCamada[]).map(c => {
            const cfg = CAMADA_CFG[c]
            return (
              <span key={c} className="flex items-center gap-1 text-[10px] text-empire-subtle cursor-help" title={cfg.desc}>
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
              </span>
            )
          })}
          <span className="ml-auto text-[10px] text-empire-subtle italic">
            Retorno via tasks do GHL · atualiza a cada 30s
          </span>
        </div>
      )}

      <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
    </div>
  )
}
