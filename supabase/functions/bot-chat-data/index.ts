// Edge Function: bot-chat-data
// Worker de execução de tools da Clara — roda queries no Supabase via service role.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { executeTool } from '../_shared/clara/executors.ts'
import { createWorkspaceScopedClient } from '../_shared/clara/workspace-query-guard.ts'
import { createRequestId, logSafeError, publicError } from '../_shared/safe-error.ts'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ToolRequest {
  name: string
  arguments: Record<string, unknown>
}

interface DataRequest {
  tools: ToolRequest[]
  workspace_id?: string
  _internal_secret?: string
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const requestId = createRequestId()
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const internalSecret = Deno.env.get('BOT_INTERNAL_SECRET')

    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '')
    if (!authHeader) return jsonResponse({ error: 'Authorization header ausente' }, 401)

    const body = await req.json() as DataRequest
    const isServiceCall = !!internalSecret && body._internal_secret === internalSecret

    if (!body.workspace_id) return jsonResponse({ error: 'workspace_id é obrigatório' }, 400)

    let userId: string | null = null
    if (!isServiceCall) {
      const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey)
      const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(authHeader)
      if (authErr || !user) return jsonResponse({ error: 'Não autorizado' }, 401)
      userId = user.id
    }

    if (!Array.isArray(body.tools) || body.tools.length === 0) {
      return jsonResponse({ error: 'tools deve ser um array não vazio' }, 400)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    if (userId) {
      const { data: member } = await supabase
        .from('workspace_members')
        .select('id')
        .eq('workspace_id', body.workspace_id)
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle()
      if (!member) return jsonResponse({ error: 'Acesso negado para esta conta' }, 403)
    }
    const scopedSupabase = createWorkspaceScopedClient(supabase, body.workspace_id)
    const results = []

    for (const tool of body.tools) {
      const start = Date.now()
      try {
        if (tool.name === 'run_sql_query' || tool.name === 'query_meta_ads_region') {
          throw new Error('Ferramenta indisponível até receber isolamento por conta.')
        }
        const result = await executeTool(tool.name, tool.arguments ?? {}, scopedSupabase, body.workspace_id)
        results.push({ name: tool.name, result, ok: true, duration_ms: Date.now() - start })
      } catch (e) {
        logSafeError('bot-chat-data:tool', requestId, e)
        results.push({
          name: tool.name,
          result: { error: 'Não foi possível consultar este dado.', code: 'tool_execution_failed', request_id: requestId },
          ok: false,
          duration_ms: Date.now() - start,
        })
      }
    }

    return jsonResponse({ results, count: results.length })
  } catch (err) {
    const requestId = createRequestId()
    logSafeError('bot-chat-data', requestId, err)
    return publicError('internal_error', requestId, 500, CORS_HEADERS)
  }
})
