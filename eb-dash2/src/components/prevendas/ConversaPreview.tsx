import { useEffect, useState } from 'react'
import { Bot, User, AlertCircle, Loader2, MessageSquare } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

type Mensagem = {
  id: string
  direction: string | null
  autor: string | null
  mensagem_body: string | null
  data_comunicacao: string | null
  channel: string | null
  msg_status: string | null
  error_msg: string | null
  remetente_nome: string | null
}

type ConversaPreviewProps = {
  contatoId: string
  /** Data do evento que gerou o problema — a conversa é carregada ao redor dela. */
  ancora: Date | null
}

const ANTES = 6
const DEPOIS = 2

/**
 * Limpa o corpo da mensagem para leitura humana. Os mesmos artefatos que o
 * detector de reclamação precisa filtrar aparecem aqui: rodapé `Source:`,
 * trecho citado de resposta e prefixo de transcrição.
 */
function limparCorpo(raw: string | null): string {
  if (!raw) return ''
  let txt = raw
  const seta = txt.lastIndexOf('➡️')
  if (seta >= 0) {
    const depois = txt.slice(seta).replace(/^➡️\s*(Message|For)\s*:\s*/i, '')
    if (depois.trim()) txt = depois
  }
  txt = txt.replace(/\n+Source\s*:.*$/is, '')
  txt = txt.replace(/^Audio Message\.\s*\n?Transcription:\s*/i, '🎙️ ')
  // rodapé de e-mail marketing: ocupava metade do preview com um link gigante
  txt = txt.replace(/If you no longer wish to receive these emails[\s\S]*$/i, '')
  txt = txt.replace(/\[https?:\/\/\S{80,}\]/g, '[link]')
  txt = txt.replace(/\n{3,}/g, '\n\n')
  return txt.trim()
}

const LIMITE_PREVIA = 340

function Bolha({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false)
  const longo = texto.length > LIMITE_PREVIA

  if (!longo) return <p className="whitespace-pre-wrap break-words">{texto}</p>

  return (
    <>
      <p className="whitespace-pre-wrap break-words">
        {aberto ? texto : `${texto.slice(0, LIMITE_PREVIA).trimEnd()}…`}
      </p>
      <button
        onClick={(e) => {
          e.stopPropagation()
          setAberto((v) => !v)
        }}
        className="mt-1 text-[11px] font-medium text-empire-primary hover:underline"
      >
        {aberto ? 'ver menos' : 'ver mensagem completa'}
      </button>
    </>
  )
}

function horaCurta(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ConversaPreview({ contatoId, ancora }: ConversaPreviewProps) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false

    async function carregar() {
      setLoading(true)
      setErro(null)
      try {
        const cols = 'id, direction, autor, mensagem_body, data_comunicacao, channel, msg_status, error_msg, remetente_nome'
        const ref = (ancora ?? new Date()).toISOString()

        const [antes, depois] = await Promise.all([
          supabase
            .from('comunicacoes_com_remetente')
            .select(cols)
            .eq('contato_id', contatoId)
            .lte('data_comunicacao', ref)
            .order('data_comunicacao', { ascending: false })
            .limit(ANTES),
          supabase
            .from('comunicacoes_com_remetente')
            .select(cols)
            .eq('contato_id', contatoId)
            .gt('data_comunicacao', ref)
            .order('data_comunicacao', { ascending: true })
            .limit(DEPOIS),
        ])

        if (antes.error) throw new Error(antes.error.message)
        if (depois.error) throw new Error(depois.error.message)
        if (cancelado) return

        const todas = [...((antes.data ?? []) as Mensagem[]).reverse(), ...((depois.data ?? []) as Mensagem[])]
        setMensagens(todas)
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : 'Erro ao carregar conversa')
      } finally {
        if (!cancelado) setLoading(false)
      }
    }

    void carregar()
    return () => {
      cancelado = true
    }
  }, [contatoId, ancora])

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-empire-subtle">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando conversa…
      </div>
    )
  }

  if (erro) {
    return <p className="py-3 text-sm text-rose-600 dark:text-rose-400">Não foi possível carregar a conversa: {erro}</p>
  }

  if (mensagens.length === 0) {
    return <p className="py-3 text-sm text-empire-subtle">Nenhuma mensagem registrada para este lead.</p>
  }

  const ancoraMs = ancora?.getTime() ?? null

  return (
    <div className="space-y-2.5">
      {mensagens.map((m) => {
        const isLead = m.direction === 'inbound'
        const isIA = !isLead && m.autor === 'automacao'
        const corpo = limparCorpo(m.mensagem_body)
        const falhou = m.msg_status === 'failed' || !!m.error_msg
        // marca a mensagem que originou o problema listado na tabela
        const destaque =
          ancoraMs !== null &&
          m.data_comunicacao !== null &&
          Math.abs(new Date(m.data_comunicacao).getTime() - ancoraMs) < 1000

        const quem = isLead ? 'Lead' : isIA ? 'SDR IA' : m.remetente_nome || 'Humano'

        return (
          <div key={m.id} className={cn('flex', isLead ? 'justify-start' : 'justify-end')}>
            <div className={cn('max-w-[85%] md:max-w-[70%]', isLead ? 'items-start' : 'items-end')}>
              <div
                className={cn(
                  'mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-empire-subtle',
                  isLead ? 'justify-start' : 'justify-end'
                )}
              >
                {isLead ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                <span>{quem}</span>
                {m.channel && <span className="normal-case opacity-70">· {m.channel}</span>}
                <span className="normal-case tabular-nums opacity-70">· {horaCurta(m.data_comunicacao)}</span>
              </div>

              <div
                className={cn(
                  'rounded-2xl border px-3.5 py-2.5 text-sm leading-snug',
                  isLead
                    ? 'rounded-tl-sm border-empire-border bg-empire-border/40 text-empire-void'
                    : isIA
                      ? 'rounded-tr-sm border-empire-primary/30 bg-empire-primary/[0.14] text-empire-void'
                      : 'rounded-tr-sm border-sky-500/30 bg-sky-500/[0.12] text-empire-void',
                  destaque && 'ring-2 ring-amber-500/60',
                  falhou && 'opacity-75'
                )}
              >
                {corpo ? (
                  <Bolha texto={corpo} />
                ) : (
                  <p className="italic text-empire-subtle">(sem texto — anexo ou ligação)</p>
                )}

                {falhou && (
                  <p className="mt-1.5 flex items-start gap-1 text-[11px] text-rose-600 dark:text-rose-400">
                    <AlertCircle className="mt-[1px] h-3 w-3 shrink-0" />
                    <span className="line-clamp-2">Não entregue{m.error_msg ? `: ${m.error_msg}` : ''}</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}

      <p className="flex items-center gap-1.5 pt-1 text-[10px] text-empire-subtle">
        <MessageSquare className="h-3 w-3" />
        Trecho da conversa ao redor do problema · destaque em âmbar = mensagem que gerou o alerta
      </p>
    </div>
  )
}
