// Edge Function: discover-agency-locations
// Fase 3 — descoberta de sub-contas via token de agencia GHL (so-leitura).
// docs/HANDOFF-MULTI-TENANT-2026-07-11.md (secao 6.3)
//
// O que faz:
//   1. Para cada agencia com token cadastrado em agency_ghl_credentials,
//      chama GET /locations/search?companyId= (endpoint confirmado na POC —
//      scripts/poc-fase3-ghl-agency-api.ts) usando o token de agencia
//      (SO-LEITURA — decisao do dono, docs/FASE-3-POC-RESULTADOS.md).
//   2. Para cada location retornada, verifica se ja existe em
//      agency_workspaces (por ghl_location_id):
//        - ja rastreada por ESTA agencia, status 'suspended' -> NAO reconecta
//          automaticamente (so sinaliza); status 'active'/'pending' -> no-op.
//        - rastreada por OUTRA agencia -> alerta (log), NUNCA sobrescreve
//          (a colisao 'active' tambem e bloqueada pelo indice unico parcial
//          uq_agency_workspaces_location_active).
//        - nao encontrada -> cria workspace novo (owner = dono da agencia)
//          + agency_workspaces com status='pending', provisioning_mode=
//          'auto_discovered'. O cliente conecta a PROPRIA chave via BYOK
//          (Fase 4) depois — esta funcao NUNCA tenta descobrir admin.
//
// PROIBIDO (decisao do dono, secao 5 do handoff): esta funcao NUNCA chama
// GET /users/ nem qualquer endpoint de usuarios/admins por sub-conta. O token
// de agencia e estritamente so-leitura para listar sub-contas.
//
// Endpoint: POST /discover-agency-locations (sem body — roda para TODAS as
// agencias com credencial cadastrada; chamado pelo cron a cada 6h).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import {
  resolveAgencyCredential,
  AgencyCredentialResolutionError,
} from '../_shared/resolve-agency-credentials.ts'
import { corsHeaders } from '../_shared/cors.ts'
import { requireServiceRoleCaller } from '../_shared/require-service-role.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || ''

const GHL_API_BASE = 'https://services.leadconnectorhq.com'
const GHL_API_VERSION = '2021-07-28'
const REQUEST_TIMEOUT_MS = 15000

interface GhlLocation {
  id: string
  name?: string
}

interface AgencySummary {
  agency_id: string
  company_id: string
  locations_seen: number
  created: number
  skipped_suspended: number
  skipped_conflict_other_agency: number
  already_tracked: number
  errors: string[]
}

async function fetchAgencyLocations(apiKey: string, companyId: string): Promise<GhlLocation[]> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(
      `${GHL_API_BASE}/locations/search?companyId=${encodeURIComponent(companyId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Version: GHL_API_VERSION,
          Accept: 'application/json',
        },
        signal: controller.signal,
      }
    )
    if (!res.ok) {
      throw new Error(`GHL /locations/search retornou HTTP ${res.status}`)
    }
    const json = (await res.json()) as { locations?: GhlLocation[] }
    return json.locations ?? []
  } finally {
    clearTimeout(timeout)
  }
}

// deno-lint-ignore no-explicit-any
async function processAgency(supabase: any, agencyId: string): Promise<AgencySummary> {
  const summary: AgencySummary = {
    agency_id: agencyId,
    company_id: '',
    locations_seen: 0,
    created: 0,
    skipped_suspended: 0,
    skipped_conflict_other_agency: 0,
    already_tracked: 0,
    errors: [],
  }

  let apiKey: string
  let companyId: string
  try {
    const cred = await resolveAgencyCredential(supabase, agencyId)
    apiKey = cred.apiKey
    companyId = cred.companyId
    summary.company_id = companyId
  } catch (e) {
    const msg = e instanceof AgencyCredentialResolutionError ? e.message : String(e)
    summary.errors.push(`credencial indisponivel: ${msg}`)
    return summary
  }

  const { data: agencyRow, error: agencyErr } = await supabase
    .from('agencies')
    .select('owner_id')
    .eq('id', agencyId)
    .single()
  if (agencyErr || !agencyRow) {
    summary.errors.push(`agencia nao encontrada: ${agencyErr?.message ?? 'sem linha'}`)
    return summary
  }
  const ownerId = agencyRow.owner_id as string

  let locations: GhlLocation[]
  try {
    locations = await fetchAgencyLocations(apiKey, companyId)
  } catch (e) {
    summary.errors.push(`falha ao buscar locations: ${e instanceof Error ? e.message : String(e)}`)
    return summary
  }
  summary.locations_seen = locations.length

  for (const location of locations) {
    if (!location.id) continue

    const { data: existing, error: existingErr } = await supabase
      .from('agency_workspaces')
      .select('id, agency_id, status')
      .eq('ghl_location_id', location.id)
      .maybeSingle()

    if (existingErr) {
      summary.errors.push(`lookup falhou p/ location ${location.id}: ${existingErr.message}`)
      continue
    }

    if (existing) {
      if (existing.agency_id !== agencyId) {
        // Nunca sobrescreve sub-conta de outra agencia — so alerta.
        summary.skipped_conflict_other_agency++
        continue
      }
      if (existing.status === 'suspended') {
        // Reativacao NUNCA e automatica (secao 3.6 do plano-mae).
        summary.skipped_suspended++
        continue
      }
      summary.already_tracked++
      continue
    }

    const { data: newWorkspace, error: wsErr } = await supabase
      .from('workspaces')
      .insert({ name: location.name || location.id, owner_id: ownerId, settings: {} })
      .select('id')
      .single()
    if (wsErr || !newWorkspace) {
      summary.errors.push(`falha ao criar workspace p/ location ${location.id}: ${wsErr?.message ?? 'sem linha'}`)
      continue
    }
    const workspaceId = newWorkspace.id as string

    const { error: memberErr } = await supabase.from('workspace_members').insert({
      workspace_id: workspaceId,
      user_id: ownerId,
      role: 'owner',
      invited_by: ownerId,
      joined_at: new Date().toISOString(),
      is_active: true,
    })
    if (memberErr) {
      summary.errors.push(`falha ao criar workspace_members p/ workspace ${workspaceId}: ${memberErr.message}`)
      continue
    }

    const { error: awErr } = await supabase.from('agency_workspaces').insert({
      agency_id: agencyId,
      workspace_id: workspaceId,
      provisioning_mode: 'auto_discovered',
      ghl_location_id: location.id,
      status: 'pending',
    })
    if (awErr) {
      // Corrida possivel com o indice unico parcial (outra chamada concorrente
      // ja atribuiu esta location a outra agencia): nao falha o loop inteiro.
      summary.errors.push(`falha ao criar agency_workspaces p/ location ${location.id}: ${awErr.message}`)
      continue
    }

    summary.created++
  }

  return summary
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido. Use POST.' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const guardResponse = requireServiceRoleCaller(req, corsHeaders)
  if (guardResponse) return guardResponse

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Variáveis do Supabase não configuradas' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const { data: agencyIds, error: agencyIdsErr } = await supabase
    .from('agency_ghl_credentials')
    .select('agency_id')
  if (agencyIdsErr) {
    return new Response(
      JSON.stringify({ error: `falha ao listar agencias com credencial: ${agencyIdsErr.message}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const summaries: AgencySummary[] = []
  for (const row of agencyIds ?? []) {
    summaries.push(await processAgency(supabase, row.agency_id as string))
  }

  return new Response(JSON.stringify({ agencies_processed: summaries.length, summaries }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
