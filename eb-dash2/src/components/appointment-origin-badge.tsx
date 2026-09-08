import {
  getAppointmentOriginLabel,
  getAppointmentOriginBadgeColor,
  buildAppointmentOriginTooltip,
} from '@/lib/appointment-origin'

interface AppointmentOriginBadgeProps {
  origin: string | null | undefined
  calendarName?: string | null
  bookedByName?: string | null
  assignedUserName?: string | null
}

export function AppointmentOriginBadge({
  origin,
  calendarName,
  bookedByName,
  assignedUserName,
}: AppointmentOriginBadgeProps) {
  if (!origin) return null

  const label = getAppointmentOriginLabel(origin)
  const color = getAppointmentOriginBadgeColor(origin)
  const tooltip = buildAppointmentOriginTooltip(
    origin,
    calendarName,
    bookedByName,
    assignedUserName,
  )

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {label}
    </span>
  )
}
