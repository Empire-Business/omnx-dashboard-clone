import { WeeklyReportTable } from '@/components/relatorios/WeeklyReportTable'
import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'

interface ProdutividadeTabProps {
  rows: WeeklyReportRow[]
  loading: boolean
}

export function ProdutividadeTab({ rows, loading }: ProdutividadeTabProps) {
  return (
    <div className="space-y-6">
      <WeeklyReportTable rows={rows} loading={loading} />
    </div>
  )
}
