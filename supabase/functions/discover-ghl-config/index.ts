// Edge Function: discover-ghl-config
// Descobre campos customizados e pipelines de uma conta GoHighLevel (GHL)
// para configurar o mapeamento multi-conta do Empire.
//
// Endpoint: POST /discover-ghl-config
// Headers:  Authorization: Bearer <jwt>
// Body:     { workspace_id: string, include_payload?: boolean }
//
// A validação do JWT é feita internamente para permitir acesso somente a
// owner/admin do workspace. A chave da API GHL nunca é retornada.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { corsHeaders } from '../_shared/cors.ts'
import {
  resolveGhlCredentials,
  CredentialResolutionError,
} from '../_shared/resolve-workspace-credentials.ts'
import { isServiceRoleCaller } from '../_shared/require-service-role.ts'
import { createRequestId, logSafeError, publicError } from '../_shared/safe-error.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || ''

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-04-15'

// Fase 2 (credenciais por workspace): a chave NAO e mais global. E resolvida por
// workspace via helper (Vault + cache) e montada por chamada em buildGhlHeaders.
// NUNCA le GHL_API_KEY/GHL_LOCATION_ID de ambiente nem cai em fallback global.
function buildGhlHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Version: GHL_API_VERSION,
    'Content-Type': 'application/json',
  }
}

// Rate limiting local conservador: 200ms entre requests (~5 req/s),
// abaixo do limite de 10 req/s da API GHL.
const BASE_DELAY_MS = 200

// Timeout para cada chamada à API GHL.
const REQUEST_TIMEOUT_MS = 15000

interface DiscoveryRun {
  id?: string
  workspace_id: string
  source: string
  payload: Record<string, unknown>
  status: string
  created_at?: string
}

interface NormalizedCustomField {
  id: string
  name: string
  key: string
  field_type: string
  placeholder: string | null
}

interface NormalizedStage {
  id: string
  name: string
}

interface NormalizedPipeline {
  id: string
  name: string
  stages: NormalizedStage[]
}

interface NormalizedTag {
  id: string
  name: string
}

interface NormalizedCalendar {
  id: string
  name: string
  type: string | null
}

interface NormalizedUser {
  id: string
  name: string
  email: string | null
  role: string | null
}

interface NormalizedFieldFolder {
  id: string
  name: string
  model: string | null
}

interface DiscoveryResult {
  contact_custom_fields: NormalizedCustomField[]
  opportunity_custom_fields: NormalizedCustomField[]
  pipelines: NormalizedPipeline[]
  tags: NormalizedTag[]
  calendars: NormalizedCalendar[]
  users: NormalizedUser[]
  field_folders: NormalizedFieldFolder[]
  errors: string[]
  status: 'success' | 'partial' | 'error'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ghlFetch(
  url: string,
  apiKey: string,
  attempt = 1,
): Promise<{ ok: true; data: unknown } | { ok: false; error: string; status?: number }> {
  await delay(BASE_DELAY_MS * attempt)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: buildGhlHeaders(apiKey),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After')
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : 1000 * Math.pow(2, attempt)
      if (attempt < 3) {
        await delay(waitMs)
        return ghlFetch(url, apiKey, attempt + 1)
      }
      return { ok: false, error: 'Serviço temporariamente indisponível.' }
    }

    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        error: 'Não foi possível validar a conexão com o CRM.',
      }
    }

    if (res.status === 404) {
      return { ok: false, error: 'Não foi possível concluir a descoberta no CRM.', status: 404 }
    }

    if (!res.ok) {
      await res.text().catch(() => '')
      return { ok: false, error: 'Não foi possível concluir a descoberta no CRM.', status: res.status }
    }

    const data = await res.json().catch(() => ({}))
    return { ok: true, data }
  } catch (err) {
    clearTimeout(timeoutId)
    return { ok: false, error: 'Serviço temporariamente indisponível.' }
  }
}

function normalizeCustomFields(raw: unknown): NormalizedCustomField[] {
  if (!raw || typeof raw !== 'object') return []
  const source = (raw as Record<string, unknown>).customFields
  const list = Array.isArray(source) ? source : []

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      key: String(item.fieldKey ?? item.key ?? ''),
      field_type: String(item.dataType ?? item.fieldType ?? 'UNKNOWN'),
      placeholder: item.placeholder != null ? String(item.placeholder) : null,
    }))
    .filter((item) => item.id && item.name)
}

function normalizeStages(raw: unknown): NormalizedStage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
    }))
    .filter((item) => item.id && item.name)
}

function normalizePipelines(raw: unknown): NormalizedPipeline[] {
  if (!raw || typeof raw !== 'object') return []
  const source = (raw as Record<string, unknown>).pipelines
  const list = Array.isArray(source) ? source : []

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      stages: normalizeStages(item.stages),
    }))
    .filter((item) => item.id && item.name)
}

function normalizeTags(raw: unknown): NormalizedTag[] {
  if (!raw || typeof raw !== 'object') return []
  const source = (raw as Record<string, unknown>).tags
  const list = Array.isArray(source) ? source : []

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
    }))
    .filter((item) => item.id && item.name)
}

function normalizeCalendars(raw: unknown): NormalizedCalendar[] {
  if (!raw || typeof raw !== 'object') return []
  const source = (raw as Record<string, unknown>).calendars
  const list = Array.isArray(source) ? source : []

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      type: item.type != null ? String(item.type) : null,
    }))
    .filter((item) => item.id && item.name)
}

function normalizeUsers(raw: unknown): NormalizedUser[] {
  if (!raw || typeof raw !== 'object') return []
  const source = (raw as Record<string, unknown>).users
  const list = Array.isArray(source) ? source : []

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => {
      const firstName = item.firstName != null ? String(item.firstName) : ''
      const lastName = item.lastName != null ? String(item.lastName) : ''
      const name = [firstName, lastName].filter(Boolean).join(' ') || String(item.name ?? item.email ?? '')
      return {
        id: String(item.id ?? ''),
        name,
        email: item.email != null ? String(item.email) : null,
        role: item.role != null ? String(item.role) : null,
      }
    })
    .filter((item) => item.id && item.name)
}

function normalizeFieldFolders(raw: unknown): NormalizedFieldFolder[] {
  if (!raw || typeof raw !== 'object') return []
  const source = (raw as Record<string, unknown>).folders
  const list = Array.isArray(source) ? source : []

  return list
    .filter((item): item is Record<string, unknown> => item && typeof item === 'object')
    .map((item) => ({
      id: String(item.id ?? ''),
      name: String(item.name ?? ''),
      model: item.model != null ? String(item.model) : null,
    }))
    .filter((item) => item.id && item.name)
}

// Fase 2: erro fail-closed (sem tenant ou sem credencial). E TERMINAL para a
// chamada — sem workspace_id no payload ou sem credencial GHL resolvida para o
// workspace, NAO ha como descobrir a configuracao. Propaga ate o catch do handler
// (HTTP 500) com mensagem auditavel; NUNCA cai em chave/location global.
class FailClosedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FailClosedError'
  }
}

interface TenantContext {
  workspaceId: string
  apiKey: string
  locationId: string
}

// Resolve o contexto do tenant (1 workspace por chamada): o workspace_id vem do
// payload (validado no handler) e a credencial GHL e resolvida via helper
// (Vault + cache) -> apiKey + locationId. Qualquer falha => FailClosedError
// (NUNCA chave/location global, SEM fallback a "workspace mais antigo").
async function resolveTenantContext(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<TenantContext> {
  let apiKey: string
  let locationId: string
  try {
    const creds = await resolveGhlCredentials(supabase, workspaceId)
    apiKey = creds.apiKey
    locationId = creds.locationId ?? ''
  } catch (err) {
    const msg =
      err instanceof CredentialResolutionError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err)
    throw new FailClosedError(
      `credencial ghl nao resolvida para workspace ${workspaceId}: ${msg}`,
    )
  }

  if (!locationId) {
    throw new FailClosedError(
      `workspace ${workspaceId} sem location_id nos metadados da credencial ghl`,
    )
  }

  return { workspaceId, apiKey, locationId }
}

async function insertDiscoveryRun(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  run: DiscoveryRun,
): Promise<void> {
  const { error } = await supabaseAdmin.from('ghl_discovery_runs').insert({
    workspace_id: run.workspace_id,
    source: run.source,
    payload: run.payload,
    status: run.status,
  })

  if (error) {
    console.error(`[discover-ghl-config] Erro ao registrar discovery (${run.source}):`, error)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Validar chamador: service_role (cron interno, ex: vigilância automática de
    //    mudanças — ver ghl_mapping_discovery_watch_job) OU JWT de usuário owner/admin
    //    do workspace (fluxo manual da UI). Nunca aceita anon.
    const isCron = isServiceRoleCaller(req)

    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '').trim()
    if (!isCron && !token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    let caller: { id: string } | null = null
    if (!isCron) {
      const { data, error: authError } = await supabaseAdmin.auth.getUser(token)
      if (!data.user || authError) {
        return new Response(
          JSON.stringify({ error: `Unauthorized: ${authError?.message ?? 'token inválido'}` }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      caller = data.user
    }

    // 2. Ler body e validar workspace_id
    let body: Record<string, unknown> = {}
    try {
      body = await req.json()
    } catch {
      return new Response(JSON.stringify({ error: 'Body inválido: JSON esperado' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const workspaceId = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : ''
    if (!workspaceId) {
      // Fase 2: sem workspace_id NAO ha tenant para resolver credencial — fail-closed
      // terminal (propaga ao catch do handler => HTTP 500). Sem fallback.
      throw new FailClosedError(
        'workspace_id ausente no payload — discover-ghl-config exige workspace_id (fail-closed, sem fallback)',
      )
    }

    const includePayload = body.include_payload === true

    // 3. Verificar se o usuário é owner/admin do workspace (pulado para o cron —
    //    service_role já é confiado por definição, sem "usuário" para checar membership).
    if (!isCron && caller) {
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
        return new Response(
          JSON.stringify({ error: 'Workspace não encontrado ou acesso negado' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }

      if (membership.role !== 'owner' && membership.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'Apenas owner ou admin pode executar discovery' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
    }

    // 4. Resolver credencial GHL do workspace (chave + location_id) via helper
    // (Vault + cache). Fail-closed: sem credencial ou sem location_id nos metadados
    // => FailClosedError (terminal). NUNCA usa GHL_API_KEY/GHL_LOCATION_ID globais
    // e NAO le ghl_integration_settings (location_id vem dos metadados da credencial).
    // Cast localizado: o client do handler (SupabaseClient<any,"public",any>) difere
    // do SupabaseClient esperado pelo helper; o cast via `unknown` evita TS2345 novo
    // sem alterar o client nem o helper (preserva o baseline de tipagem = 0 erros).
    const { apiKey, locationId } = await resolveTenantContext(
      supabaseAdmin as unknown as SupabaseClient,
      workspaceId,
    )

    // 5. Descobrir campos, pipelines, tags, calendários, usuários e pastas
    //
    // succeededSources conta CHAMADAS que funcionaram (independente de terem
    // retornado 0 itens — uma conta GHL nova/vazia é sucesso válido, não erro).
    // Achado real do burn-in (2026-07-14): a versão anterior media "sucesso"
    // por result.<campo>.length > 0, então uma conta de teste vazia (0 itens
    // em todo mundo) virava 'error' mesmo com todas as chamadas OK.
    let succeededSources = 0
    const result: DiscoveryResult = {
      contact_custom_fields: [],
      opportunity_custom_fields: [],
      pipelines: [],
      tags: [],
      calendars: [],
      users: [],
      field_folders: [],
      errors: [],
      status: 'success',
    }

    // 5.1 Contact custom fields
    const contactUrl = `${GHL_API_BASE}/locations/${encodeURIComponent(
      locationId,
    )}/customFields?model=contact`
    const contactRes = await ghlFetch(contactUrl, apiKey)
    if (contactRes.ok) {
      succeededSources++
      result.contact_custom_fields = normalizeCustomFields(contactRes.data)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'contact_custom_fields',
        payload: includePayload
          ? { count: result.contact_custom_fields.length, raw: contactRes.data }
          : { count: result.contact_custom_fields.length, url: contactUrl },
        status: 'success',
      })
    } else {
      result.errors.push(`contact_custom_fields: ${contactRes.error}`)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'contact_custom_fields',
        payload: { error: contactRes.error, url: contactUrl },
        status: 'error',
      })
    }

    // 5.2 Opportunity custom fields
    const opportunityUrl = `${GHL_API_BASE}/locations/${encodeURIComponent(
      locationId,
    )}/customFields?model=opportunity`
    const opportunityRes = await ghlFetch(opportunityUrl, apiKey)
    if (opportunityRes.ok) {
      succeededSources++
      result.opportunity_custom_fields = normalizeCustomFields(opportunityRes.data)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'opportunity_custom_fields',
        payload: includePayload
          ? { count: result.opportunity_custom_fields.length, raw: opportunityRes.data }
          : { count: result.opportunity_custom_fields.length, url: opportunityUrl },
        status: 'success',
      })
    } else {
      result.errors.push(`opportunity_custom_fields: ${opportunityRes.error}`)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'opportunity_custom_fields',
        payload: { error: opportunityRes.error, url: opportunityUrl },
        status: 'error',
      })
    }

    // 5.3 Pipelines (tenta /pipelines primeiro, depois fallback)
    const pipelinesPrimaryUrl = `${GHL_API_BASE}/pipelines`
    let pipelinesRes = await ghlFetch(pipelinesPrimaryUrl, apiKey)

    if (!pipelinesRes.ok) {
      const pipelinesFallbackUrl = `${GHL_API_BASE}/opportunities/pipelines?locationId=${encodeURIComponent(
        locationId,
      )}`
      pipelinesRes = await ghlFetch(pipelinesFallbackUrl, apiKey)
    }

    if (pipelinesRes.ok) {
      succeededSources++
      result.pipelines = normalizePipelines(pipelinesRes.data)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'pipelines',
        payload: includePayload
          ? { count: result.pipelines.length, raw: pipelinesRes.data }
          : { count: result.pipelines.length },
        status: 'success',
      })
    } else {
      result.errors.push(`pipelines: ${pipelinesRes.error}`)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'pipelines',
        payload: { error: pipelinesRes.error },
        status: 'error',
      })
    }

    // 5.4 Tags
    const tagsUrl = `${GHL_API_BASE}/locations/${encodeURIComponent(locationId)}/tags`
    const tagsRes = await ghlFetch(tagsUrl, apiKey)
    if (tagsRes.ok) {
      succeededSources++
      result.tags = normalizeTags(tagsRes.data)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'tags',
        payload: includePayload
          ? { count: result.tags.length, raw: tagsRes.data }
          : { count: result.tags.length, url: tagsUrl },
        status: 'success',
      })
    } else {
      result.errors.push(`tags: ${tagsRes.error}`)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'tags',
        payload: { error: tagsRes.error, url: tagsUrl },
        status: 'error',
      })
    }

    // 5.5 Calendars — GHL retorna 404 (nao 200 + []) quando a sub-conta nao
    // tem NENHUM calendario configurado (achado real do burn-in de
    // 2026-07-14: sub-conta de teste nova, sem calendarios). Tratar como
    // "vazio", nao erro — mesmo principio ja aplicado ao restante do discovery.
    const calendarsUrl = `${GHL_API_BASE}/locations/${encodeURIComponent(locationId)}/calendars`
    const calendarsRes = await ghlFetch(calendarsUrl, apiKey)
    if (calendarsRes.ok || calendarsRes.status === 404) {
      succeededSources++
      result.calendars = calendarsRes.ok ? normalizeCalendars(calendarsRes.data) : []
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'calendars',
        payload: includePayload
          ? { count: result.calendars.length, raw: calendarsRes.ok ? calendarsRes.data : null }
          : { count: result.calendars.length, url: calendarsUrl },
        status: 'success',
      })
    } else {
      result.errors.push(`calendars: ${calendarsRes.error}`)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'calendars',
        payload: { error: calendarsRes.error, url: calendarsUrl },
        status: 'error',
      })
    }

    // 5.6 Users (tenta /locations/{id}/users primeiro, depois fallback /users/?locationId={id})
    const usersPrimaryUrl = `${GHL_API_BASE}/locations/${encodeURIComponent(locationId)}/users`
    let usersRes = await ghlFetch(usersPrimaryUrl, apiKey)

    if (!usersRes.ok) {
      const usersFallbackUrl = `${GHL_API_BASE}/users/?locationId=${encodeURIComponent(locationId)}`
      usersRes = await ghlFetch(usersFallbackUrl, apiKey)
    }

    if (usersRes.ok) {
      succeededSources++
      result.users = normalizeUsers(usersRes.data)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'users',
        payload: includePayload
          ? { count: result.users.length, raw: usersRes.data }
          : { count: result.users.length },
        status: 'success',
      })
    } else {
      result.errors.push(`users: ${usersRes.error}`)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'users',
        payload: { error: usersRes.error },
        status: 'error',
      })
    }

    // 5.7 Custom field folders — mesmo caso de calendars: GHL retorna 404
    // (nao 200 + []) quando a sub-conta nao tem nenhuma pasta de campo
    // customizado criada. Tratar como "vazio", nao erro.
    const foldersUrl = `${GHL_API_BASE}/locations/${encodeURIComponent(locationId)}/customFields/folders`
    const foldersRes = await ghlFetch(foldersUrl, apiKey)
    if (foldersRes.ok || foldersRes.status === 404) {
      succeededSources++
      result.field_folders = foldersRes.ok ? normalizeFieldFolders(foldersRes.data) : []
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'field_folders',
        payload: includePayload
          ? { count: result.field_folders.length, raw: foldersRes.ok ? foldersRes.data : null }
          : { count: result.field_folders.length, url: foldersUrl },
        status: 'success',
      })
    } else {
      result.errors.push(`field_folders: ${foldersRes.error}`)
      await insertDiscoveryRun(supabaseAdmin, {
        workspace_id: workspaceId,
        source: 'field_folders',
        payload: { error: foldersRes.error, url: foldersUrl },
        status: 'error',
      })
    }

    // 6. Definir status geral — por CHAMADAS bem-sucedidas, nao por itens
    // retornados (conta GHL nova/vazia com 0 itens em tudo e sucesso valido,
    // nao erro). Achado real do burn-in de 2026-07-14: a versao anterior
    // media "sucesso" por result.<campo>.length > 0.
    if (succeededSources === 0) {
      result.status = 'error'
    } else if (result.errors.length > 0) {
      result.status = 'partial'
    }

    // httpStatus SEMPRE 200: o supabase-js (functions.invoke) descarta o corpo
    // da resposta em qualquer status nao-2xx, jogando fora exatamente as
    // mensagens de erro por endpoint que o usuario precisa pra se
    // autodiagnosticar. O resultado real (status/errors) vai no corpo — o
    // frontend (useGhlDiscovery) ja sabe interpretar success/partial/error.
    const httpStatus = 200
    const responseBody = {
      ...result,
      workspace_id: workspaceId,
      location_id: locationId,
    }

    return new Response(JSON.stringify(responseBody), {
      status: httpStatus,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const requestId = createRequestId()
    logSafeError('discover-ghl-config', requestId, err)
    return publicError('internal_error', requestId, 500, corsHeaders)
  }
})
