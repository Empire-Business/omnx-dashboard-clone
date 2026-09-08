import { WeeklyComparativeTable } from '@/components/relatorios/WeeklyComparativeTable'
import type { WeeklyReportRow } from '@/hooks/useWeeklyReports'

interface ComparativoTabProps {
  rows: WeeklyReportRow[]
  loading: boolean
}

export function ComparativoTab({ rows, loading }: ComparativoTabProps) {
  return (
    <div className="space-y-6">
      <WeeklyComparativeTable rows={rows} loading={loading} />
    </div>
  )
}
