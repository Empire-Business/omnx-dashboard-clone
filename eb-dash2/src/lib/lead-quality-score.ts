import type { OppRow } from '@/hooks/useTrafego'
import { spToday, tsToSPDate } from '@/lib/utils/dates'

export interface LeadQualityCommSnapshot {
  msgs_humanas: number
  msgs_ia: number
  emails: number
  ligacoes: number
  msgs_lead: number
  inbound_dates: string[]
}

export type LeadQualityBucket = 'Excelente' | 'Bom' | 'Medio' | 'Fraco' | 'Critico'
export type LeadQualityMaturity = 'recente' | 'em_resposta' | 'em_agendamento' | 'em_avanco' | 'maduro'

export interface LeadQualityScoreResult {
  scoreTotal: number | null
  scoreBucket: LeadQualityBucket | null
  maturityStage: LeadQualityMaturity | null
  leadAgeDays: number | null
  gainedPoints: number
  eligiblePoints: number
  respondedIn7d: boolean
  connectedIn7d: boolean
  scheduledIn7d: boolean
  meetingScheduledIn10d: boolean
  meetingCompletedIn30d: boolean
  boughtIn90d: boolean
  breakdown: {
    resposta: number
    agendamento: number
    avanco: number
    resultado: number
  }
}

const DAY_MS = 86_400_000

const EMPTY_RESULT: LeadQualityScoreResult = {
  scoreTotal: null,
  scoreBucket: null,
  maturityStage: null,
  leadAgeDays: null,
  gainedPoints: 0,
  eligiblePoints: 0,
  respondedIn7d: false,
  connectedIn7d: false,
  scheduledIn7d: false,
  meetingScheduledIn10d: false,
  meetingCompletedIn30d: false,
  boughtIn90d: false,
  breakdown: {
    resposta: 0,
    agendamento: 0,
    avanco: 0,
    resultado: 0,
  },
}

function dateOnlyToUtc(date: string | null | undefined): Date | null {
  if (!date) return null
  return new Date(`${date}T12:00:00Z`)
}

function diffDays(dateA: Date, dateB: Date): number {
  return Math.floor((dateB.getTime() - dateA.getTime()) / DAY_MS)
}

function diffHours(dateA: Date, dateB: Date): number {
  return (dateB.getTime() - dateA.getTime()) / 3_600_000
}

function hasSalesProgress(opp: OppRow, bought: boolean): boolean {
  return (
    bought ||
    !!opp.data_negociacao ||
    !!opp.data_agendamento_vendas ||
    !!opp.data_realizacao_vendas ||
    (opp.pipeline_name ?? '').toLowerCase().includes('vendas')
  )
}

export function getLeadQualityBucket(score: number): LeadQualityBucket {
  if (score >= 85) return 'Excelente'
  if (score >= 70) return 'Bom'
  if (score >= 50) return 'Medio'
  if (score >= 30) return 'Fraco'
  return 'Critico'
}

export function getLeadQualityMaturity(leadAgeDays: number): LeadQualityMaturity {
  if (leadAgeDays <= 6) return 'recente'
  if (leadAgeDays <= 9) return 'em_resposta'
  if (leadAgeDays <= 29) return 'em_agendamento'
  if (leadAgeDays <= 89) return 'em_avanco'
  return 'maduro'
}

export function computeLeadQualityScore(
  opp: OppRow,
  isMql: boolean,
  comms: LeadQualityCommSnapshot,
  hasPayment: boolean,
  paymentDate: string | null | undefined,
): LeadQualityScoreResult {
  if (!isMql || !opp.data_lead_recebido) return EMPTY_RESULT

  const leadCreatedAt = new Date(opp.data_lead_recebido)
  if (Number.isNaN(leadCreatedAt.getTime())) return EMPTY_RESULT

  const leadDate = dateOnlyToUtc(tsToSPDate(opp.data_lead_recebido))
  const todayDate = dateOnlyToUtc(spToday())
  if (!leadDate || !todayDate) return EMPTY_RESULT

  const leadAgeDays = Math.max(0, diffDays(leadDate, todayDate))
  const maturityStage = getLeadQualityMaturity(leadAgeDays)

  const inboundDates = (comms.inbound_dates ?? [])
    .map((iso) => new Date(iso))
    .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() >= leadCreatedAt.getTime())
    .sort((a, b) => a.getTime() - b.getTime())

  const firstInboundAt = inboundDates[0] ?? null
  const respondedIn7d = firstInboundAt ? diffHours(leadCreatedAt, firstInboundAt) <= 168 : false

  const connectedDate = dateOnlyToUtc(opp.data_conectado)
  const connectedIn7d = connectedDate ? diffDays(leadDate, connectedDate) <= 7 && diffDays(leadDate, connectedDate) >= 0 : false

  const scheduledDate = dateOnlyToUtc(opp.data_agendamento_reuniao)
  const scheduledIn7d = scheduledDate ? diffDays(leadDate, scheduledDate) <= 7 && diffDays(leadDate, scheduledDate) >= 0 : false

  const meetingScheduledDate = dateOnlyToUtc(opp.data_reuniao_agendada)
  const meetingScheduledIn10d = meetingScheduledDate
    ? diffDays(leadDate, meetingScheduledDate) <= 10 && diffDays(leadDate, meetingScheduledDate) >= 0
    : false

  const meetingCompletedDate = dateOnlyToUtc(opp.data_realizacao_vendas)
  const meetingCompletedIn30d = meetingCompletedDate
    ? diffDays(leadDate, meetingCompletedDate) <= 30 && diffDays(leadDate, meetingCompletedDate) >= 0
    : false

  const paymentDateObj = dateOnlyToUtc(paymentDate)
  const boughtIn90d = hasPayment && paymentDateObj
    ? diffDays(leadDate, paymentDateObj) <= 90 && diffDays(leadDate, paymentDateObj) >= 0
    : false

  let scoreResposta = 0
  let scoreAgendamento = 0
  let scoreAvanco = 0
  let scoreResultado = 0
  let eligiblePoints = 0

  const responseEligible = leadAgeDays >= 1 || respondedIn7d || connectedIn7d
  if (responseEligible) {
    eligiblePoints += 25
    if (respondedIn7d) scoreResposta += 10
    if (connectedIn7d) scoreResposta += 8
    if (firstInboundAt) {
      const responseHours = diffHours(leadCreatedAt, firstInboundAt)
      if (responseHours <= 24) scoreResposta += 7
      else if (responseHours <= 72) scoreResposta += 5
      else if (responseHours <= 168) scoreResposta += 3
    }
  }

  const schedulingEligible =
    leadAgeDays >= 10 || scheduledIn7d || meetingScheduledIn10d || !!opp.data_no_show || !!opp.data_agendamento_reuniao
  if (schedulingEligible) {
    eligiblePoints += 25
    if (scheduledIn7d) scoreAgendamento += 15
    if (meetingScheduledIn10d) scoreAgendamento += 10
    if (opp.data_no_show && !meetingCompletedDate) scoreAgendamento = Math.max(0, scoreAgendamento - 5)
  }

  const enteredSalesPhase = hasSalesProgress(opp, !!boughtIn90d || !!hasPayment)
  const advanceEligible =
    leadAgeDays >= 30 || !!opp.data_qualificado || meetingCompletedIn30d || enteredSalesPhase
  if (advanceEligible) {
    eligiblePoints += 25
    if (opp.data_qualificado) scoreAvanco += 10
    if (meetingCompletedIn30d) scoreAvanco += 10
    if (enteredSalesPhase) scoreAvanco += 5
  }

  const resultEligible = leadAgeDays >= 90 || !!hasPayment
  if (resultEligible) {
    eligiblePoints += 25
    if (boughtIn90d) scoreResultado += 25
  }

  const gainedPoints = scoreResposta + scoreAgendamento + scoreAvanco + scoreResultado
  const scoreTotal = eligiblePoints > 0 ? Math.round((gainedPoints / eligiblePoints) * 100) : null

  return {
    scoreTotal,
    scoreBucket: scoreTotal == null ? null : getLeadQualityBucket(scoreTotal),
    maturityStage,
    leadAgeDays,
    gainedPoints,
    eligiblePoints,
    respondedIn7d,
    connectedIn7d,
    scheduledIn7d,
    meetingScheduledIn10d,
    meetingCompletedIn30d,
    boughtIn90d,
    breakdown: {
      resposta: scoreResposta,
      agendamento: scoreAgendamento,
      avanco: scoreAvanco,
      resultado: scoreResultado,
    },
  }
}
