// Edge Function: bot-chat-synthesis
// Worker de síntese da Clara — chama OpenRouter com modelo configurável por workspace.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { resolveWorkspaceCredential, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'
import { getAiFailureCode, getOpenRouterUsage, recordAiTelemetry } from '../_shared/ai-telemetry.ts'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

const DEFAULT_MODEL = 'qwen/qwen3.6-plus'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OpenRouterMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }
  | { role: 'system'; content: string }

interface SynthesisRequest {
  workspace_id?: string
  system_prompt: string
  messages: OpenRouterMessage[]
  stream?: boolean
  max_tokens?: number
  temperature?: number
  model_id?: string
  _internal_secret?: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function callOpenRouter(
  body: Record<string, unknown>,
  apiKey: string,
  supabase: any,
  workspaceId: string,
  model: string,
  timeoutMs = 110_000
): Promise<{ ok: true; response: Response } | { ok: false; error: string }> {
  const startedAt = Date.now()
  try {
    const res = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnx.pro',
        'X-Title': 'Clara - OMNX',
      },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (res.ok) {
      let usage: ReturnType<typeof getOpenRouterUsage> = null
      if (!body.stream) {
        try {
          const telemetryBody = await res.clone().json()
          usage = getOpenRouterUsage(telemetryBody?.usage)
        } catch {
          // Uma resposta válida sem corpo JSON ainda conta como chamada bem-sucedida.
        }
      }
      await recordAiTelemetry(supabase, {
        workspaceId, feature: 'bot-chat-synthesis', model, status: 'success',
        durationMs: Date.now() - startedAt, responseStatus: res.status, usage,
      })
      return { ok: true, response: res }
    }
    await recordAiTelemetry(supabase, {
      workspaceId, feature: 'bot-chat-synthesis', model, status: 'failure',
      durationMs: Date.now() - startedAt, responseStatus: res.status,
      errorCode: getAiFailureCode(res.status),
    })
    console.warn(`[bot-chat-synthesis] OpenRouter ${res.status}: ${(await res.text()).slice(0, 200)}`)
  } catch (error) {
    await recordAiTelemetry(supabase, {
      workspaceId, feature: 'bot-chat-synthesis', model, status: 'failure',
      durationMs: Date.now() - startedAt, errorCode: getAiFailureCode(undefined, error),
    })
    console.warn('[bot-chat-synthesis] OpenRouter falhou:', error instanceof Error ? error.message : String(error))
  }
  return { ok: false, error: 'A IA não respondeu. Tente novamente em alguns instantes.' }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const internalSecret = Deno.env.get('BOT_INTERNAL_SECRET')

    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!authHeader) return jsonResponse({ error: 'Authorization header ausente' }, 401)

    const body = await req.json() as SynthesisRequest
    const { system_prompt, messages, stream = false, max_tokens = 8192, temperature = 0.1, workspace_id: workspaceId, model_id } = body
    const isServiceCall = !!internalSecret && body._internal_secret === internalSecret

    if (!system_prompt || typeof system_prompt !== 'string') {
      return jsonResponse({ error: 'system_prompt é obrigatório' }, 400)
    }

    if (!Array.isArray(messages)) {
      return jsonResponse({ error: 'messages deve ser um array' }, 400)
    }
    if (!workspaceId) return jsonResponse({ error: 'workspace_id é obrigatório' }, 400)

    const service = createClient(supabaseUrl, serviceRoleKey)
    if (!isServiceCall) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(authHeader)
      if (authErr || !user) return jsonResponse({ error: 'Não autorizado' }, 401)
      const { data: member } = await service
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .maybeSingle()
      if (!member) return jsonResponse({ error: 'Acesso negado para esta conta' }, 403)
    }

    let openrouterKey: string
    try {
      openrouterKey = (await resolveWorkspaceCredential(
        service as unknown as Parameters<typeof resolveWorkspaceCredential>[0], workspaceId, 'openrouter'
      )).apiKey
    } catch (error) {
      if (error instanceof CredentialResolutionError) {
        await recordAiTelemetry(service, { workspaceId, feature: 'bot-chat-synthesis', status: 'failure', errorCode: 'credential_unavailable' })
        return jsonResponse({ error: 'Cadastre a chave OpenRouter desta conta em Integrações antes de usar IA.' }, 422)
      }
      throw error
    }

    const requestBody: Record<string, unknown> = {
      messages: [{ role: 'system', content: system_prompt }, ...messages],
      temperature,
      max_tokens,
      reasoning: { effort: 'none' },
    }

    if (stream) {
      requestBody.stream = true
    }

    const result = await callOpenRouter(requestBody, openrouterKey, service, workspaceId, model_id || DEFAULT_MODEL)
    if (!result.ok) {
      return jsonResponse({ error: result.error }, 502)
    }

    if (stream) {
      return new Response(result.response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...CORS_HEADERS,
        },
      })
    }

    const json = await result.response.json()
    return jsonResponse({
      content: json.choices?.[0]?.message?.content ?? '',
      finish_reason: json.choices?.[0]?.finish_reason ?? '',
      model_used: json.model ?? '',
      usage: json.usage ?? {},
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[bot-chat-synthesis] ERRO:', msg)
    return jsonResponse({ error: `⛔ ERRO INTERNO: ${msg}` }, 500)
  }
})
