// Edge Function: sync-recuperacao-stages
//
// Busca o pipelineStageId atual de cada oportunidade no pipeline Recuperação
// via API GHL e salva no banco (campo pipeline_stage_id).
//
// Por que é necessário:
//   Os webhooks do pipeline Recuperação não enviam o campo pipeline_stage_id,
//   então ele está NULL para todos os 382 leads. Precisamos desse valor para
//   criar a duplicata no estágio correto durante a correção.
//
// Uso:
//   POST /functions/v1/sync-recuperacao-stages
//   Body (opcional): { "batch_size": 100 }
//
// Rode quantas vezes precisar — é idempotente (só atualiza quem ainda está NULL).
//
// Fase 2 (credenciais por workspace): a chave GHL NAO e mais global. A fila de
// oportunidades de Recuperacao e multi-tenant (cada opp pertence ao workspace do
// seu contato — `oportunidades` nao tem workspace_id proprio). A chave e resolvida
// POR ITEM, sem cair em GHL_API_KEY/GHL_LOCATION_ID globais:
//   oportunidades.contato_id -> contatos.location_id (GHL)
//     -> RPC get_workspace_id_by_ghl_location_id (fatia 3, NULL sem match)
//     -> resolveGhlCredentials (Vault + cache, fatia 2)
// Qualquer falha nessa cadeia => FailClosedError (terminal para o item, sem retry).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts'

const GHL_API_BASE   = 'https://services.leadconnectorhq.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const PIPELINE_RECUP = 'Sn1Guqcm6zwZNTVOOf5L'
const BASE_DELAY_MS  = 130

// Fase 2: chave NAO e mais global — montada por chamada com a chave do workspace
// dono do item (resolvida por location_id -> RPC -> helper).
function buildGhlHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version': '2021-04-15',
    'Content-Type': 'application/json',
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

// ─── Rate limit ───────────────────────────────────────────────────────────────

const rl = { remaining: 100, resetMs: 0 }

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function ghlGet(path: string, apiKey: string, label = ''): Promise<Record<string, unknown>> {
  const MAX_RETRIES = 4

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (rl.remaining < 5) {
      await delay(Math.max(rl.resetMs, 1000) + 200)
    } else if (rl.remaining < 20) {
      await delay(500)
    } else {
      await delay(BASE_DELAY_MS)
    }

    const res = await fetch(`${GHL_API_BASE}${path}`, { headers: buildGhlHeaders(apiKey) })

    const remaining = res.headers.get('x-ratelimit-remaining')
    const interval  = res.headers.get('x-ratelimit-interval-milliseconds')
    if (remaining !== null) rl.remaining = Number(remaining)
    if (interval  !== null) rl.resetMs   = Number(interval)

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After')
      const wait = retryAfter ? Number(retryAfter) * 1000 : 1000 * Math.pow(2, attempt)
      console.warn(`[sync-recuperacao-stages] 429 "${label}" — aguardando ${wait + 500}ms`)
      if (attempt >= MAX_RETRIES) throw new Error(`GHL 429 após ${MAX_RETRIES} tentativas: ${label}`)
      await delay(wait + 500)
      continue
    }

    if (res.status === 404) return {}

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GHL ${res.status} "${label}": ${text}`)
    }

    return res.json()
  }

  throw new Error(`ghlGet: loop inesperado (${label})`)
}

// ─── Fase 2: resolucao de credencial por item (multi-tenant) ──────────────────

// Erro fail-closed (sem tenant ou sem credencial). E TERMINAL para o item: nao
// adianta retry — a opp nao tem como ser processada sem dono/chave. O catch do
// loop marca o item como erro e segue para o proximo (sem derrubar o lote);
// NUNCA cai em chave/location global.
class FailClosedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FailClosedError'
  }
}

// Resolve a chave GHL do workspace dono de um location_id (por item):
//   1. location_id -> workspace via RPC segura da fatia 3 (NULL = sem match,
//      sem fallback "mais antigo").
//   2. credencial do workspace via helper da fatia 2 (Vault + cache).
// Cache local por location_id evita RPC/decrypt repetidos dentro do mesmo lote
// (varias opps costumam compartilhar o mesmo location). Qualquer falha =>
// FailClosedError (NUNCA cai em chave global).
async function resolveGhlApiKeyForLocation(
  supabase: SupabaseClient,
  locationId: string,
  label: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(locationId)
  if (cached) return cached

  const { data: workspaceId, error: rpcErr } = await supabase.rpc(
    'get_workspace_id_by_ghl_location_id',
    { p_location_id: locationId },
  )
  if (rpcErr || !workspaceId) {
    throw new FailClosedError(
      `location_id '${locationId}' nao resolve workspace (opp ${label})${rpcErr ? ': ' + rpcErr.message : ''}`,
    )
  }
  try {
    const creds = await resolveGhlCredentials(supabase, workspaceId as string)
    cache.set(locationId, creds.apiKey)
    return creds.apiKey
  } catch (err) {
    const msg = err instanceof CredentialResolutionError
      ? err.message
      : (err instanceof Error ? err.message : String(err))
    throw new FailClosedError(
      `credencial ghl nao resolvida para workspace ${workspaceId} (opp ${label}): ${msg}`,
    )
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const guardResponse = requireServiceRoleCaller(req, corsHeaders)
  if (guardResponse) return guardResponse

  try {
    // GHL_API_KEY nao e mais exigida (resolvida por item). So o client Supabase e obrigatorio.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing required env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const batchSize = Math.min(Number(body.batch_size ?? 100), 500)

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Buscar opps de Recuperação com pipeline_stage_id ainda NULL
    const { data: pending, error: fetchErr } = await supabase
      .from('oportunidades')
      .select('id, ghl_opportunity_id, contato_id')
      .eq('pipeline_id', PIPELINE_RECUP)
      .is('pipeline_stage_id', null)
      .not('ghl_opportunity_id', 'is', null)
      .order('id')
      .limit(batchSize)

    if (fetchErr) throw new Error(`Supabase fetch: ${fetchErr.message}`)

    if (!pending || pending.length === 0) {
      const { count } = await supabase
        .from('oportunidades')
        .select('*', { count: 'exact', head: true })
        .eq('pipeline_id', PIPELINE_RECUP)
        .is('pipeline_stage_id', null)

      return new Response(JSON.stringify({
        message: 'Todos os stages já estão preenchidos ✅',
        pendentes: count ?? 0,
        processed: 0,
        updated: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Resolver o location_id GHL de cada opp via contato (1 query em lote).
    // O tenant da opp = workspace do contato; o location_id GHL do contato
    // resolve o workspace via RPC (fatia 3) e a chave via helper (fatia 2).
    const contatoIds = Array.from(new Set(
      pending
        .map((o) => (typeof o.contato_id === 'string' ? o.contato_id : ''))
        .filter((id) => id.length > 0),
    ))
    const locationByContato = new Map<string, string>()
    if (contatoIds.length > 0) {
      const { data: contatosRows, error: contatosErr } = await supabase
        .from('contatos')
        .select('id, location_id')
        .in('id', contatoIds)
      if (contatosErr) throw new Error(`Supabase contatos fetch: ${contatosErr.message}`)
      for (const row of contatosRows ?? []) {
        const r = row as { id?: unknown; location_id?: unknown }
        if (typeof r.id === 'string' && typeof r.location_id === 'string' && r.location_id.length > 0) {
          locationByContato.set(r.id, r.location_id)
        }
      }
    }

    console.log(`[sync-recuperacao-stages] Processando ${pending.length} opps...`)

    let updated = 0
    let sem_stage = 0
    let fail_closed = 0
    const errors: string[] = []
    const keyCache = new Map<string, string>()

    for (const opp of pending) {
      const label = typeof opp.ghl_opportunity_id === 'string' ? opp.ghl_opportunity_id : String(opp.id)
      const contatoId = typeof opp.contato_id === 'string' ? opp.contato_id : ''

      try {
        const locationId = contatoId ? (locationByContato.get(contatoId) ?? null) : null
        if (!locationId) {
          throw new FailClosedError(
            `opp ${label} sem location_id (contato ${contatoId || '?'} sem location GHL)`,
          )
        }

        const apiKey = await resolveGhlApiKeyForLocation(supabase, locationId, label, keyCache)
        const data = await ghlGet(`/opportunities/${label}`, apiKey, label)
        const o = data?.opportunity as Record<string, string> | undefined

        const stageId   = o?.pipelineStageId   ?? null
        const stageName = o?.pipelineStageName ?? null

        if (!stageId) {
          console.log(`[sync-recuperacao-stages] sem stage: ${label}`)
          sem_stage++
          continue
        }

        const { error: updateErr } = await supabase
          .from('oportunidades')
          .update({ pipeline_stage_id: stageId })
          .eq('id', opp.id)

        if (updateErr) {
          errors.push(`${opp.id}: ${updateErr.message}`)
          console.error(`[sync-recuperacao-stages] update error ${opp.id}:`, updateErr.message)
        } else {
          updated++
          console.log(`[sync-recuperacao-stages] ✓ ${label} → stage: ${stageName} (${stageId})`)
        }
      } catch (err) {
        // Fail-closed (sem tenant/credencial) e TERMINAL: conta como erro do
        // item e segue (sem retry, sem derrubar o lote). Demais erros (GHL/rede)
        // preservam o comportamento original: propagam ate o catch do handler.
        if (err instanceof FailClosedError) {
          fail_closed++
          errors.push(`${label}: ${err.message}`)
          console.error(`[sync-recuperacao-stages] fail-closed ${label}: ${err.message}`)
          continue
        }
        throw err
      }
    }

    // Contar quantas ainda faltam
    const { count: remaining } = await supabase
      .from('oportunidades')
      .select('*', { count: 'exact', head: true })
      .eq('pipeline_id', PIPELINE_RECUP)
      .is('pipeline_stage_id', null)

    console.log(`[sync-recuperacao-stages] processed=${pending.length} updated=${updated} sem_stage=${sem_stage} fail_closed=${fail_closed} remaining=${remaining ?? 0}`)

    return new Response(JSON.stringify({
      processed: pending.length,
      updated,
      sem_stage,
      fail_closed,
      remaining: remaining ?? 0,
      errors: errors.length ? errors : undefined,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('[sync-recuperacao-stages] Erro fatal:', err)
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
