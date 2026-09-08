import { WeeklyReportTable } from '@/components/relatorios/WeeklyReportTable'
import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'

interface CohortTabProps {
  rows: WeeklyReportRow[]
  loading: boolean
}

export function CohortTab({ rows, loading }: CohortTabProps) {
  return (
    <div className="space-y-6">
      <WeeklyReportTable rows={rows} loading={loading} />
    </div>
  )
}
