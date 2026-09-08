// Edge Function: generate-creative-code
// Gera o próximo código sequencial único para criativos dentro de um workspace.
//
// POST body:
// {
//   "workspaceId": string,
//   "prefix": "CR" | "AN"          // default: "AN" para criativos nativos
// }
//
// Resposta:
// {
//   "code": "AN-0001"
// }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { createRequestId, logSafeError } from '../_shared/safe-error.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function normalizeCode(prefix: string, num: number): string {
  return `${prefix}-${String(num).padStart(4, '0')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '').trim()

    // Client autenticado como o caller para RPCs que usam auth.uid() internamente
    const supabaseAsUser = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    )
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (!caller || authError) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = (await req.json()) as { workspaceId: string; prefix?: string }
    const { workspaceId, prefix = 'AN' } = body

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspaceId é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const upperPrefix = prefix.toUpperCase()
    if (!['CR', 'AN'].includes(upperPrefix)) {
      return new Response(JSON.stringify({ error: 'prefix deve ser CR ou AN' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verifica se o chamador é membro ativo do workspace
    const { data: membership } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', caller.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Acesso negado ao workspace' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Busca o maior número já usado com esse prefixo no workspace
    // Usa client autenticado para que auth.uid() dentro da RPC seja o caller
    const { data: rows, error } = await supabaseAsUser.rpc('get_max_creative_number', {
      p_workspace_id: workspaceId,
      p_prefix: upperPrefix,
    })

    if (error) {
      const requestId = createRequestId()
      logSafeError('generate-creative-code:next-code', requestId, error)
      return new Response(JSON.stringify({ error: 'Não foi possível gerar o código.', request_id: requestId }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const maxNum = (rows as number | null) ?? 0
    const nextNum = maxNum + 1
    const code = normalizeCode(upperPrefix, nextNum)

    return new Response(JSON.stringify({ code, prefix: upperPrefix, number: nextNum }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const requestId = createRequestId()
    logSafeError('generate-creative-code', requestId, err)
    return new Response(JSON.stringify({ error: 'Não foi possível gerar o código.', request_id: requestId }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
