import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { useSDRAtividade } from '@/hooks/useSDRAtividade'
import type { SDRAtividadeRow } from '@/hooks/useSDRAtividade'
import { Phone, MessageSquare, Users, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────

interface Props {
  startDate: string
  endDate: string
  pipelineMode: 'exclude_recuperacao' | 'only_recuperacao'
  enabled: boolean
}

// ─── Helpers ──────────────────────────────────────────────────

function fmtDiaFull(dateStr: string): string {
  const dias = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
  const dt = new Date(dateStr + 'T12:00:00')
  const [, m, d] = dateStr.split('-')
  return `${dias[dt.getDay()]} ${d}/${m}`
}

// ─── KPI Card ─────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  subLabel,
  subValue,
}: {
  icon: React.ElementType
  label: string
  value: number | string
  subLabel: string
  subValue: string
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-empire-border bg-empire-surface p-4 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-empire-subtle" />
        <span className="text-xs font-medium uppercase tracking-wider text-empire-subtle">{label}</span>
      </div>
      <p className="text-2xl font-bold leading-tight text-empire-void">{value}</p>
      <p className="text-xs text-empire-muted">
        {subLabel}: <span className="font-semibold text-empire-void">{subValue}</span>
      </p>
    </div>
  )
}

// ─── Leaderboard ──────────────────────────────────────────────

function AtividadeLeaderboard({
  rows,
  expandedSdr,
  onToggle,
}: {
  rows: SDRAtividadeRow[]
  expandedSdr: string | null
  onToggle: (sdr: string) => void
}) {
  if (!rows.length) {
    return <p className="text-sm text-empire-muted">Sem atividade registrada no período.</p>
  }

  // Encontrar melhor/pior para highlight
  const totalAtividade = rows.map((r) => r.totais.ligacoes + r.totais.mensagens)
  const bestTotal = Math.max(...totalAtividade)
  const worstTotal = Math.min(...totalAtividade)

  return (
    <div className="overflow-hidden overflow-x-auto rounded-xl border border-empire-border">
      <table className="w-full text-sm">
        <thead className="border-b border-empire-border bg-empire-elevated">
          <tr>
            <th className="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">#</th>
            <th className="px-4 py-3 text-left font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">SDR</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">Ligações</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">Msgs</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">Pessoas</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">Lig/dia</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">Msg/dia</th>
            <th className="px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-empire-subtle">Pes/dia</th>
            <th className="w-8 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const total = row.totais.ligacoes + row.totais.mensagens
            const isExpanded = expandedSdr === row.sdr

            return (
              <SDRRowGroup
                key={row.sdr}
                row={row}
                rank={i + 1}
                total={total}
                bestTotal={bestTotal}
                worstTotal={worstTotal}
                isExpanded={isExpanded}
                onToggle={() => onToggle(row.sdr)}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── SDR Row + Expandable Day Detail ──────────────────────────

function SDRRowGroup({
  row,
  rank,
  total,
  bestTotal,
  worstTotal,
  isExpanded,
  onToggle,
}: {
  row: SDRAtividadeRow
  rank: number
  total: number
  bestTotal: number
  worstTotal: number
  isExpanded: boolean
  onToggle: () => void
}) {
  const isBest = total === bestTotal && total > 0
  const isWorst = total === worstTotal && bestTotal !== worstTotal

  return (
    <>
      <tr
        className={cn(
          'cursor-pointer transition-colors hover:bg-empire-elevated',
          !isExpanded && 'border-b border-empire-border'
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-xs text-empire-subtle">{rank}</td>
        <td className="px-4 py-3 font-medium text-empire-void">{row.sdr}</td>
        <td className="px-4 py-3 text-right font-semibold">{row.totais.ligacoes}</td>
        <td className="px-4 py-3 text-right font-semibold">{row.totais.mensagens}</td>
        <td className="px-4 py-3 text-right font-semibold">{row.totais.pessoasContatadas}</td>
        <td className="px-4 py-3 text-right text-empire-subtle">{row.totais.mediaLigacoesDia}</td>
        <td className="px-4 py-3 text-right text-empire-subtle">{row.totais.mediaMensagensDia}</td>
        <td className="px-4 py-3 text-right text-empire-subtle">{row.totais.mediaPessoasDia}</td>
        <td className="px-4 py-3 text-center">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
              isBest && 'bg-empire-success/10 text-empire-success',
              isWorst && 'bg-empire-danger/10 text-empire-danger',
            )}
          >
            {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        </td>
      </tr>

      {isExpanded && (
        <tr className="border-b border-empire-border">
          <td colSpan={9}>
            <div className="bg-empire-elevated px-6 py-3">
              <p className="mb-2 text-xs font-semibold text-empire-void">
                {row.sdr} — Detalhamento diário
              </p>
              <div className="overflow-x-auto rounded-lg border border-empire-border">
                <table className="w-full text-xs">
                  <thead className="bg-empire-surface">
                    <tr className="border-b border-empire-border">
                      <th className="px-3 py-2 text-left font-medium text-empire-subtle">Dia</th>
                      <th className="px-3 py-2 text-right font-medium text-empire-subtle">Ligações</th>
                      <th className="px-3 py-2 text-right font-medium text-empire-subtle">Msgs</th>
                      <th className="px-3 py-2 text-right font-medium text-empire-subtle">Pessoas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.dias.map((dia) => (
                      <tr
                        key={dia.data}
                        className="border-b border-empire-border transition-colors hover:bg-empire-surface"
                      >
                        <td className="px-3 py-2 font-medium text-empire-void">{fmtDiaFull(dia.data)}</td>
                        <td className="px-3 py-2 text-right">{dia.ligacoes || <span className="text-empire-subtle">—</span>}</td>
                        <td className="px-3 py-2 text-right">{dia.mensagens || <span className="text-empire-subtle">—</span>}</td>
                        <td className="px-3 py-2 text-right">{dia.pessoasContatadas || <span className="text-empire-subtle">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────

export function AtividadeSDRPanel({ startDate, endDate, pipelineMode, enabled }: Props) {
  const { rows, consolidado, loading, error } = useSDRAtividade(startDate, endDate, pipelineMode, enabled)
  const [expandedSdr, setExpandedSdr] = useState<string | null>(null)

  const toggleSdr = (sdr: string) => {
    setExpandedSdr((prev) => (prev === sdr ? null : sdr))
  }

  if (!enabled) return null

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-empire-void">Atividade do Time</h3>
        <p className="mt-0.5 text-xs text-empire-muted">
          Ações manuais dos SDRs no período: ligações, mensagens (WhatsApp/SMS) e pessoas contatadas.
          <span className="ml-1 opacity-70">({consolidado.diasNoPeriodo} dias)</span>
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-empire-danger/30 bg-empire-danger-soft p-4 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0 text-empire-danger" />
          <span className="text-empire-danger">{error}</span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* KPI Cards consolidados */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <KpiCard
              icon={Phone}
              label="Ligações"
              value={consolidado.ligacoes}
              subLabel="Média/dia"
              subValue={String(consolidado.mediaLigacoesDia)}
            />
            <KpiCard
              icon={MessageSquare}
              label="Mensagens"
              value={consolidado.mensagens}
              subLabel="Média/dia"
              subValue={String(consolidado.mediaMensagensDia)}
            />
            <KpiCard
              icon={Users}
              label="Pessoas contatadas"
              value={consolidado.pessoasContatadas}
              subLabel="Média/dia"
              subValue={String(consolidado.mediaPessoasDia)}
            />
          </div>

          <AtividadeLeaderboard
            rows={rows}
            expandedSdr={expandedSdr}
            onToggle={toggleSdr}
          />
        </>
      )}
    </div>
  )
}
