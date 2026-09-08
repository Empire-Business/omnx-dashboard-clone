import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { ProducaoRow, ProducaoTotals } from '@/hooks/useProducao'
import type { OppRow } from '@/hooks/useTrafego'

// ─── Formatting helpers ───────────────────────────────────
function fmtCurrencyCompact(v: number) {
  if (v === 0) return '\u2014'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v)
}

// ─── Props ────────────────────────────────────────────────
interface ProdutividadeMatrixProps {
  rows: ProducaoRow[]
  totals: ProducaoTotals
  loading: boolean
  error: string | null
  onOpenModal: (title: string, leads: OppRow[]) => void
}

const COLUMNS = ['Mes', 'Leads', 'MQLs', 'Conectados', 'Agendados', 'Reunioes', 'Fechados', 'Faturamento']

export function ProdutividadeMatrix({
  rows,
  totals,
  loading,
  error,
  onOpenModal,
}: ProdutividadeMatrixProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-[var(--data-danger)]/20 bg-[var(--data-danger-soft)] p-6 text-center">
        <p className="text-sm text-[var(--data-danger)]">{error}</p>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-elevated p-8 text-center">
        <p className="text-sm text-empire-subtle">Sem dados de produtividade no periodo.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-empire-border bg-white overflow-hidden">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="border-b-2 border-empire-border bg-empire-elevated">
            {COLUMNS.map((col, i) => (
              <th
                key={col}
                className={cn(
                  'px-4 py-3 text-[10px] font-mono font-semibold tracking-wider uppercase text-empire-subtle',
                  i === 0
                    ? 'text-left min-w-[110px] sticky left-0 bg-empire-elevated z-10'
                    : 'text-center min-w-[90px]',
                  col === 'Faturamento' && 'min-w-[110px]',
                )}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.mes}
              className="border-b border-empire-border hover:bg-empire-elevated/40 transition-colors"
            >
              <td className="px-4 py-3.5 font-semibold text-empire-void whitespace-nowrap text-sm sticky left-0 bg-empire-surface z-10">
                {row.mes_label}
              </td>

              <td
                className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                onClick={() =>
                  onOpenModal(`Leads — ${row.mes_label}`, row.leads_gerados)
                }
              >
                <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">
                  {row.leads}
                </div>
              </td>

              <td
                className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                onClick={() =>
                  onOpenModal(`MQLs — ${row.mes_label}`, row.leads_mqls)
                }
              >
                <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">
                  {row.mqls}
                </div>
              </td>

              <td
                className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                onClick={() =>
                  onOpenModal(`Conectados \u2014 ${row.mes_label}`, row.leads_conectados)
                }
              >
                <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">
                  {row.conectados}
                </div>
              </td>

              <td
                className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                onClick={() =>
                  onOpenModal(`Agendados \u2014 ${row.mes_label}`, row.leads_agendados)
                }
              >
                <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">
                  {row.agendados}
                </div>
              </td>

              <td
                className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                onClick={() =>
                  onOpenModal(`Reunioes \u2014 ${row.mes_label}`, row.leads_reunioes)
                }
              >
                <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">
                  {row.reunioes}
                </div>
              </td>

              <td
                className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                onClick={() =>
                  onOpenModal(`Fechados \u2014 ${row.mes_label}`, row.leads_fechados)
                }
              >
                <div className="text-lg font-bold text-empire-void leading-tight tabular-nums">
                  {row.fechados}
                </div>
              </td>

              <td className="px-4 py-3.5 text-center font-semibold text-empire-primary whitespace-nowrap text-sm">
                {fmtCurrencyCompact(row.faturamento)}
              </td>
            </tr>
          ))}
        </tbody>

        {/* Footer: Totals */}
        <tfoot className="border-t-2 border-empire-border bg-empire-elevated">
          <tr>
            <td className="px-4 py-2.5 text-[10px] font-mono font-semibold text-empire-subtle uppercase tracking-wider sticky left-0 bg-empire-elevated z-10">
              Total
            </td>
            <td className="px-4 py-2.5 text-center text-sm font-mono font-bold text-empire-void">
              {totals.leads}
            </td>
            <td className="px-4 py-2.5 text-center text-sm font-mono font-bold text-empire-void">
              {totals.mqls}
            </td>
            <td className="px-4 py-2.5 text-center text-sm font-mono font-bold text-empire-void">
              {totals.conectados}
            </td>
            <td className="px-4 py-2.5 text-center text-sm font-mono font-bold text-empire-void">
              {totals.agendados}
            </td>
            <td className="px-4 py-2.5 text-center text-sm font-mono font-bold text-empire-void">
              {totals.reunioes}
            </td>
            <td className="px-4 py-2.5 text-center text-sm font-mono font-bold text-empire-void">
              {totals.fechados}
            </td>
            <td className="px-4 py-2.5 text-center text-sm font-mono font-bold text-empire-primary">
              {fmtCurrencyCompact(totals.faturamento)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
