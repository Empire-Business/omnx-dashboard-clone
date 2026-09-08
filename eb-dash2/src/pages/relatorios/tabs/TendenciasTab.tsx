import { TrendChart } from '@/components/relatorios/TrendChart'
import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'
import type { TrendMetric } from '@/lib/relatorios/trendData'

interface TendenciasTabProps {
  rows: WeeklyReportRow[]
  loading: boolean
}

const METRICS: Array<{ key: TrendMetric; title: string }> = [
  { key: 'leads', title: 'Leads por Semana' },
  { key: 'mqls', title: 'MQLs por Semana' },
  { key: 'conectados', title: 'Conectados por Semana' },
  { key: 'agendados', title: 'Agendados por Semana' },
  { key: 'reunioes', title: 'Reuniões por Semana' },
  { key: 'fechados', title: 'Fechados por Semana' },
  { key: 'faturamento_bruto', title: 'Faturamento por Semana' },
  { key: 'caixa_recebido', title: 'Caixa por Semana' },
]

export function TendenciasTab({ rows, loading }: TendenciasTabProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {METRICS.map((m) => (
        <TrendChart key={m.key} rows={rows} loading={loading} metric={m.key} title={m.title} />
      ))}
    </div>
  )
}
