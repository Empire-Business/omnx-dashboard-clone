import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { CohortMatrix, SectionHeader } from '@/components/dashboard'
import { LeadListModal } from '@/components/leads/LeadCard'
import type { OppRow, RevenueRow } from '@/hooks/useTrafego'
import { buildPaymentDateMap } from '@/hooks/useTrafego'
import { useMatrizEficiencia } from '@/hooks/useMatrizEficiencia'

// ─── Sub-tabs: Funis | Campanhas ────────────────────────────────
// Segue o mesmo padrão de sub-abas aninhadas de AnunciosTab.tsx (?sub=).

const SUB_TABS = [
  { key: 'funis', label: 'Funis' },
  { key: 'campanhas', label: 'Campanhas' },
] as const

type SubTabKey = (typeof SUB_TABS)[number]['key']

export interface MatrizEficienciaTabProps {
  opps: OppRow[]
  revenueRows: RevenueRow[]
}

/**
 * Matriz de Eficiência — compara a conversão de cada funil e de cada
 * campanha entre si, no período já filtrado pela página chamadora.
 * Reaproveita o componente CohortMatrix (mesmo padrão visual/de coloração
 * da Matriz Cohort já existente em Vendas/Aquisição/Tráfego), só que cada
 * "linha de cohort" aqui é um funil ou uma campanha, não um mês.
 *
 * Só aparecem linhas com dado != 0 no período: elas nascem dos `opps` já
 * filtrados pela página (que muda dinamicamente com o filtro de data), nunca
 * de um catálogo fixo de funis/campanhas.
 */
export function MatrizEficienciaTab({ opps, revenueRows }: MatrizEficienciaTabProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawSub = searchParams.get('sub')
  const activeSub: SubTabKey = SUB_TABS.some((t) => t.key === rawSub) ? (rawSub as SubTabKey) : 'funis'

  const setSub = (key: SubTabKey) => {
    const current = Object.fromEntries(searchParams.entries())
    setSearchParams({ ...current, sub: key }, { replace: true })
  }

  const [modal, setModal] = useState<{ open: boolean; title: string; leads: OppRow[] }>({
    open: false, title: '', leads: [],
  })
  const openModal = (title: string, leads: OppRow[]) => setModal({ open: true, title, leads })

  const { funilRows, campanhaRows, avgConectados, avgAgendados, avgReuniao, avgFechados, loading, error } =
    useMatrizEficiencia(opps, revenueRows)

  const paymentDateMap = buildPaymentDateMap(revenueRows)
  const rows = activeSub === 'funis' ? funilRows : campanhaRows

  const totals = rows.reduce(
    (acc, r) => ({
      leads: acc.leads + r.leads_count,
      mqls: acc.mqls + r.mqls,
      conectados: acc.conectados + r.conectados,
      agendados: acc.agendados + r.agendados,
      reunioes: acc.reunioes + r.reunioes,
      fechados: acc.fechados + r.fechados,
      faturamento: acc.faturamento + r.faturamento,
    }),
    { leads: 0, mqls: 0, conectados: 0, agendados: 0, reunioes: 0, fechados: 0, faturamento: 0 },
  )

  if (error) {
    return (
      <div className="rounded-xl border border-empire-danger/20 bg-empire-danger-soft p-4 text-sm text-empire-danger">
        {error}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Matriz de Eficiência"
        description="Compara a conversão de cada funil/campanha no período. Só aparecem linhas com leads no período selecionado. Clique numa célula para ver os leads."
      />

      <div style={{ borderBottom: '1px solid var(--empire-border)' }}>
        <nav className="-mb-px flex flex-wrap gap-1 scrollbar-hide">
          {SUB_TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
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

      <CohortMatrix
        rows={rows}
        avgConectados={avgConectados}
        avgAgendados={avgAgendados}
        avgReuniao={avgReuniao}
        avgFechados={avgFechados}
        totals={totals}
        metaSpend={0}
        loading={loading}
        paymentDateMap={paymentDateMap}
        onOpenModal={openModal}
      />

      <LeadListModal
        open={modal.open}
        onClose={() => setModal((m) => ({ ...m, open: false }))}
        title={modal.title}
        leads={modal.leads}
      />
    </div>
  )
}
