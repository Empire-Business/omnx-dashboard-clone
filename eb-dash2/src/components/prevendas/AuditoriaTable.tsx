import React, { useState } from 'react'
import { AlertTriangle, AlertCircle, Zap, Clock, MessageSquareOff, Users, MessageSquareWarning, ExternalLink, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConversaPreview } from './ConversaPreview'
import type { ProblemaIA, ProblemaTipo, Severidade } from '@/hooks/useAuditoriaIA'

/**
 * Um contato de campanha acumula dezenas de tags operacionais
 * (`disparo_050826bpo`, `nao-respondeu-...`, `entregue ws ...`) que enterram as
 * poucas tags que importam para a auditoria. Separa as duas famílias e mantém
 * o ruído recolhido atrás de um clique.
 */
const TAG_RUIDO = /^(disparo|nao-respondeu|entregue|apto-para-disparar)/i

function TagList({ tags }: { tags: string[] | null }) {
  const [verTudo, setVerTudo] = useState(false)

  const limpas = (tags ?? []).map((t) => t.trim()).filter(Boolean)
  if (limpas.length === 0) return null

  const relevantes = limpas.filter((t) => !TAG_RUIDO.test(t))
  const operacionais = limpas.filter((t) => TAG_RUIDO.test(t))
  const visiveis = verTudo ? [...relevantes, ...operacionais] : relevantes.slice(0, 8)
  const ocultas = limpas.length - visiveis.length

  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-empire-subtle">Tags</p>
      <div className="flex flex-wrap gap-1">
        {visiveis.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="rounded-full bg-empire-border/60 px-2 py-0.5 text-[10px] text-empire-muted"
            title={tag}
          >
            {tag}
          </span>
        ))}
        {ocultas > 0 && !verTudo && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setVerTudo(true)
            }}
            className="rounded-full bg-empire-border/40 px-2 py-0.5 text-[10px] font-medium text-empire-subtle transition-colors hover:bg-empire-border/70 hover:text-empire-void"
          >
            +{ocultas} de campanha
          </button>
        )}
        {verTudo && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setVerTudo(false)
            }}
            className="rounded-full bg-empire-border/40 px-2 py-0.5 text-[10px] font-medium text-empire-subtle transition-colors hover:bg-empire-border/70 hover:text-empire-void"
          >
            recolher
          </button>
        )}
      </div>
    </div>
  )
}

type AuditoriaTableProps = {
  problemas: ProblemaIA[]
  loading: boolean
  onLeadClick: (oppId: string | null) => void
}

const TIPO_CONFIG: Record<ProblemaTipo, { label: string; icon: React.ReactNode; colorClass: string }> = {
  sem_followup: {
    label: 'Sem Follow-up',
    icon: <MessageSquareOff className="h-3.5 w-3.5" />,
    colorClass: 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
  },
  erro_entrega: {
    label: 'Erro de Entrega',
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    colorClass: 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
  },
  spam: {
    label: 'Spam/Excesso',
    icon: <Zap className="h-3.5 w-3.5" />,
    colorClass: 'bg-amber-500/12 text-amber-700 dark:text-amber-300'
  },
  horario_inadequado: {
    label: 'Horário Inadequado',
    icon: <Clock className="h-3.5 w-3.5" />,
    colorClass: 'bg-slate-500/12 text-slate-600 dark:text-slate-300'
  },
  conversa_unilateral: {
    label: 'Conversa Unilateral',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
    colorClass: 'bg-violet-500/12 text-violet-700 dark:text-violet-300'
  },
  conflito_humano: {
    label: 'Conflito IA/Humano',
    icon: <Users className="h-3.5 w-3.5" />,
    colorClass: 'bg-sky-500/12 text-sky-700 dark:text-sky-300'
  },
  reclamacao_lead: {
    label: 'Reclamação do Lead',
    icon: <MessageSquareWarning className="h-3.5 w-3.5" />,
    colorClass: 'bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300'
  }
}

const DEFAULT_TIPO_CONFIG = {
  label: 'Desconhecido',
  icon: <AlertCircle className="h-3.5 w-3.5" />,
  colorClass: 'bg-slate-500/12 text-slate-600 dark:text-slate-300'
}

const SEVERIDADE_CONFIG: Record<Severidade, { label: string; colorClass: string; barClass: string }> = {
  alta: { label: 'Alta', colorClass: 'bg-rose-500/12 text-rose-700 dark:text-rose-300', barClass: 'bg-rose-500' },
  media: { label: 'Média', colorClass: 'bg-amber-500/14 text-amber-700 dark:text-amber-300', barClass: 'bg-amber-500' },
  baixa: { label: 'Baixa', colorClass: 'bg-slate-500/12 text-slate-600 dark:text-slate-300', barClass: 'bg-slate-400' }
}

const DEFAULT_SEVERIDADE_CONFIG = {
  label: 'Baixa',
  colorClass: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
  barClass: 'bg-slate-400'
}

function getTipoConfig(tipo: string) {
  return TIPO_CONFIG[tipo as ProblemaTipo] ?? DEFAULT_TIPO_CONFIG
}

function getSeveridadeConfig(severidade: string) {
  return SEVERIDADE_CONFIG[severidade as Severidade] ?? DEFAULT_SEVERIDADE_CONFIG
}

export function AuditoriaTable({ problemas, loading, onLeadClick }: AuditoriaTableProps) {
  const [sortField, setSortField] = useState<'ultima_interacao' | 'severidade' | 'tipo'>('ultima_interacao')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const sortedProblemas = [...problemas].sort((a, b) => {
    if (sortField === 'ultima_interacao') {
      const aTime = a.ultima_interacao?.getTime() || 0
      const bTime = b.ultima_interacao?.getTime() || 0
      return sortDirection === 'desc' ? bTime - aTime : aTime - bTime
    }
    if (sortField === 'severidade') {
      const order = { alta: 3, media: 2, baixa: 1 }
      const aVal = order[a.severidade] || 0
      const bVal = order[b.severidade] || 0
      return sortDirection === 'desc' ? bVal - aVal : aVal - bVal
    }
    if (sortField === 'tipo') {
      return sortDirection === 'desc' 
        ? b.tipo.localeCompare(a.tipo) 
        : a.tipo.localeCompare(b.tipo)
    }
    return 0
  })

  const toggleSort = (field: 'ultima_interacao' | 'severidade' | 'tipo') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-empire-border bg-empire-elevated p-6">
        <div className="animate-pulse space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-empire-border/40" />
          ))}
        </div>
      </div>
    )
  }

  if (problemas.length === 0) {
    return (
      <div className="rounded-2xl border border-empire-border bg-empire-elevated p-12 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-600">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <p className="font-display text-lg font-semibold text-empire-void">Nenhum problema detectado</p>
        <p className="mt-1.5 text-sm text-empire-subtle">
          Nenhum lead atendido pela IA apresentou problema no período e nos filtros selecionados.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-empire-border bg-empire-elevated">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-empire-border bg-empire-surface">
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-empire-subtle">Lead</th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-empire-subtle">SDR Humano</th>
              <th
                className="cursor-pointer px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-empire-subtle transition-colors hover:text-empire-void"
                onClick={() => toggleSort('tipo')}
              >
                <div className="flex items-center gap-1">
                  Tipo
                  {sortField === 'tipo' && (
                    sortDirection === 'desc' ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />
                  )}
                </div>
              </th>
              <th
                className="cursor-pointer px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-empire-subtle transition-colors hover:text-empire-void"
                onClick={() => toggleSort('severidade')}
              >
                <div className="flex items-center gap-1">
                  Severidade
                  {sortField === 'severidade' && (
                    sortDirection === 'desc' ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />
                  )}
                </div>
              </th>
              <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-empire-subtle">Detalhes</th>
              <th
                className="cursor-pointer px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-empire-subtle transition-colors hover:text-empire-void"
                onClick={() => toggleSort('ultima_interacao')}
              >
                <div className="flex items-center gap-1">
                  Última Interação
                  {sortField === 'ultima_interacao' && (
                    sortDirection === 'desc' ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />
                  )}
                </div>
              </th>
              <th className="px-4 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-empire-subtle">Ações</th>
            </tr>
          </thead>
          <tbody>
            {sortedProblemas.map((p) => {
              const tipoConfig = getTipoConfig(p.tipo)
              const sevConfig = getSeveridadeConfig(p.severidade)
              const isExpanded = expandedId === p.id

              return (
                <React.Fragment key={p.id}>
                  <tr
                    className={cn(
                      'cursor-pointer border-b border-empire-border/70 transition-colors',
                      isExpanded ? 'bg-empire-surface' : 'hover:bg-empire-surface/60'
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  >
                    <td className="relative py-3 pl-5 pr-4">
                      {/* faixa de severidade — leitura de gravidade sem depender de cor de badge */}
                      <span
                        aria-hidden
                        className={cn('absolute left-0 top-2 bottom-2 w-[3px] rounded-full', sevConfig.barClass)}
                      />
                      <p className="font-medium leading-tight text-empire-void">{p.contato_nome || 'Sem nome'}</p>
                      {p.contato_telefone && (
                        <p className="mt-0.5 text-xs tabular-nums text-empire-subtle">{p.contato_telefone}</p>
                      )}
                      {p.contato_email && (
                        <p className="truncate text-xs text-empire-subtle" title={p.contato_email}>
                          {p.contato_email}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-empire-void">{p.sdr_humano || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${tipoConfig.colorClass}`}>
                          {tipoConfig.icon}
                          {tipoConfig.label}
                        </span>
                        {p.outros_problemas && p.outros_problemas.length > 0 && (
                          <div className="group relative">
                            <span className="inline-flex cursor-default select-none items-center rounded-full bg-empire-border/60 px-2 py-0.5 text-xs font-semibold tabular-nums text-empire-subtle">
                              +{p.outros_problemas.length}
                            </span>
                            <div className="absolute left-0 top-7 z-30 hidden min-w-[200px] rounded-xl border border-empire-border bg-empire-elevated p-2 shadow-xl group-hover:block">
                              <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-empire-subtle">Outros problemas</p>
                              <div className="space-y-1">
                                {p.outros_problemas.map((op, i) => {
                                  const cfg = getTipoConfig(op.tipo)
                                  return (
                                    <div key={i} className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${cfg.colorClass}`}>
                                      {cfg.icon}
                                      <span>{cfg.label}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${sevConfig.colorClass}`}>
                        {sevConfig.label}
                      </span>
                    </td>
                    <td className="max-w-[380px] px-4 py-3">
                      <p className="line-clamp-2 text-sm leading-snug text-empire-void" title={p.detalhes}>
                        {p.detalhes}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <p className="text-sm tabular-nums text-empire-subtle">
                        {p.ultima_interacao
                          ? new Date(p.ultima_interacao).toLocaleDateString('pt-BR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onLeadClick(p.opp_id)
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-empire-border bg-empire-surface px-2.5 py-1.5 text-xs font-medium text-empire-void transition-colors hover:border-empire-border-strong hover:bg-empire-elevated disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!p.opp_id}
                        title={p.opp_id ? 'Abrir detalhes do lead' : 'Lead sem oportunidade vinculada'}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Ver Lead
                      </button>
                    </td>
                  </tr>
                  
                  {isExpanded && (
                    <tr className="border-b border-empire-border bg-empire-surface">
                      <td colSpan={7} className="px-5 py-4">
                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                          {/* Conversa */}
                          <div>
                            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-empire-subtle">
                              Conversa
                            </p>
                            <ConversaPreview contatoId={p.contato_id} ancora={p.ultima_interacao ?? null} />
                          </div>

                          {/* Lateral: ações + tags */}
                          <div className="space-y-4">
                            <div>
                              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-empire-subtle">
                                Ações sugeridas
                              </p>
                              <ul className="space-y-1">
                                {p.acoes_sugeridas.map((acao, i) => (
                                  <li key={i} className="flex items-start gap-2 text-sm leading-snug text-empire-void">
                                    <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-empire-primary/60" />
                                    {acao}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <TagList tags={p.tags} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      
      <div className="flex items-center justify-between gap-3 border-t border-empire-border bg-empire-surface px-4 py-2.5">
        <p className="text-xs text-empire-subtle">
          <span className="font-semibold tabular-nums text-empire-void">{problemas.length}</span> lead
          {problemas.length !== 1 ? 's' : ''} com problema
        </p>
        <p className="text-xs text-empire-subtle">Clique na linha para ver as ações sugeridas</p>
      </div>
    </div>
  )
}