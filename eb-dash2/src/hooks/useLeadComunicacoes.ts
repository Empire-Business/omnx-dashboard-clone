import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface Comunicacao {
  id: string
  ghl_message_id: string | null
  channel: string | null
  direction: string | null
  ghl_source: string | null
  msg_status: string | null
  mensagem_body: string | null
  data_comunicacao: string | null
  usuario_ghl_id: string | null
  phone_call_duration: number | null
  phone_call_status: string | null
  phone_call_from: string | null
  phone_call_to: string | null
  msg_from: string | null
  msg_to: string | null
  attachments: unknown | null
  error_msg: string | null
}

interface UseLeadComunicacoesResult {
  messages: Comunicacao[]
  calls: Comunicacao[]
  loading: boolean
  error: string | null
}

export function useLeadComunicacoes(contatoId: string | null | undefined): UseLeadComunicacoesResult {
  const [messages, setMessages] = useState<Comunicacao[]>([])
  const [calls, setCalls] = useState<Comunicacao[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!contatoId) return

    let cancelled = false
    setLoading(true)
    setError(null)

    ;(async () => {
      try {
        const { data, error: err } = await supabase
          .from('comunicacoes')
          .select(`
            id, ghl_message_id, channel, direction, ghl_source, msg_status,
            mensagem_body, data_comunicacao, usuario_ghl_id,
            phone_call_duration, phone_call_status, phone_call_from, phone_call_to,
            msg_from, msg_to, attachments, error_msg
          `)
          .eq('contato_id', contatoId)
          .order('data_comunicacao', { ascending: true })
          .limit(500)

        if (cancelled) return
        if (err) {
          setError(err.message)
          return
        }
        const rows = (data ?? []) as Comunicacao[]
        setMessages(rows.filter((r) => r.channel !== 'call'))
        setCalls(rows.filter((r) => r.channel === 'call'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => { cancelled = true }
  }, [contatoId])

  return { messages, calls, loading, error }
}
