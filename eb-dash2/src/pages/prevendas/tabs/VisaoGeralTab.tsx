import { useState, useMemo } from 'react'
import { LeadListModal } from '@/components/leads/LeadCard'
import { buildPaymentDateMap, isMqlByTag } from '@/hooks/useTrafego'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import {
  SectionHeader,
  KpiCard,
  FunnelViz,
} from '@/components/dashboard'
import type { FunnelStep } from '@/components/dashboard'
import {
  Target,
  UserMinus,
  CalendarDays,
  CalendarX,
  Video,
  UserX,
  Link2,
  Unlink,
  BadgeCheck,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  loading: boolean
}

// ─── Helpers ──────────────────────────────────────────────────

// Monta os passos do funil (sem custo/R$ — resumo puramente operacional).
function buildFunnelSteps(
  items: { label: string; count: number; onClick: () => void }[],
): FunnelStep[] {
  const first = items[0]?.count || 1
  return items.map((s, i) => ({
    label: s.label,
    count: s.count,
    totalPct: Math.round((s.count / first) * 100),
    stepPct: i === 0 ? null : items[i - 1].count > 0 ? Math.round((s.count / items[i - 1].count) * 100) : 0,
    onClick: s.onClick,
    // cost intencionalmente omitido: esta aba não exibe valores.
  }))
}

// ─── Main component ───────────────────────────────────────────

export function VisaoGeralTab({ opps, revenueRows, loading }: Props) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false,
    title: '',
    leads: [],
  })

  const paymentDateMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])

  // Contadores — sem nenhum valor monetário.
  const c = useMemo(() => {
    const mqls = opps.filter((o) => isMqlByTag(o.contatos))
    const naoMqls = opps.filter((o) => !isMqlByTag(o.contatos))
    const agendados = opps.filter((o) => !!o.data_agendamento_reuniao)
    const naoAgendados = opps.filter((o) => !o.data_agendamento_reuniao)
    const reunioes = opps.filter((o) => !!o.data_realizacao_vendas)
    const fechados = opps.filter((o) => paymentDateMap.has(o.id))
    const conectados = opps.filter((o) => !!o.data_conectado)
    const naoConectados = opps.filter((o) => !o.data_conectado)
    const noShows = opps.filter((o) => !!o.data_no_show)
    return { mqls, naoMqls, agendados, naoAgendados, reunioes, fechados, conectados, naoConectados, noShows }
  }, [opps, paymentDateMap])

  const openModal = (title: string, leads: OppRow[]) => setModal({ open: true, title, leads })

  const funnelSteps: FunnelStep[] = useMemo(
    () =>
      buildFunnelSteps([
        { label: 'Leads', count: opps.length, onClick: () => openModal('Leads', opps) },
        { label: 'MQLs', count: c.mqls.length, onClick: () => openModal('MQLs', c.mqls) },
        { label: 'Agendados', count: c.agendados.length, onClick: () => openModal('Agendados', c.agendados) },
        { label: 'Reuniões', count: c.reunioes.length, onClick: () => openModal('Reuniões realizadas', c.reunioes) },
        { label: 'Fechados', count: c.fechados.length, onClick: () => openModal('Fechados', c.fechados) },
      ]),
    [opps, c],
  )

  return (
    <div className="space-y-6">
      {/* Funil de Conversão — sem valores, só quantidades */}
      <div>
        <SectionHeader title="Funil de Conversão" description="Progresso dos leads em cada etapa" />
        <div className="mt-3">
          <FunnelViz steps={funnelSteps} loading={loading} />
        </div>
      </div>

      {/* Classificação — MQLs vs Não MQLs */}
      <div>
        <SectionHeader title="Classificação" description="Quantos leads são MQL e quantos não são" />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard
            label="MQLs"
            value={String(c.mqls.length)}
            icon={Target}
            loading={loading}
            variant="highlight"
            onClick={() => openModal('MQLs', c.mqls)}
          />
          <KpiCard
            label="Não MQLs"
            value={String(c.naoMqls.length)}
            icon={UserMinus}
            loading={loading}
            onClick={() => openModal('Não MQLs', c.naoMqls)}
          />
        </div>
      </div>

      {/* Agendamento — Agendados vs Não agendados */}
      <div>
        <SectionHeader title="Agendamento" description="Quantos foram agendados e quantos ainda não" />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          <KpiCard
            label="Agendados"
            value={String(c.agendados.length)}
            icon={CalendarDays}
            loading={loading}
            variant="highlight"
            onClick={() => openModal('Agendados', c.agendados)}
          />
          <KpiCard
            label="Não agendados"
            value={String(c.naoAgendados.length)}
            icon={CalendarX}
            loading={loading}
            onClick={() => openModal('Não agendados', c.naoAgendados)}
          />
        </div>
      </div>

      {/* Reunião & Contato */}
      <div>
        <SectionHeader title="Reunião & Contato" description="Reuniões realizadas, no-shows e conexão com o lead" />
        <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <KpiCard
            label="Reuniões realizadas"
            value={String(c.reunioes.length)}
            icon={Video}
            loading={loading}
            variant="highlight"
            onClick={() => openModal('Reuniões realizadas', c.reunioes)}
          />
          <KpiCard
            label="No-shows"
            value={String(c.noShows.length)}
            icon={UserX}
            loading={loading}
            onClick={() => openModal('No-shows', c.noShows)}
          />
          <KpiCard
            label="Conectados"
            value={String(c.conectados.length)}
            icon={Link2}
            loading={loading}
            onClick={() => openModal('Conectados', c.conectados)}
          />
          <KpiCard
            label="Não conectados"
            value={String(c.naoConectados.length)}
            icon={Unlink}
            loading={loading}
            onClick={() => openModal('Não conectados', c.naoConectados)}
          />
          <KpiCard
            label="Fechados"
            value={String(c.fechados.length)}
            icon={BadgeCheck}
            loading={loading}
            onClick={() => openModal('Fechados', c.fechados)}
          />
        </div>
      </div>

      <p className="text-[10px] text-empire-subtle">
        Resumo operacional dos leads no período selecionado — sem valores financeiros. Clique em qualquer
        número para ver a lista de leads (com telefone, pré-vendedor e @ do Instagram).
      </p>

      <LeadListModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
