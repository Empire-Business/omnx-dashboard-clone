// Edge Function: ai-ghl-mapping
// Assistente de mapeamento GHL por IA. Recebe a explicação em linguagem natural
// de UM campo que o usuário escolheu após a discovery e devolve uma proposta
// estruturada somente para esse campo.
//
// Endpoint: POST /ai-ghl-mapping
// Headers:  Authorization: Bearer <jwt>
// Body:     { workspace_id, user_description, discovery_result, target: { kind: 'field', source, key } }
//
// A validação do JWT é feita internamente para permitir acesso somente a
// owner/admin do workspace. A chave da API GHL e a API key do OpenRouter nunca
// são retornadas.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { corsHeaders } from '../_shared/cors.ts'
import { resolveWorkspaceCredential, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'
import { getAiFailureCode, getOpenRouterUsage, recordAiTelemetry } from '../_shared/ai-telemetry.ts'
import {
  callModelWithRetry,
  restrictProposalToFieldTarget,
  type MappingProposal,
} from '../_shared/ai-ghl-mapping-logic.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || ''

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_MODEL = 'qwen/qwen3.6-plus'

const MAX_DESCRIPTION_LENGTH = 2000

interface DiscoveryField {
  id: string
  name: string
  key: string
  field_type: string
  source: 'contact' | 'opportunity'
}

interface DiscoveryStage {
  id: string
  name: string
}

interface DiscoveryPipeline {
  id: string
  name: string
  stages: DiscoveryStage[]
}

interface DiscoveryResult {
  contact_custom_fields: Array<{ id: string; name: string; key: string; field_type: string }>
  opportunity_custom_fields: Array<{ id: string; name: string; key: string; field_type: string }>
  pipelines: DiscoveryPipeline[]
  errors: string[]
  status: 'success' | 'partial' | 'error'
  workspace_id: string
  location_id: string
}

interface TemplateRow {
  logical_name: string
  ghl_field_key: string | null
  field_type: string | null
  is_required: boolean
}

interface FieldTarget {
  kind: 'field'
  source: 'contact' | 'opportunity'
  key: string
}

function sanitizeDescription(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '')
    .slice(0, MAX_DESCRIPTION_LENGTH)
    .trim()
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function buildFieldKey(source: 'contact' | 'opportunity', key: string): string {
  if (source === 'opportunity') return `{{opportunity.${key}}}`
  return key
}

function normalizeDiscoveryResult(raw: unknown): DiscoveryResult {
  const input = (raw ?? {}) as Partial<DiscoveryResult>
  const contact = Array.isArray(input.contact_custom_fields) ? input.contact_custom_fields : []
  const opportunity = Array.isArray(input.opportunity_custom_fields) ? input.opportunity_custom_fields : []
  const pipelines = Array.isArray(input.pipelines) ? input.pipelines : []

  return {
    contact_custom_fields: contact
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        key: String(item.key ?? ''),
        field_type: String(item.field_type ?? 'UNKNOWN'),
      }))
      .filter((item) => item.id && item.name),
    opportunity_custom_fields: opportunity
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        key: String(item.key ?? ''),
        field_type: String(item.field_type ?? 'UNKNOWN'),
      }))
      .filter((item) => item.id && item.name),
    pipelines: pipelines
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        stages: Array.isArray(item.stages)
          ? item.stages
              .filter((s) => s && typeof s === 'object')
              .map((s) => ({ id: String(s.id ?? ''), name: String(s.name ?? '') }))
              .filter((s) => s.id && s.name)
          : [],
      }))
      .filter((item) => item.id && item.name),
    errors: [],
    status: 'success',
    workspace_id: '',
    location_id: '',
  }
}

function normalizeFieldTarget(raw: unknown, discovery: DiscoveryResult): FieldTarget | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Partial<FieldTarget>
  const source = input.source
  if (input.kind !== 'field' || (source !== 'contact' && source !== 'opportunity')) return null
  const key = typeof input.key === 'string' ? input.key.trim() : ''
  if (!key) return null

  const candidates = source === 'contact'
    ? discovery.contact_custom_fields
    : discovery.opportunity_custom_fields
  const exists = candidates.some((field) => buildFieldKey(source, field.key) === key)
  return exists ? { kind: 'field', source, key } : null
}

function getTargetField(target: FieldTarget, discovery: DiscoveryResult): DiscoveryField | null {
  const candidates = target.source === 'contact'
    ? discovery.contact_custom_fields
    : discovery.opportunity_custom_fields
  const field = candidates.find((item) => buildFieldKey(target.source, item.key) === target.key)
  return field ? { ...field, source: target.source } : null
}

async function loadTemplates(supabaseAdmin: any): Promise<TemplateRow[]> {
  const res = await supabaseAdmin
    .from('ghl_field_mapping_templates')
    .select('logical_name, ghl_field_key, field_type, is_required')
  if (res.error) {
    console.error('[ai-ghl-mapping] Erro ao carregar templates:', res.error)
    return []
  }
  return (res.data ?? []) as TemplateRow[]
}

function buildSystemContext(
  templates: TemplateRow[],
  existingLogicalNames: string[],
  targetKey: string,
): string {
  const available = templates
    .filter((template) => !existingLogicalNames.includes(template.logical_name))
    .map((template) => template.logical_name)

  return `Você é um assistente especialista em mapear contas GoHighLevel (GHL) para a OMNX.
Sua tarefa é classificar SOMENTE o campo que o usuário selecionou.

### Conceitos da OMNX que você pode usar

CAMPOS LÓGICOS (escolha APENAS dessa lista):
- Disponíveis: ${available.join(', ') || 'nenhum'}

### Regras
1. A chave do único campo permitido é "${targetKey}". Não use outra chave.
2. Os arrays "pipelines" e "stages" devem ser sempre vazios.
3. Se não houver certeza, retorne o array "fields" vazio e explique o que faltou.
4. Não invente chaves, IDs ou categorias. Use somente a lista de campos lógicos disponíveis.

Responda APENAS em JSON válido com esta estrutura exata:
{
  "fields": [{ "ghl_field_key": "string", "logical_name": "string", "confidence": 0.0 }],
  "pipelines": [{ "ghl_pipeline_id": "string", "system_category": "string", "confidence": 0.0 }],
  "stages": [{ "ghl_stage_id": "string", "system_stage": "string", "confidence": 0.0 }],
  "explanation": "string",
  "warnings": ["string"]
}`
}

function buildUserPrompt(description: string, targetField: DiscoveryField): string {
  return `DESCRIÇÃO DO USUÁRIO:
"""
${description}
"""

ÚNICO CAMPO A CLASSIFICAR:
- Nome: ${targetField.name}
- Origem: ${targetField.source === 'contact' ? 'Contato' : 'Oportunidade'}
- Chave: ${buildFieldKey(targetField.source, targetField.key)}
- Tipo: ${targetField.field_type}

Com base nisso, gere a proposta em JSON somente para este campo.`
}

async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  apiKey: string,
  supabase: any,
  workspaceId: string,
): Promise<string> {
  const startedAt = Date.now()
  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://omnx.pro',
        'X-Title': 'OMNX GHL Mapping AI',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
      }),
    })

    if (!response.ok) {
      await recordAiTelemetry(supabase, {
        workspaceId, feature: 'ai-ghl-mapping', model, status: 'failure',
        durationMs: Date.now() - startedAt, responseStatus: response.status,
        errorCode: getAiFailureCode(response.status),
      })
      const text = await response.text().catch(() => '')
      throw new Error(`OpenRouter error ${response.status}: ${text.slice(0, 500)}`)
    }

    const json = (await response.json()) as {
      choices?: { message?: { content?: string } }[]
      usage?: unknown
    }
    await recordAiTelemetry(supabase, {
      workspaceId, feature: 'ai-ghl-mapping', model, status: 'success',
      durationMs: Date.now() - startedAt, responseStatus: response.status,
      usage: getOpenRouterUsage(json.usage),
    })
    return json.choices?.[0]?.message?.content ?? ''
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('OpenRouter error ')) throw error
    await recordAiTelemetry(supabase, {
      workspaceId, feature: 'ai-ghl-mapping', model, status: 'failure',
      durationMs: Date.now() - startedAt, errorCode: getAiFailureCode(undefined, error),
    })
    throw error
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Validar JWT do chamador
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '').trim()
    if (!token) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (!caller || authError) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    // 2. Ler body
    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Body inválido: JSON esperado' }, 400)
    }

    const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : ''
    if (!workspaceId) {
      return jsonResponse({ error: 'workspace_id é obrigatório no body' }, 400)
    }

    const description = sanitizeDescription(body.user_description)
    if (!description) {
      return jsonResponse({ error: 'user_description é obrigatória' }, 400)
    }

    const discovery = normalizeDiscoveryResult(body.discovery_result)
    const target = normalizeFieldTarget(body.target, discovery)
    if (!target) {
      return jsonResponse(
        { error: 'target deve apontar para um campo detectado nesta conta do GHL' },
        400,
      )
    }
    const targetField = getTargetField(target, discovery)
    if (!targetField) {
      return jsonResponse({ error: 'Campo selecionado não foi encontrado na discovery' }, 400)
    }

    // 3. Verificar permissão
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', caller.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      throw new Error(`Erro ao verificar membership: ${membershipError.message}`)
    }

    if (!membership) {
      return jsonResponse({ error: 'Workspace não encontrado ou acesso negado' }, 403)
    }

    if (membership.role !== 'owner' && membership.role !== 'admin') {
      return jsonResponse({ error: 'Apenas owner ou admin pode usar o assistente de mapeamento' }, 403)
    }

    let openrouterKey: string
    try { openrouterKey = (await resolveWorkspaceCredential(supabaseAdmin, workspaceId, 'openrouter')).apiKey }
    catch (error) {
      if (error instanceof CredentialResolutionError) {
        await recordAiTelemetry(supabaseAdmin, {
          workspaceId, feature: 'ai-ghl-mapping', status: 'failure', errorCode: 'credential_unavailable',
        })
        return jsonResponse({ error: 'Cadastre a chave OpenRouter desta conta em Integrações antes de usar IA.' }, 422)
      }
      throw error
    }

    const { data: claraSettings } = await supabaseAdmin
      .from('clara_workspace_settings')
      .select('model_id')
      .eq('workspace_id', workspaceId)
      .maybeSingle()
    const modelId = claraSettings?.model_id || DEFAULT_MODEL

    // 4. Carregar templates
    const templates = await loadTemplates(supabaseAdmin)

    // 5. Carregar mapeamentos existentes para evitar duplicatas/surpresas
    const { data: existingFields } = await supabaseAdmin
      .from('ghl_field_mappings')
      .select('logical_name')
      .eq('workspace_id', workspaceId)

    const existingLogicalNames = (existingFields ?? [])
      .map((f) => f.logical_name)
      .filter(Boolean)

    // 6. Montar prompt e chamar IA
    const systemPrompt = buildSystemContext(templates, existingLogicalNames, target.key)
    const userPrompt = buildUserPrompt(description, targetField)

    let modelUsed = modelId
    let proposal: MappingProposal
    try {
      ;({ proposal } = await callModelWithRetry(
        (prompt) => callOpenRouter(systemPrompt, prompt, modelId, openrouterKey, supabaseAdmin, workspaceId),
        userPrompt,
      ))
    } catch (err) {
      console.warn('[ai-ghl-mapping] Falha no modelo (após retry), tentando novamente:', err)
      ;({ proposal } = await callModelWithRetry(
        (prompt) => callOpenRouter(systemPrompt, prompt, modelId, openrouterKey, supabaseAdmin, workspaceId),
        userPrompt,
      ))
    }

    const allowedLogicalNames = new Set(
      templates
        .map((template) => template.logical_name)
        .filter((logicalName) => !existingLogicalNames.includes(logicalName)),
    )
    proposal = restrictProposalToFieldTarget(proposal, target.key, allowedLogicalNames)

    return jsonResponse({
      proposal,
      model_used: modelUsed,
      discovery_summary: {
        fields_count: discovery.contact_custom_fields.length + discovery.opportunity_custom_fields.length,
        pipelines_count: discovery.pipelines.length,
        stages_count: discovery.pipelines.reduce((acc, p) => acc + p.stages.length, 0),
      },
    })
  } catch (err) {
    console.error('[ai-ghl-mapping] Erro fatal:', err)
    return jsonResponse({ error: 'Não foi possível classificar o campo agora. Tente novamente.' }, 500)
  }
})
