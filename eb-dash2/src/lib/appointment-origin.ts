export type AppointmentOrigin =
  | 'conversations_ai'
  | 'calendar_page'
  | 'google_calendar'
  | 'event_sync'
  | 'other'
  | null

/**
 * Retorna o rótulo legível para uma origem de agendamento do GHL.
 */
export function getAppointmentOriginLabel(origin: string | null | undefined): string {
  if (origin === 'conversations_ai') return 'SDR IA'
  if (origin === 'calendar_page') return 'Humano'
  if (origin === 'google_calendar') return 'Google Calendar'
  if (origin === 'event_sync') return 'Sync externo'
  if (origin) return origin.replace(/_/g, ' ')
  return 'Desconhecido'
}

/**
 * Retorna as classes Tailwind para o badge de origem do agendamento.
 */
export function getAppointmentOriginBadgeColor(origin: string | null | undefined): string {
  if (origin === 'conversations_ai') return 'bg-purple-100 text-purple-800 border-purple-200'
  if (origin === 'calendar_page') return 'bg-blue-100 text-blue-800 border-blue-200'
  if (origin === 'google_calendar') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  if (origin === 'event_sync') return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

/**
 * Monta o texto do tooltip com os metadados do agendamento.
 */
export function buildAppointmentOriginTooltip(
  origin: string | null | undefined,
  calendarName?: string | null,
  bookedByName?: string | null,
  assignedUserName?: string | null,
): string {
  const lines = [`Origem: ${getAppointmentOriginLabel(origin)}`]
  if (calendarName) lines.push(`Calendário: ${calendarName}`)
  if (bookedByName) lines.push(`Agendado por: ${bookedByName}`)
  if (assignedUserName) lines.push(`Dono do calendário: ${assignedUserName}`)
  return lines.join('\n')
}
