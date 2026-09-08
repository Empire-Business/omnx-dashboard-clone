// Edge Function: workspace-apps
// Lista os sub-apps disponíveis para o usuário no workspace atual.
// Endpoint: POST /workspace-apps
// O chamador deve enviar o JWT no header Authorization.
// Opcionalmente pode enviar x-workspace-id para selecionar um workspace específico.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'
import { corsHeaders } from '../_shared/cors.ts'
import { createRequestId, logSafeError, publicError } from '../_shared/safe-error.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SB_SERVICE_ROLE_KEY') || ''

interface AppCatalogItem {
  slug: string
  label: string
  icon: string
}

const APP_CATALOG: AppCatalogItem[] = [
  { slug: 'aquisicao-vendas', label: 'Aquisição & Vendas', icon: 'shopping-cart' },
  { slug: 'trafego', label: 'Tráfego', icon: 'trending-up' },
  { slug: 'traqueamento', label: 'Traqueamento', icon: 'radar' },
  { slug: 'pre-vendas', label: 'Pré-Vendas', icon: 'message-circle' },
  { slug: 'relatorios', label: 'Relatórios', icon: 'bar-chart-2' },
  { slug: 'sdr-ia', label: 'SDR IA', icon: 'bot' },
  { slug: 'metas', label: 'Metas', icon: 'target' },
  { slug: 'leads', label: 'Leads', icon: 'users' },
  { slug: 'criativos', label: 'Criativos', icon: 'palette' },
  { slug: 'disparos', label: 'Campanhas WhatsApp', icon: 'send' },
]

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

    // 2. Resolver workspace_id (obrigatorio)
    const requestedWorkspaceId = req.headers.get('x-workspace-id')?.trim()
    if (!requestedWorkspaceId) {
      return new Response(JSON.stringify({ error: 'Header x-workspace-id é obrigatório' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', requestedWorkspaceId)
      .eq('user_id', caller.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      throw new Error(`Erro ao verificar membership: ${membershipError.message}`)
    }

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Workspace não encontrado ou acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const workspaceId = requestedWorkspaceId

    // 3. Buscar role do usuário no workspace
    const { data: member, error: roleError } = await supabaseAdmin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', caller.id)
      .eq('is_active', true)
      .maybeSingle()

    if (roleError) {
      throw new Error(`Erro ao buscar role: ${roleError.message}`)
    }

    if (!member) {
      return new Response(JSON.stringify({ error: 'Membership não encontrado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const userRole = member.role
    const isAdminOrOwner = userRole === 'owner' || userRole === 'admin'

    // 4. Buscar apps ativos do workspace
    const { data: activeApps, error: appsError } = await supabaseAdmin
      .from('workspace_apps')
      .select('app_slug, is_active')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)

    if (appsError) {
      throw new Error(`Erro ao buscar workspace_apps: ${appsError.message}`)
    }

    const activeSlugs = new Set((activeApps ?? []).map((a) => a.app_slug))

    // 5. Buscar permissões de role (para non-admin)
    const rolePermissions = new Map<string, boolean>()
    if (!isAdminOrOwner) {
      const { data: perms, error: permsError } = await supabaseAdmin
        .from('app_role_permissions')
        .select('app_slug, can_view')
        .eq('workspace_id', workspaceId)
        .eq('role', userRole)

      if (permsError) {
        throw new Error(`Erro ao buscar app_role_permissions: ${permsError.message}`)
      }

      for (const p of perms ?? []) {
        rolePermissions.set(p.app_slug, p.can_view)
      }
    }

    // 6. Buscar overrides do usuário
    const { data: overrides, error: overridesError } = await supabaseAdmin
      .from('app_user_overrides')
      .select('app_slug, can_view')
      .eq('workspace_id', workspaceId)
      .eq('user_id', caller.id)

    if (overridesError) {
      throw new Error(`Erro ao buscar app_user_overrides: ${overridesError.message}`)
    }

    const userOverrides = new Map<string, boolean>()
    for (const o of overrides ?? []) {
      userOverrides.set(o.app_slug, o.can_view)
    }

    // 7. Montar resposta
    const apps = APP_CATALOG.map((app) => {
      const isActive = activeSlugs.has(app.slug)
      let allowed = false

      if (isActive) {
        if (isAdminOrOwner) {
          allowed = true
        } else {
          const override = userOverrides.get(app.slug)
          if (override !== undefined) {
            allowed = override
          } else {
            allowed = rolePermissions.get(app.slug) ?? false
          }
        }
      }

      return {
        slug: app.slug,
        label: app.label,
        icon: app.icon,
        is_active: isActive,
        allowed,
      }
    })

    return new Response(JSON.stringify({ apps }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const requestId = createRequestId()
    logSafeError('workspace-apps', requestId, err)
    return publicError('internal_error', requestId, 500, corsHeaders)
  }
})
