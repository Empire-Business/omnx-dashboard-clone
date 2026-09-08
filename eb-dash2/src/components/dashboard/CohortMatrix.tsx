import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import type { CohortRow } from '@/hooks/useCohort'
import type { OppRow } from '@/hooks/useTrafego'
import { filterUniqueMqls } from '@/hooks/useTrafego'

// ─── Formatting helpers ───────────────────────────────────
function fmtCurrency(v: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

function fmtCurrencyCompact(v: number) {
  if (v === 0) return '\u2014'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(v)
}

// ─── Cell color logic ─────────────────────────────────────
function cellColor(pct: number, avg: number): string {
  if (avg === 0) return ''
  const diff = pct - avg
  if (diff < -20) return 'bg-[var(--data-danger-soft)] text-[var(--data-danger)]'
  if (diff < -10) return 'bg-[var(--data-warning-soft)] text-empire-warning'
  if (diff > 10) return 'bg-[var(--data-success-soft)] text-[var(--data-success)]'
  return ''
}

// ─── CohortCell ───────────────────────────────────────────
function CohortCell({
  value,
  pct,
  avg,
  onClick,
}: {
  value: number
  pct: number
  avg: number
  onClick: () => void
}) {
  return (
    <td
      className={cn(
        'px-4 py-3.5 text-center cursor-pointer transition-colors hover:brightness-95',
        cellColor(pct, avg),
      )}
      onClick={onClick}
    >
      <div className="text-lg font-bold text-empire-void leading-tight font-mono tabular-nums">{value}</div>
      <div className="text-[11px] font-medium text-empire-subtle mt-0.5 font-mono tabular-nums">{pct}%</div>
    </td>
  )
}

// ─── Props ────────────────────────────────────────────────
interface CohortMatrixProps {
  rows: CohortRow[]
  avgConectados: number
  avgAgendados: number
  avgReuniao: number
  avgFechados: number
  totals: {
    leads: number
    mqls: number
    conectados: number
    agendados: number
    reunioes: number
    fechados: number
    faturamento: number
  }
  metaSpend: number
  loading: boolean
  paymentDateMap: Map<string, string>
  onOpenModal: (title: string, leads: OppRow[]) => void
}

// ─── Header columns ───────────────────────────────────────
const COLUMNS = ['Cohort', 'Leads', 'MQLs', 'Conectados', 'Agendados', 'Reunioes', 'Fechados', 'Faturamento']

export function CohortMatrix({
  rows,
  avgConectados,
  avgAgendados,
  avgReuniao,
  avgFechados,
  totals,
  metaSpend,
  loading,
  paymentDateMap,
  onOpenModal,
}: CohortMatrixProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-empire-border bg-empire-elevated p-8 text-center">
        <p className="text-sm text-empire-subtle">Sem dados de cohort no periodo.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex items-center gap-4 text-[11px] text-empire-subtle">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[var(--data-success-soft)]" /> Acima da media
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[var(--data-warning-soft)]" /> Levemente abaixo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded bg-[var(--data-danger-soft)]" /> Muito abaixo
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-empire-border bg-white overflow-hidden">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b-2 border-empire-border bg-empire-elevated">
              {COLUMNS.map((col, i) => (
                <th
                  key={col}
                  className={cn(
                    'px-4 py-3 text-[11px] font-mono font-semibold tracking-wider uppercase text-empire-subtle',
                    i === 0 ? 'text-left min-w-[110px] sticky left-0 bg-empire-elevated z-10' : 'text-center min-w-[90px]',
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
                key={row.cohort_mes}
                className="border-b border-empire-border hover:bg-empire-elevated/40 transition-colors"
              >
                <td className="px-4 py-3.5 font-semibold text-empire-void whitespace-nowrap text-sm sticky left-0 bg-empire-surface z-10">
                  {row.cohort_label}
                </td>

                {/* Leads */}
                <td
                  className="px-4 py-3.5 text-center cursor-pointer hover:bg-empire-elevated transition-colors"
                  onClick={() => onOpenModal(`Leads \u2014 ${row.cohort_label}`, row.leads)}
                >
                  <div className="text-lg font-bold text-empire-void leading-tight">
                    {row.leads_count}
                  </div>
                </td>

                {/* MQLs */}
                <CohortCell
                  value={row.mqls}
                  pct={row.mqls_pct}
                  avg={0}
                  onClick={() =>
                    onOpenModal(
                      `MQLs \u2014 ${row.cohort_label}`,
                      filterUniqueMqls(row.leads),
                    )
                  }
                />

                {/* Conectados */}
                <CohortCell
                  value={row.conectados}
                  pct={row.conectados_pct}
                  avg={avgConectados}
                  onClick={() =>
                    onOpenModal(
                      `Conectados \u2014 ${row.cohort_label}`,
                      row.leads.filter((o) => !!o.data_conectado),
                    )
                  }
                />

                {/* Agendados */}
                <CohortCell
                  value={row.agendados}
                  pct={row.agendados_pct}
                  avg={avgAgendados}
                  onClick={() =>
                    onOpenModal(
                      `Agendados \u2014 ${row.cohort_label}`,
                      row.leads.filter((o) => !!o.data_agendamento_reuniao),
                    )
                  }
                />

                {/* Reunioes */}
                <CohortCell
                  value={row.reunioes}
                  pct={row.reunioes_pct}
                  avg={avgReuniao}
                  onClick={() =>
                    onOpenModal(
                      `Reunioes \u2014 ${row.cohort_label}`,
                      row.leads.filter((o) => !!o.data_realizacao_vendas),
                    )
                  }
                />

                {/* Fechados */}
                <CohortCell
                  value={row.fechados}
                  pct={row.fechados_pct}
                  avg={avgFechados}
                  onClick={() =>
                    onOpenModal(
                      `Fechados \u2014 ${row.cohort_label}`,
                      row.leads.filter((o) => paymentDateMap.has(o.id)),
                    )
                  }
                />

                {/* Faturamento */}
                <td className="px-4 py-3.5 text-center font-mono font-semibold text-empire-primary whitespace-nowrap text-sm">
                  {fmtCurrencyCompact(row.faturamento)}
                </td>
              </tr>
            ))}
          </tbody>

          {/* Footer: Averages + Cost per stage */}
          <tfoot className="border-t-2 border-empire-border bg-empire-elevated">
            {/* Averages row */}
            <tr className="border-b border-empire-border">
              <td className="px-4 py-2.5 text-[11px] font-mono font-semibold text-empire-subtle uppercase tracking-wider sticky left-0 bg-empire-elevated z-10">
                Media %
              </td>
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5 text-center text-xs font-mono font-medium text-empire-subtle">
                {Math.round(avgConectados)}%
              </td>
              <td className="px-4 py-2.5 text-center text-xs font-mono font-medium text-empire-subtle">
                {Math.round(avgAgendados)}%
              </td>
              <td className="px-4 py-2.5 text-center text-xs font-mono font-medium text-empire-subtle">
                {Math.round(avgReuniao)}%
              </td>
              <td className="px-4 py-2.5 text-center text-xs font-mono font-medium text-empire-subtle">
                {Math.round(avgFechados)}%
              </td>
              <td className="px-4 py-2.5" />
            </tr>

            {/* Cost per stage row */}
            {metaSpend > 0 && (
              <tr>
                <td className="px-4 py-2.5 sticky left-0 bg-empire-elevated z-10">
                  <div className="text-[11px] font-semibold text-empire-subtle uppercase tracking-wider">
                    Custo/item
                  </div>
                  <div className="text-[11px] font-normal text-empire-subtle/50 mt-0.5">
                    invest. / etapa
                  </div>
                </td>
                {[
                  { v: totals.leads, suffix: '/ lead' },
                  { v: totals.mqls, suffix: '/ MQL' },
                  { v: totals.conectados, suffix: '/ conect.' },
                  { v: totals.agendados, suffix: '/ agend.' },
                  { v: totals.reunioes, suffix: '/ reuniao' },
                  { v: totals.fechados, suffix: '/ fechado' },
                ].map((col, i) => (
                  <td key={i} className="px-4 py-2.5 text-center">
                    <div className="text-xs font-mono font-semibold text-empire-void">
                      {col.v > 0 ? fmtCurrency(metaSpend / col.v) : '\u2014'}
                    </div>
                    <div className="text-[11px] font-mono text-empire-subtle">{col.suffix}</div>
                  </td>
                ))}
                <td className="px-4 py-2.5" />
              </tr>
            )}
          </tfoot>
        </table>
      </div>
    </div>
  )
}
