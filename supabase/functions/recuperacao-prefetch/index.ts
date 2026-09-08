// Edge Function: recuperacao-prefetch
//
// Etapa 0 do plano de correção do pipeline Recuperação.
// Ver: docs/plano-correcao-recuperacao/PLANO-EXECUCAO.md
//
// O que faz (somente leitura — não altera nada):
//   1. Identifica os leads que estão SÓ em Recuperação (foram movidos erroneamente)
//   2. Busca o pipelineStageId atual de cada opp via API GHL
//   3. Lista todos os pipelines e stages do GHL
//   4. Classifica cada lead no pipeline de destino correto
//   5. Retorna JSON completo para inspeção + uso no script de correção
//
// Uso:
//   POST /functions/v1/recuperacao-prefetch
//   Body JSON (obrigatório — fail-closed sem tenant):
//     { "workspace_id": "<uuid>" }              // preferencial
//     { "location_id": "<ghl_location_id>" }    // alternativo (resolve workspace via RPC)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts'

// ─── Configuração ─────────────────────────────────────────────────────────────

const GHL_API_BASE    = 'https://services.leadconnectorhq.com'
const SUPABASE_URL    = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const PIPELINE_RECUP  = 'Sn1Guqcm6zwZNTVOOf5L'
const BASE_DELAY_MS   = 150

// Fase 2 (credenciais por workspace): a chave NAO e mais global. E resolvida por
// workspace via helper (Vault + cache) e montada por chamada em buildGhlHeaders.
function buildGhlHeaders(apiKey: string): Record<string, string> {
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Version':       '2021-04-15',
    'Content-Type':  'application/json',
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

async function ghlGet(path: string, apiKey: string, label = ''): Promise<unknown> {
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
      console.warn(`[recuperacao-prefetch] 429 "${label}" — aguardando ${wait + 500}ms`)
      if (attempt >= MAX_RETRIES) throw new Error(`GHL 429 após ${MAX_RETRIES} tentativas: ${label}`)
      await delay(wait + 500)
      continue
    }

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GHL ${res.status} "${label}": ${text}`)
    }

    return res.json()
  }

  throw new Error(`ghlGet: loop inesperado (${label})`)
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface OppRow {
  id: string
  ghl_opportunity_id: string
  contato_id: string
  nome_contato: string | null
  titulo: string | null
  data_reuniao_agendada: string | null
  data_agendamento_reuniao: string | null
}

interface ContatoRow {
  id: string
  ghl_id: string | null
  tags: string | null
}

type Destino = 'pre_vendas_mql' | 'pre_vendas_nmql' | 'vendas_mql' | 'sem_classificacao'

interface LeadProcessado {
  supabase_id: string
  ghl_opportunity_id: string
  contato_id: string
  ghl_contact_id: string | null
  nome: string | null
  titulo: string | null
  current_stage_id: string | null
  current_stage_name: string | null
  current_status: string | null
  ghl_error: string | null
  tags: string
  tem_reuniao: boolean
  data_reuniao: string | null
  destino: Destino
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function classificar(lead: OppRow, tags: string): Destino {
  const tagList = tags.toLowerCase().split(',').map(t => t.trim())
  const temReuniao = !!(lead.data_reuniao_agendada || lead.data_agendamento_reuniao)
  if (temReuniao)                                        return 'vendas_mql'
  if (tagList.includes('mql') && !tagList.includes('nmql')) return 'pre_vendas_mql'
  if (tagList.includes('nmql'))                          return 'pre_vendas_nmql'
  return 'sem_classificacao'
}

// Fase 2: erro fail-closed (sem tenant ou sem credencial). E TERMINAL para a
// chamada — sem workspace_id/location_id no payload ou sem credencial GHL
// resolvida para o workspace, NAO ha como ler do GHL. Propaga ate o catch do
// handler (HTTP 500) com mensagem auditavel; NUNCA cai em chave/location global.
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

// Resolve o contexto do tenant (1 workspace por chamada):
//   1. workspace_id do payload JSON (preferencial) -> resolveGhlCredentials direto.
//   2. OU location_id do payload -> RPC get_workspace_id_by_ghl_location_id ->
//      workspace_id -> resolveGhlCredentials (sem fallback "mais antigo").
// Qualquer falha => FailClosedError (NUNCA chave/location global).
async function resolveTenantContext(
  req: Request,
  supabase: SupabaseClient,
): Promise<TenantContext> {
  let body: Record<string, unknown> = {}
  try {
    body = await req.clone().json() as Record<string, unknown>
  } catch {
    body = {}
  }

  let workspaceId: string | null = null
  let origin: 'workspace_id' | 'location_id' = 'workspace_id'

  if (typeof body.workspace_id === 'string' && body.workspace_id.length > 0) {
    workspaceId = body.workspace_id
    origin = 'workspace_id'
  } else if (typeof body.location_id === 'string' && body.location_id.length > 0) {
    origin = 'location_id'
    const { data, error } = await supabase.rpc('get_workspace_id_by_ghl_location_id', {
      p_location_id: body.location_id,
    })
    if (error) {
      throw new FailClosedError(
        `RPC get_workspace_id_by_ghl_location_id falhou: ${error.message}`,
      )
    }
    if (typeof data === 'string' && data.length > 0) {
      workspaceId = data
    }
    if (!workspaceId) {
      throw new FailClosedError(
        `location_id ${body.location_id} nao mapeado a nenhum workspace (fail-closed, sem fallback "mais antigo")`,
      )
    }
  }

  if (!workspaceId) {
    throw new FailClosedError(
      'tenant ausente no payload — recuperacao-prefetch exige workspace_id ou location_id (fail-closed, sem fallback)',
    )
  }

  let apiKey: string
  let locationId: string
  try {
    const creds = await resolveGhlCredentials(supabase, workspaceId)
    apiKey = creds.apiKey
    locationId = creds.locationId ?? ''
  } catch (err) {
    const msg = err instanceof CredentialResolutionError
      ? err.message
      : (err instanceof Error ? err.message : String(err))
    throw new FailClosedError(
      `credencial ghl nao resolvida para workspace ${workspaceId} (via ${origin}): ${msg}`,
    )
  }

  if (!locationId) {
    throw new FailClosedError(
      `workspace ${workspaceId} sem location_id nos metadados da credencial ghl`,
    )
  }

  return { workspaceId, apiKey, locationId }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const guardResponse = requireServiceRoleCaller(req, corsHeaders)
  if (guardResponse) return guardResponse

  try {
    // GHL_API_KEY nao e mais exigida (resolvida por workspace). So o client Supabase e obrigatorio.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      throw new Error('Missing env vars: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Resolve o contexto do tenant (workspace_id/location_id do payload + credencial
    // GHL do workspace). Fail-closed: sem tenant ou sem credencial => FailClosedError.
    const { workspaceId, apiKey, locationId } = await resolveTenantContext(req, supabase as unknown as SupabaseClient)
    console.log(`[prefetch] tenant resolvido: workspace=${workspaceId} location=${locationId}`)

    // ── Passo 1: Todos em Recuperação ─────────────────────────────────────────
    console.log('[prefetch] Passo 1: buscando leads em Recuperação...')

    const { data: recup, error: recupErr } = await supabase
      .from('oportunidades')
      .select('id, ghl_opportunity_id, contato_id, nome_contato, titulo, data_reuniao_agendada, data_agendamento_reuniao')
      .eq('pipeline_id', PIPELINE_RECUP)
      .limit(1000)

    if (recupErr) throw new Error(`Supabase: ${recupErr.message}`)

    const recupRows = (recup ?? []) as OppRow[]
    const todosContactIds = [...new Set(recupRows.map(r => r.contato_id).filter(Boolean))]

    // ── Passo 2: Identificar quais já têm par em outro pipeline (excluir) ─────
    console.log('[prefetch] Passo 2: identificando duplicados corretos...')

    const outrosSet = new Set<string>()
    for (let i = 0; i < todosContactIds.length; i += 50) {
      const batch = todosContactIds.slice(i, i + 50)
      const { data } = await supabase
        .from('oportunidades')
        .select('contato_id')
        .in('contato_id', batch)
        .neq('pipeline_id', PIPELINE_RECUP)
        .limit(1000)
      for (const r of (data ?? [])) outrosSet.add(r.contato_id)
    }

    const problematicos = recupRows.filter(r => r.contato_id && !outrosSet.has(r.contato_id))
    console.log(`[prefetch] ${recupRows.length} em Recuperação → ${outrosSet.size} já duplicados OK → ${problematicos.length} problemáticos`)

    // ── Passo 3: Tags dos contatos ────────────────────────────────────────────
    console.log('[prefetch] Passo 3: buscando tags dos contatos...')

    const contactIds = [...new Set(problematicos.map(r => r.contato_id))]
    const tagsMap = new Map<string, ContatoRow>()

    for (let i = 0; i < contactIds.length; i += 50) {
      const batch = contactIds.slice(i, i + 50)
      const { data } = await supabase
        .from('contatos')
        .select('id, ghl_id, tags')
        .in('id', batch)
      for (const c of (data ?? []) as ContatoRow[]) tagsMap.set(c.id, c)
    }

    // ── Passo 4: Pipelines e stages do GHL ────────────────────────────────────
    console.log('[prefetch] Passo 4: buscando pipelines e stages do GHL...')

    const pipelinesData = await ghlGet(
      `/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      apiKey,
      '/opportunities/pipelines',
    ) as Record<string, unknown>
    const pipelines: Record<string, { id: string; stages: Record<string, string> }> = {}

    for (const p of (pipelinesData?.pipelines as Record<string, unknown>[] ?? [])) {
      const stages: Record<string, string> = {}
      for (const s of (p.stages as Record<string, string>[] ?? [])) {
        stages[s.name] = s.id
      }
      pipelines[p.name as string] = { id: p.id as string, stages }
    }

    console.log(`[prefetch] ${Object.keys(pipelines).length} pipelines encontrados`)

    // ── Passo 5: Stage atual de cada opp via API GHL ──────────────────────────
    console.log(`[prefetch] Passo 5: buscando stage atual de ${problematicos.length} opps...`)

    const leads: LeadProcessado[] = []
    let apiOk = 0, apiErr = 0

    for (const lead of problematicos) {
      const contato = tagsMap.get(lead.contato_id)
      const tags    = contato?.tags ?? ''
      const destino = classificar(lead, tags)

      let stageId: string | null   = null
      let stageName: string | null = null
      let status: string | null    = null
      let ghlError: string | null  = null

      try {
        const data = await ghlGet(`/opportunities/${lead.ghl_opportunity_id}`, apiKey, lead.ghl_opportunity_id) as Record<string, unknown>
        const opp  = data?.opportunity as Record<string, string> | undefined
        stageId    = opp?.pipelineStageId   ?? null
        stageName  = opp?.pipelineStageName ?? null
        status     = opp?.status            ?? null
        apiOk++
      } catch (e) {
        // FailClosedError e terminal: nao vira "erro de item" nem e retentado.
        if (e instanceof FailClosedError) throw e
        ghlError = e instanceof Error ? e.message : String(e)
        console.error(`[prefetch] Erro em ${lead.ghl_opportunity_id}: ${ghlError}`)
        apiErr++
      }

      leads.push({
        supabase_id:        lead.id,
        ghl_opportunity_id: lead.ghl_opportunity_id,
        contato_id:         lead.contato_id,
        ghl_contact_id:     contato?.ghl_id ?? null,
        nome:               lead.nome_contato,
        titulo:             lead.titulo,
        current_stage_id:   stageId,
        current_stage_name: stageName,
        current_status:     status,
        ghl_error:          ghlError,
        tags,
        tem_reuniao:        !!(lead.data_reuniao_agendada || lead.data_agendamento_reuniao),
        data_reuniao:       lead.data_reuniao_agendada ?? lead.data_agendamento_reuniao ?? null,
        destino,
      })
    }

    // ── Estatísticas ──────────────────────────────────────────────────────────
    const stats = {
      total_em_recuperacao:   recupRows.length,
      ja_duplicados_corretos: outrosSet.size,
      problematicos:          leads.length,
      por_destino: {
        pre_vendas_mql:    leads.filter(l => l.destino === 'pre_vendas_mql').length,
        pre_vendas_nmql:   leads.filter(l => l.destino === 'pre_vendas_nmql').length,
        vendas_mql:        leads.filter(l => l.destino === 'vendas_mql').length,
        sem_classificacao: leads.filter(l => l.destino === 'sem_classificacao').length,
      },
      qualidade: {
        com_stage_id:        leads.filter(l => !!l.current_stage_id).length,
        sem_stage_id:        leads.filter(l => !l.current_stage_id && !l.ghl_error).length,
        com_erro_api:        apiErr,
        sem_ghl_contact_id:  leads.filter(l => !l.ghl_contact_id).length,
      },
    }

    console.log('[prefetch] Concluído:', JSON.stringify(stats))

    return new Response(JSON.stringify({
      gerado_em: new Date().toISOString(),
      estatisticas: stats,
      pipelines,
      leads,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[recuperacao-prefetch] Erro fatal:', err)
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
