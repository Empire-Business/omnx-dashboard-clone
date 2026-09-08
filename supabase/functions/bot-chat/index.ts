// Edge Function: bot-chat
// Orquestrador da Clara — delega dados para bot-chat-data e síntese para bot-chat-synthesis.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { TOOLS_DEFINITION } from '../_shared/clara/tools.ts'
import { createRequestId, logSafeError } from '../_shared/safe-error.ts'
import { resolveWorkspaceCredential, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'
import { getAiFailureCode, getOpenRouterUsage, recordAiTelemetry } from '../_shared/ai-telemetry.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const BOT_INTERNAL_SECRET = Deno.env.get('BOT_INTERNAL_SECRET')
const DATA_URL = `${SUPABASE_URL}/functions/v1/bot-chat-data`
const SYNTHESIS_URL = `${SUPABASE_URL}/functions/v1/bot-chat-synthesis`

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Regra inegociável (AGENTS.md): modelos anthropic/* e openai/* são proibidos por
// custo. clara-settings (HTTP 422) e o CHECK do banco já bloqueiam a ESCRITA; este
// clamp é a defesa residual no CONSUMO — se uma settings antiga ainda tiver provider
// proibido, ele é descartado e a request segue no Qwen padrão.
const DEFAULT_MODEL = 'qwen/qwen3.6-plus'
const FORBIDDEN_MODEL_PREFIXES = ['anthropic/', 'openai/']

function hasForbiddenModelPrefix(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return FORBIDDEN_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

interface ChatContext {
  current_module?: string
  current_tab?: string
  active_filters?: Record<string, string | undefined>
  current_date_sp?: string
}

interface ChatRequest {
  message: string
  workspace_id?: string
  context?: ChatContext
  conversation_id?: string
  session_id?: string
  stream?: boolean
}

interface ClaraWorkspaceSettings {
  is_enabled: boolean
  persistent_instructions: string
  business_context: string
  response_rules: string
  allowed_tools: string[]
  allowed_modules: string[]
  analysis_depth: 'concise' | 'standard' | 'detailed'
  max_response_tokens: number
  model_id: string
}

type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OpenRouterMessage =
  | { role: 'user' | 'assistant' | 'system'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

function sseLine(payload: Record<string, unknown>): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

function sseResponse(content: string, conversation_id: string | null, status = 200) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      // Envia o conteúdo completo como um único token para compatibilidade imediata
      controller.enqueue(encoder.encode(sseLine({ type: 'token', text: content })))
      controller.enqueue(encoder.encode(sseLine({ type: 'done', conversation_id })))
      controller.close()
    },
  })
  return new Response(stream, {
    status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      ...CORS_HEADERS,
    },
  })
}

async function loadBotContext(supabase: any, workspaceId: string): Promise<string> {
  const { data } = await supabase
    .from('bot_context')
    .select('title, content')
    .eq('workspace_id', workspaceId)
    .eq('ativo', true)
    .order('ordem')
  if (!data?.length) return ''
  return data.map((r: { title: string; content: string }) => `### ${r.title}\n${r.content}`).join('\n\n')
}

function buildSystemPrompt(ctx?: ChatContext, extraContext?: string, settings?: ClaraWorkspaceSettings | null): string {
  const sections: string[] = []

  sections.push(`Você é a Clara — especialista sênior em marketing direto e vendas da OMNX.
Responde sempre em português brasileiro.
REGRA DE OURO: Nunca pare no dado bruto. Sempre vá ao "e daí?" e ao "o que fazer com isso?".
Quando receber dados, analise em 5 camadas: INTERPRETA, COMPARA, DIAGNOSTICA, PROJETA, RECOMENDA.`)

  sections.push(`## REGRAS INVIOLÁVEIS
- MQL é definido pela TAG "mql" em contatos.tags (campo texto: JSON array ou CSV). NUNCA por pipeline_name ou pipeline_id. Parsing: tags.split(',').map(t=>t.trim()).some(t=>t.toLowerCase()==='mql').
- Pipeline Recuperação (${'Sn1Guqcm6zwZNTVOOf5L'}) SEMPRE excluído de leads novos, MQL, funil e cohort.
- Venda Fechada = registro em vendas_fechamento com data_pagamento_entrada preenchida. NUNCA usar oportunidades.data_fechado.
- COHORT filtra por data_lead_recebido (quando o lead entrou). PRODUTIVIDADE filtra por data do próprio evento.
- "Faturamento do mês" = PRODUTIVIDADE por data_pagamento_entrada (query_revenue_produtividade).
- Timezone: America/Sao_Paulo. DATE sem sufixo, TIMESTAMPTZ com -03:00.
- Apenas leitura — nunca modifique dados.`)

  sections.push(`## COHORT vs PRODUTIVIDADE — NUNCA MISTURAR
- COHORT: pergunta "O que aconteceu com leads gerados em X?" → query_funnel_cohort.
- PRODUTIVIDADE: pergunta "O que foi produzido/faturado no período X?" → query_revenue_produtividade.

### Taxa de Fechamento (Fechados/Reunião) — REGRA CRÍTICA
NUNCA calcule taxa de fechamento dividindo fechados_COHORT por reunioes_COHORT para análise operacional ou planejamento.
Motivo: fechados de cohort recentes são IMATUROS — ciclo de compra é 10–30 dias.
CORRETO: use PRODUTIVIDADE para ambas as métricas (mesma base):
- Vendas do período = query_revenue_produtividade (data_pagamento_entrada)
- Reuniões realizadas do período = COUNT data_realizacao_vendas no período
- Taxa correta = vendas_produtividade / reunioes_realizadas_produtividade (esperado ~15-25%)

### Cohort Recente É Imaturo — SEMPRE Avisar
Se o usuário pedir análise COHORT de um período nos últimos 60 dias:
- SEMPRE avise que "fechados cohort" e "faturamento cohort" serão baixos — isso é NORMAL.
- Frase padrão: "⚠️ Cohort de [mês] ainda está amadurecendo — fechados e faturamento cohort estão baixos porque o ciclo de compra leva 10–30 dias. Para ver o faturamento real gerado no período, use PRODUTIVIDADE (data_pagamento_entrada)."
- Se confundir com problema de conversão, corrija: "Esses poucos fechados no cohort de [mês] não indicam problema no comercial — é tempo de amadurecimento. Para avaliar taxa de fechamento real, use PRODUTIVIDADE."`)

  sections.push(`## FORMATO
- Use markdown, tabelas, listas.
- Valores em R$: R$ 1.234,56. Taxas: 23,4%.
- Ao final indique: "*Análise: COHORT por data_lead_recebido*" ou "*Análise: PRODUTIVIDADE por data_pagamento_entrada*".`)

  if (ctx) {
    const lines: string[] = []
    if (ctx.current_module) lines.push(`- Módulo aberto: ${ctx.current_module}${ctx.current_tab ? ` > ${ctx.current_tab}` : ''}`)
    if (ctx.current_date_sp) lines.push(`- Data atual (São Paulo): ${ctx.current_date_sp}`)
    if (ctx.active_filters) {
      const f = ctx.active_filters
      if (f.startDate && f.endDate) lines.push(`- Período selecionado: ${f.startDate} até ${f.endDate}`)
      if (f.campaign) lines.push(`- Campanha: ${f.campaign}`)
      if (f.channel) lines.push(`- Canal: ${f.channel}`)
      if (f.sdr) lines.push(`- SDR: ${f.sdr}`)
      if (f.closer) lines.push(`- Closer: ${f.closer}`)
    }
    if (lines.length) sections.push(`## CONTEXTO ATUAL DO DASHBOARD\n${lines.join('\n')}`)
  }

  if (extraContext) {
    sections.push(`## CONHECIMENTO ADICIONAL\n${extraContext}`)
  }

  if (settings) {
    const configuredRules = [
      settings.business_context && `### CONTEXTO DA EMPRESA\n${settings.business_context}`,
      settings.persistent_instructions && `### INSTRUÇÕES PERMANENTES\n${settings.persistent_instructions}`,
      settings.response_rules && `### REGRAS ADICIONAIS\n${settings.response_rules}`,
    ].filter(Boolean)
    if (configuredRules.length) sections.push(`## CONFIGURAÇÃO DESTA CONTA\n${configuredRules.join('\n\n')}`)

    if (settings.allowed_modules?.length) {
      const mods = settings.allowed_modules.map((m: string) => {
        const labels: Record<string, string> = { trafego: 'Tráfego', aquisicao: 'Aquisição', organico: 'Orgânico', prevendas: 'Pré-Vendas', vendas: 'Vendas', recuperacao: 'Recuperação', sdr: 'SDR', closer: 'Closer', metas: 'Metas', relatorios: 'Relatórios' }
        return labels[m] ?? m
      })
      sections.push(`## MÓDULOS AUTORIZADOS\nResponda apenas sobre: ${mods.join(', ')}. Se perguntarem sobre outro módulo, diga que não tem acesso.`)
    }

    const depthInstruction = settings.analysis_depth === 'concise'
      ? 'Seja objetiva: priorize a conclusão, até três achados e próximos passos concretos.'
      : settings.analysis_depth === 'detailed'
        ? 'Seja detalhada: explique evidências, comparações, riscos e recomendações em seções claras.'
        : 'Seja equilibrada: explique os achados principais com contexto e próximos passos claros.'
    sections.push(`## PROFUNDIDADE DA RESPOSTA\n${depthInstruction}`)
  }

  return sections.join('\n\n')
}

function truncateToolResult(result: unknown, maxChars = 20_000): string {
  const str = JSON.stringify(result, null, 2)
  if (str.length <= maxChars) return str
  const omitted = str.length - maxChars
  return str.slice(0, maxChars) + `\n...[${omitted} caracteres omitidos — dado muito longo para o contexto]`
}

async function invokeDataWorker(token: string, workspaceId: string, tools: { name: string; arguments: Record<string, unknown> }[]): Promise<{ name: string; result: unknown; ok: boolean }[]> {
  const res = await fetch(DATA_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ tools, workspace_id: workspaceId, _internal_secret: BOT_INTERNAL_SECRET }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`bot-chat-data ${res.status}: ${text.slice(0, 200)}`)
  }
  const data = await res.json()
  return data.results
}

async function invokeSynthesisWorker(
  token: string,
  workspaceId: string,
  systemPrompt: string,
  messages: OpenRouterMessage[],
  stream = false,
  modelId = DEFAULT_MODEL
): Promise<{ content?: string; response?: Response; error?: string }> {
  const res = await fetch(SYNTHESIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ system_prompt: systemPrompt, messages, stream, workspace_id: workspaceId, _internal_secret: BOT_INTERNAL_SECRET, model_id: modelId }),
  })
  if (!res.ok) {
    const text = await res.text()
    return { error: `bot-chat-synthesis ${res.status}: ${text.slice(0, 200)}` }
  }
  if (stream) {
    return { response: res }
  }
  const data = await res.json()
  return { content: data.content }
}

async function runToolRound(
  token: string,
  workspaceId: string,
  systemPrompt: string,
  messages: OpenRouterMessage[],
  maxTokens = 4096,
  modelId = DEFAULT_MODEL
): Promise<{ toolCalls?: ToolCall[]; content?: string; finishReason?: string; error?: string }> {
  const res = await invokeSynthesisWorker(token, workspaceId, systemPrompt, messages, false, modelId)
  if (res.error) return { error: res.error }
  // Aqui precisamos da resposta completa incluindo tool_calls.
  // O synthesis worker atualmente retorna apenas content. Precisamos adaptar para retornar tool_calls também.
  // Como alternativa, fazemos a chamada de decisão diretamente no orquestrador.
  return { content: res.content }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!authHeader) return jsonResponse({ error: 'Authorization header ausente' }, 401)

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const body = await req.json() as ChatRequest & { _internal_secret?: string }
    const { message, context, conversation_id, session_id, stream: streamMode, workspace_id: workspaceId } = body

    if (!message?.trim()) return jsonResponse({ error: 'message é obrigatório' }, 400)
    if (!workspaceId) return jsonResponse({ error: 'workspace_id é obrigatório' }, 400)

    const isServiceCall = !!BOT_INTERNAL_SECRET && body._internal_secret === BOT_INTERNAL_SECRET
    let userId = 'service'

    if (!isServiceCall) {
      const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(authHeader)
      if (authErr || !user) return jsonResponse({ error: 'Não autorizado' }, 401)
      userId = user.id

      const { data: member } = await supabase
        .from('workspace_members')
        .select('clara_habilitado')
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()
      if (!member?.clara_habilitado) {
        return jsonResponse({
          answer: '🔒 Você não tem acesso à Clara. Solicite ao administrador.',
          conversation_id: null,
          _access_denied: true,
        }, 200)
      }
    }

    const { data: claraSettings, error: claraSettingsError } = await supabase
      .from('clara_workspace_settings')
      .select('is_enabled, persistent_instructions, business_context, response_rules, allowed_tools, allowed_modules, analysis_depth, max_response_tokens, model_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (claraSettingsError) throw claraSettingsError
    const settings = claraSettings as ClaraWorkspaceSettings | null
    // Defesa residual no consumo: descarta provider proibido vindo de settings
    // antiga — fallback silencioso para o usuário, ruidoso no log.
    if (settings && hasForbiddenModelPrefix(settings.model_id)) {
      console.warn(`[bot-chat] model_id proibido descartado (${settings.model_id}) — fallback para ${DEFAULT_MODEL}`)
      settings.model_id = DEFAULT_MODEL
    }
    if (settings && !settings.is_enabled) {
      return jsonResponse({ error: 'A Clara está desativada para esta conta.' }, 403)
    }

    let openrouterKey: string
    try {
      openrouterKey = (await resolveWorkspaceCredential(
        supabase as unknown as Parameters<typeof resolveWorkspaceCredential>[0],
        workspaceId,
        'openrouter',
      )).apiKey
    } catch (error) {
      if (error instanceof CredentialResolutionError) {
        await recordAiTelemetry(supabase, {
          workspaceId, feature: 'bot-chat', status: 'failure', errorCode: 'credential_unavailable',
        })
        return jsonResponse({ error: 'Cadastre a chave OpenRouter desta conta em Integrações antes de usar a Clara.' }, 422)
      }
      throw error
    }

    // Chamadas internas autenticadas não têm um auth.users correspondente para
    // persistir conversa. Elas recebem resposta sem histórico, evitando criar
    // dados inválidos ou reutilizar conversa de outro usuário.
    const shouldPersistConversation = !isServiceCall
    let convId: string | null = shouldPersistConversation ? (conversation_id ?? null) : null
    if (shouldPersistConversation && !convId) {
      const { data: newConv } = await supabase
        .from('ai_conversations')
        .insert({ user_id: userId, workspace_id: workspaceId, title: message.slice(0, 100) })
        .select('id')
        .single()
      convId = newConv?.id
      if (!convId) throw new Error('Não foi possível criar a conversa')
    } else if (shouldPersistConversation && convId) {
      const { data: conversation } = await supabase
        .from('ai_conversations')
        .select('id')
        .eq('id', convId)
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      if (!conversation) return jsonResponse({ error: 'Conversa não encontrada nesta conta' }, 404)
    }

    let history: OpenRouterMessage[] = []
    if (convId) {
      const { data: histData } = await supabase
        .from('ai_messages')
        .select('role, content')
        .eq('conversation_id', convId)
        .in('role', ['user', 'assistant'])
        .order('created_at', { ascending: true })
        .limit(10)
      history = (histData ?? []).map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }))
    }

    const extraContext = await loadBotContext(supabase, workspaceId)
    const systemPrompt = buildSystemPrompt(context, extraContext, settings)

    // Session resume
    if (session_id && shouldPersistConversation && convId) {
      const { data: session } = await supabase
        .from('ai_analysis_sessions')
        .select('question, collected_data, expires_at')
        .eq('id', session_id)
        .eq('workspace_id', workspaceId)
        .eq('user_id', userId)
        .maybeSingle()
      if (session && new Date(session.expires_at) > new Date()) {
        const saved = (session.collected_data ?? []) as OpenRouterMessage[]
        const resumeMessages: OpenRouterMessage[] = [
          ...history,
          { role: 'user', content: message },
          ...saved,
          { role: 'user', content: 'Com base em todos os dados coletados acima, escreva agora a resposta final completa e detalhada.' },
        ]
        const res = await invokeSynthesisWorker(authHeader, workspaceId, systemPrompt, resumeMessages, false, settings?.model_id)
        const answer = res.error ? 'Não foi possível sintetizar os dados.' : (res.content ?? '')
        await supabase.from('ai_messages').insert([
          { conversation_id: convId, role: 'user', content: message },
          { conversation_id: convId, role: 'assistant', content: answer },
        ])
        await supabase.from('ai_analysis_sessions').update({ status: 'done', final_answer: answer }).eq('id', session_id).eq('workspace_id', workspaceId).eq('user_id', userId)
        if (streamMode) return sseResponse(answer, convId)
        return jsonResponse({ answer, conversation_id: convId })
      }
    }

    // Loop de coleta + síntese via workers
    const messages: OpenRouterMessage[] = [...history, { role: 'user', content: message }]
    const MAX_ROUNDS = 3
    let finalAnswer = ''

    for (let round = 1; round <= MAX_ROUNDS; round++) {
      // Round 1: pedir tool calls; rounds seguintes: síntese
      const isCollection = round === 1

      // Chamada de decisão/síntese
      // Para coleta, precisamos que o modelo retorne tool_calls. O synthesis worker precisa ser ajustado.
      // Por simplicidade, fazemos a chamada de coleta diretamente no orquestrador.
      // TODO: mover decisão de tool calls para bot-chat-synthesis quando ele suportar tool_calls.

      if (isCollection) {
        // Chamada direta ao OpenRouter para obter tool_calls
        const model = settings?.model_id || DEFAULT_MODEL
        const startedAt = Date.now()
        let res: Response
        try {
          res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${openrouterKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://omnx.pro',
              'X-Title': 'Clara - OMNX',
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'system', content: systemPrompt }, ...messages],
              tools: settings?.allowed_tools?.length
                ? TOOLS_DEFINITION.filter((tool) => settings.allowed_tools.includes(tool.function.name))
                : TOOLS_DEFINITION,
              tool_choice: 'auto',
              temperature: 0.1,
              max_tokens: settings?.max_response_tokens ?? 4096,
              reasoning: { effort: 'none' },
            }),
            signal: AbortSignal.timeout(45_000),
          })
        } catch (error) {
          await recordAiTelemetry(supabase, {
            workspaceId, feature: 'bot-chat', model, status: 'failure',
            durationMs: Date.now() - startedAt, errorCode: getAiFailureCode(undefined, error),
          })
          throw error
        }
        if (!res.ok) {
          await recordAiTelemetry(supabase, {
            workspaceId, feature: 'bot-chat', model, status: 'failure',
            durationMs: Date.now() - startedAt, responseStatus: res.status,
            errorCode: getAiFailureCode(res.status),
          })
          const err = await res.text()
          console.error('[bot-chat] OpenRouter recusou a solicitacao:', err)
          return jsonResponse({ error: 'Servico de IA temporariamente indisponivel.' }, 502)
        }
        const data = await res.json()
        await recordAiTelemetry(supabase, {
          workspaceId, feature: 'bot-chat', model, status: 'success',
          durationMs: Date.now() - startedAt, responseStatus: res.status,
          usage: getOpenRouterUsage(data.usage),
        })
        const assistantMsg = data.choices?.[0]?.message
        const finishReason = data.choices?.[0]?.finish_reason

        if (finishReason !== 'tool_calls' || !assistantMsg?.tool_calls?.length) {
          finalAnswer = assistantMsg?.content ?? 'Não consegui processar a pergunta.'
          break
        }

        messages.push({
          role: 'assistant',
          content: assistantMsg.content ?? null,
          tool_calls: assistantMsg.tool_calls,
        })

        const toolsToRun = assistantMsg.tool_calls.map((tc: ToolCall) => ({
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        }))

        const results = await invokeDataWorker(authHeader, workspaceId, toolsToRun)

        for (let i = 0; i < assistantMsg.tool_calls.length; i++) {
          const tc = assistantMsg.tool_calls[i]
          const r = results[i]
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: truncateToolResult(r?.result ?? { error: 'Tool não executada' }),
          })
        }

        messages.push({
          role: 'user',
          content: 'Com base em todos os dados coletados acima, escreva agora a resposta final completa e detalhada. Não chame mais ferramentas — escreva a análise diretamente.',
        })
      } else {
        // Síntese
        const res = await invokeSynthesisWorker(authHeader, workspaceId, systemPrompt, messages, false, settings?.model_id)
        if (res.error) {
          finalAnswer = 'Não consegui gerar a análise. Tente uma pergunta mais focada.'
        } else {
          finalAnswer = res.content ?? ''
        }
        break
      }
    }

    if (!finalAnswer) {
      finalAnswer = 'Não consegui gerar a análise dentro do tempo disponível. Tente uma pergunta mais focada.'
    }

    if (shouldPersistConversation && convId) {
      await supabase.from('ai_messages').insert([
        { conversation_id: convId, role: 'user', content: message },
        { conversation_id: convId, role: 'assistant', content: finalAnswer },
      ])
      await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId).eq('workspace_id', workspaceId)
    }

    if (streamMode) return sseResponse(finalAnswer, convId)
    return jsonResponse({ answer: finalAnswer, conversation_id: convId })
  } catch (err) {
    const requestId = createRequestId()
    logSafeError('bot-chat', requestId, err)
    return jsonResponse({ answer: 'Não foi possível concluir a análise. Tente novamente.', conversation_id: null, _error: true })
  }
})
