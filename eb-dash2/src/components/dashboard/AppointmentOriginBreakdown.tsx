import { useMemo, useState } from 'react'
import type { ElementType } from 'react'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import { buildPaymentDateMap } from '@/hooks/useTrafego'
import { SectionHeader, KpiCard } from '@/components/dashboard'
import { LeadListModal } from '@/components/leads/LeadCard'
import { CalendarCheck2, Video, ShoppingCart } from 'lucide-react'

interface AppointmentOriginBreakdownProps {
  opps: OppRow[]
  revenueRows: RevenueRow[]
  loading: boolean
  title?: string
  description?: string
}

type CategoryKey = 'agendamentos_ia' | 'agendamentos_humano' | 'reunioes_ia' | 'reunioes_humano' | 'vendas_ia' | 'vendas_humano'

interface Category {
  key: CategoryKey
  label: string
  icon: ElementType
  leads: OppRow[]
  variant: 'default' | 'success' | 'info'
}

export function AppointmentOriginBreakdown({
  opps,
  revenueRows,
  loading,
  title = 'Origem dos eventos',
  description = 'Agendamentos, reuniões realizadas e vendas separados por origem (IA vs humano). Baseado no campo agendamento_origem.',
}: AppointmentOriginBreakdownProps) {
  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({ open: false, title: '', leads: [] })

  const paymentDateMap = useMemo(() => buildPaymentDateMap(revenueRows), [revenueRows])

  const categories = useMemo<Category[]>(() => {
    const agendados = opps.filter((o) => o.data_agendamento_reuniao)
    const reunioes = opps.filter((o) => o.data_realizacao_vendas)
    const vendas = opps.filter((o) => paymentDateMap.has(o.id))

    const ia = (o: OppRow) => o.agendamento_origem === 'conversations_ai'
    const humano = (o: OppRow) => o.agendamento_origem && o.agendamento_origem !== 'conversations_ai'

    return [
      {
        key: 'agendamentos_ia',
        label: 'Agendamentos por IA',
        icon: CalendarCheck2,
        leads: agendados.filter(ia),
        variant: 'info',
      },
      {
        key: 'agendamentos_humano',
        label: 'Agendamentos por humano',
        icon: CalendarCheck2,
        leads: agendados.filter(humano),
        variant: 'default',
      },
      {
        key: 'reunioes_ia',
        label: 'Reuniões realizadas por IA',
        icon: Video,
        leads: reunioes.filter(ia),
        variant: 'info',
      },
      {
        key: 'reunioes_humano',
        label: 'Reuniões realizadas por humano',
        icon: Video,
        leads: reunioes.filter(humano),
        variant: 'default',
      },
      {
        key: 'vendas_ia',
        label: 'Vendas por IA',
        icon: ShoppingCart,
        leads: vendas.filter(ia),
        variant: 'success',
      },
      {
        key: 'vendas_humano',
        label: 'Vendas por humano',
        icon: ShoppingCart,
        leads: vendas.filter(humano),
        variant: 'success',
      },
    ]
  }, [opps, paymentDateMap])

  function fmtNumber(n: number) {
    return new Intl.NumberFormat('pt-BR').format(n)
  }

  return (
    <div>
      <SectionHeader title={title} description={description} />
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {categories.map((cat) => {
          const totalForType = categories
            .filter((c) => c.key.split('_')[0] === cat.key.split('_')[0])
            .reduce((sum, c) => sum + c.leads.length, 0)
          const pct = totalForType > 0 ? Math.round((cat.leads.length / totalForType) * 100) : 0

          return (
            <KpiCard
              key={cat.key}
              label={cat.label}
              value={fmtNumber(cat.leads.length)}
              icon={cat.icon}
              loading={loading}
              variant={cat.variant}
              subValue={totalForType > 0 ? `${pct}% do total` : undefined}
              onClick={() => setModal({ open: true, title: cat.label, leads: cat.leads })}
            />
          )
        })}
      </div>

      <LeadListModal
        open={modal.open}
        onClose={() => setModal({ open: false, title: '', leads: [] })}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
