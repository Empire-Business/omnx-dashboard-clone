import { useMemo, useState } from 'react'
import type { ElementType } from 'react'
import type { OppRow } from '@/hooks/useTrafego'
import { SectionHeader, KpiCard } from '@/components/dashboard'
import { LeadListModal } from '@/components/leads/LeadCard'
import { UserX, CalendarClock, Ban, Users } from 'lucide-react'

interface AppointmentBalanceProps {
  opps: OppRow[]
  loading: boolean
  variant?: 'pre-venda' | 'vendas'
  title?: string
  description?: string
}

// Status do GHL tratados como cada categoria (fatos, não inferência).
const SHOWED_STATUSES = new Set(['showed', 'completed'])
const NOSHOW_STATUSES = new Set(['noshow', 'no_show', 'no-show'])
const CANCELLED_STATUSES = new Set(['cancelled', 'canceled', 'cancelado', 'cancelada', 'invalid'])

function todaySP(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
}

function fmtNumber(n: number) {
  return new Intl.NumberFormat('pt-BR').format(n)
}

interface MainMetric {
  key: string
  label: string
  icon: ElementType
  value: number
  leads: OppRow[]
  variant: 'default' | 'success' | 'danger' | 'warning' | 'info' | 'highlight'
}

interface SubMetric {
  key: string
  label: string
  value: number
  leads: OppRow[]
}

export function AppointmentBalance({
  opps,
  loading,
  variant = 'pre-venda',
  title = 'Saldo de agendamentos',
  description = 'O que ainda está em aberto nos agendamentos: no-shows, a realizar e canceladas. Cada agendamento aparece em apenas uma categoria.',
}: AppointmentBalanceProps) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false,
    title: '',
    leads: [],
  })

  const hoje = todaySP()

  const appointmentField = variant === 'vendas' ? 'data_agendamento_vendas' : 'data_agendamento_reuniao'
  const noShowField = variant === 'vendas' ? 'data_no_show_vendas' : 'data_no_show'

  const data = useMemo(() => {
    const getAppointmentDate = (o: OppRow): string | null =>
      (o[appointmentField as keyof OppRow] as string | null | undefined) ?? null

    const statusOf = (o: OppRow): string => ((o.appointment_status ?? '') as string).toLowerCase().trim()
    const isCancelled = (o: OppRow) => CANCELLED_STATUSES.has(statusOf(o))
    const isShowed = (o: OppRow) => !!o.data_realizacao_vendas || SHOWED_STATUSES.has(statusOf(o))
    const isNoShow = (o: OppRow) =>
      !!(o[noShowField as keyof OppRow]) || NOSHOW_STATUSES.has(statusOf(o))

    const agendados = opps.filter((o) => !!getAppointmentDate(o))

    // Regra de prioridade EXCLUSIVA (cada agendamento em exatamente 1 categoria):
    // cancelada > realizada > no-show > a acontecer (hoje/futuro) > aguardando desfecho
    const canceladas = agendados.filter(isCancelled)
    const naoCanceladas = agendados.filter((o) => !isCancelled(o))

    const realizadas = naoCanceladas.filter(isShowed)
    const aposRealizadas = naoCanceladas.filter((o) => !isShowed(o))

    const noShows = aposRealizadas.filter(isNoShow)
    const aposNoShow = aposRealizadas.filter((o) => !isNoShow(o))

    // "A acontecer": data de hoje em diante (o dia ainda não fechou) sem desfecho.
    const futuras = aposNoShow.filter((o) => {
      const d = getAppointmentDate(o)
      return !!d && d >= hoje
    })
    // "Aguardando desfecho": data já passou e o GHL ainda não marcou showed/noshow
    // (tipicamente status 'confirmed' ou 'new'). É ação pendente do time no GHL.
    const aguardandoDesfecho = aposNoShow.filter((o) => {
      const d = getAppointmentDate(o)
      return !!d && d < hoje
    })

    // "A realizar": tudo que ainda não tem desfecho final (futuro + passado sem marcação).
    const aRealizar = [...futuras, ...aguardandoDesfecho]

    // Destrinche dos no-shows por origem (IA vs humano).
    const noShowsIA = noShows.filter((o) => o.agendamento_origem === 'conversations_ai')
    const noShowsHumano = noShows.filter((o) => !!o.agendamento_origem && o.agendamento_origem !== 'conversations_ai')
    const noShowsSemOrigem = noShows.filter((o) => !o.agendamento_origem)

    return {
      agendados,
      realizadas,
      noShows,
      canceladas,
      futuras,
      aguardandoDesfecho,
      aRealizar,
      noShowsIA,
      noShowsHumano,
      noShowsSemOrigem,
    }
  }, [opps, hoje, appointmentField, noShowField])

  const principais: MainMetric[] = [
    {
      key: 'noshows',
      label: 'No-shows',
      icon: UserX,
      value: data.noShows.length,
      leads: data.noShows,
      variant: 'danger',
    },
    {
      key: 'a_realizar',
      label: 'A realizar',
      icon: CalendarClock,
      value: data.aRealizar.length,
      leads: data.aRealizar,
      variant: 'warning',
    },
    {
      key: 'canceladas',
      label: 'Canceladas',
      icon: Ban,
      value: data.canceladas.length,
      leads: data.canceladas,
      variant: 'default',
    },
  ]

  const destrincheNoShows: SubMetric[] = [
    { key: 'noshows_ia', label: 'Por IA', value: data.noShowsIA.length, leads: data.noShowsIA },
    { key: 'noshows_humano', label: 'Por humano', value: data.noShowsHumano.length, leads: data.noShowsHumano },
    ...(data.noShowsSemOrigem.length > 0
      ? [{ key: 'noshows_sem_origem', label: 'Sem origem', value: data.noShowsSemOrigem.length, leads: data.noShowsSemOrigem }]
      : []),
  ]

  const agendamentos = data.agendados.length
  const realizadas = data.realizadas.length
  const noShows = data.noShows.length
  const canceladas = data.canceladas.length
  const futuras = data.futuras.length
  const aguardando = data.aguardandoDesfecho.length
  const saldo = realizadas + noShows + canceladas + futuras + aguardando

  return (
    <div>
      <SectionHeader title={title} description={description} />

      {/* Linha principal: o que ainda está em aberto */}
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        {principais.map((m) => (
          <KpiCard
            key={m.key}
            label={m.label}
            value={fmtNumber(m.value)}
            icon={m.icon}
            loading={loading}
            variant={m.variant}
            onClick={() => setModal({ open: true, title: m.label, leads: m.leads })}
          />
        ))}
      </div>

      {/* Subdivisão: destrinche dos no-shows por origem (IA vs humano) */}
      <div className="mt-2.5 rounded-lg border border-dashed border-empire-border bg-empire-surface/40 p-2.5">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-empire-subtle">
          <UserX className="h-3 w-3" />
          <span>No-shows por origem</span>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {destrincheNoShows.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setModal({ open: true, title: `No-shows · ${s.label}`, leads: s.leads })}
              className="flex items-baseline justify-between rounded-md border border-empire-border bg-empire-surface px-3 py-2 text-left transition-all hover:-translate-y-px hover:shadow-sm"
            >
              <span className="text-[11px] font-semibold uppercase tracking-wider text-empire-subtle">
                {s.label}
              </span>
              <span className="font-mono text-lg font-bold tabular-nums text-empire-void">
                {loading ? '—' : fmtNumber(s.value)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {!loading && (
        <div className="mt-2 flex items-center gap-2 text-xs text-empire-subtle">
          <Users className="h-3 w-3" />
          <span>
            Conta: {fmtNumber(agendamentos)} = {fmtNumber(realizadas)} realizadas + {fmtNumber(noShows)} no-shows
            {canceladas > 0 ? ` + ${fmtNumber(canceladas)} canceladas` : ''} + {fmtNumber(futuras)} a acontecer
            {aguardando > 0 ? ` + ${fmtNumber(aguardando)} aguardando desfecho` : ''}
            {saldo === agendamentos ? ' ✅' : ` (saldo ${fmtNumber(saldo)})`}
          </span>
        </div>
      )}

      <LeadListModal
        open={modal.open}
        onClose={() => setModal({ open: false, title: '', leads: [] })}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
