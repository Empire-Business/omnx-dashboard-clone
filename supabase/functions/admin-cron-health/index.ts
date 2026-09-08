// Edge Function temporária: admin-cron-health
// Lista crons ativas e últimas execuções no banco via RPC.
// Acesso restrito a usuários autenticados.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || ''

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing Supabase environment variables')
    }

    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Lista de crons ativas
    const { data: jobs, error: jobsError } = await supabaseAdmin.rpc('get_cron_jobs')

    if (jobsError) {
      throw new Error(`Erro ao ler crons: ${jobsError.message}`)
    }

    // Últimas execuções
    const { data: runs, error: runsError } = await supabaseAdmin.rpc('get_cron_runs', {
      limit_count: 100,
    })

    // Resumo de status
    const statusCounts: Record<string, number> = {}
    if (runs) {
      for (const run of runs) {
        const status = run.status || 'unknown'
        statusCounts[status] = (statusCounts[status] || 0) + 1
      }
    }

    return new Response(
      JSON.stringify({
        user: userData.user.email,
        jobs_count: jobs?.length ?? 0,
        jobs,
        recent_runs_count: runs?.length ?? 0,
        recent_runs_status_counts: statusCounts,
        recent_runs: runsError ? { error: runsError.message } : runs?.slice(0, 20),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[admin-cron-health] Erro:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
