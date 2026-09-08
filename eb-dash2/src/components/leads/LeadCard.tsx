import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink, User, Clock, DollarSign, FileText, MessageSquare, Phone, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { fetchLeadWithVendas } from '@/hooks/useLeads'
import type { LeadsFull, VendaPagamento, VendaComprovante } from '@/hooks/useLeads'
import { useLeadComunicacoes } from '@/hooks/useLeadComunicacoes'
import type { Comunicacao } from '@/hooks/useLeadComunicacoes'
import { parseTags } from '@/hooks/useTrafego'
import { fmtDate, fmtDateTime, fmtDateTimeGHL, fmtMsgDate } from '@/lib/utils/dates'
import { supabase } from '@/lib/supabase'
import { ghlContactUrlForLocation } from '@/lib/ghl'
import { useGhlLocationId } from '@/hooks/useGhlLocationId'
import { AppointmentOriginBadge } from '@/components/appointment-origin-badge'

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function truncate(s: string | null | undefined, len = 20): string {
  if (!s) return '—'
  return s.length > len ? `${s.slice(0, len)}…` : s
}

/** Outra oportunidade do mesmo contato que já registrou conexão/agendamento/reunião. */
interface OutraOpp {
  id: string
  pipeline_name: string | null
  status: string | null
  data_conectado: string | null
  data_agendamento_reuniao: string | null
  data_realizacao_vendas: string | null
}

// ─── Timeline ────────────────────────────────────────────────

interface TimelineEvent {
  label: string
  date: string | null | undefined
  type?: 'success' | 'warning' | 'danger' | 'default'
  badge?: React.ReactNode
}

function Timeline({ lead }: { lead: LeadsFull }) {
  const appointmentBadge = (
    <AppointmentOriginBadge
      origin={lead.agendamento_origem}
      calendarName={lead.agendamento_calendar_name}
      bookedByName={lead.agendamento_por_user_nome}
      assignedUserName={lead.agendamento_assigned_user_nome}
    />
  )

  const allEvents = [
    { label: 'Lead recebido', date: lead.data_lead_recebido, type: 'default' as const },
    { label: 'Tentativa 1', date: lead.data_tentativa_1, type: 'default' as const },
    { label: 'Tentativa 2', date: lead.data_tentativa_2, type: 'default' as const },
    { label: 'Tentativa 3', date: lead.data_tentativa_3, type: 'default' as const },
    { label: 'Tentativa 4', date: lead.data_tentativa_4, type: 'default' as const },
    { label: 'Tentativa 5', date: lead.data_tentativa_5, type: 'default' as const },
    { label: 'Tentativa 6', date: lead.data_tentativa_6, type: 'default' as const },
    { label: 'Tentativa 7', date: lead.data_tentativa_7, type: 'default' as const },
    { label: 'Tentativa 8', date: lead.data_tentativa_8, type: 'default' as const },
    { label: 'Conectado', date: lead.data_conectado, type: 'success' as const },
    { label: 'Qualificado', date: lead.data_qualificado, type: 'success' as const },
    { label: 'No-show (pré-venda)', date: lead.data_no_show, type: 'warning' as const },
    { label: 'Reunião agendada', date: lead.data_agendamento_reuniao, type: 'success' as const, badge: appointmentBadge },
    { label: 'Reunião de vendas agendada', date: lead.data_agendamento_vendas, type: 'success' as const, badge: appointmentBadge },
    { label: 'Reunião realizada', date: lead.data_realizacao_vendas, type: 'success' as const },
    { label: 'No-show (vendas)', date: lead.data_no_show_vendas, type: 'warning' as const },
    { label: 'Em negociação', date: lead.data_negociacao, type: 'warning' as const },
    { label: 'Pendência de preenchimento', date: lead.data_pendencias_preenchimento, type: 'warning' as const },
    { label: 'Venda fechada', date: lead.vendas_fechamento?.data_pagamento_entrada, type: 'success' as const },
    { label: 'Perdido (pré-venda)', date: lead.data_perdido, type: 'danger' as const },
    { label: 'Perdido (vendas)', date: lead.data_perdido_vendas, type: 'danger' as const },
  ]
  const events: TimelineEvent[] = allEvents.filter((e) => e.date)

  // Sort by date ascending
  events.sort((a, b) => {
    const da = a.date ? new Date(a.date).getTime() : 0
    const db = b.date ? new Date(b.date).getTime() : 0
    return da - db
  })

  if (!events.length) {
    return <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
  }

  const typeDotStyle: Record<string, React.CSSProperties> = {
    success: { background: 'var(--empire-success)' },
    warning: { background: 'var(--empire-primary)' },
    danger:  { background: 'var(--empire-danger)' },
    default: { background: 'var(--empire-primary)' },
  }

  return (
    <ol className="relative ml-3 space-y-4" style={{ borderLeft: '1px solid var(--empire-border)' }}>
      {events.map((e, i) => (
        <li key={i} className="ml-4">
          <span
            className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full"
            style={{ ...typeDotStyle[e.type ?? 'default'], border: '2px solid var(--empire-surface)' }}
          />
          <p className="text-sm font-medium text-foreground">{e.label}</p>
          <p className="text-xs text-muted-foreground">{fmtDate(e.date)}</p>
          {e.badge && <div className="mt-1.5">{e.badge}</div>}
        </li>
      ))}
    </ol>
  )
}

// ─── Tabs ─────────────────────────────────────────────────────

const CARD_TABS = [
  { key: 'dados', label: 'Dados', icon: User },
  { key: 'timeline', label: 'Timeline', icon: Clock },
  { key: 'financeiro', label: 'Financeiro', icon: DollarSign },
  { key: 'observacoes', label: 'Observações', icon: FileText },
  { key: 'comunicacoes', label: 'Comunicações', icon: MessageSquare },
] as const
type CardTab = (typeof CARD_TABS)[number]['key']

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-widest text-empire-subtle font-medium">{label}</span>
      <span className="text-sm text-foreground break-words">{value ?? '—'}</span>
    </div>
  )
}

function InfoBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div className="col-span-2 flex flex-col gap-0.5">
      <span className="text-[11px] uppercase tracking-widest text-empire-subtle font-medium">{label}</span>
      <span className="text-sm text-foreground whitespace-pre-wrap break-words">{value}</span>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 flex items-center gap-2 mt-2 mb-1">
      <div className="h-px flex-1" style={{ background: 'var(--empire-border)' }} />
      <span className="text-[10px] uppercase tracking-widest text-empire-subtle font-semibold shrink-0">
        {children}
      </span>
      <div className="h-px flex-1" style={{ background: 'var(--empire-border)' }} />
    </div>
  )
}

function tagBadgeClass(tag: string): string {
  const t = tag.toLowerCase().trim()
  if (t.startsWith('[fn]')) return 'border-empire-info/20 bg-empire-info/10 text-empire-info'
  if (t.startsWith('[cp]')) return 'border-empire-warning/20 bg-empire-warning/10 text-empire-warning'
  if (t === 'mql' || t === 'sql') return 'border-empire-success/20 bg-empire-success/10 text-empire-success'
  if (t === 'nmql' || t === 'nsql') return 'border-empire-danger/20 bg-empire-danger/10 text-empire-danger'
  return 'border-empire-border bg-empire-elevated text-empire-subtle'
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string
  value: string | null | undefined
  helper?: string | null | undefined
}) {
  if (!value) return null

  return (
    <div
      className="rounded-xl border px-3 py-2.5"
      style={{ borderColor: 'var(--empire-border)', background: 'linear-gradient(180deg, var(--empire-surface) 0%, var(--empire-elevated) 100%)' }}
    >
      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: 'var(--empire-subtle)' }}>
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground break-words">{value}</p>
      {helper && (
        <p className="mt-0.5 text-xs break-words" style={{ color: 'var(--empire-subtle)' }}>
          {helper}
        </p>
      )}
    </div>
  )
}

function QuestionAnswerCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="col-span-2 rounded-xl border px-4 py-3"
      style={{ borderColor: 'var(--empire-border)', background: 'linear-gradient(180deg, var(--empire-surface) 0%, var(--empire-elevated) 100%)' }}
    >
      <p className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: 'var(--empire-primary)' }}>
        Aplicação
      </p>
      <p className="mt-1 text-xs font-semibold" style={{ color: 'var(--empire-subtle)' }}>
        {label}
      </p>
      <p className="mt-2 text-sm leading-6 text-foreground whitespace-pre-wrap break-words">{value}</p>
    </div>
  )
}

function DadosTab({ lead }: { lead: LeadsFull }) {
  const c = lead.contatos
  const closerName = lead.vendedor_closer ?? null
  const hasSwot = c?.swot_forcas || c?.swot_fraquezas || c?.swot_oportunidades || c?.swot_ameacas
  const hasComplementar = c?.como_nos_conheceu || c?.investe_trafego || c?.disponibilidade_barra || c?.possiveis_objecoes
    || c?.faturamento_anual || c?.situacao_atual || c?.situacao_investimentos
  const applicationAnswers = lead.application_answers ?? []

  const followUps = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]
    .map(n => ({ n, val: (c as Record<string, unknown>)?.[`follow_up_${n}`] as string | null | undefined }))
    .filter(item => item.val)

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Identificação */}
      <SectionTitle>Identificação</SectionTitle>
      <InfoRow label="Email" value={c?.email} />
      <InfoRow label="Telefone" value={c?.telefone} />
      <InfoRow label="País" value={c?.country} />
      <InfoRow label="Pipeline" value={lead.pipeline_name} />
      <InfoRow label="Status" value={lead.status} />
      <InfoRow label="Data criação GHL" value={fmtDateTimeGHL(c?.date_created)} />

      {/* Time comercial */}
      {(lead.sdr_name || c?.owner_name || c?.owner_email || closerName || c?.closer_email) && (
        <>
          <SectionTitle>Time Comercial</SectionTitle>
          <InfoRow label="SDR" value={lead.sdr_name || c?.owner_name} />
          <InfoRow label="Email SDR" value={c?.owner_email} />
          <InfoRow label="Closer" value={closerName} />
          <InfoRow label="Email Closer" value={c?.closer_email} />
        </>
      )}

      {/* Aplicação */}
      {applicationAnswers.length > 0 && (
        <>
          <SectionTitle>Aplicação</SectionTitle>
          {applicationAnswers.map((answer) => (
            <QuestionAnswerCard key={answer.key} label={answer.label} value={answer.value} />
          ))}
        </>
      )}

      {/* Qualificação complementar */}
      {hasComplementar && (
        <>
          <SectionTitle>Qualificação Complementar</SectionTitle>
          <InfoRow label="Como nos conheceu" value={c?.como_nos_conheceu} />
          <InfoRow label="Investe em tráfego" value={c?.investe_trafego} />
          <InfoRow label="Disponibilidade" value={c?.disponibilidade_barra} />
          <InfoRow label="Faturamento anual" value={c?.faturamento_anual} />
          <InfoBlock label="Situação atual" value={c?.situacao_atual} />
          <InfoBlock label="Situação de investimentos" value={c?.situacao_investimentos} />
          <InfoBlock label="Possíveis objeções" value={c?.possiveis_objecoes} />
        </>
      )}

      {/* SWOT */}
      {hasSwot && (
        <>
          <SectionTitle>SWOT</SectionTitle>
          <InfoBlock label="Forças" value={c?.swot_forcas} />
          <InfoBlock label="Fraquezas" value={c?.swot_fraquezas} />
          <InfoBlock label="Oportunidades" value={c?.swot_oportunidades} />
          <InfoBlock label="Ameaças" value={c?.swot_ameacas} />
        </>
      )}

      {/* Follow-ups */}
      {followUps.length > 0 && (
        <>
          <SectionTitle>Follow-ups</SectionTitle>
          {followUps.map(({ n, val }) => (
            <InfoBlock key={n} label={`Follow-up ${n}`} value={val} />
          ))}
        </>
      )}

      {/* Perfil inteligente */}
      {c?.perfil_inteligente && (
        <>
          <SectionTitle>Perfil IA</SectionTitle>
          <InfoBlock label="Perfil inteligente" value={c.perfil_inteligente} />
        </>
      )}

      {/* Atribuição */}
      <SectionTitle>Atribuição</SectionTitle>
      <InfoRow label="UTM Source" value={c?.utm_source} />
      <InfoRow label="UTM Medium" value={c?.utm_medium} />
      <InfoRow label="UTM Campaign" value={c?.utm_campaign} />
      <InfoRow label="UTM Term" value={c?.utm_term} />
      <InfoRow label="UTM Content" value={c?.utm_content} />
      <InfoRow label="fbclid" value={truncate(c?.fbclid, 24)} />
      <InfoRow label="gclid" value={truncate(c?.gclid, 24)} />

      {/* Meta Ads extra (tt_) */}
      {(c?.tt_source || c?.tt_campaign || c?.tt_medium || c?.tt_term || c?.tt_content) && (
        <>
          <SectionTitle>Meta Ads (tt_)</SectionTitle>
          <InfoRow label="TT Source" value={c?.tt_source} />
          <InfoRow label="TT Campaign" value={c?.tt_campaign} />
          <InfoRow label="TT Medium" value={c?.tt_medium} />
          <InfoRow label="TT Term" value={c?.tt_term} />
          <InfoRow label="TT Content" value={c?.tt_content} />
        </>
      )}

      {/* Campos extras do GHL — sem correspondência no vocabulário fixo do
          OMNX, exibidos aqui só como informação. Nunca entram em
          métrica/funil (docs/GHL-CAMPOS-EXTRAS.md). */}
      {c?.custom_fields && Object.keys(c.custom_fields).length > 0 && (
        <>
          <SectionTitle>Campos extras do GHL</SectionTitle>
          {Object.entries(c.custom_fields).map(([key, value]) => (
            <InfoRow key={key} label={key.replace(/_/g, ' ')} value={value} />
          ))}
        </>
      )}
    </div>
  )
}

function FinanceiroTab({ lead }: { lead: LeadsFull }) {
  const v = lead.vendas_fechamento
  if (!v) {
    return <p className="text-sm text-muted-foreground">Sem dados de fechamento.</p>
  }

  const pagamentos = Array.isArray(v.pagamentos) ? v.pagamentos : []
  const temPagamentos = pagamentos.length > 0
  // Com lista detalhada (venda do omnx-desk) soma a lista; senão usa o modelo antigo.
  const valorFaturado = temPagamentos
    ? pagamentos.reduce((s, p) => s + (Number(p.valor) || 0), 0)
    : (v.valor_entrada ?? 0) + ((v.numero_parcelas ?? 0) * (v.valor_parcela ?? 0))

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* 1. Contratante */}
      <SectionTitle>Contratante</SectionTitle>
      <InfoRow label="Nome" value={v.nome_contratante} />
      <InfoRow label="CPF/CNPJ" value={v.cpf_cnpj_contratante} />
      {(v.closer_nome || v.closer_email) && (
        <InfoRow label="Closer" value={[v.closer_nome, v.closer_email].filter(Boolean).join(' · ')} />
      )}

      {/* 2. Endereço */}
      <SectionTitle>Endereço</SectionTitle>
      <InfoRow label="Logradouro" value={v.logradouro_rua_avenida} />
      <InfoRow label="Número" value={v.numero_endereco} />
      <InfoRow label="Complemento" value={v.complemento_endereco} />
      <InfoRow label="Bairro" value={v.bairro} />
      <InfoRow label="Município" value={v.municipio} />
      <InfoRow label="Estado" value={v.estado_uf} />
      <InfoRow label="CEP" value={v.cep} />

      {/* 3. Faturamento */}
      <SectionTitle>Faturamento</SectionTitle>
      <InfoRow label="Valor faturado" value={fmtCurrency(valorFaturado || null)} />
      {temPagamentos ? (
        <PagamentosList pagamentos={pagamentos} />
      ) : (
        <>
          <InfoRow label="Valor entrada" value={fmtCurrency(v.valor_entrada)} />
          <InfoRow label="Nº de parcelas" value={v.numero_parcelas != null ? String(v.numero_parcelas) : null} />
          <InfoRow label="Valor parcela" value={fmtCurrency(v.valor_parcela)} />
          <InfoRow label="Forma de pagamento" value={v.forma_pagamento} />
        </>
      )}
      <InfoRow label="Produto vendido" value={v.produto_vendido} />
      <InfoRow label="Data pagamento entrada" value={fmtDateTime(v.data_pagamento_entrada)} />

      {/* 4. Contrato */}
      <SectionTitle>Contrato</SectionTitle>
      <InfoRow label="Data de assinatura" value={fmtDate(v.data_da_assinatura_do_contrato)} />
      <div className="col-span-2">
        {v.op_link_do_contrato_assinado
          ? (
            <a
              href={v.op_link_do_contrato_assinado}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all"
            >
              Abrir contrato assinado ↗
            </a>
          )
          : <span className="text-sm text-foreground">—</span>
        }
      </div>

      {/* 5. Vencimentos das Parcelas */}
      <SectionTitle>Vencimentos das Parcelas</SectionTitle>
      <div className="col-span-2">
        {v.op_vencimentos_parcelas
          ? <span className="text-sm text-foreground whitespace-pre-wrap">{v.op_vencimentos_parcelas}</span>
          : <span className="text-sm text-foreground">—</span>
        }
      </div>

      {/* Comprovantes */}
      {Array.isArray(v.comprovantes) && v.comprovantes.length > 0 && (
        <>
          <SectionTitle>Comprovantes</SectionTitle>
          <ComprovantesGrid comprovantes={v.comprovantes} />
        </>
      )}

      {/* 5. Observações */}
      {v.observacoes_venda && (
        <>
          <SectionTitle>Observações</SectionTitle>
          <div className="col-span-2 flex flex-col gap-0.5">
            <span className="text-sm text-foreground whitespace-pre-wrap">{v.observacoes_venda}</span>
          </div>
        </>
      )}
    </div>
  )
}

function PagamentosList({ pagamentos }: { pagamentos: VendaPagamento[] }) {
  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-widest text-empire-subtle font-medium">Pagamentos</span>
      <div className="rounded-lg border overflow-hidden" style={{ borderColor: 'var(--empire-border)' }}>
        {pagamentos.map((p, i) => (
          <div
            key={i}
            className="grid grid-cols-5 gap-2 px-3 py-2 text-xs"
            style={{ borderTop: i > 0 ? '1px solid var(--empire-border)' : undefined }}
          >
            <span className="text-muted-foreground">{p.data ? fmtDate(p.data) : '—'}</span>
            <span className="font-medium text-foreground tabular-nums">{fmtCurrency(p.valor)}</span>
            <span className="text-foreground">{p.forma ?? '—'}</span>
            <span className="text-foreground">{p.plataforma ?? '—'}</span>
            <span className="text-muted-foreground">{p.sinal ?? '—'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ComprovantesGrid({ comprovantes }: { comprovantes: VendaComprovante[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  useEffect(() => {
    let active = true
    Promise.all(
      comprovantes.map(async (c) => {
        const { data } = await supabase.storage
          .from('vendas-comprovantes')
          .createSignedUrl(c.storage_path, 600)
        return [c.storage_path, data?.signedUrl ?? ''] as const
      }),
    ).then((entries) => {
      if (active) setUrls(Object.fromEntries(entries))
    })
    return () => {
      active = false
    }
  }, [comprovantes])

  return (
    <div className="col-span-2 grid grid-cols-4 gap-2">
      {comprovantes.map((c) => {
        const url = urls[c.storage_path]
        return (
          <a
            key={c.storage_path}
            href={url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="relative aspect-square rounded-lg border overflow-hidden flex items-center justify-center"
            style={{ borderColor: 'var(--empire-border)', background: 'var(--empire-elevated)' }}
            title={[c.sinal, c.nome_original].filter(Boolean).join(' · ')}
          >
            {url ? (
              <img src={url} alt={c.nome_original ?? 'comprovante'} className="w-full h-full object-cover" />
            ) : (
              <FileText className="h-5 w-5 text-muted-foreground" />
            )}
            {c.sinal && (
              <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[11px] font-medium px-1 py-0.5 truncate text-center">
                {c.sinal}
              </span>
            )}
          </a>
        )
      })}
    </div>
  )
}

function ObsBlock({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-empire-subtle font-medium mb-1">{label}</p>
      <p className="text-sm text-foreground whitespace-pre-wrap break-words">{value}</p>
    </div>
  )
}

function ObsSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <div className="h-px flex-1" style={{ background: 'var(--empire-border)' }} />
      <span className="text-[10px] uppercase tracking-widest text-empire-subtle font-semibold shrink-0">
        {children}
      </span>
      <div className="h-px flex-1" style={{ background: 'var(--empire-border)' }} />
    </div>
  )
}

function ObservacoesTab({ lead }: { lead: LeadsFull }) {
  const c = lead.contatos

  const hasCRM = lead.resumo_ia || lead.percepcao_closer || lead.lost_reason
  const hasAnalise = c?.comunicacao_veredito || c?.comunicacao_erros_atuais ||
    c?.comunicacao_tendencia_mercado || c?.analise_oferta_principal ||
    c?.banco_ideias_conteudo || c?.canais_venda_recomendados ||
    c?.analise_gap_pontos_fracos || c?.estudo_concorrentes ||
    c?.estrategia_antibrjection_scripts || c?.plano_acao_passo_a_passo

  const hasAnaliseId = c?.id_analise || c?.link_analise || c?.status_analise || c?.data_analise

  if (!hasCRM && !hasAnalise && !hasAnaliseId) {
    return <p className="text-sm text-muted-foreground">Sem observações.</p>
  }

  return (
    <div className="space-y-4">
      {hasCRM && (
        <>
          <ObsSectionTitle>CRM</ObsSectionTitle>
          <ObsBlock label="Resumo IA" value={lead.resumo_ia} />
          <ObsBlock label="Percepção do Closer" value={lead.percepcao_closer} />
          <ObsBlock label="Motivo de perda" value={lead.lost_reason} />
        </>
      )}

      {hasAnaliseId && (
        <>
          <ObsSectionTitle>Análise</ObsSectionTitle>
          <ObsBlock label="ID análise" value={c?.id_analise} />
          <ObsBlock label="Status análise" value={c?.status_analise} />
          <ObsBlock label="Data análise" value={c?.data_analise} />
          {c?.link_analise && (
            <div>
              <p className="text-[11px] uppercase tracking-widest text-empire-subtle font-medium mb-1">Link análise</p>
              <a
                href={c.link_analise}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline break-all"
              >
                {c.link_analise}
              </a>
            </div>
          )}
        </>
      )}

      {hasAnalise && (
        <>
          <ObsSectionTitle>Análise de Comunicação</ObsSectionTitle>
          <ObsBlock label="Veredito" value={c?.comunicacao_veredito} />
          <ObsBlock label="Erros atuais" value={c?.comunicacao_erros_atuais} />
          <ObsBlock label="Tendência de mercado" value={c?.comunicacao_tendencia_mercado} />
          <ObsBlock label="Análise da oferta principal" value={c?.analise_oferta_principal} />
          <ObsBlock label="Banco de ideias de conteúdo" value={c?.banco_ideias_conteudo} />
          <ObsBlock label="Canais de venda recomendados" value={c?.canais_venda_recomendados} />
          <ObsBlock label="Gap / Pontos fracos" value={c?.analise_gap_pontos_fracos} />
          <ObsBlock label="Estudo de concorrentes" value={c?.estudo_concorrentes} />
          <ObsBlock label="Estratégia anti-objeção" value={c?.estrategia_antibrjection_scripts} />
          <ObsBlock label="Plano de ação" value={c?.plano_acao_passo_a_passo} />
        </>
      )}
    </div>
  )
}

// ─── ComunicacoesTab ──────────────────────────────────────────

function fmtCallDuration(seconds: number | null | undefined): string {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WA',
  sms: 'SMS',
  email: 'Email',
  facebook: 'FB',
  instagram: 'IG',
  gmb: 'GMB',
  webchat: 'Chat',
  live_chat: 'Chat',
}

function channelLabel(channel: string | null): string {
  if (!channel) return ''
  return CHANNEL_LABEL[channel.toLowerCase()] ?? channel
}

function isAutomation(msg: Comunicacao): boolean {
  // Automation: no user OR from workflow/api/sequence source
  if (!msg.usuario_ghl_id) return true
  const src = msg.ghl_source?.toLowerCase() ?? ''
  return src === 'workflow' || src === 'api' || src === 'sequence' || src === 'automation'
}

function MsgStatusIcon({ status }: { status: string | null }) {
  if (!status) return null
  if (status === 'read') {
    return (
      <span style={{ color: 'var(--empire-primary)', fontSize: 11, lineHeight: 1 }} title="Lido">✓✓</span>
    )
  }
  if (status === 'delivered') {
    return <span style={{ fontSize: 11, lineHeight: 1 }} title="Entregue">✓✓</span>
  }
  if (status === 'sent' || status === 'sending') {
    return <span style={{ fontSize: 11, lineHeight: 1 }} title="Enviado">✓</span>
  }
  if (status === 'failed' || status === 'error') {
    return <span style={{ color: 'var(--empire-danger)', fontSize: 11, lineHeight: 1 }} title="Falhou">✗</span>
  }
  return null
}

function ChatBubble({ msg, prevMsg }: { msg: Comunicacao; prevMsg?: Comunicacao }) {
  const isInbound = msg.direction === 'inbound'
  const auto = !isInbound && isAutomation(msg)
  const failed = msg.msg_status === 'failed' || msg.msg_status === 'error'

  // Show sender label when SDR changes or it's the first outbound after inbound
  const showSenderChange =
    !isInbound &&
    !auto &&
    prevMsg &&
    (prevMsg.direction === 'inbound' ||
      (prevMsg.direction === 'outbound' && prevMsg.usuario_ghl_id !== msg.usuario_ghl_id))

  const chan = channelLabel(msg.channel)

  return (
    <div className={cn('flex flex-col mb-3', isInbound ? 'items-start' : 'items-end')}>
      {showSenderChange && (
        <span
          className="text-[10px] mb-0.5 px-1"
          style={{ color: 'var(--empire-subtle)' }}
        >
          {msg.usuario_ghl_id}
        </span>
      )}
      <div
        className={cn('relative max-w-[85%] rounded-xl px-3 py-2 text-sm break-words')}
        style={
          isInbound
            ? {
                background: 'var(--empire-canvas)',
                border: '1px solid var(--empire-border)',
                color: 'var(--empire-void)',
                borderTopLeftRadius: 4,
              }
            : auto
            ? {
                background: 'rgba(36,59,85,0.12)',
                border: '1px solid rgba(36,59,85,0.2)',
                color: 'var(--empire-void)',
                borderTopRightRadius: 4,
              }
            : {
                background: failed ? 'white' : 'var(--empire-primary)',
                border: failed ? '1.5px solid var(--empire-danger)' : 'none',
                color: failed ? 'var(--empire-void)' : 'white',
                borderTopRightRadius: 4,
              }
        }
      >
        {/* Channel badge */}
        {chan && (
          <span
            className="text-[11px] font-mono font-semibold px-1 py-0.5 rounded mr-1.5 inline-block"
            style={{
              background: isInbound ? 'var(--empire-border)' : 'rgba(255,255,255,0.15)',
              color: isInbound ? 'var(--empire-subtle)' : auto ? 'var(--empire-subtle)' : 'rgba(255,255,255,0.8)',
              verticalAlign: 'middle',
            }}
          >
            {chan}
          </span>
        )}
        {/* Auto badge */}
        {auto && (
          <span
            className="text-[11px] font-mono font-semibold px-1 py-0.5 rounded mr-1.5 inline-block"
            style={{ background: 'rgba(36,59,85,0.15)', color: 'var(--empire-subtle)', verticalAlign: 'middle' }}
          >
            auto
          </span>
        )}
        {msg.mensagem_body || <em style={{ opacity: 0.5 }}>(sem texto)</em>}
        {failed && msg.error_msg && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--empire-danger)' }}>
            {msg.error_msg}
          </p>
        )}
      </div>
      <div
        className={cn('flex items-center gap-1 mt-0.5 px-1', isInbound ? 'flex-row' : 'flex-row-reverse')}
        style={{ color: 'var(--empire-subtle)' }}
      >
        <span className="text-[10px]">{fmtMsgDate(msg.data_comunicacao)}</span>
        {!isInbound && <MsgStatusIcon status={msg.msg_status} />}
      </div>
    </div>
  )
}

function CallRow({ call }: { call: Comunicacao }) {
  const status = call.phone_call_status ?? 'unknown'
  const isCompleted = status === 'completed' || status === 'answered'
  const isFailed = status === 'failed' || status === 'no-answer' || status === 'busy' || status === 'canceled'

  return (
    <div
      className="flex items-center gap-3 py-2 px-3 rounded-lg"
      style={{ border: '1px solid var(--empire-border)', background: 'var(--empire-elevated)' }}
    >
      <Phone
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: isCompleted ? 'var(--empire-success)' : isFailed ? 'var(--empire-danger)' : 'var(--empire-subtle)' }}
      />
      <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
            style={{
              background: isCompleted
                ? 'color-mix(in srgb, var(--empire-success) 10%, transparent)'
                : isFailed
                ? 'color-mix(in srgb, var(--empire-danger) 10%, transparent)'
                : 'var(--empire-border)',
              color: isCompleted ? 'var(--empire-success)' : isFailed ? 'var(--empire-danger)' : 'var(--empire-subtle)',
            }}
          >
            {status}
          </span>
          {call.phone_call_duration != null && call.phone_call_duration > 0 && (
            <span className="text-[11px] font-mono" style={{ color: 'var(--empire-subtle)' }}>
              {fmtCallDuration(call.phone_call_duration)}
            </span>
          )}
          <span className="text-[11px]" style={{ color: 'var(--empire-subtle)' }}>
            {fmtMsgDate(call.data_comunicacao)}
          </span>
        </div>
        {(call.phone_call_from || call.phone_call_to) && (
          <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--empire-subtle)' }}>
            {call.phone_call_from} → {call.phone_call_to}
          </p>
        )}
      </div>
    </div>
  )
}

function ComunicacoesTab({ contatoId }: { contatoId: string }) {
  const { messages, calls, loading, error } = useLeadComunicacoes(contatoId)

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-12 w-2/3 ml-auto" />
        <Skeleton className="h-12 w-3/4" />
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-sm" style={{ color: 'var(--empire-danger)' }}>
        Erro ao carregar comunicações: {error}
      </p>
    )
  }

  if (!messages.length && !calls.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma comunicação registrada para este lead.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-0">
      {/* Chat messages */}
      {messages.length > 0 && (
        <div className="pb-2">
          {messages.map((msg, i) => (
            <ChatBubble key={msg.id} msg={msg} prevMsg={messages[i - 1]} />
          ))}
        </div>
      )}

      {/* Calls section */}
      {calls.length > 0 && (
        <div>
          {messages.length > 0 && (
            <div className="flex items-center gap-2 my-3">
              <div className="h-px flex-1" style={{ background: 'var(--empire-border)' }} />
              <span className="text-[10px] uppercase tracking-widest font-semibold shrink-0" style={{ color: 'var(--empire-subtle)' }}>
                Ligações
              </span>
              <div className="h-px flex-1" style={{ background: 'var(--empire-border)' }} />
            </div>
          )}
          <div className="space-y-2">
            {calls.map((call) => (
              <CallRow key={call.id} call={call} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── LeadCard ─────────────────────────────────────────────────

interface LeadCardProps {
  oppId: string | null
  onClose: () => void
  initialTab?: CardTab
}

export function LeadCard({ oppId, onClose, initialTab }: LeadCardProps) {
  const [lead, setLead] = useState<LeadsFull | null>(null)
  const [loadingCard, setLoadingCard] = useState(false)
  const [activeTab, setActiveTab] = useState<CardTab>(initialTab ?? 'dados')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [inboundCount, setInboundCount] = useState<number | null>(null)
  const [outrasOpps, setOutrasOpps] = useState<OutraOpp[]>([])
  // "Agora" congelado no carregamento do lead — evita chamar Date.now() durante o render
  const [nowTimestamp, setNowTimestamp] = useState(0)
  // Location do CRM vem do banco (multi-tenant) — a env VITE_GHL_LOCATION_ID
  // nem sempre está configurada e escondia o link "Abrir no CRM" silenciosamente.
  const { data: ghlLocationId } = useGhlLocationId()

  useEffect(() => {
    void Promise.resolve().then(() => {
      if (!oppId) {
        setLead(null)
        setIsFullscreen(false)
        setInboundCount(null)
        return
      }
      setLoadingCard(true)
      setActiveTab(initialTab ?? 'dados')
      setInboundCount(null)

      fetchLeadWithVendas(oppId)
        .then((data) => {
          setLead(data)
          setNowTimestamp(Date.now())
        })
        .catch(console.error)
        .finally(() => setLoadingCard(false))
    })
  }, [oppId, initialTab])

  useEffect(() => {
    if (!lead?.contato_id) return
    supabase
      .from('comunicacoes')
      .select('*', { count: 'exact', head: true })
      .eq('contato_id', lead.contato_id)
      .eq('direction', 'inbound')
      .then(({ count }) => setInboundCount(count ?? 0))
  }, [lead?.contato_id])

  // Outras oportunidades do MESMO contato que já foram conectadas ou agendadas.
  //
  // `data_conectado` mora na oportunidade, mas a pessoa é uma só. Quando um
  // contato tem mais de uma oportunidade (31% deles), a aberta pode nunca ter
  // sido trabalhada enquanto o histórico real — conexão, agendamento, reunião —
  // está na outra, muitas vezes já perdida. Sem este aviso, o SDR abre o lead,
  // vê "não conectado" e liga achando que ninguém falou com a pessoa.
  //
  // É só um AVISO: nenhuma métrica de funil muda. Propagar `data_conectado`
  // entre oportunidades inflaria a taxa de conexão de 1.609 contatos e daria
  // crédito ao SDR por conexão que ele não fez naquele ciclo.
  useEffect(() => {
    if (!lead?.contato_id) { setOutrasOpps([]); return }
    supabase
      .from('oportunidades')
      .select('id, pipeline_name, status, data_conectado, data_agendamento_reuniao, data_realizacao_vendas')
      .eq('contato_id', lead.contato_id)
      .neq('id', lead.id)
      .then(({ data }) => {
        const relevantes = (data ?? []).filter(
          (o) => o.data_conectado || o.data_agendamento_reuniao || o.data_realizacao_vendas,
        )
        setOutrasOpps(relevantes as OutraOpp[])
      })
  }, [lead?.contato_id, lead?.id])

  useEffect(() => {
    if (oppId) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [oppId])

  if (!oppId) return null
  const isOpen = !!oppId
  const headerTags = lead ? parseTags(lead.contatos?.tags) : []
  const headerCloserName = lead?.vendedor_closer ?? null

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-[70] backdrop-blur-sm transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        style={{ background: 'rgba(7,12,20,0.55)' }}
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-[80] flex h-[100dvh] flex-col overflow-y-auto overscroll-contain',
          'transition-[transform,width] ease-out',
          isFullscreen ? 'w-screen' : 'w-full max-w-[520px]',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{
          background: 'var(--empire-surface)',
          borderLeft: '1px solid var(--empire-border)',
          boxShadow: 'var(--empire-shadow-xl)',
          transitionDuration: 'var(--duration-slow)',
        }}
      >
        {loadingCard ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : lead ? (
          <>
            {/* Header */}
            <div className="shrink-0 flex items-start justify-between p-5 gap-3" style={{ borderBottom: '1px solid var(--empire-border)' }}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h2 className="text-base font-semibold text-foreground truncate">
                    {lead.contatos?.nome ?? 'Lead sem nome'}
                  </h2>
                  {lead.pipeline_name && (
                    <Badge variant="outline" className="shrink-0 text-xs border-primary/30 text-primary">
                      {lead.pipeline_name}
                    </Badge>
                  )}
                  {lead.status && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'shrink-0 text-xs',
                        lead.status === 'won' && 'bg-empire-success/15 text-empire-success',
                        lead.status === 'lost' && 'bg-empire-danger/12 text-[var(--empire-danger)]'
                      )}
                    >
                      {lead.status}
                    </Badge>
                  )}
                  {lead.pipeline_stage_id && (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-xs border-empire-warning/30 bg-empire-warning/10 text-empire-warning"
                    >
                      {lead.pipeline_stage_id}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{lead.contatos?.email ?? '—'}</p>
                {(lead.sdr_name || lead.contatos?.owner_name || headerCloserName) && (
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <SummaryCard
                      label="SDR"
                      value={lead.sdr_name || lead.contatos?.owner_name}
                      helper={lead.contatos?.owner_email}
                    />
                    <SummaryCard
                      label="Closer"
                      value={headerCloserName}
                      helper={lead.contatos?.closer_email}
                    />
                  </div>
                )}
                {lead.agendamento_origem && (
                  <div className="mt-3">
                    <div
                      className="rounded-xl border px-3 py-2.5"
                      style={{ borderColor: 'var(--empire-border)', background: 'linear-gradient(180deg, var(--empire-surface) 0%, var(--empire-elevated) 100%)' }}
                    >
                      <p className="text-[10px] uppercase tracking-[0.16em] font-semibold" style={{ color: 'var(--empire-subtle)' }}>
                        Agendamento
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <AppointmentOriginBadge
                          origin={lead.agendamento_origem}
                          calendarName={lead.agendamento_calendar_name}
                          bookedByName={lead.agendamento_por_user_nome}
                          assignedUserName={lead.agendamento_assigned_user_nome}
                        />
                        {lead.agendamento_calendar_name && (
                          <span className="text-xs text-muted-foreground">{lead.agendamento_calendar_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {headerTags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {headerTags.map((tag) => (
                      <span
                        key={tag}
                        className={cn(
                          'rounded-full border px-2.5 py-1 text-[11px] font-mono font-medium',
                          tagBadgeClass(tag)
                        )}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                {/* Mini-stats: dias na base + msgs recebidas */}
                {(lead.data_lead_recebido || inboundCount !== null) && (
                  <div className="mt-3 flex gap-4">
                    {lead.data_lead_recebido && (
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono uppercase tracking-wide text-empire-subtle">Dias na base</span>
                        <span className="text-sm font-mono font-medium text-[var(--empire-void)]">
                          {Math.floor((nowTimestamp - new Date(lead.data_lead_recebido).getTime()) / 86400000)}d
                        </span>
                      </div>
                    )}
                    {inboundCount !== null && (
                      <div className="flex flex-col">
                        <span className="text-[10px] font-mono uppercase tracking-wide text-empire-subtle">Msgs recebidas</span>
                        <span className={cn('text-sm font-mono font-medium',
                          inboundCount === 0 ? 'text-empire-danger' : 'text-[var(--empire-void)]')}>
                          {inboundCount}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {lead.contatos?.ghl_id && ghlContactUrlForLocation(ghlLocationId, lead.contatos.ghl_id) && (
                  <a
                    href={ghlContactUrlForLocation(ghlLocationId, lead.contatos.ghl_id)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Abrir contato no CRM"
                    className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Abrir no CRM
                  </a>
                )}
                <button
                  onClick={() => setIsFullscreen(f => !f)}
                  title={isFullscreen ? 'Reduzir' : 'Tela cheia'}
                  className="rounded p-1.5 transition-colors hover:bg-empire-border"
                  style={{ color: 'var(--empire-subtle)' }}
                >
                  {isFullscreen
                    ? <Minimize2 className="h-4 w-4" />
                    : <Maximize2 className="h-4 w-4" />}
                </button>
                <button
                  onClick={onClose}
                  className="rounded p-1.5 transition-colors hover:bg-empire-border"
                  style={{ color: 'var(--empire-subtle)' }}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Aviso: o histórico da pessoa está em outra oportunidade.
                Só aparece quando ESTA oportunidade não foi conectada — se as
                duas têm histórico, não há o que confundir. */}
            {!lead.data_conectado && outrasOpps.length > 0 && (
              <div
                className="shrink-0 px-4 py-2.5 text-xs"
                style={{
                  borderBottom: '1px solid var(--empire-border)',
                  background: 'rgba(245, 158, 11, 0.10)',
                  color: 'var(--empire-void)',
                }}
              >
                <span className="font-semibold">Atenção: já falaram com esta pessoa.</span>{' '}
                Esta oportunidade não tem conexão registrada, mas o contato tem{' '}
                {outrasOpps.length === 1 ? 'outra oportunidade' : `outras ${outrasOpps.length} oportunidades`} com histórico:
                <ul className="mt-1 space-y-0.5">
                  {outrasOpps.map((o) => (
                    <li key={o.id} className="opacity-90">
                      • {o.pipeline_name ?? 'sem pipeline'}
                      {o.status ? ` (${o.status})` : ''} —
                      {o.data_conectado ? ` conectado em ${fmtDate(o.data_conectado)}` : ''}
                      {o.data_agendamento_reuniao ? ` · agendado em ${fmtDate(o.data_agendamento_reuniao)}` : ''}
                      {o.data_realizacao_vendas ? ` · reunião em ${fmtDate(o.data_realizacao_vendas)}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tabs */}
            <div className="shrink-0" style={{ borderBottom: '1px solid var(--empire-border)' }}>
              <nav className="flex gap-0.5 px-4 overflow-x-auto scrollbar-hide">
                {CARD_TABS.map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setActiveTab(key)}
                    className={cn(
                      'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors',
                      activeTab === key
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Content */}
            <div className="min-h-0 p-5">
              {activeTab === 'dados' && <DadosTab lead={lead} />}
              {activeTab === 'timeline' && <Timeline lead={lead} />}
              {activeTab === 'financeiro' && <FinanceiroTab lead={lead} />}
              {activeTab === 'observacoes' && <ObservacoesTab lead={lead} />}
              {activeTab === 'comunicacoes' && lead.contato_id && (
                <ComunicacoesTab contatoId={lead.contato_id} />
              )}
              {activeTab === 'comunicacoes' && !lead.contato_id && (
                <p className="text-sm text-muted-foreground">Contato não vinculado.</p>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center flex-1 text-sm text-muted-foreground">
            Lead não encontrado.
            <button onClick={onClose} className="ml-3 text-primary hover:underline">
              Fechar
            </button>
          </div>
        )}
      </aside>
    </>,
    document.body
  )
}

// ─── LeadListModal ────────────────────────────────────────────

interface LeadListModalProps {
  open: boolean
  onClose: () => void
  title: string
  leads: {
    id: string
    sdr_name?: string | null
    data_lead_recebido?: string | null
    contatos?: {
      nome?: string | null
      email?: string | null
      telefone?: string | null
      utm_source?: string | null
      owner_name?: string | null
      print_instagram?: string | null
      date_created?: string | null
    } | null
    status?: string | null
    pipeline_name?: string | null
  }[]
}

// Distancia em dias entre a criacao do CONTATO e a chegada da OPORTUNIDADE.
// Serve para diferenciar aquisicao nova de base reativada: um contato de meses
// atras que gera oportunidade hoje aparece no painel como "lead novo", porque
// Lead = Oportunidade. A coluna "Contato desde" devolve esse contexto sem
// alterar nenhuma contagem.
function diasDeBase(dateCreated?: string | null, dataLead?: string | null): number | null {
  if (!dateCreated || !dataLead) return null
  const criado = new Date(dateCreated).getTime()
  const lead = new Date(dataLead).getTime()
  if (Number.isNaN(criado) || Number.isNaN(lead)) return null
  return Math.floor((lead - criado) / 86_400_000)
}

// Formata o telefone do lead para leitura/copia rapida em acoes de recuperacao.
// Aceita o formato cru do GHL (ex.: "+5511999998888") e devolve "+55 (11) 99999-8888".
// Se nao reconhecer o padrao BR, devolve o valor original sem mexer.
function formatTelefone(raw?: string | null): string | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  const digits = v.replace(/\D/g, '')
  const br = digits.length > 11 && digits.startsWith('55') ? digits.slice(2) : digits
  if (br.length === 11) return `+55 (${br.slice(0, 2)}) ${br.slice(2, 7)}-${br.slice(7)}`
  if (br.length === 10) return `+55 (${br.slice(0, 2)}) ${br.slice(2, 6)}-${br.slice(6)}`
  return v
}

// Interpreta o campo print_instagram ("Qual é o seu @ do instagram?"), que pode
// chegar como "@user", "user", "instagram.com/user" ou uma URL completa. Retorna
// um rótulo amigável e, quando possível, o link do perfil. Se for texto livre
// (ex.: caminho de imagem), exibe o texto cru sem link.
function parseInstagram(raw?: string | null): { label: string; href: string | null } | null {
  if (!raw) return null
  const v = raw.trim()
  if (!v) return null
  const urlMatch = v.match(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i)
  if (urlMatch) return { label: '@' + urlMatch[1], href: `https://instagram.com/${urlMatch[1]}` }
  const handleMatch = v.match(/^@?([A-Za-z0-9._]{1,30})$/)
  if (handleMatch) return { label: '@' + handleMatch[1], href: `https://instagram.com/${handleMatch[1]}` }
  return { label: v, href: null }
}

export function LeadListModal({ open, onClose, title, leads }: LeadListModalProps) {
  const [selectedOppId, setSelectedOppId] = useState<string | null>(null)

  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) setSelectedOppId(null)
  }

  if (!open) return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[60] backdrop-blur-sm"
        style={{ background: 'rgba(7,12,20,0.55)' }}
        onClick={onClose}
      />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div
          className="relative w-full max-w-4xl max-h-[80vh] flex flex-col animate-fade-in-up pointer-events-auto"
          style={{
            background: 'var(--empire-surface)',
            border: '1px solid var(--empire-border)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--empire-shadow-xl)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--empire-border)' }}>
            <div>
              <h3 className="font-semibold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground">{leads.length} leads</p>
            </div>
            <button
              onClick={onClose}
              className="rounded p-1.5 transition-colors hover:bg-empire-border"
              style={{ color: 'var(--empire-subtle)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="overflow-auto flex-1">
            {leads.length === 0 ? (
              <p className="p-6 text-sm text-center text-muted-foreground">Nenhum lead nesta etapa.</p>
            ) : (
              <table className="w-full text-sm">
                <thead style={{ borderBottom: '1px solid var(--empire-border)', background: 'var(--empire-elevated)' }}>
                  <tr>
                    <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--empire-subtle)' }}>Nome</th>
                    <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--empire-subtle)' }}>Email</th>
                    <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--empire-subtle)' }}>Telefone</th>
                    <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--empire-subtle)' }}>Instagram</th>
                    <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--empire-subtle)' }}>Pré-vendedor</th>
                    <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--empire-subtle)' }}>Fonte</th>
                    <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--empire-subtle)' }}>Contato desde</th>
                    <th className="px-4 py-2 text-left font-mono text-[11px] font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--empire-subtle)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr
                      key={l.id}
                      className="cursor-pointer transition-colors hover:bg-empire-elevated"
                      style={{ borderBottom: '1px solid var(--empire-border)' }}
                      onClick={() => setSelectedOppId(l.id)}
                    >
                      <td className="px-4 py-2.5 font-medium" style={{ color: 'var(--empire-void)' }}>{l.contatos?.nome ?? '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--empire-subtle)' }}>{l.contatos?.email ?? '—'}</td>
                      <td
                        className="px-4 py-2.5 whitespace-nowrap"
                        style={{ color: 'var(--empire-subtle)' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {formatTelefone(l.contatos?.telefone) ?? '—'}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--empire-subtle)' }}>
                        {(() => {
                          const ig = parseInstagram(l.contatos?.print_instagram)
                          if (!ig) return '—'
                          return ig.href ? (
                            <a
                              href={ig.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:underline"
                              style={{ color: 'var(--empire-info)' }}
                            >
                              {ig.label}
                            </a>
                          ) : (
                            <span>{ig.label}</span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--empire-subtle)' }}>{l.sdr_name || l.contatos?.owner_name || '—'}</td>
                      <td className="px-4 py-2.5" style={{ color: 'var(--empire-subtle)' }}>{l.contatos?.utm_source ?? '—'}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--empire-subtle)' }}>
                        {(() => {
                          const dias = diasDeBase(l.contatos?.date_created, l.data_lead_recebido)
                          const data = fmtDate(l.contatos?.date_created)
                          if (dias == null || dias < 90) return data
                          const meses = Math.floor(dias / 30)
                          return (
                            <span
                              className="inline-flex items-center gap-1.5"
                              title={`Este contato já existia há ${meses} meses quando esta oportunidade entrou. Ele conta como lead do período porque Lead = Oportunidade, mas não é aquisição nova.`}
                            >
                              {data}
                              <Badge variant="secondary" className="text-[10px] bg-empire-warning/15 text-[var(--empire-warning)]">
                                base {meses}m
                              </Badge>
                            </span>
                          )
                        })()}
                      </td>
                      <td className="px-4 py-2.5">
                        {l.status && (
                          <Badge
                            variant="secondary"
                            className={cn(
                              'text-xs',
                              l.status === 'won' && 'bg-empire-success/15 text-empire-success',
                              l.status === 'lost' && 'bg-empire-danger/12 text-[var(--empire-danger)]'
                            )}
                          >
                            {l.status}
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <LeadCard oppId={selectedOppId} onClose={() => setSelectedOppId(null)} />
    </>,
    document.body,
  )
}
