import { useMemo } from 'react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { FileBarChart } from 'lucide-react'
import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'
import { dedupeWeeklyRows } from '@/lib/relatorios/trendData'

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDateRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }
  return `${s.toLocaleDateString('pt-BR', opts)} – ${e.toLocaleDateString('pt-BR', opts)}`
}

interface WeeklyReportTableProps {
  rows: WeeklyReportRow[]
  loading: boolean
}

function SkeletonRow() {
  return (
    <TableRow>
      {Array.from({ length: 9 }).map((_, i) => (
        <TableCell key={i}>
          <div className="h-4 bg-gray-200 rounded animate-pulse w-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

export function WeeklyReportTable({ rows, loading }: WeeklyReportTableProps) {
  // Dedup por semana (v_weekly_dashboard pode devolver snapshots duplicados do
  // mesmo year_week — ver trendData.ts) + ordenação explícita da semana mais
  // recente para a mais antiga, a ordem que o hook já devolve. Após o dedup,
  // year_week é único e pode seguir como key da linha.
  const tableRows = useMemo(
    () =>
      dedupeWeeklyRows(rows).sort((a, b) =>
        a.week_start > b.week_start ? -1 : a.week_start < b.week_start ? 1 : 0,
      ),
    [rows],
  )

  if (!loading && tableRows.length === 0) {
    return (
      <Card variant="glass">
        <CardContent>
          <EmptyState
            icon={FileBarChart}
            title="Nenhum dado disponível"
            description="Os relatórios semanais ainda não foram gerados para este módulo. O backfill está pendente."
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="glass">
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Semana</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">MQLs</TableHead>
                <TableHead className="text-right">Conectados</TableHead>
                <TableHead className="text-right">Agendados</TableHead>
                <TableHead className="text-right">Reuniões</TableHead>
                <TableHead className="text-right">Fechados</TableHead>
                <TableHead className="text-right">Faturamento</TableHead>
                <TableHead className="text-right">Caixa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : (
                tableRows.map((row) => (
                  <TableRow key={row.year_week}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-empire-void">{row.year_week}</span>
                        <span className="text-[11px] text-empire-subtle">
                          {formatDateRange(row.week_start, row.week_end)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.leads_count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.mqls_count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.conectados_count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.agendados_count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.reunioes_count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.fechados_count ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.faturamento_bruto ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(row.caixa_recebido ?? 0)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
