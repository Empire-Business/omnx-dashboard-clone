import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { getWorkspaceId } from '@/lib/workspace'

export type Frequency = 'daily' | 'weekly' | 'biweekly' | 'monthly'
export type ReportType = 'cohort' | 'produtividade'
export type EmailFormat = 'full' | 'clara_only'

export interface WeeklyEmailSchedule {
  id: string
  created_at: string
  updated_at: string
  created_by: string
  name: string
  description: string | null
  is_active: boolean
  modules: string[]
  report_type: ReportType
  dimensions: string[]
  frequency: Frequency
  day_of_week: number | null
  day_of_month: number | null
  time_of_day: string
  timezone: string
  last_run_at: string | null
  next_run_at: string | null
  subject: string
  recipient_emails: string[]
  reply_to: string | null
  template_key: string
  include_comparative: boolean
  include_trends: boolean
  clara_prompt: string | null
  use_clara_summary: boolean
  email_format: EmailFormat
  email_sent_count: number
  last_error: string | null
}

export interface WeeklyEmailLog {
  id: string
  created_at: string
  schedule_id: string
  week_start: string | null
  report_type: string | null
  recipient_emails: string[] | null
  subject: string | null
  status: 'pending' | 'sent' | 'failed' | 'bounced'
  resend_message_id: string | null
  error_message: string | null
  opened_at: string | null
  clicked_at: string | null
}

export interface CreateScheduleInput {
  name: string
  description?: string
  modules: string[]
  report_type: ReportType
  frequency: Frequency
  day_of_week?: number | null
  day_of_month?: number | null
  time_of_day: string
  subject: string
  recipient_emails: string[]
  reply_to?: string | null
  template_key?: string
  include_comparative?: boolean
  include_trends?: boolean
  clara_prompt?: string | null
  use_clara_summary?: boolean
  email_format?: EmailFormat
}

export interface UpdateScheduleInput extends Partial<CreateScheduleInput> {
  is_active?: boolean
}

export interface SuggestedConfig {
  name?: string
  modules?: string[]
  report_type?: ReportType
  frequency?: Frequency
  day_of_week?: number | null
  day_of_month?: number | null
  time_of_day?: string
  subject?: string
  recipient_emails?: string[]
  include_comparative?: boolean
  include_trends?: boolean
  use_clara_summary?: boolean
  clara_prompt?: string
  email_format?: EmailFormat
}

interface UseWeeklyEmailSchedulesReturn {
  schedules: WeeklyEmailSchedule[]
  loading: boolean
  error: string | null
  refresh: () => void
  createSchedule: (input: CreateScheduleInput) => Promise<{ id: string } | { error: string }>
  updateSchedule: (id: string, input: UpdateScheduleInput) => Promise<{ success: boolean } | { error: string }>
  deleteSchedule: (id: string) => Promise<{ success: boolean } | { error: string }>
  getLogs: (scheduleId: string, limit?: number) => Promise<WeeklyEmailLog[]>
  sendTest: (scheduleId: string, testEmail?: string) => Promise<{ success: boolean; message?: string }>
  suggestWithAI: (description: string) => Promise<SuggestedConfig | { error: string }>
}

const ALL_MODULES = [
  'trafego',
  'aquisicao',
  'organico',
  'prevendas',
  'vendas',
  'recuperacao',
  'sdr',
  'closer',
  'metas',
]

export function useWeeklyEmailSchedules(): UseWeeklyEmailSchedulesReturn {
  const [schedules, setSchedules] = useState<WeeklyEmailSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    async function load() {
      try {
        const { data, error: rpcError } = await supabase.rpc('list_weekly_email_schedules')
        if (cancelled) return
        if (rpcError) throw rpcError
        setSchedules((data ?? []) as WeeklyEmailSchedule[])
      } catch (err) {
        if (!cancelled) {
          console.error('[useWeeklyEmailSchedules] load error', err)
          setError(err instanceof Error ? err.message : (err as { message?: string })?.message ?? String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [refreshKey])

  const createSchedule = useCallback(async (input: CreateScheduleInput) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('create_weekly_email_schedule', {
        p_name: input.name,
        p_description: input.description ?? null,
        p_modules: input.modules,
        p_report_type: input.report_type,
        p_frequency: input.frequency,
        p_day_of_week: input.day_of_week ?? null,
        p_day_of_month: input.day_of_month ?? null,
        p_time_of_day: input.time_of_day,
        p_subject: input.subject,
        p_recipient_emails: input.recipient_emails,
        p_reply_to: input.reply_to ?? null,
        p_template_key: input.template_key ?? 'default',
        p_include_comparative: input.include_comparative ?? true,
        p_include_trends: input.include_trends ?? false,
        p_clara_prompt: input.clara_prompt ?? null,
        p_use_clara_summary: input.use_clara_summary ?? false,
        p_email_format: input.email_format ?? 'full',
      })

      if (rpcError) throw rpcError
      refresh()
      return { id: data as string }
    } catch (err) {
      console.error('[useWeeklyEmailSchedules] create error', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [refresh])

  const updateSchedule = useCallback(async (id: string, input: UpdateScheduleInput) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('update_weekly_email_schedule', {
        p_id: id,
        p_name: input.name ?? null,
        p_description: input.description ?? null,
        p_is_active: input.is_active ?? null,
        p_modules: input.modules ?? null,
        p_report_type: input.report_type ?? null,
        p_frequency: input.frequency ?? null,
        p_day_of_week: input.day_of_week ?? null,
        p_day_of_month: input.day_of_month ?? null,
        p_time_of_day: input.time_of_day ?? null,
        p_subject: input.subject ?? null,
        p_recipient_emails: input.recipient_emails ?? null,
        p_reply_to: input.reply_to ?? null,
        p_template_key: input.template_key ?? null,
        p_include_comparative: input.include_comparative ?? null,
        p_include_trends: input.include_trends ?? null,
        p_clara_prompt: input.clara_prompt ?? null,
        p_use_clara_summary: input.use_clara_summary ?? null,
        p_email_format: input.email_format ?? null,
      })

      if (rpcError) throw rpcError
      refresh()
      return { success: data === true }
    } catch (err) {
      console.error('[useWeeklyEmailSchedules] update error', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [refresh])

  const deleteSchedule = useCallback(async (id: string) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('delete_weekly_email_schedule', { p_id: id })
      if (rpcError) throw rpcError
      refresh()
      return { success: data === true }
    } catch (err) {
      console.error('[useWeeklyEmailSchedules] delete error', err)
      return { error: err instanceof Error ? err.message : String(err) }
    }
  }, [refresh])

  const getLogs = useCallback(async (scheduleId: string, limit = 20) => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_weekly_email_logs', {
        p_schedule_id: scheduleId,
        p_limit: limit,
      })
      if (rpcError) throw rpcError
      return (data ?? []) as WeeklyEmailLog[]
    } catch (err) {
      console.error('[useWeeklyEmailSchedules] getLogs error', err)
      return []
    }
  }, [])

  const sendTest = useCallback(async (scheduleId: string, testEmail?: string) => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Sessão expirada')

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-weekly-report-email`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          schedule_id: scheduleId,
          test_email: testEmail,
        }),
      })

      const result = await response.json().catch(() => ({ error: 'Resposta inválida' }))
      if (!response.ok) throw new Error(result.error ?? `Erro ${response.status}`)

      refresh()
      return { success: true, message: 'E-mail de teste enviado' }
    } catch (err) {
      console.error('[useWeeklyEmailSchedules] sendTest error', err)
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }, [refresh])

  const suggestWithAI = useCallback(async (description: string): Promise<SuggestedConfig | { error: string }> => {
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Sessão expirada')
      const workspaceId = await getWorkspaceId()
      if (!workspaceId) throw new Error('Não foi possível identificar a conta ativa')

      const prompt = `Você é a Clara, assistente de configuração de relatórios automáticos da OMNX.
Analise o pedido abaixo e retorne APENAS um objeto JSON válido com os campos:
- name (string): nome curto da automação
- modules (array de strings): escolha entre ["trafego", "aquisicao", "organico", "prevendas", "vendas", "recuperacao", "sdr", "closer", "metas"]
- report_type (string): "cohort" ou "produtividade"
- frequency (string): "daily", "weekly", "biweekly" ou "monthly"
- day_of_week (number ou null): 0=domingo a 6=sábado; use para weekly/biweekly
- day_of_month (number ou null): 1-31; use para monthly
- time_of_day (string): formato HH:MM
- subject (string): assunto do e-mail
- recipient_emails (array de strings): e-mails extraídos do texto
- include_comparative (boolean)
- include_trends (boolean)
- use_clara_summary (boolean): true se o usuário pediu resumo/análise da Clara
- clara_prompt (string): instruções extras para a Clara, se houver

Pedido: "${description}"

Responda apenas o JSON, sem explicações.`

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bot-chat-synthesis`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({
          system_prompt:
            'Você é um parser de configuração. Sempre responda apenas um objeto JSON válido, sem markdown, sem explicações.',
          messages: [{ role: 'user', content: prompt }],
          workspace_id: workspaceId,
          temperature: 0.1,
          max_tokens: 800,
        }),
      })

      const result = await response.json().catch(() => ({ content: '' }))
      const content = (result.content ?? '') as string

      // Tenta extrair JSON da resposta
      const match = content.match(/\{[\s\S]*\}/)
      const jsonStr = match ? match[0] : content
      const parsed = JSON.parse(jsonStr) as SuggestedConfig

      // Valida módulos
      if (parsed.modules) {
        parsed.modules = parsed.modules.filter((m) => ALL_MODULES.includes(m))
      }

      return parsed
    } catch (err) {
      console.error('[useWeeklyEmailSchedules] suggestWithAI error', err)
      return { error: err instanceof Error ? err.message : 'Não foi possível interpretar o pedido' }
    }
  }, [])

  return {
    schedules,
    loading,
    error,
    refresh,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    getLogs,
    sendTest,
    suggestWithAI,
  }
}
