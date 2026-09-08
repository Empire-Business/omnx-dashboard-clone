// Edge Function: setup-ghl-integration
// Configura ou atualiza as credenciais GHL de um workspace de forma segura.
// Apenas owner/admin do workspace pode chamar.
//
// IMPORTANT: GHL API key is no longer stored in the database. It must be set
// as the GHL_API_KEY environment variable in the deployment platform (Vercel
// or Supabase Secrets). This function only stores location_id and webhook_secret.
//
// Endpoint: POST /setup-ghl-integration
// Headers:  Authorization: Bearer <jwt>
// Body:     { workspace_id: string, ghl_location_id: string, webhook_secret?: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { corsHeaders } from '../_shared/cors.ts'
import { createRequestId, logSafeError, publicError } from '../_shared/safe-error.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || ''

function validateLocationId(locationId: string): boolean {
  return locationId.length >= 8
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

    // 1. Validar JWT do chamador
    const authHeader = req.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '').trim()
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token)
    if (!caller || authError) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 2. Ler body e validar campos obrigatórios
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
    const ghlLocationId = typeof body.ghl_location_id === 'string' ? body.ghl_location_id.trim() : ''
    const webhookSecret = typeof body.webhook_secret === 'string' ? body.webhook_secret.trim() : null

    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'workspace_id é obrigatório no body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!ghlLocationId) {
      return new Response(JSON.stringify({ error: 'ghl_location_id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!validateLocationId(ghlLocationId)) {
      return new Response(JSON.stringify({ error: 'ghl_location_id parece inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 3. Verificar se o usuário é owner/admin do workspace
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
        JSON.stringify({ error: 'Apenas owner ou admin pode configurar a integração GHL' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    // 4. Upsert das credenciais (service role) — nunca armazena ghl_api_key
    const updatePayload: Record<string, unknown> = {
      workspace_id: workspaceId,
      ghl_location_id: ghlLocationId,
      updated_at: new Date().toISOString(),
    }

    if (webhookSecret !== null) {
      updatePayload.webhook_secret = webhookSecret
    }

    const { error: upsertError } = await supabaseAdmin
      .from('ghl_integration_settings')
      .upsert(updatePayload, { onConflict: 'workspace_id' })

    if (upsertError) {
      throw new Error(`Erro ao salvar credenciais: ${upsertError.message}`)
    }

    // 5. Retornar confirmação
    return new Response(
      JSON.stringify({
        success: true,
        workspace_id: workspaceId,
        ghl_location_id: ghlLocationId,
        webhook_secret_configured: webhookSecret !== null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    const requestId = createRequestId()
    logSafeError('setup-ghl-integration', requestId, err)
    return publicError('internal_error', requestId, 500, corsHeaders)
  }
})
