// Edge Function: recuperacao-corrigir
//
// Corrige os leads que foram movidos para Recuperação em vez de duplicados.
// Para cada lead problemático:
//   1. Move a opp original de volta ao pipeline correto (PUT) — preserva createdAt
//   2. Cria nova opp duplicada em Recuperação com o estágio atual (POST)
//
// Modos:
//   "test"  → processa apenas 5 leads (1-2 por categoria) para validação manual
//   "full"  → processa todos os leads (exceto sem_classificacao se skipUnclassified=true)
//
// Uso:
//   POST /functions/v1/recuperacao-corrigir
//   Body: {
//     "mode": "test" | "full",
//     "batch_size"?: number,
//     "skipUnclassified"?: boolean,
//     "workspace_id"?: string,   // tenant direto (preferencial)
//     "location_id"?: string     // alternativa: resolve workspace_id via RPC
//   }
//
// IMPORTANTE: Executar "test" primeiro e validar no GHL antes de rodar "full".
//
// Fase 2 (isolamento de credenciais por workspace): a chave/location GHL NAO sao
// mais globais. O tenant vem do payload (workspace_id direto OU location_id ->
// RPC get_workspace_id_by_ghl_location_id) e a credencial e resolvida UMA VEZ no
// handler via helper (Vault + cache) — Modelo 2 (1 workspace por chamada). O
// pipeline Recuperacao e de um unico location, logo a correcao roda por tenant.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { resolveGhlCredentials, CredentialResolutionError } from '../_shared/resolve-workspace-credentials.ts'
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts'

// ─── Configuração ─────────────────────────────────────────────────────────────

const GHL_API_BASE   = 'https://services.leadconnectorhq.com'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const BASE_DELAY_MS  = 200

// Fase 2: a chave NAO e mais global. E resolvida por workspace via helper e
// montada por chamada em buildGhlHeaders. Sem GHL_API_KEY/GHL_LOCATION_ID/GHL_HEADERS.
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

// ─── Mapa de pipelines e stages "Perdido" ────────────────────────────────────
// Coletado via GET /opportunities/pipelines?locationId=U8FTcw90CB5QELUnbGUu

const PIPELINES = {
  pre_vendas_mql: {
    id:       'QQXqQvYEkwafSCAB1ybC',
    name:     'Pré-Vendas MQL',
    perdido:  'fa46b2f5-a110-4eda-b3ed-233bf0dbbec0',
  },
  pre_vendas_nmql: {
    id:       'sqchZ2kIIZljR6wJ6bko',
    name:     'Pré-Vendas nMQL',
    perdido:  '92207089-d034-4fe3-859e-c784eefcbe33',
  },
  vendas_mql: {
    id:       'ZWuCjEXM2VDyLCx8CtGU',
    name:     'Vendas SQL',
    perdido:  '5bcee2fb-eefd-4df0-82f8-4303e1f5c8cf',   // "Perdida" em Vendas SQL
  },
  social_selling: {
    id:       'fgh4CfZQ8Un9iRCsgPFw',
    name:     'Social Selling',
    perdido:  '76a45114-30f1-45a2-97e1-965cf3b13b4b',
  },
  recuperacao: {
    id:       'Sn1Guqcm6zwZNTVOOf5L',
    name:     'Recuperação',
  },
} as const

// ─── Fase 2: erro fail-closed + contexto de tenant ────────────────────────────
//
// Sem tenant (workspace_id/location_id) ou sem credencial GHL resolvida para o
// workspace, NAO ha como corrigir. E TERMINAL: propaga ate o catch do handler
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

// Resolve o contexto do tenant (1 workspace por chamada):
//   1. workspace_id direto do payload -> resolveGhlCredentials; OU
//   2. location_id do payload -> RPC get_workspace_id_by_ghl_location_id -> workspace_id
//      -> resolveGhlCredentials.
// Qualquer falha => FailClosedError (NUNCA chave/location global; RPC sem fallback
// a "workspace mais antigo").
async function resolveTenantContext(
  body: Record<string, unknown>,
  supabase: SupabaseClient,
): Promise<TenantContext> {
  const workspaceIdRaw = typeof body.workspace_id === 'string' ? body.workspace_id.trim() : ''
  const locationIdRaw  = typeof body.location_id  === 'string' ? body.location_id.trim()  : ''

  let workspaceId = workspaceIdRaw

  if (!workspaceId && locationIdRaw) {
    const { data, error } = await supabase.rpc('get_workspace_id_by_ghl_location_id', {
      p_location_id: locationIdRaw,
    })
    if (error) {
      throw new FailClosedError(`falha ao resolver workspace por location_id: ${error.message}`)
    }
    if (typeof data !== 'string' || data.length === 0) {
      throw new FailClosedError(
        `location_id ${locationIdRaw} nao mapeado a nenhum workspace (fail-closed, sem fallback)`,
      )
    }
    workspaceId = data
  }

  if (!workspaceId) {
    throw new FailClosedError(
      'workspace_id ou location_id ausente no payload — recuperacao-corrigir exige o tenant (fail-closed, sem fallback)',
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

// ─── Rate limit ───────────────────────────────────────────────────────────────

const rl = { remaining: 100, resetMs: 0 }

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function ghlRequest(
  path: string,
  method: 'GET' | 'PUT' | 'POST',
  apiKey: string,
  body?: unknown,
  label = '',
): Promise<Record<string, unknown>> {
  const MAX_RETRIES = 4

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (rl.remaining < 5) {
      await delay(Math.max(rl.resetMs, 1000) + 200)
    } else if (rl.remaining < 20) {
      await delay(500)
    } else {
      await delay(BASE_DELAY_MS)
    }

    const res = await fetch(`${GHL_API_BASE}${path}`, {
      method,
      headers: buildGhlHeaders(apiKey),
      body: body ? JSON.stringify(body) : undefined,
    })

    const remaining = res.headers.get('x-ratelimit-remaining')
    const interval  = res.headers.get('x-ratelimit-interval-milliseconds')
    if (remaining !== null) rl.remaining = Number(remaining)
    if (interval  !== null) rl.resetMs   = Number(interval)

    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After')
      const wait = retryAfter ? Number(retryAfter) * 1000 : 1000 * Math.pow(2, attempt)
      console.warn(`[recuperacao-corrigir] 429 "${label}" — aguardando ${wait + 500}ms`)
      if (attempt >= MAX_RETRIES) throw new Error(`GHL 429 após ${MAX_RETRIES} tentativas: ${label}`)
      await delay(wait + 500)
      continue
    }

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`GHL ${res.status} ${method} "${label}": ${text}`)
    }

    return res.json()
  }

  throw new Error(`ghlRequest: loop inesperado (${label})`)
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Destino = 'pre_vendas_mql' | 'pre_vendas_nmql' | 'vendas_mql' | 'social_selling' | 'sem_classificacao'

interface OppRow {
  id: string
  ghl_opportunity_id: string
  contato_id: string
  nome_contato: string | null
  titulo: string | null
  pipeline_stage_id: string | null
  data_reuniao_agendada: string | null
  data_agendamento_reuniao: string | null
}

interface LeadResult {
  supabase_id: string
  ghl_opportunity_id: string
  nome: string | null
  destino: Destino
  status: 'sucesso' | 'erro' | 'pulado'
  nova_opp_id?: string
  erro?: string
}

// ─── Classificação ────────────────────────────────────────────────────────────

function classificar(lead: OppRow, tags: string): Destino {
  const tagList = tags.toLowerCase().split(',').map(t => t.trim())
  const temReuniao = !!(lead.data_reuniao_agendada || lead.data_agendamento_reuniao)

  if (temReuniao)                                               return 'vendas_mql'
  if (tagList.includes('mql') && !tagList.includes('nmql'))    return 'pre_vendas_mql'
  if (tagList.includes('nmql'))                                 return 'pre_vendas_nmql'
  if (tagList.some(t => t.includes('social selling')))         return 'social_selling'
  return 'sem_classificacao'
}

// ─── Processar 1 lead ─────────────────────────────────────────────────────────

async function processarLead(
  lead: OppRow,
  ghlContactId: string,
  destino: Destino,
  supabase: ReturnType<typeof createClient>,
  apiKey: string,
  locationId: string,
): Promise<LeadResult> {
  const base: LeadResult = {
    supabase_id:         lead.id,
    ghl_opportunity_id:  lead.ghl_opportunity_id,
    nome:                lead.nome_contato,
    destino,
    status:              'erro',
  }

  if (destino === 'sem_classificacao') {
    return { ...base, status: 'pulado', erro: 'sem classificação definida' }
  }

  const pipeline = PIPELINES[destino]

  // PASSO A: Mover opp para pipeline original + stage Perdido
  await ghlRequest(
    `/opportunities/${lead.ghl_opportunity_id}`,
    'PUT',
    apiKey,
    {
      pipelineId:      pipeline.id,
      pipelineStageId: pipeline.perdido,
      status:          'lost',
    },
    `PUT ${lead.ghl_opportunity_id} → ${pipeline.name}`,
  )

  console.log(`[corrigir] ✓ PUT ${lead.ghl_opportunity_id} → ${pipeline.name} (Perdido)`)

  // PASSO B: Criar duplicata em Recuperação com o estágio atual
  const novaOpp = await ghlRequest(
    '/opportunities/',
    'POST',
    apiKey,
    {
      pipelineId:      PIPELINES.recuperacao.id,
      pipelineStageId: lead.pipeline_stage_id,   // estágio atual em Recuperação
      contactId:       ghlContactId,
      name:            lead.titulo || lead.nome_contato || 'Lead',
      status:          'open',
      locationId,                                  // location_id do tenant resolvido
    },
    `POST duplicata Recuperação para ${lead.ghl_opportunity_id}`,
  ) as Record<string, Record<string, string>>

  const novaOppId = novaOpp?.opportunity?.id ?? null
  console.log(`[corrigir] ✓ POST duplicata Recuperação → nova opp ${novaOppId}`)

  // PASSO C: Atualizar Supabase — refletir que a opp original foi para o pipeline correto
  await supabase
    .from('oportunidades')
    .update({
      pipeline_id:       pipeline.id,
      pipeline_name:     pipeline.name,
      pipeline_stage_id: pipeline.perdido,
    })
    .eq('id', lead.id)

  console.log(`[corrigir] ✓ Supabase atualizado: ${lead.id} → ${pipeline.name}`)

  return { ...base, status: 'sucesso', nova_opp_id: novaOppId ?? undefined }
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

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const mode             = (body.mode ?? 'test') as 'test' | 'full'
    const skipUnclassified = body.skipUnclassified !== false  // default: true
    const batchSize        = mode === 'test' ? 5 : Math.min(Number(body.batch_size ?? 50), 100)
    const forceOppIds      = Array.isArray(body.oppIds) ? body.oppIds as string[] : null

    if (!['test', 'full'].includes(mode)) {
      return new Response(JSON.stringify({ error: 'mode deve ser "test" ou "full"' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`[recuperacao-corrigir] Iniciando — mode=${mode} batchSize=${batchSize}`)

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

    // Resolve o contexto do tenant (workspace_id/location_id do payload + credencial
    // GHL do workspace) UMA VEZ — Modelo 2 (1 workspace por chamada). Fail-closed:
    // sem tenant ou sem credencial => FailClosedError (terminal, HTTP 500).
    const { workspaceId, apiKey, locationId } = await resolveTenantContext(body, supabase)
    console.log(`[recuperacao-corrigir] tenant resolvido — workspace=${workspaceId} location=${locationId}`)

    // ── Buscar todos em Recuperação ───────────────────────────────────────────
    const { data: recup, error: recupErr } = await supabase
      .from('oportunidades')
      .select('id, ghl_opportunity_id, contato_id, nome_contato, titulo, pipeline_stage_id, data_reuniao_agendada, data_agendamento_reuniao')
      .eq('pipeline_id', PIPELINES.recuperacao.id)
      .limit(1000)

    if (recupErr) throw new Error(`Supabase oportunidades: ${recupErr.message}`)

    const recupRows = (recup ?? []) as OppRow[]
    const todosContactIds = [...new Set(recupRows.map(r => r.contato_id).filter(Boolean))]

    // ── Identificar quais já têm par em outro pipeline (excluir) ──────────────
    const outrosSet = new Set<string>()
    for (let i = 0; i < todosContactIds.length; i += 50) {
      const batch = todosContactIds.slice(i, i + 50)
      const { data } = await supabase
        .from('oportunidades')
        .select('contato_id')
        .in('contato_id', batch)
        .neq('pipeline_id', PIPELINES.recuperacao.id)
        .limit(1000)
      for (const r of (data ?? [])) outrosSet.add(r.contato_id)
    }

    const problematicos = recupRows.filter(r => r.contato_id && !outrosSet.has(r.contato_id))
    console.log(`[corrigir] ${problematicos.length} leads problemáticos identificados`)

    // ── Buscar tags e ghl_id dos contatos ─────────────────────────────────────
    const contactIds = [...new Set(problematicos.map(r => r.contato_id))]
    const contatoMap = new Map<string, { ghl_id: string | null; tags: string }>()

    for (let i = 0; i < contactIds.length; i += 50) {
      const batch = contactIds.slice(i, i + 50)
      const { data } = await supabase
        .from('contatos')
        .select('id, ghl_id, tags')
        .in('id', batch)
      for (const c of (data ?? [])) {
        contatoMap.set(c.id, { ghl_id: c.ghl_id, tags: c.tags || '' })
      }
    }

    // ── Classificar e selecionar leads ────────────────────────────────────────
    type LeadComDestino = OppRow & { destino: Destino; ghlContactId: string }

    let candidatos: LeadComDestino[] = problematicos
      .map(lead => {
        const contato = contatoMap.get(lead.contato_id)
        const destino = classificar(lead, contato?.tags ?? '')
        return { ...lead, destino, ghlContactId: contato?.ghl_id ?? '' }
      })
      .filter(l => {
        if (!l.ghlContactId) return false
        if (forceOppIds) return forceOppIds.includes(l.ghl_opportunity_id)
        if (skipUnclassified && l.destino === 'sem_classificacao') return false
        return true
      })

    // No modo test: pegar 1-2 de cada categoria
    if (mode === 'test') {
      const porDestino: Record<string, LeadComDestino[]> = {}
      for (const l of candidatos) {
        if (!porDestino[l.destino]) porDestino[l.destino] = []
        porDestino[l.destino].push(l)
      }
      candidatos = Object.values(porDestino).flatMap(grupo => grupo.slice(0, 2)).slice(0, batchSize)
      console.log(`[corrigir] MODO TEST — selecionados ${candidatos.length} leads (até 2 por categoria)`)
    } else {
      candidatos = candidatos.slice(0, batchSize)
      console.log(`[corrigir] MODO FULL — processando ${candidatos.length} leads (batch ${batchSize})`)
    }

    // ── Processar ─────────────────────────────────────────────────────────────
    const resultados: LeadResult[] = []
    let sucesso = 0, erros = 0, pulados = 0

    for (const lead of candidatos) {
      try {
        const result = await processarLead(lead, lead.ghlContactId, lead.destino, supabase, apiKey, locationId)
        resultados.push(result)
        if (result.status === 'sucesso') sucesso++
        else if (result.status === 'erro') erros++
        else pulados++
      } catch (e) {
        // FailClosedError e terminal (sem tenant/credencial) — propaga, nao vira erro de item.
        if (e instanceof FailClosedError) throw e
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[corrigir] ❌ ${lead.ghl_opportunity_id}: ${msg}`)
        resultados.push({
          supabase_id:        lead.id,
          ghl_opportunity_id: lead.ghl_opportunity_id,
          nome:               lead.nome_contato,
          destino:            lead.destino,
          status:             'erro',
          erro:               msg,
        })
        erros++
      }
    }

    // ── Contar quantos ainda faltam ───────────────────────────────────────────
    const processadosComSucesso = resultados.filter(r => r.status === 'sucesso').map(r => r.contato_id)
    const remaining = problematicos.length - sucesso

    console.log(`[corrigir] Concluído — sucesso=${sucesso} erros=${erros} pulados=${pulados} remaining≈${remaining}`)

    return new Response(JSON.stringify({
      mode,
      workspace_id: workspaceId,
      processados: candidatos.length,
      sucesso,
      erros,
      pulados,
      remaining_estimate: remaining,
      aviso: mode === 'test'
        ? '⚠️ MODO TESTE — valide os resultados no GHL antes de rodar mode="full"'
        : undefined,
      resultados,
    }, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[recuperacao-corrigir] Erro fatal:', err)
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
