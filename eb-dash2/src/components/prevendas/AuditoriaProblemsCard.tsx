import React from 'react'
import { AlertTriangle, AlertCircle, Zap, Clock, MessageSquareOff, Users, MessageSquareWarning, ShieldCheck } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ResumoAuditoria, ProblemaTipo } from '@/hooks/useAuditoriaIA'

type AuditoriaProblemsCardProps = {
  resumo: ResumoAuditoria
  loading: boolean
  onFilter: (tipo: ProblemaTipo) => void
  /** Tipo atualmente filtrado — o card correspondente fica destacado. */
  activeFilter?: ProblemaTipo | 'todos'
}

type Tone = 'rose' | 'amber' | 'violet' | 'sky' | 'slate' | 'fuchsia'

type ProblemConfig = {
  key: ProblemaTipo
  label: string
  icon: React.ReactNode
  tone: Tone
  descricao: string
}

const PROBLEMS: ProblemConfig[] = [
  {
    key: 'reclamacao_lead',
    label: 'Reclamação do Lead',
    icon: <MessageSquareWarning className="h-4 w-4" />,
    tone: 'fuchsia',
    descricao: 'Lead reclamou da resposta da IA',
  },
  {
    key: 'erro_entrega',
    label: 'Erros de Entrega',
    icon: <AlertCircle className="h-4 w-4" />,
    tone: 'rose',
    descricao: 'Mensagens que falharam ao enviar',
  },
  {
    key: 'sem_followup',
    label: 'Sem Follow-up',
    icon: <MessageSquareOff className="h-4 w-4" />,
    tone: 'amber',
    descricao: 'Sem contato (IA + humano) há >7 dias',
  },
  {
    key: 'spam',
    label: 'Spam / Excesso',
    icon: <Zap className="h-4 w-4" />,
    tone: 'amber',
    descricao: 'Muitas mensagens em pouco tempo',
  },
  {
    key: 'conflito_humano',
    label: 'Conflito IA/Humano',
    icon: <Users className="h-4 w-4" />,
    tone: 'sky',
    descricao: 'IA e humano falando ao mesmo tempo',
  },
  {
    key: 'conversa_unilateral',
    label: 'Conversa Unilateral',
    icon: <AlertTriangle className="h-4 w-4" />,
    tone: 'violet',
    descricao: 'Leads que nunca responderam',
  },
  {
    key: 'horario_inadequado',
    label: 'Horário Inadequado',
    icon: <Clock className="h-4 w-4" />,
    tone: 'slate',
    descricao: 'Mensagens fora do horário comercial',
  },
]

/**
 * Cores translúcidas (`/10`, `/20`) em vez de `bg-*-50` sólido: o mesmo token
 * funciona nos dois modos do tema sem precisar de variante `dark:` própria.
 */
const TONES: Record<Tone, { icon: string; value: string; ring: string; activeBg: string }> = {
  rose: {
    icon: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
    value: 'text-rose-600 dark:text-rose-400',
    ring: 'ring-rose-500/40',
    activeBg: 'bg-rose-500/[0.07]',
  },
  amber: {
    icon: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
    value: 'text-amber-600 dark:text-amber-400',
    ring: 'ring-amber-500/40',
    activeBg: 'bg-amber-500/[0.07]',
  },
  violet: {
    icon: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
    value: 'text-violet-600 dark:text-violet-400',
    ring: 'ring-violet-500/40',
    activeBg: 'bg-violet-500/[0.07]',
  },
  sky: {
    icon: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
    value: 'text-sky-600 dark:text-sky-400',
    ring: 'ring-sky-500/40',
    activeBg: 'bg-sky-500/[0.07]',
  },
  slate: {
    icon: 'bg-slate-500/12 text-slate-600 dark:text-slate-400',
    value: 'text-slate-600 dark:text-slate-400',
    ring: 'ring-slate-500/40',
    activeBg: 'bg-slate-500/[0.07]',
  },
  fuchsia: {
    icon: 'bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400',
    value: 'text-fuchsia-600 dark:text-fuchsia-400',
    ring: 'ring-fuchsia-500/40',
    activeBg: 'bg-fuchsia-500/[0.07]',
  },
}

const SEV_CHIP = {
  alta: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
  media: 'bg-amber-500/14 text-amber-700 dark:text-amber-300',
  baixa: 'bg-slate-500/12 text-slate-600 dark:text-slate-300',
}

function bucketOf(resumo: ResumoAuditoria, key: ProblemaTipo) {
  const raw = (resumo as Record<string, { total?: number; alta?: number; media?: number; baixa?: number }>)[key]
  return {
    total: raw?.total ?? 0,
    alta: raw?.alta ?? 0,
    media: raw?.media ?? 0,
    baixa: raw?.baixa ?? 0,
  }
}

export function AuditoriaProblemsCard({ resumo, loading, onFilter, activeFilter = 'todos' }: AuditoriaProblemsCardProps) {
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-2xl border border-empire-border bg-empire-elevated" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
          {PROBLEMS.map((p) => (
            <div key={p.key} className="h-28 animate-pulse rounded-2xl border border-empire-border bg-empire-elevated" />
          ))}
        </div>
      </div>
    )
  }

  const totais = PROBLEMS.map((p) => bucketOf(resumo, p.key))
  const totalGeral = totais.reduce((acc, t) => acc + t.total, 0)
  const totalAlta = totais.reduce((acc, t) => acc + t.alta, 0)
  const totalMedia = totais.reduce((acc, t) => acc + t.media, 0)
  const totalBaixa = totais.reduce((acc, t) => acc + t.baixa, 0)
  const limpo = totalGeral === 0

  return (
    <div className="space-y-4">
      {/* Resumo geral */}
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-5',
          limpo
            ? 'border-emerald-500/25 bg-emerald-500/[0.06]'
            : 'border-rose-500/25 bg-rose-500/[0.06]'
        )}
      >
        <div className="flex items-center gap-4">
          <div
            className={cn(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
              limpo ? 'bg-emerald-500/12 text-emerald-600' : 'bg-rose-500/12 text-rose-600'
            )}
          >
            {limpo ? <ShieldCheck className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-empire-subtle">
              Problemas detectados
            </p>
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  'font-display text-4xl font-semibold tabular-nums leading-none',
                  limpo ? 'text-emerald-600' : 'text-rose-600'
                )}
              >
                {totalGeral}
              </span>
              <span className="text-sm text-empire-subtle">
                {limpo ? 'nenhum problema no período' : `lead${totalGeral !== 1 ? 's' : ''} com atendimento problemático`}
              </span>
            </div>
          </div>
        </div>

        {!limpo && (
          <div className="flex flex-wrap items-center gap-2">
            {totalAlta > 0 && (
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium tabular-nums', SEV_CHIP.alta)}>
                {totalAlta} alta
              </span>
            )}
            {totalMedia > 0 && (
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium tabular-nums', SEV_CHIP.media)}>
                {totalMedia} média
              </span>
            )}
            {totalBaixa > 0 && (
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium tabular-nums', SEV_CHIP.baixa)}>
                {totalBaixa} baixa
              </span>
            )}
          </div>
        )}
      </div>

      {/* Cards por categoria */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
        {PROBLEMS.map((p) => {
          const t = bucketOf(resumo, p.key)
          const tone = TONES[p.tone]
          const vazio = t.total === 0
          const ativo = activeFilter === p.key

          return (
            <button
              key={p.key}
              onClick={() => onFilter(p.key)}
              aria-pressed={ativo}
              title={p.descricao}
              className={cn(
                'group flex flex-col rounded-2xl border border-empire-border bg-empire-elevated p-4 text-left',
                'transition-all duration-200 hover:-translate-y-0.5 hover:border-empire-border-strong hover:shadow-lg hover:shadow-black/5',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-empire-primary focus-visible:ring-offset-2',
                ativo && cn('ring-2 ring-offset-1', tone.ring, tone.activeBg),
                vazio && !ativo && 'opacity-60 hover:opacity-100'
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', tone.icon)}>
                  {p.icon}
                </span>
                <span
                  className={cn(
                    'font-display text-2xl font-semibold tabular-nums leading-none',
                    vazio ? 'text-empire-subtle' : tone.value
                  )}
                >
                  {t.total}
                </span>
              </div>

              <p className="mt-3 text-xs font-semibold leading-tight text-empire-void">{p.label}</p>

              <div className="mt-2 flex min-h-[22px] flex-wrap gap-1">
                {t.alta > 0 && (
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums', SEV_CHIP.alta)}>
                    {t.alta} alta
                  </span>
                )}
                {t.media > 0 && (
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums', SEV_CHIP.media)}>
                    {t.media} méd.
                  </span>
                )}
                {t.baixa > 0 && (
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums', SEV_CHIP.baixa)}>
                    {t.baixa} baixa
                  </span>
                )}
              </div>

              <p className="mt-1.5 line-clamp-2 text-[10px] leading-snug text-empire-subtle">{p.descricao}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
