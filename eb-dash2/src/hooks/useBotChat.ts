import { useState, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { publicErrorMessage } from '@/lib/errors'
import { useChatContext } from '@/contexts/ChatContext'
import { getWorkspaceId } from '@/lib/workspace'

interface ActiveFilters {
  startDate?: string
  endDate?: string
  campaign?: string
  channel?: string
  sdr?: string
  closer?: string
  [key: string]: string | undefined
}

interface BotContext {
  current_module?: string
  current_tab?: string
  active_filters?: ActiveFilters
  current_date_sp?: string
}

// Detecta perguntas que abrangem 2+ domínios — precisam de decomposição paralela
function isComplexQuery(text: string): boolean {
  const lower = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

  // Comparação entre funis: NÃO decompor nos 4 domínios genéricos — perderia contexto cross-funil.
  // A tool query_funnel_comparison resolve tudo em 1 chamada.
  const isFunnelComparison = /por funil|compar[ae].*funil|funil.*compar[ae]|todos.*funis|funis.*desempenho|desempenho.*funis|funis.*invest|invest.*funil/.test(lower)
  if (isFunnelComparison) return false

  const domains = [
    /aquisi[cç][aã]o|funil|mqls?|leads?/,
    /organico|org[aâ]nico|canal org/,
    /trafego|tr[aá]fego|meta ads|paid|roas|cpmql/,
    /venda|faturamento|receita|fechamento|cadencia|cad[eê]ncia/,
    /todos.*(numeros|dados|modulos|dominios)|analise.*(completa|geral|mercado)/,
  ]
  const matches = domains.filter((d) => d.test(lower)).length
  return matches >= 3
}

// Monta sub-perguntas focadas por domínio
function buildDomainQuestions(originalText: string): Array<{ domain: string; question: string }> {
  return [
    {
      domain: '📊 Aquisição',
      question: `Analise APENAS a aquisição (funil cohort, MQLs, leads recebidos, taxas de conversão por etapa, comparativo histórico). Contexto da pergunta original do usuário: "${originalText}"`,
    },
    {
      domain: '🌱 Orgânico',
      question: `Analise APENAS o orgânico (canais orgânicos, volume de MQLs por canal, taxa de conversão, tendência). Contexto da pergunta original do usuário: "${originalText}"`,
    },
    {
      domain: '📢 Tráfego Pago',
      question: `Analise APENAS o tráfego pago (Meta Ads: ROAS, CPMQL, spend, tendência de custo, eficiência por campanha). Contexto da pergunta original do usuário: "${originalText}"`,
    },
    {
      domain: '💰 Vendas & Cadência',
      question: `Analise APENAS a cadência de vendas (reuniões realizadas, taxa de fechamento, faturamento, ticket médio, tendência histórica). Contexto da pergunta original do usuário: "${originalText}"`,
    },
  ]
}

// URL base da edge function (sem trailing slash)
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

export function useBotChat() {
  const location = useLocation()
  const { addMessage, updateMessage, conversationId, setConversationId } = useChatContext()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const progressRef = useRef<Record<string, string>>({})

  const buildContext = useCallback((activeFilters?: ActiveFilters): BotContext => {
    const segments = location.pathname.split('/').filter(Boolean)
    const params = new URLSearchParams(location.search)
    const tab = params.get('tab') ?? undefined
    const currentDateSP = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })
    return {
      current_module: segments[0] ?? undefined,
      current_tab: tab,
      active_filters: activeFilters,
      current_date_sp: currentDateSP,
    }
  }, [location])

  // ── Chamada streaming SSE: tokens aparecem em tempo real
  // Usa fetch direto (supabase.functions.invoke não suporta streaming)
  const callBotChatStreaming = useCallback(async (
    message: string,
    context: BotContext,
    convId: string | null,
    placeholderId: string,
  ): Promise<{ conversation_id: string | null }> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sessão expirada — faça login novamente')
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) throw new Error('Não foi possível identificar a conta ativa')

    const response = await fetch(`${SUPABASE_URL}/functions/v1/bot-chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      },
      body: JSON.stringify({ message, context, conversation_id: convId, workspace_id: workspaceId, stream: true }),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Erro na conexão com Clara (${response.status})`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let sseBuffer = ''
    let tokenBuffer = ''
    let finalConvId: string | null = null
    let lastFlush = Date.now()

    // Flush acumulado de tokens a cada 50ms para evitar re-renders excessivos
    const flushTokens = () => {
      if (tokenBuffer) {
        updateMessage(placeholderId, tokenBuffer)
        lastFlush = Date.now()
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      sseBuffer += decoder.decode(value, { stream: true })
      const lines = sseBuffer.split('\n')
      sseBuffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (!data) continue

        try {
          const ev = JSON.parse(data) as { type: string; text?: string; conversation_id?: string }

          if (ev.type === 'status') {
            // Mostrar status como texto italic enquanto não há tokens
            if (!tokenBuffer) {
              updateMessage(placeholderId, `_${ev.text}_`)
            }
          } else if (ev.type === 'token' && ev.text) {
            tokenBuffer += ev.text
            // Flush a cada 50ms para typewriter effect suave
            if (Date.now() - lastFlush > 50) {
              flushTokens()
            }
          } else if (ev.type === 'done') {
            finalConvId = ev.conversation_id ?? null
            flushTokens()
          } else if (ev.type === 'error') {
            throw new Error(ev.text ?? 'Erro no servidor')
          }
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
            throw parseErr
          }
        }
      }
    }

    // Garantir flush final
    flushTokens()
    return { conversation_id: finalConvId }
  }, [updateMessage])

  // ── Chamada não-streaming: resposta completa de uma vez (usado na decomposição paralela)
  const callBotChatRaw = useCallback(async (
    message: string,
    context: BotContext,
    convId: string | null,
    sessionId?: string,
  ): Promise<{ answer: string; conversation_id: string | null }> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) throw new Error('Sessão expirada — faça login novamente')
    const workspaceId = await getWorkspaceId()
    if (!workspaceId) throw new Error('Não foi possível identificar a conta ativa')

    const response = await supabase.functions.invoke('bot-chat', {
      body: { message, context, conversation_id: convId, session_id: sessionId, workspace_id: workspaceId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    })

    if (response.error) {
      throw new Error(publicErrorMessage(response.error, 'Não foi possível consultar a Clara agora.'))
    }

    const data = response.data as { answer: string; conversation_id: string; partial?: boolean; session_id?: string }

    // Auto-continue: coleta foi salva em sessão, retomar síntese na mesma chamada do usuário
    if (data.partial && data.session_id) {
      console.log('[useBotChat] retomando sessão parcial:', data.session_id)
      return await callBotChatRaw(message, context, data.conversation_id ?? convId, data.session_id)
    }

    return { answer: data.answer, conversation_id: data.conversation_id ?? null }
  }, [])

  const sendMessage = useCallback(async (text: string, activeFilters?: ActiveFilters) => {
    if (!text.trim() || isLoading) return

    setError(null)
    setIsLoading(true)
    addMessage({ role: 'user', content: text })

    const context = buildContext(activeFilters)

    try {
      // ── Perguntas simples ou de funil: streaming em tempo real
      if (!isComplexQuery(text)) {
        // Criar placeholder que será preenchido token a token
        const placeholderId = addMessage({ role: 'assistant', content: '_🔍 Buscando dados..._' })
        const { conversation_id } = await callBotChatStreaming(text, context, conversationId, placeholderId)
        if (conversation_id && !conversationId) setConversationId(conversation_id)
        return
      }

      // ── Perguntas complexas: decomposição paralela por domínio (4 sub-queries em paralelo)
      const domains = buildDomainQuestions(text)
      progressRef.current = {}

      const placeholderId = addMessage({
        role: 'assistant',
        content: `🔍 **Clara está analisando ${domains.length} domínios em paralelo...**\n\n_Aguarde — os resultados aparecem conforme cada análise conclui._`,
      })

      const buildContent = () => {
        const parts = domains
          .filter((d) => progressRef.current[d.domain])
          .map((d) => `## ${d.domain}\n\n${progressRef.current[d.domain]}`)
        const pending = domains.filter((d) => !progressRef.current[d.domain]).map((d) => d.domain)
        const header = `🔍 **Análise paralela — ${domains.length - pending.length}/${domains.length} concluídos**`
        const pendingLine = pending.length > 0 ? `\n\n_Analisando: ${pending.join(', ')}..._` : ''
        return header + pendingLine + (parts.length > 0 ? '\n\n---\n\n' + parts.join('\n\n---\n\n') : '')
      }

      await Promise.allSettled(
        domains.map(async ({ domain, question }) => {
          try {
            const { answer } = await callBotChatRaw(question, context, null)
            progressRef.current[domain] = answer
          } catch {
            progressRef.current[domain] = `_Não foi possível obter dados de ${domain}._`
          }
          updateMessage(placeholderId, buildContent())
        })
      )

      const finalParts = domains.map((d) => `## ${d.domain}\n\n${progressRef.current[d.domain] ?? '_Sem dados._'}`)
      updateMessage(placeholderId, finalParts.join('\n\n---\n\n'))

    } catch (err) {
      const msg = publicErrorMessage(err, 'Não foi possível consultar os dados agora.')
      setError(msg)
      addMessage({ role: 'assistant', content: `⚠️ Erro ao consultar os dados: ${msg}` })
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, conversationId, addMessage, updateMessage, setConversationId, buildContext, callBotChatRaw, callBotChatStreaming])

  return { sendMessage, isLoading, error }
}
