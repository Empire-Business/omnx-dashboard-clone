// Edge Function: external-form-submissions
// Proxy que lê submissões de formulário:
// - Default workspace: lê tabela local aplic-acelerador
// - Outras subcontas: resolve credencial do Vault e lê Supabase externo

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const DEFAULT_WS = '7909d02a-4d15-46ea-a7b8-5debeb6e8351'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const body = await req.json().catch(() => ({}))
    const workspaceId = body.workspace_id
    if (!workspaceId) return jsonResponse({ error: 'workspace_id obrigatório' }, 400)

    const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

    // Auth obrigatória (P1 fechado em 2026-07-21): JWT válido + membership ativa
    // no workspace pedido. A função serve PII de inscrições com service_role —
    // sem esta checagem, qualquer autenticado lia dados de qualquer workspace
    // (IDOR). O caller é sempre o frontend autenticado (InscricoesPage).
    const token = req.headers.get('authorization')?.replace('Bearer ', '').trim()
    if (!token) return jsonResponse({ error: 'Unauthorized' }, 401)
    const { data: { user: caller }, error: authError } = await sb.auth.getUser(token)
    if (authError || !caller) return jsonResponse({ error: 'Unauthorized' }, 401)

    const { data: membership, error: membershipError } = await sb
      .from('workspace_members')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('user_id', caller.id)
      .eq('is_active', true)
      .maybeSingle()
    if (membershipError) {
      return jsonResponse({ error: 'Não foi possível verificar acesso.' }, 500)
    }
    if (!membership) {
      return jsonResponse({ error: 'Workspace não encontrado ou acesso negado' }, 403)
    }

    // Default workspace: lê tabela local
    if (workspaceId === DEFAULT_WS) {
      return await fetchLocal(sb, body)
    }

    // Outras subcontas: resolve config externa
    const { data: source, error: srcErr } = await sb
      .from('workspace_external_form_sources')
      .select('external_project_url, external_table_name, secret_key_id, status')
      .eq('workspace_id', workspaceId)
      .eq('provider', 'supabase')
      .maybeSingle()

    if (srcErr || !source) {
      return jsonResponse({ error: 'not_configured', message: 'Configure seu Supabase externo para ver as inscrições.' }, 404)
    }

    if (source.status !== 'connected' && source.status !== 'testing') {
      return jsonResponse({ error: 'not_connected', status: source.status, message: 'Conexão não testada ou com erro.' }, 400)
    }

    // Resolve a service role key do Supabase externo via Vault.
    //
    // ATENCAO — por que NAO usa resolveWorkspaceCredential(): o segredo externo
    // e referenciado por workspace_external_form_sources.secret_key_id (por
    // workspace), NAO por workspace_integration_credentials — o CHECK de
    // provider dessa tabela ('ghl','meta','openrouter','notion','outbound_webhook')
    // nao aceita 'ext_form_supabase', entao a resolucao via helper falharia
    // SEMPRE. A leitura direta via RPC e o caminho primario (nao um fallback):
    // fail-closed — sem fonte configurada ja retornou 404 acima; falha na
    // decifracao retorna erro claro, sem segundo caminho.
    const { data: decrypted, error: decErr } = await sb.rpc('get_decrypted_secret', { p_secret_key_id: source.secret_key_id })
    if (decErr || typeof decrypted !== 'string' || !decrypted) {
      return jsonResponse({ error: 'credential_error', message: 'Não foi possível decifrar a chave externa do workspace.' }, 500)
    }
    const externalKey: string = decrypted

    // Chama o Supabase externo via REST API
    const tableName = source.external_table_name || 'aplic-acelerador'
    const page = body.page || 0
    const pageSize = body.page_size || 50
    const from = page * pageSize
    const to = from + pageSize - 1

    const url = new URL(`${source.external_project_url}/rest/v1/${tableName}`)
    url.searchParams.set('select', '*')
    url.searchParams.set('order', 'created_at.desc')
    if (body.search) {
      const term = `%${body.search}%`
      url.searchParams.set('or', `nome.ilike.${term},email.ilike.${term},whatsapp.ilike.${term}`)
    }
    if (body.status && body.status !== 'all') url.searchParams.set('status', `eq.${body.status}`)
    url.searchParams.set('offset', String(from))
    url.searchParams.set('limit', String(pageSize))

    const extRes = await fetch(url.toString(), {
      headers: {
        'apikey': externalKey,
        'Authorization': `Bearer ${externalKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!extRes.ok) {
      const errText = await extRes.text().catch(() => 'erro desconhecido')
      // Marca como erro
      await sb.rpc('update_workspace_external_form_source_status', {
        p_workspace_id: workspaceId, p_status: 'error', p_error: `HTTP ${extRes.status}: ${errText.slice(0, 200)}`,
      })
      return jsonResponse({ error: 'external_error', message: errText.slice(0, 200) }, 502)
    }

    const extData = await extRes.json()
    const totalCount = parseInt(extRes.headers.get('content-range')?.split('/')[1] || '0')

    // Marca como connected se era testing
    if (source.status === 'testing') {
      await sb.rpc('update_workspace_external_form_source_status', {
        p_workspace_id: workspaceId, p_status: 'connected',
      })
    }

    return jsonResponse({ data: extData, total: totalCount || extData.length, page, page_size: pageSize })
  } catch (e) {
    return jsonResponse({ error: 'internal', message: e instanceof Error ? e.message : String(e) }, 500)
  }
})

async function fetchLocal(sb: ReturnType<typeof createClient>, body: Record<string, unknown>): Promise<Response> {
  const page = (body.page as number) || 0
  const pageSize = (body.page_size as number) || 50
  const from = page * pageSize
  const to = from + pageSize - 1

  let q = sb.from('aplic-acelerador').select('*', { count: 'exact' })
  if (body.search) {
    const term = `%${body.search}%`
    q = q.or(`nome.ilike.${term},email.ilike.${term},whatsapp.ilike.${term}`)
  }
  if (body.status && body.status !== 'all') q = q.eq('status', body.status)
  if (body.date_start) q = q.gte('created_at', `${body.date_start}T00:00:00Z`)
  if (body.date_end) q = q.lte('created_at', `${body.date_end}T23:59:59Z`)

  const { data, count, error } = await q.order('created_at', { ascending: false }).range(from, to)
  if (error) return jsonResponse({ error: error.message }, 500)

  // Deduplica por email + minuto
  const seen = new Set<string>()
  const deduped = (data ?? []).filter(s => {
    const key = `${s.email || s.whatsapp || s.nome}|${(s.created_at || '').slice(0, 16)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return jsonResponse({ data: deduped, total: deduped.length, page, page_size: pageSize })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
