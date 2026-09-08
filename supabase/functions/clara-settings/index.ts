// Edge Function: clara-settings
// Configurações da Clara por workspace. A chave OpenRouter é resolvida somente
// no servidor para consultar o catálogo de modelos, nunca enviada ao browser.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { corsHeaders } from '../_shared/cors.ts'
import { resolveWorkspaceCredential, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'
import { createRequestId, logSafeError, publicError } from '../_shared/safe-error.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const DEFAULT_MODEL = 'qwen/qwen3.6-plus'
const MODEL_ID_RE = /^[a-z0-9._-]+\/[a-z0-9._-]+$/
// Regra inegociável (AGENTS.md): modelos anthropic/* e openai/* são proibidos
// por custo nas funções que consomem esta configuração (bot-chat, prevendas-ai).
const FORBIDDEN_MODEL_PREFIXES = ['anthropic/', 'openai/']
const MAX_TEXT_LENGTH = 8_000
const MAX_ITEMS = 20

type Action = 'get' | 'save' | 'history' | 'models'

type SettingsInput = {
  is_enabled?: unknown
  persistent_instructions?: unknown
  business_context?: unknown
  response_rules?: unknown
  allowed_modules?: unknown
  allowed_tools?: unknown
  analysis_depth?: unknown
  max_response_tokens?: unknown
  scheduled_report_instructions?: unknown
  model_id?: unknown
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function cleanText(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '').trim().slice(0, MAX_TEXT_LENGTH)
    : ''
}

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((item): item is string => typeof item === 'string').map((item) => cleanText(item)).filter(Boolean))]
    .slice(0, MAX_ITEMS)
}

function cleanInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback
}

/**
 * Detecta model_id com provider proibido (anthropic/*, openai/*), com trim e
 * case-insensitive por robustez — "Anthropic/Claude" também é rejeitado.
 * Valores não-string retornam false: formato inválido segue caindo no fallback
 * Qwen do normalizeSettings, comportamento que permanece intacto.
 */
function hasForbiddenModelPrefix(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const normalized = value.trim().toLowerCase()
  return FORBIDDEN_MODEL_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function normalizeSettings(input: SettingsInput) {
  const depth = input.analysis_depth
  const modelId = typeof input.model_id === 'string' ? input.model_id.trim() : ''
  return {
    is_enabled: input.is_enabled !== false,
    persistent_instructions: cleanText(input.persistent_instructions),
    business_context: cleanText(input.business_context),
    response_rules: cleanText(input.response_rules),
    allowed_modules: cleanList(input.allowed_modules),
    allowed_tools: cleanList(input.allowed_tools),
    analysis_depth: depth === 'concise' || depth === 'detailed' ? depth : 'standard',
    max_response_tokens: cleanInteger(input.max_response_tokens, 2048, 256, 4096),
    scheduled_report_instructions: cleanText(input.scheduled_report_instructions),
    // Valida formato mas não força um modelo específico.
    // A validação contra o catálogo real da OpenRouter acontece no save (ver abaixo).
    model_id: MODEL_ID_RE.test(modelId) ? modelId : DEFAULT_MODEL,
  }
}

async function requireWorkspaceAdmin(req: Request, workspaceId: string) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim()
  if (!token) return { error: json({ error: 'Sua sessão não é válida.' }, 401) }

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user }, error } = await service.auth.getUser(token)
  if (!user || error) return { error: json({ error: 'Sua sessão não é válida.' }, 401) }

  const { data: membership, error: membershipError } = await service
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()
  if (membershipError) throw membershipError
  if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
    return { error: json({ error: 'Apenas owner ou admin pode configurar a Clara.' }, 403) }
  }
  return { service, user }
}

function sanitizeModel(model: Record<string, unknown>) {
  const pricing = (model.pricing ?? {}) as Record<string, unknown>
  const architecture = (model.architecture ?? {}) as Record<string, unknown>
  return {
    id: typeof model.id === 'string' ? model.id : '',
    name: typeof model.name === 'string' ? model.name : '',
    context_length: typeof model.context_length === 'number' ? model.context_length : null,
    input_price: typeof pricing.prompt === 'string' ? pricing.prompt : null,
    output_price: typeof pricing.completion === 'string' ? pricing.completion : null,
    modality: typeof architecture.modality === 'string' ? architecture.modality : null,
    // Todos os modelos são selecionáveis; a validação final é server-side.
    selectable: true,
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Método não permitido.' }, 405)

  const requestId = createRequestId()
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Supabase não configurado')
    const body = await req.json().catch(() => null) as Record<string, unknown> | null
    const action = body?.action as Action
    const workspaceId = typeof body?.workspace_id === 'string' ? body.workspace_id.trim() : ''
    if (!workspaceId || !['get', 'save', 'history', 'models'].includes(action)) {
      return json({ error: 'Solicitação inválida.' }, 400)
    }

    const auth = await requireWorkspaceAdmin(req, workspaceId)
    if ('error' in auth) return auth.error!
    const { service, user } = auth

    if (action === 'get') {
      const { data, error } = await service
        .from('clara_workspace_settings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .maybeSingle()
      if (error) throw error
      return json({ settings: data ?? null, default_model: DEFAULT_MODEL })
    }

    if (action === 'history') {
      const { data, error } = await service
        .from('clara_settings_audit')
        .select('id, changed_by, changed_fields, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return json({ entries: data ?? [] })
    }

    if (action === 'models') {
      try {
        const credential = await resolveWorkspaceCredential(service, workspaceId, 'openrouter')
        const result = await fetch('https://openrouter.ai/api/v1/models', {
          headers: { Authorization: `Bearer ${credential.apiKey}` },
          signal: AbortSignal.timeout(15_000),
        })
        if (!result.ok) return json({ error: 'Não foi possível consultar os modelos agora.' }, 502)
        const payload = await result.json() as { data?: unknown[] }
        const models = (payload.data ?? [])
          .filter((model): model is Record<string, unknown> => !!model && typeof model === 'object')
          .map(sanitizeModel)
          .filter((model) => model.id && model.name)
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        return json({ models, default_model: DEFAULT_MODEL })
      } catch (error) {
        if (error instanceof CredentialResolutionError) {
          return json({ error: 'Cadastre a chave OpenRouter desta conta em Integrações antes de consultar modelos.' }, 422)
        }
        throw error
      }
    }

    const settingsInput = (body?.settings ?? {}) as SettingsInput
    // Rejeição ANTES de qualquer escrita: provider proibido (anthropic/*,
    // openai/*) é erro explícito para o admin corrigir a escolha — não cai no
    // fallback silencioso de formato (DEFAULT_MODEL) do normalizeSettings.
    if (hasForbiddenModelPrefix(settingsInput.model_id)) {
      return json(
        { error: 'Modelos anthropic/* e openai/* não são permitidos por política de custo. Escolha outro modelo do catálogo OpenRouter — o padrão é qwen/qwen3.6-plus.' },
        422
      )
    }
    const settings = normalizeSettings(settingsInput)
    const { data: previous, error: previousError } = await service
      .from('clara_workspace_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    if (previousError) throw previousError

    const changedFields = Object.entries(settings)
      .filter(([key, value]) => JSON.stringify(previous?.[key]) !== JSON.stringify(value))
      .map(([key]) => key)
    const { data, error } = await service
      .from('clara_workspace_settings')
      .upsert({ workspace_id: workspaceId, ...settings, updated_by: user.id }, { onConflict: 'workspace_id' })
      .select('*')
      .single()
    if (error) throw error
    if (changedFields.length > 0) {
      const { error: auditError } = await service.from('clara_settings_audit').insert({
        workspace_id: workspaceId,
        changed_by: user.id,
        changed_fields: changedFields,
      })
      if (auditError) throw auditError
    }
    return json({ settings: data, default_model: DEFAULT_MODEL })
  } catch (error) {
    logSafeError('clara-settings', requestId, error)
    return publicError('internal_error', requestId, 500, corsHeaders)
  }
})
