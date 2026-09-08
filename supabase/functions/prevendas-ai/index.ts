// Edge Function: prevendas-ai
// Diagnóstico de padrões de leads parados via OpenRouter (Gemini).
// Cache de 24h na tabela prevendas_ai_insights.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { resolveWorkspaceCredential, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'
import { getAiFailureCode, getOpenRouterUsage, recordAiTelemetry } from '../_shared/ai-telemetry.ts'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'qwen/qwen3.6-plus'
const CACHE_TTL_HOURS = 24

// Regra inegociável (AGENTS.md): modelos anthropic/* e openai/* são proibidos por
// custo. clara-settings (HTTP 422) e o CHECK do banco já bloqueiam a ESCRITA; este
// clamp é a defesa residual no CONSUMO — se uma settings antiga ainda tiver provider
// proibido, ele é descartado e a request segue no Qwen padrão.
const FORBIDDEN_MODEL_PREFIXES = ['anthropic/', 'openai/']

function hasForbiddenModelPrefix(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return FORBIDDEN_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

interface LeadInfo {
  nome: string | null
  tentativas: number
  ultima_tentativa: string | null
  canal: string | null
  dias_sem_contato: number
  ultimas_mensagens?: string[]
}

interface AiInsightsPayload {
  workspace_id: string
  leads: LeadInfo[]
}

interface AiInsightsResult {
  padroes: string[]
  recomendacoes: string[]
  grupos: { label: string; leads_indices: number[] }[]
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function callOpenRouter(
  leads: LeadInfo[],
  apiKey: string,
  model: string,
  supabase: any,
  workspaceId: string,
): Promise<AiInsightsResult> {
  const leadsText = leads
    .map(
      (l, i) =>
        `Lead ${i + 1}: ${l.nome ?? 'Sem nome'} | Canal: ${l.canal ?? '?'} | Tentativas: ${l.tentativas} | Dias sem contato: ${l.dias_sem_contato}` +
        (l.ultimas_mensagens?.length ? ` | Últimas msgs: ${l.ultimas_mensagens.slice(0, 2).join(' / ')}` : '')
    )
    .join('\n')

  const systemPrompt = `Você é um especialista em pré-vendas e SDR (Sales Development Representative).
Analise os leads parados abaixo e identifique:
1. Padrões de comportamento (ex.: leads de determinado canal não respondem, leads com 3+ tentativas abandonam)
2. Recomendações específicas e acionáveis para o time de pré-vendas
3. Grupos de leads similares que podem receber a mesma abordagem

Responda APENAS em JSON com a estrutura:
{
  "padroes": ["padrão 1", "padrão 2", ...],
  "recomendacoes": ["recomendação 1", "recomendação 2", ...],
  "grupos": [{"label": "Descrição do grupo", "leads_indices": [0, 2, 5]}]
}

Seja conciso, direto e em português. Máximo 4 padrões, 4 recomendações, 3 grupos.`

  const startedAt = Date.now()
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnx.pro',
        'X-Title': 'OMNX Pre-Vendas AI',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Leads para análise:\n${leadsText}` },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    })

    if (!response.ok) {
      await recordAiTelemetry(supabase, {
        workspaceId, feature: 'prevendas-ai', model, status: 'failure',
        durationMs: Date.now() - startedAt, responseStatus: response.status,
        errorCode: getAiFailureCode(response.status),
      })
      const errText = await response.text()
      throw new Error(`OpenRouter error ${response.status}: ${errText}`)
    }

    const json = await response.json() as {
      choices: { message: { content: string } }[]
      usage?: unknown
    }
    await recordAiTelemetry(supabase, {
      workspaceId, feature: 'prevendas-ai', model, status: 'success',
      durationMs: Date.now() - startedAt, responseStatus: response.status,
      usage: getOpenRouterUsage(json.usage),
    })
    const content = json.choices?.[0]?.message?.content ?? ''

    // Parse JSON from the response (may be wrapped in markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON found in AI response')

    return JSON.parse(jsonMatch[0]) as AiInsightsResult
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('OpenRouter error ')) throw error
    await recordAiTelemetry(supabase, {
      workspaceId, feature: 'prevendas-ai', model, status: 'failure',
      durationMs: Date.now() - startedAt, errorCode: getAiFailureCode(undefined, error),
    })
    throw error
  }
}

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabaseForAuth = createClient(supabaseUrl, supabaseAnonKey)
    const { data: { user }, error: authError } = await supabaseForAuth.auth.getUser(authHeader)
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const body = await req.json() as AiInsightsPayload
    const { workspace_id, leads } = body

    if (!workspace_id || !leads?.length) {
      return new Response(JSON.stringify({ error: 'workspace_id and leads are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { data: membership } = await supabase.from('workspace_members').select('role').eq('workspace_id', workspace_id).eq('user_id', user.id).eq('is_active', true).maybeSingle()
    if (!membership) return new Response(JSON.stringify({ error: 'Workspace não encontrado ou acesso negado' }), { status: 403, headers: { 'Content-Type': 'application/json' } })
    let openrouterKey: string
    try { openrouterKey = (await resolveWorkspaceCredential(supabase as unknown as Parameters<typeof resolveWorkspaceCredential>[0], workspace_id, 'openrouter')).apiKey }
    catch (error) {
      if (error instanceof CredentialResolutionError) {
        await recordAiTelemetry(supabase, { workspaceId: workspace_id, feature: 'prevendas-ai', status: 'failure', errorCode: 'credential_unavailable' })
        return new Response(JSON.stringify({ error: 'Cadastre a chave OpenRouter desta conta em Integrações antes de usar IA.' }), { status: 422, headers: { 'Content-Type': 'application/json' } })
      }
      throw error
    }

    const { data: claraSettings } = await supabase
      .from('clara_workspace_settings')
      .select('model_id')
      .eq('workspace_id', workspace_id)
      .maybeSingle()
    let modelId = claraSettings?.model_id || DEFAULT_MODEL
    // Defesa residual no consumo: descarta provider proibido vindo de settings
    // antiga — fallback silencioso para o usuário, ruidoso no log.
    if (hasForbiddenModelPrefix(modelId)) {
      console.warn(`[prevendas-ai] model_id proibido descartado (${modelId}) — fallback para ${DEFAULT_MODEL}`)
      modelId = DEFAULT_MODEL
    }

    // Compute cache key
    const inputHash = await sha256Hex(JSON.stringify({ workspace_id, leads }))

    // Check cache (valid for 24h)
    const cacheThreshold = new Date(Date.now() - CACHE_TTL_HOURS * 60 * 60 * 1000).toISOString()
    const { data: cached } = await supabase
      .from('prevendas_ai_insights')
      .select('resultado')
      .eq('workspace_id', workspace_id)
      .eq('input_hash', inputHash)
      .gte('created_at', cacheThreshold)
      .maybeSingle()

    if (cached?.resultado) {
      return new Response(JSON.stringify({ resultado: cached.resultado, cached: true }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Call OpenRouter — try primary model, fallback if error
    let resultado: AiInsightsResult
    try {
      resultado = await callOpenRouter(leads, openrouterKey, modelId, supabase, workspace_id)
    } catch (err) {
      console.error('[prevendas-ai] primary model error, trying fallback:', err)
      resultado = await callOpenRouter(leads, openrouterKey, modelId, supabase, workspace_id)
    }

    // Save to cache (upsert)
    await supabase.from('prevendas_ai_insights').upsert(
      { workspace_id, input_hash: inputHash, resultado },
      { onConflict: 'workspace_id,input_hash' }
    )

    return new Response(JSON.stringify({ resultado, cached: false }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('[prevendas-ai] unhandled error:', err)
    const msg = err instanceof Error ? err.message : String(err)
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
