import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { GitCompare } from 'lucide-react'
import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function deltaPct(current: number | null, previous: number | null): { value: number; positive: boolean } | null {
  const c = current ?? 0
  const p = previous ?? 0
  if (p === 0 && c === 0) return null
  if (p === 0) return { value: Infinity, positive: true }
  const diff = ((c - p) / p) * 100
  return { value: Math.abs(diff), positive: diff >= 0 }
}

function DeltaBadge({ current, previous }: { current: number | null; previous: number | null }) {
  const d = deltaPct(current, previous)
  if (d === null) return <span className="text-[11px] text-empire-subtle">—</span>
  if (!isFinite(d.value)) {
    return <span className="text-[11px] font-semibold text-emerald-600">∞</span>
  }
  const color = d.positive ? 'text-emerald-600' : 'text-red-600'
  const arrow = d.positive ? '↑' : '↓'
  return (
    <span className={`text-[11px] font-semibold ${color}`}>
      {arrow} {d.value.toFixed(1)}%
    </span>
  )
}

interface WeeklyComparativeTableProps {
  rows: WeeklyReportRow[]
  loading: boolean
}

export function WeeklyComparativeTable({ rows, loading }: WeeklyComparativeTableProps) {
  if (!loading && rows.length < 2) {
    return (
      <Card variant="glass">
        <CardContent>
          <EmptyState
            icon={GitCompare}
            title="Dados insuficientes"
            description="São necessárias pelo menos 2 semanas para exibir a comparação."
          />
        </CardContent>
      </Card>
    )
  }

  // Compare the two most recent weeks
  const currentWeek = rows[rows.length - 1]
  const previousWeek = rows[rows.length - 2]

  const metrics: { label: string; current: number | null; previous: number | null; isCurrency?: boolean }[] = [
    { label: 'Leads', current: currentWeek?.leads_count ?? null, previous: previousWeek?.leads_count ?? null },
    { label: 'MQLs', current: currentWeek?.mqls_count ?? null, previous: previousWeek?.mqls_count ?? null },
    { label: 'Conectados', current: currentWeek?.conectados_count ?? null, previous: previousWeek?.conectados_count ?? null },
    { label: 'Agendados', current: currentWeek?.agendados_count ?? null, previous: previousWeek?.agendados_count ?? null },
    { label: 'Reuniões', current: currentWeek?.reunioes_count ?? null, previous: previousWeek?.reunioes_count ?? null },
    { label: 'Fechados', current: currentWeek?.fechados_count ?? null, previous: previousWeek?.fechados_count ?? null },
    { label: 'Faturamento', current: currentWeek?.faturamento_bruto ?? null, previous: previousWeek?.faturamento_bruto ?? null, isCurrency: true },
    { label: 'Caixa', current: currentWeek?.caixa_recebido ?? null, previous: previousWeek?.caixa_recebido ?? null, isCurrency: true },
  ]

  return (
    <Card variant="glass">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead className="text-right">
                  <span className="text-empire-subtle">{previousWeek?.year_week ?? '—'}</span>
                </TableHead>
                <TableHead className="text-right">
                  <span className="text-empire-void">{currentWeek?.year_week ?? '—'}</span>
                </TableHead>
                <TableHead className="text-right">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.map((m) => (
                <TableRow key={m.label}>
                  <TableCell className="font-medium text-empire-void">{m.label}</TableCell>
                  <TableCell className="text-right tabular-nums text-empire-subtle">
                    {m.isCurrency ? formatCurrency(m.previous ?? 0) : (m.previous ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-medium text-empire-void">
                    {m.isCurrency ? formatCurrency(m.current ?? 0) : (m.current ?? 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DeltaBadge current={m.current} previous={m.previous} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
